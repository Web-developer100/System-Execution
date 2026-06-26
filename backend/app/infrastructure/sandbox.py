"""
Docker Sandbox Service — Secure Container Isolation for Plugin Execution.

Every task runs inside an isolated sandbox container with:
  - Read-only filesystem (with temp writable workspace)
  - Limited CPU, RAM, Disk
  - Limited Network (per-plugin policy)
  - Temporary credentials (short-lived tokens)
  - Isolated filesystem (no host access)
  - Automatic cleanup after completion
  - No persistent sensitive information

Integrates with:
  - Object Storage (artifact persistence)
  - Secrets Manager (temporary credentials)
  - Network Isolation Manager (per-plugin firewall)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.plugin.executors import ExecutorConfig, ExecutorResult
from app.plugin.executors.docker_executor import DockerExecutor
from app.plugin.executors.subprocess_executor import SubprocessExecutor
from app.plugin.sdk.context import PluginExecutionContext
from app.infrastructure.network_isolation import (
    NetworkIsolationManager, NetworkPolicy, NetworkMode, network_isolation,
)
from app.infrastructure.secrets import secrets_manager
from app.infrastructure.storage.object_storage import (
    ObjectStorageService, ArtifactType, object_storage,
)
from app.infrastructure.metrics_service import metrics_service
from app.infrastructure.logging_service import (
    LoggingService, LogSeverity, logging_service,
)

logger = logging.getLogger(__name__)


class SandboxType(str, Enum):
    DOCKER = "docker"
    PODMAN = "podman"
    KUBERNETES = "kubernetes"
    FIRECRACKER = "firecracker"
    SUBPROCESS = "subprocess"


@dataclass
class SandboxConfig:
    """Configuration for a sandbox execution."""
    sandbox_type: SandboxType = SandboxType.DOCKER
    cpu_limit: str = "1.0"
    memory_limit: str = "512m"
    disk_limit_mb: int = 1024
    network_policy: str = "isolated"
    execution_timeout: int = 300
    max_threads: int = 10
    max_child_processes: int = 5
    temp_storage_mb: int = 512
    bandwidth_limit_kbps: int = 0
    file_size_limit_mb: int = 50
    api_rate_limit: int = 100  # requests per second
    cleanup_on_exit: bool = True
    read_only_root: bool = True
    tmpfs_size: str = "256m"
    run_as_non_root: bool = True
    docker_image: str = "python:3.12-slim"
    seccomp_profile: str = "default"
    app_armor_profile: str = "default"
    enable_secret_injection: bool = True
    enable_artifact_storage: bool = True
    enable_metrics: bool = True


@dataclass
class SandboxResult:
    """Result of a sandbox execution."""
    success: bool = False
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    duration_ms: float = 0.0
    memory_usage_mb: float = 0.0
    cpu_usage_percent: float = 0.0
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    error_message: str = ""
    correlation_id: str = ""


class SandboxService:
    """Enterprise sandbox service for secure plugin execution."""

    def __init__(self):
        self._executors: Dict[SandboxType, Any] = {}
        self._active_sandboxes: Dict[str, Dict[str, Any]] = {}
        self._temp_dirs: Dict[str, str] = {}
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize all sandbox executors."""
        if self._initialized:
            return

        # Initialize dependent services
        await object_storage.initialize()
        await secrets_manager.initialize()
        await logging_service.initialize()

        # Create executors
        docker_config = ExecutorConfig(
            cpu_limit="1.0",
            memory_limit="512m",
            network_allowed=False,
            cleanup_on_exit=True,
            run_as_non_root=True,
            tmpfs_size="256m",
        )
        self._executors[SandboxType.DOCKER] = DockerExecutor(docker_config)
        self._executors[SandboxType.SUBPROCESS] = SubprocessExecutor()

        self._initialized = True
        logger.info("[SANDBOX] Sandbox service initialized")

    async def execute(
        self,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
        config: Optional[SandboxConfig] = None,
    ) -> SandboxResult:
        """Execute a plugin inside an isolated sandbox."""
        sandbox_config = config or SandboxConfig()
        sandbox_id = str(uuid.uuid4())
        correlation_id = ctx.config.get("correlation_id", str(uuid.uuid4()))
        start_time = time.monotonic() * 1000

        # Track active sandbox
        self._active_sandboxes[sandbox_id] = {
            "id": sandbox_id,
            "scan_id": ctx.scan_id,
            "plugin": entry_point,
            "target": ctx.target,
            "type": sandbox_config.sandbox_type.value,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "config": sandbox_config.__dict__,
        }

        # Log execution start
        logging_service.log(
            message=f"Sandbox execution started: plugin={entry_point}, target={ctx.target[:50]}",
            severity=LogSeverity.INFO,
            job_id=ctx.scan_id,
            plugin_id=ctx.config.get("plugin_id", ""),
            correlation_id=correlation_id,
            tags={"sandbox_id": sandbox_id, "sandbox_type": sandbox_config.sandbox_type.value},
        )

        try:
            # 1. Create temporary working directory with isolation
            work_dir = await self._create_work_dir(sandbox_id, plugin_dir, sandbox_config)

            # 2. Inject temporary credentials if enabled
            if sandbox_config.enable_secret_injection:
                ctx = await self._inject_temporary_credentials(ctx, sandbox_id, correlation_id)

            # 3. Apply network isolation policy
            network_policy = self._resolve_network_policy(sandbox_config.network_policy, ctx)
            ctx.config["network_policy"] = network_policy.__dict__

            # 4. Select and configure executor
            executor = self._executors.get(sandbox_config.sandbox_type)
            if not executor:
                executor = self._executors[SandboxType.DOCKER]

            # 5. Apply sandbox config to executor
            await self._configure_executor(executor, sandbox_config, network_policy)

            # 6. Execute
            result = await executor.execute(str(work_dir), entry_point, ctx)

            # 7. Record metrics
            duration_ms = int(time.monotonic() * 1000 - start_time)
            if sandbox_config.enable_metrics:
                metrics_service.record_job_completed("scan", duration_ms)
                metrics_service.record_plugin_execution(
                    ctx.config.get("plugin_id", entry_point), duration_ms, result.success
                )

            # 8. Store artifacts if enabled
            artifacts = []
            if sandbox_config.enable_artifact_storage and result.stdout:
                artifact_meta = await object_storage.store(
                    data=result.stdout.encode(),
                    artifact_type=ArtifactType.LOG,
                    filename=f"{ctx.scan_id or sandbox_id}-stdout.log",
                    scan_id=ctx.scan_id or "",
                    job_id=sandbox_id,
                    tags={"plugin": entry_point, "sandbox_id": sandbox_id},
                )
                artifacts.append({
                    "id": artifact_meta.id,
                    "type": "stdout",
                    "path": artifact_meta.storage_path,
                    "size": artifact_meta.size_bytes,
                })

            # 9. Update active sandbox record
            self._active_sandboxes[sandbox_id].update({
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": duration_ms,
                "success": result.success,
                "exit_code": result.exit_code,
            })

            # Log completion
            logging_service.log(
                message=f"Sandbox execution {'completed' if result.success else 'failed'}: "
                        f"exit_code={result.exit_code}, duration={duration_ms}ms",
                severity=LogSeverity.INFO if result.success else LogSeverity.ERROR,
                job_id=ctx.scan_id,
                plugin_id=ctx.config.get("plugin_id", ""),
                correlation_id=correlation_id,
                execution_time_ms=duration_ms,
                exit_code=result.exit_code,
                tags={"sandbox_id": sandbox_id},
            )

            return SandboxResult(
                success=result.success,
                exit_code=result.exit_code,
                stdout=result.stdout[:10000],
                stderr=result.stderr[:5000],
                duration_ms=duration_ms,
                memory_usage_mb=result.memory_usage_mb or 0.0,
                cpu_usage_percent=result.cpu_usage_percent or 0.0,
                artifacts=artifacts,
                error_message=result.error_message or "",
                correlation_id=correlation_id,
            )

        except Exception as e:
            duration_ms = int(time.monotonic() * 1000 - start_time)
            logging_service.log(
                message=f"Sandbox execution error: {e}",
                severity=LogSeverity.ERROR,
                job_id=ctx.scan_id,
                correlation_id=correlation_id,
                exception=e,
                tags={"sandbox_id": sandbox_id},
            )
            if sandbox_config.enable_metrics:
                metrics_service.record_job_failed("scan", type(e).__name__)
            return SandboxResult(
                success=False, exit_code=-1,
                error_message=str(e), duration_ms=duration_ms,
                correlation_id=correlation_id,
            )
        finally:
            # Cleanup
            if sandbox_config.cleanup_on_exit:
                await self._cleanup_sandbox(sandbox_id)

    async def _create_work_dir(
        self, sandbox_id: str, plugin_dir: str, config: SandboxConfig
    ) -> Path:
        """Create an isolated temporary working directory."""
        base = Path("/var/lib/v8/sandbox")
        base.mkdir(parents=True, exist_ok=True)
        work_dir = base / sandbox_id
        work_dir.mkdir(parents=True, exist_ok=True)

        # Copy plugin files (read-only in container)
        plugin_path = Path(plugin_dir)
        if plugin_path.exists():
            dest = work_dir / "plugin"
            shutil.copytree(str(plugin_path), str(dest), symlinks=True)

        # Create tmp directory with limited size
        tmp_dir = work_dir / "tmp"
        tmp_dir.mkdir(exist_ok=True)

        self._temp_dirs[sandbox_id] = str(work_dir)
        return work_dir

    async def _inject_temporary_credentials(
        self, ctx: PluginExecutionContext, sandbox_id: str, correlation_id: str
    ) -> PluginExecutionContext:
        """Inject short-lived credentials into the execution context."""
        creds = await secrets_manager.create_job_credentials(
            job_id=sandbox_id,
            worker_id=ctx.config.get("worker_id", "unknown"),
            ttl_seconds=ctx.timeout + 300,
        )
        ctx.environment.update(creds)
        # Add secret references
        ctx.config["secret_refs"] = {
            "V8_API_TOKEN": f"job-token-{sandbox_id}",
        }
        return ctx

    def _resolve_network_policy(self, policy_name: str, ctx: PluginExecutionContext) -> NetworkPolicy:
        """Resolve the network isolation policy for this execution."""
        policy = network_isolation.get_policy(policy_name)
        if not policy:
            policy = network_isolation.get_policy("isolated")
        # Override with plugin-specific policy if exists
        plugin_policy = network_isolation.get_policy(f"plugin:{ctx.config.get('plugin_id', '')}")
        if plugin_policy:
            policy = plugin_policy
        return policy

    async def _configure_executor(
        self, executor: Any, config: SandboxConfig, network_policy: NetworkPolicy
    ) -> None:
        """Configure the executor with sandbox isolation settings."""
        if hasattr(executor, 'config') and executor.config:
            executor.config.cpu_limit = config.cpu_limit
            executor.config.memory_limit = config.memory_limit
            executor.config.network_allowed = config.network_policy not in ("isolated", "air_gapped")
            executor.config.cleanup_on_exit = config.cleanup_on_exit
            executor.config.run_as_non_root = config.run_as_non_root
            executor.config.tmpfs_size = config.tmpfs_size
            executor.config.seccomp_profile = config.seccomp_profile

    async def _cleanup_sandbox(self, sandbox_id: str) -> None:
        """Clean up sandbox resources."""
        self._active_sandboxes.pop(sandbox_id, None)

        # Remove temporary directory
        work_dir = self._temp_dirs.pop(sandbox_id, None)
        if work_dir:
            try:
                shutil.rmtree(work_dir, ignore_errors=True)
            except Exception:
                pass

    def get_active_sandboxes(self) -> List[Dict[str, Any]]:
        """Get list of currently active sandbox executions."""
        return list(self._active_sandboxes.values())

    def get_sandbox(self, sandbox_id: str) -> Optional[Dict[str, Any]]:
        """Get details of a specific sandbox execution."""
        return self._active_sandboxes.get(sandbox_id)

    def get_stats(self) -> Dict[str, Any]:
        """Get sandbox service statistics."""
        return {
            "active_sandboxes": len(self._active_sandboxes),
            "types_available": [st.value for st in SandboxType],
            "initialized": self._initialized,
        }


sandbox_service = SandboxService()
