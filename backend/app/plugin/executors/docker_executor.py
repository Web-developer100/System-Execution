"""
Docker/Podman Executor — Container-based plugin execution.

Runs plugins in containers with:
  - CPU and memory limits (--cpus, --memory)
  - Network isolation (--network=none or bridge)
  - Read-only root filesystem
  - Drop all capabilities
  - Non-root user
  - seccomp and AppArmor profiles
  - Auto-cleanup (--rm)
  - Timeout enforcement
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
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


class DockerExecutor(PluginExecutor):
    """Execute plugins in Docker containers."""

    def __init__(self, config: Optional[ExecutorConfig] = None):
        super().__init__(config)
        self._binary = self._detect_binary()

    def _detect_binary(self) -> str:
        """Detect whether to use docker or podman."""
        if self.config.type == ExecutorType.PODMAN:
            return "podman"
        if shutil.which("docker"):
            return "docker"
        if shutil.which("podman"):
            return "podman"
        return "docker"  # Fallback

    async def execute(
        self,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
    ) -> ExecutorResult:
        """Execute a plugin in a Docker container."""
        start_time = time.monotonic() * 1000
        env = self._build_env(ctx)
        image = ctx.config.get("docker_image", "python:3.12-slim")

        # Build container name
        container_name = f"v8-plugin-{ctx.scan_id or 'unknown'}-{int(time.time())}"

        # Build Docker run arguments
        args = self._build_run_args(
            image=image,
            container_name=container_name,
            plugin_dir=plugin_dir,
            entry_point=entry_point,
            ctx=ctx,
            env=env,
        )

        try:
            logger.info(
                f"[DOCKER-EXECUTOR] Running {self._binary} container: {container_name}"
            )

            proc = await asyncio.create_subprocess_exec(
                self._binary, *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=ctx.timeout + 30,  # Extra time for Docker overhead
                )
            except asyncio.TimeoutError:
                # Kill container
                await self._force_remove_container(container_name)
                return ExecutorResult(
                    success=False, exit_code=-1,
                    error_message=f"Container execution timed out after {ctx.timeout}s",
                    duration_ms=int(time.monotonic() * 1000 - start_time),
                )

            duration_ms = int(time.monotonic() * 1000 - start_time)
            out_str = stdout.decode("utf-8", errors="replace")[:ctx.max_stdout]
            err_str = stderr.decode("utf-8", errors="replace")[:ctx.max_stderr]

            # Get container stats
            memory_mb, cpu_pct = await self._get_container_stats(container_name)

            return ExecutorResult(
                success=proc.returncode == 0,
                exit_code=proc.returncode or 0,
                stdout=out_str,
                stderr=err_str,
                duration_ms=duration_ms,
                memory_usage_mb=memory_mb,
                cpu_usage_percent=cpu_pct,
                error_message=err_str[:500] if proc.returncode and proc.returncode != 0 else None,
            )

        except FileNotFoundError:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=f"{self._binary} not found. Install Docker or Podman.",
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )
        except Exception as e:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=str(e),
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )
        finally:
            # Auto-remove container
            await self._force_remove_container(container_name)

    async def validate_environment(self) -> Dict[str, Any]:
        """Check if Docker/Podman is available."""
        if not shutil.which(self._binary):
            return {
                "available": False,
                "message": f"{self._binary} not found in PATH",
                "type": self._binary,
            }
        try:
            proc = await asyncio.create_subprocess_exec(
                self._binary, "info", "--format", "{{.ServerVersion}}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            version = stdout.decode().strip()
            return {
                "available": True,
                "message": f"{self._binary} v{version} available",
                "type": self._binary,
                "version": version,
            }
        except Exception as e:
            return {
                "available": False,
                "message": f"{self._binary} error: {e}",
                "type": self._binary,
            }

    def _build_run_args(
        self,
        image: str,
        container_name: str,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
        env: Dict[str, str],
    ) -> List[str]:
        """Build Docker run command arguments."""
        args = [
            "run",
            "--rm",                    # Auto-remove on exit
            "--name", container_name,
            "--network", "none" if not self.config.network_allowed else "bridge",
            "--read-only",
            "--tmpfs", f"/tmp:{self.config.tmpfs_size}",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
            "--security-opt", f"seccomp={self.config.seccomp_profile}",
            "--cpus", self.config.cpu_limit,
            "--memory", self.config.memory_limit,
            "--memory-swap", self.config.memory_limit,  # Disable swap
            "--pids-limit=50",
            "--ulimit", "nofile=128:128",
            "--ulimit", "fsize=1048576",
        ]

        if self.config.run_as_non_root:
            args.extend(["--user", "1000:1000"])

        if self.config.app_armor_profile != "default":
            args.extend(["--security-opt", f"apparmor={self.config.app_armor_profile}"])

        # Mount plugin directory (read-only)
        args.extend(["-v", f"{plugin_dir}:/plugin:ro"])

        # Working directory
        args.extend(["-w", "/plugin"])

        # Environment variables
        for key, value in env.items():
            args.extend(["-e", f"{key}={value}"])

        # Image
        args.append(image)

        # Command inside container
        entry_path = os.path.join("/plugin", entry_point)
        cmd = self._build_container_command(entry_path, ctx)
        args.extend(cmd)

        return args

    def _build_container_command(
        self, entry_path: str, ctx: PluginExecutionContext
    ) -> List[str]:
        """Build the command to run inside the container."""
        ext = os.path.splitext(entry_path)[1].lower()
        if ext in (".py", ".pyw"):
            return ["python3", entry_path, ctx.target]
        elif ext in (".sh", ".bash"):
            return ["bash", entry_path, ctx.target]
        elif ext in (".js", ".mjs"):
            return ["node", entry_path, ctx.target]
        else:
            return ["python3", entry_path, ctx.target]

    async def _get_container_stats(
        self, container_name: str
    ) -> tuple:
        """Get resource usage stats from a container."""
        try:
            proc = await asyncio.create_subprocess_exec(
                self._binary, "stats", "--no-stream", "--format", "{{json .}}",
                container_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            data = json.loads(stdout.decode())
            # Parse memory (format like "12.5MiB / 512MiB")
            mem_usage = data.get("MemUsage", "").split("/")[0].strip()
            mem_mb = self._parse_docker_memory(mem_usage)
            # Parse CPU
            cpu_pct = float(data.get("CPUPerc", "0%").replace("%", ""))
            return mem_mb, cpu_pct
        except Exception:
            return 0.0, 0.0

    async def _force_remove_container(self, container_name: str) -> None:
        """Force remove a container."""
        try:
            proc = await asyncio.create_subprocess_exec(
                self._binary, "rm", "-f", container_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=10)
        except Exception:
            pass

    def _parse_docker_memory(self, value: str) -> float:
        """Parse Docker memory string like '12.5MiB' into MB float."""
        value = value.strip()
        if value.endswith("GiB"):
            return float(value[:-3]) * 1024
        elif value.endswith("MiB"):
            return float(value[:-3])
        elif value.endswith("KiB"):
            return float(value[:-3]) / 1024
        try:
            return float(value)
        except ValueError:
            return 0.0


# ── Register executor ───────────────────────────────────────────────────────

executor_registry.register(ExecutorType.DOCKER, DockerExecutor)
executor_registry.register(ExecutorType.PODMAN, DockerExecutor)
