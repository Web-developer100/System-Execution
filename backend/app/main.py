"""
V8 Neural Exploitation Platform — Enterprise FastAPI Backend
Main application entry point with all middleware, routes, and startup/shutdown hooks.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any, Dict

import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.core.config import settings, Environment
from app.core.database import engine, init_db, close_db
from app.core.cache import cache
from app.core.dependencies import get_rate_limiter
from app.core.exceptions import AppError
from app.core.events import event_bus, InMemoryEventBus
from app.infrastructure.queue.celery_app import celery_app
from app.infrastructure.message_bus.rabbitmq import RabbitMQBus
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
from app.presentation.websockets.manager import ws_manager
from app.presentation.api.deps import setup_exception_handlers


# ── Sentry Initialization ───────────────────────────────────────────────────

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT.value if hasattr(settings.ENVIRONMENT, 'value') else str(settings.ENVIRONMENT),
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
    )


# ── Application Lifespan ────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # ── Startup ──────────────────────────────────────────────────────────
    print(f"[BOOT] Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"[BOOT] Environment: {settings.ENVIRONMENT}")

    # 1. Initialize database
    try:
        await init_db()
        print("[BOOT] Database initialized successfully")
    except Exception as e:
        print(f"[BOOT] Database initialization warning: {e}")
        print("[BOOT] Continuing without database — some features may be unavailable")

    # 2. Initialize cache
    try:
        await cache.connect()
        print("[BOOT] Cache initialized successfully")
    except Exception as e:
        print(f"[BOOT] Cache initialization skipped: {e}")

    # 3. Initialize message bus
    if settings.QUEUE_PROVIDER.value == "rabbitmq":
        try:
            bus = RabbitMQBus()
            await bus.connect()
            print("[BOOT] Message bus (RabbitMQ) initialized")
        except Exception as e:
            print(f"[BOOT] Message bus initialization skipped: {e}")

    # 4. Initialize WebSocket manager
    try:
        await ws_manager.initialize()
        print("[BOOT] WebSocket manager initialized")
    except Exception as e:
        print(f"[BOOT] WebSocket manager initialization skipped: {e}")

    # 5. Register event handlers
    _register_event_handlers()

    print(f"[BOOT] {settings.APP_NAME} is ready")
    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    print("[SHUTDOWN] Shutting down...")
    await ws_manager.shutdown()
    await cache.disconnect()
    await close_db()
    print("[SHUTDOWN] Shutdown complete")


# ── Event Handlers ─────────────────────────────────────────────────────────

def _register_event_handlers():
    """Register domain event handlers."""
    # These would be imported from handlers module
    pass


# ── FastAPI Application ─────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
    docs_url=settings.DOCS_URL,
    redoc_url=settings.REDOC_URL,
    openapi_url=settings.OPENAPI_URL,
    lifespan=lifespan,
    # OpenAPI tags
    openapi_tags=[
        {"name": "Auth", "description": "Authentication & Authorization"},
        {"name": "Users", "description": "User management"},
        {"name": "Organizations", "description": "Multi-tenant organization management"},
        {"name": "Projects", "description": "Project management"},
        {"name": "Assets", "description": "Asset inventory management"},
        {"name": "Scans", "description": "Vulnerability scanning"},
        {"name": "Findings", "description": "Vulnerability findings"},
        {"name": "Vulnerabilities", "description": "Vulnerability management"},
        {"name": "Reports", "description": "Report generation"},
        {"name": "Plugins", "description": "Plugin management & marketplace"},
        {"name": "Workers", "description": "Distributed worker management"},
        {"name": "Notifications", "description": "Notification management"},
        {"name": "Workflows", "description": "Automated workflow engine"},
        {"name": "Scheduling", "description": "Scan & job scheduling"},
        {"name": "Settings", "description": "System settings"},
        {"name": "Logs", "description": "Audit & activity logs"},
        {"name": "Metrics", "description": "System metrics & monitoring"},
        {"name": "Health", "description": "Health checks"},
        {"name": "System", "description": "System administration"},
    ],
)


# ── Middleware Stack ────────────────────────────────────────────────────────

# 1. Trusted hosts
if not settings.is_development():
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

# 2. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Correlation-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)

# 3. GZip compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 4. Rate limiter
limiter = get_rate_limiter()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 5. Request timing & correlation ID middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add processing time and correlation ID to responses."""
    import uuid
    start_time = time.time()
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    response.headers["X-Process-Time-Ms"] = str(round(process_time * 1000, 2))
    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-API-Version"] = settings.APP_VERSION
    
    return response


# ── Exception Handlers ─────────────────────────────────────────────────────

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle custom application errors."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(),
        headers=exc.headers or {},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected errors."""
    if settings.is_development():
        content = {
            "error": {
                "code": "internal_error",
                "message": str(exc),
                "status": 500,
                "traceback": getattr(exc, "__traceback__", None) and str(exc.__traceback__),
            }
        }
    else:
        content = {
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred. Please try again later.",
                "status": 500,
            }
        }
    
    # Log the error in production
    if settings.is_production():
        print(f"[ERROR] Unhandled exception: {exc}")
    
    return JSONResponse(status_code=500, content=content)


# ── Router Inclusion ────────────────────────────────────────────────────────

api_prefix = settings.API_PREFIX

app.include_router(auth_router, prefix=f"{api_prefix}/auth", tags=["Auth"])
app.include_router(users_router, prefix=f"{api_prefix}/users", tags=["Users"])
app.include_router(organizations_router, prefix=f"{api_prefix}/organizations", tags=["Organizations"])
app.include_router(projects_router, prefix=f"{api_prefix}/projects", tags=["Projects"])
app.include_router(assets_router, prefix=f"{api_prefix}/assets", tags=["Assets"])
app.include_router(scans_router, prefix=f"{api_prefix}/scans", tags=["Scans"])
app.include_router(findings_router, prefix=f"{api_prefix}/findings", tags=["Findings"])
app.include_router(vulnerabilities_router, prefix=f"{api_prefix}/vulnerabilities", tags=["Vulnerabilities"])
app.include_router(reports_router, prefix=f"{api_prefix}/reports", tags=["Reports"])
app.include_router(plugins_router, prefix=f"{api_prefix}/plugins", tags=["Plugins"])
app.include_router(workers_router, prefix=f"{api_prefix}/workers", tags=["Workers"])
app.include_router(notifications_router, prefix=f"{api_prefix}/notifications", tags=["Notifications"])
app.include_router(workflows_router, prefix=f"{api_prefix}/workflows", tags=["Workflows"])
app.include_router(settings_router, prefix=f"{api_prefix}/settings", tags=["Settings"])
app.include_router(logs_router, prefix=f"{api_prefix}/logs", tags=["Logs"])
app.include_router(metrics_router, prefix=f"{api_prefix}/metrics", tags=["Metrics"])
app.include_router(health_router, prefix=f"{api_prefix}/health", tags=["Health"])
app.include_router(system_router, prefix=f"{api_prefix}/system", tags=["System"])


# ── Root Endpoints ──────────────────────────────────────────────────────────

@app.get("/")
async def root() -> Dict[str, Any]:
    """Root endpoint with API info."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT.value if hasattr(settings.ENVIRONMENT, 'value') else str(settings.ENVIRONMENT),
        "docs": f"{settings.DOCS_URL}",
        "openapi": f"{settings.OPENAPI_URL}",
        "status": "operational",
    }


@app.get("/metrics")
async def metrics() -> Response:
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/version")
async def version() -> Dict[str, Any]:
    """API version information."""
    return {
        "version": settings.APP_VERSION,
        "build": settings.APP_VERSION,
        "name": settings.APP_NAME,
        "python_version": __import__("sys").version,
    }


# ── WebSocket Endpoint ─────────────────────────────────────────────────────

from fastapi import WebSocket, WebSocketDisconnect


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time events."""
    await ws_manager.handle_connection(websocket)


# ── Direct Execution ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        reload=settings.is_development(),
        log_level=settings.LOG_LEVEL.value.lower() if hasattr(settings.LOG_LEVEL, 'value') else str(settings.LOG_LEVEL).lower(),
        timeout_keep_alive=settings.KEEPALIVE_TIMEOUT,
    )
