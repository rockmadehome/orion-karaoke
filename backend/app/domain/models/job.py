import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ProcessingJob(SQLModel, table=True):
    __tablename__ = "processing_jobs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    url: str
    status: str = Field(default="pending")   # pending | processing | completed | failed
    stage: Optional[str] = Field(default=None)
    progress: int = Field(default=0)
    error_message: Optional[str] = Field(default=None)
    song_id: Optional[str] = Field(default=None, foreign_key="songs.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProcessingJobCreate(SQLModel):
    url: str


class ProcessingJobRead(SQLModel):
    id: str
    url: str
    status: str
    stage: Optional[str]
    progress: int
    error_message: Optional[str]
    song_id: Optional[str]
    created_at: datetime
    updated_at: datetime
