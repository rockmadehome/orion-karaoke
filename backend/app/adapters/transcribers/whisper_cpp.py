from pathlib import Path

from app.domain.ports.transcriber import TranscriptResult, Transcriber


class WhisperCppTranscriber(Transcriber):
    """
    Stub implementation of the whisper.cpp backend.
    Intended for CPU-only and Metal (macOS) deployments.
    Not yet implemented — will be available in a future release.
    """

    @property
    def backend_name(self) -> str:
        return "whisper_cpp"

    async def transcribe(self, audio_path: Path) -> TranscriptResult:
        raise NotImplementedError(
            "whisper.cpp transcriber is not yet implemented. "
            "Set TRANSCRIBER_BACKEND=faster_whisper in your .env to use the default backend. "
            "whisper.cpp support is planned for a future release."
        )
