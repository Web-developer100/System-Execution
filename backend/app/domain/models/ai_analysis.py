import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON, Float, Index, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class AiAnalysis(Base):
    __tablename__ = "ai_analyses"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    vulnerability_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    classification: Mapped[str] = mapped_column(String(50), nullable=False, default="needs_verification")
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cvss_severity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    epss_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    cwe_ids: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    capec_ids: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    mitre_technique_ids: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    attack_vector: Mapped[str | None] = mapped_column(Text, nullable=True)
    exploitability_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    business_impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    remediation_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    remediation_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="unverified")
    poc_request: Mapped[str | None] = mapped_column(Text, nullable=True)
    poc_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    cross_tool_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    analysis_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="ai-engine")
    analysis_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

class AttackChain(Base):
    __tablename__ = "attack_chains"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    chain_type: Mapped[str] = mapped_column(String(50), nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entry_vulnerability: Mapped[str] = mapped_column(String(255), nullable=False)
    entry_vulnerability_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exit_vulnerability: Mapped[str | None] = mapped_column(String(255), nullable=True)
    steps: Mapped[List[Dict[str, Any]] | None] = mapped_column(JSON, nullable=True, default=list)
    visualization_data: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attack_complexity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    prerequisites: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    mitigations: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="detected")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

class VerificationResult(Base):
    __tablename__ = "verification_results"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    vulnerability_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    retest_performed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    retest_payloads: Mapped[List[str] | None] = mapped_column(JSON, nullable=True, default=list)
    retest_request: Mapped[str | None] = mapped_column(Text, nullable=True)
    retest_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    cross_tool_performed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cross_tool_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cross_tool_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    poc_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    poc_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_decision: Mapped[str | None] = mapped_column(String(30), nullable=True)
    decision_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_by: Mapped[str] = mapped_column(String(50), nullable=False, default="ai-engine")
    total_verification_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

class ActivityTimeline(Base):
    __tablename__ = "activity_timeline"
    id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(PGUUID(as_uuid=False), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(PGUUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
