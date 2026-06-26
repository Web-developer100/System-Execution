// ---------------------------------------------------------------------------
// Enterprise Report Engine v3.0 ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Main orchestrator for multi-format enterprise report generation.
// Integrates all format generators, services, compliance, and delivery.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { collectReportData, REPORTS_DIR } from "../report-generator";
import {
  generateExecutiveReport, generateTechnicalReport, generateDeveloperReport,
  generateComplianceReport, generateSarifReport, generateCsvReport,
  generateJsonReport, generateXmlReport,
} from "./report-templates";
import {
  generateSocReport, generateManagementReport, generateAssetReport,
  generateScanReport, generateApiSecurityReport, generateCloudSecurityReport,
  generateContainerSecurityReport, generateKubernetesReport,
  generateInfrastructureReport, generateSourceCodeReport,
  generateDependencyReport, generateSbomReport, generateThreatIntelligenceReport,
} from "./templates/category-templates";
import { generateAiReportContent, clearAiContentCache } from "./ai-content";
import { ReportScheduler } from "./report-scheduler";
import { generateTextReport } from "./formats/txt-generator";
import { createZipArchive } from "./formats/zip-archiver";
import { generateSpdxReport } from "./formats/spdx-generator";
import { generateOpenVexReport } from "./formats/openvex-generator";
import { generateCyclonedxReport } from "./formats/cyclonedx-generator";
import { generateComplianceMappings } from "./compliance-frameworks";
import { localizationService } from "./localization";
import { digitalSignatureService } from "./digital-signature";
import { reportEncryption } from "./encryption";
import { reportVersionControl } from "./version-control";
import { templateRegistry } from "./template-registry";
import type {
  ReportRequest, ReportResult, ReportFile, ReportBranding,
  ReportCategory, ReportFormat, ComplianceMapping, ReportSchedule,
  CronFrequency, DeliveryMethod, ReportLanguage, ReportClassification,
  DigitalSignature, ReportHistoryEntry, TemplateStyle,
} from "./types";
import { DEFAULT_BRANDING } from "./types";
import { logger } from "../../lib/logger";

// ── Reports Storage ────────────────────────────────────────────────────────

const ENTERPRISE_REPORTS_DIR = path.join(REPORTS_DIR, "enterprise");

// ── Report Engine ──────────────────────────────────────────────────────────

export class ReportEngine {
  private scheduler: ReportScheduler;
  private initialized = false;
  private aiModelVersion = "2.1.0";
  private templateVersion = "3.0";
  private scanVersion = "2.1.0";

  constructor() {
    this.scheduler = new ReportScheduler(this);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(ENTERPRISE_REPORTS_DIR, { recursive: true });
    this.scheduler.start();
    this.initialized = true;
    logger.info("[REPORT-ENGINE] Enterprise Report Engine v3.0 initialized");
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
    const language = request.language ?? "en";
    const classification = request.classification ?? "internal";
    const createdBy = request.createdBy ?? null;
    const reportId = crypto.randomUUID();

    // Set localization language
    localizationService.setDefaultLanguage(language);

    // Collect scan data
    const data = await collectReportData(request.scanId);

    // Filter findings if maxFindings is set
    if (request.maxFindings && data.findings.length > request.maxFindings) {
      data.findings = data.findings.slice(0, request.maxFindings);
      data.totalFindings = data.findings.length;
    }

    // Generate AI content
    const aiContent = await generateAiReportContent(data, request.category);

    // Build compliance mappings
    const complianceMappings: ComplianceMapping[] = request.complianceFrameworks && request.complianceFrameworks.length > 0
      ? generateComplianceMappings(data, request.complianceFrameworks)
      : [];

    // Generate output files
    const files: ReportFile[] = [];

    for (const format of request.formats) {
      try {
        const file = await this.generateFormat(format, data, request, branding, aiContent, complianceMappings, reportId, language, classification);
        if (file) files.push(file);
      } catch (err) {
        logger.error({ err, format, scanId: request.scanId }, "[REPORT-ENGINE] Failed to generate format");
      }
    }

    // If ZIP requested, create archive of all files
    if (request.formats.includes("zip") && files.length > 0) {
      try {
        const zipFile = await this.createZipOfFormats(files, reportId);
        files.push(zipFile);
      } catch (err) {
        logger.error({ err, scanId: request.scanId }, "[REPORT-ENGINE] Failed to create ZIP archive");
      }
    }

    // Generate checksum
    const contentForHash = files.map(f => f.checksum).join("|");
    const checksum = digitalSignatureService.generateChecksum(contentForHash);

    // Generate digital signature if requested
    let digitalSignature: DigitalSignature | null = null;
    if (request.digitalSignature) {
      const contentToSign = JSON.stringify({ reportId, scanId: request.scanId, files: files.map(f => ({ format: f.format, checksum: f.checksum })) });
      digitalSignature = digitalSignatureService.signReport(contentToSign, createdBy ?? "v8-platform-engine");
    }

    // Add history entries
    reportVersionControl.addHistoryEntry(reportId, {
      action: "created",
      description: `Report generated for scan #${request.scanId} in ${request.formats.join(", ")} formats`,
      createdBy,
    });

    const durationMs = Date.now() - startTime;
    const history = reportVersionControl.getHistory(reportId);

    const sev = data.severities;
    const result: ReportResult = {
      id: reportId,
      scanId: request.scanId,
      category: request.category,
      formats: request.formats.filter(f => files.some(fi => fi.format === f)),
      files,
      version: "3.0",
      templateVersion: this.templateVersion,
      scanVersion: this.scanVersion,
      aiModelVersion: this.aiModelVersion,
      createdAt: new Date(),
      createdBy,
      durationMs,
      totalFindings: data.totalFindings,
      criticalCount: sev.critical ?? 0,
      highCount: sev.high ?? 0,
      mediumCount: sev.medium ?? 0,
      lowCount: sev.low ?? 0,
      infoCount: sev.info ?? 0,
      riskScore: calculateReportRiskScore(data),
      securityScore: calculateSecurityScore(data),
      branding,
      language,
      classification: classification as ReportClassification,
      digitalSignature,
      checksum,
      approvalStatus: "pending",
      history,
    };

    logger.info({ reportId, scanId: request.scanId, formats: result.formats, durationMs, findings: data.totalFindings }, "[REPORT-ENGINE] Report generated");
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
    language: ReportLanguage,
    classification: string,
  ): Promise<ReportFile | null> {
    const formatDir = path.join(ENTERPRISE_REPORTS_DIR, reportId);
    await mkdir(formatDir, { recursive: true });

    switch (format) {
      case "html": {
        const html = this.generateHtmlForCategory(request.category, data, aiContent, branding, complianceMappings, request.complianceFrameworks ?? []);
        return await this.writeFile(formatDir, reportId, request.category, "html", html, "text/html", language, classification);
      }

      case "md": {
        const { generateMarkdownReport } = await import("../report-generator");
        const md = generateMarkdownReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "md", md, "text/markdown", language, classification);
      }

      case "json": {
        const json = generateJsonReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "json", json, "application/json", language, classification);
      }

      case "csv": {
        const csv = generateCsvReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "csv", csv, "text/csv", language, classification);
      }

      case "xml": {
        const xml = generateXmlReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "xml", xml, "application/xml", language, classification);
      }

      case "sarif": {
        const sarif = generateSarifReport(data);
        const str = JSON.stringify(sarif, null, 2);
        return await this.writeFile(formatDir, reportId, request.category, "sarif.json", str, "application/sarif+json", language, classification);
      }

      case "txt": {
        const txt = generateTextReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "txt", txt, "text/plain", language, classification);
      }

      case "openvex": {
        const openvex = generateOpenVexReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "openvex.json", openvex, "application/openvex+json", language, classification);
      }

      case "cyclonedx": {
        const cyclonedx = generateCyclonedxReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "cyclonedx.json", cyclonedx, "application/cyclonedx+json", language, classification);
      }

      case "spdx": {
        const spdx = generateSpdxReport(data);
        return await this.writeFile(formatDir, reportId, request.category, "spdx.json", spdx, "application/spdx+json", language, classification);
      }

      case "xlsx": {
        const { generateXlsxReport } = await import("./formats/xlsx-generator");
        const buffer = await generateXlsxReport(data, complianceMappings, branding);
        return await this.writeBinaryFile(formatDir, reportId, request.category, "xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", language, classification);
      }

      case "docx": {
        const { generateDocxReport } = await import("./formats/docx-generator");
        const buffer = await generateDocxReport(data, branding);
        return await this.writeBinaryFile(formatDir, reportId, request.category, "docx", buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", language, classification);
      }

      case "pdf": {
        const { generateAsyncPdfReport } = await import("../pdf-report-generator");
        try {
          const pdfResult = await generateAsyncPdfReport(request.scanId, request.category as any);
          if (!pdfResult.pdfPath) return null;
          return {
            format: "pdf",
            filename: path.basename(pdfResult.pdfPath),
            path: pdfResult.pdfPath,
            sizeBytes: pdfResult.totalFindings > 0 ? 0 : 0,
            mimeType: "application/pdf",
            url: `/api/reports/enterprise/download/${reportId}/${path.basename(pdfResult.pdfPath)}`,
            checksum: "",
            encrypted: false,
          };
        } catch {
          logger.warn({ scanId: request.scanId }, "[REPORT-ENGINE] PDF generation unavailable");
          return null;
        }
      }

      default:
        logger.warn({ format }, "[REPORT-ENGINE] Unsupported format");
        return null;
    }
  }

  private generateHtmlForCategory(
    category: ReportCategory,
    data: any,
    aiContent: any,
    branding: any,
    complianceMappings: any[],
    frameworks: string[],
  ): string {
    switch (category) {
      case "executive": return generateExecutiveReport(data, aiContent, branding);
      case "developer": return generateDeveloperReport(data, branding);
      case "compliance": return generateComplianceReport(data, frameworks, complianceMappings, branding);
      case "soc": return generateSocReport(data, branding);
      case "management": return generateManagementReport(data, branding);
      case "asset": return generateAssetReport(data, branding);
      case "scan": return generateScanReport(data, branding);
      case "api_security": return generateApiSecurityReport(data, branding);
      case "cloud_security": return generateCloudSecurityReport(data, branding);
      case "container_security": return generateContainerSecurityReport(data, branding);
      case "kubernetes": return generateKubernetesReport(data, branding);
      case "infrastructure": return generateInfrastructureReport(data, branding);
      case "source_code": return generateSourceCodeReport(data, branding);
      case "dependency": return generateDependencyReport(data, branding);
      case "sbom": return generateSbomReport(data, branding);
      case "threat_intelligence": return generateThreatIntelligenceReport(data, branding);
      default: return generateTechnicalReport(data, branding);
    }
  }

  private async writeFile(
    dir: string, reportId: string, category: string,
    ext: string, content: string, mimeType: string,
    language: string, classification: string,
  ): Promise<ReportFile> {
    // Apply encryption if classified
    let finalContent = content;
    let encrypted = false;
    if (classification === "confidential" || classification === "restricted" || classification === "secret") {
      finalContent = reportEncryption.encrypt(content, process.env["REPORT_ENCRYPTION_KEY"] ?? "v8-platform-default-key").toString("base64");
      encrypted = true;
    }

    const filename = `${reportId}-${category}.${ext}`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, finalContent, "utf-8");
    const checksum = digitalSignatureService.generateChecksum(finalContent);

    return {
      format: ext === "sarif.json" ? "sarif" : ext as ReportFormat,
      filename,
      path: filePath,
      sizeBytes: Buffer.byteLength(finalContent, "utf-8"),
      mimeType,
      url: `/api/reports/enterprise/download/${reportId}/${filename}`,
      checksum,
      encrypted,
    };
  }

  private async writeBinaryFile(
    dir: string, reportId: string, category: string,
    ext: string, buffer: Buffer, mimeType: string,
    language: string, classification: string,
  ): Promise<ReportFile> {
    const filename = `${reportId}-${category}.${ext}`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, buffer);
    const checksum = digitalSignatureService.generateChecksum(buffer);

    return {
      format: ext as ReportFormat,
      filename,
      path: filePath,
      sizeBytes: buffer.length,
      mimeType,
      url: `/api/reports/enterprise/download/${reportId}/${filename}`,
      checksum,
      encrypted: false,
    };
  }

  private async createZipOfFormats(files: ReportFile[], reportId: string): Promise<ReportFile> {
    const formatDir = path.join(ENTERPRISE_REPORTS_DIR, reportId);
    const zipFiles = files.map(f => ({ filename: f.filename, path: f.path }));
    const result = await createZipArchive(zipFiles, formatDir, `${reportId}-bundle`);
    const checksum = digitalSignatureService.generateChecksum(result.path);

    return {
      format: "zip",
      filename: `${reportId}-bundle.zip`,
      path: result.path,
      sizeBytes: result.sizeBytes,
      mimeType: "application/zip",
      url: `/api/reports/enterprise/download/${reportId}/${reportId}-bundle.zip`,
      checksum,
      encrypted: false,
    };
  }

  // ── Schedule Management ──────────────────────────────────────────────────

  createSchedule(schedule: ReportSchedule): void { this.scheduler.addSchedule(schedule); }
  removeSchedule(scheduleId: string): void { this.scheduler.removeSchedule(scheduleId); }
  getSchedules(): ReportSchedule[] { return this.scheduler.getSchedules(); }

  createScheduledReport(params: {
    scanId: number; category: ReportCategory; formats: ReportFormat[];
    frequency: CronFrequency; cronExpression?: string; deliveryMethods?: DeliveryMethod[];
  }): ReportSchedule {
    const schedule = this.scheduler.createSchedule(params);
    this.scheduler.addSchedule(schedule);
    return schedule;
  }

  // ── Template Management ──────────────────────────────────────────────────

  getTemplates() { return templateRegistry.listTemplates(); }
  getTemplate(id: string) { return templateRegistry.getTemplate(id); }
  applyTemplate(templateId: string): void {
    const tpl = templateRegistry.getTemplate(templateId);
    if (tpl) logger.info({ templateId, name: tpl.name }, "[REPORT-ENGINE] Template applied");
  }

  // ── AI Cache ─────────────────────────────────────────────────────────────

  clearAiCache(): void { clearAiContentCache(); }

  // ── Status ───────────────────────────────────────────────────────────────

  getStatus() {
    return {
      initialized: this.initialized,
      schedules: this.scheduler.getSchedules().length,
      templates: templateRegistry.listTemplates().length,
      reportsDir: ENTERPRISE_REPORTS_DIR,
      engineVersion: "3.0",
      formats: ["html", "md", "json", "csv", "xml", "sarif", "txt", "openvex", "cyclonedx", "spdx", "xlsx", "docx", "pdf", "zip"],
      languages: ["en", "ar", "zh", "fr", "de", "ja", "ko", "pt", "ru", "es", "tr", "nl", "it", "pl", "sv", "da", "fi", "nb", "cs", "hu", "ro", "uk", "el", "he", "hi", "th", "vi"],
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const reportEngine = new ReportEngine();

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateReportRiskScore(data: any): number {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;
  const lo = data.severities.low ?? 0;
  const total = data.totalFindings;
  if (total === 0) return 100;
  return Math.max(0, Math.min(100, 100 - (cr * 15 + hi * 8 + me * 4 + lo * 1)));
}

function calculateSecurityScore(data: any): number {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const total = data.totalFindings;
  if (total === 0) return 100;
  const score = Math.max(0, 100 - (cr * 20 + hi * 10));
  return Math.round(score);
}
