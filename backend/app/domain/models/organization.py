"""
Organization model with multi-tenant support.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
    Index,
    UniqueConstraint,
    CheckConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tier: Mapped[str] = mapped_column(String(50), nullable=False, default="free", index=True)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    website: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Limits
    max_projects: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_members: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_scans_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    max_storage_gb: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_api_keys: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_workers: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    max_plugins: Mapped[int] = mapped_column(Integer, nullable=False, default=10)

    # Branding
    primary_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    secondary_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    custom_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    custom_footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Features (JSON blob for feature flags)
    features: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)

    # Billing
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_plan: Mapped[str | None] = mapped_column(String(50), nullable=True)
    billing_cycle: Mapped[str | None] = mapped_column(String(20), nullable=True, default="monthly")
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Notification defaults
    default_notification_channels: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)

    # Audit fields
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Relationships
    projects = relationship("Project", back_populates="organization", lazy="selectin")
    members = relationship("User", back_populates="organization", lazy="selectin")
    api_keys = relationship("ApiKey", back_populates="organization", lazy="selectin")
    audit_logs = relationship("AuditLog", back_populates="organization", lazy="selectin")
    notifications = relationship("Notification", back_populates="organization", lazy="selectin")

    __table_args__ = (
        Index("ix_organizations_slug", "slug"),
        Index("ix_organizations_tier", "tier"),
        Index("ix_organizations_is_active", "is_active"),
        Index("ix_organizations_created_at", "created_at"),
        CheckConstraint("max_projects > 0", name="ck_org_max_projects"),
        CheckConstraint("max_members > 0", name="ck_org_max_members"),
    )

    def __repr__(self) -> str:
        return f"<Organization {self.name} ({self.slug})>"
