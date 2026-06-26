"""
Distributed Job Queue System.

Supports:
  - Priority Queue
  - FIFO
  - LIFO
  - Weighted Queue
  - Scheduled Queue
  - Delayed Queue
  - Retry Queue
  - Dead Letter Queue
  - Bulk Queue
  - Dependency Queue

Each job has: Job ID, Priority, Creation Time, Owner, Target, Plugin,
Workflow, Retries, Status, Timeout, Assigned Worker, Progress, Logs, Artifacts.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    DEPENDENCY_WAIT = "dependency_wait"
    DEAD_LETTER = "dead_letter"


class QueueType(str, Enum):
    PRIORITY = "priority"
    FIFO = "fifo"
    LIFO = "lifo"
    WEIGHTED = "weighted"
    SCHEDULED = "scheduled"
    DELAYED = "delayed"
    RETRY = "retry"
    DEAD_LETTER = "dead_letter"
    BULK = "bulk"
    DEPENDENCY = "dependency"


@dataclass
class Job:
    """A unit of work in the queue system."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    queue_type: QueueType = QueueType.FIFO
    priority: int = 0  # Higher = more priority (0-100)
    weight: int = 1    # For weighted queues
    status: JobStatus = JobStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    scheduled_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    owner: str = ""
    organization_id: Optional[str] = None
    target: str = ""
    plugin_id: str = ""
    workflow_id: Optional[str] = None
    parent_job_id: Optional[str] = None
    dependent_job_ids: List[str] = field(default_factory=list)
    retries: int = 0
    max_retries: int = 3
    timeout: int = 300
    assigned_worker_id: Optional[str] = None
    worker_type: str = "general"
    progress: int = 0
    logs: List[str] = field(default_factory=list)
    artifacts: List[str] = field(default_factory=list)
    config: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    correlation_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "queue_type": self.queue_type.value,
            "priority": self.priority,
            "status": self.status.value,
            "created_at": self.created_at,
            "scheduled_at": self.scheduled_at,
            "owner": self.owner,
            "target": self.target,
            "plugin_id": self.plugin_id,
            "workflow_id": self.workflow_id,
            "retries": self.retries,
            "max_retries": self.max_retries,
            "timeout": self.timeout,
            "assigned_worker_id": self.assigned_worker_id,
            "worker_type": self.worker_type,
            "progress": self.progress,
            "error_message": self.error_message,
        }


class QueueStore:
    """In-memory queue store with priority ordering. In production, backed by Redis/PostgreSQL."""

    def __init__(self):
        self._queues: Dict[QueueType, List[Job]] = {qt: [] for qt in QueueType}
        self._jobs: Dict[str, Job] = {}
        self._delayed: List[Job] = []
        self._dependencies: Dict[str, List[str]] = {}

    def enqueue(self, job: Job) -> None:
        self._jobs[job.id] = job
        if job.queue_type == QueueType.PRIORITY:
            self._queues[QueueType.PRIORITY].append(job)
            self._queues[QueueType.PRIORITY].sort(key=lambda j: j.priority, reverse=True)
        elif job.queue_type == QueueType.LIFO:
            self._queues[QueueType.LIFO].insert(0, job)
        elif job.queue_type == QueueType.WEIGHTED:
            self._queues[QueueType.WEIGHTED].append(job)
        elif job.queue_type == QueueType.DELAYED:
            self._delayed.append(job)
        elif job.queue_type == QueueType.DEPENDENCY:
            self._dependencies[job.id] = list(job.dependent_job_ids)
            self._queues[QueueType.DEPENDENCY].append(job)
        else:
            self._queues[QueueType.FIFO].append(job)

    def dequeue(self, queue_type: QueueType) -> Optional[Job]:
        q = self._queues.get(queue_type)
        if not q:
            return None

        # Weighted random selection for weighted queues
        if queue_type == QueueType.WEIGHTED:
            candidates = [j for j in q if j.status in (JobStatus.PENDING, JobStatus.QUEUED)]
            if not candidates:
                return None
            weights = [max(1, j.weight) for j in candidates]
            import random
            chosen = random.choices(candidates, weights=weights, k=1)[0]
            q.remove(chosen)
            chosen.status = JobStatus.RUNNING
            chosen.started_at = datetime.now(timezone.utc).isoformat()
            return chosen

        while q:
            job = q.pop(0)
            if job.status in (JobStatus.PENDING, JobStatus.QUEUED):
                # Check dependencies
                if queue_type == QueueType.DEPENDENCY:
                    deps = self._dependencies.get(job.id, [])
                    if any(self._jobs.get(dep_id) and self._jobs[dep_id].status != JobStatus.COMPLETED for dep_id in deps):
                        q.append(job)  # Re-queue at the end
                        continue
                job.status = JobStatus.RUNNING
                job.started_at = datetime.now(timezone.utc).isoformat()
                return job
        return None

    def promote_delayed(self) -> None:
        """Promote delayed/scheduled jobs whose time has come to their target queues."""
        now = datetime.now(timezone.utc).isoformat()
        ready = [j for j in self._delayed if j.scheduled_at and j.scheduled_at <= now]
        self._delayed = [j for j in self._delayed if j not in ready]
        for job in ready:
            if job.dependent_job_ids:
                job.queue_type = QueueType.DEPENDENCY
            else:
                job.queue_type = QueueType.FIFO
            job.status = JobStatus.QUEUED
            self.enqueue(job)

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def update(self, job: Job) -> None:
        self._jobs[job.id] = job

    def remove(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)
        self._dependencies.pop(job_id, None)
        for q in self._queues.values():
            q[:] = [j for j in q if j.id != job_id]

    def get_by_status(self, status: JobStatus) -> List[Job]:
        return [j for j in self._jobs.values() if j.status == status]

    def get_by_worker(self, worker_id: str) -> List[Job]:
        return [j for j in self._jobs.values() if j.assigned_worker_id == worker_id]

    def list(self, queue_type: Optional[QueueType] = None, limit: int = 100) -> List[Job]:
        if queue_type:
            return list(self._queues.get(queue_type, []))[:limit]
        all_jobs = []
        for q in self._queues.values():
            all_jobs.extend(q)
        return all_jobs[:limit]

    def count(self) -> Dict[str, int]:
        return {qt.value: len(jobs) for qt, jobs in self._queues.items()}




class JobQueue:
    """High-level job queue manager."""

    def __init__(self, store: Optional[QueueStore] = None):
        self.store = store or QueueStore()
        self._handlers: Dict[str, List[Callable]] = {}

    def on(self, event: str, handler: Callable) -> Callable:
        if event not in self._handlers:
            self._handlers[event] = []
        self._handlers[event].append(handler)
        def unsubscribe():
            self._handlers[event].remove(handler)
        return unsubscribe

    def _emit(self, event: str, job: Job) -> None:
        for handler in list(self._handlers.get(event, [])):
            try: handler(job)
            except Exception as e: logger.error(f"[QUEUE] Handler error: {e}")

    def add_job(
        self,
        target: str,
        plugin_id: str,
        queue_type: QueueType = QueueType.FIFO,
        priority: int = 0,
        owner: str = "",
        organization_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        worker_type: str = "general",
        timeout: int = 300,
        max_retries: int = 3,
        scheduled_at: Optional[str] = None,
        dependent_job_ids: Optional[List[str]] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Job:
        job = Job(
            queue_type=queue_type if not scheduled_at else QueueType.SCHEDULED,
            priority=priority,
            status=JobStatus.SCHEDULED if scheduled_at else JobStatus.QUEUED,
            scheduled_at=scheduled_at,
            owner=owner,
            organization_id=organization_id,
            target=target,
            plugin_id=plugin_id,
            workflow_id=workflow_id,
            worker_type=worker_type,
            timeout=timeout,
            max_retries=max_retries,
            dependent_job_ids=dependent_job_ids or [],
            config=config or {},
            correlation_id=str(uuid.uuid4()),
        )
        if scheduled_at:
            job.queue_type = QueueType.DELAYED
            self.store.enqueue(job)
        elif dependent_job_ids:
            job.queue_type = QueueType.DEPENDENCY
            self.store.enqueue(job)
        else:
            self.store.enqueue(job)
        self._emit("job:added", job)
        return job

    async def next_job(self, worker_type: str, worker_id: str) -> Optional[Job]:
        # Promote any delayed jobs that are ready
        self.store.promote_delayed()

        # Check queues in priority order
        for qt in [QueueType.DEPENDENCY, QueueType.PRIORITY, QueueType.WEIGHTED, QueueType.FIFO]:
            job = self.store.dequeue(qt)
            if job and job.worker_type == worker_type:
                job.assigned_worker_id = worker_id
                self._emit("job:started", job)
                return job
            if job:
                # Wrong worker type, put back
                self.store.enqueue(job)
        return None

    def complete_job(self, job_id: str, result: Optional[Dict[str, Any]] = None) -> Optional[Job]:
        job = self.store.get(job_id)
        if not job:
            return None
        job.status = JobStatus.COMPLETED
        job.completed_at = datetime.now(timezone.utc).isoformat()
        job.progress = 100
        job.result = result
        self.store.update(job)
        self._emit("job:completed", job)
        return job

    def fail_job(self, job_id: str, error: str) -> Optional[Job]:
        job = self.store.get(job_id)
        if not job:
            return None
        job.retries += 1
        if job.retries < job.max_retries:
            job.status = JobStatus.RETRYING
            job.error_message = error
            job.queue_type = QueueType.RETRY
            self.store.enqueue(job)
            self._emit("job:retrying", job)
        else:
            job.status = JobStatus.DEAD_LETTER
            job.error_message = error
            job.queue_type = QueueType.DEAD_LETTER
            self.store.enqueue(job)
            self._emit("job:dead_letter", job)
        self.store.update(job)
        return job

    def cancel_job(self, job_id: str) -> bool:
        job = self.store.get(job_id)
        if not job:
            return False
        job.status = JobStatus.CANCELLED
        self.store.update(job)
        self._emit("job:cancelled", job)
        return True

    def get_stats(self) -> Dict[str, Any]:
        counts = self.store.count()
        return {
            "queue_counts": counts,
            "total": sum(counts.values()),
            "running": len(self.store.get_by_status(JobStatus.RUNNING)),
            "completed": len(self.store.get_by_status(JobStatus.COMPLETED)),
            "failed": len(self.store.get_by_status(JobStatus.FAILED)),
            "retrying": len(self.store.get_by_status(JobStatus.RETRYING)),
            "dead_letter": len(self.store.get_by_status(JobStatus.DEAD_LETTER)),
        }


job_queue = JobQueue()
