import uuid
from datetime import datetime
from typing import Dict, List, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON, Index, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_id: Mapped[str | None] = mapped_column(PGUUID(as_uuid=False), ForeignKey("scans.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_type: Mapped[str] = mapped_column(String(50), nullable=False, default="scan")
    format: Mapped[str] = mapped_column(String(10), nullable=False, default="pdf")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="generating", index=True)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    download_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    include_executive_summary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_technical_details: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_remediation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_charts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_attack_chains: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    template: Mapped[str | None] = mapped_column(String(100), nullable=True, default="default")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    __table_args__ = (Index("ix_reports_status", "status"), Index("ix_reports_organization_id", "organization_id"))
