"""
Plugin types and interfaces.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class PluginStats:
    """Execution statistics for a plugin."""
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    average_duration_ms: float = 0.0
    average_accuracy: float = 0.0
    false_positive_rate: float = 0.0
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    last_executed_at: Optional[str] = None
    last_error: Optional[str] = None


@dataclass
class PluginHealthInfo:
    """Health information for a plugin."""
    healthy: bool = True
    status: str = "healthy"
    message: str = ""
    last_check_at: Optional[str] = None
    uptime_seconds: float = 0.0
    memory_mb: float = 0.0
    cpu_percent: float = 0.0
    error_count: int = 0
    last_error: Optional[str] = None
    dependency_health: Dict[str, bool] = field(default_factory=dict)


@dataclass
class PluginPackage:
    """Plugin package with manifest and code."""
    manifest: Dict[str, Any]
    source_path: str = ""
    install_path: str = ""
    checksum: str = ""
    signature: Optional[str] = None
    is_signed: bool = False
    dependencies: List[Dict[str, Any]] = field(default_factory=list)
