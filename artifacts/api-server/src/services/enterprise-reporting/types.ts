// ---------------------------------------------------------------------------
// Enterprise Reporting Engine — Shared Types ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Full type definitions for the enterprise reporting platform.

export type ReportFormat =
  | "pdf" | "docx" | "html" | "md" | "json" | "csv" | "xml" | "sarif"
  | "openvex" | "cyclonedx" | "spdx" | "xlsx" | "txt" | "zip";

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

export type ReportLanguage =
  | "en" | "ar" | "zh" | "fr" | "de" | "ja" | "ko" | "pt" | "ru" | "es"
  | "tr" | "nl" | "it" | "pl" | "sv" | "da" | "fi" | "nb" | "cs" | "hu"
  | "ro" | "uk" | "el" | "he" | "hi" | "th" | "vi";

export type TemplateStyle =
  | "executive" | "technical" | "developer" | "compliance"
  | "minimal" | "enterprise" | "dark" | "light"
  | "government" | "financial" | "healthcare" | "custom";

export type ReportStatus =
  | "generating" | "ready" | "failed" | "expired" | "archived" | "deleted";

export type ReportClassification =
  | "internal" | "confidential" | "restricted" | "public" | "secret";

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
  customCss: string | null;
  customFontUrl: string | null;
}

export interface ReportRequest {
  scanId: number;
  category: ReportCategory;
  formats: ReportFormat[];
  branding?: Partial<ReportBranding>;
  complianceFrameworks?: ComplianceFramework[];
  templateName?: string;
  templateStyle?: TemplateStyle;
  language?: ReportLanguage;
  includeCharts?: boolean;
  includeEvidence?: boolean;
  includeRemediation?: boolean;
  includeAiAnalysis?: boolean;
  includeAttackChains?: boolean;
  includeExecutiveSummary?: boolean;
  includeTechnicalDetails?: boolean;
  includeToc?: boolean;
  includeGlossary?: boolean;
  includeReferences?: boolean;
  maxFindings?: number;
  redactSensitive?: boolean;
  password?: string;
  classification?: ReportClassification;
  digitalSignature?: boolean;
  retentionDays?: number;
  tags?: string[];
  createdBy?: string;
}

export interface ReportResult {
  id: string;
  scanId: number;
  category: ReportCategory;
  formats: ReportFormat[];
  files: ReportFile[];
  version: string;
  templateVersion: string;
  scanVersion: string;
  aiModelVersion: string;
  createdAt: Date;
  createdBy: string | null;
  durationMs: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  riskScore: number;
  securityScore: number;
  branding: ReportBranding;
  language: ReportLanguage;
  classification: ReportClassification;
  digitalSignature: DigitalSignature | null;
  checksum: string;
  approvalStatus: "pending" | "approved" | "rejected";
  history: ReportHistoryEntry[];
}

export interface ReportFile {
  format: ReportFormat;
  filename: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
  checksum: string;
  encrypted: boolean;
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
  retentionCount: number;
}

export interface ComplianceMapping {
  framework: ComplianceFramework;
  frameworkDisplayName: string;
  findings: Array<{
    vulnerabilityId: number;
    title: string;
    control: string;
    controlDescription: string;
    status: "compliant" | "non_compliant" | "not_applicable" | "requires_review";
  }>;
  totalControls: number;
  passedControls: number;
  failedControls: number;
  notApplicableControls: number;
  requiresReviewControls: number;
  coverage: number;
  score: number;
}

export interface ChartData {
  type: "severity_distribution" | "risk_heatmap" | "cvss_distribution"
    | "asset_distribution" | "technology_stack" | "attack_surface"
    | "compliance_coverage" | "trend_analysis" | "remediation_progress"
    | "worker_utilization" | "scan_duration" | "vulnerability_timeline"
    | "risk_over_time" | "executive_dashboard" | "mitre_matrix"
    | "owasp_categories" | "plugin_usage" | "cloud_resources"
    | "api_security_overview";
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

export interface DigitalSignature {
  algorithm: string;
  signature: string;
  signedBy: string;
  signedAt: string;
  certificateThumbprint: string | null;
  hashAlgorithm: string;
  reportHash: string;
  verified: boolean;
}

export interface ReportHistoryEntry {
  version: string;
  createdAt: string;
  createdBy: string | null;
  action: "created" | "updated" | "archived" | "restored" | "deleted" | "approved" | "rejected" | "downloaded" | "shared";
  description: string;
}

export interface LocalizedStrings {
  reportTitle: string;
  executiveSummary: string;
  technicalDetails: string;
  findings: string;
  severity: string;
  status: string;
  remediation: string;
  compliance: string;
  appendices: string;
  glossary: string;
  references: string;
  generatedAt: string;
  classification: string;
  page: string;
  of_: string;
  tableOfContents: string;
  methodology: string;
  scope: string;
  assets: string;
  evidence: string;
  timeline: string;
  recommendations: string;
  nextSteps: string;
  riskScore: string;
  securityScore: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  info: string;
  confirmed: string;
  falsePositive: string;
  inconclusive: string;
  pending: string;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  style: TemplateStyle;
  description: string;
  branding: Partial<ReportBranding>;
  darkMode: boolean;
  categories: ReportCategory[];
}

export interface FindingLayout {
  title: string;
  severity: string;
  confidence: number;
  cvssScore: string | null;
  cvssVector: string | null;
  epssProbability: string | null;
  businessImpact: string | null;
  likelihood: string | null;
  affectedAsset: string | null;
  affectedEndpoint: string | null;
  evidence: string | null;
  httpRequest: string | null;
  httpResponse: string | null;
  payload: string | null;
  screenshots: string[];
  verificationResult: string | null;
  aiSummary: string | null;
  developerRecommendation: string | null;
  executiveExplanation: string | null;
  references: string[];
  timeline: string | null;
  status: string;
  tags: string[];
  comments: string[];
  attachments: string[];
}

export interface ReportMetadata {
  id: string;
  scanId: number;
  category: ReportCategory;
  version: string;
  templateVersion: string;
  scanVersion: string;
  aiModelVersion: string;
  createdAt: Date;
  createdBy: string | null;
  generationTime: number;
  approvalStatus: "pending" | "approved" | "rejected";
  digitalSignature: DigitalSignature | null;
  history: ReportHistoryEntry[];
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  retentionDays: number | null;
  expiresAt: Date | null;
  checksum: string;
  fileSize: number;
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
  customCss: null,
  customFontUrl: null,
};

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  { id: "executive", name: "Executive", style: "executive", description: "C-Suite & Board focused report with minimal technical jargon", branding: { primaryColor: "#22d3ee", secondaryColor: "#10b981" }, darkMode: false, categories: ["executive"] },
  { id: "technical", name: "Technical", style: "technical", description: "Full technical details for security engineers", branding: { primaryColor: "#22d3ee", secondaryColor: "#3b82f6" }, darkMode: true, categories: ["technical", "vulnerability", "scan"] },
  { id: "developer", name: "Developer", style: "developer", description: "Code-focused remediation guidance for developers", branding: { primaryColor: "#10b981", secondaryColor: "#22d3ee" }, darkMode: false, categories: ["developer", "source_code"] },
  { id: "compliance", name: "Compliance", style: "compliance", description: "Auditor-ready compliance evidence", branding: { primaryColor: "#8b5cf6", secondaryColor: "#6366f1" }, darkMode: false, categories: ["compliance"] },
  { id: "minimal", name: "Minimal", style: "minimal", description: "Clean, minimal design for quick reviews", branding: { primaryColor: "#64748b", secondaryColor: "#475569" }, darkMode: false, categories: ["executive", "scan", "vulnerability"] },
  { id: "enterprise", name: "Enterprise", style: "enterprise", description: "Premium enterprise-grade layout", branding: { primaryColor: "#f59e0b", secondaryColor: "#d97706" }, darkMode: true, categories: ["executive", "technical", "compliance", "management"] },
  { id: "dark", name: "Dark Theme", style: "dark", description: "Dark mode report for SOC teams", branding: { primaryColor: "#22d3ee", secondaryColor: "#06b6d4" }, darkMode: true, categories: ["technical", "soc", "container_security", "kubernetes"] },
  { id: "light", name: "Light Theme", style: "light", description: "Clean light theme for printing", branding: { primaryColor: "#0284c7", secondaryColor: "#0369a1" }, darkMode: false, categories: ["executive", "compliance", "management"] },
  { id: "government", name: "Government", style: "government", description: "Government-grade report with official styling", branding: { primaryColor: "#1e40af", secondaryColor: "#1d4ed8" }, darkMode: false, categories: ["compliance", "infrastructure"] },
  { id: "financial", name: "Financial", style: "financial", description: "Financial sector report styling", branding: { primaryColor: "#059669", secondaryColor: "#047857" }, darkMode: false, categories: ["compliance", "executive"] },
  { id: "healthcare", name: "Healthcare", style: "healthcare", description: "HIPAA-ready healthcare report", branding: { primaryColor: "#0891b2", secondaryColor: "#0e7490" }, darkMode: false, categories: ["compliance", "executive"] },
];
