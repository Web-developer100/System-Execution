import { Router, type IRouter } from "express";
import { db, reportsTable, scansTable, vulnerabilitiesTable, toolsTable } from "@workspace/db";
import { eq, desc, and, like, or, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { generateAndSaveReport, collectReportData, generateHtmlReport, REPORTS_DIR } from "../services/report-generator";
import { reportEngine, reportDelivery } from "../services/enterprise-reporting";
import type { ReportRequest, ReportCategory, ReportFormat, ComplianceFramework, CronFrequency, DeliveryMethod } from "../services/enterprise-reporting";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

const router: IRouter = Router();

const REPORT_TITLES: Record<number, string> = {
  1: "Executive Summary — Q2 2026",
  2: "Full Technical Audit — API Surface",
  3: "Vulnerability Assessment — Corporate",
  4: "Container Security Report",
  5: "Penetration Test Summary",
};

const REPORT_TYPES: Record<number, string> = {
  1: "executive",
  2: "technical",
  3: "compliance",
  4: "container",
  5: "pentest",
};

function formatReport(r: typeof reportsTable.$inferSelect) {
  return {
    id: r.id,
    scanId: r.scanId,
    status: r.status,
    downloadUrl: r.downloadUrl ?? null,
    createdAt: r.createdAt.toISOString(),
    title: REPORT_TITLES[r.id] ?? `Security Report #${r.id}`,
    type: REPORT_TYPES[r.id] ?? "technical",
  };
}

function severityColor(sev: string): string {
  const colors: Record<string, string> = {
    critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6", info: "#6b7280",
  };
  return colors[sev] ?? "#6b7280";
}

function severityBar(count: number, total: number, color: string): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">
    <div style="width:80px;font-size:11px;text-transform:uppercase;color:${color};font-family:monospace;letter-spacing:2px;">${count}</div>
    <div style="flex:1;height:6px;background:#111;border:1px solid #1a2a1a;">
      <div style="width:${pct}%;height:100%;background:${color};box-shadow:0 0 8px ${color}66;transition:width 0.5s;"></div>
    </div>
    <div style="width:40px;font-size:10px;color:#555;font-family:monospace;text-align:right;">${pct}%</div>
  </div>`;
}

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
    if (!q) {
      // No query: return all reports
      const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
      return res.json(reports.map(formatReport));
    }

    // Search in scans the reports reference
    const scanIds = await db
      .select({ id: scansTable.id })
      .from(scansTable)
      .where(
        or(
          like(scansTable.target, `%${q}%`),
          like(scansTable.status, `%${q}%`),
          like(scansTable.tools, `%${q}%`),
        ),
      );

    const ids = scanIds.map(s => s.id);

    if (ids.length === 0) {
      return res.json([]);
    }

    const reports = await db
      .select()
      .from(reportsTable)
      .where(and(
        inArray(reportsTable.scanId, ids),
      ))
      .orderBy(desc(reportsTable.createdAt))
      .limit(50);

    return res.json(reports.map(formatReport));
  } catch (err) {
    logger.error({ err }, "Search reports error");
    return res.status(500).json({ error: "Internal search error" });
  }
});

// ── POST /api/reports ─────────────────────────────────────────────────────

router.post("/reports", async (req, res) => {
  const { scanId, category, formats, complianceFrameworks, includeCharts, includeEvidence, includeRemediation, includeAiAnalysis } = req.body as {
    scanId: number;
    category?: ReportCategory;
    formats?: ReportFormat[];
    complianceFrameworks?: ComplianceFramework[];
    includeCharts?: boolean;
    includeEvidence?: boolean;
    includeRemediation?: boolean;
    includeAiAnalysis?: boolean;
  };

  if (!scanId) return res.status(400).json({ error: "scanId required" });

  try {
    // Generate enterprise report
    const reqData: ReportRequest = {
      scanId,
      category: category ?? "technical",
      formats: formats ?? ["html", "json", "csv", "sarif"],
      complianceFrameworks,
      includeCharts: includeCharts ?? true,
      includeEvidence: includeEvidence ?? true,
      includeRemediation: includeRemediation ?? true,
      includeAiAnalysis: includeAiAnalysis ?? true,
    };

    const result = await reportEngine.generateReport(reqData);

    // Also generate the legacy report for backward compatibility
    const [report] = await db.insert(reportsTable).values({
      scanId,
      status: "ready",
      downloadUrl: `/api/reports/enterprise/download/${result.id}/${result.files[0]?.filename ?? ""}`,
    }).returning();

    return res.status(201).json({
      ...formatReport(report),
      enterprise: {
        id: result.id,
        category: result.category,
        formats: result.formats,
        files: result.files.map(f => ({ format: f.format, filename: f.filename, url: f.url, sizeBytes: f.sizeBytes })),
        riskScore: result.riskScore,
        totalFindings: result.totalFindings,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    logger.error({ err, scanId }, "Generate enterprise report error");
    return res.status(500).json({ error: "Report generation failed" });
  }
});

// ── POST /api/reports/preview ─────────────────────────────────────────────

router.post("/reports/preview", async (req, res) => {
  const { scanId, category } = req.body as { scanId: number; category?: ReportCategory };

  if (!scanId) return res.status(400).json({ error: "scanId required" });

  try {
    const data = await collectReportData(scanId);
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

// ── GET /api/reports/download/:filename ───────────────────────────────────

router.get("/reports/download/:filename", async (req, res) => {
  const filename = req.params.filename;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  try {
    const filePath = path.join(REPORTS_DIR, filename);
    const content = await readFile(filePath, "utf-8");

    const isHtml = filename.endsWith(".html");
    const isMd = filename.endsWith(".md");

    if (isHtml) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    } else if (isMd) {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    return res.send(content);
  } catch (err) {
    logger.error({ err, filename }, "Download report error");
    return res.status(404).json({ error: "Report file not found" });
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
    const content = await readFile(filePath, "utf-8");

    const ext = filename.split(".").pop() ?? "";
    const mimeTypes: Record<string, string> = {
      html: "text/html",
      md: "text/markdown",
      json: "application/json",
      csv: "text/csv",
      xml: "application/xml",
      sarif: "application/sarif+json",
    };

    const mime = mimeTypes[ext] ?? "application/octet-stream";
    const disposition = ext === "html" ? "inline" : "attachment";

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
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
      const ext = f.split(".").pop() ?? "";
      return { filename: f, format: ext === "sarif.json" ? "sarif" : ext };
    });

    return res.json({
      id: reportId,
      files: fileInfos,
      downloadUrl: `/api/reports/enterprise/download/${reportId}/`,
    });
  } catch (err) {
    return res.status(404).json({ error: "Report not found" });
  }
});

// ── Schedule Routes ──────────────────────────────────────────────────────

// GET /api/reports/schedules
router.get("/reports/schedules", (_req, res) => {
  try {
    const schedules = reportEngine.getSchedules();
    return res.json(schedules);
  } catch (err) {
    logger.error({ err }, "Get schedules error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/reports/schedules
router.post("/reports/schedules", (req, res) => {
  try {
    const { scanId, category, formats, frequency, cronExpression, deliveryMethods } = req.body as {
      scanId: number;
      category: ReportCategory;
      formats: ReportFormat[];
      frequency: CronFrequency;
      cronExpression?: string;
      deliveryMethods?: DeliveryMethod[];
    };

    if (!scanId || !category || !frequency) {
      return res.status(400).json({ error: "scanId, category, and frequency required" });
    }

    const schedule = reportEngine.createScheduledReport({
      scanId,
      category,
      formats: formats ?? ["html", "json"],
      frequency,
      cronExpression,
      deliveryMethods,
    });

    return res.status(201).json(schedule);
  } catch (err) {
    logger.error({ err }, "Create schedule error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/reports/schedules/:id
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

// POST /api/reports/deliver
router.post("/reports/deliver", async (req, res) => {
  try {
    const { reportId, scanId, category, formats, downloadUrls, summary, criticalCount, highCount, totalFindings, riskScore } = req.body;

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
      totalFindings: totalFindings ?? 0,
      riskScore: riskScore ?? 100,
      generatedAt: new Date().toISOString(),
    };

    const results = await reportDelivery.deliver(payload);
    return res.json({ delivered: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results });
  } catch (err) {
    logger.error({ err }, "Deliver report error");
    return res.status(500).json({ error: "Delivery failed" });
  }
});

// GET /api/reports/delivery/config
router.get("/reports/delivery/config", (_req, res) => {
  const configs = reportDelivery.getEnabledDeliveries();
  return res.json(configs.map(c => ({ type: c.type, enabled: c.enabled })));
});

// ── Engine Status ────────────────────────────────────────────────────────

// GET /api/reports/engine/status
router.get("/reports/engine/status", (_req, res) => {
  const status = reportEngine.getStatus();
  return res.json(status);
});

// POST /api/reports/engine/clear-cache
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

export default router;
