from pathlib import Path
from typing import Literal

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

    # Hardware (auto-detected if not overridden)
    HARDWARE_BACKEND: Literal["auto", "cuda", "rocm", "metal", "cpu"] = "auto"

    # Subtitle style
    SUBTITLE_FONT: str = "Arial"
    SUBTITLE_FONT_SIZE: int = 48
    SUBTITLE_ACTIVE_COLOR: str = "&H00FFAA00&"   # bright amber (ASS BGR format)
    SUBTITLE_INACTIVE_COLOR: str = "&H00CCCCCC&"  # light grey
    SUBTITLE_OUTLINE_COLOR: str = "&H00000000&"   # black
    SUBTITLE_MAX_LINE_CHARS: int = 40

    # Auth
    AUTH_ENABLED: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Server
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000


settings = Settings()
