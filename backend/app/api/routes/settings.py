from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.core.config import settings
from app.core.database import get_session
from app.core.services import get_hardware

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsRead(BaseModel):
    separator_model: str
    transcriber_backend: str
    whisper_model_size: str
    whisper_language: str
    hardware_backend: str
    auth_enabled: bool
    # Subtitle style
    subtitle_active_color: str
    subtitle_inactive_color: str
    subtitle_font_size: int
    subtitle_max_line_chars: int
    # Subtitle timing
    subtitle_post_hold_s: float
    subtitle_pause_cue_break_s: float
    subtitle_anticipation_threshold_s: float
    subtitle_anticipation_s: float


class SettingsUpdate(BaseModel):
    separator_model: str | None = None
    transcriber_backend: str | None = None
    whisper_model_size: str | None = None
    whisper_language: str | None = None
    subtitle_active_color: str | None = None
    subtitle_inactive_color: str | None = None
    subtitle_font_size: int | None = None
    subtitle_max_line_chars: int | None = None
    subtitle_post_hold_s: float | None = None
    subtitle_pause_cue_break_s: float | None = None
    subtitle_anticipation_threshold_s: float | None = None
    subtitle_anticipation_s: float | None = None


def _settings_read() -> SettingsRead:
    hardware = get_hardware()
    return SettingsRead(
        separator_model=settings.SEPARATOR_MODEL,
        transcriber_backend=settings.TRANSCRIBER_BACKEND,
        whisper_model_size=settings.WHISPER_MODEL_SIZE,
        whisper_language=settings.WHISPER_LANGUAGE,
        hardware_backend=hardware.value,
        auth_enabled=settings.AUTH_ENABLED,
        subtitle_active_color=settings.SUBTITLE_ACTIVE_COLOR,
        subtitle_inactive_color=settings.SUBTITLE_INACTIVE_COLOR,
        subtitle_font_size=settings.SUBTITLE_FONT_SIZE,
        subtitle_max_line_chars=settings.SUBTITLE_MAX_LINE_CHARS,
        subtitle_post_hold_s=settings.SUBTITLE_POST_HOLD_S,
        subtitle_pause_cue_break_s=settings.SUBTITLE_PAUSE_CUE_BREAK_S,
        subtitle_anticipation_threshold_s=settings.SUBTITLE_ANTICIPATION_THRESHOLD_S,
        subtitle_anticipation_s=settings.SUBTITLE_ANTICIPATION_S,
    )


@router.get("", response_model=SettingsRead)
def get_settings():
    return _settings_read()


@router.put("", response_model=SettingsRead)
def update_settings(body: SettingsUpdate, session: Session = Depends(get_session)):
    # Settings changes are applied to the running config object.
    # They take effect on the next job. Persistent override requires .env restart.
    if body.separator_model is not None:
        settings.SEPARATOR_MODEL = body.separator_model  # type: ignore[assignment]
    if body.transcriber_backend is not None:
        settings.TRANSCRIBER_BACKEND = body.transcriber_backend  # type: ignore[assignment]
    if body.whisper_model_size is not None:
        settings.WHISPER_MODEL_SIZE = body.whisper_model_size  # type: ignore[assignment]
    if body.whisper_language is not None:
        settings.WHISPER_LANGUAGE = body.whisper_language  # type: ignore[assignment]
    if body.subtitle_active_color is not None:
        settings.SUBTITLE_ACTIVE_COLOR = body.subtitle_active_color  # type: ignore[assignment]
    if body.subtitle_inactive_color is not None:
        settings.SUBTITLE_INACTIVE_COLOR = body.subtitle_inactive_color  # type: ignore[assignment]
    if body.subtitle_font_size is not None:
        settings.SUBTITLE_FONT_SIZE = body.subtitle_font_size  # type: ignore[assignment]
    if body.subtitle_max_line_chars is not None:
        settings.SUBTITLE_MAX_LINE_CHARS = body.subtitle_max_line_chars  # type: ignore[assignment]
    if body.subtitle_post_hold_s is not None:
        settings.SUBTITLE_POST_HOLD_S = body.subtitle_post_hold_s  # type: ignore[assignment]
    if body.subtitle_pause_cue_break_s is not None:
        settings.SUBTITLE_PAUSE_CUE_BREAK_S = body.subtitle_pause_cue_break_s  # type: ignore[assignment]
    if body.subtitle_anticipation_threshold_s is not None:
        settings.SUBTITLE_ANTICIPATION_THRESHOLD_S = body.subtitle_anticipation_threshold_s  # type: ignore[assignment]
    if body.subtitle_anticipation_s is not None:
        settings.SUBTITLE_ANTICIPATION_S = body.subtitle_anticipation_s  # type: ignore[assignment]

    return _settings_read()
