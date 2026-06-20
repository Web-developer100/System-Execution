// ---------------------------------------------------------------------------
// Audit Logs Route — Immutable Action Tracking for SOC2/ISO27001
// ---------------------------------------------------------------------------
//
// Provides a searchable, filterable, paginated view of all user actions.
// Audit logs are immutable — once written, they cannot be modified or deleted.
//
// Endpoints:
//   GET  /api/audit              — List audit logs (paginated, filterable)
//   GET  /api/audit/stats        — Aggregate audit statistics
//   GET  /api/audit/:id          — Get single audit log entry

import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, like, count } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /api/audit ─────────────────────────────────────────────────────────

router.get("/audit", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const actionFilter = req.query.action as string | undefined;
    const usernameFilter = req.query.username as string | undefined;
    const methodFilter = req.query.method as string | undefined;
    const statusCodeFilter = req.query.statusCode ? Number(req.query.statusCode) : undefined;
    const fromDate = req.query.from as string | undefined;
    const toDate = req.query.to as string | undefined;

    // Build conditions
    const conditions: SQL[] = [];

    if (actionFilter) conditions.push(like(auditLogsTable.action, `%${actionFilter}%`));
    if (usernameFilter) conditions.push(eq(auditLogsTable.username, usernameFilter));
    if (methodFilter) conditions.push(eq(auditLogsTable.method, methodFilter.toUpperCase()));
    if (statusCodeFilter) conditions.push(eq(auditLogsTable.statusCode, statusCodeFilter));
    if (fromDate) conditions.push(gte(auditLogsTable.createdAt, new Date(fromDate)));
    if (toDate) conditions.push(lte(auditLogsTable.createdAt, new Date(toDate)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(auditLogsTable)
      .where(whereClause);

    const total = countResult?.total ?? 0;

    // Get paginated results
    const logs = await db
      .select()
      .from(auditLogsTable)
      .where(whereClause)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      logs: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        username: log.username,
        method: log.method,
        path: log.path,
        statusCode: log.statusCode,
        action: log.action,
        ip: log.ip,
        userAgent: log.userAgent,
        durationMs: log.durationMs,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get audit logs error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/audit/stats ───────────────────────────────────────────────────

router.get("/audit/stats", async (_req, res) => {
  try {
    const [totalResult] = await db.select({ total: count() }).from(auditLogsTable);
    const totalLogs = totalResult?.total ?? 0;

    // Count by action type
    const actionCounts = await db
      .select({
        action: auditLogsTable.action,
        count: count(),
      })
      .from(auditLogsTable)
      .groupBy(auditLogsTable.action)
      .orderBy(desc(count()));

    const topActions = actionCounts.slice(0, 10).map((a) => ({
      action: a.action,
      count: Number(a.count),
    }));

    // Count recent (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentResult] = await db
      .select({ total: count() })
      .from(auditLogsTable)
      .where(gte(auditLogsTable.createdAt, oneDayAgo));
    const recentCount = recentResult?.total ?? 0;

    // Error rate
    const [errorsResult] = await db
      .select({ total: count() })
      .from(auditLogsTable)
      .where(gte(auditLogsTable.statusCode, 400));
    const errorCount = errorsResult?.total ?? 0;

    return res.json({
      totalLogs,
      recentCount,
      errorCount,
      errorRate: totalLogs > 0 ? Math.round((errorCount / totalLogs) * 100) : 0,
      topActions,
    });
  } catch (err) {
    logger.error({ err }, "Get audit stats error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/audit/:id ─────────────────────────────────────────────────────

router.get("/audit/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [log] = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
    if (!log) return res.status(404).json({ error: "Not found" });

    return res.json({
      id: log.id,
      userId: log.userId,
      username: log.username,
      method: log.method,
      path: log.path,
      statusCode: log.statusCode,
      action: log.action,
      ip: log.ip,
      userAgent: log.userAgent,
      durationMs: log.durationMs,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get audit log error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
