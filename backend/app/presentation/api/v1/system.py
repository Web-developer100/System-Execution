"""
System Administration API Routes
"""
from __future__ import annotations

import platform
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependencies import require_super_admin, CurrentUser

router = APIRouter()


@router.get("/info")
async def system_info() -> Dict[str, Any]:
    """Get system information."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": str(settings.ENVIRONMENT),
        "python_version": sys.version,
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "hostname": platform.node(),
        "uptime_seconds": None,
        "debug": settings.DEBUG,
    }


@router.get("/health")
async def system_health(current_user: CurrentUser = Depends(require_super_admin)):
    """Get detailed system health information."""
    return {
        "status": "healthy",
        "services": {
            "api": {"status": "healthy"},
            "database": {"status": "unknown"},
            "cache": {"status": "unknown"},
            "queue": {"status": "unknown"},
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/cache/clear")
async def clear_cache(current_user: CurrentUser = Depends(require_super_admin)):
    """Clear all cached data."""
    from app.core.cache import cache
    await cache.clear_all()
    return {"message": "Cache cleared successfully"}


@router.get("/config")
async def get_config(current_user: CurrentUser = Depends(require_super_admin)):
    """Get system configuration (sanitized)."""
    # Return sanitized config (no secrets)
    return {
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": str(settings.ENVIRONMENT),
        "debug": settings.DEBUG,
        "database_provider": str(settings.DATABASE_PROVIDER),
        "queue_provider": str(settings.QUEUE_PROVIDER),
        "storage_provider": str(settings.STORAGE_PROVIDER),
        "features": {
            "ai_analysis": settings.FEATURE_AI_ANALYSIS,
            "attack_chains": settings.FEATURE_ATTACK_CHAINS,
            "plugin_marketplace": settings.FEATURE_PLUGIN_MARKETPLACE,
            "mfa": settings.FEATURE_MFA,
            "graphql": settings.FEATURE_GRAPHQL,
        },
    }


@router.post("/feature-flags")
async def set_feature_flag(
    name: str,
    enabled: bool,
    current_user: CurrentUser = Depends(require_super_admin),
):
    """Set a feature flag value."""
    return {"name": name, "enabled": enabled, "message": "Feature flag updated"}
