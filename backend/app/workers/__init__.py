"""
Worker Manager — Distributed Worker Management.

Worker Types:
  - General Workers
  - Recon Workers
  - Web Scanning Workers
  - API Scanning Workers
  - Cloud Workers
  - Container Workers
  - AI Workers
  - Verification Workers
  - Reporting Workers
  - Heavy Compute Workers
  - GPU Workers
  - Custom Enterprise Workers

Workers register automatically with:
  - Unique Worker ID, Hostname, OS, Architecture
  - Available CPU, RAM, Disk, GPU
  - Docker/K8s version, Installed Plugins
  - Region, AZ, IP Address
  - Health Status, Current Load, Capabilities
  - Heartbeat Interval
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

from app.domain.enums import WorkerStatus
from app.queue.scheduler import scheduler, WorkerInfo

logger = logging.getLogger(__name__)


class WorkerType(str, Enum):
    GENERAL = "general"
    RECON = "recon"
    WEB_SCANNING = "web"
    API_SCANNING = "api"
    CLOUD = "cloud"
    CONTAINER = "container"
    AI = "ai"
    VERIFICATION = "verification"
    REPORTING = "reporting"
    HEAVY_COMPUTE = "heavy_compute"
    GPU = "gpu"
    CUSTOM = "custom"


@dataclass
class WorkerRegistration:
    """Complete worker registration data."""
    worker_id: str
    name: str
    worker_type: WorkerType
    hostname: str = ""
    operating_system: str = ""
    architecture: str = ""
    cpu_count: int = 0
    cpu_available: float = 0.0
    cpu_total: float = 100.0
    memory_total_mb: float = 1024.0
    memory_available_mb: float = 1024.0
    disk_total_gb: float = 0.0
    disk_available_gb: float = 0.0
    gpu_available: bool = False
    gpu_count: int = 0
    gpu_memory_mb: float = 0.0
    docker_version: str = ""
    kubernetes_version: str = ""
    worker_version: str = ""
    platform_version: str = ""
    region: str = ""
    availability_zone: str = ""
    ip_address: str = ""
    installed_plugins: List[str] = field(default_factory=list)
    capabilities: List[str] = field(default_factory=list)
    tags: Dict[str, str] = field(default_factory=dict)
    max_concurrent_jobs: int = 5
    heartbeat_interval: int = 30

    def to_worker_info(self) -> WorkerInfo:
        return WorkerInfo(
            id=self.worker_id,
            name=self.name,
            worker_type=self.worker_type.value,
            status=WorkerStatus.ONLINE.value,
            hostname=self.hostname,
            ip_address=self.ip_address,
            region=self.region,
            availability_zone=self.availability_zone,
            cpu_available=self.cpu_available,
            cpu_total=self.cpu_total,
            memory_available_mb=self.memory_available_mb,
            memory_total_mb=self.memory_total_mb,
            gpu_available=self.gpu_available,
            gpu_count=self.gpu_count,
            max_concurrent_jobs=self.max_concurrent_jobs,
            capabilities=self.capabilities,
            tags=self.tags,
            installed_plugins=self.installed_plugins,
            last_heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )


@dataclass
class HeartbeatData:
    """Data sent in worker heartbeat."""
    worker_id: str
    status: str = WorkerStatus.ONLINE.value
    cpu_usage: float = 0.0
    memory_usage_mb: float = 0.0
    disk_usage: float = 0.0
    current_jobs: int = 0
    total_jobs_completed: int = 0
    average_runtime_ms: float = 0.0
    failure_count: int = 0
    error_message: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Predefined worker capabilities by type ──────────────────────────────────

WORKER_CAPABILITIES: Dict[WorkerType, List[str]] = {
    WorkerType.GENERAL: ["subprocess", "docker", "python", "bash", "http"],
    WorkerType.RECON: ["subprocess", "docker", "dns", "http", "python"],
    WorkerType.WEB_SCANNING: ["docker", "http", "https", "websocket", "python"],
    WorkerType.API_SCANNING: ["docker", "http", "https", "rest", "graphql", "grpc"],
    WorkerType.CLOUD: ["docker", "python", "aws", "azure", "gcp", "http"],
    WorkerType.CONTAINER: ["docker", "kubernetes", "python"],
    WorkerType.AI: ["docker", "python", "gpu", "tensorflow", "pytorch", "http"],
    WorkerType.VERIFICATION: ["docker", "http", "https", "python", "subprocess"],
    WorkerType.REPORTING: ["docker", "python", "node"],
    WorkerType.HEAVY_COMPUTE: ["docker", "python", "go", "rust"],
    WorkerType.GPU: ["docker", "gpu", "cuda", "python", "tensorflow", "pytorch"],
    WorkerType.CUSTOM: ["docker", "subprocess", "python"],
}


class WorkerManager:
    """Manages worker registration, heartbeat, health, and lifecycle."""

    def __init__(self):
        self._registrations: Dict[str, WorkerRegistration] = {}
        self._heartbeats: Dict[str, HeartbeatData] = {}
        self._offline_threshold: int = 90  # Seconds before marking worker offline
        self._monitor_task: Optional[asyncio.Task] = None
        self._handlers: Dict[str, List[Callable]] = {}

    def on(self, event: str, handler: Callable) -> Callable:
        if event not in self._handlers:
            self._handlers[event] = []
        self._handlers[event].append(handler)
        def unsubscribe(): self._handlers[event].remove(handler)
        return unsubscribe

    def _emit(self, event: str, data: Any) -> None:
        for handler in list(self._handlers.get(event, [])):
            try: handler(data)
            except Exception as e: logger.error(f"[WORKER-MGR] Handler error: {e}")

    # ── Registration ────────────────────────────────────────────────────────

    def register(self, data: WorkerRegistration) -> Dict[str, Any]:
        """Register a new worker."""
        if not data.worker_id:
            data.worker_id = str(uuid.uuid4())

        self._registrations[data.worker_id] = data
        worker_info = data.to_worker_info()
        scheduler.register_worker(worker_info)

        logger.info(
            f"[WORKER-MGR] Registered: {data.name} ({data.worker_id}) "
            f"type={data.worker_type.value} region={data.region}"
        )
        self._emit("worker:registered", data.__dict__)

        return {
            "worker_id": data.worker_id,
            "status": WorkerStatus.ONLINE.value,
            "message": f"Worker '{data.name}' registered successfully",
            "heartbeat_interval": data.heartbeat_interval,
        }

    def unregister(self, worker_id: str, reason: str = "manual") -> bool:
        """Unregister a worker."""
        if worker_id not in self._registrations:
            return False
        self._registrations.pop(worker_id, None)
        self._heartbeats.pop(worker_id, None)
        scheduler.unregister_worker(worker_id)
        logger.info(f"[WORKER-MGR] Unregistered: {worker_id} (reason={reason})")
        self._emit("worker:unregistered", {"worker_id": worker_id, "reason": reason})
        return True

    # ── Heartbeat ───────────────────────────────────────────────────────────

    def heartbeat(self, data: HeartbeatData) -> Dict[str, Any]:
        """Process a worker heartbeat."""
        if data.worker_id not in self._registrations:
            return {"status": "unknown", "message": "Worker not registered"}

        self._heartbeats[data.worker_id] = data
        worker_info = scheduler.get_worker(data.worker_id)
        if worker_info:
            worker_info.current_jobs = data.current_jobs
            worker_info.total_jobs_completed = data.total_jobs_completed
            worker_info.average_runtime_ms = data.average_runtime_ms
            worker_info.failure_rate = data.failure_count / max(1, data.total_jobs_completed)
            worker_info.last_heartbeat_at = data.timestamp
            worker_info.status = data.status
            scheduler.update_worker(worker_info)

        # Check if worker needs attention
        if data.status == WorkerStatus.DEGRADED.value:
            logger.warning(f"[WORKER-MGR] Degraded worker: {data.worker_id} ({data.error_message})")
            self._emit("worker:degraded", data.__dict__)

        return {
            "status": "ok",
            "accepted": True,
            "next_heartbeat_in": self._registrations[data.worker_id].heartbeat_interval,
        }

    # ── Health Monitoring ──────────────────────────────────────────────────

    async def start_monitoring(self, interval_seconds: int = 15) -> None:
        """Start background worker health monitoring."""
        if self._monitor_task:
            return

        async def _monitor():
            while True:
                await asyncio.sleep(interval_seconds)
                await self._check_worker_health()

        self._monitor_task = asyncio.create_task(_monitor())
        logger.info(f"[WORKER-MGR] Health monitoring started (interval={interval_seconds}s)")

    def stop_monitoring(self) -> None:
        if self._monitor_task:
            self._monitor_task.cancel()
            self._monitor_task = None

    async def _check_worker_health(self) -> None:
        """Check all workers for missed heartbeats."""
        now = datetime.now(timezone.utc)
        for worker_id, reg in list(self._registrations.items()):
            hb = self._heartbeats.get(worker_id)
            if hb:
                hb_time = datetime.fromisoformat(hb.timestamp)
                elapsed = (now - hb_time).total_seconds()
                if elapsed > self._offline_threshold:
                    logger.warning(f"[WORKER-MGR] Worker offline: {worker_id} (no heartbeat for {elapsed:.0f}s)")
                    scheduler.get_worker(worker_id).status = WorkerStatus.OFFLINE.value
                    self._emit("worker:offline", {"worker_id": worker_id, "elapsed_seconds": elapsed})

    # ── Queries ─────────────────────────────────────────────────────────────

    def get_worker(self, worker_id: str) -> Optional[Dict[str, Any]]:
        reg = self._registrations.get(worker_id)
        if not reg:
            return None
        hb = self._heartbeats.get(worker_id)
        return {
            **reg.__dict__,
            "status": hb.status if hb else WorkerStatus.OFFLINE.value,
            "current_jobs": hb.current_jobs if hb else 0,
            "total_jobs_completed": hb.total_jobs_completed if hb else 0,
            "average_runtime_ms": hb.average_runtime_ms if hb else 0.0,
            "last_heartbeat": hb.timestamp if hb else None,
        }

    def get_workers(self, worker_type: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        workers = []
        for worker_id, reg in self._registrations.items():
            if worker_type and reg.worker_type.value != worker_type:
                continue
            hb = self._heartbeats.get(worker_id)
            w_status = hb.status if hb else WorkerStatus.OFFLINE.value
            if status and w_status != status:
                continue
            workers.append({
                "worker_id": worker_id,
                "name": reg.name,
                "worker_type": reg.worker_type.value,
                "status": w_status,
                "hostname": reg.hostname,
                "region": reg.region,
                "current_jobs": hb.current_jobs if hb else 0,
                "total_jobs_completed": hb.total_jobs_completed if hb else 0,
                "cpu_usage": hb.cpu_usage if hb else 0.0,
                "memory_usage_mb": hb.memory_usage_mb if hb else 0.0,
                "last_heartbeat": hb.timestamp if hb else None,
                "max_concurrent_jobs": reg.max_concurrent_jobs,
                "capabilities": reg.capabilities,
                "tags": reg.tags,
            })
        return workers

    def get_stats(self) -> Dict[str, Any]:
        types: Dict[str, int] = {}
        statuses: Dict[str, int] = {}
        for worker_id, reg in self._registrations.items():
            wtype = reg.worker_type.value
            types[wtype] = types.get(wtype, 0) + 1
            hb = self._heartbeats.get(worker_id)
            wstatus = hb.status if hb else WorkerStatus.OFFLINE.value
            statuses[wstatus] = statuses.get(wstatus, 0) + 1

        total_workers = len(self._registrations)
        total_capacity = sum(r.max_concurrent_jobs for r in self._registrations.values())
        total_jobs_completed = sum(
            hb.total_jobs_completed for hb in self._heartbeats.values() if hb
        )

        return {
            "total_workers": total_workers,
            "by_type": types,
            "by_status": statuses,
            "total_capacity": total_capacity,
            "total_jobs_completed": total_jobs_completed,
            "offline_threshold_seconds": self._offline_threshold,
            "regions": list(set(r.region for r in self._registrations.values() if r.region)),
        }

    def get_capabilities(self, worker_type: Optional[str] = None) -> Dict[str, List[str]]:
        if worker_type:
            try:
                wt = WorkerType(worker_type)
                return {worker_type: WORKER_CAPABILITIES.get(wt, [])}
            except ValueError:
                return {worker_type: []}
        return {wt.value: caps for wt, caps in WORKER_CAPABILITIES.items()}


worker_manager = WorkerManager()
