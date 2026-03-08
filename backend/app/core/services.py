"""
Service factory — the single place where adapter instances are created from config.
All other modules receive adapters via dependency injection, never instantiate them directly.
"""

from app.core.config import settings
from app.core.hardware import HardwareBackend, get_hardware_backend
from app.domain.ports.stem_separator import StemSeparator
from app.domain.ports.transcriber import Transcriber
from app.domain.ports.video_provider import VideoProvider

_hardware: HardwareBackend | None = None
_video_provider: VideoProvider | None = None
_stem_separator: StemSeparator | None = None
_transcriber: Transcriber | None = None


def get_hardware() -> HardwareBackend:
    global _hardware
    if _hardware is None:
        _hardware = get_hardware_backend(settings.HARDWARE_BACKEND)
    return _hardware


def get_video_provider() -> VideoProvider:
    global _video_provider
    if _video_provider is None:
        from app.adapters.providers.youtube import YouTubeProvider
        _video_provider = YouTubeProvider()
    return _video_provider


def get_stem_separator() -> StemSeparator:
    global _stem_separator
    if _stem_separator is None:
        hw = get_hardware()
        if settings.SEPARATOR_MODEL == "spleeter":
            try:
                from app.adapters.separators.spleeter import SpleeterSeparator
                _stem_separator = SpleeterSeparator(hardware=hw)
            except ImportError:
                import logging
                logging.getLogger(__name__).warning(
                    "spleeter not installed — falling back to passthrough separator"
                )
                from app.adapters.separators.passthrough import PassthroughSeparator
                _stem_separator = PassthroughSeparator()
        elif settings.SEPARATOR_MODEL == "audio_separator":
            from app.adapters.separators.audio_separator import AudioSeparatorAdapter
            _stem_separator = AudioSeparatorAdapter(hardware=hw)
        elif settings.SEPARATOR_MODEL == "passthrough":
            from app.adapters.separators.passthrough import PassthroughSeparator
            _stem_separator = PassthroughSeparator()
        else:
            raise ValueError(f"Unknown separator model: {settings.SEPARATOR_MODEL!r}")
    return _stem_separator


def get_transcriber() -> Transcriber:
    global _transcriber
    if _transcriber is None:
        hw = get_hardware()
        if settings.TRANSCRIBER_BACKEND == "faster_whisper":
            from app.adapters.transcribers.faster_whisper import FasterWhisperTranscriber
            _transcriber = FasterWhisperTranscriber(
                hardware=hw,
                model_size=settings.WHISPER_MODEL_SIZE,
            )
        elif settings.TRANSCRIBER_BACKEND == "whisper_cpp":
            from app.adapters.transcribers.whisper_cpp import WhisperCppTranscriber
            _transcriber = WhisperCppTranscriber()
        else:
            raise ValueError(f"Unknown transcriber backend: {settings.TRANSCRIBER_BACKEND!r}")
    return _transcriber
