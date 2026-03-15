from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Storage
    STORAGE_PATH: Path = Path("./storage")
    TEMP_PATH: Path = Path("./temp")

    # Database
    DATABASE_URL: str = "sqlite:///./orion.db"

    # AI Models
    SEPARATOR_MODEL: Literal["spleeter", "audio_separator", "passthrough"] = "audio_separator"
    TRANSCRIBER_BACKEND: Literal["faster_whisper", "whisper_cpp"] = "faster_whisper"
    WHISPER_MODEL_SIZE: Literal["tiny", "base", "small", "medium", "large"] = "base"
    # Force transcription language (ISO 639-1, e.g. "es", "en", "fr").
    # Leave empty for auto-detection (less reliable with short or noisy audio).
    WHISPER_LANGUAGE: str = ""
    # Probability threshold above which a segment is considered non-speech and dropped.
    # Default in faster-whisper is 0.6. Lower = forces more segments to be transcribed
    # (more coverage, potentially more hallucinations on pure silence).
    WHISPER_NO_SPEECH_THRESHOLD: float = 0.3

    # Hardware (auto-detected if not overridden)
    HARDWARE_BACKEND: Literal["auto", "cuda", "rocm", "metal", "cpu"] = "auto"

    # Subtitle style
    SUBTITLE_FONT: str = "Arial"
    SUBTITLE_FONT_SIZE: int = 48
    SUBTITLE_ACTIVE_COLOR: str = "&H00FFAA00&"   # bright amber (ASS BGR format)
    SUBTITLE_INACTIVE_COLOR: str = "&H00CCCCCC&"  # light grey
    SUBTITLE_OUTLINE_COLOR: str = "&H00000000&"   # black
    SUBTITLE_MAX_LINE_CHARS: int = 40

    # Subtitle timing
    # Seconds a cue stays on screen after its last word
    SUBTITLE_POST_HOLD_S: float = 1.5
    # Minimum silence gap between consecutive lines to split them into separate cues
    SUBTITLE_PAUSE_CUE_BREAK_S: float = 0.5
    # Gap threshold (seconds) that triggers early display of the next cue
    SUBTITLE_ANTICIPATION_THRESHOLD_S: float = 6.0
    # How many seconds early to show the next cue when the threshold is exceeded
    SUBTITLE_ANTICIPATION_S: float = 2.0

    # Lyrics correction
    LRCLIB_ENABLED: bool = True
    # If LRCLib returns no match, use Shazam audio fingerprinting to identify
    # the song (artist + title) and retry LRCLib with the correct metadata.
    SHAZAM_ENABLED: bool = True
    # Stored as SecretStr — never logged or serialised accidentally.
    # Set via LYRICS_LLM_API_KEY env var or .env file.
    LYRICS_LLM_API_KEY: SecretStr = SecretStr("")

    # Auth
    AUTH_ENABLED: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Server
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000


settings = Settings()
