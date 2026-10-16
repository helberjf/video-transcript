import json
import traceback
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core import file_store
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.enums import ProcessingStatus
from app.models.upload import Upload
from app.repositories.upload_repository import UploadRepository
from app.services.diarization_service import transcribe_with_speakers
from app.services.meeting_insights_service import generate_insights, mark_insights_error
from app.services.meeting_service import (
    apply_name_suggestions,
    build_meeting_text,
    build_speakers,
    describe_captures,
    mark_duplicate_captures,
    suggest_speaker_names,
)
from app.services.recording_service import read_energy, read_meta, recording_key
from app.services.usage_service import audio_video_credits, consume_credits
from app.utils.ffmpeg import probe_duration_seconds, transcode_for_transcription


DEFAULT_TITLE_PREFIX = "Reuniao gravada"


def _safe_title(value: str) -> str:
    cleaned = "".join(char for char in value if char not in '<>:"/\\|?*').strip()
    return cleaned[:140] or DEFAULT_TITLE_PREFIX


def process_meeting(upload_id: str) -> None:
    print(f"[reuniao] processando {upload_id}", flush=True)
    db = SessionLocal()
    repository = UploadRepository(db)
    try:
        upload = repository.get(upload_id)
        if not upload:
            return

        upload.error_message = None
        upload.status = ProcessingStatus.CONVERTING
        repository.save(upload)

        with file_store.local_copy(recording_key(upload.id), ".webm", db) as source:
            audio_path = _prepare_audio(source)
            try:
                _transcribe_and_analyze(db, repository, upload, audio_path)
            finally:
                if audio_path != source:
                    audio_path.unlink(missing_ok=True)
        print(f"[reuniao] {upload_id} COMPLETED", flush=True)
    except Exception as exc:
        print(f"[reuniao] ERRO {upload_id}: {exc}\n{traceback.format_exc()}", flush=True)
        db.rollback()
        upload = repository.get(upload_id)
        if upload:
            upload.status = ProcessingStatus.ERROR
            upload.error_message = str(exc) or exc.__class__.__name__
            repository.save(upload)
    finally:
        db.close()


def _prepare_audio(source: Path) -> Path:
    target = get_settings().temp_dir / f"meeting-{uuid4()}.ogg"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        return transcode_for_transcription(source, target)
    except Exception as exc:
        # Sem ffmpeg (Vercel) o webm/opus do navegador ainda e aceito pelos provedores.
        print(f"[reuniao] ffmpeg indisponivel, usando o webm original: {str(exc)[:200]}", flush=True)
        target.unlink(missing_ok=True)
        return source


def _transcribe_and_analyze(db: Session, repository: UploadRepository, upload: Upload, audio_path: Path) -> None:
    meta = read_meta(upload)
    try:
        upload.duration_seconds = probe_duration_seconds(audio_path) or upload.duration_seconds
    except Exception:
        pass
    consume_credits(
        db,
        upload.workspace_id,
        "media_processing_duration",
        audio_video_credits(upload.duration_seconds),
        idempotency_key=f"meeting:{upload.id}:duration",
        metadata={"upload_id": upload.id, "duration_seconds": upload.duration_seconds},
    )
    upload.status = ProcessingStatus.TRANSCRIBING
    repository.save(upload)

    result = transcribe_with_speakers(db, audio_path, meta.get("language"))
    print(f"[reuniao] transcricao OK engine={result.engine} trechos={len(result.segments)}", flush=True)
    segments, speakers = build_speakers(result.segments, read_energy(upload.id, db), result.has_speaker_labels)
    upload.transcript_segments = json.dumps(segments, ensure_ascii=False)
    upload.speakers = json.dumps(speakers, ensure_ascii=False)
    upload.transcription_engine = result.engine
    upload.language_detected = result.language_detected

    if result.has_speaker_labels and len(speakers) > 1:
        try:
            apply_name_suggestions(upload, suggest_speaker_names(db, upload))
        except Exception as exc:
            print(f"[reuniao] sugestao de nomes falhou: {str(exc)[:200]}", flush=True)

    captures = list(upload.captures)
    mark_duplicate_captures(captures)
    db.commit()
    if upload.analysis_mode == "audio_images" and captures:
        describe_captures(db, captures)

    upload.transcription_text = build_meeting_text(upload)
    upload.status = ProcessingStatus.GENERATING_REPORT
    repository.save(upload)

    # Resumo + checklist saem junto com a transcricao: o usuario nao precisa pedir.
    try:
        insights = generate_insights(db, upload)
        title = insights.get("titulo")
        if title and upload.original_filename.startswith(DEFAULT_TITLE_PREFIX):
            upload.original_filename = f"{_safe_title(title)}.webm"
    except Exception as exc:
        print(f"[reuniao] resumo/checklist falhou: {str(exc)[:300]}", flush=True)
        mark_insights_error(upload, f"Nao foi possivel gerar o resumo: {exc}")

    upload.status = ProcessingStatus.COMPLETED
    repository.save(upload)
