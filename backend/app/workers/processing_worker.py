import logging
import traceback
from pathlib import Path

from app.core.database import SessionLocal
from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine
from app.repositories.upload_repository import UploadRepository
from app.services.settings_service import get_effective_provider_settings
from app.services.transcription_service import transcribe_audio
from app.utils.ffmpeg import extract_audio_to_mp3, normalize_audio, probe_duration_seconds
from app.utils.files import safe_unlink


logger = logging.getLogger("processing_worker")


def process_upload(
    upload_id: str,
    language: str | None,
    force_reprocess: bool = False,
    use_api: bool = True,
    whisper_model: str | None = None,
    transcription_provider: str | None = None,
) -> None:
    print(f"[worker] iniciando processamento upload={upload_id} use_api={use_api} whisper={whisper_model} provider={transcription_provider}", flush=True)
    db = SessionLocal()
    repository = UploadRepository(db)
    temp_artifacts: list[Path] = []
    try:
        upload = repository.get(upload_id)
        if not upload:
            print(f"[worker] upload {upload_id} nao encontrado", flush=True)
            return

        if upload.transcription_text and not force_reprocess:
            print(f"[worker] upload {upload_id} ja transcrito, ignorando", flush=True)
            return

        upload.error_message = None
        upload.status = ProcessingStatus.CONVERTING
        repository.save(upload)

        source_path = Path(upload.original_path)
        print(f"[worker] convertendo {source_path.name} ({upload.file_type})", flush=True)
        if upload.file_type == FileType.VIDEO:
            converted_path = extract_audio_to_mp3(source_path)
        else:
            converted_path = normalize_audio(source_path)
        temp_artifacts.append(converted_path)
        print(f"[worker] conversao concluida -> {converted_path.name}", flush=True)

        upload.converted_path = str(converted_path)
        upload.duration_seconds = probe_duration_seconds(converted_path)
        upload.status = ProcessingStatus.TRANSCRIBING
        repository.save(upload)

        print(f"[worker] iniciando transcricao (duracao={upload.duration_seconds}s)", flush=True)
        transcription = transcribe_audio(
            db,
            converted_path,
            language,
            use_api=use_api,
            whisper_model_override=whisper_model,
            transcription_provider_preference=transcription_provider,
        )
        print(f"[worker] transcricao OK engine={transcription.engine} chars={len(transcription.text)}", flush=True)

        upload.transcription_text = transcription.text
        upload.transcription_engine = transcription.engine
        upload.language_detected = transcription.language_detected
        upload.status = ProcessingStatus.COMPLETED
        repository.save(upload)

        config = get_effective_provider_settings(db)
        if bool(config.get("auto_cleanup_temp_files")):
            for artifact in temp_artifacts:
                safe_unlink(artifact)
            upload.converted_path = None
            repository.save(upload)
        print(f"[worker] upload {upload_id} COMPLETED", flush=True)
    except Exception as exc:
        tb = traceback.format_exc()
        print(f"[worker] ERRO no upload {upload_id}: {exc}\n{tb}", flush=True)
        logger.exception("Falha ao processar upload %s", upload_id)
        upload = repository.get(upload_id)
        if upload:
            upload.status = ProcessingStatus.ERROR
            upload.error_message = str(exc) or exc.__class__.__name__
            repository.save(upload)
    finally:
        db.close()
