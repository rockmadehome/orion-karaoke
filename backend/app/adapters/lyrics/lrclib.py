import logging
import re
from typing import Optional

import httpx

from app.domain.ports.lyrics_provider import LrcLine, LyricsProvider, LyricsResult

logger = logging.getLogger(__name__)

_LRC_LINE_RE = re.compile(r"^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")


def _parse_lrc(lrc_text: str) -> list[LrcLine]:
    lines = []
    for raw in lrc_text.splitlines():
        m = _LRC_LINE_RE.match(raw.strip())
        if not m:
            continue
        minutes, seconds, centis, text = m.groups()
        # Normalise centiseconds/milliseconds to fractional seconds
        frac = int(centis.ljust(3, "0")[:3]) / 1000.0
        start = int(minutes) * 60 + int(seconds) + frac
        text = text.strip()
        if text:
            lines.append(LrcLine(start=start, text=text))
    return lines


class LrcLibProvider(LyricsProvider):
    _BASE_URL = "https://lrclib.net/api/get"

    async def fetch(self, title: str, artist: Optional[str]) -> LyricsResult:
        params: dict = {"track_name": title}
        if artist:
            params["artist_name"] = artist

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self._BASE_URL, params=params)

            if resp.status_code == 404:
                logger.info(f"LRCLib: no match for artist={artist!r} title={title!r}")
                return LyricsResult(found=False)

            resp.raise_for_status()
            data = resp.json()

        except httpx.HTTPError as exc:
            logger.warning(f"LRCLib request failed: {exc}")
            return LyricsResult(found=False)
        except Exception as exc:
            logger.warning(f"LRCLib unexpected error: {exc}")
            return LyricsResult(found=False)

        synced_raw: str = data.get("syncedLyrics") or ""
        plain: Optional[str] = data.get("plainLyrics") or None
        synced_lines = _parse_lrc(synced_raw) if synced_raw.strip() else []
        found = bool(synced_lines or plain)

        logger.info(
            f"LRCLib: found={found} synced_lines={len(synced_lines)} "
            f"for artist={artist!r} title={title!r}"
        )
        return LyricsResult(synced_lines=synced_lines, plain_text=plain, found=found)
