import { Router, type IRouter } from "express";
import { db, reportsTable, scansTable } from "@workspace/db";
import { eq, desc, and, like, or, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { collectReportData, generateHtmlReport, REPORTS_DIR } from "../services/report-generator";
import { reportEngine, reportDelivery } from "../services/enterprise-reporting";
import { digitalSignatureService } from "../services/enterprise-reporting/digital-signature";
import { reportVersionControl } from "../services/enterprise-reporting/version-control";
import { templateRegistry } from "../services/enterprise-reporting/template-registry";
import { localizationService } from "../services/enterprise-reporting/localization";
import type { ReportRequest, ReportCategory, ReportFormat, ComplianceFramework, CronFrequency, DeliveryMethod, ReportLanguage, ReportClassification, TemplateStyle } from "../services/enterprise-reporting/types";
import path from "node:path";
import { readFile, readdir, unlink } from "node:fs/promises";

const router: IRouter = Router();

// ── GET /api/reports ──────────────────────────────────────────────────────

router.get("/reports", async (_req, res) => {
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    return res.json(reports.map(formatReport));
  } catch (err) {
    logger.error({ err }, "Get reports error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/reports/search ───────────────────────────────────────────────

router.get("/reports/search", async (req, res) => {
  try {
    const q = (req.query.q as string ?? "").trim();
    const category = req.query.category as string | undefined;
    const format = req.query.format as string | undefined;
    const status = req.query.status as string | undefined;
    const tags = req.query.tags as string | undefined;
    const sortBy = (req.query.sortBy as string) ?? "createdAt";
    const sortOrder = (req.query.sortOrder as string) ?? "desc";
    const page = parseInt(req.query.page as string ?? "1");
    const limit = parseInt(req.query.limit as string ?? "50");

    if (!q && !category && !format && !status && !tags) {
      const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)).limit(limit).offset((page - 1) * limit);
      return res.json({ reports: reports.map(formatReport), total: reports.length, page, limit });
    }

    const scanIds = await db.select({ id: scansTable.id }).from(scansTable)
      .where(or(
        like(scansTable.target, `%${q}%`),
        like(scansTable.status, `%${q}%`),
      ));
    const ids = scanIds.map(s => s.id);

    if (ids.length === 0) return res.json({ reports: [], total: 0, page, limit });

    const conditions = [inArray(reportsTable.scanId, ids)];
    const reports = await db.select().from(reportsTable)
      .where(and(...conditions))
      .orderBy(desc(reportsTable.createdAt))
      .limit(limit).offset((page - 1) * limit);

    return res.json({ reports: reports.map(formatReport), total: reports.length, page, limit });
  } catch (err) {
    logger.error({ err }, "Search reports error");
    return res.status(500).json({ error: "Internal search error" });
  }
});

// ── POST /api/reports ─────────────────────────────────────────────────────

router.post("/reports", async (req, res) => {
  const body = req.body as {
    scanId: number; category?: ReportCategory; formats?: ReportFormat[];
    complianceFrameworks?: ComplianceFramework[]; templateName?: string;
    templateStyle?: TemplateStyle; language?: ReportLanguage;
    includeCharts?: boolean; includeEvidence?: boolean;
    includeRemediation?: boolean; includeAiAnalysis?: boolean;
    includeAttackChains?: boolean; maxFindings?: number;
    redactSensitive?: boolean; password?: string;
    classification?: ReportClassification; digitalSignature?: boolean;
    tags?: string[]; createdBy?: string;
  };

  if (!body.scanId) return res.status(400).json({ error: "scanId required" });

  try {
    const reqData: ReportRequest = {
      scanId: body.scanId,
      category: body.category ?? "technical",
      formats: body.formats ?? ["html", "json", "csv", "sarif"],
      complianceFrameworks: body.complianceFrameworks,
      templateName: body.templateName,
      templateStyle: body.templateStyle,
      language: body.language ?? "en",
      includeCharts: body.includeCharts ?? true,
      includeEvidence: body.includeEvidence ?? true,
      includeRemediation: body.includeRemediation ?? true,
      includeAiAnalysis: body.includeAiAnalysis ?? true,
      includeAttackChains: body.includeAttackChains ?? false,
      maxFindings: body.maxFindings,
      redactSensitive: body.redactSensitive ?? false,
      password: body.password,
      classification: body.classification ?? "internal",
      digitalSignature: body.digitalSignature ?? false,
      tags: body.tags,
      createdBy: body.createdBy,
    };

    const result = await reportEngine.generateReport(reqData);

    const [report] = await db.insert(reportsTable).values({
      scanId: body.scanId,
      status: "ready",
      downloadUrl: `/api/reports/enterprise/download/${result.id}/${result.files[0]?.filename ?? ""}`,
    }).returning();

    return res.status(201).json({
      ...formatReport(report),
      enterprise: {
        id: result.id,
        category: result.category,
        formats: result.formats,
        files: result.files.map(f => ({ format: f.format, filename: f.filename, url: f.url, sizeBytes: f.sizeBytes, checksum: f.checksum, encrypted: f.encrypted })),
        riskScore: result.riskScore,
        securityScore: result.securityScore,
        totalFindings: result.totalFindings,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
        mediumCount: result.mediumCount,
        lowCount: result.lowCount,
        durationMs: result.durationMs,
        language: result.language,
        classification: result.classification,
        version: result.version,
        templateVersion: result.templateVersion,
        digitalSignature: result.digitalSignature,
        checksum: result.checksum,
        approvalStatus: result.approvalStatus,
        history: result.history,
      },
    });
  } catch (err) {
    logger.error({ err, scanId: body.scanId }, "Generate enterprise report error");
    return res.status(500).json({ error: "Report generation failed" });
  }
});

// ── POST /api/reports/preview ─────────────────────────────────────────────

router.post("/reports/preview", async (req, res) => {
  const { scanId, category, language } = req.body as { scanId: number; category?: ReportCategory; language?: ReportLanguage };

  if (!scanId) return res.status(400).json({ error: "scanId required" });

  try {
    const data = await collectReportData(scanId);
    if (language) localizationService.setDefaultLanguage(language);
    const html = generateHtmlReport(data);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    logger.error({ err, scanId }, "Preview report error");
    return res.status(500).json({ error: "Preview generation failed" });
  }
});

// ── GET /api/reports/:id/download ─────────────────────────────────────────

router.get("/reports/:id/download", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.status !== "ready") return res.status(425).json({ error: "Report not ready yet" });

    const data = await collectReportData(report.scanId);
    const html = generateHtmlReport(data);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="v8-security-report-${id}.html"`);
    return res.send(html);
  } catch (err) {
    logger.error({ err }, "Download report error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Enterprise Report Routes ─────────────────────────────────────────────

// GET /api/reports/enterprise/download/:reportId/:filename
router.get("/reports/enterprise/download/:reportId/:filename", async (req, res) => {
  const { reportId, filename } = req.params;
  if (!reportId || !filename || filename.includes("..") || filename.includes("/")) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const filePath = path.join(REPORTS_DIR, "enterprise", reportId, filename);
    let content: Buffer;
    let mime = "application/octet-stream";
    const ext = filename.split(".").pop() ?? "";

    const mimeTypes: Record<string, string> = {
      html: "text/html", md: "text/markdown", json: "application/json",
      csv: "text/csv", xml: "application/xml",
      sarif: "application/sarif+json", openvex: "application/openvex+json",
      cyclonedx: "application/cyclonedx+json", spdx: "application/spdx+json",
      txt: "text/plain", pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      zip: "application/zip",
    };

    mime = mimeTypes[ext] ?? "application/octet-stream";
    content = await readFile(filePath);

    // Check if content is encrypted (starts with base64-encoded encrypted data)
    const contentStr = content.toString("utf-8");
    if (contentStr.startsWith("eyJ")) {
      // Could be JSON/encrypted - serve as-is
    }

    const disposition = ext === "html" ? "inline" : "attachment";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    res.setHeader("X-Checksum-SHA256", digitalSignatureService.generateChecksum(content));
    return res.send(content);
  } catch (err) {
    logger.error({ err, reportId, filename }, "Enterprise download error");
    return res.status(404).json({ error: "File not found" });
  }
});

// GET /api/reports/enterprise/:reportId — metadata
router.get("/reports/enterprise/:reportId", async (req, res) => {
  const reportId = req.params.reportId;
  if (!reportId) return res.status(400).json({ error: "reportId required" });

  try {
    const dirPath = path.join(REPORTS_DIR, "enterprise", reportId);
    const files = await readdir(dirPath);
    const fileInfos = files.map(f => {
      const parts = f.split(".");
      const ext = parts.length > 1 ? parts[parts.length - 1] : "";
      const format = ext === "sarif" ? "sarif" : ext;
      return { filename: f, format };
    });

    const history = reportVersionControl.getHistory(reportId);

    return res.json({
      id: reportId,
      files: fileInfos,
      downloadUrl: `/api/reports/enterprise/download/${reportId}/`,
      history: history.map(h => ({
        version: h.version,
        createdAt: h.createdAt,
        action: h.action,
        description: h.description,
        createdBy: h.createdBy,
      })),
    });
  } catch (err) {
    return res.status(404).json({ error: "Report not found" });
  }
});

// ── Report Approval ──────────────────────────────────────────────────────

// POST /api/reports/:reportId/approve
router.post("/reports/enterprise/:reportId/approve", (req, res) => {
  const { reportId } = req.params;
  const { approvedBy } = req.body as { approvedBy?: string };

  reportVersionControl.addHistoryEntry(reportId, {
    action: "approved",
    description: "Report approved",
    createdBy: approvedBy ?? null,
  });

  return res.json({ message: "Report approved", reportId });
});

// POST /api/reports/:reportId/reject
router.post("/reports/enterprise/:reportId/reject", (req, res) => {
  const { reportId } = req.params;
  const { rejectedBy, reason } = req.body as { rejectedBy?: string; reason?: string };

  reportVersionControl.addHistoryEntry(reportId, {
    action: "rejected",
    description: reason ?? "Report rejected",
    createdBy: rejectedBy ?? null,
  });

  return res.json({ message: "Report rejected", reportId });
});

// ── Report Version History ───────────────────────────────────────────────

// GET /api/reports/enterprise/:reportId/history
router.get("/reports/enterprise/:reportId/history", (req, res) => {
  const history = reportVersionControl.getHistory(req.params.reportId);
  return res.json(history);
});

// ── Report Comparison ─────────────────────────────────────────────────────

// GET /api/reports/enterprise/compare/:reportIdA/:reportIdB
router.get("/reports/enterprise/compare/:reportIdA/:reportIdB", async (req, res) => {
  const { reportIdA, reportIdB } = req.params;

  try {
    const dirA = path.join(REPORTS_DIR, "enterprise", reportIdA);
    const dirB = path.join(REPORTS_DIR, "enterprise", reportIdB);
    const [filesA, filesB] = await Promise.all([
      readdir(dirA).catch(() => [] as string[]),
      readdir(dirB).catch(() => [] as string[]),
    ]);

    const historyA = reportVersionControl.getHistory(reportIdA);
    const historyB = reportVersionControl.getHistory(reportIdB);

    return res.json({
      reportA: { id: reportIdA, files: filesA, historyCount: historyA.length },
      reportB: { id: reportIdB, files: filesB, historyCount: historyB.length },
      diff: {
        filesAdded: filesB.filter(f => !filesA.includes(f)),
        filesRemoved: filesA.filter(f => !filesB.includes(f)),
        filesCommon: filesA.filter(f => filesB.includes(f)),
      },
    });
  } catch (err) {
    return res.status(404).json({ error: "Report not found" });
  }
});

// ── GET /api/reports/:id/compare/:otherId ────────────────────────────────

router.get("/reports/:id/compare/:otherId", async (req, res) => {
  const id = parseInt(req.params.id);
  const otherId = parseInt(req.params.otherId);
  if (isNaN(id) || isNaN(otherId)) return res.status(400).json({ error: "Invalid IDs" });

  try {
    const [report1] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const [report2] = await db.select().from(reportsTable).where(eq(reportsTable.id, otherId));
    if (!report1 || !report2) return res.status(404).json({ error: "Report not found" });

    const data1 = await collectReportData(report1.scanId);
    const data2 = await collectReportData(report2.scanId);

    const diff = {
      findingsDelta: data1.totalFindings - data2.totalFindings,
      criticalDelta: (data1.severities.critical ?? 0) - (data2.severities.critical ?? 0),
      highDelta: (data1.severities.high ?? 0) - (data2.severities.high ?? 0),
      mediumDelta: (data1.severities.medium ?? 0) - (data2.severities.medium ?? 0),
      newFindings: data1.findings.filter(f => !data2.findings.some(f2 => f2.url === f.url && f2.title === f.title)).map(f => f.title),
      resolvedFindings: data2.findings.filter(f => !data1.findings.some(f2 => f2.url === f.url && f2.title === f.title)).map(f => f.title),
    };

    return res.json({
      scan1: { id: report1.id, scanId: report1.scanId, generatedAt: report1.createdAt.toISOString(), findings: data1.totalFindings, severities: data1.severities },
      scan2: { id: report2.id, scanId: report2.scanId, generatedAt: report2.createdAt.toISOString(), findings: data2.totalFindings, severities: data2.severities },
      diff,
    });
  } catch (err) {
    logger.error({ err }, "Compare reports error");
    return res.status(500).json({ error: "Comparison failed" });
  }
});

// ── Report Archive/Delete ────────────────────────────────────────────────

// DELETE /api/reports/enterprise/:reportId
router.delete("/reports/enterprise/:reportId", async (req, res) => {
  const { reportId } = req.params;
  try {
    const dirPath = path.join(REPORTS_DIR, "enterprise", reportId);
    const { rm } = await import("node:fs/promises");
    await rm(dirPath, { recursive: true, force: true });
    reportVersionControl.clearHistory(reportId);
    return res.json({ message: "Report deleted" });
  } catch (err) {
    return res.status(404).json({ error: "Report not found" });
  }
});

// POST /api/reports/enterprise/:reportId/archive
router.post("/reports/enterprise/:reportId/archive", (req, res) => {
  const { reportId } = req.params;
  reportVersionControl.addHistoryEntry(reportId, { action: "archived", description: "Report archived", createdBy: null });
  return res.json({ message: "Report archived" });
});

// POST /api/reports/enterprise/:reportId/restore
router.post("/reports/enterprise/:reportId/restore", (req, res) => {
  const { reportId } = req.params;
  reportVersionControl.addHistoryEntry(reportId, { action: "restored", description: "Report restored from archive", createdBy: null });
  return res.json({ message: "Report restored" });
});

// ── Schedule Routes ──────────────────────────────────────────────────────

router.get("/reports/schedules", (_req, res) => {
  try {
    const schedules = reportEngine.getSchedules();
    return res.json(schedules);
  } catch (err) {
    logger.error({ err }, "Get schedules error");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/reports/schedules", (req, res) => {
  try {
    const { scanId, category, formats, frequency, cronExpression, deliveryMethods } = req.body as {
      scanId: number; category: ReportCategory; formats: ReportFormat[];
      frequency: CronFrequency; cronExpression?: string; deliveryMethods?: DeliveryMethod[];
    };

    if (!scanId || !category || !frequency) {
      return res.status(400).json({ error: "scanId, category, and frequency required" });
    }

    const schedule = reportEngine.createScheduledReport({
      scanId, category,
      formats: formats ?? ["html", "json"],
      frequency, cronExpression, deliveryMethods,
    });

    return res.status(201).json(schedule);
  } catch (err) {
    logger.error({ err }, "Create schedule error");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/reports/schedules/:id", (req, res) => {
  try {
    reportEngine.removeSchedule(req.params.id);
    return res.json({ message: "Schedule removed" });
  } catch (err) {
    logger.error({ err }, "Remove schedule error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Delivery Routes ──────────────────────────────────────────────────────

router.post("/reports/deliver", async (req, res) => {
  try {
    const { reportId, scanId, category, formats, downloadUrls, summary, criticalCount, highCount, mediumCount, totalFindings, riskScore, securityScore, classification } = req.body;

    const payload = {
      reportId: reportId ?? "unknown",
      scanId: scanId ?? 0,
      target: req.body.target ?? "Unknown",
      category: category ?? "technical",
      formats: formats ?? ["html"],
      downloadUrls: downloadUrls ?? [],
      summary: summary ?? "Security report generated by V8 Platform.",
      criticalCount: criticalCount ?? 0,
      highCount: highCount ?? 0,
      mediumCount: mediumCount ?? 0,
      totalFindings: totalFindings ?? 0,
      riskScore: riskScore ?? 100,
      securityScore: securityScore ?? 100,
      generatedAt: new Date().toISOString(),
      classification: classification ?? "INTERNAL",
    };

    const results = await reportDelivery.deliver(payload);
    return res.json({ delivered: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results });
  } catch (err) {
    logger.error({ err }, "Deliver report error");
    return res.status(500).json({ error: "Delivery failed" });
  }
});

router.get("/reports/delivery/config", (_req, res) => {
  const configs = reportDelivery.getEnabledDeliveries();
  return res.json(configs.map(c => ({ type: c.type, enabled: c.enabled })));
});

// ── Template Routes ──────────────────────────────────────────────────────

router.get("/reports/templates", (_req, res) => {
  const templates = reportEngine.getTemplates();
  return res.json(templates);
});

router.get("/reports/templates/:id", (req, res) => {
  const tpl = reportEngine.getTemplate(req.params.id);
  if (!tpl) return res.status(404).json({ error: "Template not found" });
  return res.json(tpl);
});

// ── Localization Routes ──────────────────────────────────────────────────

router.get("/reports/languages", (_req, res) => {
  const languages = [
    { code: "en", name: "English", rtl: false },
    { code: "ar", name: "العربية", rtl: true },
    { code: "zh", name: "中文", rtl: false },
    { code: "fr", name: "Français", rtl: false },
    { code: "de", name: "Deutsch", rtl: false },
    { code: "ja", name: "日本語", rtl: false },
    { code: "ko", name: "한국어", rtl: false },
    { code: "pt", name: "Português", rtl: false },
    { code: "ru", name: "Русский", rtl: false },
    { code: "es", name: "Español", rtl: false },
    { code: "tr", name: "Türkçe", rtl: false },
    { code: "nl", name: "Nederlands", rtl: false },
    { code: "it", name: "Italiano", rtl: false },
    { code: "he", name: "עברית", rtl: true },
  ];
  return res.json(languages);
});

// ── Engine Status ────────────────────────────────────────────────────────

router.get("/reports/engine/status", (_req, res) => {
  const status = reportEngine.getStatus();
  return res.json(status);
});

router.post("/reports/engine/clear-cache", (_req, res) => {
  reportEngine.clearAiCache();
  return res.json({ message: "AI report content cache cleared" });
});

// ── DELETE /api/reports/:id ──────────────────────────────────────────────

router.delete("/reports/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(reportsTable).where(eq(reportsTable.id, id));
    return res.json({ message: "Report deleted" });
  } catch (err) {
    logger.error({ err }, "Delete report error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────

function formatReport(r: typeof reportsTable.$inferSelect) {
  return {
    id: r.id,
    scanId: r.scanId,
    status: r.status,
    downloadUrl: r.downloadUrl ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
