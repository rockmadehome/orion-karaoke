from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class RawMediaResult:
    video_path: Path
    audio_path: Path
    title: str
    artist: Optional[str]
    duration_seconds: Optional[int]
    thumbnail_path: Optional[Path]
    source_url: str


class VideoProvider(ABC):
    @abstractmethod
    async def download(self, url: str, output_dir: Path) -> RawMediaResult:
        """Download video and audio from URL into output_dir."""
        ...

    @abstractmethod
    def supports(self, url: str) -> bool:
        """Return True if this provider can handle the given URL."""
        ...
