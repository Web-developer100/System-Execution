import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON, Float, Index, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id: Mapped[str | None] = mapped_column(PGUUID(as_uuid=False), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info", index=True)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open", index=True)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    endpoint: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    parameter: Mapped[str | None] = mapped_column(String(500), nullable=True)
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cvss_severity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    epss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cwe_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cve_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    capec_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    owasp_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mitre_technique: Mapped[str | None] = mapped_column(String(100), nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exploit_status: Mapped[str] = mapped_column(String(30), nullable=False, default="unknown")
    verification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="unverified")
    is_false_positive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_remediated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)
    remediation_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    likelihood: Mapped[str | None] = mapped_column(String(20), nullable=True)
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    developer_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    references: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    tags: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    metadata: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    scan = relationship("Scan", back_populates="findings")
    evidence = relationship("FindingEvidence", back_populates="finding", lazy="selectin")
    comments = relationship("Comment", back_populates="finding", lazy="selectin")
    __table_args__ = (
        Index("ix_findings_severity", "severity"),
        Index("ix_findings_status", "status"),
        Index("ix_findings_scan_id", "scan_id"),
        Index("ix_findings_organization_id", "organization_id"),
        Index("ix_findings_cve_id", "cve_id"),
        Index("ix_findings_cvss_score", "cvss_score"),
    )

class FindingEvidence(Base):
    __tablename__ = "finding_evidence"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    finding_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, index=True)
    http_request: Mapped[str | None] = mapped_column(Text, nullable=True)
    http_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    evidence_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_type: Mapped[str] = mapped_column(String(50), nullable=False, default="text")
    tool_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finding = relationship("Finding", back_populates="evidence")
