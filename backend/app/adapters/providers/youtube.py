import asyncio
import logging
import shutil
import subprocess
from pathlib import Path

import yt_dlp

from app.domain.ports.video_provider import RawMediaResult, VideoProvider

logger = logging.getLogger(__name__)

_YOUTUBE_URL_PATTERNS = (
    "youtube.com/watch",
    "youtu.be/",
    "youtube.com/shorts/",
    "m.youtube.com/watch",
)

# Common absolute paths to check before falling back to PATH / imageio-ffmpeg
_FFMPEG_CANDIDATE_PATHS = [
    "/opt/homebrew/bin/ffmpeg",        # macOS Apple Silicon (Homebrew)
    "/usr/local/bin/ffmpeg",            # macOS Intel / Linux custom
    "/usr/bin/ffmpeg",                  # Linux system
    "/home/linuxbrew/.linuxbrew/bin/ffmpeg",  # Linuxbrew
]


def _get_ffmpeg_exe() -> str:
    """
    Return an ffmpeg executable path, checking common absolute locations first
    so we are not dependent on PATH being set correctly in the server process.
    Falls back to imageio-ffmpeg bundled binary.
    """
    for candidate in _FFMPEG_CANDIDATE_PATHS:
        if Path(candidate).exists():
            return candidate

    found = shutil.which("ffmpeg")
    if found:
        return found

    try:
        import imageio_ffmpeg  # type: ignore[import]
        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError):
        pass

    raise RuntimeError(
        "ffmpeg not found. Install it (brew install ffmpeg / apt install ffmpeg) "
        "or pip install imageio-ffmpeg."
    )


def _convert_to_wav(src: Path, dst: Path) -> None:
    """Convert any audio file to wav using our resolved ffmpeg binary."""
    ffmpeg_exe = _get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg_exe, "-y", "-i", str(src), str(dst)],
        check=True,
        capture_output=True,
    )


class YouTubeProvider(VideoProvider):
    def supports(self, url: str) -> bool:
        return any(pattern in url for pattern in _YOUTUBE_URL_PATTERNS)

    async def download(self, url: str, output_dir: Path) -> RawMediaResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        return await asyncio.get_event_loop().run_in_executor(
            None, self._download_sync, url, output_dir
        )

    def _download_sync(self, url: str, output_dir: Path) -> RawMediaResult:
        video_template = str(output_dir / "video.%(ext)s")
        audio_template = str(output_dir / "audio_raw.%(ext)s")

        # yt-dlp does NOT need ffmpeg/ffprobe here:
        # - bestvideo[ext=mp4] is a single stream, no merging needed
        # - bestaudio[ext=m4a] is downloaded raw, we convert ourselves below
        common_opts: dict = {"quiet": True, "no_warnings": True}

        # Download best video stream — prefer mp4, fall back to any video-only stream,
        # then fall back to best combined (we'll strip audio later via ffmpeg).
        video_opts = {
            **common_opts,
            "format": "bestvideo[ext=mp4]/bestvideo/best[ext=mp4]/best",
            "outtmpl": video_template,
        }
        with yt_dlp.YoutubeDL(video_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        title: str = info.get("title", "Unknown Title")
        artist: str | None = info.get("uploader") or info.get("artist")
        duration: int | None = info.get("duration")
        thumbnail_url: str | None = info.get("thumbnail")

        # Download best audio in native container (no postprocessor — no ffmpeg needed)
        audio_opts = {
            **common_opts,
            "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "outtmpl": audio_template,
        }
        with yt_dlp.YoutubeDL(audio_opts) as ydl:
            ydl.download([url])

        # Convert native audio to wav ourselves (we control the ffmpeg binary)
        raw_audio = self._find_file(output_dir, "audio_raw")
        audio_path = output_dir / "audio.wav"
        _convert_to_wav(raw_audio, audio_path)
        raw_audio.unlink(missing_ok=True)

        # Locate produced files
        video_path = self._find_file(output_dir, "video")

        # Download thumbnail if available
        thumbnail_path: Path | None = None
        if thumbnail_url:
            thumbnail_path = self._download_thumbnail(thumbnail_url, output_dir)

        logger.info(f"Downloaded: {title!r} — video={video_path} audio={audio_path}")
        return RawMediaResult(
            video_path=video_path,
            audio_path=audio_path,
            title=title,
            artist=artist,
            duration_seconds=duration,
            thumbnail_path=thumbnail_path,
            source_url=url,
        )

    def _find_file(self, directory: Path, stem: str) -> Path:
        video_exts = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".ts"}
        audio_exts = {".m4a", ".opus", ".ogg", ".aac", ".mp3", ".wav", ".webm"}
        allowed = video_exts | audio_exts
        for path in directory.iterdir():
            if path.stem == stem and path.suffix.lower() in allowed:
                return path
        raise FileNotFoundError(f"Could not find downloaded file with stem '{stem}' in {directory}")

    def _download_thumbnail(self, url: str, output_dir: Path) -> Path | None:
        import urllib.request
        dest = output_dir / "thumbnail.jpg"
        try:
            urllib.request.urlretrieve(url, dest)  # noqa: S310 — URL from yt-dlp info, not user input
            return dest
        except Exception as exc:
            logger.warning(f"Failed to download thumbnail: {exc}")
            return None
