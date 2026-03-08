import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.append(websocket)
        logger.debug(f"WS connected — total clients: {len(self._active)}")

    def disconnect(self, websocket: WebSocket) -> None:
        self._active.remove(websocket)
        logger.debug(f"WS disconnected — total clients: {len(self._active)}")

    async def broadcast(self, payload: dict[str, Any]) -> None:
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self._active):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self._active:
                self._active.remove(ws)


connection_manager = ConnectionManager()
