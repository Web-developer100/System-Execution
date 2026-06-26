"""
Health Check API Routes
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter

from app.core.config import settings, Environment
from app.core.database import check_db_health

router = APIRouter()

START_TIME = time.time()


@router.get("")
@router.get("/healthz")
@router.get("/livez")
@router.get("/readyz")
async def health_check() -> Dict[str, Any]:
    """Comprehensive health check endpoint."""
    db_health = await check_db_health()
    
    uptime_seconds = time.time() - START_TIME
    is_healthy = db_health.get("status") == "healthy"
    
    # In development, we're healthy even without DB
    if settings.is_development() and not is_healthy:
        is_healthy = True
    
    return {
        "status": "healthy" if is_healthy else "degraded",
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT.value if hasattr(settings.ENVIRONMENT, 'value') else str(settings.ENVIRONMENT),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(uptime_seconds, 2),
        "database": db_health,
        "checks": {
            "database": db_health.get("status") == "healthy",
            "cache": "not_checked",
        },
    }


@router.get("/live")
async def liveness_check() -> Dict[str, str]:
    """Simple liveness probe."""
    return {"status": "alive"}
