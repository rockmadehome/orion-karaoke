from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from app.core.config import settings
from app.core.database import get_session
from app.domain.models.song import Song, SongListRead, SongRead

router = APIRouter(prefix="/songs", tags=["songs"])


@router.get("", response_model=SongListRead)
def list_songs(
    q: str | None = Query(default=None, description="Search by title or artist"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    session: Session = Depends(get_session),
):
    statement = select(Song)
    count_statement = select(func.count()).select_from(Song)

    if q:
        pattern = f"%{q}%"
        statement = statement.where(
            Song.title.ilike(pattern) | Song.artist.ilike(pattern)
        )
        count_statement = count_statement.where(
            Song.title.ilike(pattern) | Song.artist.ilike(pattern)
        )

    total = session.exec(count_statement).one()
    items = session.exec(
        statement.order_by(Song.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return SongListRead(items=list(items), total=total, page=page, page_size=page_size)


@router.get("/{song_id}", response_model=SongRead)
def get_song(song_id: str, session: Session = Depends(get_session)):
    song = session.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found.")
    return song


@router.delete("/{song_id}", status_code=204)
def delete_song(song_id: str, session: Session = Depends(get_session)):
    song = session.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found.")

    # Remove files from storage
    _remove_file(settings.STORAGE_PATH / song.video_path)
    if song.thumbnail_path:
        _remove_file(settings.STORAGE_PATH / song.thumbnail_path)

    session.delete(song)
    session.commit()


def _remove_file(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass  # log but don't fail the request
