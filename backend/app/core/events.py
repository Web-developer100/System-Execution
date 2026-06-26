"""
Enterprise Event System
Domain events, event bus abstraction, and event handlers.
"""
from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Type


class EventPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class EventStatus(Enum):
    PENDING = "pending"
    PUBLISHED = "published"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class DomainEvent:
    """Base class for all domain events."""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""
    event_version: int = 1
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    priority: EventPriority = EventPriority.NORMAL
    metadata: Dict[str, Any] = field(default_factory=dict)
    source: str = ""
    organization_id: Optional[str] = None
    user_id: Optional[str] = None

    def __post_init__(self):
        if not self.event_type:
            self.event_type = self.__class__.__name__


# ── Specific Events ─────────────────────────────────────────────────────────

@dataclass
class ScanStarted(DomainEvent):
    scan_id: str = ""
    target: str = ""
    tools: List[str] = field(default_factory=list)


@dataclass
class ScanProgressed(DomainEvent):
    scan_id: str = ""
    progress: int = 0
    stage: str = ""


@dataclass
class ScanCompleted(DomainEvent):
    scan_id: str = ""
    findings_count: int = 0
    duration_ms: int = 0


@dataclass
class ScanFailed(DomainEvent):
    scan_id: str = ""
    error: str = ""
    stage: str = ""


@dataclass
class ScanStopped(DomainEvent):
    scan_id: str = ""
    reason: str = ""


@dataclass
class FindingCreated(DomainEvent):
    finding_id: str = ""
    scan_id: str = ""
    severity: str = ""
    title: str = ""


@dataclass
class FindingVerified(DomainEvent):
    finding_id: str = ""
    verification_status: str = ""
    confidence: int = 0


@dataclass
class FindingUpdated(DomainEvent):
    finding_id: str = ""
    previous_status: str = ""
    new_status: str = ""


@dataclass
class PluginInstalled(DomainEvent):
    plugin_id: str = ""
    name: str = ""
    version: str = ""


@dataclass
class PluginUpdated(DomainEvent):
    plugin_id: str = ""
    name: str = ""
    old_version: str = ""
    new_version: str = ""


@dataclass
class UserLoggedIn(DomainEvent):
    user_id: str = ""
    username: str = ""
    method: str = ""
    ip_address: str = ""


@dataclass
class UserLoggedOut(DomainEvent):
    user_id: str = ""
    session_id: str = ""


@dataclass
class WorkerConnected(DomainEvent):
    worker_id: str = ""
    hostname: str = ""
    capabilities: List[str] = field(default_factory=list)


@dataclass
class WorkerDisconnected(DomainEvent):
    worker_id: str = ""
    reason: str = ""


@dataclass
class ReportGenerated(DomainEvent):
    report_id: str = ""
    scan_id: str = ""
    format: str = ""


@dataclass
class NotificationSent(DomainEvent):
    notification_id: str = ""
    channel: str = ""
    recipient: str = ""


@dataclass
class OrganizationCreated(DomainEvent):
    organization_id: str = ""
    name: str = ""
    tier: str = ""


@dataclass
class ApiKeyCreated(DomainEvent):
    api_key_id: str = ""
    name: str = ""
    created_by: str = ""


@dataclass
class ScheduleTriggered(DomainEvent):
    schedule_id: str = ""
    action: str = ""


# ── Event Handler ──────────────────────────────────────────────────────────

EventHandler = Callable[[DomainEvent], Any]


class EventBus(ABC):
    """Abstract event bus for publishing and subscribing to domain events."""

    @abstractmethod
    async def publish(self, event: DomainEvent) -> None:
        """Publish a domain event."""
        ...

    @abstractmethod
    async def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """Subscribe to a specific event type."""
        ...

    @abstractmethod
    async def unsubscribe(self, event_type: str, handler: EventHandler) -> None:
        """Unsubscribe from a specific event type."""
        ...


class InMemoryEventBus(EventBus):
    """In-memory event bus for development/testing."""

    def __init__(self):
        self._handlers: Dict[str, List[EventHandler]] = {}
        self._history: List[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self._history.append(event)
        handlers = self._handlers.get(event.event_type, []) + self._handlers.get("*", [])
        for handler in handlers:
            try:
                result = handler(event)
                if hasattr(result, "__await__"):
                    await result
            except Exception as e:
                print(f"[EventBus] Error in handler for {event.event_type}: {e}")

    async def subscribe(self, event_type: str, handler: EventHandler) -> None:
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    async def unsubscribe(self, event_type: str, handler: EventHandler) -> None:
        if event_type in self._handlers:
            self._handlers[event_type] = [h for h in self._handlers[event_type] if h != handler]

    def get_history(self, event_type: Optional[str] = None, limit: int = 100) -> List[DomainEvent]:
        events = self._history
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return events[-limit:]


# ── Singleton event bus ──────────────────────────────────────────────────────

event_bus: EventBus = InMemoryEventBus()
