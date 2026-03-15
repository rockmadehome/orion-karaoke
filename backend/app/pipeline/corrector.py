import logging
from typing import Optional

from app.domain.ports.lyrics_provider import LyricsResult
from app.domain.ports.transcriber import TranscriptResult, WordTimestamp

logger = logging.getLogger(__name__)


async def apply_corrections(
    transcript: TranscriptResult,
    lyrics: LyricsResult,
    llm_api_key: str,
) -> TranscriptResult:
    """
    Entry point for all lyrics correction paths, in priority order:

    1. Enhanced LRC word-level timestamps  → use directly (best case)
    2. Synced LRC line-level timestamps    → scaled or proportional remapping
    3. Plain text + LLM API key            → Gemini phonetic alignment
    4. Nothing found                       → return original unchanged
    """
    if not lyrics.found:
        logger.info("Lyrics corrector: no lyrics found — keeping Whisper transcript")
        return transcript

    # ── Priority 1: word-level enhanced LRC ─────────────────────────────────
    if lyrics.enhanced_words:
        logger.info(
            "Lyrics corrector [PATH: enhanced word-level] "
            "— %d Musixmatch words replacing %d Whisper words",
            len(lyrics.enhanced_words), len(transcript.words),
        )
        words = [
            WordTimestamp(text=w.text, start=w.start, end=w.end)
            for w in lyrics.enhanced_words
        ]
        return TranscriptResult(language=transcript.language, words=words)

    # ── Priority 2: line-level synced LRC ────────────────────────────────────
    if lyrics.synced_lines:
        try:
            return _do_correct(transcript, lyrics)
        except Exception as exc:
            logger.warning(f"LRC remapping failed, keeping original Whisper: {exc}")
            return transcript

    # ── Priority 3: plain text + Gemini ─────────────────────────────────────
    if lyrics.plain_text and llm_api_key:
        logger.info(
            "Lyrics corrector [PATH: Gemini phonetic] "
            "— %d Whisper words, plain lyrics %d chars",
            len(transcript.words), len(lyrics.plain_text),
        )
        from app.adapters.lyrics.gemini import correct_with_gemini
        return await correct_with_gemini(transcript, lyrics.plain_text, llm_api_key)

    logger.info(
        "Lyrics corrector [PATH: none] — plain text found but no LLM API key; keeping Whisper"
    )
    return transcript


def _tokenize(text: str) -> list[str]:
    return [w for w in text.split() if w]


def _do_correct(transcript: TranscriptResult, lyrics: LyricsResult) -> TranscriptResult:
    """
    LRC-direct mapping.

    Each LRC line defines a time window [line.start, next_line.start].
    Words are distributed evenly within that window.

    This is intentionally simple: LRC timestamps are the ground-truth for phrase
    timing. We do not depend on Whisper word timestamps here, which are unreliable
    on sung audio (Whisper often covers only 30-50% of words in a song).

    For live versions the phrase timing may drift vs. the studio LRC, but the
    result is always readable — words never pile up.
    """
    lines = lyrics.synced_lines
    if not lines:
        return transcript

    n_lines = len(lines)
    # Estimate the last line's duration from the average of all previous gaps
    if n_lines > 1:
        avg_line_duration = (lines[-1].start - lines[0].start) / (n_lines - 1)
    else:
        avg_line_duration = 4.0
    avg_line_duration = max(avg_line_duration, 1.0)

    total_words = 0
    corrected: list[WordTimestamp] = []

    for i, lrc_line in enumerate(lines):
        lyric_words = _tokenize(lrc_line.text)
        if not lyric_words:
            continue

        line_start = lrc_line.start
        line_end = lines[i + 1].start if i + 1 < n_lines else lrc_line.start + avg_line_duration
        duration = max(line_end - line_start, 0.15)
        step = duration / len(lyric_words)

        for j, word in enumerate(lyric_words):
            corrected.append(WordTimestamp(
                text=word,
                start=line_start + j * step,
                end=line_start + (j + 1) * step,
                force_break=(j == 0 and i > 0),  # hard phrase break at each LRC line
            ))
        total_words += len(lyric_words)

    if not corrected:
        logger.info("Lyrics corrector: LRC-direct produced no words, keeping Whisper")
        return transcript

    logger.info(
        "Lyrics corrector [PATH: LRC-direct] — %d lines → %d words (Whisper had %d)",
        n_lines, total_words, len(transcript.words),
    )
    return TranscriptResult(language=transcript.language, words=corrected)
