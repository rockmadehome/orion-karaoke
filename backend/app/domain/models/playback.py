import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PlaybackQueueItem(SQLModel, table=True):
    __tablename__ = "playback_queue"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    song_id: str = Field(foreign_key="songs.id")
    position: int
    added_by: Optional[str] = Field(default=None)
    added_at: datetime = Field(default_factory=datetime.utcnow)


class PlaybackQueueItemRead(SQLModel):
    id: str
    song_id: str
    position: int
    added_by: Optional[str]
    added_at: datetime


class PlaybackQueueItemCreate(SQLModel):
    song_id: str
    position: Optional[int] = None


class ReorderItem(SQLModel):
    id: str
    position: int


class PlaybackQueueReorder(SQLModel):
    items: list[ReorderItem]
