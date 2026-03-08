import asyncio
import logging
from pathlib import Path

from app.core.hardware import HardwareBackend
from app.domain.ports.stem_separator import StemResult, StemSeparator

logger = logging.getLogger(__name__)


class SpleeterSeparator(StemSeparator):
    def __init__(self, hardware: HardwareBackend) -> None:
        self._hardware = hardware
        self._separator = None  # lazy-loaded

    @property
    def model_name(self) -> str:
        return "spleeter:2stems"

    @property
    def required_vram_gb(self) -> float:
        return 1.0

    async def separate(self, audio_path: Path, output_dir: Path) -> StemResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        return await asyncio.get_event_loop().run_in_executor(
            None, self._separate_sync, audio_path, output_dir
        )

    def _separate_sync(self, audio_path: Path, output_dir: Path) -> StemResult:
        from spleeter.separator import Separator

        if self._separator is None:
            self._separator = Separator("spleeter:2stems")
            logger.info(f"Spleeter loaded (hardware: {self._hardware.value})")

        stem_dir = output_dir / audio_path.stem
        self._separator.separate_to_file(str(audio_path), str(output_dir))

        vocals_path = stem_dir / "vocals.wav"
        instrumental_path = stem_dir / "accompaniment.wav"

        if not vocals_path.exists():
            raise FileNotFoundError(f"Spleeter did not produce vocals at {vocals_path}")
        if not instrumental_path.exists():
            raise FileNotFoundError(f"Spleeter did not produce accompaniment at {instrumental_path}")

        logger.info(f"Spleeter separation complete: vocals={vocals_path}")
        return StemResult(vocals_path=vocals_path, instrumental_path=instrumental_path)
