"""
WebSocket Connection Manager
Handles real-time event streaming for scan progress, notifications, and system events.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections for real-time event streaming."""

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}
        self._user_connections: Dict[str, Set[str]] = {}  # user_id -> {conn_id}
        self._org_connections: Dict[str, Set[str]] = {}  # org_id -> {conn_id}
        self._connection_metadata: Dict[str, Dict[str, Any]] = {}
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._handlers: Dict[str, List[Callable]] = {}
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the WebSocket manager."""
        self._initialized = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.info("[WS] WebSocket manager initialized")

    async def shutdown(self) -> None:
        """Shutdown the WebSocket manager."""
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        # Close all connections
        for conn_id, ws in self._connections.items():
            try:
                await ws.close(code=1001, reason="Server shutdown")
            except Exception:
                pass

        self._connections.clear()
        self._user_connections.clear()
        self._org_connections.clear()
        self._connection_metadata.clear()
        logger.info("[WS] WebSocket manager shut down")

    async def handle_connection(self, websocket: WebSocket) -> None:
        """Handle a new WebSocket connection."""
        await websocket.accept()
        conn_id = str(uuid.uuid4())
        self._connections[conn_id] = websocket
        self._connection_metadata[conn_id] = {
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "user_id": None,
            "org_id": None,
            "subscriptions": set(),
        }

        logger.info(f"[WS] New connection: {conn_id}")

        try:
            # Send welcome message
            await self._send(websocket, {
                "type": "connection_established",
                "connection_id": conn_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            # Handle messages
            while True:
                data = await websocket.receive_text()
                await self._handle_message(conn_id, websocket, data)

        except WebSocketDisconnect:
            logger.info(f"[WS] Connection disconnected: {conn_id}")
        except Exception as e:
            logger.error(f"[WS] Connection error {conn_id}: {e}")
        finally:
            await self._cleanup_connection(conn_id)

    async def _handle_message(self, conn_id: str, websocket: WebSocket, data: str) -> None:
        """Handle an incoming WebSocket message."""
        try:
            message = json.loads(data)
            msg_type = message.get("type", "")

            if msg_type == "subscribe":
                channels = message.get("channels", [])
                metadata = self._connection_metadata.get(conn_id, {})
                metadata["subscriptions"] = set(channels)
                
                # Handle user-specific subscriptions
                if "user_id" in message:
                    user_id = message["user_id"]
                    metadata["user_id"] = user_id
                    if user_id not in self._user_connections:
                        self._user_connections[user_id] = set()
                    self._user_connections[user_id].add(conn_id)

                # Handle org-specific subscriptions
                if "org_id" in message:
                    org_id = message["org_id"]
                    metadata["org_id"] = org_id
                    if org_id not in self._org_connections:
                        self._org_connections[org_id] = set()
                    self._org_connections[org_id].add(conn_id)

                await self._send(websocket, {
                    "type": "subscribed",
                    "channels": channels,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif msg_type == "unsubscribe":
                channels = message.get("channels", [])
                metadata = self._connection_metadata.get(conn_id, {})
                metadata["subscriptions"] = metadata.get("subscriptions", set()) - set(channels)
                
                await self._send(websocket, {
                    "type": "unsubscribed",
                    "channels": channels,
                })

            elif msg_type == "ping":
                await self._send(websocket, {
                    "type": "pong",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif msg_type == "authenticate":
                token = message.get("token", "")
                # Validate token and attach user info
                # (Token validation logic would go here)
                await self._send(websocket, {
                    "type": "authenticated",
                    "success": True,
                })

            else:
                await self._send(websocket, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

        except json.JSONDecodeError:
            await self._send(websocket, {
                "type": "error",
                "message": "Invalid JSON",
            })

    # ── Broadcasting ─────────────────────────────────────────────────────

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> int:
        """Broadcast an event to all connected clients."""
        message = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload = json.dumps(message)
        sent = 0

        for conn_id, ws in list(self._connections.items()):
            try:
                await ws.send_text(payload)
                sent += 1
            except Exception:
                await self._cleanup_connection(conn_id)

        return sent

    async def broadcast_to_user(self, user_id: str, event_type: str, data: Dict[str, Any]) -> int:
        """Broadcast an event to a specific user's connections."""
        conn_ids = self._user_connections.get(user_id, set())
        return await self._broadcast_to_connections(conn_ids, event_type, data)

    async def broadcast_to_organization(self, org_id: str, event_type: str, data: Dict[str, Any]) -> int:
        """Broadcast an event to an organization's connections."""
        conn_ids = self._org_connections.get(org_id, set())
        return await self._broadcast_to_connections(conn_ids, event_type, data)

    async def broadcast_to_channel(self, channel: str, event_type: str, data: Dict[str, Any]) -> int:
        """Broadcast to clients subscribed to a specific channel."""
        message = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload = json.dumps(message)
        sent = 0

        for conn_id, ws in list(self._connections.items()):
            metadata = self._connection_metadata.get(conn_id, {})
            if channel in metadata.get("subscriptions", set()):
                try:
                    await ws.send_text(payload)
                    sent += 1
                except Exception:
                    await self._cleanup_connection(conn_id)

        return sent

    async def _broadcast_to_connections(self, conn_ids: Set[str], event_type: str, data: Dict[str, Any]) -> int:
        """Broadcast to a specific set of connection IDs."""
        message = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload = json.dumps(message)
        sent = 0

        for conn_id in conn_ids:
            ws = self._connections.get(conn_id)
            if ws:
                try:
                    await ws.send_text(payload)
                    sent += 1
                except Exception:
                    await self._cleanup_connection(conn_id)

        return sent

    # ── Connection Management ─────────────────────────────────────────────

    async def _cleanup_connection(self, conn_id: str) -> None:
        """Clean up a disconnected connection."""
        if conn_id in self._connections:
            del self._connections[conn_id]

        metadata = self._connection_metadata.pop(conn_id, {})
        user_id = metadata.get("user_id")
        org_id = metadata.get("org_id")

        if user_id and user_id in self._user_connections:
            self._user_connections[user_id].discard(conn_id)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]

        if org_id and org_id in self._org_connections:
            self._org_connections[org_id].discard(conn_id)
            if not self._org_connections[org_id]:
                del self._org_connections[org_id]

    async def _send(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        """Send a JSON message to a WebSocket."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"[WS] Send error: {e}")

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeats to keep connections alive."""
        while True:
            await asyncio.sleep(settings.WS_HEARTBEAT_INTERVAL)
            stale_connections = []

            for conn_id, ws in list(self._connections.items()):
                try:
                    await ws.send_json({"type": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})
                except Exception:
                    stale_connections.append(conn_id)

            for conn_id in stale_connections:
                await self._cleanup_connection(conn_id)

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    @property
    def active_users(self) -> int:
        return len(self._user_connections)


# Singleton instance
ws_manager = WebSocketManager()
