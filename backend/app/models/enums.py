from enum import Enum


class FileType(str, Enum):
    AUDIO = "audio"
    VIDEO = "video"


class ProcessingStatus(str, Enum):
    RECORDING = "recording"
    UPLOADED = "uploaded"
    CONVERTING = "converting"
    TRANSCRIBING = "transcribing"
    GENERATING_REPORT = "generating_report"
    COMPLETED = "completed"
    ERROR = "error"


class TranscriptionEngine(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    CLAUDE = "claude"
    WHISPER = "whisper"
    NONE = "none"


class ReportFormat(str, Enum):
    MARKDOWN = "markdown"
    TEXT = "text"


class CaptureTrigger(str, Enum):
    MANUAL = "manual"
    HOTKEY = "hotkey"
    INTERVAL = "interval"
    SCENE_CHANGE = "scene_change"
    OS_SCREENSHOT = "os_screenshot"
    PASTE = "paste"
