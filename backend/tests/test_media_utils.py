import io
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.datastructures import Headers, UploadFile

from app.models.enums import FileType
from app.utils import ffmpeg
from app.utils.files import detect_media_type, validate_upload


def test_detect_media_type_supports_audio_and_video() -> None:
    assert detect_media_type("movie.mp4") == FileType.VIDEO
    assert detect_media_type("audio.mp3") == FileType.AUDIO


def test_detect_media_type_rejects_invalid_extension() -> None:
    with pytest.raises(ValueError):
        detect_media_type("arquivo.exe")


def test_validate_upload_checks_mime_type() -> None:
    upload = UploadFile(filename="audio.mp3", file=io.BytesIO(b"data"), headers=Headers({"content-type": "audio/mpeg"}))
    assert validate_upload(upload) == FileType.AUDIO


def test_extract_audio_to_mp3_builds_expected_ffmpeg_command(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg, "get_settings", lambda: SimpleNamespace(processed_dir=tmp_path, temp_dir=tmp_path))

    def fake_run(command: list[str], timeout: int = 300) -> subprocess.CompletedProcess[str]:
        output = Path(command[-1])
        output.write_bytes(b"fake mp3")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(ffmpeg, "run_subprocess", fake_run)
    result = ffmpeg.extract_audio_to_mp3("sample.mp4")
    assert result.exists()
    assert result.suffix == ".mp3"
