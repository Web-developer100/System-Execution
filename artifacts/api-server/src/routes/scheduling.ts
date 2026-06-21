// ---------------------------------------------------------------------------
// Scheduling & Automation Routes ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Provides CRUD for recurring scan schedules using cron expressions.
// Integrates with the distributed scheduling engine for intelligent job
// distribution across workers.
//
// Endpoints:
//   GET    /api/schedules              — List all schedules
//   POST   /api/schedules              — Create a schedule
//   PUT    /api/schedules/:id          — Update a schedule
//   DELETE /api/schedules/:id          — Delete a schedule
//   POST   /api/schedules/:id/toggle   — Enable/disable toggle
//   GET    /api/schedules/:id/history  — Get execution history

import { Router, type IRouter } from "express";
import { db, scansTable } from "@workspace/db";
import { eq, desc, and, count } from "drizzle-orm";
import { logger } from "../lib/logger";
import { orchestrator } from "../orchestrator-instance";

const router: IRouter = Router();

// ── In-memory schedule store (persisted to DB would use a schedules table) ─
// For now, store in a simple Map. In production, this would be a DB table.

interface ScheduleDefinition {
  id: string;
  name: string;
  target: string;
  tools: string[];
  cron: string;
  enabled: boolean;
  useProxy: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  createdAt: Date;
  totalRuns: number;
}

const schedules = new Map<string, ScheduleDefinition>();

// ── Simple Cron Parser (basic subset: "*/1 * * * *" syntax) ───────────────

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

function parseCron(expression: string): CronParts | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

function calculateNextRun(cronExpr: string): Date | null {
  try {
    const parsed = parseCron(cronExpr);
    if (!parsed) return null;

    // Simple calculation: add 1 minute and round
    const now = new Date();
    const next = new Date(now.getTime() + 60_000);

    // Parse the minute field
    if (parsed.minute === "*") {
      // Every minute — schedule for next minute
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else if (parsed.minute.includes("/")) {
      // Every N minutes (e.g. */5)
      const interval = parseInt(parsed.minute.split("/")[1]);
      if (!isNaN(interval) && interval > 0) {
        const currentMinute = now.getMinutes();
        const nextMinute = Math.ceil(currentMinute / interval) * interval;
        next.setMinutes(nextMinute, 0, 0);
      }
    } else {
      // Specific minute
      const specificMinute = parseInt(parsed.minute);
      if (!isNaN(specificMinute)) {
        next.setMinutes(specificMinute, 0, 0);
        if (next <= now) next.setHours(next.getHours() + 1);
      }
    }

    return next;
  } catch {
    // Fallback: 1 hour from now
    const next = new Date(Date.now() + 3_600_000);
    return next;
  }
}

// ── Schedule Checker ─────────────────────────────────────────────────────

let checkInterval: ReturnType<typeof setInterval> | null = null;

function startScheduleChecker(): void {
  if (checkInterval) return;

  logger.info("[SCHEDULING] Schedule checker started (every 30s)");

  checkInterval = setInterval(async () => {
    const now = new Date();

    for (const [id, schedule] of schedules) {
      if (!schedule.enabled || !schedule.nextRun) continue;

      if (now >= schedule.nextRun) {
        logger.info({ scheduleId: id, target: schedule.target }, "[SCHEDULING] Triggering scheduled scan");

        try {
          const [scan] = await db.insert(scansTable).values({
            target: schedule.target,
            tools: JSON.stringify(schedule.tools),
            status: "queued",
            useProxy: schedule.useProxy,
          }).returning();

          await orchestrator.enqueueScan(scan.id);

          schedule.lastRun = new Date();
          schedule.totalRuns++;
          schedule.nextRun = calculateNextRun(schedule.cron);

          logger.info({
            scheduleId: id,
            scanId: scan.id,
            nextRun: schedule.nextRun?.toISOString(),
          }, "[SCHEDULING] Scan triggered, next run scheduled");
        } catch (err) {
          logger.error({ err, scheduleId: id }, "[SCHEDULING] Failed to trigger scheduled scan");
        }
      }
    }
  }, 30_000);
}

// ── Seed default schedules (demo data) ───────────────────────────────────
function seedDefaultSchedules(): void {
  if (schedules.size > 0) return;

  const defaults: ScheduleDefinition[] = [
    {
      id: "sched-001",
      name: "Daily Production Sweep",
      target: "https://example.com",
      tools: ["nuclei", "httpx", "subfinder"],
      cron: "0 0 * * *",
      enabled: true,
      useProxy: false,
      lastRun: new Date(Date.now() - 86_400_000),
      nextRun: calculateNextRun("0 0 * * *"),
      createdAt: new Date(Date.now() - 7 * 86_400_000),
      totalRuns: 7,
    },
    {
      id: "sched-002",
      name: "Weekly API Security Test",
      target: "https://api.corp.net",
      tools: ["nuclei", "sqlmap", "httpx", "ffuf"],
      cron: "0 0 * * 1",
      enabled: true,
      useProxy: true,
      lastRun: new Date(Date.now() - 7 * 86_400_000),
      nextRun: calculateNextRun("0 0 * * 1"),
      createdAt: new Date(Date.now() - 30 * 86_400_000),
      totalRuns: 4,
    },
    {
      id: "sched-003",
      name: "Continuous Recon — Staging",
      target: "https://staging.app.io",
      tools: ["subfinder", "naabu", "httpx"],
      cron: "0 */6 * * *",
      enabled: true,
      useProxy: false,
      lastRun: new Date(Date.now() - 6 * 3_600_000),
      nextRun: calculateNextRun("0 */6 * * *"),
      createdAt: new Date(Date.now() - 14 * 86_400_000),
      totalRuns: 56,
    },
    {
      id: "sched-004",
      name: "Monthly Compliance Audit",
      target: "https://intranet.corp.net",
      tools: ["nuclei", "nikto", "trivy"],
      cron: "0 0 1 * *",
      enabled: false,
      useProxy: false,
      lastRun: new Date(Date.now() - 30 * 86_400_000),
      nextRun: null,
      createdAt: new Date(Date.now() - 60 * 86_400_000),
      totalRuns: 2,
    },
  ];

  for (const s of defaults) {
    schedules.set(s.id, s);
  }
  logger.info({ count: defaults.length }, "[SCHEDULING] Default schedules seeded");
}

seedDefaultSchedules();

// Auto-start the checker
startScheduleChecker();

// ── GET /api/schedules ────────────────────────────────────────────────────

router.get("/schedules", (_req, res) => {
  try {
    const allSchedules = Array.from(schedules.values()).map((s) => ({
      id: s.id,
      name: s.name,
      target: s.target,
      tools: s.tools,
      cron: s.cron,
      enabled: s.enabled,
      useProxy: s.useProxy,
      lastRun: s.lastRun?.toISOString() ?? null,
      nextRun: s.nextRun?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      totalRuns: s.totalRuns,
    }));

    return res.json({
      total: allSchedules.length,
      active: allSchedules.filter((s) => s.enabled).length,
      schedules: allSchedules,
    });
  } catch (err) {
    logger.error({ err }, "Get schedules error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/schedules ───────────────────────────────────────────────────

router.post("/schedules", async (req, res) => {
  const { name, target, tools, cron, useProxy } = req.body as {
    name: string;
    target: string;
    tools: string[];
    cron: string;
    useProxy?: boolean;
  };

  if (!name || !target || !tools?.length || !cron) {
    return res.status(400).json({ error: "name, target, tools, and cron are required" });
  }

  const parsed = parseCron(cron);
  if (!parsed) {
    return res.status(400).json({ error: "Invalid cron expression. Expected 5-field format (e.g. */5 * * * *)" });
  }

  try {
    const id = `sch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
    const nextRun = calculateNextRun(cron);

    const schedule: ScheduleDefinition = {
      id,
      name: name.trim(),
      target: target.trim(),
      tools,
      cron: cron.trim(),
      enabled: true,
      useProxy: useProxy ?? false,
      lastRun: null,
      nextRun,
      createdAt: now,
      totalRuns: 0,
    };

    schedules.set(id, schedule);

    logger.info({ scheduleId: id, target, nextRun: nextRun?.toISOString() }, "[SCHEDULING] Schedule created");

    return res.status(201).json({
      id: schedule.id,
      name: schedule.name,
      target: schedule.target,
      tools: schedule.tools,
      cron: schedule.cron,
      enabled: schedule.enabled,
      useProxy: schedule.useProxy,
      lastRun: null,
      nextRun: nextRun?.toISOString() ?? null,
      createdAt: now.toISOString(),
      totalRuns: 0,
    });
  } catch (err) {
    logger.error({ err }, "Create schedule error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/schedules/:id ────────────────────────────────────────────────

router.put("/schedules/:id", (req, res) => {
  const { id } = req.params;
  const existing = schedules.get(id);

  if (!existing) return res.status(404).json({ error: "Schedule not found" });

  const { name, target, tools, cron, useProxy } = req.body as {
    name?: string;
    target?: string;
    tools?: string[];
    cron?: string;
    useProxy?: boolean;
  };

  if (cron) {
    const parsed = parseCron(cron);
    if (!parsed) return res.status(400).json({ error: "Invalid cron expression" });
    existing.cron = cron.trim();
    existing.nextRun = calculateNextRun(cron);
  }

  if (name) existing.name = name.trim();
  if (target) existing.target = target.trim();
  if (tools) existing.tools = tools;
  if (useProxy !== undefined) existing.useProxy = useProxy;

  return res.json({
    id: existing.id,
    name: existing.name,
    target: existing.target,
    tools: existing.tools,
    cron: existing.cron,
    enabled: existing.enabled,
    useProxy: existing.useProxy,
    lastRun: existing.lastRun?.toISOString() ?? null,
    nextRun: existing.nextRun?.toISOString() ?? null,
    createdAt: existing.createdAt.toISOString(),
    totalRuns: existing.totalRuns,
  });
});

// ── DELETE /api/schedules/:id ─────────────────────────────────────────────

router.delete("/schedules/:id", (req, res) => {
  const { id } = req.params;
  if (!schedules.has(id)) return res.status(404).json({ error: "Schedule not found" });

  schedules.delete(id);
  logger.info({ scheduleId: id }, "[SCHEDULING] Schedule deleted");
  return res.json({ message: "Schedule deleted" });
});

// ── POST /api/schedules/:id/toggle ────────────────────────────────────────

router.post("/schedules/:id/toggle", (req, res) => {
  const { id } = req.params;
  const existing = schedules.get(id);

  if (!existing) return res.status(404).json({ error: "Schedule not found" });

  existing.enabled = !existing.enabled;
  if (existing.enabled) {
    existing.nextRun = calculateNextRun(existing.cron);
  } else {
    existing.nextRun = null;
  }

  logger.info({ scheduleId: id, enabled: existing.enabled }, "[SCHEDULING] Schedule toggled");

  return res.json({
    id: existing.id,
    enabled: existing.enabled,
    nextRun: existing.nextRun?.toISOString() ?? null,
  });
});

// ── GET /api/schedules/:id/history ────────────────────────────────────────

router.get("/schedules/:id/history", async (req, res) => {
  const { id } = req.params;
  const schedule = schedules.get(id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  try {
    // Find scans triggered by this schedule (by target match and recency)
    const recentScans = await db
      .select({
        id: scansTable.id,
        target: scansTable.target,
        status: scansTable.status,
        progress: scansTable.progress,
        startedAt: scansTable.startedAt,
        completedAt: scansTable.completedAt,
        createdAt: scansTable.createdAt,
      })
      .from(scansTable)
      .where(and(
        eq(scansTable.target, schedule.target),
      ))
      .orderBy(desc(scansTable.createdAt))
      .limit(20);

    return res.json({
      scheduleId: id,
      totalRuns: schedule.totalRuns,
      history: recentScans.map((s) => ({
        id: s.id,
        target: s.target,
        status: s.status,
        progress: s.progress,
        startedAt: s.startedAt?.toISOString() ?? null,
        completedAt: s.completedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get schedule history error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Cleanup on shutdown ─────────────────────────────────────────────────

export function shutdownScheduler(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  logger.info("[SCHEDULING] Scheduler shut down");
}

export default router;
