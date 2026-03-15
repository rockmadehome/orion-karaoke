from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LrcLine:
    """A single line from a synced LRC file with its timestamp in seconds."""
    start: float  # seconds
    text: str


@dataclass
class LrcWord:
    """A single word with word-level timestamp from an Enhanced LRC file."""
    text: str
    start: float  # seconds
    end: float    # seconds


@dataclass
class LyricsResult:
    synced_lines: list[LrcLine] = field(default_factory=list)
    plain_text: Optional[str] = None
    found: bool = False
    # Populated when Enhanced LRC (word-level timestamps) is available
    enhanced_words: list[LrcWord] = field(default_factory=list)


class LyricsProvider(ABC):
    @abstractmethod
    async def fetch(self, title: str, artist: Optional[str]) -> LyricsResult:
        """Fetch lyrics for a track. Returns LyricsResult with synced lines if available."""
        ...
