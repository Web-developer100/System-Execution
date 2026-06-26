"""
PluginBase — Abstract base class for all plugins.

All plugins must extend this class and implement execute().
Lifecycle hooks are provided as optional overrides.
"""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.plugin.sdk.manifest import PluginManifest
from app.plugin.sdk.context import PluginExecutionContext, PluginExecutionResult
from app.plugin.sdk.lifecycle import LifecycleState
from app.core.events import DomainEvent, event_bus

logger = logging.getLogger(__name__)


class PluginBase(ABC):
    """Abstract base class that all plugins must extend."""

    # ── Manifest (required) ───────────────────────────────────────────────
    manifest: PluginManifest

    # ── Configuration ──────────────────────────────────────────────────────
    config: Dict[str, Any] = {}
    _lifecycle_state: LifecycleState = LifecycleState.DISCOVERED

    # ── SDK APIs (injected by the runtime) ──────────────────────────────────
    _storage_api: Any = None
    _secrets_api: Any = None
    _event_api: Any = None
    _auth_api: Any = None
    _metrics_api: Any = None
    _worker_api: Any = None
    _logging_api: Any = None

    def __init__(self):
        self._event_handlers: Dict[str, List[Callable]] = {}
        self._initialized = False

    def inject_apis(self, apis: Dict[str, Any]) -> None:
        """Inject SDK APIs into the plugin."""
        self._storage_api = apis.get("storage")
        self._secrets_api = apis.get("secrets")
        self._event_api = apis.get("events")
        self._auth_api = apis.get("auth")
        self._metrics_api = apis.get("metrics")
        self._worker_api = apis.get("worker")
        self._logging_api = apis.get("logging") or logger

    # ── Lifecycle Hooks (overridable) ──────────────────────────────────────

    async def on_install(self) -> None:
        """Called when the plugin is installed."""
        self._lifecycle_state = LifecycleState.DOWNLOADED

    async def on_validate(self) -> None:
        """Called to validate the plugin installation."""
        self._lifecycle_state = LifecycleState.VERIFIED

    async def on_configure(self, config: Dict[str, Any]) -> None:
        """Called to apply configuration to the plugin."""
        self.config = {**self.manifest.default_config, **config}
        self._lifecycle_state = LifecycleState.CONFIGURED

    async def on_activate(self) -> None:
        """Called when the plugin is activated (enabled)."""
        self._lifecycle_state = LifecycleState.REGISTERED

    async def on_initialize(self) -> None:
        """Called when the plugin is fully initialized and ready."""
        self._initialized = True
        self._lifecycle_state = LifecycleState.INITIALIZED

    async def on_deactivate(self) -> None:
        """Called when the plugin is deactivated (disabled)."""
        self._initialized = False
        self._lifecycle_state = LifecycleState.DISABLED

    async def on_update(self, from_version: str, to_version: str) -> None:
        """Called when the plugin is updated to a new version."""
        pass

    async def on_rollback(self, from_version: str, to_version: str) -> None:
        """Called when the plugin is rolled back to a previous version."""
        pass

    async def on_uninstall(self) -> None:
        """Called when the plugin is uninstalled."""
        self._lifecycle_state = LifecycleState.REMOVED

    async def on_health_check(self) -> Dict[str, Any]:
        """Called to check plugin health. Return {"healthy": True/False, "message": "..."}"""
        return {"healthy": True, "message": "Plugin is operational"}

    # ── Core Execution ─────────────────────────────────────────────────────

    @abstractmethod
    async def execute(self, ctx: PluginExecutionContext) -> PluginExecutionResult:
        """Execute the plugin's primary function.
        
        Args:
            ctx: Execution context with target, config, and environment
            
        Returns:
            PluginExecutionResult with findings, output, and metadata
        """
        ...

    # ── Parsing Hook ───────────────────────────────────────────────────────

    async def parse_output(self, stdout: str, stderr: str, target: str) -> List[Dict[str, Any]]:
        """Parse raw tool output into structured findings.
        
        Override this method to implement custom output parsing.
        Default implementation returns empty list.
        """
        return []

    # ── Logging ────────────────────────────────────────────────────────────

    def log(self, level: str, message: str, **kwargs) -> None:
        """Log a message with the plugin context."""
        prefix = f"[PLUGIN:{self.manifest.id}]"
        log_fn = getattr(self._logging_api, level.lower(), logger.info)
        log_fn(f"{prefix} {message}", extra={"plugin": self.manifest.id, **kwargs})

    def info(self, message: str, **kwargs) -> None:
        self.log("info", message, **kwargs)

    def warn(self, message: str, **kwargs) -> None:
        self.log("warning", message, **kwargs)

    def error(self, message: str, **kwargs) -> None:
        self.log("error", message, **kwargs)

    def debug(self, message: str, **kwargs) -> None:
        self.log("debug", message, **kwargs)

    # ── Events ────────────────────────────────────────────────────────────

    def on_event(self, event_type: str, handler: Callable) -> Callable:
        """Subscribe to a domain event.
        
        Returns an unsubscribe function.
        """
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)

        async def event_handler(event: DomainEvent) -> None:
            if event.event_type == event_type:
                await handler(event)

        asyncio.ensure_future(event_bus.subscribe(event_type, event_handler))

        def unsubscribe():
            if event_type in self._event_handlers:
                self._event_handlers[event_type].remove(handler)

        return unsubscribe

    def emit_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit a custom plugin event."""
        if self._event_api:
            asyncio.ensure_future(self._event_api(event_type, data))

    # ── Config Access ──────────────────────────────────────────────────────

    def get_config_value(self, key: str, default: Any = None) -> Any:
        """Get a specific configuration value."""
        return self.config.get(key, default)

    def get_state(self) -> LifecycleState:
        """Get the current lifecycle state."""
        return self._lifecycle_state

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    @property
    def plugin_id(self) -> str:
        return self.manifest.id

    @property
    def plugin_name(self) -> str:
        return self.manifest.name

    @property
    def plugin_version(self) -> str:
        return self.manifest.version

    def __repr__(self) -> str:
        return f"<Plugin {self.manifest.id} v{self.manifest.version}>"
