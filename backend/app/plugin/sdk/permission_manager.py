"""
Plugin SDK — Permission Manager.

Enterprise-grade permission management for plugins:
  - Plugins declare required permissions in manifest
  - Permissions require administrator approval
  - Can be approved, denied, or revoked at any time
  - Required permissions block plugin activation if denied
  - Full audit trail of all permission changes
  - Notifications when permissions change
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class PermissionStatus:
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    REVOKED = "revoked"


@dataclass
class PluginPermissionState:
    """State of a single permission for a plugin."""
    permission: str
    reason: str = ""
    required: bool = False
    status: str = PermissionStatus.PENDING
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    denied_by: Optional[str] = None
    denied_at: Optional[str] = None
    revoked_by: Optional[str] = None
    revoked_at: Optional[str] = None


# ── Predefined Permissions ─────────────────────────────────────────────────

class PluginPermissions:
    """Standard permission constants."""
    NETWORK_INTERNET = "network:internet"
    NETWORK_RAW_SOCKETS = "network:raw_sockets"
    NETWORK_LOCAL = "network:local"
    FILESYSTEM_READ = "filesystem:read"
    FILESYSTEM_WRITE = "filesystem:write"
    SECRETS_READ = "secrets:read"
    SECRETS_WRITE = "secrets:write"
    STORAGE_READ_WRITE = "storage:read_write"
    NOTIFICATION_SEND = "notification:send"
    AI_INFERENCE = "ai:inference"
    AI_TRAINING = "ai:training"
    WORKER_SPAWN = "worker:spawn"
    CLOUD_API_CALL = "cloud:api_call"
    API_INTERNAL = "api:internal"
    SHELL_EXECUTE = "shell:execute"
    AUDIT_READ = "audit:read"
    DATABASE_READ = "database:read_only"
    DATABASE_WRITE = "database:read_write"
    EVENT_PUBLISH = "event:publish"
    EVENT_SUBSCRIBE = "event:subscribe"
    METRICS_READ = "metrics:read"
    METRICS_WRITE = "metrics:write"

    @classmethod
    def all(cls) -> List[str]:
        """Return all permission constants."""
        return [v for k, v in cls.__dict__.items() if not k.startswith("_") and isinstance(v, str)]

    @classmethod
    def get_description(cls, permission: str) -> str:
        """Get a human-readable description for a permission."""
        descriptions = {
            cls.NETWORK_INTERNET: "Allow outbound internet connections",
            cls.NETWORK_RAW_SOCKETS: "Allow raw socket operations (requires root)",
            cls.NETWORK_LOCAL: "Allow local network connections",
            cls.FILESYSTEM_READ: "Allow reading files from the filesystem",
            cls.FILESYSTEM_WRITE: "Allow writing files to the filesystem",
            cls.SECRETS_READ: "Allow reading stored secrets/credentials",
            cls.SECRETS_WRITE: "Allow writing/updating secrets",
            cls.STORAGE_READ_WRITE: "Allow reading and writing to blob storage",
            cls.NOTIFICATION_SEND: "Allow sending notifications",
            cls.AI_INFERENCE: "Allow access to AI inference APIs",
            cls.AI_TRAINING: "Allow AI model training",
            cls.WORKER_SPAWN: "Allow spawning worker processes",
            cls.CLOUD_API_CALL: "Allow calling cloud provider APIs",
            cls.API_INTERNAL: "Allow accessing internal platform APIs",
            cls.SHELL_EXECUTE: "Allow executing shell commands",
            cls.AUDIT_READ: "Allow reading audit logs",
            cls.DATABASE_READ: "Allow read-only database access",
            cls.DATABASE_WRITE: "Allow read-write database access",
            cls.EVENT_PUBLISH: "Allow publishing events to the event bus",
            cls.EVENT_SUBSCRIBE: "Allow subscribing to events",
            cls.METRICS_READ: "Allow reading platform metrics",
            cls.METRICS_WRITE: "Allow writing custom metrics",
        }
        return descriptions.get(permission, f"Custom permission: {permission}")

    @classmethod
    def get_category(cls, permission: str) -> str:
        """Get the category for a permission."""
        categories = {
            "network": cls.NETWORK_INTERNET,
            "filesystem": cls.FILESYSTEM_READ,
            "secrets": cls.SECRETS_READ,
            "storage": cls.STORAGE_READ_WRITE,
            "notification": cls.NOTIFICATION_SEND,
            "ai": cls.AI_INFERENCE,
            "worker": cls.WORKER_SPAWN,
            "cloud": cls.CLOUD_API_CALL,
            "api": cls.API_INTERNAL,
            "shell": cls.SHELL_EXECUTE,
            "audit": cls.AUDIT_READ,
            "database": cls.DATABASE_READ,
            "event": cls.EVENT_PUBLISH,
            "metrics": cls.METRICS_READ,
        }
        for category, perm in categories.items():
            if permission.startswith(category):
                return category
        return "other"


class PermissionManager:
    """Manages plugin permissions with approval workflow."""

    def __init__(self):
        self._permissions: Dict[str, Dict[str, PluginPermissionState]] = {}
        self._change_handlers: List[Callable] = []

    # ── Events ─────────────────────────────────────────────────────────────

    def on_permission_change(self, callback: Callable) -> Callable:
        """Register a callback for permission changes.
        Returns an unsubscribe function."""
        self._change_handlers.append(callback)

        def unsubscribe():
            self._change_handlers.remove(callback)

        return unsubscribe

    # ── Permission Management ───────────────────────────────────────────────

    def register_permissions(
        self, plugin_id: str, requests: List[Dict[str, Any]]
    ) -> List[PluginPermissionState]:
        """Register a plugin's requested permissions.
        All start as 'pending' and need admin approval."""
        existing = self._permissions.get(plugin_id, {})

        states: List[PluginPermissionState] = []
        for req in requests:
            perm = req.get("permission", "")
            if not perm:
                continue
            state = PluginPermissionState(
                permission=perm,
                reason=req.get("reason", ""),
                required=req.get("required", False),
                status=PermissionStatus.PENDING,
            )
            existing[perm] = state
            states.append(state)

        self._permissions[plugin_id] = existing
        logger.info(
            f"[PERMISSIONS] Registered {len(states)} permission(s) "
            f"for '{plugin_id}' — awaiting admin approval"
        )
        return states

    def approve_permission(
        self, plugin_id: str, permission: str, approved_by: str
    ) -> bool:
        """Approve a specific permission for a plugin."""
        states = self._permissions.get(plugin_id)
        if not states:
            return False

        state = states.get(permission)
        if not state:
            return False

        state.status = PermissionStatus.APPROVED
        state.approved_by = approved_by
        state.approved_at = datetime.now(timezone.utc).isoformat()

        self._emit_change(plugin_id, permission, PermissionStatus.APPROVED)
        logger.info(f"[PERMISSIONS] Permission '{permission}' approved for '{plugin_id}'")
        return True

    def approve_all(self, plugin_id: str, approved_by: str) -> int:
        """Approve all pending permissions for a plugin. Returns count."""
        states = self._permissions.get(plugin_id)
        if not states:
            return 0

        count = 0
        for state in states.values():
            if state.status == PermissionStatus.PENDING:
                state.status = PermissionStatus.APPROVED
                state.approved_by = approved_by
                state.approved_at = datetime.now(timezone.utc).isoformat()
                count += 1

        if count > 0:
            self._emit_change(plugin_id, "*", PermissionStatus.APPROVED)
            logger.info(f"[PERMISSIONS] Bulk-approved {count} permission(s) for '{plugin_id}'")
        return count

    def deny_permission(
        self, plugin_id: str, permission: str, denied_by: str
    ) -> bool:
        """Deny a specific permission."""
        states = self._permissions.get(plugin_id)
        if not states:
            return False

        state = states.get(permission)
        if not state:
            return False

        state.status = PermissionStatus.DENIED
        state.denied_by = denied_by
        state.denied_at = datetime.now(timezone.utc).isoformat()

        self._emit_change(plugin_id, permission, PermissionStatus.DENIED)
        logger.warning(f"[PERMISSIONS] Permission '{permission}' DENIED for '{plugin_id}'")

        if state.required:
            logger.error(
                f"[PERMISSIONS] Plugin '{plugin_id}' cannot function "
                f"without required permission '{permission}'"
            )
        return True

    def revoke_permission(
        self, plugin_id: str, permission: str, revoked_by: str
    ) -> bool:
        """Revoke an approved permission."""
        states = self._permissions.get(plugin_id)
        if not states:
            return False

        state = states.get(permission)
        if not state or state.status != PermissionStatus.APPROVED:
            return False

        state.status = PermissionStatus.REVOKED
        state.revoked_by = revoked_by
        state.revoked_at = datetime.now(timezone.utc).isoformat()

        self._emit_change(plugin_id, permission, PermissionStatus.REVOKED)
        logger.warning(f"[PERMISSIONS] Permission '{permission}' REVOKED for '{plugin_id}'")
        return True

    # ── Queries ─────────────────────────────────────────────────────────────

    def has_permission(self, plugin_id: str, permission: str) -> bool:
        """Check if a plugin has a specific approved permission."""
        states = self._permissions.get(plugin_id)
        if not states:
            return False
        state = states.get(permission)
        return state is not None and state.status == PermissionStatus.APPROVED

    def get_permissions(self, plugin_id: str) -> List[PluginPermissionState]:
        """Get all permission states for a plugin."""
        states = self._permissions.get(plugin_id)
        if not states:
            return []
        return list(states.values())

    def get_pending(self) -> List[Dict[str, Any]]:
        """Get all pending permissions across all plugins (for admin dashboard)."""
        pending = []
        for plugin_id, states in self._permissions.items():
            pending_states = [s for s in states.values() if s.status == PermissionStatus.PENDING]
            if pending_states:
                pending.append({
                    "plugin_id": plugin_id,
                    "permissions": [s.__dict__ for s in pending_states],
                })
        return pending

    def are_required_approved(self, plugin_id: str) -> bool:
        """Check if all required permissions are approved for a plugin."""
        states = self._permissions.get(plugin_id)
        if not states:
            return False
        return all(
            s.status == PermissionStatus.APPROVED
            for s in states.values()
            if s.required
        )

    def remove_plugin(self, plugin_id: str) -> None:
        """Remove all permissions for a plugin (on uninstall)."""
        self._permissions.pop(plugin_id, None)
        logger.info(f"[PERMISSIONS] All permissions removed for '{plugin_id}'")

    def get_stats(self) -> Dict[str, int]:
        """Get permission statistics."""
        stats = {"total": 0, "approved": 0, "pending": 0, "denied": 0, "revoked": 0}
        for states in self._permissions.values():
            for state in states.values():
                stats["total"] += 1
                if state.status in stats:
                    stats[state.status] += 1
        return stats

    # ── Internal ───────────────────────────────────────────────────────────

    def _emit_change(
        self, plugin_id: str, permission: str, status: str
    ) -> None:
        """Notify permission change handlers."""
        event = {
            "plugin_id": plugin_id,
            "permission": permission,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for handler in list(self._change_handlers):
            try:
                handler(event)
            except Exception as e:
                logger.error(f"[PERMISSIONS] Change handler error: {e}")

    def reset(self) -> None:
        """Clear all permissions (for testing)."""
        self._permissions.clear()


# ── Singleton ───────────────────────────────────────────────────────────────

permission_manager = PermissionManager()
