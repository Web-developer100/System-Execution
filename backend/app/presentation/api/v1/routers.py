"""
API v1 Router Exports
All API routers are imported and exported from this module.
"""
from app.presentation.api.v1.auth import router as auth_router
from app.presentation.api.v1.health import router as health_router
from app.presentation.api.v1.system import router as system_router

# Placeholder routers (to be implemented fully)
from fastapi import APIRouter

from app.presentation.api.v1.plugins import router as plugins_router
from app.presentation.api.v1.workers import router as workers_router

users_router = APIRouter()
organizations_router = APIRouter()
projects_router = APIRouter()
assets_router = APIRouter()
scans_router = APIRouter()
findings_router = APIRouter()
vulnerabilities_router = APIRouter()
reports_router = APIRouter()
notifications_router = APIRouter()
logs_router = APIRouter()
metrics_router = APIRouter()
settings_router = APIRouter()
workflows_router = APIRouter()

# Stub endpoints for routers that need real implementations
@users_router.get("")
async def list_users():
    return {"users": [], "total": 0, "page": 1, "page_size": 20}

@organizations_router.get("")
async def list_organizations():
    return {"organizations": [], "total": 0, "page": 1, "page_size": 20}

@projects_router.get("")
async def list_projects():
    return {"projects": [], "total": 0, "page": 1, "page_size": 20}

@assets_router.get("")
async def list_assets():
    return {"assets": [], "total": 0, "page": 1, "page_size": 20}

@scans_router.get("")
async def list_scans():
    return {"scans": [], "total": 0, "page": 1, "page_size": 20}

@findings_router.get("")
async def list_findings():
    return {"findings": [], "total": 0, "page": 1, "page_size": 20}

@vulnerabilities_router.get("")
async def list_vulnerabilities():
    return {"vulnerabilities": [], "total": 0, "page": 1, "page_size": 20}

@reports_router.get("")
async def list_reports():
    return {"reports": [], "total": 0, "page": 1, "page_size": 20}

@notifications_router.get("")
async def list_notifications():
    return {"notifications": [], "total": 0, "page": 1, "page_size": 20}

@logs_router.get("")
async def list_logs():
    return {"logs": [], "total": 0, "page": 1, "page_size": 20}

@metrics_router.get("")
async def get_metrics():
    return {"metrics": {}, "timestamp": None}

@settings_router.get("")
async def get_settings():
    return {"settings": {}}

@workflows_router.get("")
async def list_workflows():
    return {"workflows": [], "total": 0, "page": 1, "page_size": 20}
