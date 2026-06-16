import { Router, type IRouter } from "express";
import { db, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatVuln(v: typeof vulnerabilitiesTable.$inferSelect) {
  return {
    id: v.id,
    scanId: v.scanId,
    title: v.title,
    severity: v.severity,
    url: v.url,
    status: v.status,
    description: v.description ?? null,
    evidence: v.evidence ?? null,
    fix: v.fix ?? null,
    aiValidated: v.aiValidated ?? false,
    discoveredAt: v.discoveredAt.toISOString(),
  };
}

// GET /api/vulnerabilities
router.get("/vulnerabilities", async (_req, res) => {
  try {
    const vulns = await db.select().from(vulnerabilitiesTable).orderBy(desc(vulnerabilitiesTable.discoveredAt));
    return res.json(vulns.map(formatVuln));
  } catch (err) {
    logger.error({ err }, "Get vulns error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vulnerabilities/stats
router.get("/vulnerabilities/stats", async (_req, res) => {
  try {
    const vulns = await db.select().from(vulnerabilitiesTable);
    const stats = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: vulns.length };
    for (const v of vulns) {
      const sev = v.severity as keyof typeof stats;
      if (sev in stats && sev !== "total") stats[sev]++;
    }
    return res.json(stats);
  } catch (err) {
    logger.error({ err }, "Get vuln stats error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vulnerabilities/:id
router.get("/vulnerabilities/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const vulns = await db.select().from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.id, id));
    if (!vulns[0]) return res.status(404).json({ error: "Not found" });
    return res.json(formatVuln(vulns[0]));
  } catch (err) {
    logger.error({ err }, "Get vuln error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
