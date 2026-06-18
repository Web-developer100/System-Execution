import { Router, type IRouter } from "express";
import { db, scansTable, scanLogsTable, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatScan(scan: typeof scansTable.$inferSelect, vulnCount = 0) {
  return {
    id: scan.id,
    target: scan.target,
    status: scan.status,
    tools: JSON.parse(scan.tools || "[]") as string[],
    progress: scan.progress ?? 0,
    vulnCount,
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
    createdAt: scan.createdAt.toISOString(),
  };
}

function normalizeTarget(rawTarget: string): string | null {
  const target = rawTarget.trim();
  if (!target || target.length > 253) return null;

  try {
    const parsed = target.includes("://") ? new URL(target) : new URL(`https://${target}`);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.host + parsed.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeTools(rawTools: string[]): string[] {
  return Array.from(
    new Set(
      rawTools
        .map((tool) => tool.trim())
        .filter((tool) => /^[a-z0-9_.:-]{1,64}$/i.test(tool)),
    ),
  );
}

async function markAwaitingExecutor(scanId: number, target: string, tools: string[]) {
  await db.update(scansTable)
    .set({
      status: "queued",
      progress: 0,
      startedAt: null,
      completedAt: null,
    })
    .where(eq(scansTable.id, scanId));

  await db.insert(scanLogsTable).values({
    scanId,
    level: "info",
    message: `[ORCHESTRATOR] Scan #${scanId} queued for ${target}. Requested tools: ${tools.join(", ")}.`,
  });

  await db.insert(scanLogsTable).values({
    scanId,
    level: "warn",
    message: "[ORCHESTRATOR] No verified executor worker is connected. The platform will not fabricate findings or simulate tool output.",
  });
}

// GET /api/scans
router.get("/scans", async (_req, res) => {
  try {
    const scans = await db.select().from(scansTable).orderBy(desc(scansTable.createdAt));
    const vulnRows = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable);
    const countMap: Record<number, number> = {};
    for (const v of vulnRows) countMap[v.scanId] = (countMap[v.scanId] ?? 0) + 1;
    return res.json(scans.map((scan) => formatScan(scan, countMap[scan.id] ?? 0)));
  } catch (err) {
    logger.error({ err }, "Get scans error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans
router.post("/scans", async (req, res) => {
  const { target, tools, useProxy } = req.body as { target: string; tools: string[]; useProxy?: boolean };
  const normalizedTarget = normalizeTarget(target ?? "");
  const normalizedTools = Array.isArray(tools) ? normalizeTools(tools) : [];

  if (!normalizedTarget || normalizedTools.length === 0) {
    return res.status(400).json({ error: "Valid target and at least one valid tool are required" });
  }

  try {
    const [scan] = await db.insert(scansTable).values({
      target: normalizedTarget,
      tools: JSON.stringify(normalizedTools),
      status: "queued",
      useProxy: useProxy ?? false,
      progress: 0,
    }).returning();

    await markAwaitingExecutor(scan.id, normalizedTarget, normalizedTools);
    return res.status(201).json(formatScan(scan, 0));
  } catch (err) {
    logger.error({ err }, "Create scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id
router.get("/scans/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, id));
    if (!scan) return res.status(404).json({ error: "Not found" });
    const vulnRows = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.scanId, id));
    return res.json(formatScan(scan, vulnRows.length));
  } catch (err) {
    logger.error({ err }, "Get scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/scans/:id
router.delete("/scans/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(scansTable).where(eq(scansTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans/:id/stop
router.post("/scans/:id/stop", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.update(scansTable)
      .set({ status: "stopped", completedAt: new Date() })
      .where(eq(scansTable.id, id))
      .returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    await db.insert(scanLogsTable).values({
      scanId: id,
      message: `[STOP] Scan #${id} stopped by operator.`,
      level: "warn",
    });
    return res.json(formatScan(scan));
  } catch (err) {
    logger.error({ err }, "Stop scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id/logs
router.get("/scans/:id/logs", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const logs = await db.select().from(scanLogsTable)
      .where(eq(scanLogsTable.scanId, id))
      .orderBy(scanLogsTable.timestamp);
    return res.json(logs.map((log) => ({
      id: log.id,
      scanId: log.scanId,
      message: log.message,
      level: log.level,
      timestamp: log.timestamp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Get scan logs error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
