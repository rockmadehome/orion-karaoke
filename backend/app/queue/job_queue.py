import logging
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.domain.models.job import ProcessingJob

logger = logging.getLogger(__name__)


def enqueue(url: str, session: Session) -> ProcessingJob:
    job = ProcessingJob(id=str(uuid.uuid4()), url=url)
    session.add(job)
    session.commit()
    session.refresh(job)
    logger.info(f"Job enqueued: {job.id} — {url!r}")
    return job


def get_next_pending(session: Session) -> Optional[ProcessingJob]:
    statement = (
        select(ProcessingJob)
        .where(ProcessingJob.status == "pending")
        .order_by(ProcessingJob.created_at)
        .limit(1)
    )
    return session.exec(statement).first()


def update_status(
    job_id: str,
    session: Session,
    status: str,
    stage: Optional[str] = None,
    progress: int = 0,
    error_message: Optional[str] = None,
    song_id: Optional[str] = None,
) -> None:
    job = session.get(ProcessingJob, job_id)
    if job is None:
        logger.warning(f"update_status called for unknown job_id={job_id}")
        return

    job.status = status
    if stage is not None:
        job.stage = stage
    job.progress = progress
    if error_message is not None:
        job.error_message = error_message
    if song_id is not None:
        job.song_id = song_id
    job.updated_at = datetime.utcnow()

    session.add(job)
    session.commit()


def reset_stale_jobs(session: Session) -> int:
    """Reset jobs stuck in 'processing' state back to 'pending' (server restart recovery)."""
    statement = select(ProcessingJob).where(ProcessingJob.status == "processing")
    stale = session.exec(statement).all()
    for job in stale:
        job.status = "pending"
        job.stage = None
        job.progress = 0
        job.updated_at = datetime.utcnow()
        session.add(job)
    if stale:
        session.commit()
        logger.info(f"Reset {len(stale)} stale processing job(s) to pending")
    return len(stale)


def list_jobs(session: Session) -> list[ProcessingJob]:
    return list(session.exec(select(ProcessingJob).order_by(ProcessingJob.created_at.desc())).all())


def get_job(job_id: str, session: Session) -> Optional[ProcessingJob]:
    return session.get(ProcessingJob, job_id)


def cancel_job(job_id: str, session: Session) -> bool:
    """Cancel a pending job. Returns True if cancelled, False if job cannot be cancelled."""
    job = session.get(ProcessingJob, job_id)
    if job is None or job.status != "pending":
        return False
    job.status = "failed"
    job.error_message = "Cancelled by user"
    job.updated_at = datetime.utcnow()
    session.add(job)
    session.commit()
    return True
