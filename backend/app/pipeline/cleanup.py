import logging
import shutil
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


def delete_job_temp(job_id: str) -> None:
    """Delete all temporary files for a job. Always safe to call — no-op if directory absent."""
    temp_dir = settings.TEMP_PATH / job_id
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info(f"Cleaned temp dir: {temp_dir}")


def cleanup_orphaned_temp_dirs(active_job_ids: set[str]) -> None:
    """
    On startup, remove any temp directories that do not belong to an active job.
    These are leftovers from a killed process.
    """
    temp_root = settings.TEMP_PATH
    if not temp_root.exists():
        return

    for entry in temp_root.iterdir():
        if entry.is_dir() and entry.name not in active_job_ids:
            shutil.rmtree(entry, ignore_errors=True)
            logger.info(f"Removed orphaned temp dir: {entry}")
