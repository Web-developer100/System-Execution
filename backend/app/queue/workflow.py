"""
Workflow Engine — DAG-based Workflow Execution.

Each workflow consists of multiple dependent tasks (stages).
Example workflow:
  Recon → Fingerprinting → Crawling → Parameter Discovery → Scanning
  → Verification → AI Analysis → Reporting → Notification

Features:
  - DAG-based stage dependency resolution
  - Failed tasks auto-retry (configurable)
  - Independent tasks execute concurrently
  - Checkpointing (long-running scans save progress)
  - Resume from checkpoint on interruption
  - Recover artifacts, logs, and scan state
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

from app.queue import Job, JobStatus, QueueType, job_queue

logger = logging.getLogger(__name__)


class StageStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    RETRYING = "retrying"


@dataclass
class WorkflowStage:
    """A single stage in a workflow."""
    name: str
    plugin_id: str
    order: int = 0
    depends_on: List[str] = field(default_factory=list)
    status: StageStatus = StageStatus.PENDING
    config: Dict[str, Any] = field(default_factory=dict)
    worker_type: str = "general"
    timeout: int = 300
    max_retries: int = 3
    retry_count: int = 0
    progress: int = 0
    job_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


@dataclass
class Workflow:
    """A complete workflow with DAG-based stages."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    target: str = ""
    organization_id: Optional[str] = None
    stages: List[WorkflowStage] = field(default_factory=list)
    status: str = "pending"
    checkpoint_data: Dict[str, Any] = field(default_factory=dict)
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# ── Predefined workflow templates ───────────────────────────────────────────

WORKFLOW_TEMPLATES: Dict[str, List[WorkflowStage]] = {
    "full_scan": [
        WorkflowStage(name="reconnaissance", plugin_id="com.v8platform.subfinder",
                       order=1, worker_type="recon", timeout=180),
        WorkflowStage(name="fingerprinting", plugin_id="com.v8platform.httpx",
                       order=2, depends_on=["reconnaissance"], worker_type="recon", timeout=120),
        WorkflowStage(name="crawling", plugin_id="com.v8platform.katana",
                       order=3, depends_on=["fingerprinting"], worker_type="web", timeout=300),
        WorkflowStage(name="port_scanning", plugin_id="com.v8platform.naabu",
                       order=4, depends_on=["fingerprinting"], worker_type="network", timeout=300),
        WorkflowStage(name="vulnerability_scanning", plugin_id="com.v8platform.nuclei",
                       order=5, depends_on=["crawling", "port_scanning"], worker_type="web", timeout=600),
        WorkflowStage(name="verification", plugin_id="com.v8platform.verification",
                       order=6, depends_on=["vulnerability_scanning"], worker_type="verification", timeout=300),
        WorkflowStage(name="ai_analysis", plugin_id="com.v8platform.openai",
                       order=7, depends_on=["verification"], worker_type="ai", timeout=120),
        WorkflowStage(name="reporting", plugin_id="com.v8platform.reporting",
                       order=8, depends_on=["ai_analysis"], worker_type="reporting", timeout=120),
        WorkflowStage(name="notification", plugin_id="com.v8platform.slack",
                       order=9, depends_on=["reporting"], worker_type="general", timeout=30),
    ],
    "quick_scan": [
        WorkflowStage(name="vulnerability_scanning", plugin_id="com.v8platform.nuclei",
                       order=1, worker_type="web", timeout=300),
        WorkflowStage(name="verification", plugin_id="com.v8platform.verification",
                       order=2, depends_on=["vulnerability_scanning"], worker_type="verification", timeout=120),
        WorkflowStage(name="notification", plugin_id="com.v8platform.slack",
                       order=3, depends_on=["verification"], worker_type="general", timeout=30),
    ],
    "recon_only": [
        WorkflowStage(name="reconnaissance", plugin_id="com.v8platform.subfinder",
                       order=1, worker_type="recon", timeout=180),
        WorkflowStage(name="fingerprinting", plugin_id="com.v8platform.httpx",
                       order=2, depends_on=["reconnaissance"], worker_type="recon", timeout=120),
        WorkflowStage(name="port_scanning", plugin_id="com.v8platform.naabu",
                       order=3, depends_on=["fingerprinting"], worker_type="network", timeout=300),
    ],
}


class WorkflowEngine:
    """DAG-based workflow execution engine with checkpointing."""

    def __init__(self):
        self._workflows: Dict[str, Workflow] = {}
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
            except Exception as e: logger.error(f"[WORKFLOW] Handler error: {e}")

    def create_workflow(
        self,
        name: str,
        target: str,
        template: Optional[str] = None,
        stages: Optional[List[WorkflowStage]] = None,
        organization_id: Optional[str] = None,
        description: str = "",
    ) -> Workflow:
        """Create a new workflow from a template or custom stages."""
        if template and template in WORKFLOW_TEMPLATES:
            template_stages = WORKFLOW_TEMPLATES[template]
            stages = [WorkflowStage(**s.__dict__) for s in template_stages]

        workflow = Workflow(
            name=name,
            description=description or f"{template or 'custom'} scan of {target}",
            target=target,
            organization_id=organization_id,
            stages=stages or [],
        )
        self._workflows[workflow.id] = workflow
        logger.info(f"[WORKFLOW] Created: {workflow.name} ({workflow.id}) with {len(workflow.stages)} stages")
        return workflow

    async def start_workflow(self, workflow_id: str) -> bool:
        """Start executing a workflow."""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            return False

        workflow.status = "running"
        workflow.started_at = datetime.now(timezone.utc).isoformat()
        self._emit("workflow:started", workflow)
        logger.info(f"[WORKFLOW] Started: {workflow.name} ({workflow_id})")

        # Launch stages asynchronously
        asyncio.create_task(self._execute_workflow(workflow))
        return True

    async def _execute_workflow(self, workflow: Workflow) -> None:
        """Execute all stages in the workflow respecting DAG dependencies."""
        try:
            pending = set(range(len(workflow.stages)))
            running: Dict[int, asyncio.Task] = {}
            completed: Set[int] = set()

            while pending or running:
                # Start stages whose dependencies are met
                for idx in list(pending):
                    stage = workflow.stages[idx]
                    if self._dependencies_met(stage, completed, workflow):
                        pending.remove(idx)
                        stage.status = StageStatus.RUNNING
                        stage.started_at = datetime.now(timezone.utc).isoformat()
                        task = asyncio.create_task(self._execute_stage(workflow, stage))
                        running[idx] = task

                # Wait for any stage to complete
                if running:
                    done, _ = await asyncio.wait(
                        running.values(),
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for task in done:
                        for idx, t in list(running.items()):
                            if t == task:
                                stage = workflow.stages[idx]
                                if stage.status == StageStatus.COMPLETED:
                                    completed.add(idx)
                                del running[idx]
                                # Save checkpoint
                                self._save_checkpoint(workflow)
                                break

                if not pending and not running:
                    break

                await asyncio.sleep(0.1)

            # Check if all stages completed
            if all(s.status == StageStatus.COMPLETED for s in workflow.stages):
                workflow.status = "completed"
                workflow.completed_at = datetime.now(timezone.utc).isoformat()
                self._emit("workflow:completed", workflow)
                logger.info(f"[WORKFLOW] Completed: {workflow.name}")
            else:
                workflow.status = "failed"
                workflow.completed_at = datetime.now(timezone.utc).isoformat()
                self._emit("workflow:failed", workflow)
                logger.warning(f"[WORKFLOW] Failed: {workflow.name}")

        except Exception as e:
            workflow.status = "failed"
            logger.error(f"[WORKFLOW] Error executing {workflow.name}: {e}")

    def _dependencies_met(self, stage: WorkflowStage, completed: Set[int], workflow: Workflow) -> bool:
        """Check if all dependencies for a stage are met."""
        if not stage.depends_on:
            return True
        stage_names = {s.name: i for i, s in enumerate(workflow.stages)}
        for dep_name in stage.depends_on:
            dep_idx = stage_names.get(dep_name)
            if dep_idx is None or dep_idx not in completed:
                return False
        return True

    async def _execute_stage(self, workflow: Workflow, stage: WorkflowStage) -> None:
        """Execute a single workflow stage."""
        try:
            # Create a job for this stage
            job = job_queue.add_job(
                target=workflow.target,
                plugin_id=stage.plugin_id,
                queue_type=QueueType.PRIORITY,
                priority=10,
                worker_type=stage.worker_type,
                timeout=stage.timeout,
                max_retries=stage.max_retries,
                workflow_id=workflow.id,
                config={
                    **stage.config,
                    "stage_name": stage.name,
                    "stage_order": stage.order,
                },
            )
            stage.job_id = job.id
            self._emit("stage:started", {"workflow_id": workflow.id, "stage": stage.name, "job_id": job.id})

            # Wait for job completion (polling)
            while True:
                current = job_queue.store.get(job.id)
                if not current or current.status == JobStatus.COMPLETED:
                    stage.status = StageStatus.COMPLETED
                    stage.progress = 100
                    stage.completed_at = datetime.now(timezone.utc).isoformat()
                    stage.result = current.result if current else None
                    self._emit("stage:completed", {"workflow_id": workflow.id, "stage": stage.name})
                    return
                elif current.status in (JobStatus.FAILED, JobStatus.DEAD_LETTER, JobStatus.TIMEOUT):
                    if stage.retry_count < stage.max_retries:
                        stage.retry_count += 1
                        stage.status = StageStatus.RETRYING
                        self._emit("stage:retrying", {"workflow_id": workflow.id, "stage": stage.name})
                        await asyncio.sleep(5 * stage.retry_count)  # Exponential backoff
                        return await self._execute_stage(workflow, stage)
                    else:
                        stage.status = StageStatus.FAILED
                        stage.error_message = current.error_message
                        self._emit("stage:failed", {"workflow_id": workflow.id, "stage": stage.name, "error": current.error_message})
                        return
                elif current.status == JobStatus.CANCELLED:
                    stage.status = StageStatus.SKIPPED
                    return
                stage.progress = current.progress
                await asyncio.sleep(1)

        except Exception as e:
            stage.status = StageStatus.FAILED
            stage.error_message = str(e)
            logger.error(f"[WORKFLOW] Stage {stage.name} error: {e}")

    def _save_checkpoint(self, workflow: Workflow) -> None:
        """Save workflow checkpoint for resume capability."""
        workflow.checkpoint_data = {
            "stages": [{"name": s.name, "status": s.status.value, "progress": s.progress,
                        "result": s.result, "error": s.error_message} for s in workflow.stages],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        return self._workflows.get(workflow_id)

    def get_workflows(self, status: Optional[str] = None, limit: int = 50) -> List[Workflow]:
        workflows = list(self._workflows.values())
        if status:
            workflows = [w for w in workflows if w.status == status]
        return sorted(workflows, key=lambda w: w.created_at, reverse=True)[:limit]

    def resume_workflow(self, workflow_id: str) -> bool:
        """Resume a failed/interrupted workflow from its checkpoint."""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            return False

        # Reset failed/pending stages, keep completed ones
        for stage in workflow.stages:
            if stage.status in (StageStatus.FAILED, StageStatus.RETRYING):
                stage.status = StageStatus.PENDING
                stage.retry_count = 0
                stage.error_message = None

        asyncio.create_task(self._execute_workflow(workflow))
        return True

    def get_templates(self) -> Dict[str, Any]:
        return {
            name: [{"name": s.name, "plugin_id": s.plugin_id, "order": s.order,
                     "depends_on": s.depends_on, "worker_type": s.worker_type}
                    for s in stages]
            for name, stages in WORKFLOW_TEMPLATES.items()
        }


workflow_engine = WorkflowEngine()
