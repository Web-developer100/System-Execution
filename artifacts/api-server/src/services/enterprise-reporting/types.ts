// ---------------------------------------------------------------------------
// Enterprise Reporting Engine — Shared Types
// ---------------------------------------------------------------------------

export type ReportFormat = "pdf" | "docx" | "html" | "md" | "json" | "csv" | "xml" | "sarif" | "openvex" | "cyclonedx" | "spdx" | "xlsx" | "txt" | "zip";

export type ReportCategory =
  | "executive" | "technical" | "developer" | "soc" | "management"
  | "compliance" | "vulnerability" | "asset" | "scan" | "api_security"
  | "cloud_security" | "container_security" | "kubernetes"
  | "infrastructure" | "source_code" | "dependency" | "sbom"
  | "threat_intelligence" | "custom";

export type ComplianceFramework =
  | "owasp_top10" | "owasp_api_top10" | "pci_dss" | "iso_27001"
  | "soc2" | "hipaa" | "gdpr" | "nist_csf" | "nist_800_53"
  | "cis_benchmarks" | "mitre_attack" | "mitre_d3fend"
  | "disa_stig" | "fedramp" | "cyber_essentials" | "custom";

export type DeliveryMethod =
  | "email" | "slack" | "discord" | "microsoft_teams"
  | "webhook" | "sftp" | "s3" | "azure_blob" | "gcs"
  | "ftp" | "shared_folder" | "rest_api";

export type CronFrequency =
  | "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
  | "after_scan" | "after_verification" | "after_ai_analysis"
  | "custom";

export interface ReportBranding {
  companyName: string;
  companyLogo: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  headerText: string;
  footerText: string;
  watermark: string | null;
  coverPage: string | null;
  disclaimer: string | null;
  contactInfo: string | null;
  legalNotice: string | null;
  classificationLabel: string;
}

export interface ReportRequest {
  scanId: number;
  category: ReportCategory;
  formats: ReportFormat[];
  branding?: Partial<ReportBranding>;
  complianceFrameworks?: ComplianceFramework[];
  templateName?: string;
  includeCharts?: boolean;
  includeEvidence?: boolean;
  includeRemediation?: boolean;
  includeAiAnalysis?: boolean;
  maxFindings?: number;
  redactSensitive?: boolean;
  password?: string;
  classification?: string;
}

export interface ReportResult {
  id: string;
  scanId: number;
  category: ReportCategory;
  formats: ReportFormat[];
  files: ReportFile[];
  version: string;
  createdAt: Date;
  durationMs: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  riskScore: number;
  branding: ReportBranding;
}

export interface ReportFile {
  format: ReportFormat;
  filename: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
}

export interface ReportSchedule {
  id: string;
  scanId: number;
  category: ReportCategory;
  formats: ReportFormat[];
  frequency: CronFrequency;
  cronExpression: string | null;
  deliveryMethods: DeliveryMethod[];
  deliveryConfig: Record<string, string>;
  enabled: boolean;
  lastGenerated: Date | null;
  nextGeneration: Date | null;
  createdAt: Date;
}

export interface ComplianceMapping {
  framework: ComplianceFramework;
  findings: Array<{
    vulnerabilityId: number;
    title: string;
    control: string;
    status: "compliant" | "non_compliant" | "not_applicable" | "requires_review";
  }>;
  totalControls: number;
  passedControls: number;
  failedControls: number;
  coverage: number;
}

export interface ChartData {
  type: "severity_distribution" | "risk_heatmap" | "cvss_distribution" | "trend" | "compliance" | "timeline";
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
  }>;
}

export interface AiReportContent {
  executiveSummary: string;
  riskNarrative: string;
  businessImpact: string;
  remediationSummary: string;
  developerExplanation: string;
  attackChainDescription: string;
  prioritizationRecommendations: string[];
  complianceGapAnalysis: string;
  nextActions: string[];
  securityPostureAssessment: string;
}

export const DEFAULT_BRANDING: ReportBranding = {
  companyName: "V8 Platform",
  companyLogo: null,
  primaryColor: "#22d3ee",
  secondaryColor: "#10b981",
  fontFamily: "system-ui, -apple-system, sans-serif",
  headerText: "V8 Neural Exploitation Platform",
  footerText: "CONFIDENTIAL — V8 Security Assessment Report",
  watermark: null,
  coverPage: null,
  disclaimer: null,
  contactInfo: null,
  legalNotice: null,
  classificationLabel: "INTERNAL",
};
