"""
Plugin SDK — Plugin Event Bus.

Plugin-specific event system separate from the core event bus.
Plugins subscribe to platform events and publish their own events.

Built-in events:
  - ScanStarted, ScanFinished, ScanProgress, ScanError
  - AssetCreated, AssetUpdated, AssetDeleted
  - FindingCreated, FindingVerified, FindingFalsePositive
  - ReportGenerated, ReportDownloaded
  - UserLogin, UserLogout, UserCreated
  - WorkerOnline, WorkerOffline, WorkerError
  - PluginInstalled, PluginUpdated, PluginEnabled, PluginDisabled
  - NotificationSent, NotificationFailed
  - SystemStartup, SystemShutdown, SystemError
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class PluginEvent:
    """A single plugin event."""
    id: str
    type: str
    source: str  # plugin ID or "system"
    timestamp: str
    data: Dict[str, Any] = field(default_factory=dict)
    metadata: Optional[Dict[str, Any]] = None


class PluginEventBus:
    """Standalone event bus for plugins to subscribe and publish events."""

    # Predefined event types
    SCAN_STARTED = "ScanStarted"
    SCAN_FINISHED = "ScanFinished"
    SCAN_PROGRESS = "ScanProgress"
    SCAN_ERROR = "ScanError"
    ASSET_CREATED = "AssetCreated"
    ASSET_UPDATED = "AssetUpdated"
    ASSET_DELETED = "AssetDeleted"
    FINDING_CREATED = "FindingCreated"
    FINDING_UPDATED = "FindingUpdated"
    FINDING_VERIFIED = "FindingVerified"
    FINDING_FALSE_POSITIVE = "FindingFalsePositive"
    REPORT_GENERATED = "ReportGenerated"
    REPORT_DOWNLOADED = "ReportDownloaded"
    USER_LOGIN = "UserLogin"
    USER_LOGOUT = "UserLogout"
    USER_CREATED = "UserCreated"
    WORKER_ONLINE = "WorkerOnline"
    WORKER_OFFLINE = "WorkerOffline"
    WORKER_ERROR = "WorkerError"
    PLUGIN_INSTALLED = "PluginInstalled"
    PLUGIN_UPDATED = "PluginUpdated"
    PLUGIN_UNINSTALLED = "PluginUninstalled"
    PLUGIN_ENABLED = "PluginEnabled"
    PLUGIN_DISABLED = "PluginDisabled"
    PLUGIN_HEALTH_CHANGED = "PluginHealthChanged"
    PLUGIN_ERROR = "PluginError"
    NOTIFICATION_SENT = "NotificationSent"
    NOTIFICATION_FAILED = "NotificationFailed"
    SYSTEM_STARTUP = "SystemStartup"
    SYSTEM_SHUTDOWN = "SystemShutdown"
    SYSTEM_ERROR = "SystemError"
    SYSTEM_CONFIG_CHANGED = "SystemConfigChanged"

    def __init__(self, max_history: int = 1000):
        self._subscribers: Dict[str, List[Dict[str, Any]]] = {}
        self._history: List[PluginEvent] = []
        self._max_history = max_history
        self._next_id: int = 1

    # ── Emitting Events ────────────────────────────────────────────────────

    def emit(
        self,
        event_type: str,
        source: str,
        data: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> PluginEvent:
        """Emit an event to all subscribers."""
        event = PluginEvent(
            id=f"evt-{self._next_id}-{int(datetime.now().timestamp() * 1000)}",
            type=event_type,
            source=source,
            timestamp=datetime.now(timezone.utc).isoformat(),
            data=data or {},
            metadata=metadata,
        )
        self._next_id += 1

        # Store in history (ring buffer)
        self._history.append(event)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

        # Notify type-specific subscribers
        subscribers = self._subscribers.get(event_type, [])
        for sub in list(subscribers):  # iterate copy for safety
            try:
                sub["handler"](event)
            except Exception as e:
                logger.error(
                    f"[PLUGIN-EVENTS] Handler error for plugin "
                    f"'{sub.get('plugin_id')}' on '{event_type}': {e}"
                )

        # Notify wildcard subscribers
        wildcard = self._subscribers.get("*", [])
        for sub in list(wildcard):
            try:
                sub["handler"](event)
            except Exception as e:
                logger.error(
                    f"[PLUGIN-EVENTS] Wildcard handler error: {e}"
                )

        logger.debug(
            f"[PLUGIN-EVENTS] '{event_type}' emitted by '{source}'"
        )
        return event

    # ── Subscribing ────────────────────────────────────────────────────────

    def subscribe(
        self,
        plugin_id: str,
        event_type: str,
        handler: Callable,
    ) -> Callable:
        """Subscribe a plugin to an event type.
        Returns an unsubscribe function."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []

        entry = {"plugin_id": plugin_id, "handler": handler}
        self._subscribers[event_type].append(entry)

        logger.debug(
            f"[PLUGIN-EVENTS] Plugin '{plugin_id}' subscribed to '{event_type}'"
        )

        def unsubscribe():
            subs = self._subscribers.get(event_type, [])
            if entry in subs:
                subs.remove(entry)
                if not subs:
                    self._subscribers.pop(event_type, None)

        return unsubscribe

    def unsubscribe_all(self, plugin_id: str) -> None:
        """Unsubscribe a plugin from all events."""
        for subs in self._subscribers.values():
            subs[:] = [s for s in subs if s.get("plugin_id") != plugin_id]
        logger.debug(f"[PLUGIN-EVENTS] Plugin '{plugin_id}' unsubscribed from all events")

    # ── Plugin SDK API ─────────────────────────────────────────────────────

    def create_plugin_api(self, plugin_id: str) -> Dict[str, Any]:
        """Create a scoped EventAPI for a specific plugin instance."""
        return {
            "emit": lambda event_type, data=None, metadata=None: self.emit(
                event_type, plugin_id, data, {**(metadata or {}), "plugin_id": plugin_id}
            ),
            "on": lambda event_type, handler: self.subscribe(plugin_id, event_type, handler),
        }

    # ── Queries ─────────────────────────────────────────────────────────────

    def get_recent(self, event_type: Optional[str] = None, limit: int = 50) -> List[PluginEvent]:
        """Get recent events, optionally filtered by type."""
        events = self._history
        if event_type:
            events = [e for e in events if e.type == event_type]
        return events[-limit:]

    def get_subscribed_types(self) -> List[str]:
        """Get all event types that have active subscribers."""
        return list(self._subscribers.keys())

    def get_subscriber_count(self, event_type: str) -> int:
        """Get the number of subscribers for an event type."""
        return len(self._subscribers.get(event_type, []))

    def get_history(self) -> List[PluginEvent]:
        """Get the complete event history."""
        return list(self._history)

    def clear_history(self) -> None:
        """Clear event history."""
        self._history = []

    def shutdown(self) -> None:
        """Shutdown the event bus."""
        self._subscribers.clear()
        self._history.clear()


# ── Singleton ───────────────────────────────────────────────────────────────

plugin_event_bus = PluginEventBus()
