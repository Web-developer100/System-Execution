"""
Enterprise Enumerations for domain models.
"""
from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "organization_admin"
    SECURITY_MANAGER = "security_manager"
    SOC_ANALYST = "soc_analyst"
    PENETRATION_TESTER = "penetration_tester"
    DEVELOPER = "developer"
    READ_ONLY = "read_only"
    AUDITOR = "auditor"
    GUEST = "guest"


class UserTier(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    NODE_01 = "Node_01"
    NODE_X = "Node_X"
    HYPER_CORE = "Hyper_Core"


class ScanStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class FindingStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"
    ACCEPTED_RISK = "accepted_risk"
    REOPENED = "reopened"
    VERIFIED = "verified"
    PENDING = "pending"


class Severity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class VerificationStatus(str, enum.Enum):
    UNVERIFIED = "unverified"
    VERIFIED = "verified"
    NOT_REPRODUCIBLE = "not_reproducible"
    FALSE_POSITIVE = "false_positive"
    ERROR = "error"
    NOT_TESTED = "not_tested"


class ConfidenceLevel(str, enum.Enum):
    VERY_LOW = "very_low"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"
    CONFIRMED = "confirmed"


class PipelineStage(str, enum.Enum):
    RECONNAISSANCE = "reconnaissance"
    ASSET_DISCOVERY = "asset_discovery"
    FINGERPRINTING = "fingerprinting"
    CRAWLING = "crawling"
    ENUMERATION = "enumeration"
    PASSIVE_SCAN = "passive_scan"
    ACTIVE_SCAN = "active_scan"
    DEEP_SCAN = "deep_scan"
    VERIFICATION = "verification"
    AI_ANALYSIS = "ai_analysis"
    REPORT_GENERATION = "report_generation"


class PipelinePhase(str, enum.Enum):
    PRE_SCAN = "pre_scan"
    DATA_GATHERING = "data_gathering"
    VULNERABILITY_DETECTION = "vulnerability_detection"
    VALIDATION = "validation"
    POST_PROCESSING = "post_processing"


class NotificationChannel(str, enum.Enum):
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    SMS = "sms"
    IN_APP = "in_app"
    PUSH = "push"
    TEAMS = "teams"
    DISCORD = "discord"
    PAGERDUTY = "pagerduty"
    OPSGENIE = "opsgenie"


class NotificationType(str, enum.Enum):
    SCAN_COMPLETED = "scan_completed"
    SCAN_FAILED = "scan_failed"
    FINDING_CRITICAL = "finding_critical"
    FINDING_VERIFIED = "finding_verified"
    REPORT_READY = "report_ready"
    WORKER_OFFLINE = "worker_offline"
    PLUGIN_UPDATE = "plugin_update"
    SYSTEM_ALERT = "system_alert"
    SCHEDULE_TRIGGERED = "schedule_triggered"
    USER_INVITED = "user_invited"
    API_KEY_EXPIRING = "api_key_expiring"
    BILLING_ALERT = "billing_alert"


class WorkerStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"
    DEGRADED = "degraded"
    DISABLED = "disabled"
    UNREACHABLE = "unreachable"


class PluginStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    INSTALLING = "installing"
    UPDATING = "updating"
    ERROR = "error"
    DISABLED = "disabled"
    BUILDING = "building"
    WARNING = "warning"


class ExecutionLanguage(str, enum.Enum):
    PYTHON = "python"
    GO = "go"
    RUST = "rust"
    BINARY = "binary"
    DOCKER = "docker"
    NODE = "node"
    BASH = "bash"


class ProxyProtocol(str, enum.Enum):
    HTTP = "http"
    HTTPS = "https"
    SOCKS4 = "socks4"
    SOCKS5 = "socks5"


class ProxyStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    TESTING = "testing"
    BANNED = "banned"
    ERROR = "error"


class ReportStatus(str, enum.Enum):
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"
    EXPIRED = "expired"


class ReportFormat(str, enum.Enum):
    PDF = "pdf"
    HTML = "html"
    DOCX = "docx"
    XLSX = "xlsx"
    JSON = "json"
    CSV = "csv"


class AssetType(str, enum.Enum):
    DOMAIN = "domain"
    IP = "ip"
    URL = "url"
    SUBNET = "subnet"
    CERTIFICATE = "certificate"
    GITHUB_REPO = "github_repo"
    CLOUD_ACCOUNT = "cloud_account"
    API_ENDPOINT = "api_endpoint"
    MOBILE_APP = "mobile_app"
    CODE_REPOSITORY = "code_repository"


class LicenseType(str, enum.Enum):
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"
    CUSTOM = "custom"


class OrganizationTier(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    GOVERNMENT = "government"
    MANAGED = "managed"


class ApiKeyType(str, enum.Enum):
    STANDARD = "standard"
    SERVICE_ACCOUNT = "service_account"
    PERSONAL_ACCESS = "personal_access"
    READ_ONLY = "read_only"


class ScanPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class AuthProvider(str, enum.Enum):
    LOCAL = "local"
    GOOGLE = "google"
    GITHUB = "github"
    MICROSOFT = "microsoft"
    AZURE_AD = "azure_ad"
    LDAP = "ldap"
    SAML = "saml"
    OIDC = "oidc"
    MAGIC_LINK = "magic_link"


class MFAMethod(str, enum.Enum):
    TOTP = "totp"
    SMS = "sms"
    EMAIL = "email"
    WEBAUTHN = "webauthn"
    BACKUP_CODES = "backup_codes"


class AttackChainType(str, enum.Enum):
    XSS_HIJACK = "xss_hijack"
    SQLI_EXTRACT = "sqli_extract"
    SSRF_CLOUD = "ssrf_cloud"
    LFI_RCE = "lfi_rce"
    XXE = "xxe"
    CSRF_TOKEN = "csrf_token"
    AUTH_BYPASS = "auth_bypass"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    LATERAL_MOVEMENT = "lateral_movement"
    DATA_EXFIL = "data_exfil"
    CUSTOM = "custom"
