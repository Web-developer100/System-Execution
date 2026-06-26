"""
API v1 — Exports all route handlers.
"""
from app.presentation.api.v1.auth import router as auth_router
from app.presentation.api.v1.health import router as health_router
from app.presentation.api.v1.system import router as system_router
from app.presentation.api.v1.routers import (
    users_router,
    organizations_router,
    projects_router,
    assets_router,
    scans_router,
    findings_router,
    vulnerabilities_router,
    reports_router,
    plugins_router,
    workers_router,
    notifications_router,
    logs_router,
    metrics_router,
    settings_router,
    workflows_router,
)

__all__ = [
    "auth_router",
    "health_router",
    "system_router",
    "users_router",
    "organizations_router",
    "projects_router",
    "assets_router",
    "scans_router",
    "findings_router",
    "vulnerabilities_router",
    "reports_router",
    "plugins_router",
    "workers_router",
    "notifications_router",
    "logs_router",
    "metrics_router",
    "settings_router",
    "workflows_router",
]
