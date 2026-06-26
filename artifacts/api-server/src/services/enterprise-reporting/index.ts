// ---------------------------------------------------------------------------
// Enterprise Reporting Engine — Barrel Exports ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------

export { ReportEngine, reportEngine } from "./report-engine";
export { ReportScheduler } from "./report-scheduler";
export { ReportDelivery, reportDelivery } from "./report-delivery";
export { generateAiReportContent, clearAiContentCache } from "./ai-content";
export {
  generateExecutiveReport,
  generateTechnicalReport,
  generateDeveloperReport,
  generateComplianceReport,
  generateSarifReport,
  generateCsvReport,
  generateJsonReport,
  generateXmlReport,
} from "./report-templates";
export {
  generateSocReport,
  generateManagementReport,
  generateAssetReport,
  generateScanReport,
  generateApiSecurityReport,
  generateCloudSecurityReport,
  generateContainerSecurityReport,
  generateKubernetesReport,
  generateInfrastructureReport,
  generateSourceCodeReport,
  generateDependencyReport,
  generateSbomReport,
  generateThreatIntelligenceReport,
} from "./templates/category-templates";
export { generateAllCharts, getChartStyle } from "./report-charts";
export { generateTextReport } from "./formats/txt-generator";
export { generateXlsxReport } from "./formats/xlsx-generator";
export { generateDocxReport } from "./formats/docx-generator";
export { generateOpenVexReport } from "./formats/openvex-generator";
export { generateCyclonedxReport } from "./formats/cyclonedx-generator";
export { generateSpdxReport } from "./formats/spdx-generator";
export { createZipArchive } from "./formats/zip-archiver";
export { generateComplianceMappings, FRAMEWORK_DISPLAY_NAMES } from "./compliance-frameworks";
export { localizationService, LocalizationService } from "./localization";
export { digitalSignatureService, DigitalSignatureService } from "./digital-signature";
export { reportEncryption, ReportEncryptionService } from "./encryption";
export { reportVersionControl, ReportVersionControl } from "./version-control";
export { templateRegistry, TemplateRegistry } from "./template-registry";

export type {
  ReportFormat,
  ReportCategory,
  ComplianceFramework,
  DeliveryMethod,
  CronFrequency,
  ReportBranding,
  ReportRequest,
  ReportResult,
  ReportFile,
  ReportSchedule,
  ComplianceMapping,
  ChartData,
  AiReportContent,
  ReportLanguage,
  TemplateStyle,
  ReportClassification,
  ReportStatus,
  DigitalSignature,
  ReportHistoryEntry,
  LocalizedStrings,
  TemplateDefinition,
  FindingLayout,
  ReportMetadata,
} from "./types";

export { DEFAULT_BRANDING, TEMPLATE_DEFINITIONS } from "./types";
