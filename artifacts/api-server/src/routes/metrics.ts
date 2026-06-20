// ---------------------------------------------------------------------------
// Prometheus Metrics Endpoint
// ---------------------------------------------------------------------------
//
// Exposes system metrics in Prometheus text format at GET /api/metrics.
//
// Metrics exposed:
//   - v8_scans_total            — total scans by status
//   - v8_vulnerabilities_total  — total vulnerabilities by severity
//   - v8_tools_total            — total tools by status
//   - v8_proxies_total          — total proxies by status
//   - v8_queue_depth            — current scan queue depth
//   - v8_uptime_seconds         — server uptime
//   - v8_ai_cache_size          — AI analysis cache entries
//   - v8_ai_rate_limit_remaining — remaining AI API calls this minute

import { Router, type IRouter, type Request, type Response } from "express";
import { db, scansTable, vulnerabilitiesTable, toolsTable, proxiesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { orchestrator } from "../orchestrator-instance";
import { aiService } from "../ai-instance";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const startTime = Date.now();

/**
 * Format a single Prometheus metric line.
 */
function metricLine(
  name: string,
  value: number,
  labels?: Record<string, string>,
  help?: string,
  type?: "gauge" | "counter" | "histogram" | "summary",
): string {
  let out = "";

  // HELP comment (optional)
  if (help) {
    out += `# HELP ${name} ${help}\n`;
  }

  // TYPE comment (optional)
  if (type) {
    out += `# TYPE ${name} ${type}\n`;
  }

  // Metric line with optional labels
  if (labels && Object.keys(labels).length > 0) {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(",");
    out += `${name}{${labelStr}} ${value}\n`;
  } else {
    out += `${name} ${value}\n`;
  }

  return out;
}

// GET /api/metrics
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    let output = "";

    // ── Uptime ────────────────────────────────────────────────────────────
    const uptimeSeconds = Math.round((Date.now() - startTime) / 1000);
    output += metricLine("v8_uptime_seconds", uptimeSeconds, undefined,
      "Server uptime in seconds", "gauge");

    // ── Scans by status ───────────────────────────────────────────────────
    const scanCounts = await db
      .select({
        status: scansTable.status,
        count: sql<number>`count(*)`,
      })
      .from(scansTable)
      .groupBy(scansTable.status);

    for (const row of scanCounts) {
      output += metricLine("v8_scans_total", Number(row.count),
        { status: row.status ?? "unknown" },
        "Total number of scans by status", "counter");
    }

    // ── Vulnerabilities by severity ───────────────────────────────────────
    const vulnCounts = await db
      .select({
        severity: vulnerabilitiesTable.severity,
        status: vulnerabilitiesTable.status,
        count: sql<number>`count(*)`,
      })
      .from(vulnerabilitiesTable)
      .groupBy(vulnerabilitiesTable.severity, vulnerabilitiesTable.status);

    for (const row of vulnCounts) {
      output += metricLine("v8_vulnerabilities_total", Number(row.count),
        { severity: row.severity ?? "unknown", status: row.status ?? "unknown" },
        "Total number of vulnerabilities by severity and status", "counter");
    }

    // ── Tools by status ───────────────────────────────────────────────────
    const toolCounts = await db
      .select({
        status: toolsTable.status,
        count: sql<number>`count(*)`,
      })
      .from(toolsTable)
      .groupBy(toolsTable.status);

    for (const row of toolCounts) {
      output += metricLine("v8_tools_total", Number(row.count),
        { status: row.status ?? "unknown" },
        "Total number of registered tools by status", "gauge");
    }

    // ── Proxies by status ─────────────────────────────────────────────────
    const proxyCounts = await db
      .select({
        status: proxiesTable.status,
        count: sql<number>`count(*)`,
      })
      .from(proxiesTable)
      .groupBy(proxiesTable.status);

    for (const row of proxyCounts) {
      output += metricLine("v8_proxies_total", Number(row.count),
        { status: row.status ?? "unknown" },
        "Total number of proxy nodes by status", "gauge");
    }

    // ── Queue depth from orchestrator ─────────────────────────────────────
    const queueStats = orchestrator.getStats();
    output += metricLine("v8_queue_depth", queueStats.queued,
      { state: "queued" }, "Current number of queued scans", "gauge");
    output += metricLine("v8_queue_depth", queueStats.active,
      { state: "active" }, "Current number of active scans", "gauge");

    // ── AI Service metrics ────────────────────────────────────────────────
    const aiStatus = aiService.getStatus();
    output += metricLine("v8_ai_cache_size", aiStatus.cacheSize,
      undefined, "AI analysis cache entry count", "gauge");
    output += metricLine("v8_ai_rate_limit_remaining", aiStatus.rateLimitRemaining,
      undefined, "Remaining AI API calls this minute", "gauge");
    output += metricLine("v8_ai_primary_available", aiStatus.primaryAvailable ? 1 : 0,
      undefined, "Whether the primary LLM provider is available", "gauge");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(output);
  } catch (err) {
    logger.error({ err }, "Metrics endpoint error");
    res.status(500).send("# Error collecting metrics\n");
  }
});

export default router;
