"""
Plugin API Routes — Complete REST API for the Plugin System.

Endpoints:
  GET    /plugins                    — List all plugins
  GET    /plugins/{id}               — Get plugin details
  POST   /plugins/install            — Install a plugin
  POST   /plugins/{id}/enable        — Enable a plugin
  POST   /plugins/{id}/disable       — Disable a plugin
  POST   /plugins/{id}/update        — Update a plugin
  POST   /plugins/{id}/rollback      — Rollback a plugin version
  DELETE /plugins/{id}               — Remove/uninstall a plugin
  GET    /plugins/{id}/health        — Get plugin health
  GET    /plugins/{id}/permissions   — Get plugin permissions
  POST   /plugins/{id}/permissions/approve   — Approve permissions
  POST   /plugins/{id}/permissions/deny      — Deny permissions
  POST   /plugins/{id}/permissions/revoke    — Revoke permissions
  GET    /plugins/{id}/versions      — Get version history
  POST   /plugins/{id}/versions/pin  — Pin a version
  GET    /plugins/marketplace        — Browse marketplace
  GET    /plugins/marketplace/search — Search marketplace
  GET    /plugins/marketplace/categories     — List categories
  POST   /plugins/marketplace/install/{id}   — Install from marketplace
  GET    /plugins/health             — Health stats across all plugins
  GET    /plugins/permissions/pending — Get pending permissions
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Path, Body

from app.plugin.sdk.lifecycle import PluginLifecycleManager, LifecycleState
from app.plugin.sdk.manifest_validator import manifest_validator
from app.plugin.sdk.health_monitor import plugin_health_monitor
from app.plugin.sdk.version_manager import plugin_version_manager, VersionChannel
from app.plugin.sdk.permission_manager import permission_manager
from app.plugin.sdk.dependency_manager import dependency_manager
from app.plugin.sdk.plugin_event_bus import plugin_event_bus
from app.plugin.marketplace import (
    plugin_marketplace, MarketplaceSearchFilter, MarketplaceSearchResult,
)
from app.plugin.integrations.github_integration import (
    GitHubSource, GitHubSourceType, github_plugin_integration,
)
from app.plugin.cli_generator import PluginCliGenerator, PluginTemplateConfig

logger = logging.getLogger(__name__)

router = APIRouter(tags=["plugins"])

# ── Instance managers ───────────────────────────────────────────────────────

lifecycle_manager = PluginLifecycleManager()
cli_generator = PluginCliGenerator()


# ═══════════════════════════════════════════════════════════════════════════
# Plugin CRUD
# ═══════════════════════════════════════════════════════════════════════════

@router.get("")
async def list_plugins(
    category: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all registered plugins with optional filters."""
    plugins = lifecycle_manager.get_all_plugins()
    results = []

    for plugin in plugins:
        if category and plugin.manifest.category.value != category:
            continue
        state = lifecycle_manager.get_state(plugin.plugin_id)
        if status and state and state.value != status:
            continue
        health = plugin_health_monitor.get_health(plugin.plugin_id)
        results.append({
            "id": plugin.plugin_id,
            "name": plugin.plugin_name,
            "version": plugin.plugin_version,
            "category": plugin.manifest.category.value,
            "state": state.value if state else "unknown",
            "health": health.status.value if health else "unknown",
            "description": plugin.manifest.description,
            "author": plugin.manifest.author,
            "tags": plugin.manifest.tags,
            "security_score": plugin.manifest.security_score,
        })

    # Pagination
    total = len(results)
    start = (page - 1) * page_size
    page_results = results[start:start + page_size]

    return {
        "plugins": page_results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{plugin_id}")
async def get_plugin(plugin_id: str = Path(..., description="Plugin ID")):
    """Get detailed information about a specific plugin."""
    plugin = lifecycle_manager.get_plugin(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_id}' not found")

    state = lifecycle_manager.get_state(plugin_id)
    health = plugin_health_monitor.get_health(plugin_id)
    permissions = permission_manager.get_permissions(plugin_id)
    versions = plugin_version_manager.get_version_history(plugin_id)
    is_pinned = plugin_version_manager.is_pinned(plugin_id)
    pinned_version = plugin_version_manager.get_pinned_version(plugin_id)

    return {
        "id": plugin.plugin_id,
        "name": plugin.plugin_name,
        "version": plugin.plugin_version,
        "manifest": plugin.manifest.to_dict(),
        "state": state.value if state else "unknown",
        "health": {
            "status": health.status.value if health else "unknown",
            "metrics": health.metrics.__dict__ if health else {},
            "last_check": health.last_check if health else None,
        } if health else None,
        "permissions": [p.__dict__ for p in permissions],
        "versions": [v.__dict__ for v in versions[:10]],
        "is_pinned": is_pinned,
        "pinned_version": pinned_version,
        "config": plugin.config,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Installation
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/install")
async def install_plugin(
    body: Dict[str, Any] = Body(...),
):
    """Install a plugin from a GitHub repository or marketplace."""
    source = body.get("source", "marketplace")
    plugin_id = body.get("plugin_id", "")
    repository = body.get("repository", "")
    version = body.get("version", "latest")
    auto_approve_permissions = body.get("auto_approve_permissions", False)

    try:
        if source == "github":
            # Install from GitHub
            result = await github_plugin_integration.install(
                GitHubSource(
                    repository=repository or plugin_id,
                    type=GitHubSourceType.RELEASE,
                    ref=version,
                    is_private=body.get("is_private", False),
                    token=body.get("token"),
                )
            )
            if not result.success:
                raise HTTPException(
                    status_code=400,
                    detail={"errors": result.errors, "warnings": result.warnings},
                )
            install_dir = result.install_dir
            plugin_id = result.plugin_id or plugin_id

        elif source == "marketplace":
            # Install from marketplace
            success = await plugin_marketplace.install(plugin_id)
            if not success:
                raise HTTPException(
                    status_code=404,
                    detail=f"Plugin '{plugin_id}' not found in marketplace",
                )

        else:
            raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

        # Auto-approve permissions if requested
        if auto_approve_permissions:
            permission_manager.approve_all(plugin_id, "system")

        return {
            "success": True,
            "plugin_id": plugin_id,
            "message": f"Plugin '{plugin_id}' installed successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Lifecycle
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/{plugin_id}/enable")
async def enable_plugin(plugin_id: str):
    """Enable a plugin."""
    success = await lifecycle_manager.enable(plugin_id)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to enable plugin '{plugin_id}'")
    return {"success": True, "state": "active"}


@router.post("/{plugin_id}/disable")
async def disable_plugin(plugin_id: str):
    """Disable a plugin."""
    success = await lifecycle_manager.disable(plugin_id)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to disable plugin '{plugin_id}'")
    return {"success": True, "state": "disabled"}


@router.post("/{plugin_id}/update")
async def update_plugin(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Update a plugin to a new version."""
    new_version = body.get("version", "latest")
    success = await lifecycle_manager.update(plugin_id, new_version)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to update plugin '{plugin_id}'")
    return {"success": True, "new_version": new_version}


@router.post("/{plugin_id}/rollback")
async def rollback_plugin(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Rollback a plugin to a previous version."""
    target_version = body.get("version", "")
    if not target_version:
        raise HTTPException(status_code=400, detail="Target version is required")

    success = await lifecycle_manager.rollback(plugin_id, target_version)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to rollback plugin '{plugin_id}'")
    return {"success": True, "rolled_back_to": target_version}


@router.delete("/{plugin_id}")
async def remove_plugin(plugin_id: str):
    """Remove/uninstall a plugin."""
    # Stop health monitoring
    plugin_health_monitor.stop_monitoring(plugin_id)
    # Remove permissions
    permission_manager.remove_plugin(plugin_id)
    # Unsubscribe from events
    plugin_event_bus.unsubscribe_all(plugin_id)
    # Remove via lifecycle
    success = await lifecycle_manager.remove(plugin_id)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to remove plugin '{plugin_id}'")
    return {"success": True, "message": f"Plugin '{plugin_id}' removed"}


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Health
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{plugin_id}/health")
async def get_plugin_health(plugin_id: str):
    """Get health status for a specific plugin."""
    health = plugin_health_monitor.get_health(plugin_id)
    if not health:
        raise HTTPException(status_code=404, detail=f"No health data for '{plugin_id}'")
    return {
        "plugin_id": health.plugin_id,
        "status": health.status.value,
        "metrics": health.metrics.__dict__,
        "last_check": health.last_check,
        "last_error": health.last_error,
        "alerts": [a.__dict__ for a in health.alerts[-10:]],
    }


@router.get("/health")
async def get_all_plugin_health():
    """Get health statistics across all plugins."""
    stats = plugin_health_monitor.get_stats()
    return {"stats": stats}


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Permissions
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{plugin_id}/permissions")
async def get_plugin_permissions(plugin_id: str):
    """Get permission states for a plugin."""
    permissions = permission_manager.get_permissions(plugin_id)
    return {
        "plugin_id": plugin_id,
        "permissions": [p.__dict__ for p in permissions],
        "all_approved": permission_manager.are_required_approved(plugin_id),
    }


@router.post("/{plugin_id}/permissions/approve")
async def approve_permission(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Approve a specific permission or all pending permissions."""
    permission = body.get("permission", "*")
    approved_by = body.get("approved_by", "admin")

    if permission == "*":
        count = permission_manager.approve_all(plugin_id, approved_by)
        return {"success": True, "approved": count}
    else:
        success = permission_manager.approve_permission(plugin_id, permission, approved_by)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to approve '{permission}'")
        return {"success": True, "permission": permission}


@router.post("/{plugin_id}/permissions/deny")
async def deny_permission(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Deny a specific permission."""
    permission = body.get("permission", "")
    denied_by = body.get("denied_by", "admin")

    if not permission:
        raise HTTPException(status_code=400, detail="Permission is required")

    success = permission_manager.deny_permission(plugin_id, permission, denied_by)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to deny '{permission}'")
    return {"success": True, "permission": permission}


@router.post("/{plugin_id}/permissions/revoke")
async def revoke_permission(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Revoke an approved permission."""
    permission = body.get("permission", "")
    revoked_by = body.get("revoked_by", "admin")

    if not permission:
        raise HTTPException(status_code=400, detail="Permission is required")

    success = permission_manager.revoke_permission(plugin_id, permission, revoked_by)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to revoke '{permission}'")
    return {"success": True, "permission": permission}


@router.get("/permissions/pending")
async def get_pending_permissions():
    """Get all pending permissions across all plugins."""
    pending = permission_manager.get_pending()
    stats = permission_manager.get_stats()
    return {
        "pending": pending,
        "stats": stats,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Versions
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{plugin_id}/versions")
async def get_plugin_versions(plugin_id: str):
    """Get version history for a plugin."""
    history = plugin_version_manager.get_version_history(plugin_id)
    latest = plugin_version_manager.get_latest_version(plugin_id)
    is_pinned = plugin_version_manager.is_pinned(plugin_id)
    pinned_version = plugin_version_manager.get_pinned_version(plugin_id)
    rollback_history = plugin_version_manager.get_rollback_history(plugin_id)
    stats = plugin_version_manager.get_stats()

    return {
        "plugin_id": plugin_id,
        "versions": [v.__dict__ for v in history],
        "latest": latest.__dict__ if latest else None,
        "is_pinned": is_pinned,
        "pinned_version": pinned_version,
        "rollback_history": rollback_history[-10:],
        "stats": stats,
    }


@router.post("/{plugin_id}/versions/pin")
async def pin_plugin_version(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Pin a plugin to a specific version."""
    version = body.get("version", "")
    if not version:
        raise HTTPException(status_code=400, detail="Version is required")

    plugin_version_manager.pin_version(plugin_id, version)
    return {"success": True, "pinned_version": version}


@router.post("/{plugin_id}/versions/unpin")
async def unpin_plugin_version(plugin_id: str):
    """Unpin a plugin (allow updates)."""
    plugin_version_manager.unpin_version(plugin_id)
    return {"success": True, "message": f"Plugin '{plugin_id}' unpinned"}


@router.post("/{plugin_id}/versions/canary")
async def deploy_canary(
    plugin_id: str,
    body: Dict[str, Any] = Body(...),
):
    """Deploy a canary version at a rollout percentage."""
    version = body.get("version", "")
    percentage = body.get("percentage", 10)
    if not version:
        raise HTTPException(status_code=400, detail="Version is required")

    plugin_version_manager.deploy_canary(plugin_id, version, percentage)
    return {"success": True, "version": version, "percentage": percentage}


@router.post("/{plugin_id}/versions/canary/promote")
async def promote_canary(plugin_id: str):
    """Promote a canary deployment to full release."""
    version = plugin_version_manager.promote_canary(plugin_id)
    if not version:
        raise HTTPException(status_code=400, detail="No canary deployment to promote")
    return {"success": True, "promoted_version": version}


@router.post("/{plugin_id}/versions/canary/rollback")
async def rollback_canary(plugin_id: str):
    """Rollback a canary deployment."""
    success = plugin_version_manager.rollback_canary(plugin_id)
    if not success:
        raise HTTPException(status_code=400, detail="No canary deployment to rollback")
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════════════
# Marketplace
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/marketplace")
async def browse_marketplace(
    category: Optional[str] = None,
    author: Optional[str] = None,
    min_rating: Optional[float] = None,
    sort_by: str = Query("rating", regex="^(rating|downloads|updated|name|security_score)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    """Browse the plugin marketplace."""
    search_filter = MarketplaceSearchFilter(
        category=category,
        author=author,
        min_rating=min_rating,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    result = plugin_marketplace.search(search_filter)
    stats = plugin_marketplace.get_stats()

    return {
        "plugins": [p.__dict__ for p in result.plugins],
        "total": result.total,
        "page": result.page,
        "page_size": result.page_size,
        "total_pages": result.total_pages,
        "stats": stats,
    }


@router.get("/marketplace/search")
async def search_marketplace(
    q: str = Query("", description="Search query"),
    category: Optional[str] = None,
    author: Optional[str] = None,
    min_rating: Optional[float] = None,
    min_security_score: Optional[int] = None,
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    sort_by: str = Query("rating", regex="^(rating|downloads|updated|name|security_score)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    """Search the plugin marketplace with full filtering."""
    tag_list = tags.split(",") if tags else None
    search_filter = MarketplaceSearchFilter(
        query=q,
        category=category,
        author=author,
        min_rating=min_rating,
        min_security_score=min_security_score,
        tags=tag_list,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )
    result = plugin_marketplace.search(search_filter)

    return {
        "plugins": [p.__dict__ for p in result.plugins],
        "total": result.total,
        "page": result.page,
        "page_size": result.page_size,
        "total_pages": result.total_pages,
    }


@router.get("/marketplace/categories")
async def get_marketplace_categories():
    """Get all available categories with plugin counts."""
    categories = plugin_marketplace.get_categories()
    return {"categories": categories}


@router.get("/marketplace/recommended")
async def get_recommended_plugins(
    category: Optional[str] = None,
    limit: int = Query(5, ge=1, le=20),
):
    """Get recommended plugins, optionally by category."""
    plugins = plugin_marketplace.get_recommended(category, limit)
    return {"plugins": [p.__dict__ for p in plugins]}


@router.post("/marketplace/install/{plugin_id}")
async def install_from_marketplace(plugin_id: str):
    """Install a plugin directly from the marketplace."""
    success = await plugin_marketplace.install(plugin_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Plugin '{plugin_id}' not found or install failed",
        )
    return {"success": True, "plugin_id": plugin_id}


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Favorites
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/marketplace/favorites/{plugin_id}")
async def add_favorite(plugin_id: str):
    """Add a plugin to favorites."""
    plugin_marketplace.add_favorite(plugin_id)
    return {"success": True, "plugin_id": plugin_id}


@router.delete("/marketplace/favorites/{plugin_id}")
async def remove_favorite(plugin_id: str):
    """Remove a plugin from favorites."""
    plugin_marketplace.remove_favorite(plugin_id)
    return {"success": True}


@router.get("/marketplace/favorites")
async def get_favorites():
    """Get all favorite plugins."""
    plugins = plugin_marketplace.get_favorites()
    return {"plugins": [p.__dict__ for p in plugins]}


# ═══════════════════════════════════════════════════════════════════════════
# GitHub Integration
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/github/install")
async def install_from_github(
    body: Dict[str, Any] = Body(...),
):
    """Install a plugin directly from a GitHub repository."""
    repository = body.get("repository", "")
    version = body.get("version", "latest")
    is_private = body.get("is_private", False)
    token = body.get("token")

    if not repository:
        raise HTTPException(status_code=400, detail="Repository is required")

    result = await github_plugin_integration.install(
        GitHubSource(
            repository=repository,
            type=GitHubSourceType.RELEASE,
            ref=version,
            is_private=is_private,
            token=token,
        )
    )

    return {
        "success": result.success,
        "plugin_id": result.plugin_id,
        "version": result.version,
        "install_dir": result.install_dir,
        "errors": result.errors,
        "warnings": result.warnings,
        "duration_ms": result.duration_ms,
    }


@router.post("/github/check-updates")
async def check_github_updates(
    body: Dict[str, Any] = Body(...),
):
    """Check for updates from a GitHub repository."""
    repo_dir = body.get("repo_dir", "")
    if not repo_dir:
        raise HTTPException(status_code=400, detail="repo_dir is required")
    result = await github_plugin_integration.check_for_updates(repo_dir)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Generator CLI
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/generate")
async def generate_plugin(
    body: Dict[str, Any] = Body(...),
):
    """Generate a new plugin project scaffold."""
    config = PluginTemplateConfig(
        id=body.get("id", "com.example.my-plugin"),
        name=body.get("name", "My Plugin"),
        category=body.get("category", "utility"),
        description=body.get("description", "A V8 platform plugin"),
        version=body.get("version", "1.0.0"),
        author=body.get("author", "Plugin Developer"),
        license=body.get("license", "MIT"),
        language=body.get("language", "python"),
        use_docker=body.get("use_docker", False),
        tags=body.get("tags", []),
        output_dir=body.get("output_dir", "."),
    )

    try:
        result = await cli_generator.generate(config)
        return {
            "success": True,
            "plugin_dir": result["plugin_dir"],
            "files": result["files"],
            "file_count": result["file_count"],
        }
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# Manifest Validation
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/validate-manifest")
async def validate_manifest(
    body: Dict[str, Any] = Body(...),
):
    """Validate a plugin manifest."""
    manifest = body.get("manifest", {})
    result = manifest_validator.validate(manifest)
    return {
        "valid": result.valid,
        "errors": result.errors,
        "warnings": result.warnings,
    }


@router.post("/generate-manifest")
async def generate_manifest(
    body: Dict[str, Any] = Body(...),
):
    """Generate a manifest template."""
    template = manifest_validator.generate_manifest_template(body.get("overrides"))
    return {"manifest": template}


# ═══════════════════════════════════════════════════════════════════════════
# Events
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/events")
async def get_plugin_events(
    event_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
):
    """Get recent plugin events."""
    events = plugin_event_bus.get_recent(event_type, limit)
    return {
        "events": [e.__dict__ for e in events],
        "total": len(events),
        "subscribed_types": plugin_event_bus.get_subscribed_types(),
    }


@router.get("/events/types")
async def get_event_types():
    """Get all available event types."""
    return {
        "event_types": [
            "ScanStarted", "ScanFinished", "ScanProgress", "ScanError",
            "AssetCreated", "AssetUpdated", "AssetDeleted",
            "FindingCreated", "FindingVerified", "FindingFalsePositive",
            "ReportGenerated", "ReportDownloaded",
            "UserLogin", "UserLogout", "UserCreated",
            "WorkerOnline", "WorkerOffline", "WorkerError",
            "PluginInstalled", "PluginUpdated", "PluginUninstalled",
            "PluginEnabled", "PluginDisabled", "PluginHealthChanged", "PluginError",
            "NotificationSent", "NotificationFailed",
            "SystemStartup", "SystemShutdown", "SystemError", "SystemConfigChanged",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Dependencies
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/dependencies/stats")
async def get_dependency_stats():
    """Get dependency manager statistics."""
    stats = dependency_manager.get_stats()
    return {"stats": stats}


@router.post("/dependencies/clear-cache")
async def clear_dependency_cache():
    """Clear the dependency cache."""
    count = await dependency_manager.clear_cache()
    return {"success": True, "cleared": count}
