import asyncio
import logging

from sqlmodel import Session

from app.core.database import engine
from app.pipeline.cleanup import cleanup_orphaned_temp_dirs
from app.pipeline.processor import run_pipeline
from app.queue.job_queue import get_next_pending, reset_stale_jobs, update_status

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 0.05  # 50ms


async def start_worker() -> None:
    """
    Background worker that processes jobs sequentially.
    Runs as an asyncio task within the FastAPI lifespan.
    """
    logger.info("Processing worker started")

    # Startup recovery
    with Session(engine) as session:
        reset_stale_jobs(session)
        _cleanup_orphaned_temp_on_startup(session)

    while True:
        await asyncio.sleep(_POLL_INTERVAL)
        try:
            await _process_next_job()
        except Exception as exc:
            logger.exception(f"Unexpected worker error: {exc}")


async def _process_next_job() -> None:
    from app.api.websocket import connection_manager

    with Session(engine) as session:
        job = get_next_pending(session)
        if job is None:
            return

        job_id = job.id
        url = job.url

    logger.info(f"Worker picked up job {job_id}")

    async def emit_progress(stage: str, percent: int) -> None:
        with Session(engine) as s:
            update_status(job_id, s, status="processing", stage=stage, progress=percent)
        await connection_manager.broadcast({
            "type": "job.progress",
            "job_id": job_id,
            "stage": stage,
            "percent": percent,
        })

    try:
        with Session(engine) as session:
            result = await run_pipeline(
                job_id=job_id,
                url=url,
                session=session,
                progress_callback=emit_progress,
            )

        with Session(engine) as session:
            update_status(
                job_id, session,
                status="completed",
                stage="finalizing",
                progress=100,
                song_id=result.song_id,
            )

        await connection_manager.broadcast({
            "type": "job.completed",
            "job_id": job_id,
            "song_id": result.song_id,
        })
        logger.info(f"Job {job_id} completed — song_id={result.song_id}")

    except Exception as exc:
        error_message = str(exc)
        logger.exception(f"Job {job_id} failed: {error_message}")

        with Session(engine) as session:
            update_status(job_id, session, status="failed", error_message=error_message)

        await connection_manager.broadcast({
            "type": "job.failed",
            "job_id": job_id,
            "error": error_message,
        })


def _cleanup_orphaned_temp_on_startup(session: Session) -> None:
    from app.queue.job_queue import list_jobs
    all_jobs = list_jobs(session)
    active_ids = {j.id for j in all_jobs if j.status in {"pending", "processing"}}
    cleanup_orphaned_temp_dirs(active_ids)
