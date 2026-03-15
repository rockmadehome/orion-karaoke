import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ShazamResult:
    title: str
    artist: str


async def identify_song(audio_path: Path) -> Optional[ShazamResult]:
    """
    Use Shazam audio fingerprinting to identify the song.
    Returns None if the song cannot be identified or on any error.
    Uses the first ~15 seconds of audio for the fingerprint.
    """
    try:
        from shazamio import Shazam  # type: ignore[import]
    except ImportError:
        logger.warning("shazamio not installed — skipping Shazam identification")
        return None

    try:
        shazam = Shazam()
        out = await shazam.recognize(str(audio_path))

        track = out.get("track")
        if not track:
            logger.info("Shazam: no match for %s", audio_path.name)
            return None

        title: str = track.get("title", "").strip()
        artist: str = track.get("subtitle", "").strip()  # Shazam uses 'subtitle' for artist

        if not title:
            return None

        logger.info("Shazam identified: artist=%r title=%r", artist, title)
        return ShazamResult(title=title, artist=artist)

    except Exception as exc:
        logger.warning("Shazam identification failed: %s", exc)
        return None
