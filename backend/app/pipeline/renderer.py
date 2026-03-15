import logging
import re
import shutil
import subprocess
from pathlib import Path

import ffmpeg

from app.core.config import settings
from app.domain.ports.transcriber import TranscriptResult, WordTimestamp

logger = logging.getLogger(__name__)

_FFMPEG_EXE: str | None = None


def _get_ffmpeg_exe() -> str:
    """
    Return an ffmpeg executable that has the 'ass' subtitle filter.
    Falls back to the imageio-ffmpeg bundled static binary (pre-built with libass)
    when the system ffmpeg lacks --enable-libass (e.g. Homebrew bottles on macOS).
    """
    global _FFMPEG_EXE
    if _FFMPEG_EXE is not None:
        return _FFMPEG_EXE

    # Check common absolute paths first — independent of PATH in the server process
    candidates = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/home/linuxbrew/.linuxbrew/bin/ffmpeg",
    ]
    for candidate in candidates:
        p = Path(candidate)
        if p.exists():
            try:
                result = subprocess.run(
                    [candidate, "-filters"], capture_output=True, text=True, timeout=15
                )
                if re.search(r"\bass\b", result.stdout + result.stderr):
                    _FFMPEG_EXE = candidate
                    return _FFMPEG_EXE
            except (subprocess.TimeoutExpired, OSError):
                continue

    system = shutil.which("ffmpeg") or "ffmpeg"
    try:
        result = subprocess.run(
            [system, "-filters"], capture_output=True, text=True, timeout=15
        )
        if re.search(r"\bass\b", result.stdout + result.stderr):
            _FFMPEG_EXE = system
            return _FFMPEG_EXE
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

    try:
        import imageio_ffmpeg  # type: ignore[import]

        _FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
        logger.info(
            "System ffmpeg lacks libass — using imageio-ffmpeg bundled binary: %s",
            _FFMPEG_EXE,
        )
        return _FFMPEG_EXE
    except ImportError:
        raise RuntimeError(
            "System ffmpeg is missing the 'ass' subtitle filter (needs --enable-libass). "
            "Fix: pip install imageio-ffmpeg"
        )

# ASS colour format is &HAABBGGRR& (alpha, blue, green, red)
_STYLE_TEMPLATE = (
    "Style: Karaoke,"
    "{font},{size},"
    "{primary_color},{secondary_color},{outline_color},&H00000000&,"  # PrimaryColour,SecondaryColour,OutlineColour,BackColour
    "0,0,0,0,"           # bold, italic, underline, strikeout
    "100,100,"           # scale X, Y
    "0,"                 # spacing
    "0,"                 # angle
    "1,2,"               # border style, outline width (px) — 2px for readability
    "1,"                 # shadow depth
    "2,"                 # alignment (2 = bottom-center)
    "10,10,40,"          # margin L, R, V
    "1"                  # encoding
)

_ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _seconds_to_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


# These are now read from settings at call time (see _build_cues).
# Kept as module-level fallbacks only for unit tests that bypass settings.
_PAUSE_CUE_BREAK_S = 0.5
_POST_HOLD_S = 1.5
_ANTICIPATION_THRESHOLD_S = 6.0
_ANTICIPATION_S = 2.0


def _build_cue_text(group: list[list[WordTimestamp]], cue_start: float) -> str:
    """
    Build ASS karaoke text for a cue group.
    Inserts silent \\kf gap-tags between words so the sweep timing matches the
    actual audio — no word pre-highlights during pauses between sung syllables.
    The cursor tracks time from cue_start through all lines.
    """
    lines_text: list[str] = []
    cursor = cue_start

    for line in group:
        parts: list[str] = []
        for word in line:
            gap_cs = round((word.start - cursor) * 100)
            if gap_cs > 5:  # >50 ms gap — silent hold, nothing highlighted
                parts.append(f"{{\\kf{gap_cs}}}")
            word_cs = max(1, round((word.end - word.start) * 100))
            parts.append(f"{{\\kf{word_cs}}}{word.text} ")
            cursor = word.end
        lines_text.append("".join(parts).rstrip())

    return r"\N".join(lines_text)


def _wrap_words(words: list[WordTimestamp], max_chars: int) -> list[list[WordTimestamp]]:
    """Group words into lines respecting max_chars and force_break boundaries."""
    lines: list[list[WordTimestamp]] = []
    current_line: list[WordTimestamp] = []
    current_len = 0

    for word in words:
        word_len = len(word.text) + 1  # +1 for space
        # Hard break: LRC phrase boundary or line too long
        if current_line and (word.force_break or current_len + word_len > max_chars):
            lines.append(current_line)
            current_line = [word]
            current_len = word_len
        else:
            current_line.append(word)
            current_len += word_len

    if current_line:
        lines.append(current_line)

    return lines


def _build_cues(words: list[WordTimestamp], max_chars: int) -> list[tuple[float, float, str]]:
    """
    Build ASS dialogue cue entries from a flat list of words.

    Pause behaviour:
    - Lines separated by >= settings.SUBTITLE_PAUSE_CUE_BREAK_S become independent cues.
    - Each cue disappears at most settings.SUBTITLE_POST_HOLD_S after its last word.
    - If the gap before a cue is >= settings.SUBTITLE_ANTICIPATION_THRESHOLD_S, the cue
      appears settings.SUBTITLE_ANTICIPATION_S seconds early (greyed-out pre-read).
      The silent gap is filled with silent \\kf tags in _build_cue_text.
    """
    pause_break = settings.SUBTITLE_PAUSE_CUE_BREAK_S
    post_hold = settings.SUBTITLE_POST_HOLD_S
    anticipation_threshold = settings.SUBTITLE_ANTICIPATION_THRESHOLD_S
    anticipation_s = settings.SUBTITLE_ANTICIPATION_S

    lines = _wrap_words(words, max_chars)
    cues: list[tuple[float, float, str]] = []
    prev_last_word_end: float = 0.0
    i = 0

    while i < len(lines):
        group = [lines[i]]
        i += 1

        # Attempt to add a second line — only when the gap is small AND no hard phrase break
        if i < len(lines):
            gap = lines[i][0].start - group[-1][-1].end
            next_line_is_forced = lines[i][0].force_break
            if gap < pause_break and not next_line_is_forced:
                group.append(lines[i])
                i += 1

        first_word_start = group[0][0].start
        last_word_end = group[-1][-1].end

        # --- cue start: anticipation if there's a long gap from previous content ---
        gap_from_prev = first_word_start - prev_last_word_end
        if cues and gap_from_prev >= anticipation_threshold:
            # Show cue early but never before the previous cue ends
            cue_start = max(cues[-1][1] + 0.05, first_word_start - anticipation_s)
        else:
            cue_start = first_word_start

        # --- cue end: disappear soon after last word, don't linger into solos ---
        cue_end = last_word_end + post_hold

        # Cap against next cue's start (accounting for its potential early start)
        if i < len(lines):
            next_first_word_start = lines[i][0].start
            gap_to_next = next_first_word_start - last_word_end
            if gap_to_next >= anticipation_threshold:
                next_cue_start = next_first_word_start - anticipation_s
            else:
                next_cue_start = next_first_word_start
            cue_end = min(cue_end, next_cue_start - 0.1)

        cue_text = _build_cue_text(group, cue_start)
        cues.append((cue_start, cue_end, cue_text))
        prev_last_word_end = last_word_end

    return cues


class Renderer:
    def build_ass_file(self, transcript: TranscriptResult, output_path: Path) -> Path:
        """Generate an ASS subtitle file from a TranscriptResult."""
        if not transcript.words:
            raise ValueError("Transcript contains no words — cannot build ASS file.")

        style_line = _STYLE_TEMPLATE.format(
            font=settings.SUBTITLE_FONT,
            size=settings.SUBTITLE_FONT_SIZE,
            # PrimaryColour = already-highlighted / sung text
            # SecondaryColour = not-yet-sung text (shown before the \kf sweep reaches it)
            primary_color=settings.SUBTITLE_ACTIVE_COLOR,
            secondary_color=settings.SUBTITLE_INACTIVE_COLOR,
            outline_color=settings.SUBTITLE_OUTLINE_COLOR,
        )

        header = _ASS_HEADER.format(style=style_line)
        cues = _build_cues(transcript.words, settings.SUBTITLE_MAX_LINE_CHARS)

        dialogue_lines = []
        for start, end, text in cues:
            start_str = _seconds_to_ass_time(start)
            end_str = _seconds_to_ass_time(end)
            dialogue_lines.append(
                f"Dialogue: 0,{start_str},{end_str},Karaoke,,0,0,0,,{text}"
            )

        output_path.write_text(header + "\n".join(dialogue_lines) + "\n", encoding="utf-8")
        logger.info(f"ASS file written: {output_path} ({len(cues)} cues)")
        return output_path

    def burn_subtitles(
        self,
        video_path: Path,
        instrumental_audio_path: Path,
        ass_path: Path,
        output_path: Path,
    ) -> Path:
        """Burn ASS subtitles into video and mux with instrumental audio."""
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # ffmpeg 7+/8+ requires explicit filename= option for the ass filter;
        # positional path syntax was removed. Use absolute path and escape
        # characters that are special in AVFilter option strings.
        ass_abs = str(ass_path.resolve())
        ass_escaped = ass_abs.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")

        ffmpeg_exe = _get_ffmpeg_exe()

        try:
            (
                ffmpeg
                .input(str(video_path))
                .video
                .filter("ass", filename=ass_escaped)
                .output(
                    ffmpeg.input(str(instrumental_audio_path)).audio,
                    str(output_path),
                    vcodec="libx264",
                    acodec="aac",
                    audio_bitrate="192k",
                    crf=18,
                    preset="fast",
                )
                .overwrite_output()
                .run(quiet=True, cmd=ffmpeg_exe)
            )
        except ffmpeg.Error as exc:
            stderr = exc.stderr.decode() if exc.stderr else "(no stderr)"
            raise RuntimeError(f"ffmpeg failed during subtitle burn: {stderr}") from exc

        logger.info(f"Video rendered: {output_path}")
        return output_path
