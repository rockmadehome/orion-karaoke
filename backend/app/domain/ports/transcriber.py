from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class WordTimestamp:
    text: str
    start: float       # seconds
    end: float         # seconds
    force_break: bool = False  # True on the first word of a new LRC phrase


@dataclass
class TranscriptResult:
    language: str
    words: list[WordTimestamp] = field(default_factory=list)


class Transcriber(ABC):
    @abstractmethod
    async def transcribe(self, audio_path: Path, initial_prompt: str | None = None) -> TranscriptResult:
        """Transcribe audio with word-level timestamps. Auto-detects language.

        initial_prompt: optional text to bias the decoder vocabulary (e.g. song lyrics).
        """
        ...

    @property
    @abstractmethod
    def backend_name(self) -> str: ...
