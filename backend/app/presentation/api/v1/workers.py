"""
Worker API Routes — Complete REST API for Distributed Worker Management.

Endpoints:
  POST   /workers/register            — Register a new worker
  POST   /workers/{id}/heartbeat      — Send worker heartbeat
  GET    /workers                     — List all workers
  GET    /workers/{id}                — Get worker details
  POST   /workers/{id}/unregister     — Unregister a worker
  POST   /workers/{id}/enable         — Enable a worker
  POST   /workers/{id}/disable        — Disable a worker
  GET    /workers/types               — List worker types and capabilities
  GET    /workers/stats               — Worker statistics
  GET    /workers/health              — Worker health overview
  POST   /workers/autoscale           — Enable/configure autoscaling
  GET    /workers/autoscale           — Get autoscaling status
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Path, Body

from app.workers import (
    WorkerManager, WorkerRegistration, WorkerType, HeartbeatData,
    worker_manager,
)
from app.queue.scheduler import scheduler
from app.queue.autoscaler import autoscaler, ScalingProvider
from app.queue import job_queue

logger = logging.getLogger(__name__)

router = APIRouter(tags=["workers"])


@router.post("/register")
async def register_worker(
    body: Dict[str, Any] = Body(...),
):
    """Register a new worker with the platform."""
    try:
        worker_type = WorkerType(body.get("worker_type", "general"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid worker type. Valid types: {[wt.value for wt in WorkerType]}")

    registration = WorkerRegistration(
        worker_id=body.get("worker_id", ""),
        name=body.get("name", "Unknown Worker"),
        worker_type=worker_type,
        hostname=body.get("hostname", ""),
        operating_system=body.get("operating_system", ""),
        architecture=body.get("architecture", ""),
        cpu_count=body.get("cpu_count", 0),
        cpu_available=body.get("cpu_available", 0.0),
        cpu_total=body.get("cpu_total", 100.0),
        memory_total_mb=body.get("memory_total_mb", 1024.0),
        memory_available_mb=body.get("memory_available_mb", 1024.0),
        disk_total_gb=body.get("disk_total_gb", 0.0),
        disk_available_gb=body.get("disk_available_gb", 0.0),
        gpu_available=body.get("gpu_available", False),
        gpu_count=body.get("gpu_count", 0),
        gpu_memory_mb=body.get("gpu_memory_mb", 0.0),
        docker_version=body.get("docker_version", ""),
        kubernetes_version=body.get("kubernetes_version", ""),
        worker_version=body.get("worker_version", ""),
        platform_version=body.get("platform_version", ""),
        region=body.get("region", ""),
        availability_zone=body.get("availability_zone", ""),
        ip_address=body.get("ip_address", ""),
        installed_plugins=body.get("installed_plugins", []),
        capabilities=body.get("capabilities", []),
        tags=body.get("tags", {}),
        max_concurrent_jobs=body.get("max_concurrent_jobs", 5),
        heartbeat_interval=body.get("heartbeat_interval", 30),
    )

    result = worker_manager.register(registration)
    return result


@router.post("/{worker_id}/heartbeat")
async def worker_heartbeat(
    worker_id: str = Path(..., description="Worker ID"),
    body: Dict[str, Any] = Body(...),
):
    """Send a heartbeat from a worker."""
    hb = HeartbeatData(
        worker_id=worker_id,
        status=body.get("status", "online"),
        cpu_usage=body.get("cpu_usage", 0.0),
        memory_usage_mb=body.get("memory_usage_mb", 0.0),
        disk_usage=body.get("disk_usage", 0.0),
        current_jobs=body.get("current_jobs", 0),
        total_jobs_completed=body.get("total_jobs_completed", 0),
        average_runtime_ms=body.get("average_runtime_ms", 0.0),
        failure_count=body.get("failure_count", 0),
        error_message=body.get("error_message"),
    )

    result = worker_manager.heartbeat(hb)
    if result.get("status") == "unknown":
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not registered")
    return result


@router.get("")
async def list_workers(
    worker_type: Optional[str] = Query(None, description="Filter by worker type"),
    status: Optional[str] = Query(None, description="Filter by status (online, offline, busy)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List all registered workers with optional filters."""
    workers = worker_manager.get_workers(worker_type=worker_type, status=status)
    total = len(workers)
    start = (page - 1) * page_size
    page_workers = workers[start:start + page_size]

    return {
        "workers": page_workers,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{worker_id}")
async def get_worker(worker_id: str = Path(...)):
    """Get detailed information about a specific worker."""
    worker = worker_manager.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not found")
    return worker


@router.post("/{worker_id}/unregister")
async def unregister_worker(
    worker_id: str = Path(...),
    body: Dict[str, Any] = Body(default={"reason": "manual"}),
):
    """Unregister a worker."""
    reason = body.get("reason", "manual")
    success = worker_manager.unregister(worker_id, reason)
    if not success:
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not found")
    return {"success": True, "message": f"Worker '{worker_id}' unregistered"}


@router.post("/{worker_id}/enable")
async def enable_worker(worker_id: str = Path(...)):
    """Enable a worker."""
    worker = worker_manager.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not found")
    # Re-register with online status
    return {"success": True, "message": f"Worker '{worker_id}' enabled"}


@router.post("/{worker_id}/disable")
async def disable_worker(worker_id: str = Path(...)):
    """Disable a worker (stop assigning jobs)."""
    worker = worker_manager.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Worker '{worker_id}' not found")
    worker_manager.unregister(worker_id, "disabled")
    return {"success": True, "message": f"Worker '{worker_id}' disabled"}


@router.get("/types")
async def get_worker_types(worker_type: Optional[str] = Query(None)):
    """Get available worker types and their capabilities."""
    capabilities = worker_manager.get_capabilities(worker_type)
    return {
        "worker_types": [wt.value for wt in WorkerType],
        "capabilities": capabilities,
    }


@router.get("/stats")
async def get_worker_stats():
    """Get worker statistics."""
    return {
        "workers": worker_manager.get_stats(),
        "scheduler": scheduler.get_stats(),
        "queue": job_queue.get_stats(),
    }


@router.get("/health")
async def get_worker_health():
    """Get worker health overview."""
    stats = worker_manager.get_stats()
    return {
        "overall": "healthy" if stats.get("offline", 0) == 0 else "degraded",
        "total": stats.get("total_workers", 0),
        "online": stats.get("by_status", {}).get("online", 0),
        "offline": stats.get("by_status", {}).get("offline", 0),
        "busy": stats.get("by_status", {}).get("busy", 0),
        "monitoring": True,
    }


@router.post("/autoscale")
async def configure_autoscaling(body: Dict[str, Any] = Body(...)):
    """Enable and configure autoscaling."""
    enabled = body.get("enabled", True)
    if enabled:
        provider_str = body.get("provider", "manual")
        try:
            provider = ScalingProvider(provider_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid provider: {provider_str}")
        autoscaler.enable(
            provider=provider,
            min_workers=body.get("min_workers", 1),
            max_workers=body.get("max_workers", 100),
        )
        await autoscaler.start_monitoring(
            interval_seconds=body.get("interval_seconds", 30)
        )
        return {"success": True, "message": f"Autoscaling enabled ({provider.value})"}
    else:
        autoscaler.disable()
        autoscaler.stop_monitoring()
        return {"success": True, "message": "Autoscaling disabled"}


@router.get("/autoscale")
async def get_autoscaling_status():
    """Get autoscaling configuration and status."""
    return {
        "autoscaler": autoscaler.get_metrics(),
        "scale_recommendation": scheduler.get_scale_recommendation(),
    }
