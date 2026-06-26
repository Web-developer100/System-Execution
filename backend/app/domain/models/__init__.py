"""
SQLAlchemy 2.x domain models for the V8 Platform.
All models include:
- UUID primary keys
- Created At / Updated At
- Created By / Updated By
- Soft Delete
- Version Number
- Audit fields
- Indexes
- Foreign Keys
- Constraints
"""
from app.domain.models.organization import Organization
from app.domain.models.user import User
from app.domain.models.role import Role, Permission
from app.domain.models.project import Project
from app.domain.models.asset import Asset, AssetTag
from app.domain.models.scan import Scan, ScanTask, TaskResult
from app.domain.models.finding import Finding, FindingEvidence
from app.domain.models.report import Report
from app.domain.models.notification import Notification
from app.domain.models.audit_log import AuditLog
from app.domain.models.plugin import Plugin, PluginVersion, PluginConfiguration
from app.domain.models.worker import Worker, WorkerHealth
from app.domain.models.schedule import Schedule
from app.domain.models.api_key import ApiKey
from app.domain.models.session import Session
from app.domain.models.oauth_account import OAuthAccount
from app.domain.models.integration import Integration
from app.domain.models.license import License
from app.domain.models.comment import Comment
from app.domain.models.attachment import Attachment
from app.domain.models.feature_flag import FeatureFlag
from app.domain.models.secret import Secret
from app.domain.models.ai_analysis import AiAnalysis
from app.domain.models.attack_chain import AttackChain
from app.domain.models.verification_result import VerificationResult
from app.domain.models.activity_timeline import ActivityTimeline

__all__ = [
    "Organization",
    "User",
    "Role",
    "Permission",
    "Project",
    "Asset",
    "AssetTag",
    "Scan",
    "ScanTask",
    "TaskResult",
    "Finding",
    "FindingEvidence",
    "Report",
    "Notification",
    "AuditLog",
    "Plugin",
    "PluginVersion",
    "PluginConfiguration",
    "Worker",
    "WorkerHealth",
    "Schedule",
    "ApiKey",
    "Session",
    "OAuthAccount",
    "Integration",
    "License",
    "Comment",
    "Attachment",
    "FeatureFlag",
    "Secret",
    "AiAnalysis",
    "AttackChain",
    "VerificationResult",
    "ActivityTimeline",
]
