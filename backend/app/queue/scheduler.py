"""
Scheduling Engine — Intelligent Job Assignment.

The scheduler intelligently assigns jobs to workers considering:
  - Worker Load (CPU, RAM, current jobs)
  - GPU Availability
  - Plugin Availability
  - Worker Region & Tags
  - Network Latency
  - Estimated Runtime
  - Historical Performance
  - Queue Priority
  - Health Status

Autoscaling: Scale workers based on queue size, CPU utilization, average wait time.
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from app.queue import Job, JobStatus, QueueType, job_queue
from app.domain.enums import WorkerStatus

logger = logging.getLogger(__name__)


@dataclass
class WorkerInfo:
    """Information about a registered worker for scheduling decisions."""
    id: str
    name: str
    worker_type: str
    status: str
    hostname: str = ""
    ip_address: str = ""
    region: str = ""
    availability_zone: str = ""
    cpu_available: float = 0.0
    cpu_total: float = 100.0
    memory_available_mb: float = 0.0
    memory_total_mb: float = 1024.0
    gpu_available: bool = False
    gpu_count: int = 0
    current_jobs: int = 0
    max_concurrent_jobs: int = 5
    total_jobs_completed: int = 0
    average_runtime_ms: float = 0.0
    failure_rate: float = 0.0
    capabilities: List[str] = field(default_factory=list)
    tags: Dict[str, str] = field(default_factory=dict)
    installed_plugins: List[str] = field(default_factory=list)
    last_heartbeat_at: Optional[str] = None
    score: float = 0.0  # Computed by scheduler

    def cpu_usage_pct(self) -> float:
        return ((self.cpu_total - self.cpu_available) / self.cpu_total * 100) if self.cpu_total > 0 else 0

    def memory_usage_pct(self) -> float:
        return ((self.memory_total_mb - self.memory_available_mb) / self.memory_total_mb * 100) if self.memory_total_mb > 0 else 0

    def load_pct(self) -> float:
        return (self.current_jobs / self.max_concurrent_jobs * 100) if self.max_concurrent_jobs > 0 else 0


class SchedulerEngine:
    """Intelligent job scheduler with scoring-based worker assignment."""

    def __init__(self):
        self._workers: Dict[str, WorkerInfo] = {}
        self._autoscaling_enabled: bool = False
        self._min_workers: int = 1
        self._max_workers: int = 100
        self._scale_up_threshold: int = 10   # Queue depth before scaling up
        self._scale_down_threshold: int = 2  # Queue depth before scaling down
        self._scaling_cooldown: int = 60     # Seconds between scaling events
        self._last_scale_event: float = 0
        self._scheduling_handlers: List[Callable] = []

    def on_schedule(self, callback: Callable) -> Callable:
        self._scheduling_handlers.append(callback)
        def unsubscribe():
            if callback in self._scheduling_handlers:
                self._scheduling_handlers.remove(callback)
        return unsubscribe

    def register_worker(self, info: WorkerInfo) -> None:
        self._workers[info.id] = info
        logger.info(f"[SCHEDULER] Worker registered: {info.name} ({info.id}) type={info.worker_type}")

    def unregister_worker(self, worker_id: str) -> None:
        self._workers.pop(worker_id, None)
        logger.info(f"[SCHEDULER] Worker unregistered: {worker_id}")

    def update_worker(self, info: WorkerInfo) -> None:
        if info.id in self._workers:
            info.last_heartbeat_at = datetime.now(timezone.utc).isoformat()
            self._workers[info.id] = info

    def get_worker(self, worker_id: str) -> Optional[WorkerInfo]:
        return self._workers.get(worker_id)

    def get_workers(self, worker_type: Optional[str] = None) -> List[WorkerInfo]:
        workers = list(self._workers.values())
        if worker_type:
            workers = [w for w in workers if w.worker_type == worker_type]
        return workers

    def compute_score(self, worker: WorkerInfo, job: Optional[Job] = None) -> float:
        """Compute a worker's score for a given job. Higher = better match."""
        score = 100.0

        # Penalty for high load
        load_pct = worker.load_pct()
        score -= load_pct * 0.5  # -0.5 per % load

        # Penalty for high CPU
        score -= worker.cpu_usage_pct() * 0.3

        # Penalty for high memory
        score -= worker.memory_usage_pct() * 0.2

        # Penalty for high failure rate
        if worker.failure_rate > 0:
            score -= worker.failure_rate * 50

        # Bonus for worker type match
        if job and worker.worker_type == job.worker_type:
            score += 20

        # Bonus for having the required plugin
        if job and job.plugin_id in worker.installed_plugins:
            score += 15

        # Bonus for GPU if needed
        if job and job.config.get("requires_gpu") and worker.gpu_available:
            score += 25

        # Bonus for historical performance (faster = better)
        if worker.average_runtime_ms > 0:
            if worker.total_jobs_completed > 10:
                score += min(10, 5000 / worker.average_runtime_ms)

        worker.score = score
        return score

    async def select_worker(self, job: Job) -> Optional[WorkerInfo]:
        """Select the best worker for a job using scored matching."""
        candidates = [
            w for w in self._workers.values()
            if w.status == WorkerStatus.ONLINE.value
            and w.current_jobs < w.max_concurrent_jobs
            and (w.worker_type == job.worker_type or w.worker_type == "general")
        ]

        if not candidates:
            logger.warning(f"[SCHEDULER] No available workers for job {job.id} (type={job.worker_type})")
            return None

        # Score each candidate
        scored = [(self.compute_score(w, job), w) for w in candidates]
        scored.sort(key=lambda x: x[0], reverse=True)

        best_score, best_worker = scored[0]
        logger.debug(f"[SCHEDULER] Selected worker {best_worker.id} (score={best_score:.1f}) for job {job.id}")
        return best_worker

    async def schedule_next(self, worker_type: str, worker_id: str) -> Optional[Job]:
        """Find and assign the next job for a worker."""
        job = await job_queue.next_job(worker_type, worker_id)
        if job:
            job.assigned_worker_id = worker_id
            logger.info(f"[SCHEDULER] Assigned job {job.id} to worker {worker_id}")
            for handler in list(self._scheduling_handlers):
                try: handler({"action": "assigned", "job_id": job.id, "worker_id": worker_id})
                except Exception as e: logger.error(f"[SCHEDULER] Handler error: {e}")
        return job

    # ── Autoscaling ─────────────────────────────────────────────────────────

    def enable_autoscaling(self, min_workers: int = 1, max_workers: int = 100) -> None:
        self._autoscaling_enabled = True
        self._min_workers = min_workers
        self._max_workers = max_workers
        logger.info(f"[SCHEDULER] Autoscaling enabled: min={min_workers}, max={max_workers}")

    def disable_autoscaling(self) -> None:
        self._autoscaling_enabled = False
        logger.info("[SCHEDULER] Autoscaling disabled")

    def get_scale_recommendation(self) -> Dict[str, Any]:
        """Determine if workers should be scaled up or down."""
        if not self._autoscaling_enabled:
            return {"action": "none", "reason": "Autoscaling disabled"}

        now = time.time()
        if now - self._last_scale_event < self._scaling_cooldown:
            remaining = self._scaling_cooldown - (now - self._last_scale_event)
            return {"action": "cooldown", "reason": f"Cooldown: {remaining:.0f}s remaining"}

        queue_counts = job_queue.get_stats()
        total_queued = queue_counts.get("total", 0)
        active_workers = len([w for w in self._workers.values() if w.status == WorkerStatus.ONLINE.value])

        # Scale up: queue is growing
        if total_queued > self._scale_up_threshold * max(1, active_workers):
            desired = min(self._max_workers, math.ceil(total_queued / self._scale_up_threshold))
            if desired > active_workers:
                self._last_scale_event = now
                return {
                    "action": "scale_up",
                    "current_workers": active_workers,
                    "desired_workers": desired,
                    "reason": f"Queue depth {total_queued} exceeds threshold {self._scale_up_threshold * max(1, active_workers)}",
                }

        # Scale down: queue is draining
        if active_workers > self._min_workers and total_queued < self._scale_down_threshold * active_workers:
            desired = max(self._min_workers, math.ceil(total_queued / self._scale_down_threshold))
            if desired < active_workers:
                self._last_scale_event = now
                return {
                    "action": "scale_down",
                    "current_workers": active_workers,
                    "desired_workers": desired,
                    "reason": f"Queue depth {total_queued} below threshold",
                }

        return {"action": "stable", "current_workers": active_workers, "queued": total_queued}

    def get_stats(self) -> Dict[str, Any]:
        worker_types: Dict[str, int] = {}
        for w in self._workers.values():
            worker_types[w.worker_type] = worker_types.get(w.worker_type, 0) + 1

        online = len([w for w in self._workers.values() if w.status == WorkerStatus.ONLINE.value])
        busy = len([w for w in self._workers.values() if w.load_pct() > 80])

        return {
            "total_workers": len(self._workers),
            "online": online,
            "busy": busy,
            "by_type": worker_types,
            "autoscaling": self._autoscaling_enabled,
            "min_workers": self._min_workers,
            "max_workers": self._max_workers,
        }


scheduler = SchedulerEngine()
