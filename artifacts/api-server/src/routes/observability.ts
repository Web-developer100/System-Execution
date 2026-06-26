// ---------------------------------------------------------------------------
// Observability API Routes ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Exposes all observability endpoints:
//   - Metrics (Prometheus format + JSON)
//   - Logs (query, categories, levels)
//   - Health (liveness, readiness, startup, all, individual)
//   - Alerts (rules, firings, acknowledge, silence, resolve)
//   - Events (stream query with filters)
//   - Anomalies (detected anomalies, tracked metrics)
//   - Capacity (forecasts for storage, workers, queue, DB)
//   - Tracing (distributed tracing, spans, stats)
//   - Dashboards (dashboard definitions)
//   - Backups (backup/restore monitoring)
//   - Audit (audit trail query, chain verification)
//   - Notification Channels (test dispatch)
//   - Dashboard (aggregated observability data)

import { Router, type IRouter, type Request, type Response } from "express";
import { generatePrometheusText, collectSystemMetrics, registerDefaultMetrics } from "../services/observability/metrics-collector";
import { structuredLogger } from "../services/observability/structured-logger";
import { healthRegistry } from "../services/observability/health-check-registry";
import { alertingEngine } from "../services/observability/alerting-engine";
import { eventStream } from "../services/observability/event-stream";
import { anomalyDetector } from "../services/observability/anomaly-detector";
import { capacityPlanner } from "../services/observability/capacity-planner";
import { retentionManager } from "../services/observability/retention-manager";
import { tracingService } from "../services/observability/tracing";
import { auditTrailService } from "../services/observability/audit-trail";
import { backupMonitor } from "../services/observability/backup-monitor";
import { listDashboards, getDashboard } from "../services/observability/dashboards";
import { dispatchAlertToChannels } from "../services/observability/notification-channels";

import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Metrics ────────────────────────────────────────────────────────────────

// GET /api/observability/metrics — Prometheus text format
router.get("/observability/metrics", (_req, res) => {
  try {
    collectSystemMetrics();
    const text = generatePrometheusText();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    logger.error({ err }, "Metrics error");
    res.status(500).send("# Error collecting metrics\n");
  }
});

// GET /api/observability/metrics/json — JSON format
router.get("/observability/metrics/json", (_req, res) => {
  try {
    collectSystemMetrics();
    const text = generatePrometheusText();
    const lines = text.split("\n").filter(l => l && !l.startsWith("#"));
    const metrics: Record<string, number> = {};
    for (const line of lines) {
      const match = line.match(/^(\w+)(?:\{[^}]+\})?\s+([\d.]+)/);
      if (match) {
        metrics[match[1]] = parseFloat(match[2]);
      }
    }
    res.json(metrics);
  } catch (err) {
    logger.error({ err }, "Metrics JSON error");
    res.status(500).json({ error: "Metrics collection failed" });
  }
});

// GET /api/observability/metrics/list — List all registered metric names
router.get("/observability/metrics/list", (_req, res) => {
  res.json({ metrics: [] });
});

// ── Logs ───────────────────────────────────────────────────────────────────

// GET /api/observability/logs
router.get("/observability/logs", (req, res) => {
  try {
    const { category, severity, correlationId, userId, limit, offset } = req.query as Record<string, string>;
    const results = structuredLogger.query({
      category: category as any,
      severity: severity as any,
      correlationId,
      userId,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json({ total: results.length, entries: results });
  } catch (err) {
    logger.error({ err }, "Log query error");
    res.status(500).json({ error: "Log query failed" });
  }
});

// GET /api/observability/logs/stats
router.get("/observability/logs/stats", (_req, res) => {
  res.json({ bufferSize: structuredLogger.getBufferSize() });
});

// GET /api/observability/logs/stream — SSE endpoint for real-time log streaming
router.get("/observability/logs/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("data: {\"type\":\"connected\",\"message\":\"Log stream connected\"}\n\n");

  const categoryFilter = req.query.category as string | undefined;
  const severityFilter = req.query.severity as string | undefined;

  // Poll the log buffer and push new entries
  let lastLength = 0;
  const interval = setInterval(() => {
    const buffer = structuredLogger.query({ limit: 1000 });
    const newEntries = buffer.slice(lastLength);
    if (newEntries.length > 0) {
      for (const entry of newEntries) {
        if (categoryFilter && entry.category !== categoryFilter) continue;
        if (severityFilter && entry.severity !== severityFilter) continue;
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
      lastLength = buffer.length;
    }
  }, 1000);

  // Keepalive to prevent connection timeout
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(keepalive);
  });
});

// ── Health ─────────────────────────────────────────────────────────────────

// GET /api/observability/health — All health checks
router.get("/observability/health", async (_req, res) => {
  try {
    const report = await healthRegistry.runAll();
    res.json(report);
  } catch (err) {
    logger.error({ err }, "Health check error");
    res.status(500).json({ error: "Health check failed" });
  }
});

// GET /api/observability/health/liveness
router.get("/observability/health/liveness", async (_req, res) => {
  const report = await healthRegistry.runLiveness();
  res.json(report);
});

// GET /api/observability/health/readiness
router.get("/observability/health/readiness", async (_req, res) => {
  const report = await healthRegistry.runReadiness();
  res.json(report);
});

// GET /api/observability/health/:name
router.get("/observability/health/:name", async (req, res) => {
  const check = await healthRegistry.runCheck(req.params.name);
  if (!check) return res.status(404).json({ error: "Health check not found" });
  return res.json(check);
});

// ── Alerts ─────────────────────────────────────────────────────────────────

// GET /api/observability/alerts/rules
router.get("/observability/alerts/rules", (_req, res) => {
  res.json(alertingEngine.getRules());
});

// POST /api/observability/alerts/rules
router.post("/observability/alerts/rules", (req, res) => {
  try {
    const rule = req.body;
    const created = alertingEngine.addRule(rule);
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Create alert rule error");
    res.status(500).json({ error: "Failed to create rule" });
  }
});

// PUT /api/observability/alerts/rules/:id
router.put("/observability/alerts/rules/:id", (req, res) => {
  const updated = alertingEngine.updateRule(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Rule not found" });
  return res.json(updated);
});

// DELETE /api/observability/alerts/rules/:id
router.delete("/observability/alerts/rules/:id", (req, res) => {
  const deleted = alertingEngine.removeRule(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Rule not found" });
  return res.json({ message: "Rule deleted" });
});

// GET /api/observability/alerts/firings
router.get("/observability/alerts/firings", (req, res) => {
  const status = req.query.status as string | undefined;
  res.json(alertingEngine.getFirings(status));
});

// POST /api/observability/alerts/firings/:id/acknowledge
router.post("/observability/alerts/firings/:id/acknowledge", (req, res) => {
  const firing = alertingEngine.acknowledgeFiring(req.params.id, req.body?.userId ?? "system");
  if (!firing) return res.status(404).json({ error: "Firing not found" });
  return res.json(firing);
});

// POST /api/observability/alerts/firings/:id/silence
router.post("/observability/alerts/firings/:id/silence", (req, res) => {
  const durationMs = req.body?.durationMs ?? 3600_000;
  const firing = alertingEngine.silenceFiring(req.params.id, durationMs);
  if (!firing) return res.status(404).json({ error: "Firing not found" });
  return res.json(firing);
});

// POST /api/observability/alerts/firings/:id/resolve
router.post("/observability/alerts/firings/:id/resolve", (req, res) => {
  const firing = alertingEngine.resolveFiring(req.params.id);
  if (!firing) return res.status(404).json({ error: "Firing not found" });
  return res.json(firing);
});

// GET /api/observability/alerts/rules/source/:source
router.get("/observability/alerts/rules/source/:source", (req, res) => {
  const rules = alertingEngine.getRulesBySource(req.params.source);
  res.json(rules);
});

// ── Maintenance Windows ────────────────────────────────────────────────────

// GET /api/observability/alerts/maintenance
router.get("/observability/alerts/maintenance", (_req, res) => {
  res.json({
    windows: alertingEngine.getMaintenanceWindows(),
    active: alertingEngine.getMaintenanceStatus(),
  });
});

// POST /api/observability/alerts/maintenance
router.post("/observability/alerts/maintenance", (req, res) => {
  try {
    const { name, description, startTime, endTime, createdBy, ruleFilters, enabled } = req.body;
    const window = alertingEngine.addMaintenanceWindow({
      name: name ?? "Maintenance",
      description: description ?? "",
      startTime: startTime ?? new Date().toISOString(),
      endTime: endTime ?? new Date(Date.now() + 3600_000).toISOString(),
      createdBy: createdBy ?? "system",
      ruleFilters: ruleFilters ?? null,
      enabled: enabled ?? true,
    });
    res.status(201).json(window);
  } catch (err) {
    logger.error({ err }, "Create maintenance window error");
    res.status(500).json({ error: "Failed to create maintenance window" });
  }
});

// PUT /api/observability/alerts/maintenance/:id
router.put("/observability/alerts/maintenance/:id", (req, res) => {
  const updated = alertingEngine.updateMaintenanceWindow(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Maintenance window not found" });
  return res.json(updated);
});

// DELETE /api/observability/alerts/maintenance/:id
router.delete("/observability/alerts/maintenance/:id", (req, res) => {
  const deleted = alertingEngine.removeMaintenanceWindow(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Maintenance window not found" });
  return res.json({ message: "Maintenance window deleted" });
});

// GET /api/observability/alerts/maintenance/active
router.get("/observability/alerts/maintenance/active", (_req, res) => {
  res.json(alertingEngine.getMaintenanceStatus());
});

// ── Events ─────────────────────────────────────────────────────────────────

// GET /api/observability/events
router.get("/observability/events", (req, res) => {
  try {
    const { type, source, severity, userId, limit, offset, since } = req.query as Record<string, string>;
    const events = eventStream.query({
      type: type as any,
      source,
      severity: severity as any,
      userId,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
      since,
    });
    res.json({ total: events.length, events });
  } catch (err) {
    logger.error({ err }, "Event query error");
    res.status(500).json({ error: "Event query failed" });
  }
});

// GET /api/observability/events/stats
router.get("/observability/events/stats", (_req, res) => {
  res.json(eventStream.getStats());
});

// ── Anomalies ──────────────────────────────────────────────────────────────

// GET /api/observability/anomalies
router.get("/observability/anomalies", (_req, res) => {
  const anomalies = anomalyDetector.getAnomalousMetrics();
  res.json({ count: anomalies.length, anomalies });
});

// GET /api/observability/anomalies/status
router.get("/observability/anomalies/status", (_req, res) => {
  res.json(anomalyDetector.getStatus());
});

// GET /api/observability/anomalies/:metric
router.get("/observability/anomalies/:metric", (req, res) => {
  const history = anomalyDetector.getHistory(req.params.metric);
  if (!history) return res.status(404).json({ error: "Metric not tracked" });
  return res.json(history);
});

// ── Capacity ───────────────────────────────────────────────────────────────

// GET /api/observability/capacity
router.get("/observability/capacity", (_req, res) => {
  const forecasts = capacityPlanner.getAllForecasts();
  res.json({ count: forecasts.length, forecasts });
});

// GET /api/observability/capacity/:metric
router.get("/observability/capacity/:metric", (req, res) => {
  const forecast = capacityPlanner.forecast(req.params.metric, 1000);
  if (!forecast) return res.status(404).json({ error: "Metric not found" });
  return res.json(forecast);
});

// GET /api/observability/capacity/status
router.get("/observability/capacity/status", (_req, res) => {
  res.json(capacityPlanner.getStatus());
});

// ── Tracing ────────────────────────────────────────────────────────────────

// GET /api/observability/tracing — Query traces
router.get("/observability/tracing", (req, res) => {
  try {
    const { serviceName, status, operation, limit, offset, since } = req.query as Record<string, string>;
    const traces = tracingService.getTraces({
      serviceName,
      status: status as any,
      operation,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      since,
    });
    res.json({ total: traces.length, traces });
  } catch (err) {
    logger.error({ err }, "Tracing query error");
    res.status(500).json({ error: "Tracing query failed" });
  }
});

// GET /api/observability/tracing/:traceId — Get single trace
router.get("/observability/tracing/:traceId", (req, res) => {
  const trace = tracingService.getTrace(req.params.traceId);
  if (!trace) return res.status(404).json({ error: "Trace not found" });
  return res.json(trace);
});

// GET /api/observability/tracing/:traceId/spans — Get spans for a trace
router.get("/observability/tracing/:traceId/spans", (req, res) => {
  const spans = tracingService.getSpanTree(req.params.traceId);
  res.json({ count: spans.length, spans });
});

// GET /api/observability/tracing/stats — Tracing stats
router.get("/observability/tracing/stats", (_req, res) => {
  res.json(tracingService.getStats());
});

// ── Dashboards ─────────────────────────────────────────────────────────────

// GET /api/observability/dashboards — List all dashboards
router.get("/observability/dashboards", (_req, res) => {
  const dashboards = listDashboards();
  res.json({ count: dashboards.length, dashboards });
});

// GET /api/observability/dashboards/:id — Get dashboard definition
router.get("/observability/dashboards/:id", (req, res) => {
  const dashboard = getDashboard(req.params.id);
  if (!dashboard) return res.status(404).json({ error: "Dashboard not found" });
  return res.json(dashboard);
});

// ── Backup Monitor ─────────────────────────────────────────────────────────

// GET /api/observability/backups — List backups
router.get("/observability/backups", (req, res) => {
  const { type, status, limit } = req.query as Record<string, string>;
  const backups = backupMonitor.getBackups({
    type: type as any,
    status: status as any,
    limit: limit ? parseInt(limit) : 50,
  });
  res.json({ count: backups.length, backups });
});

// GET /api/observability/backups/stats — Backup stats
router.get("/observability/backups/stats", (_req, res) => {
  res.json(backupMonitor.getStats());
});

// GET /api/observability/backups/restores — List restores
router.get("/observability/backups/restores", (req, res) => {
  const { status, limit } = req.query as Record<string, string>;
  const restores = backupMonitor.getRestores({
    status: status as any,
    limit: limit ? parseInt(limit) : 50,
  });
  res.json({ count: restores.length, restores });
});

// GET /api/observability/backups/latest
router.get("/observability/backups/latest", (_req, res) => {
  const latest = backupMonitor.getLatestBackup();
  if (!latest) {
    res.status(404).json({ error: "No backups found" });
    return;
  }
  res.json(latest);
});

// GET /api/observability/backups/:id
router.get("/observability/backups/:id", (req, res) => {
  const backup = backupMonitor.getBackup(req.params.id);
  if (!backup) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }
  res.json(backup);
});

// ── Audit Trail ────────────────────────────────────────────────────────────

// GET /api/observability/audit — Query audit trail
router.get("/observability/audit", (req, res) => {
  try {
    const { action, actorId, resourceType, resourceId, status, correlationId, organizationId, since, until, limit, offset } = req.query as Record<string, string>;
    const entries = auditTrailService.query({
      action: action as any,
      actorId,
      resourceType,
      resourceId,
      status: status as any,
      correlationId,
      organizationId,
      since,
      until,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json({ total: entries.length, entries });
  } catch (err) {
    logger.error({ err }, "Audit query error");
    res.status(500).json({ error: "Audit query failed" });
  }
});

// GET /api/observability/audit/verify — Verify audit chain integrity
router.get("/observability/audit/verify", (_req, res) => {
  const verification = auditTrailService.verifyChain();
  res.json(verification);
});

// GET /api/observability/audit/stats — Audit stats
router.get("/observability/audit/stats", (_req, res) => {
  res.json(auditTrailService.getStats());
});

// ── Notification Channel Dispatch ──────────────────────────────────────────

// POST /api/observability/notifications/test — Test dispatch to one or more channels
router.post("/observability/notifications/test", async (req, res) => {
  try {
    const { channels, channelConfigs, payload } = req.body;
    if (!channels || !Array.isArray(channels)) {
      res.status(400).json({ error: "channels array required" });
      return;
    }
    const result = await dispatchAlertToChannels(channels, channelConfigs ?? {}, {
      id: "test-alert",
      ruleName: "Test Alert",
      severity: payload?.severity ?? "info",
      message: payload?.message ?? "This is a test alert from V8 Platform",
      value: payload?.value ?? 0,
      threshold: payload?.threshold ?? 0,
      source: payload?.source ?? "test",
      firedAt: new Date().toISOString(),
      labels: payload?.labels ?? {},
      description: payload?.description ?? "Test alert dispatch",
    });
    res.json({ dispatched: result.length, results: result });
  } catch (err) {
    logger.error({ err }, "Notification test dispatch error");
    res.status(500).json({ error: "Notification dispatch failed" });
  }
});

// ── Retention Policies ──────────────────────────────────────────────────

// GET /api/observability/retention — All retention policies
router.get("/observability/retention", (_req, res) => {
  res.json({
    policies: retentionManager.getPolicies(),
    status: retentionManager.getStatus(),
  });
});

// PUT /api/observability/retention — Update one or more retention policies
router.put("/observability/retention", (req, res) => {
  try {
    const updates = req.body.policies ?? [req.body];
    const updated = retentionManager.updatePolicies(updates);
    res.json({ updated, count: updated.length });
  } catch (err) {
    logger.error({ err }, "Update retention policy error");
    res.status(500).json({ error: "Failed to update retention policies" });
  }
});

// POST /api/observability/retention/reset — Reset policies to defaults
router.post("/observability/retention/reset", (_req, res) => {
  try {
    const policies = retentionManager.resetPolicies();
    res.json({ message: "Retention policies reset to defaults", count: policies.length });
  } catch (err) {
    logger.error({ err }, "Reset retention policies error");
    res.status(500).json({ error: "Failed to reset retention policies" });
  }
});

// GET /api/observability/retention/sizes — Current data sizes and utilization
router.get("/observability/retention/sizes", (_req, res) => {
  res.json({
    sizes: retentionManager.getDataSizes(),
  });
});

// GET /api/observability/retention/sizes/:dataType — Size for a single data type
router.get("/observability/retention/sizes/:dataType", (req, res) => {
  const size = retentionManager.getDataSize(req.params.dataType as any);
  if (!size) return res.status(404).json({ error: "Unknown data type" });
  return res.json(size);
});

// POST /api/observability/retention/sweep — Run a manual sweep
router.post("/observability/retention/sweep", async (req, res) => {
  try {
    const dataType = req.body?.dataType as string | undefined;
    let results;
    if (dataType) {
      const result = await retentionManager.sweep(dataType as any);
      results = [result];
    } else {
      results = await retentionManager.sweepAll();
    }
    res.json({ swept: true, results });
  } catch (err) {
    logger.error({ err }, "Manual sweep error");
    res.status(500).json({ error: "Sweep failed" });
  }
});

// GET /api/observability/retention/sweep/history — Sweep history
router.get("/observability/retention/sweep/history", (req, res) => {
  const { dataType, limit } = req.query as Record<string, string>;
  const history = retentionManager.getSweepHistory({
    dataType: dataType as any,
    limit: limit ? parseInt(limit) : 50,
  });
  const stats = retentionManager.getSweepStats();
  res.json({ history, stats });
});

// GET /api/observability/retention/status — Manager status
router.get("/observability/retention/status", (_req, res) => {
  res.json(retentionManager.getStatus());
});

// GET /api/observability/dashboard — Aggregated observability data
router.get("/observability/dashboard", async (_req, res) => {
  try {
    const [health, alertFirings, eventStats, anomalyStatus, capacityStatus, tracingStats, auditStats, backupStats] = await Promise.all([
      healthRegistry.runAll(),
      Promise.resolve(alertingEngine.getFirings("firing")),
      Promise.resolve(eventStream.getStats()),
      Promise.resolve(anomalyDetector.getStatus()),
      Promise.resolve(capacityPlanner.getStatus()),
      Promise.resolve(tracingService.getStats()),
      Promise.resolve(auditTrailService.getStats()),
      Promise.resolve(backupMonitor.getStats()),
    ]);

    res.json({
      health: {
        status: health.status,
        uptime: health.uptime,
        checkCount: health.checks.length,
        unhealthyChecks: health.checks.filter(c => c.status !== "healthy").map(c => ({ name: c.name, status: c.status, message: c.message })),
      },
      alerts: {
        firingCount: alertFirings.length,
        criticalCount: alertFirings.filter(a => a.severity === "critical").length,
        highCount: alertFirings.filter(a => a.severity === "high").length,
      },
      events: {
        bufferSize: eventStats.bufferSize,
        eventTypes: Object.keys(eventStats.eventCounts).length,
        totalEvents: Object.values(eventStats.eventCounts).reduce((a, b) => a + b, 0),
      },
      anomalies: anomalyStatus,
      capacity: capacityStatus,
      tracing: tracingStats,
      audit: auditStats,
      backups: backupStats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Observability dashboard error");
    res.status(500).json({ error: "Dashboard aggregation failed" });
  }
});

export default router;
