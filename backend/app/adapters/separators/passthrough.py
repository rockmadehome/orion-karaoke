import shutil
from pathlib import Path

from app.domain.ports.stem_separator import StemResult, StemSeparator


class PassthroughSeparator(StemSeparator):
    """
    No-op separator: uses the original audio as both vocals and instrumental.
    Used as a fallback when spleeter is not installed, or as a fast dev mode.
    The resulting karaoke video will have the full mixed audio (no vocal removal).
    """

    @property
    def model_name(self) -> str:
        return "passthrough"

    @property
    def required_vram_gb(self) -> float:
        return 0.0

    async def separate(self, audio_path: Path, output_dir: Path) -> StemResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        vocals = output_dir / "vocals.wav"
        instrumental = output_dir / "instrumental.wav"
        shutil.copy2(audio_path, vocals)
        shutil.copy2(audio_path, instrumental)
        return StemResult(vocals_path=vocals, instrumental_path=instrumental)
