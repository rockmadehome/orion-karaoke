import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from app.api.routes import jobs, playback, settings, songs
from app.api.websocket import connection_manager
from app.core.config import settings as app_settings
from app.core.database import create_db_and_tables, engine
from app.core.hardware import get_hardware_backend
from app.playback.playlist import (
    add_to_queue,
    advance_queue,
    get_current_song_with_queue,
    remove_from_queue,
)
from app.domain.models.playback import PlaybackQueueItemCreate
from app.queue.worker import start_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

_EXTRA_BINARY_DIRS = [
    "/opt/homebrew/bin",       # macOS Apple Silicon (Homebrew)
    "/usr/local/bin",           # macOS Intel / Linux custom
    "/usr/bin",
    "/bin",
]


def _inject_binary_paths() -> None:
    """Prepend common binary dirs to PATH so subprocess-based libs find ffmpeg etc."""
    current = os.environ.get("PATH", "")
    existing = set(current.split(os.pathsep))
    extras = [d for d in _EXTRA_BINARY_DIRS if d not in existing and Path(d).is_dir()]
    if extras:
        os.environ["PATH"] = os.pathsep.join(extras) + os.pathsep + current
        logger.info("PATH augmented with: %s", extras)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure common binary dirs are in PATH so all subprocess calls
    # (yt-dlp, audio-separator, ffmpeg-python) work regardless of how
    # the server was launched (venv without /opt/homebrew/bin, etc.)
    _inject_binary_paths()

    # Startup
    create_db_and_tables()
    app_settings.STORAGE_PATH.mkdir(parents=True, exist_ok=True)
    app_settings.TEMP_PATH.mkdir(parents=True, exist_ok=True)
    hw = get_hardware_backend(app_settings.HARDWARE_BACKEND)
    logger.info(f"Orion Karaoke starting — hardware: {hw.value}")

    worker_task = asyncio.create_task(start_worker())
    yield
    # Shutdown
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    logger.info("Orion Karaoke shutdown complete")


app = FastAPI(title="Orion Karaoke", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(jobs.router, prefix="/api")
app.include_router(songs.router, prefix="/api")
app.include_router(playback.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Storage file serving — path traversal protected
@app.get("/storage/{filename:path}")
def serve_storage(filename: str):
    storage_root = app_settings.STORAGE_PATH.resolve()
    requested = (storage_root / filename).resolve()

    # Ensure the resolved path is within storage root (prevent path traversal)
    if not str(requested).startswith(str(storage_root)):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Access denied.")
    if not requested.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(str(requested))


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await connection_manager.connect(websocket)

    # Send full current playback state to the newly connected client
    with Session(engine) as session:
        state = get_current_song_with_queue(session)
    await websocket.send_json({"type": "playback.state", "data": state})

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue
            await _handle_ws_message(message)
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)


async def _handle_ws_message(message: dict) -> None:
    event = message.get("type") or message.get("event")
    with Session(engine) as session:
        if event == "playback.next":
            advance_queue(session)
            state = get_current_song_with_queue(session)
            await connection_manager.broadcast({"type": "playback.state", "data": state})

        elif event == "playback.add":
            song_id = message.get("song_id")
            if song_id:
                add_to_queue(PlaybackQueueItemCreate(song_id=song_id), session)
                state = get_current_song_with_queue(session)
                await connection_manager.broadcast({"type": "playback.state", "data": state})

        elif event == "playback.remove":
            item_id = message.get("queue_item_id")
            if item_id:
                remove_from_queue(item_id, session)
                state = get_current_song_with_queue(session)
                await connection_manager.broadcast({"type": "playback.state", "data": state})


# Serve React SPA — must be last, after all API routes
_static_dir = Path(__file__).parent.parent / "static"
if _static_dir.exists():
    # Mount /assets (Vite build output: JS, CSS, chunks)
    _assets_dir = _static_dir / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    # Catch-all: serve real files if they exist, otherwise return index.html
    # so React Router can handle client-side navigation and deep-link refreshes.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        candidate = (_static_dir / full_path).resolve()
        # Security: prevent path traversal outside static dir
        if candidate.is_file() and candidate.is_relative_to(_static_dir.resolve()):
            return FileResponse(str(candidate))
        return FileResponse(str(_static_dir / "index.html"))
