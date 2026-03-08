import logging
from typing import Optional

from sqlmodel import Session, select

from app.domain.models.playback import PlaybackQueueItem, PlaybackQueueItemCreate, ReorderItem
from app.domain.models.song import Song

logger = logging.getLogger(__name__)


def get_queue(session: Session) -> list[PlaybackQueueItem]:
    return list(session.exec(
        select(PlaybackQueueItem).order_by(PlaybackQueueItem.position)
    ).all())


def add_to_queue(item: PlaybackQueueItemCreate, session: Session) -> PlaybackQueueItem:
    if item.position is None:
        existing = get_queue(session)
        position = (max(i.position for i in existing) + 1) if existing else 0
    else:
        position = item.position

    queue_item = PlaybackQueueItem(song_id=item.song_id, position=position)
    session.add(queue_item)
    session.commit()
    session.refresh(queue_item)
    logger.info(f"Added song {item.song_id} to playback queue at position {position}")
    return queue_item


def remove_from_queue(item_id: str, session: Session) -> bool:
    item = session.get(PlaybackQueueItem, item_id)
    if item is None:
        return False
    session.delete(item)
    session.commit()
    return True


def reorder_queue(items: list[ReorderItem], session: Session) -> list[PlaybackQueueItem]:
    for reorder in items:
        queue_item = session.get(PlaybackQueueItem, reorder.id)
        if queue_item:
            queue_item.position = reorder.position
            session.add(queue_item)
    session.commit()
    return get_queue(session)


def advance_queue(session: Session) -> Optional[PlaybackQueueItem]:
    """
    Remove the first item in the queue and return the new first item (next song).
    Returns None if queue becomes empty.
    """
    queue = get_queue(session)
    if not queue:
        return None

    first = queue[0]
    session.delete(first)
    session.commit()

    remaining = get_queue(session)
    return remaining[0] if remaining else None


def get_current_song_with_queue(session: Session) -> dict:
    """Build the full playback state payload for WebSocket broadcast."""
    queue = get_queue(session)
    if not queue:
        return {"current_song": None, "queue": []}

    current_item = queue[0]
    current_song = session.get(Song, current_item.song_id)

    upcoming = []
    for item in queue[1:]:
        song = session.get(Song, item.song_id)
        if song:
            upcoming.append({
                "queue_item_id": item.id,
                "song_id": song.id,
                "title": song.title,
                "artist": song.artist,
                "duration_seconds": song.duration_seconds,
                "thumbnail_path": song.thumbnail_path,
                "position": item.position,
            })

    return {
        "current_song": {
            "queue_item_id": current_item.id,
            "song_id": current_song.id if current_song else None,
            "title": current_song.title if current_song else None,
            "artist": current_song.artist if current_song else None,
            "video_path": current_song.video_path if current_song else None,
            "thumbnail_path": current_song.thumbnail_path if current_song else None,
            "duration_seconds": current_song.duration_seconds if current_song else None,
        },
        "queue": upcoming,
    }
