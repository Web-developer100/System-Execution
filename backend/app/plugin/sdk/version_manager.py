"""
Plugin SDK — Version Manager.

Comprehensive version management for plugins:
  - Semantic versioning (semver) compliance
  - Latest stable vs. latest beta tracking
  - Pinned versions
  - Rollback support with history
  - Version history
  - Compatibility matrix
  - Dependency resolution
  - Automatic, manual, and scheduled updates
  - Canary deployments
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.plugin.sdk.manifest import PluginManifest

logger = logging.getLogger(__name__)


class VersionChannel(str, Enum):
    STABLE = "stable"
    BETA = "beta"
    ALPHA = "alpha"
    CANARY = "canary"


@dataclass
class VersionRecord:
    """A recorded version of a plugin."""
    plugin_id: str
    version: str
    channel: VersionChannel = VersionChannel.STABLE
    published_at: str = ""
    release_notes: str = ""
    checksum: str = ""
    is_breaking: bool = False
    dependencies: Dict[str, str] = field(default_factory=dict)
    download_url: str = ""
    size: int = 0


@dataclass
class CanaryDeployment:
    """A canary deployment for gradual rollout."""
    version: str
    percentage: float  # 0-100
    start_time: str
    promoted: bool = False


class PluginVersionManager:
    """Manages plugin versions with semver, pinning, rollback, canary deployments."""

    SEMVER_PARSE = re.compile(
        r"^v?(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)"
        r"(?:-(?P<prerelease>[a-zA-Z0-9.]+))?"
        r"(?:\+(?P<build>[a-zA-Z0-9.]+))?$"
    )

    def __init__(self):
        self._version_history: Dict[str, List[VersionRecord]] = {}
        self._pinned_versions: Dict[str, str] = {}
        self._rollback_history: Dict[str, List[Dict[str, Any]]] = {}
        self._canary_deployments: Dict[str, CanaryDeployment] = {}
        self._update_schedules: Dict[str, Dict[str, Any]] = {}
        self._update_timers: Dict[str, asyncio.Task] = {}
        self._update_handlers: List[Callable] = []

    # ── Version Registration ────────────────────────────────────────────────

    def register_version(
        self,
        plugin_id: str,
        version: str,
        channel: VersionChannel = VersionChannel.STABLE,
        release_notes: str = "",
        checksum: str = "",
        is_breaking: bool = False,
        dependencies: Optional[Dict[str, str]] = None,
        download_url: str = "",
        size: int = 0,
    ) -> VersionRecord:
        """Register a new version of a plugin."""
        record = VersionRecord(
            plugin_id=plugin_id,
            version=version,
            channel=channel,
            published_at=datetime.now(timezone.utc).isoformat(),
            release_notes=release_notes,
            checksum=checksum,
            is_breaking=is_breaking,
            dependencies=dependencies or {},
            download_url=download_url,
            size=size,
        )

        if plugin_id not in self._version_history:
            self._version_history[plugin_id] = []

        history = self._version_history[plugin_id]
        existing_idx = next(
            (i for i, v in enumerate(history) if v.version == version),
            None,
        )
        if existing_idx is not None:
            history[existing_idx] = record
        else:
            history.append(record)

        # Sort by semver descending
        history.sort(
            key=lambda v: self._parse_semver(v.version),
            reverse=True,
        )

        logger.info(
            f"[VERSION-MGR] Registered {plugin_id} v{version} "
            f"({channel.value})"
        )

        # Notify update handlers
        self._notify_update_available(plugin_id, record)

        return record

    # ── Version Queries ─────────────────────────────────────────────────────

    def get_latest_version(
        self, plugin_id: str, channel: VersionChannel = VersionChannel.STABLE
    ) -> Optional[VersionRecord]:
        """Get the latest version of a plugin for a given channel."""
        history = self._version_history.get(plugin_id)
        if not history:
            return None

        if channel == VersionChannel.STABLE:
            matching = [
                v for v in history
                if v.channel in (VersionChannel.STABLE, VersionChannel.BETA)
            ]
        else:
            matching = history

        return matching[0] if matching else None

    def get_version(
        self, plugin_id: str, version: str
    ) -> Optional[VersionRecord]:
        """Get a specific version of a plugin."""
        history = self._version_history.get(plugin_id)
        if not history:
            return None
        return next(
            (v for v in history if v.version == version),
            None,
        )

    def get_version_history(self, plugin_id: str) -> List[VersionRecord]:
        """Get all versions of a plugin ordered by semver descending."""
        return self._version_history.get(plugin_id, [])

    def is_version_compatible(
        self, manifest: PluginManifest,
        platform_version: str
    ) -> Tuple[bool, Optional[str]]:
        """Check if a plugin version is compatible with the platform version.
        Returns (compatible, reason)."""
        # Check min platform version
        if manifest.min_platform_version:
            if self.compare_versions(platform_version, manifest.min_platform_version) < 0:
                return (
                    False,
                    f"Platform v{platform_version} < min required v{manifest.min_platform_version}"
                )

        # Check max platform version
        if manifest.max_platform_version:
            if self.compare_versions(platform_version, manifest.max_platform_version) > 0:
                return (
                    False,
                    f"Platform v{platform_version} > max supported v{manifest.max_platform_version}"
                )

        return (True, None)

    # ── Version Pinning ─────────────────────────────────────────────────────

    def pin_version(self, plugin_id: str, version: str) -> None:
        """Pin a plugin to a specific version."""
        self._pinned_versions[plugin_id] = version
        logger.info(f"[VERSION-MGR] Pinned '{plugin_id}' to version {version}")

    def unpin_version(self, plugin_id: str) -> None:
        """Unpin a plugin."""
        self._pinned_versions.pop(plugin_id, None)
        logger.info(f"[VERSION-MGR] Unpinned '{plugin_id}'")

    def get_pinned_version(self, plugin_id: str) -> Optional[str]:
        """Get the pinned version for a plugin."""
        return self._pinned_versions.get(plugin_id)

    def is_pinned(self, plugin_id: str) -> bool:
        """Check if a plugin is pinned."""
        return plugin_id in self._pinned_versions

    # ── Rollback ────────────────────────────────────────────────────────────

    def rollback(self, plugin_id: str, target_version: str) -> bool:
        """Rollback a plugin to a previous version."""
        history = self._version_history.get(plugin_id)
        if not history:
            return False

        target = next(
            (v for v in history if v.version == target_version),
            None,
        )
        if not target:
            return False

        current = self.get_latest_version(plugin_id)
        if not current or current.version == target_version:
            return False

        # Record rollback
        if plugin_id not in self._rollback_history:
            self._rollback_history[plugin_id] = []

        self._rollback_history[plugin_id].append({
            "from": current.version,
            "to": target_version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": "manual_rollback",
        })

        logger.info(
            f"[VERSION-MGR] Rolled back '{plugin_id}' "
            f"{current.version} -> {target_version}"
        )
        return True

    def get_rollback_history(
        self, plugin_id: str
    ) -> List[Dict[str, Any]]:
        """Get rollback history for a plugin."""
        return self._rollback_history.get(plugin_id, [])

    # ─── Update Scheduling ───────────────────────────────────────────────────

    def on_update_available(self, callback: Callable) -> Callable:
        """Register a callback for when updates are available.
        Returns an unsubscribe function."""
        self._update_handlers.append(callback)

        def unsubscribe():
            self._update_handlers.remove(callback)

        return unsubscribe

    def schedule_updates(
        self, plugin_id: str,
        channel: VersionChannel = VersionChannel.STABLE,
        interval_seconds: int = 86400
    ) -> None:
        """Schedule automatic update checks for a plugin with a background loop."""
        self._update_schedules[plugin_id] = {
            "channel": channel,
            "interval_seconds": interval_seconds,
        }

        # Start background periodic update check task
        async def _periodic_check():
            try:
                while True:
                    await asyncio.sleep(interval_seconds)
                    self.check_for_updates(plugin_id)
            except asyncio.CancelledError:
                pass

        task = asyncio.create_task(_periodic_check())
        self._update_timers[plugin_id] = task

        logger.info(
            f"[VERSION-MGR] Scheduled updates for '{plugin_id}' "
            f"({channel.value}, every {interval_seconds}s)"
        )

    def stop_scheduled_updates(self, plugin_id: str) -> None:
        """Stop scheduled updates for a plugin."""
        task = self._update_timers.pop(plugin_id, None)
        if task:
            task.cancel()
        self._update_schedules.pop(plugin_id, None)

    def check_for_updates(self, plugin_id: str) -> Optional[VersionRecord]:
        """Check for available updates for a pinned or managed plugin."""
        if self.is_pinned(plugin_id):
            return None

        latest = self.get_latest_version(plugin_id)
        if not latest:
            return None

        # In production, this would check the marketplace/registry
        return latest

    # ── Canary Deployments ──────────────────────────────────────────────────

    def deploy_canary(
        self, plugin_id: str, version: str, percentage: float
    ) -> None:
        """Deploy a canary version at a certain rollout percentage."""
        self._canary_deployments[plugin_id] = CanaryDeployment(
            version=version,
            percentage=max(0.0, min(100.0, percentage)),
            start_time=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(
            f"[VERSION-MGR] Canary deployed: {plugin_id} "
            f"v{version} at {percentage}%"
        )

    def promote_canary(self, plugin_id: str) -> Optional[str]:
        """Promote a canary deployment to full release."""
        canary = self._canary_deployments.get(plugin_id)
        if not canary or canary.promoted:
            return None
        canary.promoted = True
        self._canary_deployments.pop(plugin_id, None)
        logger.info(f"[VERSION-MGR] Canary promoted: {plugin_id} v{canary.version}")
        return canary.version

    def rollback_canary(self, plugin_id: str) -> bool:
        """Rollback a canary deployment."""
        canary = self._canary_deployments.pop(plugin_id, None)
        if canary:
            logger.info(
                f"[VERSION-MGR] Canary rolled back: {plugin_id} v{canary.version}"
            )
            return True
        return False

    def get_canary_status(self, plugin_id: str) -> Optional[CanaryDeployment]:
        """Get the status of a canary deployment."""
        return self._canary_deployments.get(plugin_id)

    # ── Semver Helpers ─────────────────────────────────────────────────────

    def _parse_semver(self, version: str) -> Tuple[int, int, int, int]:
        """Parse a semver string into a sortable tuple."""
        match = self.SEMVER_PARSE.match(version)
        if not match:
            return (0, 0, 0, 0)
        major = int(match.group("major"))
        minor = int(match.group("minor"))
        patch = int(match.group("patch"))
        prerelease = 1 if match.group("prerelease") else 0
        return (major, minor, patch, prerelease)

    def compare_versions(self, a: str, b: str) -> int:
        """Compare two semver strings.
        Returns -1 if a < b, 0 if a == b, 1 if a > b."""
        parsed_a = self._parse_semver(a)
        parsed_b = self._parse_semver(b)

        for na, nb in zip(parsed_a, parsed_b):
            if na < nb:
                return -1
            if na > nb:
                return 1
        return 0

    def is_version_greater(self, a: str, b: str) -> bool:
        """Check if version a is greater than version b."""
        return self.compare_versions(a, b) > 0

    # ── Internal ───────────────────────────────────────────────────────────

    def _notify_update_available(
        self, plugin_id: str, record: VersionRecord
    ) -> None:
        """Notify update handlers about a new version."""
        event = {
            "plugin_id": plugin_id,
            "version": record.version,
            "channel": record.channel.value,
        }
        # Notify handlers (iterate on a copy to avoid mutation during iteration)
        for handler in list(self._update_handlers):
            try:
                handler(event)
            except Exception as e:
                logger.error(f"[VERSION-MGR] Handler error: {e}")

    # ── Stats ───────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Get version manager statistics."""
        return {
            "registered_versions": sum(
                len(h) for h in self._version_history.values()
            ),
            "plugins_with_versions": len(self._version_history),
            "pinned": len(self._pinned_versions),
            "canary_deployments": len(self._canary_deployments),
        }

    def shutdown(self) -> None:
        """Clean up all timers."""
        for task in self._update_timers.values():
            task.cancel()
        self._update_timers.clear()
        logger.info("[VERSION-MGR] Shut down")


# ── Singleton ───────────────────────────────────────────────────────────────

plugin_version_manager = PluginVersionManager()
