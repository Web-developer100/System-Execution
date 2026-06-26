"""
Plugin Manifest — Defines plugin metadata, categories, permissions, and requirements.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class PluginCategory(str, Enum):
    SCANNER = "scanner"
    RECON = "recon"
    CRAWLER = "crawler"
    FUZZER = "fuzzer"
    EXPLOIT = "exploit"
    VERIFICATION = "verification"
    AI = "ai"
    REPORTING = "reporting"
    PARSER = "parser"
    EXPORTER = "exporter"
    NOTIFICATION = "notification"
    AUTHENTICATION = "authentication"
    STORAGE = "storage"
    CLOUD = "cloud"
    CONTAINER = "container"
    SAST = "sast"
    DAST = "dast"
    IAST = "iast"
    SCA = "sca"
    SECRETS_DETECTION = "secrets_detection"
    INFRASTRUCTURE = "infrastructure"
    MONITORING = "monitoring"
    COMPLIANCE = "compliance"
    VISUALIZATION = "visualization"
    WORKFLOW = "workflow"
    UTILITY = "utility"
    NETWORK = "network"
    WEB = "web"
    API = "api"
    MOBILE = "mobile"
    OSINT = "osint"
    PASSWORD = "password"
    CICD = "cicd"
    SUPPLY_CHAIN = "supply_chain"
    MALWARE_ANALYSIS = "malware_analysis"
    REVERSE_ENGINEERING = "reverse_engineering"
    TOOL = "tool"


@dataclass
class PluginPermission:
    permission: str
    description: str
    required: bool = False
    granted: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None


@dataclass
class ResourceLimits:
    cpu: str = "1"
    memory: str = "512m"
    timeout: int = 300
    max_stdout: int = 10485760
    network_allowed: bool = False
    filesystem_writable: bool = False


@dataclass
class SecurityProfile:
    drop_capabilities: List[str] = field(default_factory=lambda: ["ALL"])
    add_capabilities: List[str] = field(default_factory=list)
    read_only_rootfs: bool = True
    allow_privilege_escalation: bool = False
    seccomp_profile: str = "default"
    app_armor_profile: str = "default"
    run_as_non_root: bool = True


@dataclass
class HealthCheck:
    command: str = ""
    expected_exit_code: int = 0
    expected_output: Optional[str] = None
    interval: int = 60
    timeout: int = 10
    http_endpoint: Optional[str] = None
    grpc_method: Optional[str] = None


@dataclass
class UpdatePolicy:
    check_mode: str = "github_release"
    auto_update: bool = False
    rollback_on_failure: bool = True
    branch: str = "main"
    detect_breaking_changes: bool = True
    allow_prerelease: bool = False
    update_interval_hours: int = 24


@dataclass
class PluginDependency:
    name: str
    version: str
    optional: bool = False
    type: str = "plugin"
    source: str = "marketplace"


@dataclass
class PluginAiRules:
    validation_prompt: Optional[str] = None
    cwe_ids: List[str] = field(default_factory=list)
    mitre_ids: List[str] = field(default_factory=list)
    severity_mapping: Dict[str, str] = field(default_factory=dict)
    auto_validate: bool = False
    confidence_threshold: int = 80


@dataclass
class PluginManifest:
    """Complete plugin manifest following the specification."""
    # Identity
    id: str = ""
    name: str = ""
    description: str = ""
    version: str = "0.0.0"
    author: str = ""
    license: str = "MIT"
    
    # Repository
    repository: str = ""
    homepage: str = ""
    documentation_url: str = ""
    
    # Classification
    category: PluginCategory = PluginCategory.TOOL
    tags: List[str] = field(default_factory=list)
    supported_platforms: List[str] = field(default_factory=lambda: ["linux/amd64", "linux/arm64"])
    supported_architectures: List[str] = field(default_factory=lambda: ["amd64", "arm64"])
    supported_input_types: List[str] = field(default_factory=list)
    supported_output_types: List[str] = field(default_factory=list)
    supported_events: List[str] = field(default_factory=list)
    
    # Version constraints
    min_platform_version: str = "0.1.0"
    max_platform_version: Optional[str] = None
    
    # Dependencies
    dependencies: List[PluginDependency] = field(default_factory=list)
    optional_dependencies: List[PluginDependency] = field(default_factory=list)
    
    # Permissions
    permissions_required: List[PluginPermission] = field(default_factory=list)
    network_requirements: Dict[str, Any] = field(default_factory=lambda: {"internet": False, "local_network": False})
    
    # Execution
    resource_limits: ResourceLimits = field(default_factory=ResourceLimits)
    security_profile: SecurityProfile = field(default_factory=SecurityProfile)
    health_check: HealthCheck = field(default_factory=HealthCheck)
    entry_point: str = "main"
    
    # Configuration
    default_config: Dict[str, Any] = field(default_factory=dict)
    config_schema: Dict[str, Any] = field(default_factory=dict)
    
    # AI rules
    ai_rules: PluginAiRules = field(default_factory=PluginAiRules)
    
    # Update policy
    update_policy: UpdatePolicy = field(default_factory=UpdatePolicy)
    
    # Signing
    digital_signature: Optional[str] = None
    checksum: Optional[str] = None
    signing_key_id: Optional[str] = None
    
    # Release info
    release_notes: Optional[str] = None
    changelog: List[Dict[str, Any]] = field(default_factory=list)
    screenshots: List[str] = field(default_factory=list)
    
    # Metadata
    is_official: bool = False
    is_verified: bool = False
    is_published: bool = False
    download_count: int = 0
    rating: float = 0.0
    security_score: int = 100
    compatibility_score: int = 100
    publisher: str = ""
    publisher_verified: bool = False
    
    # Timestamps
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    published_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self, pretty: bool = True) -> str:
        return json.dumps(self.to_dict(), indent=2 if pretty else None, default=str)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginManifest:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})

    @classmethod
    def from_json(cls, json_str: str) -> PluginManifest:
        data = json.loads(json_str)
        return cls.from_dict(data)

    def compute_checksum(self) -> str:
        """Compute SHA-256 checksum of the manifest."""
        return hashlib.sha256(self.to_json(pretty=False).encode()).hexdigest()

    def validate(self) -> List[str]:
        """Validate manifest fields, returning a list of errors."""
        errors = []
        if not self.id:
            errors.append("Plugin ID is required")
        if not self.name:
            errors.append("Plugin name is required")
        if not self.version:
            errors.append("Plugin version is required")
        if not self.entry_point:
            errors.append("Entry point is required")
        return errors


# ── Pre-defined permission constants ────────────────────────────────────────

class PluginPermissions:
    NETWORK_ACCESS = "network:internet"
    FILESYSTEM_READ = "filesystem:read"
    FILESYSTEM_WRITE = "filesystem:write"
    SECRETS_ACCESS = "secrets:read"
    STORAGE_ACCESS = "storage:read_write"
    NOTIFICATION_SEND = "notification:send"
    AI_ACCESS = "ai:inference"
    WORKER_ACCESS = "worker:spawn"
    CLOUD_ACCESS = "cloud:api_call"
    API_ACCESS = "api:internal"
    SHELL_EXECUTION = "shell:execute"
    AUDIT_READ = "audit:read"
    DATABASE_READ = "database:read_only"
    EVENT_PUBLISH = "event:publish"
    EVENT_SUBSCRIBE = "event:subscribe"
    METRICS_READ = "metrics:read"
    METRICS_WRITE = "metrics:write"

    @classmethod
    def all_permissions(cls) -> List[str]:
        return [
            v for k, v in cls.__dict__.items()
            if not k.startswith("_") and isinstance(v, str)
        ]

    @classmethod
    def get_description(cls, permission: str) -> str:
        descriptions = {
            cls.NETWORK_ACCESS: "Allow outbound network connections",
            cls.FILESYSTEM_READ: "Allow reading file
