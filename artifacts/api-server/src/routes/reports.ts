import { Router, type IRouter } from "express";
import { db, reportsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatReport(r: typeof reportsTable.$inferSelect) {
  return {
    id: r.id,
    scanId: r.scanId,
    status: r.status,
    downloadUrl: r.downloadUrl ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/reports
router.get("/reports", async (_req, res) => {
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    return res.json(reports.map(formatReport));
  } catch (err) {
    logger.error({ err }, "Get reports error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/reports
router.post("/reports", async (req, res) => {
  const { scanId } = req.body as { scanId: number };
  if (!scanId) return res.status(400).json({ error: "scanId required" });
  try {
    const [report] = await db.insert(reportsTable).values({
      scanId,
      status: "generating",
    }).returning();

    // Simulate async report generation
    setTimeout(async () => {
      try {
        await db.update(reportsTable)
          .set({ status: "ready", downloadUrl: `/api/reports/${report.id}/download` })
          .where(eq(reportsTable.id, report.id));
      } catch {}
    }, 2000);

    return res.status(201).json(formatReport(report));
  } catch (err) {
    logger.error({ err }, "Generate report error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
