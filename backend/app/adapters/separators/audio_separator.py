import asyncio
import logging
from pathlib import Path

from app.core.hardware import HardwareBackend
from app.domain.ports.stem_separator import StemResult, StemSeparator

logger = logging.getLogger(__name__)

# Default model — MDX-Net Kim Vocal 2 is fast on CPU and high quality
DEFAULT_MODEL = "Kim_Vocal_2.onnx"


class AudioSeparatorAdapter(StemSeparator):
    """
    Stem separator backed by the `audio-separator` package (MDX-Net / ONNX).
    Much faster on CPU than Demucs (~30-90s per song vs 10+ minutes).
    Install: pip install "audio-separator[cpu]"
    """

    def __init__(self, hardware: HardwareBackend, model_filename: str = DEFAULT_MODEL) -> None:
        self._hardware = hardware
        self._model_filename = model_filename

    @property
    def model_name(self) -> str:
        return f"audio-separator/{self._model_filename}"

    @property
    def required_vram_gb(self) -> float:
        return 0.0  # runs on CPU via ONNX

    async def separate(self, audio_path: Path, output_dir: Path) -> StemResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._separate_sync, audio_path, output_dir)

    def _separate_sync(self, audio_path: Path, output_dir: Path) -> StemResult:
        from audio_separator.separator import Separator  # deferred import

        output_dir.mkdir(parents=True, exist_ok=True)

        sep = Separator(
            output_dir=str(output_dir),
            output_format="WAV",
            log_level=logging.WARNING,
        )
        sep.load_model(model_filename=self._model_filename)

        logger.info("audio-separator: separating %s with %s", audio_path.name, self._model_filename)
        output_files = sep.separate(str(audio_path))

        # Output filenames contain "(Vocals)" or "(Instrumental)" in their name
        vocals_path: Path | None = None
        instrumental_path: Path | None = None

        for filename in output_files:
            p = Path(filename)
            if not p.is_absolute():
                p = output_dir / p
            name_upper = p.name.upper()
            if "(VOCALS)" in name_upper or "_VOCALS" in name_upper:
                vocals_path = p
            elif "(INSTRUMENTAL)" in name_upper or "_INSTRUMENTAL" in name_upper or "(NO VOCALS)" in name_upper:
                instrumental_path = p

        if vocals_path is None or instrumental_path is None:
            # Fallback: sort by filename — first is typically instrumental, second is vocals
            sorted_files = sorted(
                [Path(f) if Path(f).is_absolute() else output_dir / f for f in output_files]
            )
            if len(sorted_files) >= 2:
                instrumental_path = sorted_files[0]
                vocals_path = sorted_files[1]
            else:
                raise RuntimeError(
                    f"audio-separator returned unexpected output files: {output_files}"
                )

        logger.info("Separation complete — vocals: %s, instrumental: %s", vocals_path, instrumental_path)
        return StemResult(vocals_path=vocals_path, instrumental_path=instrumental_path)
