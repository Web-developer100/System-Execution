"""
Plugin execution context and result types.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class PluginExecutionContext:
    """Context passed to plugin execution."""
    # Target information
    target: str
    target_type: str = "url"  # url, domain, ip, subnet, repo, etc.
    
    # Scan context
    scan_id: str = ""
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Execution configuration
    config: Dict[str, Any] = field(default_factory=dict)
    environment: Dict[str, str] = field(default_factory=dict)
    args: List[str] = field(default_factory=list)
    timeout: int = 300
    
    # Output limits
    max_stdout: int = 10485760  # 10MB
    max_stderr: int = 1048576   # 1MB
    
    # Network
    proxy_url: Optional[str] = None
    use_proxy: bool = False
    
    # Metadata
    correlation_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class PluginExecutionResult:
    """Result returned by plugin execution."""
    # Status
    success: bool = False
    exit_code: int = -1
    
    # Output
    stdout: str = ""
    stderr: str = ""
    
    # Findings
    findings: List[Dict[str, Any]] = field(default_factory=list)
    
    # Performance
    duration_ms: int = 0
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    
    # Artifacts
    artifacts: List[str] = field(default_factory=list)
    screenshot_paths: List[str] = field(default_factory=list)
    evidence: Dict[str, Any] = field(default_factory=dict)
    
    # Errors
    error_message: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    # Metadata
    tool_name: str = ""
    tool_version: str = ""
    plugin_id: str = ""
    plugin_version: str = ""
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "exit_code": self.exit_code,
            "findings_count": len(self.findings),
            "duration_ms": self.duration_ms,
            "error_message": self.error_message,
            "warnings": self.warnings,
            "plugin_id": self.plugin_id,
            "created_at": self.created_at,
        }
