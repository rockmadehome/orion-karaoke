import asyncio
import logging
import re
from typing import Optional

from app.domain.ports.lyrics_provider import LrcLine, LrcWord, LyricsProvider, LyricsResult

logger = logging.getLogger(__name__)

_LRC_LINE_RE = re.compile(r"^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
# Matches inline Enhanced LRC word timestamps: <mm:ss.xx> followed by text
_ENHANCED_TAG_RE = re.compile(r"<(\d{2}):(\d{2})\.(\d{2,3})>\s*([^<\n]*)")


def _ts_to_seconds(mins: str, secs: str, centis: str) -> float:
    frac = int(centis.ljust(3, "0")[:3]) / 1000.0
    return int(mins) * 60 + int(secs) + frac


def _parse_lrc(lrc_text: str) -> list[LrcLine]:
    lines = []
    for raw in lrc_text.splitlines():
        m = _LRC_LINE_RE.match(raw.strip())
        if not m:
            continue
        minutes, seconds, centis, text = m.groups()
        start = _ts_to_seconds(minutes, seconds, centis)
        text = text.strip()
        if text:
            lines.append(LrcLine(start=start, text=text))
    return lines


def _has_enhanced(lrc_text: str) -> bool:
    """True when the LRC contains inline <mm:ss.xx> word-level tags."""
    return bool(re.search(r"<\d{2}:\d{2}\.\d{2}", lrc_text))


def _parse_enhanced(lrc_text: str) -> list[LrcWord]:
    """
    Parse Enhanced LRC format with inline word timestamps.
    Each line looks like:
      [mm:ss.xx] <mm:ss.xx> word1 <mm:ss.xx> word2 ...
    Returns a flat list of LrcWord with start/end per word.
    """
    raw: list[tuple[float, str]] = []

    for line in lrc_text.splitlines():
        for m in _ENHANCED_TAG_RE.finditer(line):
            mins, secs, centis, text = m.groups()
            start = _ts_to_seconds(mins, secs, centis)
            for token in text.split():
                token = token.strip()
                if token:
                    raw.append((start, token))

    if not raw:
        return []

    words: list[LrcWord] = []
    for i, (start, text) in enumerate(raw):
        end = raw[i + 1][0] if i + 1 < len(raw) else start + 0.5
        words.append(LrcWord(text=text, start=start, end=end))
    return words


def _search_enhanced_sync(search_term: str) -> Optional[str]:
    import syncedlyrics
    return syncedlyrics.search(search_term, enhanced=True, synced_only=True)


def _search_sync(search_term: str) -> Optional[str]:
    import syncedlyrics
    return syncedlyrics.search(search_term, synced_only=False)


class SyncedLyricsProvider(LyricsProvider):
    """
    Lyrics provider backed by the syncedlyrics library.

    Priority:
    1. Enhanced LRC (word-level inline timestamps from Musixmatch) — best case.
    2. Standard synced LRC (line-level timestamps).
    3. Plain text only.
    Falls back to title-only search if artist+title returns nothing.
    """

    async def fetch(self, title: str, artist: Optional[str]) -> LyricsResult:
        loop = asyncio.get_event_loop()
        search_term = f"{artist} {title}" if artist else title

        # ── Priority 1: try enhanced word-level ──────────────────────────────
        lrc_enhanced = await loop.run_in_executor(None, _search_enhanced_sync, search_term)
        if not lrc_enhanced and artist:
            lrc_enhanced = await loop.run_in_executor(None, _search_enhanced_sync, title)

        if lrc_enhanced and _has_enhanced(lrc_enhanced):
            enhanced_words = _parse_enhanced(lrc_enhanced)
            if enhanced_words:
                synced_lines = _parse_lrc(lrc_enhanced)
                logger.info(
                    "syncedlyrics: enhanced word-level found (%d words, %d lines) "
                    "for artist=%r title=%r",
                    len(enhanced_words), len(synced_lines), artist, title,
                )
                return LyricsResult(
                    synced_lines=synced_lines,
                    plain_text=lrc_enhanced,
                    found=True,
                    enhanced_words=enhanced_words,
                )

        # ── Priority 2: standard synced LRC (line-level) ────────────────────
        # Re-use the enhanced search result if it came back without inline tags
        lrc_text = lrc_enhanced
        if not lrc_text:
            lrc_text = await loop.run_in_executor(None, _search_sync, search_term)
        if not lrc_text and artist:
            lrc_text = await loop.run_in_executor(None, _search_sync, title)

        if not lrc_text:
            logger.info("syncedlyrics: no match for artist=%r title=%r", artist, title)
            return LyricsResult(found=False)

        synced_lines = _parse_lrc(lrc_text)
        if synced_lines:
            logger.info(
                "syncedlyrics: %d synced lines for artist=%r title=%r",
                len(synced_lines), artist, title,
            )
            return LyricsResult(synced_lines=synced_lines, plain_text=lrc_text, found=True)

        # ── Priority 3: plain text only ──────────────────────────────────────
        logger.info(
            "syncedlyrics: plain lyrics only for artist=%r title=%r", artist, title
        )
        return LyricsResult(plain_text=lrc_text, found=True)
