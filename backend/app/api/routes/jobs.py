import re

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.websocket import connection_manager
from app.core.database import get_session
from app.domain.models.job import ProcessingJobCreate, ProcessingJobRead
from app.queue.job_queue import cancel_job, enqueue, get_job, list_jobs

router = APIRouter(prefix="/jobs", tags=["jobs"])

_YOUTUBE_RE = re.compile(
    r"(https?://)?(www\.)?(youtube\.com/watch\?.*v=|youtu\.be/|youtube\.com/shorts/)"
)


def _validate_youtube_url(url: str) -> None:
    if not _YOUTUBE_RE.search(url):
        raise HTTPException(status_code=422, detail="URL must be a valid YouTube video URL.")


@router.post("", response_model=ProcessingJobRead, status_code=201)
async def submit_job(body: ProcessingJobCreate, session: Session = Depends(get_session)):
    _validate_youtube_url(body.url)
    job = enqueue(body.url, session)
    return job


@router.get("", response_model=list[ProcessingJobRead])
def get_jobs(session: Session = Depends(get_session)):
    return list_jobs(session)


@router.get("/{job_id}", response_model=ProcessingJobRead)
def get_job_by_id(job_id: str, session: Session = Depends(get_session)):
    job = get_job(job_id, session)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str, session: Session = Depends(get_session)):
    cancelled = cancel_job(job_id, session)
    if not cancelled:
        raise HTTPException(
            status_code=409,
            detail="Job cannot be cancelled. Only pending jobs can be cancelled.",
        )
    await connection_manager.broadcast({"type": "job.cancelled", "job_id": job_id})
