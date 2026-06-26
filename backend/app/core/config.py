"""
Enterprise Configuration Management
Environment-based configuration using Pydantic Settings v2.
Supports .env files, environment variables, and secret management.
"""
from __future__ import annotations

import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class AuthProvider(str, Enum):
    JWT = "jwt"
    OAUTH2 = "oauth2"
    OIDC = "oidc"
    LDAP = "ldap"
    SAML = "saml"
    MAGIC_LINK = "magic_link"


class QueueProvider(str, Enum):
    RABBITMQ = "rabbitmq"
    NATS = "nats"
    REDIS = "redis"


class StorageProvider(str, Enum):
    S3 = "s3"
    MINIO = "minio"
    LOCAL = "local"


class DatabaseProvider(str, Enum):
    POSTGRESQL = "postgresql"
    TIMESCALEDB = "timescaledb"
    CLICKHOUSE = "clickhouse"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────
    APP_NAME: str = "V8 Platform API"
    APP_VERSION: str = "0.1.0"
    APP_DESCRIPTION: str = "V8 Neural Exploitation Platform — Enterprise Vulnerability Management"
    ENVIRONMENT: Environment = Environment.DEVELOPMENT
    DEBUG: bool = False
    API_PREFIX: str = "/api/v1"
    DOCS_URL: str = "/docs"
    OPENAPI_URL: str = "/openapi.json"
    REDOC_URL: str = "/redoc"
    CORS_ORIGINS: List[str] = ["*"]
    CORS_CREDENTIALS: bool = True

    # ── Server ───────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB
    REQUEST_TIMEOUT: int = 120
    KEEPALIVE_TIMEOUT: int = 65

    # ── Database ─────────────────────────────────────────────────────────
    DATABASE_URL: Optional[str] = None
    DATABASE_PROVIDER: DatabaseProvider = DatabaseProvider.POSTGRESQL
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 1800
    DATABASE_ECHO: bool = False
    DATABASE_SSL: bool = False
    DATABASE_STATEMENT_TIMEOUT: int = 30000  # 30s

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "v8platform"
    DB_USER: str = "v8"
    DB_PASSWORD: str = "v8password"

    # ── Redis ────────────────────────────────────────────────────────────
    REDIS_URL: Optional[str] = None
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None
    REDIS_SSL: bool = False
    REDIS_TIMEOUT: int = 5

    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        password_part = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        protocol = "rediss" if self.REDIS_SSL else "redis"
        return f"{protocol}://{password_part}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # ── Cache ────────────────────────────────────────────────────────────
    CACHE_TTL: int = 300  # 5 min default
    CACHE_PREFIX: str = "v8:"
    CACHE_ENABLED: bool = True

    # ── Queue / Message Bus ─────────────────────────────────────────────
    QUEUE_PROVIDER: QueueProvider = QueueProvider.RABBITMQ
    RABBITMQ_URL: Optional[str] = None
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASSWORD: str = "guest"
    RABBITMQ_VHOST: str = "/"

    @property
    def rabbitmq_url(self) -> str:
        if self.RABBITMQ_URL:
            return self.RABBITMQ_URL
        return f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/{self.RABBITMQ_VHOST}"

    NATS_URL: Optional[str] = None
    NATS_HOST: str = "localhost"
    NATS_PORT: int = 4222

    @property
    def nats_url(self) -> str:
        if self.NATS_URL:
            return self.NATS_URL
        return f"nats://{self.NATS_HOST}:{self.NATS_PORT}"

    # ── Celery ───────────────────────────────────────────────────────────
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None
    CELERY_TASK_SERIALIZER: str = "json"
    CELERY_RESULT_SERIALIZER: str = "json"
    CELERY_ACCEPT_CONTENT: List[str] = ["json"]
    CELERY_TASK_TRACK_STARTED: bool = True
    CELERY_TASK_TIME_LIMIT: int = 3600
    CELERY_TASK_SOFT_TIME_LIMIT: int = 3540
    CELERY_WORKER_CONCURRENCY: int = 10
    CELERY_WORKER_PREFETCH_MULTIPLIER: int = 1
    CELERY_TASK_ACKS_LATE: bool = True
    CELERY_TASK_REJECT_ON_WORKER_LOST: bool = True
    CELERY_TASK_RETRY_MAX_RETRIES: int = 3
    CELERY_TASK_RETRY_DELAY: int = 60

    # ── Auth & Security ──────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production-use-a-strong-random-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ISSUER: str = "v8-platform"
    JWT_AUDIENCE: str = "v8-platform-api"

    # OAuth2
    OAUTH2_ENABLED: bool = False
    OAUTH2_GOOGLE_CLIENT_ID: Optional[str] = None
    OAUTH2_GOOGLE_CLIENT_SECRET: Optional[str] = None
    OAUTH2_GITHUB_CLIENT_ID: Optional[str] = None
    OAUTH2_GITHUB_CLIENT_SECRET: Optional[str] = None
    OAUTH2_MICROSOFT_CLIENT_ID: Optional[str] = None
    OAUTH2_MICROSOFT_CLIENT_SECRET: Optional[str] = None
    OAUTH2_AZURE_TENANT_ID: Optional[str] = None

    # OpenID Connect
    OIDC_ENABLED: bool = False
    OIDC_PROVIDER_URL: Optional[str] = None
    OIDC_CLIENT_ID: Optional[str] = None
    OIDC_CLIENT_SECRET: Optional[str] = None

    # LDAP
    LDAP_ENABLED: bool = False
    LDAP_SERVER_URL: Optional[str] = None
    LDAP_BASE_DN: Optional[str] = None
    LDAP_BIND_USER: Optional[str] = None
    LDAP_BIND_PASSWORD: Optional[str] = None
    LDAP_USER_SEARCH_FILTER: str = "(uid={username})"

    # SAML
    SAML_ENABLED: bool = False
    SAML_ACS_URL: Optional[str] = None
    SAML_ENTITY_ID: Optional[str] = None
    SAML_IDP_METADATA_URL: Optional[str] = None
    SAML_X509_CERT: Optional[str] = None

    # Password Policy
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_NUMBERS: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True
    PASSWORD_HISTORY_SIZE: int = 5
    PASSWORD_EXPIRE_DAYS: int = 90
    PASSWORD_MAX_FAILED_ATTEMPTS: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30

    # MFA
    MFA_ENABLED: bool = True
    MFA_REQUIRED: bool = False
    MFA_ISSUER: str = "V8 Platform"
    WEBAUTHN_ENABLED: bool = True
    WEBAUTHN_RP_NAME: str = "V8 Platform"
    WEBAUTHN_RP_ID: Optional[str] = None
    WEBAUTHN_ORIGIN: Optional[str] = None

    # ── Rate Limiting ────────────────────────────────────────────────────
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "60/minute"
    RATE_LIMIT_AUTH: str = "5/15minute"
    RATE_LIMIT_SCANS: str = "10/minute"
    RATE_LIMIT_HEAVY: str = "10/minute"
    RATE_LIMIT_STRATEGY: str = "fixed-window"

    # ── Storage (S3/MinIO) ────────────────────────────────────────────────
    STORAGE_PROVIDER: StorageProvider = StorageProvider.MINIO
    STORAGE_BUCKET: str = "v8-platform"
    STORAGE_REGION: str = "us-east-1"
    STORAGE_ACCESS_KEY: Optional[str] = None
    STORAGE_SECRET_KEY: Optional[str] = None
    STORAGE_ENDPOINT_URL: Optional[str] = None
    STORAGE_SSL: bool = False
    STORAGE_EXPIRATION_DAYS: int = 90
    STORAGE_MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB

    # MinIO specific
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False

    # ── Search / Analytics ───────────────────────────────────────────────
    OPENSEARCH_HOST: Optional[str] = None
    OPENSEARCH_PORT: int = 9200
    OPENSEARCH_USE_SSL: bool = False
    OPENSEARCH_VERIFY_CERTS: bool = False
    OPENSEARCH_USER: Optional[str] = None
    OPENSEARCH_PASSWORD: Optional[str] = None
    OPENSEARCH_INDEX_PREFIX: str = "v8-"

    CLICKHOUSE_HOST: Optional[str] = None
    CLICKHOUSE_PORT: int = 8123
    CLICKHOUSE_DB: str = "v8_analytics"
    CLICKHOUSE_USER: Optional[str] = None
    CLICKHOUSE_PASSWORD: Optional[str] = None

    TIMESCALEDB_URL: Optional[str] = None

    # ── AI / ML ──────────────────────────────────────────────────────────
    AI_ENABLED: bool = True
    AI_PROVIDER: str = "openai"
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4-turbo"
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-3-opus-20240229"
    AI_ANALYSIS_TIMEOUT: int = 120
    AI_MAX_RETRIES: int = 3
    AI_BATCH_SIZE: int = 10

    # ── Observability ───────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = None
    SENTRY_ENVIRONMENT: Optional[str] = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1
    SENTRY_PROFILES_SAMPLE_RATE: float = 0.1

    OTLP_ENDPOINT: Optional[str] = None
    OTLP_HEADERS: Optional[str] = None

    PROMETHEUS_ENABLED: bool = True
    PROMETHEUS_PORT: int = 9090

    LOG_LEVEL: LogLevel = LogLevel.INFO
    LOG_FORMAT: str = "json"  # json, console
    LOG_INCLUDE_TRACE_ID: bool = True

    # ── Audit ────────────────────────────────────────────────────────────
    AUDIT_ENABLED: bool = True
    AUDIT_RETENTION_DAYS: int = 365
    AUDIT_IMMUTABLE: bool = True
    AUDIT_EXCLUDED_PATHS: Set[str] = {"/health", "/healthz", "/metrics", "/livez", "/readyz"}

    # ── Organizations & Multi-Tenancy ────────────────────────────────────
    DEFAULT_MAX_PROJECTS: int = 5
    DEFAULT_MAX_MEMBERS: int = 10
    DEFAULT_MAX_SCANS_PER_DAY: int = 100
    DEFAULT_MAX_STORAGE_GB: int = 10
    DEFAULT_MAX_API_KEYS: int = 5
    DEFAULT_MAX_WORKERS: int = 3
    DEFAULT_MAX_PLUGINS: int = 10
    ORGANIZATION_AUTO_CREATE: bool = True
    ORGANIZATION_DEFAULT_TIER: str = "free"

    # ── Jobs / Scheduler ─────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_HEARTBEAT_INTERVAL: int = 30
    SCHEDULER_MAX_CONCURRENT_JOBS: int = 50
    SCHEDULER_JOB_RETENTION_DAYS: int = 30
    SCHEDULER_CLEANUP_INTERVAL: int = 3600

    # ── WebSocket ────────────────────────────────────────────────────────
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MAX_CONNECTIONS: int = 10000
    WS_MESSAGE_MAX_SIZE: int = 256 * 1024  # 256KB

    # ── Notifications ────────────────────────────────────────────────────
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: str = "noreply@v8platform.com"
    SMTP_USE_TLS: bool = True
    SMTP_TIMEOUT: int = 10

    WEBHOOK_ENABLED: bool = True
    WEBHOOK_RETRY_MAX: int = 3
    WEBHOOK_RETRY_DELAY: int = 60
    WEBHOOK_TIMEOUT: int = 10

    # ── Feature Flags ────────────────────────────────────────────────────
    FEATURE_SCAN_SCHEDULING: bool = True
    FEATURE_AI_ANALYSIS: bool = True
    FEATURE_ATTACK_CHAINS: bool = True
    FEATURE_CROSS_TOOL_VALIDATION: bool = True
    FEATURE_PLUGIN_MARKETPLACE: bool = True
    FEATURE_WORKER_DISTRIBUTION: bool = True
    FEATURE_REPORT_SCHEDULING: bool = True
    FEATURE_OBSERVABILITY: bool = True
    FEATURE_GRAPHQL: bool = False
    FEATURE_LDAP_AUTH: bool = False
    FEATURE_SAML_AUTH: bool = False
    FEATURE_MFA: bool = True
    FEATURE_BILLING: bool = False

    # ── Temporal / Workflow Engine ────────────────────────────────────────
    TEMPORAL_ENABLED: bool = False
    TEMPORAL_HOST: str = "localhost"
    TEMPORAL_PORT: int = 7233
    TEMPORAL_NAMESPACE: str = "v8-platform"
    TEMPORAL_TASK_QUEUE: str = "v8-tasks"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str] | str:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    @field_validator("AUDIT_EXCLUDED_PATHS", mode="before")
    @classmethod
    def parse_audit_excluded_paths(cls, v: Any) -> Set[str]:
        if isinstance(v, str):
            return {p.strip() for p in v.split(",")}
        return v

    @model_validator(mode="after")
    def validate_environment(self) -> "Settings":
        if self.ENVIRONMENT == Environment.PRODUCTION:
            if self.JWT_SECRET == "change-me-in-production-use-a-strong-random-secret":
                raise ValueError(
                    "JWT_SECRET must be changed from default in production. "
                    "Generate a strong random secret using: openssl rand -hex 64"
                )
            if self.DATABASE_URL and "sqlite" in self.DATABASE_URL:
                raise ValueError("SQLite is not supported in production. Use PostgreSQL.")
            if not self.SENTRY_DSN:
                raise ValueError("SENTRY_DSN is required in production.")
        return self

    def is_development(self) -> bool:
        return self.ENVIRONMENT == Environment.DEVELOPMENT

    def is_production(self) -> bool:
        return self.ENVIRONMENT == Environment.PRODUCTION

    def is_testing(self) -> bool:
        return self.ENVIRONMENT == Environment.TESTING


settings = Settings()

# Resolve paths relative to project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
