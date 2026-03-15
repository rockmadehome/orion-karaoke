import asyncio
import logging
from pathlib import Path

from app.core.config import settings
from app.core.hardware import HardwareBackend
from app.domain.ports.transcriber import TranscriptResult, Transcriber, WordTimestamp

logger = logging.getLogger(__name__)

_HARDWARE_TO_DEVICE = {
    HardwareBackend.CUDA: "cuda",
    HardwareBackend.ROCM: "cuda",   # ROCm torch reports as cuda device
    HardwareBackend.METAL: "cpu",   # faster-whisper does not support Metal; use CPU
    HardwareBackend.CPU: "cpu",
}

_HARDWARE_TO_COMPUTE_TYPE = {
    HardwareBackend.CUDA: "float16",
    HardwareBackend.ROCM: "float16",
    HardwareBackend.METAL: "int8",
    HardwareBackend.CPU: "int8",
}


class FasterWhisperTranscriber(Transcriber):
    def __init__(self, hardware: HardwareBackend, model_size: str = "base") -> None:
        self._hardware = hardware
        self._model_size = model_size
        self._model = None  # lazy-loaded

    @property
    def backend_name(self) -> str:
        return "faster_whisper"

    async def transcribe(self, audio_path: Path, initial_prompt: str | None = None) -> TranscriptResult:
        return await asyncio.get_event_loop().run_in_executor(
            None, self._transcribe_sync, audio_path, initial_prompt
        )

    def _transcribe_sync(self, audio_path: Path, initial_prompt: str | None = None) -> TranscriptResult:
        from faster_whisper import WhisperModel

        if self._model is None:
            device = _HARDWARE_TO_DEVICE[self._hardware]
            compute_type = _HARDWARE_TO_COMPUTE_TYPE[self._hardware]
            logger.info(
                f"Loading faster-whisper model '{self._model_size}' "
                f"on {device} ({compute_type})"
            )
            self._model = WhisperModel(self._model_size, device=device, compute_type=compute_type)

        language_hint = settings.WHISPER_LANGUAGE.strip() or None

        logger.info(
            "Transcribing %s (language=%s) ...",
            audio_path.name,
            language_hint or "auto-detect",
        )
        segments, info = self._model.transcribe(
            str(audio_path),
            word_timestamps=True,
            language=language_hint,
            task="transcribe",
            beam_size=5,
            # VAD: only skip truly silent gaps (>= 2 s). Shorter pauses in singing
            # (breath, instrumental fill) should NOT be cut — Whisper can hallucinate
            # or drop those segments entirely when gaps are too small.
            vad_filter=True,
            vad_parameters={
                "min_silence_duration_ms": 2000,
                "speech_pad_ms": 400,
            },
            # Very permissive: almost never mark a segment as non-speech.
            # Music segments with low SNR still contain lyrics Whisper can read.
            log_prob_threshold=-2.0,
            no_speech_threshold=0.95,
            # condition_on_previous_text helps Whisper chain context across segments
            # to avoid hallucinated repetitions on tricky passages.
            condition_on_previous_text=True,
            **({"initial_prompt": initial_prompt} if initial_prompt else {}),
        )
        logger.info(
            "Language: %s (probability=%.2f)",
            info.language,
            info.language_probability,
        )

        language = info.language
        words: list[WordTimestamp] = []

        for segment in segments:
            if segment.words is None:
                continue
            for word in segment.words:
                words.append(WordTimestamp(
                    text=word.word.strip(),
                    start=word.start,
                    end=word.end,
                ))

        logger.info(f"Transcription complete: language={language}, words={len(words)}")
        return TranscriptResult(language=language, words=words)
