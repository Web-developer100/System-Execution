import path from "node:path";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { orchestrator } from "./orchestrator-instance";
import { requireAuth } from "./middlewares/auth";
import { generalLimiter, authLimiter, heavyLimiter } from "./middlewares/rate-limiter";
import { auditMiddleware } from "./middlewares/audit";
import { reportEngine } from "./services/enterprise-reporting";
import { registerDefaultMetrics, collectSystemMetrics } from "./services/observability/metrics-collector";
import { registerDefaultHealthChecks, healthRegistry } from "./services/observability/health-check-registry";
import { alertingEngine } from "./services/observability/alerting-engine";
import { eventStream } from "./services/observability/event-stream";
import { anomalyDetector } from "./services/observability/anomaly-detector";
import { retentionManager } from "./services/observability/retention-manager";
import { environmentProvisioning } from "./services/environment-provisioning";
import { ensureWordlistFile } from "./lib/wordlist-resolver";

// Warn if JWT_SECRET is using the development default
const jwtSecret = process.env["JWT_SECRET"];
if (!jwtSecret || jwtSecret === "v8-platform-dev-secret-change-in-production") {
  logger.warn("[SECURITY] JWT_SECRET is set to the development default. " +
    "Set a strong, unique JWT_SECRET environment variable in production.");
}

const app: Express = express();

// ── Pre-Boot: Configure Go/Rust environment variables ───────────────────────
// Map structural variables into process.env so built tools are immediately
// discoverable by the toolchain resolver and subprocess executors.

(() => {
  const goEnv = environmentProvisioning.getGoEnvironment();
  const rustEnv = environmentProvisioning.getRustEnvironment();

  process.env["GOPATH"] = goEnv["GOPATH"] ?? process.env["GOPATH"];
  process.env["GOROOT"] = goEnv["GOROOT"] ?? process.env["GOROOT"];
  process.env["CARGO_HOME"] = rustEnv["CARGO_HOME"] ?? process.env["CARGO_HOME"];
  process.env["RUSTUP_HOME"] = rustEnv["RUSTUP_HOME"] ?? process.env["RUSTUP_HOME"];

  // Ensure Go and Cargo bins are on the PATH
  const goExtra = (goEnv["PATH"]?.split(path.delimiter) ?? []).slice(0, 2).filter(Boolean).join(path.delimiter);
  const cargoExtra = (rustEnv["PATH"]?.split(path.delimiter) ?? []).slice(0, 2).filter(Boolean).join(path.delimiter);
  const extraPaths = [goExtra, cargoExtra].filter(Boolean).join(path.delimiter);
  if (extraPaths) {
    const currentPath = process.env["PATH"] ?? "";
    if (!currentPath.includes(goExtra) && !currentPath.includes(cargoExtra)) {
      process.env["PATH"] = `${extraPaths}${path.delimiter}${currentPath}`;
    }
  }
})();

// ── Boot Sequence ───────────────────────────────────────────────────────────

setImmediate(async () => {
  // Phase 1: Environment Provisioning — check all runtimes are available
  try {
    const summary = await environmentProvisioning.provision(false);
    if (summary.missing > 0) {
      const missingNames = summary.results
        .filter((r) => !r.available)
        .map((r) => r.runtime);
      logger.warn(
        { missingCount: summary.missing, missing: missingNames },
        `[BOOT] ${summary.missing} runtime(s) missing: ${missingNames.join(", ")}. Run bootstrap script or install manually.`,
      );
    } else {
      logger.info("[BOOT] All runtimes verified — environment ready");
    }
  } catch (err) {
    logger.error({ err }, "[BOOT] Environment provisioning check failed");
  }

  // Phase 2: Recover orphaned scans that were queued/running before restart
  try {
    await orchestrator.recoverOrphanedScans();
    logger.info("[BOOT] Scan orchestrator initialized and orphaned scans recovered");
  } catch (err) {
    logger.error({ err }, "[BOOT] Failed to recover orphaned scans");
  }

  // Phase 3: Initialize the enterprise reporting engine
  try {
    await reportEngine.initialize();
    logger.info("[BOOT] Enterprise Reporting Engine initialized");
  } catch (err) {
    logger.error({ err }, "[BOOT] Failed to initialize Enterprise Reporting Engine");
  }

  // Phase 3b: Ensure wordlist file for content discovery tools
  try {
    await ensureWordlistFile();
    logger.info("[BOOT] Wordlist file initialized for content discovery tools");
  } catch (err) {
    logger.warn({ err }, "[BOOT] Wordlist file initialization skipped");
  }

  // Phase 4: Initialize the observability platform
  try {
    registerDefaultMetrics();
    registerDefaultHealthChecks();
    alertingEngine.initialize();
    anomalyDetector.initialize();
    healthRegistry.markStartupComplete();
    logger.info("[BOOT] Observability platform initialized");
  } catch (err) {
    logger.error({ err }, "[BOOT] Failed to initialize observability platform");
  }

  // Phase 5: Start the background retention sweep job
  try {
    retentionManager.start();
    logger.info("[BOOT] Retention manager background sweep started");
  } catch (err) {
    logger.error({ err }, "[BOOT] Failed to start retention manager");
  }

  // Phase 6: Periodic system metrics collection
  setInterval(() => {
    try {
      collectSystemMetrics();
    } catch (err) {
      logger.debug({ err }, "[METRICS] Periodic collection failed");
    }
  }, 15_000);
});

// ── Global Middleware ───────────────────────────────────────────────────────

// Security headers via helmet (overrides manual headers below)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow loading resources
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Manual security headers (in addition to helmet)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Note: generalLimiter at /api is intentionally broad. Auth/heavy paths
// are rate-limited by their specific limiters FIRST (return 429 before
// reaching generalLimiter), so double-counting is mitigated by early exit.
app.use("/api/auth", authLimiter);   // strict: 5 req/15min — blocks before general
app.use("/api/scans", heavyLimiter);  // 10 req/min — blocks before general
app.use("/api/tools", heavyLimiter);  // 10 req/min — blocks before general
app.use("/api/reports", heavyLimiter);// 10 req/min — blocks before general
app.use("/api", generalLimiter);      // 60 req/min catch-all for remaining routes

// ── Audit Logging ────────────────────────────────────────────────────────────
app.use("/api", auditMiddleware);

// Apply JWT authentication to all /api/* routes EXCEPT auth and health.
// The middleware checks req.path relative to the mount point (/api).
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  // Skip auth for public endpoints
  if (req.path.startsWith("/auth/") || req.path.startsWith("/health")) {
    return next();
  }
  return requireAuth(req, res, next);
});

app.use("/api", router);

// 404 handler for unmatched /api routes
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found" });
});

export default app;
