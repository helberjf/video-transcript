import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings


def _resolve_binary(name: str) -> str:
    binary_dir = os.getenv("FFMPEG_BINARY_DIR")
    if not binary_dir:
        return name

    candidate = Path(binary_dir) / (f"{name}.exe" if os.name == "nt" else name)
    if candidate.exists():
        return str(candidate)

    return name


def run_subprocess(command: list[str], timeout: int = 300) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Falha ao executar ffmpeg/ffprobe")
    return result


def extract_audio_to_mp3(source_path: str | Path, bitrate: str = "320k") -> Path:
    settings = get_settings()
    output_path = settings.processed_dir / f"{uuid4()}.mp3"
    command = [
        _resolve_binary("ffmpeg"),
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-acodec",
        "libmp3lame",
        "-b:a",
        bitrate,
        "-ar",
        "44100",
        "-ac",
        "2",
        str(output_path),
    ]
    run_subprocess(command)
    return output_path


def normalize_audio(source_path: str | Path) -> Path:
    settings = get_settings()
    output_path = settings.temp_dir / f"normalized-{uuid4()}.mp3"
    command = [
        _resolve_binary("ffmpeg"),
        "-y",
        "-i",
        str(source_path),
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "320k",
        str(output_path),
    ]
    run_subprocess(command)
    return output_path


def probe_duration_seconds(source_path: str | Path) -> float | None:
    command = [
        _resolve_binary("ffprobe"),
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(source_path),
    ]
    result = run_subprocess(command, timeout=60)
    payload = json.loads(result.stdout or "{}")
    duration = payload.get("format", {}).get("duration")
    return float(duration) if duration else None
