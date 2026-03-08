import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Awaitable

from sqlmodel import Session

from app.core.config import settings
from app.core.services import get_stem_separator, get_transcriber, get_video_provider
from app.domain.models.song import Song
from app.pipeline.cleanup import delete_job_temp
from app.pipeline.renderer import Renderer

logger = logging.getLogger(__name__)

# Progress checkpoints per stage (cumulative %)
_STAGE_PROGRESS = {
    "downloading": 10,
    "separating": 40,
    "transcribing": 70,
    "rendering": 95,
    "finalizing": 100,
}


@dataclass
class ProcessingResult:
    song_id: str
    video_path: Path


async def run_pipeline(
    job_id: str,
    url: str,
    session: Session,
    progress_callback: Callable[[str, int], Awaitable[None]],
) -> ProcessingResult:
    """
    Orchestrate all pipeline stages for a single job.
    progress_callback(stage, percent) is called at each checkpoint.
    Cleanup of temp files always runs in the finally block.
    """
    temp_dir = settings.TEMP_PATH / job_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Stage 1: Download
        await progress_callback("downloading", 5)
        provider = get_video_provider()
        media = await provider.download(url, temp_dir)
        await progress_callback("downloading", _STAGE_PROGRESS["downloading"])

        # Stage 2: Stem separation
        await progress_callback("separating", 15)
        separator = get_stem_separator()
        stems = await separator.separate(media.audio_path, temp_dir)
        await progress_callback("separating", _STAGE_PROGRESS["separating"])

        # Stage 3: Transcription
        await progress_callback("transcribing", 45)
        transcriber = get_transcriber()
        transcript = await transcriber.transcribe(stems.vocals_path)
        await progress_callback("transcribing", _STAGE_PROGRESS["transcribing"])

        # Stage 4: Render
        await progress_callback("rendering", 72)
        renderer = Renderer()
        ass_path = temp_dir / "subtitles.ass"
        renderer.build_ass_file(transcript, ass_path)

        output_filename = f"{job_id}.mp4"
        output_path = temp_dir / output_filename
        renderer.burn_subtitles(
            video_path=media.video_path,
            instrumental_audio_path=stems.instrumental_path,
            ass_path=ass_path,
            output_path=output_path,
        )
        await progress_callback("rendering", _STAGE_PROGRESS["rendering"])

        # Stage 5: Finalize — move to storage before cleanup
        await progress_callback("finalizing", 97)
        settings.STORAGE_PATH.mkdir(parents=True, exist_ok=True)
        final_video_path = settings.STORAGE_PATH / output_filename
        shutil.move(str(output_path), str(final_video_path))

        # Copy thumbnail to storage if present
        thumbnail_storage_path: Path | None = None
        if media.thumbnail_path and media.thumbnail_path.exists():
            thumbnail_dest = settings.STORAGE_PATH / f"{job_id}_thumb.jpg"
            shutil.copy2(str(media.thumbnail_path), str(thumbnail_dest))
            thumbnail_storage_path = thumbnail_dest

        # Persist song record
        song = Song(
            id=str(uuid.uuid4()),
            title=media.title,
            artist=media.artist,
            duration_seconds=media.duration_seconds,
            language=transcript.language,
            video_path=output_filename,
            thumbnail_path=f"{job_id}_thumb.jpg" if thumbnail_storage_path else None,
            source_url=url,
            source_provider="youtube",
        )
        session.add(song)
        session.commit()
        session.refresh(song)

        await progress_callback("finalizing", _STAGE_PROGRESS["finalizing"])
        logger.info(f"Pipeline complete for job {job_id}: song_id={song.id}")
        return ProcessingResult(song_id=song.id, video_path=final_video_path)

    finally:
        delete_job_temp(job_id)
