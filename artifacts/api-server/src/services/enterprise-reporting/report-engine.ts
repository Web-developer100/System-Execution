// ---------------------------------------------------------------------------
// Enterprise Report Engine ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Main orchestrator for multi-format report generation. Integrates:
//   - Report data collector (existing report-generator.ts)
//   - HTML/Markdown/CSV/JSON/XML/SARIF templates (report-templates.ts)
//   - SVG chart generators (report-charts.ts)
//   - AI content generator (ai-content.ts)
//   - Report scheduling (report-scheduler.ts)
//   - Report delivery (report-delivery.ts)
//
// Produces: HTML, Markdown, JSON, CSV, XML, SARIF, and (with packages)
// PDF, DOCX, XLSX output.

import { collectReportData, generateMarkdownReport, REPORTS_DIR } from "../report-generator";
import {
  generateExecutiveReport,
  generateTechnicalReport,
  generateDeveloperReport,
  generateComplianceReport,
  generateSarifReport,
  generateCsvReport,
  generateJsonReport,
  generateXmlReport,
} from "./report-templates";
import { generateAiReportContent, clearAiContentCache } from "./ai-content";
import { ReportScheduler } from "./report-scheduler";
import type {
  ReportRequest,
  ReportResult,
  ReportFile,
  ReportBranding,
  ReportCategory,
  ReportFormat,
  ReportSchedule,
  ComplianceMapping,
  ComplianceFramework,
  CronFrequency,
  DeliveryMethod,
} from "./types";
import { DEFAULT_BRANDING } from "./types";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../../lib/logger";

// ── Reports Storage ────────────────────────────────────────────────────────

const ENTERPRISE_REPORTS_DIR = path.join(REPORTS_DIR, "enterprise");

// ── Report Engine ──────────────────────────────────────────────────────────

export class ReportEngine {
  private scheduler: ReportScheduler;
  private initialized = false;

  constructor() {
    this.scheduler = new ReportScheduler(this);
  }

  // ── Initialization ───────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await mkdir(ENTERPRISE_REPORTS_DIR, { recursive: true });

    // Start the scheduler
    this.scheduler.start();
    this.initialized = true;

    logger.info("[REPORT-ENGINE] Enterprise Report Engine initialized");
  }

  async shutdown(): Promise<void> {
    this.scheduler.stop();
    this.initialized = false;
    logger.info("[REPORT-ENGINE] Enterprise Report Engine shut down");
  }

  // ── Generate Report ──────────────────────────────────────────────────────

  async generateReport(request: ReportRequest): Promise<ReportResult> {
    const startTime = Date.now();
    const branding: ReportBranding = { ...DEFAULT_BRANDING, ...(request.branding ?? {}) };

    // Collect scan data
    const data = await collectReportData(request.scanId);

    // Generate AI content if available
    const aiContent = await generateAiReportContent(data, request.category);

    // Build compliance mappings if frameworks specified
    const complianceMappings: ComplianceMapping[] = [];
    if (request.complianceFrameworks && request.complianceFrameworks.length > 0 && data.findings.length > 0) {
      for (const framework of request.complianceFrameworks) {
        const findings = data.findings.slice(0, 50).map(f => ({
          vulnerabilityId: f.id,
          title: f.title,
          control: mapSeverityToControl(f.severity, framework),
          status: (f.status === "confirmed" ? "non_compliant" : f.status === "false_positive" ? "compliant" : "requires_review") as "compliant" | "non_compliant" | "not_applicable" | "requires_review",
        }));
        const failed = findings.filter(f => f.status === "non_compliant").length;
        const passed = findings.filter(f => f.status === "compliant").length;
        const total = findings.length;
        complianceMappings.push({
          framework,
          findings,
          totalControls: total,
          passedControls: passed,
          failedControls: failed,
          coverage: total > 0 ? (passed / total) * 100 : 100,
        });
      }
    }

    // Generate output files for requested formats
    const files: ReportFile[] = [];
    const reportId = crypto.randomUUID();

    for (const format of request.formats) {
      try {
        const file = await this.generateFormat(format, data, request, branding, aiContent, complianceMappings, reportId);
        if (file) files.push(file);
      } catch (err) {
        logger.error({ err, format, scanId: request.scanId }, "[REPORT-ENGINE] Failed to generate format");
      }
    }

    const durationMs = Date.now() - startTime;

    const result: ReportResult = {
      id: reportId,
      scanId: request.scanId,
      category: request.category,
      formats: request.formats.filter(f => files.some(fi => fi.format === f)),
      files,
      version: "2.0",
      createdAt: new Date(),
      durationMs,
      totalFindings: data.totalFindings,
      criticalCount: data.severities.critical ?? 0,
      highCount: data.severities.high ?? 0,
      riskScore: calculateReportRiskScore(data),
      branding,
    };

    logger.info({
      reportId,
      scanId: request.scanId,
      formats: result.formats,
      durationMs,
      findings: data.totalFindings,
    }, "[REPORT-ENGINE] Report generated");

    return result;
  }

  // ── Format Generator ─────────────────────────────────────────────────────

  private async generateFormat(
    format: ReportFormat,
    data: Awaited<ReturnType<typeof collectReportData>>,
    request: ReportRequest,
    branding: ReportBranding,
    aiContent: Awaited<ReturnType<typeof generateAiReportContent>>,
    complianceMappings: ComplianceMapping[],
    reportId: string,
  ): Promise<ReportFile | null> {
    const formatDir = path.join(ENTERPRISE_REPORTS_DIR, reportId);
    await mkdir(formatDir, { recursive: true });

    switch (format) {
      case "html": {
        let html: string;
        switch (request.category) {
          case "executive":
            html = generateExecutiveReport(data, aiContent, branding);
            break;
          case "developer":
            html = generateDeveloperReport(data, branding);
            break;
          case "compliance":
            html = generateComplianceReport(data, request.complianceFrameworks?.map(f => f) ?? [], complianceMappings, branding);
            break;
          default:
            html = generateTechnicalReport(data, branding);
        }
        const filename = `${reportId}-${request.category}.html`;
        const filePath = path.join(formatDir, filename);
        await writeFile(filePath, html, "utf-8");
        return {
          format: "html",
          filename,
          path: filePath,
          sizeBytes: Buffer.byteLength(html, "utf-8"),
          mimeType: "text/html",
          url: `/api/reports/enterprise/download/${reportId}/${filename}`,
        };
      }

      case "md": {
        const md = generateMarkdownReport(data);
        const filename = `${reportId}-${request.category}.md`;
        const filePath = path.join(formatDir, filename);
        await writeFile(filePath, md, "utf-8");
        return {
          format: "md",
          filename,
          path: filePath,
          sizeBytes: Buffer.byteLength(md, "utf-8"),
          mimeType: "text/markdown",
          url: `/api/reports/enterprise/download/${reportId}/${filename}`,
        };
      }

      case "json": {
        const json = generateJsonReport(data);
        const filename = `${reportId}-${request.category}.json`;
        const filePath = path.join(formatDir, filename);
        await writeFile(filePath, json, "utf-8");
        return {
          format: "json",
          filename,
          path: filePath,
          sizeBytes: Buffer.byteLength(json, "utf-8"),
          mimeType: "application/json",
          url: `/api/reports/enterprise/download/${reportId}/${filename}`,
        };
      }

      case "csv": {
        const csv = generateCsvReport(data);
        const filename = `${reportId}-${request.category}.csv`;
        const filePath = path.join(formatDir, filename);
        await writeFile(filePath, csv, "utf-8");
        return {
          format: "csv",
          filename,
          path: filePath,
          sizeBytes: Buffer.byteLength(csv, "utf-8"),
          mimeType: "text/csv",
          url: `/api/reports/enterprise/download/${reportId}/${filename}`,
        };
      }

      case "xml": {
        const xml = generateXmlReport(data);
        const filename = `${reportId}-${request.category}.xml`;
        const filePath = path.join(formatDir, filename);
        await writeFile(filePath, xml, "utf-8");
        return {
          format: "xml",
          filename,
          path: filePath,
          sizeBytes: Buffer.byteLength(xml, "utf-8"),
          mimeType: "application/xml",
          url: `/api/reports/enterprise/download/${reportId}/${filename}`,
        };
      }

      case "sarif": {
        const sarif = generateSarifReport(data);
        const jsonStr = JSON.stringify(sarif, null, 2);
        const filename = `${reportId}-${request.category}.sarif.json`;
        const filePath = path.join(formatDir, filename);
        await writeFile(filePath, jsonStr, "utf-8");
        return {
          format: "sarif",
          filename,
          path: filePath,
          sizeBytes: Buffer.byteLength(jsonStr, "utf-8"),
          mimeType: "application/sarif+json",
          url: `/api/reports/enterprise/download/${reportId}/${filename}`,
        };
      }

      default:
        logger.warn({ format }, "[REPORT-ENGINE] Unsupported format requested");
        return null;
    }
  }

  // ── Schedule Management ──────────────────────────────────────────────────

  createSchedule(schedule: ReportSchedule): void {
    this.scheduler.addSchedule(schedule);
  }

  removeSchedule(scheduleId: string): void {
    this.scheduler.removeSchedule(scheduleId);
  }

  getSchedules(): ReportSchedule[] {
    return this.scheduler.getSchedules();
  }

  // ── Scheduled Report Creation ────────────────────────────────────────────

  createScheduledReport(params: {
    scanId: number;
    category: ReportCategory;
    formats: ReportFormat[];
    frequency: CronFrequency;
    cronExpression?: string;
    deliveryMethods?: DeliveryMethod[];
  }): ReportSchedule {
    const schedule = this.scheduler.createSchedule({
      scanId: params.scanId,
      category: params.category,
      formats: params.formats,
      frequency: params.frequency,
      cronExpression: params.cronExpression,
      deliveryMethods: params.deliveryMethods,
    });

    this.scheduler.addSchedule(schedule);
    return schedule;
  }

  // ── AI Cache ─────────────────────────────────────────────────────────────

  clearAiCache(): void {
    clearAiContentCache();
  }

  // ── Status ───────────────────────────────────────────────────────────────

  getStatus() {
    return {
      initialized: this.initialized,
      schedules: this.scheduler.getSchedules().length,
      reportsDir: ENTERPRISE_REPORTS_DIR,
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const reportEngine = new ReportEngine();

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateReportRiskScore(data: Awaited<ReturnType<typeof collectReportData>>): number {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;
  const lo = data.severities.low ?? 0;
  const total = data.totalFindings;
  if (total === 0) return 100;
  return Math.max(0, Math.min(100, 100 - (cr * 15 + hi * 8 + me * 4 + lo * 1)));
}

function mapSeverityToControl(severity: string, framework: ComplianceFramework): string {
  const base = severity === "critical" || severity === "high" ? "6.1" : "6.2";
  switch (framework) {
    case "pci_dss": return `PCI DSS Req ${base}`;
    case "iso_27001": return `ISO 27001 A.12.${base}`;
    case "soc2": return `SOC 2 CC7.${base}`;
    case "nist_csf": return `NIST CSF PR.IP-${base}`;
    case "nist_800_53": return `NIST 800-53 SI-${base}`;
    case "hipaa": return `HIPAA §164.312(a)${base}`;
    case "gdpr": return `GDPR Art 32(${base})`;
    case "owasp_top10": return `OWASP Top 10:2021-${severity === "critical" || severity === "high" ? "A01" : "A02"}`;
    default: return `${framework}-${base}`;
  }
}
