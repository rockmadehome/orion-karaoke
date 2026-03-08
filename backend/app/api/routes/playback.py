from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.websocket import connection_manager
from app.core.database import get_session
from app.domain.models.playback import (
    PlaybackQueueItemCreate,
    PlaybackQueueItemRead,
    PlaybackQueueReorder,
)
from app.playback.playlist import (
    add_to_queue,
    advance_queue,
    get_current_song_with_queue,
    get_queue,
    remove_from_queue,
    reorder_queue,
)

router = APIRouter(prefix="/playback", tags=["playback"])


async def _broadcast_state(session: Session) -> None:
    state = get_current_song_with_queue(session)
    await connection_manager.broadcast({"type": "playback.state", "data": state})


@router.get("/queue", response_model=list[PlaybackQueueItemRead])
def get_playback_queue(session: Session = Depends(get_session)):
    return get_queue(session)


@router.post("/queue", response_model=PlaybackQueueItemRead, status_code=201)
async def add_song_to_queue(
    body: PlaybackQueueItemCreate,
    session: Session = Depends(get_session),
):
    item = add_to_queue(body, session)
    await _broadcast_state(session)
    return item


@router.delete("/queue/{item_id}", status_code=204)
async def remove_from_playback_queue(
    item_id: str,
    session: Session = Depends(get_session),
):
    removed = remove_from_queue(item_id, session)
    if not removed:
        raise HTTPException(status_code=404, detail="Queue item not found.")
    await _broadcast_state(session)


@router.put("/queue/reorder", response_model=list[PlaybackQueueItemRead])
async def reorder_playback_queue(
    body: PlaybackQueueReorder,
    session: Session = Depends(get_session),
):
    updated = reorder_queue(body.items, session)
    await _broadcast_state(session)
    return updated


@router.post("/next", status_code=200)
async def advance_to_next(session: Session = Depends(get_session)):
    advance_queue(session)
    await _broadcast_state(session)
    return {"detail": "Advanced to next song."}
