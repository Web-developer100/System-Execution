import { Router, type IRouter } from "express";
import { db, scansTable, scanLogsTable, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatScan(scan: typeof scansTable.$inferSelect) {
  const tools = JSON.parse(scan.tools || "[]") as string[];
  return {
    id: scan.id,
    target: scan.target,
    status: scan.status,
    tools,
    progress: scan.progress,
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
    createdAt: scan.createdAt.toISOString(),
    vulnCount: null,
  };
}

// GET /api/scans
router.get("/scans", async (_req, res) => {
  try {
    const scans = await db.select().from(scansTable).orderBy(desc(scansTable.createdAt));
    const vulnCounts = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable);
    const countMap: Record<number, number> = {};
    for (const v of vulnCounts) {
      countMap[v.scanId] = (countMap[v.scanId] ?? 0) + 1;
    }
    return res.json(scans.map(s => ({ ...formatScan(s), vulnCount: countMap[s.id] ?? 0 })));
  } catch (err) {
    logger.error({ err }, "Get scans error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans
router.post("/scans", async (req, res) => {
  const { target, tools, useProxy } = req.body as { target: string; tools: string[]; useProxy?: boolean };
  if (!target || !tools?.length) {
    return res.status(400).json({ error: "Target and tools required" });
  }
  try {
    const [scan] = await db.insert(scansTable).values({
      target,
      tools: JSON.stringify(tools),
      status: "queued",
      useProxy: useProxy ?? false,
      progress: 0,
    }).returning();

    // Simulate async scan start — add initial log lines
    setTimeout(async () => {
      try {
        await db.insert(scanLogsTable).values({ scanId: scan.id, message: `KERNEL: Initializing scan against ${target}`, level: "info" });
        await db.update(scansTable).set({ status: "running", startedAt: new Date(), progress: 5 }).where(eq(scansTable.id, scan.id));
        await db.insert(scanLogsTable).values({ scanId: scan.id, message: `UPLINK_SYNC: Target reachable, launching tool suite`, level: "success" });
      } catch {}
    }, 1000);

    return res.status(201).json({ ...formatScan(scan), vulnCount: 0 });
  } catch (err) {
    logger.error({ err }, "Create scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id
router.get("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const scans = await db.select().from(scansTable).where(eq(scansTable.id, id));
    if (!scans[0]) return res.status(404).json({ error: "Not found" });
    return res.json(formatScan(scans[0]));
  } catch (err) {
    logger.error({ err }, "Get scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/scans/:id
router.delete("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
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
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.update(scansTable)
      .set({ status: "stopped", completedAt: new Date() })
      .where(eq(scansTable.id, id))
      .returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    await db.insert(scanLogsTable).values({ scanId: id, message: "SIGKILL: Process terminated by operator", level: "warn" });
    return res.json(formatScan(scan));
  } catch (err) {
    logger.error({ err }, "Stop scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id/logs
router.get("/scans/:id/logs", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const logs = await db.select().from(scanLogsTable).where(eq(scanLogsTable.scanId, id)).orderBy(scanLogsTable.timestamp);
    return res.json(logs.map(l => ({
      id: l.id,
      scanId: l.scanId,
      message: l.message,
      level: l.level,
      timestamp: l.timestamp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Get scan logs error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
