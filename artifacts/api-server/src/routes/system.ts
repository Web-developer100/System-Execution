import { Router, type IRouter } from "express";
import { environmentProvisioning } from "../services/environment-provisioning";
import { logger } from "../lib/logger";

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

// GET /api/system/toolchain
// Scans all runtimes using the full EnvironmentProvisioningService (check only).
// The results are cached once after the first call since provision() reads from
// service state. Returns a summary similar to what bootstrapper.py provides.
router.get("/system/toolchain", async (_req, res) => {
  try {
    // Run a fresh provision check if we haven't yet, else use cached results
    if (!environmentProvisioning.isProvisioned) {
      await environmentProvisioning.provision(false);
    }

    const summary = environmentProvisioning.getSummary();

    return res.json({
      status: summary.missing === 0 ? "ready" : "missing_dependencies",
      total: summary.total,
      available: summary.available,
      missing: summary.missing,
      failed: summary.failed,
      details: summary.results,
      bootstrapScript: "scripts/bootstrap-environment.sh",
      recommendations: summary.missing > 0
        ? `Run 'bash scripts/bootstrap-environment.sh' or check /api/system/provisioning for details.`
        : null,
    });
  } catch (err) {
    logger.error({ err }, "[SYSTEM] Toolchain check failed");
    return res.status(500).json({ error: "Toolchain check failed", details: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/system/provisioning
// Detailed provisioning state with per-runtime version, availability, and
// installation status. Also includes Go/Rust environment variable mappings
// so the frontend can display toolchain configuration.
router.get("/system/provisioning", (_req, res) => {
  try {
    const summary = environmentProvisioning.isProvisioned
      ? environmentProvisioning.getSummary()
      : null;

    const goEnv = environmentProvisioning.getGoEnvironment();
    const rustEnv = environmentProvisioning.getRustEnvironment();

    return res.json({
      provisioned: environmentProvisioning.isProvisioned,
      provisionedAt: environmentProvisioning.isProvisioned ? new Date().toISOString() : null,
      summary,
      environment: {
        go: {
          goroot: goEnv["GOROOT"],
          gopath: goEnv["GOPATH"],
        },
        rust: {
          cargoHome: rustEnv["CARGO_HOME"],
          rustupHome: rustEnv["RUSTUP_HOME"],
        },
        pathEntries: (process.env["PATH"] ?? "").split(/:|;/).filter(Boolean),
      },
      bootstrap: {
        scripts: ["scripts/bootstrap-environment.sh"],
      },
    });
  } catch (err) {
    logger.error({ err }, "[SYSTEM] Provisioning endpoint failed");
    return res.status(500).json({ error: "Provisioning state unavailable" });
  }
});

export default router;
