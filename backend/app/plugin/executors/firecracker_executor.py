"""
Firecracker MicroVM Executor — Maximum isolation execution.

Runs plugins inside Firecracker MicroVMs for near-VM isolation
with fast startup and minimal overhead.

Features:
  - Near virtual-machine isolation
  - Fast startup (< 125ms)
  - Minimal overhead (~5MB per microVM)
  - Improved security with jailer
  - vsock for host communication
  - Resource limits via Firecracker API
  - Automatic cleanup

Requires: Firecracker binary and jailer installed.
Suitable for untrusted plugins and enterprise customers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import socket
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


class FirecrackerExecutor(PluginExecutor):
    """Execute plugins inside Firecracker MicroVMs."""

    def __init__(self, config: Optional[ExecutorConfig] = None):
        super().__init__(config)
        self._firecracker_binary = shutil.which("firecracker") or "/usr/local/bin/firecracker"
        self._jailer_binary = shutil.which("jailer") or "/usr/local/bin/jailer"
        self._kernel_path = config and config.env_vars.get(
            "FIRECRACKER_KERNEL", "/var/lib/firecracker/vmlinux.bin"
        )
        self._rootfs_path = config and config.env_vars.get(
            "FIRECRACKER_ROOTFS", "/var/lib/firecracker/rootfs.ext4"
        )
        self._vmm_dir = "/var/lib/firecracker/vmm"
        os.makedirs(self._vmm_dir, exist_ok=True)

    async def execute(
        self,
        plugin_dir: str,
        entry_point: str,
        ctx: PluginExecutionContext,
    ) -> ExecutorResult:
        """Execute a plugin inside a Firecracker MicroVM."""
        start_time = time.monotonic() * 1000
        microvm_id = f"v8-plugin-{ctx.scan_id or 'unknown'}-{uuid.uuid4().hex[:8]}"
        jailer_dir = os.path.join(self._vmm_dir, microvm_id)

        try:
            # Create jailer directory
            os.makedirs(jailer_dir, exist_ok=True)

            # Build MicroVM config
            vm_config = self._build_vm_config(ctx, microvm_id)

            # Write config to jailer directory
            config_path = os.path.join(jailer_dir, "vm-config.json")
            with open(config_path, "w") as f:
                json.dump(vm_config, f)

            # Prepare plugin directory for mounting
            plugin_tar = os.path.join(jailer_dir, "plugin.tar.gz")
            await self._prepare_plugin_image(plugin_dir, entry_point, ctx, plugin_tar)

            # Launch Firecracker with jailer
            proc = await self._launch_microvm(microvm_id, jailer_dir, ctx)

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=ctx.timeout + 60,
                )
            except asyncio.TimeoutError:
                await self._force_stop_microvm(microvm_id)
                return ExecutorResult(
                    success=False, exit_code=-1,
                    error_message=f"MicroVM timed out after {ctx.timeout}s",
                    duration_ms=int(time.monotonic() * 1000 - start_time),
                )

            duration_ms = int(time.monotonic() * 1000 - start_time)
            out_str = stdout.decode("utf-8", errors="replace")[:ctx.max_stdout]
            err_str = stderr.decode("utf-8", errors="replace")[:ctx.max_stderr]

            # Read results from vsock
            results = await self._read_vsock_results(microvm_id)

            return ExecutorResult(
                success=proc.returncode == 0 if proc.returncode else True,
                exit_code=proc.returncode or 0,
                stdout=results or out_str,
                stderr=err_str,
                duration_ms=duration_ms,
                error_message=err_str[:500] if proc.returncode and proc.returncode != 0 else None,
            )

        except FileNotFoundError:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message="Firecracker not found. Install from https://github.com/firecracker-microvm/firecracker",
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )
        except Exception as e:
            return ExecutorResult(
                success=False, exit_code=-1,
                error_message=str(e),
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )
        finally:
            await self._cleanup_microvm(microvm_id, jailer_dir)

    async def validate_environment(self) -> Dict[str, Any]:
        """Check if Firecracker and jailer are available."""
        fc_available = os.path.isfile(self._firecracker_binary)
        jailer_available = os.path.isfile(self._jailer_binary)
        kernel_available = os.path.isfile(self._kernel_path)
        rootfs_available = os.path.isfile(self._rootfs_path)

        if not fc_available:
            return {
                "available": False,
                "message": "Firecracker binary not found. Install from https://github.com/firecracker-microvm/firecracker",
                "type": "firecracker",
            }

        issues = []
        if not jailer_available:
            issues.append("jailer not found")
        if not kernel_available:
            issues.append(f"kernel not found at {self._kernel_path}")
        if not rootfs_available:
            issues.append(f"rootfs not found at {self._rootfs_path}")

        return {
            "available": len(issues) == 0,
            "message": "; ".join(issues) if issues else "Firecracker ready",
            "type": "firecracker",
            "firecracker": self._firecracker_binary,
            "jailer": self._jailer_binary if jailer_available else None,
        }

    def _build_vm_config(self, ctx: PluginExecutionContext, microvm_id: str) -> Dict[str, Any]:
        """Build Firecracker VM configuration."""
        mem_mb = self._parse_firecracker_memory(
            ctx.config.get("memory_limit", "512m")
        )
        cpu_count = int(self.config.cpu_limit) if self.config.cpu_limit.isdigit() else 1

        return {
            "boot-source": {
                "kernel_image_path": self._kernel_path,
                "boot_args": "console=ttyS0 reboot=k panic=1 pci=off",
            },
            "drives": [{
                "drive_id": "rootfs",
                "path_on_host": self._rootfs_path,
                "is_root_device": True,
                "is_read_only": False,
            }, {
                "drive_id": "plugin",
                "path_on_host": os.path.join(
                    self._vmm_dir, microvm_id, "plugin.tar.gz"
                ),
                "is_root_device": False,
                "is_read_only": True,
            }],
            "machine-config": {
                "vcpu_count": cpu_count,
                "mem_size_mib": mem_mb,
                "ht_enabled": False,
                "track_dirty_pages": False,
            },
            "network-interfaces": [{
                "iface_id": "eth0",
                "guest_mac": f"06:00:00:00:00:{microvm_id[:2]}",
                "host_dev_name": "tap0" if self.config.network_allowed else "",
            }] if self.config.network_allowed else [],
            "vsock": {
                "guest_cid": 3,
                "uds_path": f"/tmp/vsock-{microvm_id}.sock",
            },
        }

    async def _prepare_plugin_image(
        self, plugin_dir: str, entry_point: str,
        ctx: PluginExecutionContext, output_path: str,
    ) -> None:
        """Prepare the plugin as a bootable image for the MicroVM."""
        import tarfile
        env_script = self._generate_env_script(ctx, entry_point)
        with tarfile.open(output_path, "w:gz") as tar:
            tar.add(plugin_dir, arcname="plugin")
            env_path = os.path.join(tempfile.gettempdir(), f"env-{ctx.scan_id}.sh")
            with open(env_path, "w") as f:
                f.write(env_script)
            tar.add(env_path, arcname="run.sh")

    def _generate_env_script(self, ctx: PluginExecutionContext, entry_point: str) -> str:
        """Generate the environment setup script for the MicroVM."""
        lines = [
            "#!/bin/bash",
            f"export V8_TARGET='{ctx.target}'",
            f"export V8_SCAN_ID='{ctx.scan_id}'",
            f"export V8_TIMEOUT='{ctx.timeout}'",
            f"export V8_MAX_STDOUT='{ctx.max_stdout}'",
            f"export V8_MAX_STDERR='{ctx.max_stderr}'",
            "",
            f"cd /plugin/plugin",
            f"python3 {entry_point} '{ctx.target}'",
            "",
            "# Send results via vsock",
            "cat /tmp/results.json > /dev/vsock 2>/dev/null || true",
            "",
        ]
        return "\n".join(lines)

    async def _launch_microvm(
        self, microvm_id: str, jailer_dir: str, ctx: PluginExecutionContext
    ) -> asyncio.subprocess.Process:
        """Launch a Firecracker MicroVM using jailer."""
        mem_mb = self._parse_firecracker_memory(
            ctx.config.get("memory_limit", "512m")
        )

        args = [
            self._jailer_binary,
            "--id", microvm_id,
            "--exec-file", self._firecracker_binary,
            "--uid", "1000",
            "--gid", "1000",
            "--chroot-base-dir", self._vmm_dir,
            "--",
            "--config-file", os.path.join(jailer_dir, "vm-config.json"),
        ]

        logger.info(f"[FIRECRACKER] Launching MicroVM: {microvm_id}")
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        return proc

    async def _read_vsock_results(self, microvm_id: str) -> Optional[str]:
        """Read execution results from vsock."""
        sock_path = f"/tmp/vsock-{microvm_id}.sock"
        try:
            if os.path.exists(sock_path):
                sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                sock.settimeout(5)
                sock.connect(sock_path)
                data = sock.recv(65536)
                sock.close()
                return data.decode("utf-8", errors="replace")
        except Exception as e:
            logger.debug(f"[FIRECRACKER] vsock read error: {e}")
        return None

    async def _force_stop_microvm(self, microvm_id: str) -> None:
        """Force stop a MicroVM."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "kill", "-9", f"$(cat /var/lib/firecracker/vmm/{microvm_id}/pid)",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.communicate(), timeout=5)
        except Exception:
            pass

    async def _cleanup_microvm(self, microvm_id: str, jailer_dir: str) -> None:
        """Clean up MicroVM resources."""
        if self.config.cleanup_on_exit:
            await self._force_stop_microvm(microvm_id)
            try:
                shutil.rmtree(jailer_dir, ignore_errors=True)
            except Exception as e:
                logger.warning(f"[FIRECRACKER] Cleanup error: {e}")

    def _parse_firecracker_memory(self, value: str) -> int:
        """Parse memory string like '512m' or '2g' into MiB."""
        value = value.lower().strip()
        if value.endswith("g"):
            return int(float(value[:-1]) * 1024)
        elif value.endswith("m"):
            return int(float(value[:-1]))
        elif value.endswith("k"):
            return max(128, int(float(value[:-1]) / 1024))
        try:
            return max(128, int(float(value)) // (1024 * 1024))
        except ValueError:
            return 512


# ── Register executor ───────────────────────────────────────────────────────

executor_registry.register(ExecutorType.FIRECRACKER, FirecrackerExecutor)
