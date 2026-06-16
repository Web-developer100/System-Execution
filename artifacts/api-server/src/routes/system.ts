import { Router, type IRouter } from "express";

const router: IRouter = Router();

const bootTime = Date.now();
let requestCount = 0;

router.use((_req, _res, next) => {
  requestCount++;
  next();
});

// GET /api/system/metrics
router.get("/system/metrics", (_req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const h = Math.floor(uptimeSeconds / 3600);
  const m = Math.floor((uptimeSeconds % 3600) / 60);
  const s = uptimeSeconds % 60;
  const mem = process.memoryUsage();

  return res.json({
    uptime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
    uptimeSeconds,
    memoryUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    memoryTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
    nodeVersion: process.version,
    platform: process.platform,
    requestCount,
    bootTime,
  });
});

export default router;
