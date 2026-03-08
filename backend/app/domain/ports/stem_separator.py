from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StemResult:
    vocals_path: Path
    instrumental_path: Path


class StemSeparator(ABC):
    @abstractmethod
    async def separate(self, audio_path: Path, output_dir: Path) -> StemResult:
        """Separate vocals from instrumental track."""
        ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...

    @property
    @abstractmethod
    def required_vram_gb(self) -> float: ...
