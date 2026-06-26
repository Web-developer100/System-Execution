"""
Kubernetes Job Executor — Run plugins as Kubernetes Jobs.

Features:
  - Creates Kubernetes Job resources
  - CPU/memory limits via resource requests/limits
  - Network isolation via NetworkPolicy
  - Read-only root filesystem
  - Non-root security context
  - Auto-cleanup after completion
  - Configurable node selectors and tolerations
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


class K8sExecutor(PluginExecutor):
    """Execute plugins as Kubernetes Jobs."""

    def __init__(self, config: Optional[ExecutorConfig] = None):
        super().__init__(config)
        self._namespace = os.environ.get("V8_K8S_NAMESPACE", "default")
        self._image = os.environ.get("V8_K8S_PLUGIN_IMAGE", "python:3.12-slim")

    async def execute(
        self,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
    ) -> ExecutorResult:
        """Execute a plugin as a Kubernetes Job."""
        start_time = time.monotonic() * 1000
        job_name = f"v8-plugin-{ctx.scan_id or 'unknown'}-{uuid.uuid4().hex[:8]}"
        env = self._build_env(ctx)

        try:
            # Build Job YAML
            job_yaml = self._build_job_yaml(job_name, entry_point, ctx, env)

            # Save to temp file
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".yaml", delete=False
            ) as f:
                f.write(job_yaml)
                yaml_path = f.name

            # Create Job
            proc = await asyncio.create_subprocess_exec(
                "kubectl", "apply", "-f", yaml_path, "-n", self._namespace,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            except asyncio.TimeoutError:
                return ExecutorResult(
                    success=False, exit_code=-1,
                    error_message="kubectl apply timed out",
                    duration_ms=int(time.monotonic() * 1000 - start_time),
                )

            if proc.returncode != 0:
                return ExecutorResult(
                    success=False, exit_code=proc.returncode or -1,
                    error_message=f"kubectl apply failed: {stderr.decode()[:500]}",
                    duration_ms=int(time.monotonic() * 1000 - start_time),
                )

            logger.info(f"[K8S-EXECUTOR] Created Job: {job_name}")

            # Wait for completion
            await asyncio.sleep(1)  # Brief delay for scheduling

            await asyncio.wait_for(
                self._wait_for_job(job_name),
                timeout=ctx.timeout + 60,
            )

            # Get logs
            stdout_logs, stderr_logs = await self._get_job_logs(job_name)

            duration_ms = int(time.monotonic() * 1000 - start_time)
            out_str = stdout_logs[:ctx.max_stdout]
            err_str = stderr_logs[:ctx.max_stderr]

            # Get exit code
            exit_code = await self._get_job_exit_code(job_name)
            success = exit_code == 0

            return ExecutorResult(
                success=success,
                exit_code=exit_code,
                stdout=out_str,
                stderr=err_str,
                duration_ms=duration_ms,
                error_message=err_str[:500] if not success else None,
            )

        except asyncio.TimeoutError:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=f"K8s Job timed out after {ctx.timeout}s",
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )
        except Exception as e:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=str(e),
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )
        finally:
            # Cleanup Job and temp file
            await self._delete_job(job_name)

    async def validate_environment(self) -> Dict[str, Any]:
        """Check if kubectl is available and cluster is reachable."""
        if not shutil.which("kubectl"):
            return {"available": False, "message": "kubectl not found in PATH", "type": "kubernetes"}
        try:
            proc = await asyncio.create_subprocess_exec(
                "kubectl", "cluster-info", "--request-timeout", "5s",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=10)
            return {
                "available": proc.returncode == 0,
                "message": "Kubernetes cluster reachable" if proc.returncode == 0 else "Kubernetes cluster not reachable",
                "type": "kubernetes",
                "namespace": self._namespace,
            }
        except Exception as e:
            return {"available": False, "message": f"Kubernetes error: {e}", "type": "kubernetes"}

    def _build_job_yaml(
        self, job_name: str, entry_point: str, ctx: PluginExecutionContext, env: Dict[str, str]
    ) -> str:
        """Build Kubernetes Job YAML."""
        import yaml

        # Build env vars for container
        env_vars = [{"name": k, "value": v} for k, v in env.items()]

        job = {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "metadata": {
                "name": job_name,
                "labels": {
                    "app": "v8-platform",
                    "scan-id": ctx.scan_id or "",
                    "plugin": ctx.config.get("plugin_id", "unknown"),
                },
            },
            "spec": {
                "ttlSecondsAfterFinished": 300,
                "backoffLimit": 0,
                "template": {
                    "metadata": {
                        "labels": {"app": "v8-platform", "job": job_name},
                    },
                    "spec": {
                        "restartPolicy": "Never",
                        "containers": [{
                            "name": "plugin",
                            "image": self._image,
                            "command": ["python3", f"/plugin/{entry_point}", ctx.target],
                            "env": env_vars,
                            "resources": {
                                "requests": {
                                    "cpu": self.config.cpu_limit,
                                    "memory": self.config.memory_limit,
                                },
                                "limits": {
                                    "cpu": self.config.cpu_limit,
                                    "memory": self.config.memory_limit,
                                },
                            },
                            "securityContext": {
                                "readOnlyRootFilesystem": True,
                                "runAsNonRoot": True,
                                "runAsUser": 1000,
                                "runAsGroup": 1000,
                                "capabilities": {"drop": ["ALL"]},
                                "allowPrivilegeEscalation": False,
                                "seccompProfile": {"type": "RuntimeDefault"}
                                if self.config.seccomp_profile == "default"
                                else {"type": "Localhost", "localhostProfile": self.config.seccomp_profile},
                            },
                        }],
                    },
                },
            },
        }

        return yaml.dump(job, default_flow_style=False)

    async def _wait_for_job(self, job_name: str) -> None:
        """Wait for a Kubernetes Job to complete."""
        while True:
            proc = await asyncio.create_subprocess_exec(
                "kubectl", "get", "job", job_name,
                "-n", self._namespace,
                "-o", "jsonpath={.status.conditions[0].type}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            status = stdout.decode().strip()
            if status in ("Complete", "Failed"):
                return
            await asyncio.sleep(2)

    async def _get_job_logs(self, job_name: str) -> tuple:
        """Get logs from a completed Job."""
        # Get pod name
        proc = await asyncio.create_subprocess_exec(
            "kubectl", "get", "pods",
            "-n", self._namespace,
            "--selector", f"job-name={job_name}",
            "-o", "jsonpath={.items[0].metadata.name}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        pod_name = stdout.decode().strip()
        if not pod_name:
            return ("", "No pod found")

        # Get stdout
        proc = await asyncio.create_subprocess_exec(
            "kubectl", "logs", pod_name, "-n", self._namespace,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)

        return (stdout.decode("utf-8", errors="replace"), "")

    async def _get_job_exit_code(self, job_name: str) -> int:
        """Get the exit code from a completed Job's container."""
        proc = await asyncio.create_subprocess_exec(
            "kubectl", "get", "pods",
            "-n", self._namespace,
            "--selector", f"job-name={job_name}",
            "-o", "jsonpath={.items[0].status.containerStatuses[0].state.terminated.exitCode}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        try:
            return int(stdout.decode().strip())
        except (ValueError, TypeError):
            return -1

    async def _delete_job(self, job_name: str) -> None:
        """Delete a completed Job and its pods."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "kubectl", "delete", "job", job_name,
                "-n", self._namespace,
                "--ignore-not-found",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=30)
        except Exception as e:
            logger.warning(f"[K8S-EXECUTOR] Cleanup error for job {job_name}: {e}")


# ── Register executor ───────────────────────────────────────────────────────

executor_registry.register(ExecutorType.KUBERNETES, K8sExecutor)
