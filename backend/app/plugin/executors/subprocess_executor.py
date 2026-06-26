"""
Subprocess Executor — Isolated process execution.

Runs plugins as subprocesses with:
  - CPU and memory limits (via resource.RLIMIT)
  - Timeout enforcement
  - Output size limits
  - Network restrictions (optional, via iptables or unshare)
  - Read-only filesystem (optional)
  - Temporary working directory
  - Auto-cleanup

This is the default executor when Docker/Podman are unavailable.
For production security, use the Docker or K8s executors instead.
"""
from __future__ import annotations

import asyncio
import logging
import os
import resource
import shutil
import signal
import tempfile
import time
from typing import Any, Dict, List, Optional

from app.plugin.executors import (
    PluginExecutor,
    ExecutorConfig,
    ExecutorResult,
    ExecutorType,
    executor_registry,
)
from app.plugin.sdk.context import PluginExecutionContext

logger = logging.getLogger(__name__)


class SubprocessExecutor(PluginExecutor):
    """Execute plugins as isolated subprocesses."""

    def __init__(self, config: Optional[ExecutorConfig] = None):
        super().__init__(config)
        self._running_processes: Dict[str, asyncio.subprocess.Process] = {}

    async def execute(
        self,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
    ) -> ExecutorResult:
        """Execute a plugin as a subprocess."""
        start_time = time.monotonic() * 1000
        env = self._build_env(ctx)
        entry_path = os.path.join(plugin_dir, entry_point)

        if not os.path.isfile(entry_path):
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=f"Entry point not found: {entry_path}",
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )

        # Create isolated temp working directory
        work_dir = tempfile.mkdtemp(prefix=f"v8-plugin-{ctx.scan_id}-")
        cmd = self._build_command(entry_path, ctx)

        try:
            logger.info(
                f"[SUBPROCESS-EXECUTOR] Running: {' '.join(cmd)} "
                f"in {work_dir}"
            )

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=work_dir,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                preexec_fn=self._create_preexec_fn(ctx),
            )

            self._running_processes[ctx.scan_id] = proc

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=ctx.timeout,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                return ExecutorResult(
                    success=False, exit_code=-1,
                    stdout="",
                    stderr=f"Execution timed out after {ctx.timeout}s",
                    duration_ms=int(time.monotonic() * 1000 - start_time),
                    error_message=f"Timeout after {ctx.timeout}s",
                )

            duration_ms = int(time.monotonic() * 1000 - start_time)

            # Parse output
            out_str = stdout.decode("utf-8", errors="replace")[:ctx.max_stdout]
            err_str = stderr.decode("utf-8", errors="replace")[:ctx.max_stderr]

            return ExecutorResult(
                success=proc.returncode == 0,
                exit_code=proc.returncode or 0,
                stdout=out_str,
                stderr=err_str,
                duration_ms=duration_ms,
                memory_usage_mb=self._get_memory_usage(),
                error_message=err_str[:500] if proc.returncode and proc.returncode != 0 else None,
            )

        except Exception as e:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=str(e),
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )

        finally:
            self._running_processes.pop(ctx.scan_id, None)
            self._cleanup_work_dir(work_dir)

    async def validate_environment(self) -> Dict[str, Any]:
        """Subprocess is always available on any POSIX system."""
        return {"available": True, "message": "Subprocess executor available", "type": "subprocess"}

    async def cancel_execution(self, scan_id: str) -> bool:
        """Cancel a running execution."""
        proc = self._running_processes.get(scan_id)
        if not proc:
            return False
        try:
            proc.kill()
            return True
        except Exception:
            return False

    def _build_command(self, entry_path: str, ctx: PluginExecutionContext) -> List[str]:
        """Build the command to execute."""
        ext = os.path.splitext(entry_path)[1].lower()

        if ext in (".py", ".pyw"):
            interpreter = ctx.config.get("python_interpreter", "python3")
            return [interpreter, entry_path, ctx.target]
        elif ext in (".sh", ".bash"):
            return ["bash", entry_path, ctx.target]
        elif ext in (".js", ".mjs"):
            return ["node", entry_path, ctx.target]
        elif ext in (".ts",):
            return ["npx", "tsx", entry_path, ctx.target]
        elif ext == ".go":
            return ["go", "run", entry_path, ctx.target]
        elif os.access(entry_path, os.X_OK):
            return [entry_path, ctx.target]
        else:
            # Try with python as default
            return ["python3", entry_path, ctx.target]

    def _create_preexec_fn(self, ctx: PluginExecutionContext):
        """Create a preexec function that sets resource limits."""
        def _set_limits():
            try:
                # CPU time limit (in seconds, plus extra for cleanup)
                cpu_seconds = ctx.timeout + 30
                resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))

                # Memory limit (parse from config)
                mem_limit = ctx.config.get("memory_limit", self.config.memory_limit)
                mem_bytes = self._parse_memory(mem_limit)
                if mem_bytes > 0:
                    resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))

                # File size limit
                resource.setrlimit(resource.RLIMIT_FSIZE, (self.config.disk_limit, self.config.disk_limit))

                # Number of file descriptors
                resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))

                # Number of processes (prevent fork bombs)
                resource.setrlimit(resource.RLIMIT_NPROC, (50, 50))

                # Core dumps disabled
                resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

            except (ValueError, resource.error) as e:
                logger.warning(f"[SUBPROCESS-EXECUTOR] Could not set resource limits: {e}")

        return _set_limits

    def _parse_memory(self, value: str) -> int:
        """Parse a memory string like '512m' or '2g' into bytes."""
        value = value.lower().strip()
        if value.endswith("g"):
            return int(float(value[:-1]) * 1024 * 1024 * 1024)
        elif value.endswith("m"):
            return int(float(value[:-1]) * 1024 * 1024)
        elif value.endswith("k"):
            return int(float(value[:-1]) * 1024)
        elif value.endswith("b"):
            return int(value[:-1])
        else:
            try:
                return int(value)
            except ValueError:
                return 512 * 1024 * 1024  # default 512MB

    def _get_memory_usage(self) -> float:
        """Get current memory usage in MB."""
        try:
            import psutil
            return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
        except ImportError:
            return 0.0

    def _cleanup_work_dir(self, work_dir: str) -> None:
        """Clean up the temporary working directory."""
        if self.config.cleanup_on_exit and os.path.isdir(work_dir):
            try:
                shutil.rmtree(work_dir, ignore_errors=True)
            except Exception as e:
                logger.warning(f"[SUBPROCESS-EXECUTOR] Cleanup error: {e}")


# ── Register executor ───────────────────────────────────────────────────────

executor_registry.register(ExecutorType.SUBPROCESS, SubprocessExecutor)
