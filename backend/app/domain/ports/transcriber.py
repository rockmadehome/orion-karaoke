from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class WordTimestamp:
    text: str
    start: float   # seconds
    end: float     # seconds


@dataclass
class TranscriptResult:
    language: str
    words: list[WordTimestamp] = field(default_factory=list)


class Transcriber(ABC):
    @abstractmethod
    async def transcribe(self, audio_path: Path) -> TranscriptResult:
        """Transcribe audio with word-level timestamps. Auto-detects language."""
        ...

    @property
    @abstractmethod
    def backend_name(self) -> str: ...
