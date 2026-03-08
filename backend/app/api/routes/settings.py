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
    hardware_backend: str
    auth_enabled: bool


class SettingsUpdate(BaseModel):
    separator_model: str | None = None
    transcriber_backend: str | None = None
    whisper_model_size: str | None = None


@router.get("", response_model=SettingsRead)
def get_settings():
    hardware = get_hardware()
    return SettingsRead(
        separator_model=settings.SEPARATOR_MODEL,
        transcriber_backend=settings.TRANSCRIBER_BACKEND,
        whisper_model_size=settings.WHISPER_MODEL_SIZE,
        hardware_backend=hardware.value,
        auth_enabled=settings.AUTH_ENABLED,
    )


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

    hardware = get_hardware()
    return SettingsRead(
        separator_model=settings.SEPARATOR_MODEL,
        transcriber_backend=settings.TRANSCRIBER_BACKEND,
        whisper_model_size=settings.WHISPER_MODEL_SIZE,
        hardware_backend=hardware.value,
        auth_enabled=settings.AUTH_ENABLED,
    )
