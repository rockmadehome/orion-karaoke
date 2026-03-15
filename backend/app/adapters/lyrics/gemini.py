import json
import logging
from typing import Optional

import httpx

from app.domain.ports.transcriber import TranscriptResult, WordTimestamp

logger = logging.getLogger(__name__)

_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-3.1-flash-lite-preview:generateContent"
)

_PROMPT_TEMPLATE = """\
You are a phonetic lyrics correction assistant for karaoke software.

I have an automatic speech recognition (Whisper) transcript of a song performance, split into timed segments.
I also have the official studio lyrics of the song.

**Your task:** For each Whisper segment, find the official lyric text that SOUNDS like what was sung.
Match by PHONETIC similarity, NOT by word order or position in the song.

This is critical because:
- Whisper makes phonetic errors (e.g. "dejate kahe" → the singer said "Déjate caer")
- The performance may be a live version that skips, repeats, or reorders verses
- Official lyrics may have more lines than what was performed
- The same verse may repeat multiple times

**Rules:**
1. For each Whisper segment, find the lyric line/phrase that SOUNDS most like what Whisper heard.
2. Return the official lyric text for that match (correct spelling, accents, punctuation).
3. If a segment has no good phonetic match (e.g. instrumental, crowd noise, unique improvisation), return the Whisper text unchanged.
4. Do NOT assume positional order — a later segment might match an earlier lyric line.
5. Multiple segments may match the same lyric line (e.g. repeated chorus).
6. Return ONLY a valid JSON array of strings, one per input segment, same length as input.
7. No markdown fences, no explanation, just the raw JSON array.

Whisper segments (in order, 0-indexed):
{segments_json}

Official lyrics:
{lyrics_text}
"""


def _segment_words(words: list[WordTimestamp], gap_s: float = 0.8) -> list[list[WordTimestamp]]:
    if not words:
        return []
    segments: list[list[WordTimestamp]] = []
    current = [words[0]]
    for w in words[1:]:
        if w.start - current[-1].end > gap_s:
            segments.append(current)
            current = [w]
        else:
            current.append(w)
    segments.append(current)
    return segments


async def correct_with_gemini(
    transcript: TranscriptResult,
    plain_lyrics: str,
    api_key: str,
) -> TranscriptResult:
    segments = _segment_words(transcript.words)
    if not segments:
        return transcript

    segment_texts = [" ".join(w.text for w in seg) for seg in segments]

    prompt = _PROMPT_TEMPLATE.format(
        segments_json=json.dumps(segment_texts, ensure_ascii=False),
        lyrics_text=plain_lyrics.strip(),
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 4096},
    }

    try:
        logger.info(
            "Calling Gemini API (%s segments) for lyrics correction", len(segments)
        )
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _GEMINI_URL,
                params={"key": api_key},
                json=payload,
            )
        resp.raise_for_status()
        data = resp.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Strip markdown code fences if the model wraps the JSON
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        corrected_texts: list[str] = json.loads(raw_text)

    except (httpx.HTTPError, KeyError, json.JSONDecodeError, IndexError) as exc:
        logger.warning(f"Gemini lyrics correction failed: {exc}")
        return transcript

    if len(corrected_texts) != len(segments):
        logger.warning(
            f"Gemini returned {len(corrected_texts)} segments, expected {len(segments)} — skipping"
        )
        return transcript

    corrected_words: list[WordTimestamp] = []
    original_seg_texts = [" ".join(w.text for w in seg) for seg in segments]

    for seg_words, corrected_text, original_text in zip(segments, corrected_texts, original_seg_texts):
        # Use corrected text only if Gemini changed something meaningful.
        # If it returned the same as Whisper or empty, keep original words intact.
        use_text = corrected_text.strip()
        if not use_text or use_text == original_text:
            corrected_words.extend(seg_words)
            continue

        lyric_words = use_text.split()
        span_start = seg_words[0].start
        span_end = seg_words[-1].end
        total = max(span_end - span_start, 0.05)
        step = total / len(lyric_words)
        corrected_words.extend([
            WordTimestamp(
                text=w,
                start=span_start + i * step,
                end=span_start + (i + 1) * step,
            )
            for i, w in enumerate(lyric_words)
        ])

    logger.info(
        f"Gemini: corrected {len(transcript.words)} Whisper words → {len(corrected_words)} words "
        f"across {len(segments)} segments (phonetic matching)"
    )
    return TranscriptResult(language=transcript.language, words=corrected_words)
