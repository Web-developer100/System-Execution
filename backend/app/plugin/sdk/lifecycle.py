"""
Plugin Lifecycle Manager — Manages the complete plugin lifecycle.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from app.plugin.sdk.plugin_base import PluginBase
from app.plugin.sdk.manifest import PluginManifest, PluginPermission
from app.core.events import event_bus

logger = logging.getLogger(__name__)


class LifecycleState(str, Enum):
    DISCOVERED = "discovered"
    DOWNLOADED = "downloaded"
    VALIDATED = "validated"
    VERIFIED = "verified"
    CONFIGURED = "configured"
    REGISTERED = "registered"
    INITIALIZED = "initialized"
    ACTIVE = "active"
    DISABLED = "disabled"
    ERROR = "error"
    REMOVED = "removed"


class LifecycleEvent(str, Enum):
    INSTALL = "install"
    VALIDATE = "validate"
    VERIFY_SIGNATURE = "verify_signature"
    RESOLVE_DEPENDENCIES = "resolve_dependencies"
    DOWNLOAD = "download"
    EXTRACT = "extract"
    CONFIGURE = "configure"
    REGISTER = "register"
    INITIALIZE = "initialize"
    HEALTH_CHECK = "health_check"
    EXECUTE = "execute"
    UPDATE = "update"
    RESTART = "restart"
    DISABLE = "disable"
    ROLLBACK = "rollback"
    REMOVE = "remove"
    CLEANUP = "cleanup"


class PluginLifecycleManager:
    """Manages the lifecycle of all plugins in the system."""

    def __init__(self):
        self._plugins: Dict[str, PluginBase] = {}
        self._states: Dict[str, LifecycleState] = {}
        self._lifecycle_history: Dict[str, List[Dict[str, Any]]] = {}
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the lifecycle manager."""
        self._initialized = True
        logger.info("[PluginLifecycle] Lifecycle manager initialized")

    # ── Plugin Registration ────────────────────────────────────────────────

    def register(self, plugin_id: str, plugin: PluginBase) -> None:
        """Register a plugin instance with the lifecycle manager."""
        self._plugins[plugin_id] = plugin
        self._states[plugin_id] = LifecycleState.DISCOVERED
        self._lifecycle_history[plugin_id] = []
        self._record_event(plugin_id, "registered")
        logger.info(f"[PluginLifecycle] Plugin registered: {plugin_id}")

    def unregister(self, plugin_id: str) -> None:
        """Unregister a plugin."""
        self._plugins.pop(plugin_id, None)
        self._states.pop(plugin_id, None)
        self._record_event(plugin_id, "unregistered")

    def get_plugin(self, plugin_id: str) -> Optional[PluginBase]:
        """Get a registered plugin by ID."""
        return self._plugins.get(plugin_id)

    def get_state(self, plugin_id: str) -> Optional[LifecycleState]:
        """Get the lifecycle state of a plugin."""
        return self._states.get(plugin_id)

    def get_all_plugins(self) -> List[PluginBase]:
        """Get all registered plugins."""
        return list(self._plugins.values())

    def get_plugins_by_category(self, category: str) -> List[PluginBase]:
        """Get all plugins in a specific category."""
        return [p for p in self._plugins.values() if p.manifest.category.value == category]

    def get_plugins_by_state(self, state: LifecycleState) -> List[PluginBase]:
        """Get all plugins in a specific lifecycle state."""
        return [p for p in self._plugins.values() if self._states.get(p.plugin_id) == state]

    # ── Lifecycle Operations ──────────────────────────────────────────────

    async def install(self, plugin_id: str) -> bool:
        """Install a plugin (run through full lifecycle)."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return False

        try:
            self._update_state(plugin_id, LifecycleState.DOWNLOADED)
            await plugin.on_install()
            self._record_event(plugin_id, "install", "success")

            await plugin.on_validate()
            self._update_state(plugin_id, LifecycleState.VALIDATED)
            self._record_event(plugin_id, "validate", "success")

            await plugin.on_activate()
            self._update_state(plugin_id, LifecycleState.REGISTERED)
            self._record_event(plugin_id, "activate", "success")

            await plugin.on_initialize()
            self._update_state(plugin_id, LifecycleState.INITIALIZED)
            self._record_event(plugin_id, "initialize", "success")

            self._update_state(plugin_id, LifecycleState.ACTIVE)
            logger.info(f"[PluginLifecycle] Plugin installed successfully: {plugin_id}")
            return True

        except Exception as e:
            self._update_state(plugin_id, LifecycleState.ERROR)
            self._record_event(plugin_id, "install", "failed", str(e))
            logger.error(f"[PluginLifecycle] Plugin installation failed: {plugin_id}: {e}")
            return False

    async def enable(self, plugin_id: str) -> bool:
        """Enable a plugin."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return False

        try:
            await plugin.on_activate()
            await plugin.on_initialize()
            self._update_state(plugin_id, LifecycleState.ACTIVE)
            self._record_event(plugin_id, "enable", "success")
            return True
        except Exception as e:
            self._record_event(plugin_id, "enable", "failed", str(e))
            return False

    async def disable(self, plugin_id: str) -> bool:
        """Disable a plugin."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return False

        try:
            await plugin.on_deactivate()
            self._update_state(plugin_id, LifecycleState.DISABLED)
            self._record_event(plugin_id, "disable", "success")
            return True
        except Exception as e:
            self._record_event(plugin_id, "disable", "failed", str(e))
            return False

    async def update(self, plugin_id: str, new_version: str) -> bool:
        """Update a plugin to a new version."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return False

        old_version = plugin.plugin_version
        try:
            await plugin.on_update(old_version, new_version)
            plugin.manifest.version = new_version
            self._record_event(plugin_id, "update", "success", f"{old_version} -> {new_version}")
            return True
        except Exception as e:
            self._record_event(plugin_id, "update", "failed", str(e))
            return False

    async def rollback(self, plugin_id: str, target_version: str) -> bool:
        """Rollback a plugin to a previous version."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return False

        old_version = plugin.plugin_version
        try:
            await plugin.on_rollback(old_version, target_version)
            plugin.manifest.version = target_version
            self._record_event(plugin_id, "rollback", "success", f"{old_version} -> {target_version}")
            return True
        except Exception as e:
            self._record_event(plugin_id, "rollback", "failed", str(e))
            return False

    async def remove(self, plugin_id: str) -> bool:
        """Remove/uninstall a plugin."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return False

        try:
            await plugin.on_deactivate()
            await plugin.on_uninstall()
            self._update_state(plugin_id, LifecycleState.REMOVED)
            self.unregister(plugin_id)
            self._record_event(plugin_id, "remove", "success")
            return True
        except Exception as e:
            self._record_event(plugin_id, "remove", "failed", str(e))
            return False

    async def run_health_check(self, plugin_id: str) -> Dict[str, Any]:
        """Run a health check on a specific plugin."""
        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return {"healthy": F
