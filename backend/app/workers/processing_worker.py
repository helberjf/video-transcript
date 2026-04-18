from pathlib import Path

from app.core.database import SessionLocal
from app.models.enums import FileType, ProcessingStatus, TranscriptionEngine
from app.repositories.upload_repository import UploadRepository
from app.services.settings_service import get_effective_provider_settings
from app.services.transcription_service import transcribe_audio
from app.utils.ffmpeg import extract_audio_to_mp3, normalize_audio, probe_duration_seconds
from app.utils.files import safe_unlink


def process_upload(
    upload_id: str,
    language: str | None,
    force_reprocess: bool = False,
    use_api: bool = True,
    whisper_model: str | None = None,
    transcription_provider: str | None = None,
) -> None:
    db = SessionLocal()
    repository = UploadRepository(db)
    temp_artifacts: list[Path] = []
    try:
        upload = repository.get(upload_id)
        if not upload:
            return

        if upload.transcription_text and not force_reprocess:
            return

        upload.error_message = None
        upload.status = ProcessingStatus.CONVERTING
        repository.save(upload)

        source_path = Path(upload.original_path)
        if upload.file_type == FileType.VIDEO:
            converted_path = extract_audio_to_mp3(source_path)
        else:
            converted_path = normalize_audio(source_path)
        temp_artifacts.append(converted_path)

        upload.converted_path = str(converted_path)
        upload.duration_seconds = probe_duration_seconds(converted_path)
        upload.status = ProcessingStatus.TRANSCRIBING
        repository.save(upload)

        transcription = transcribe_audio(
            db,
            converted_path,
            language,
            use_api=use_api,
            whisper_model_override=whisper_model,
            transcription_provider_preference=transcription_provider,
        )
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
    except Exception as exc:
        upload = repository.get(upload_id)
        if upload:
            upload.status = ProcessingStatus.ERROR
            upload.error_message = str(exc)
            if upload.transcription_engine == TranscriptionEngine.NONE:
                upload.transcription_engine = TranscriptionEngine.NONE
            repository.save(upload)
    finally:
        db.close()
