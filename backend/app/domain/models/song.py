import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Song(SQLModel, table=True):
    __tablename__ = "songs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    title: str
    artist: Optional[str] = Field(default=None)
    duration_seconds: Optional[int] = Field(default=None)
    language: Optional[str] = Field(default=None)
    video_path: str                              # relative to STORAGE_PATH
    thumbnail_path: Optional[str] = Field(default=None)
    source_url: Optional[str] = Field(default=None)
    source_provider: str = Field(default="youtube")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SongRead(SQLModel):
    id: str
    title: str
    artist: Optional[str]
    duration_seconds: Optional[int]
    language: Optional[str]
    video_path: str
    thumbnail_path: Optional[str]
    source_url: Optional[str]
    source_provider: str
    created_at: datetime


class SongListRead(SQLModel):
    items: list[SongRead]
    total: int
    page: int
    page_size: int
