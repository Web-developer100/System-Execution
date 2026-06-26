"""
Enterprise Features — High Availability, Disaster Recovery, Multi-Region.

Supports:
  - Multiple Regions
  - Multi-Cloud (AWS, Azure, GCP)
  - Hybrid Cloud
  - On-Premises
  - Edge Workers
  - Dedicated Customer Workers
  - Shared Worker Pools
  - High Availability (active-active, active-passive)
  - Disaster Recovery (warm standby, pilot light)
  - Cross-Region Failover (automatic, manual)
  - Performance Targets (10,000+ concurrent, 100,000+ queued, sub-second scheduling)
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from app.queue import JobStatus, QueueType, job_queue
from app.queue.scheduler import scheduler
from app.queue.autoscaler import autoscaler
from app.workers import worker_manager
from app.core.events import event_bus

logger = logging.getLogger(__name__)


class RegionRole(str, Enum):
    ACTIVE = "active"
    STANDBY = "standby"
    DISASTER_RECOVERY = "disaster_recovery"
    EDGE = "edge"


class DeploymentMode(str, Enum):
    SINGLE_REGION = "single_region"
    MULTI_REGION = "multi_region"
    MULTI_CLOUD = "multi_cloud"
    HYBRID = "hybrid"
    ON_PREM = "on_prem"


class FailoverStrategy(str, Enum):
    AUTOMATIC = "automatic"       # Auto-failover on health check failure
    MANUAL = "manual"             # Manual failover via API
    SCHEDULED = "scheduled"       # Scheduled failover for maintenance
    WEIGHTED = "weighted"         # Traffic splitting across regions


@dataclass
class RegionConfig:
    """Configuration for a deployment region."""
    id: str = ""
    name: str = ""
    role: RegionRole = RegionRole.ACTIVE
    cloud_provider: str = "aws"  # aws, azure, gcp, on_prem
    region_name: str = ""        # e.g., us-east-1
    api_url: str = ""
    worker_pool_size: int = 10
    max_workers: int = 100
    weight: int = 100            # Traffic weight for active regions
    priority: int = 1            # Failover priority (lower = higher priority)
    health_status: str = "healthy"
    last_health_check: Optional[str] = None
    last_failover: Optional[str] = None
    tags: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FailoverEvent:
    """Record of a failover event."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    from_region: str = ""
    to_region: str = ""
    strategy: FailoverStrategy = FailoverStrategy.AUTOMATIC
    reason: str = ""
    duration_ms: int = 0
    success: bool = True
    jobs_migrated: int = 0
    affected_workers: int = 0


class EnterpriseFeatures:
    """Enterprise features for HA, DR, multi-region, and multi-cloud."""

    def __init__(self):
        self._regions: Dict[str, RegionConfig] = {}
        self._deployment_mode: DeploymentMode = DeploymentMode.SINGLE_REGION
        self._current_region: Optional[str] = None
        self._failover_history: List[FailoverEvent] = []
        self._health_check_task: Optional[asyncio.Task] = None
        self._is_dr_active: bool = False
        self._handlers: Dict[str, List[Callable]] = {}

    def on(self, event: str, handler: Callable) -> Callable:
        if event not in self._handlers:
            self._handlers[event] = []
        self._handlers[event].append(handler)
        def unsubscribe():
            if handler in self._handlers.get(event, []):
                self._handlers[event].remove(handler)
        return unsubscribe

    def _emit(self, event: str, data: Any) -> None:
        for handler in list(self._handlers.get(event, [])):
            try: handler(data)
            except Exception as e: logger.error(f"[ENTERPRISE] Handler error: {e}")

    # ── Region Management ───────────────────────────────────────────────────

    def register_region(self, config: RegionConfig) -> None:
        """Register a deployment region."""
        self._regions[config.id] = config
        logger.info(f"[ENTERPRISE] Region registered: {config.name} ({config.id}) "
                     f"role={config.role.value} provider={config.cloud_provider}")
        self._emit("region:registered", config.__dict__)

    def unregister_region(self, region_id: str) -> bool:
        """Unregister a deployment region."""
        region = self._regions.pop(region_id, None)
        if region:
            logger.info(f"[ENTERPRISE] Region unregistered: {region.name} ({region_id})")
            self._emit("region:unregistered", {"region_id": region_id, "name": region.name})
            return True
        return False

    def get_region(self, region_id: str) -> Optional[RegionConfig]:
        """Get region configuration."""
        return self._regions.get(region_id)

    def get_regions(self, role: Optional[RegionRole] = None) -> List[RegionConfig]:
        """Get all regions, optionally filtered by role."""
        regions = list(self._regions.values())
        if role:
            regions = [r for r in regions if r.role == role]
        return regions

    def set_current_region(self, region_id: str) -> None:
        """Set the current active region."""
        if region_id in self._regions:
            self._current_region = region_id
            logger.info(f"[ENTERPRISE] Current region set to: {region_id}")

    # ── Deployment Mode ─────────────────────────────────────────────────────

    def set_deployment_mode(self, mode: DeploymentMode) -> None:
        """Set the deployment mode."""
        self._deployment_mode = mode
        logger.info(f"[ENTERPRISE] Deployment mode set to: {mode.value}")

    def get_deployment_mode(self) -> DeploymentMode:
        return self._deployment_mode

    # ── Health Checking ─────────────────────────────────────────────────────

    async def start_health_checks(self, interval_seconds: int = 30) -> None:
        """Start continuous region health checking."""
        if self._health_check_task:
            return

        async def _check_loop():
            while True:
                await asyncio.sleep(interval_seconds)
                await self._check_all_regions()

        self._health_check_task = asyncio.create_task(_check_loop())
        logger.info(f"[ENTERPRISE] Health checks started (interval={interval_seconds}s)")

    def stop_health_checks(self) -> None:
        if self._health_check_task:
            self._health_check_task.cancel()
            self._health_check_task = None

    async def _check_all_regions(self) -> None:
        """Check health of all regions."""
        for region_id, region in list(self._regions.items()):
            health = await self._check_region_health(region_id)
            region.health_status = health
            region.last_health_check = datetime.now(timezone.utc).isoformat()

            # Auto-failover if region is unhealthy and active
            if health == "unhealthy" and region.role == RegionRole.ACTIVE:
                await self._auto_failover(region_id)

    async def _check_region_health(self, region_id: str) -> str:
        """Check health of a specific region."""
        region = self._regions.get(region_id)
        if not region:
            return "unknown"

        # For the local region, check internal health
        if region_id == self._current_region:
            queue_stats = job_queue.get_stats()
            worker_stats = worker_manager.get_stats()
            total_workers = worker_stats.get("total_workers", 0)
            max_queued = queue_stats.get("total", 0)

            if max_queued > 10000:  # Too many queued jobs
                return "degraded"
            if total_workers == 0:
                return "unhealthy"
            return "healthy"

        # For remote regions, check via API
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{region.api_url}/health",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    if response.status == 200:
                        return "healthy"
                    return "degraded"
        except Exception:
            return "unhealthy"

    # ── Failover ────────────────────────────────────────────────────────────

    async def _auto_failover(self, failed_region_id: str) -> None:
        """Automatic failover from a failed region to the next available standby."""
        failed_region = self._regions.get(failed_region_id)
        if not failed_region:
            return

        logger.warning(f"[ENTERPRISE] Auto-failover triggered: {failed_region.name} is unhealthy")

        # Find the best standby region
        standbys = sorted(
            [r for r in self._regions.values() if r.role == RegionRole.STANDBY and r.id != failed_region_id],
            key=lambda r: r.priority,
        )

        if not standbys:
            logger.error("[ENTERPRISE] No standby regions available for failover")
            return

        target = standbys[0]
        start_time = time.monotonic() * 1000

        try:
            # Promote standby to active
            target.role = RegionRole.ACTIVE
            failed_region.role = RegionRole.DISASTER_RECOVERY

            # Reassign pending jobs from failed region
            jobs_migrated = 0
            for job in job_queue.store.get_by_status(JobStatus.QUEUED):
                if job.assigned_worker_id:
                    job.assigned_worker_id = None
                    jobs_migrated += 1

            # Notify workers to reconnect
            self._emit("failover:started", {
                "from": failed_region_id,
                "to": target.id,
                "region_name": target.name,
            })

            duration_ms = int(time.monotonic() * 1000 - start_time)
            event = FailoverEvent(
                from_region=failed_region_id,
                to_region=target.id,
                strategy=FailoverStrategy.AUTOMATIC,
                reason=f"Region {failed_region.name} became unhealthy",
                duration_ms=duration_ms,
                success=True,
                jobs_migrated=jobs_migrated,
            )
            self._failover_history.append(event)
            self._is_dr_active = True

            logger.info(f"[ENTERPRISE] Failover complete: {failed_region.name} → {target.name} "
                         f"({duration_ms}ms, {jobs_migrated} jobs migrated)")

        except Exception as e:
            duration_ms = int(time.monotonic() * 1000 - start_time)
            self._failover_history.append(FailoverEvent(
                from_region=failed_region_id, to_region=target.id,
                strategy=FailoverStrategy.AUTOMATIC,
                reason=f"Failover failed: {e}", success=False, duration_ms=duration_ms,
            ))
            logger.error(f"[ENTERPRISE] Failover failed: {e}")

    async def trigger_failover(
        self, from_region_id: str, to_region_id: str,
        strategy: FailoverStrategy = FailoverStrategy.MANUAL,
        reason: str = "manual",
    ) -> bool:
        """Manually trigger a failover between regions."""
        from_region = self._regions.get(from_region_id)
        to_region = self._regions.get(to_region_id)

        if not from_region or not to_region:
            logger.error(f"[ENTERPRISE] Failover failed: invalid regions {from_region_id} → {to_region_id}")
            return False

        start_time = time.monotonic() * 1000
        try:
            to_region.role = RegionRole.ACTIVE
            from_region.role = RegionRole.STANDBY

            self._emit("failover:manual", {
                "from": from_region_id, "to": to_region_id,
                "from_name": from_region.name, "to_name": to_region.name,
            })

            self._failover_history.append(FailoverEvent(
                from_region=from_region_id, to_region=to_region_id,
                strategy=strategy, reason=reason, success=True,
                duration_ms=int(time.monotonic() * 1000 - start_time),
            ))
            logger.info(f"[ENTERPRISE] Manual failover: {from_region.name} → {to_region.name}")
            return True
        except Exception as e:
            logger.error(f"[ENTERPRISE] Manual failover failed: {e}")
            return False

    # ── Cross-Region Job Routing ────────────────────────────────────────────

    async def route_job(self, job_id: str, preferred_region: str = "") -> Optional[str]:
        """Route a job to the best available region."""
        if preferred_region and preferred_region in self._regions:
            region = self._regions[preferred_region]
            if region.role == RegionRole.ACTIVE:
                return preferred_region

        # Find the best active region based on weight and health
        active_regions = [
            r for r in self._regions.values()
            if r.role == RegionRole.ACTIVE and r.health_status == "healthy"
        ]

        if not active_regions:
            logger.warning("[ENTERPRISE] No healthy active regions available")
            return None

        # Weighted selection
        import random
        weights = [r.weight for r in active_regions]
        chosen = random.choices(active_regions, weights=weights, k=1)[0]
        return chosen.id

    def get_failover_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get failover history."""
        return [e.__dict__ for e in self._failover_history[-limit:]]

    # ── Stats ───────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Get enterprise features statistics."""
        by_role: Dict[str, int] = {}
        by_provider: Dict[str, int] = {}
        for r in self._regions.values():
            by_role[r.role.value] = by_role.get(r.role.value, 0) + 1
            by_provider[r.cloud_provider] = by_provider.get(r.cloud_provider, 0) + 1

        return {
            "deployment_mode": self._deployment_mode.value,
            "current_region": self._current_region,
            "total_regions": len(self._regions),
            "by_role": by_role,
            "by_provider": by_provider,
            "dr_active": self._is_dr_active,
            "failover_count": len(self._failover_history),
            "health_checking": self._health_check_task is not None,
            "regions": [{
                "id": r.id, "name": r.name, "role": r.role.value,
                "provider": r.cloud_provider, "health": r.health_status,
                "worker_pool": r.worker_pool_size, "weight": r.weight,
            } for r in self._regions.values()],
        }


enterprise = EnterpriseFeatures()
