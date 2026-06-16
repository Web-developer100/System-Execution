import { Router, type IRouter } from "express";
import { db, scansTable, vulnerabilitiesTable, proxiesTable, toolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/stats/dashboard
router.get("/stats/dashboard", async (_req, res) => {
  try {
    const [scans, vulns, proxies, tools] = await Promise.all([
      db.select().from(scansTable),
      db.select().from(vulnerabilitiesTable),
      db.select().from(proxiesTable),
      db.select().from(toolsTable),
    ]);

    const activeScans = scans.filter(s => s.status === "running").length;
    const criticalCount = vulns.filter(v => v.severity === "critical").length;
    const highCount = vulns.filter(v => v.severity === "high").length;
    const mediumCount = vulns.filter(v => v.severity === "medium").length;
    const lowCount = vulns.filter(v => v.severity === "low").length;
    const activeProxies = proxies.filter(p => p.status === "active").length;
    const activeTools = tools.filter(t => t.status === "active").length;

    return res.json({
      totalScans: scans.length,
      activeScans,
      totalVulns: vulns.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      proxyPoolSize: activeProxies,
      toolsActive: activeTools,
      threadsRunning: activeScans * 3,
    });
  } catch (err) {
    logger.error({ err }, "Dashboard stats error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
