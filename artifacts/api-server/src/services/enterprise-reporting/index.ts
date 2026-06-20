// ---------------------------------------------------------------------------
// Enterprise Reporting Engine — Barrel Exports
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
export { generateAllCharts, getChartStyle } from "./report-charts";

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
} from "./types";

export { DEFAULT_BRANDING } from "./types";
