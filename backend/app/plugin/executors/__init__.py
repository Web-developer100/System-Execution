"""
Plugin Executors — Isolated execution environments.

Supports:
  - Docker / Podman containers
  - Kubernetes Jobs
  - Subprocess (firecracker-like isolated processes)
  - Remote workers
  - Dedicated workers

Every execution enforces CPU limits, memory limits, disk limits,
network restrictions, timeouts, and automatic cleanup.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Type

from app.plugin.sdk.context import PluginExecutionContext, PluginExecutionResult
from app.plugin.sdk.manifest import ResourceLimits, SecurityProfile

logger = logging.getLogger(__name__)


class ExecutorType(str, Enum):
    DOCKER = "docker"
    PODMAN = "podman"
    KUBERNETES = "kubernetes"
    SUBPROCESS = "subprocess"
    FIRECRACKER = "firecracker"
    REMOTE = "remote"
    DEDICATED = "dedicated"


@dataclass
class ExecutorConfig:
    """Configuration for an executor."""
    type: ExecutorType = ExecutorType.SUBPROCESS
    cpu_limit: str = "1"        # e.g. "1", "500m"
    memory_limit: str = "512m"  # e.g. "512m", "2g"
    disk_limit: int = 104857600  # 100MB
    network_allowed: bool = False
    internet_allowed: bool = False
    timeout: int = 300
    max_stdout: int = 10485760   # 10MB
    max_stderr: int = 1048576    # 1MB
    read_only_rootfs: bool = True
    tmpfs_size: str = "64m"
    run_as_non_root: bool = True
    drop_capabilities: List[str] = field(default_factory=lambda: ["ALL"])
    seccomp_profile: str = "default"
    app_armor_profile: str = "default"
    working_dir: str = "/tmp/plugins"
    cleanup_on_exit: bool = True
    env_vars: Dict[str, str] = field(default_factory=dict)


class ExecutorResult:
    """Result from an executor.
    This is different from PluginExecutionResult — it's the raw container/process result.
    """
    def __init__(
        self,
        success: bool = False,
        exit_code: int = -1,
        stdout: str = "",
        stderr: str = "",
        duration_ms: int = 0,
        memory_usage_mb: float = 0.0,
        cpu_usage_percent: float = 0.0,
        error_message: Optional[str] = None,
    ):
        self.success = success
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr
        self.duration_ms = duration_ms
        self.memory_usage_mb = memory_usage_mb
        self.cpu_usage_percent = cpu_usage_percent
        self.error_message = error_message


class PluginExecutor(ABC):
    """Abstract base class for all executors."""

    def __init__(self, config: Optional[ExecutorConfig] = None):
        self.config = config or ExecutorConfig()

    @abstractmethod
    async def execute(
        self,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
    ) -> ExecutorResult:
        """Execute a plugin in an isolated environment.
        
        Args:
            plugin_dir: Path to the installed plugin directory
            entry_point: Plugin entry point (e.g., "main.py", "index.js")
            ctx: Execution context with target, config, environment
            
        Returns:
            ExecutorResult with output, exit code, and performance metrics
        """
        ...

    @abstractmethod
    async def validate_environment(self) -> Dict[str, Any]:
        """Validate that the execution environment is available.
        Returns dict with 'available' bool and 'message' string.
        """
        ...

    async def cleanup(self, plugin_dir: str) -> None:
        """Clean up temporary files after execution."""
        import shutil
        if self.config.cleanup_on_exit and os.path.isdir(plugin_dir):
            try:
                shutil.rmtree(plugin_dir, ignore_errors=True)
            except Exception as e:
                logger.warning(f"[EXECUTOR] Cleanup error: {e}")

    def _build_env(
        self, ctx: PluginExecutionContext, extra: Optional[Dict[str, str]] = None
    ) -> Dict[str, str]:
        """Build environment variables for execution."""
        env = {
            "V8_TARGET": ctx.target,
            "V8_TARGET_TYPE": ctx.target_type,
            "V8_SCAN_ID": ctx.scan_id,
            "V8_TIMEOUT": str(ctx.timeout),
            "V8_MAX_STDOUT": str(ctx.max_stdout),
            "V8_MAX_STDERR": str(ctx.max_stderr),
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": "/tmp",
        }
        if ctx.organization_id:
            env["V8_ORGANIZATION_ID"] = ctx.organization_id
        if ctx.proxy_url:
            env["HTTP_PROXY"] = ctx.proxy_url
            env["HTTPS_PROXY"] = ctx.proxy_url
        if extra:
            env.update(extra)
        env.update(ctx.environment)
        return env


class ExecutorRegistry:
    """Registry of executor implementations."""

    def __init__(self):
        self._executors: Dict[ExecutorType, Type[PluginExecutor]] = {}

    def register(self, executor_type: ExecutorType, executor_cls: Type[PluginExecutor]) -> None:
        """Register an executor type."""
        self._executors[executor_type] = executor_cls
        logger.info(f"[EXECUTOR-REGISTRY] Registered executor: {executor_type.value}")

    def get(self, executor_type: ExecutorType, **kwargs) -> Optional[PluginExecutor]:
        """Get an executor instance by type."""
        cls = self._executors.get(executor_type)
        if not cls:
            logger.error(f"[EXECUTOR-REGISTRY] No executor registered for: {executor_type.value}")
            return None
        config = ExecutorConfig(type=executor_type, **kwargs)
        return cls(config=config)

    def get_available(self) -> List[ExecutorType]:
        """Get all registered executor types."""
        return list(self._executors.keys())

    def get_best_available(self) -> ExecutorType:
        """Auto-detect the best available executor."""
        # Check Docker first, then Podman, then subprocess
        import shutil
        if shutil.which("docker"):
            return ExecutorType.DOCKER
        if shutil.which("podman"):
            return ExecutorType.PODMAN
        if shutil.which("kubectl"):
            return ExecutorType.KUBERNETES
        return ExecutorType.SUBPROCESS


# ── Global registry ─────────────────────────────────────────────────────────

executor_registry = ExecutorRegistry()
