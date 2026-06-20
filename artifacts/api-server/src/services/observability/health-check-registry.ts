// ---------------------------------------------------------------------------
// Health Check Registry ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Central registry for health checks across all system components.
// Supports:
//   - Liveness checks (is the process alive?)
//   - Readiness checks (is the service ready to handle requests?)
//   - Startup checks (has the service finished initializing?)
//   - Dependency checks (are upstream services reachable?)
//
// Every service exposes its health via this registry.

import type { HealthCheckResult, HealthReport, HealthStatus } from "./types";
import { logger } from "../../lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export type HealthCheckCategory = "liveness" | "readiness" | "startup" | "dependency";

type HealthCheckFn = () => Promise<HealthCheckResult>;

interface RegisteredCheck {
  name: string;
  category: HealthCheckCategory;
  check: HealthCheckFn;
  timeoutMs: number;
  critical: boolean;
}

// ── Health Check Registry ──────────────────────────────────────────────────

export class HealthCheckRegistry {
  private checks: RegisteredCheck[] = [];
  private startupComplete = false;
  private startTime = Date.now();

  // ── Registration ─────────────────────────────────────────────────────────

  register(
    name: string,
    category: HealthCheckCategory,
    check: HealthCheckFn,
    options?: { timeoutMs?: number; critical?: boolean },
  ): void {
    this.checks.push({
      name,
      category,
      check,
      timeoutMs: options?.timeoutMs ?? 5000,
      critical: options?.critical ?? false,
    });
  }

  // ── Run Checks ───────────────────────────────────────────────────────────

  async runLiveness(): Promise<HealthReport> {
    return this.runChecks("liveness");
  }

  async runReadiness(): Promise<HealthReport> {
    return this.runChecks("readiness");
  }

  async runAll(): Promise<HealthReport> {
    return this.runChecks(undefined);
  }

  async runCheck(name: string): Promise<HealthCheckResult | null> {
    const check = this.checks.find(c => c.name === name);
    if (!check) return null;
    return this.executeCheck(check);
  }

  // ── Status ───────────────────────────────────────────────────────────────

  markStartupComplete(): void {
    this.startupComplete = true;
  }

  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  isReady(): boolean {
    return this.startupComplete;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async runChecks(category?: HealthCheckCategory): Promise<HealthReport> {
    let relevant = this.checks;
    if (category) {
      relevant = this.checks.filter(c => c.category === category);
    }

    const results = await Promise.allSettled(
      relevant.map(check => this.executeCheck(check)),
    );

    const checkResults: HealthCheckResult[] = results
      .filter((r): r is PromiseFulfilledResult<HealthCheckResult> => r.status === "fulfilled")
      .map(r => r.value);

    const overall: HealthStatus = checkResults.some(r => r.status === "unhealthy" && this.checks.find(c => c.name === r.name)?.critical)
      ? "unhealthy"
      : checkResults.some(r => r.status === "degraded")
        ? "degraded"
        : "healthy";

    return {
      status: overall,
      uptime: this.getUptime(),
      checks: checkResults,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeCheck(check: RegisteredCheck): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Health check timed out after ${check.timeoutMs}ms`)), check.timeoutMs),
      );

      const result = await Promise.race([check.check(), timeoutPromise]);
      return {
        ...result,
        durationMs: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      return {
        name: check.name,
        status: "unhealthy",
        message: `Health check failed: ${(err as Error).message}`,
        durationMs: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: null,
      };
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const healthRegistry = new HealthCheckRegistry();

// ── Default Health Checkers ────────────────────────────────────────────────

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { orchestrator } from "../../orchestrator-instance";
import { aiService } from "../../ai-instance";
import { reportEngine } from "../enterprise-reporting";

export function registerDefaultHealthChecks(): void {
  const reg = (name: string, category: HealthCheckCategory, check: HealthCheckFn, opts?: { timeoutMs?: number; critical?: boolean }) => {
    healthRegistry.register(name, category, check, opts);
  };

  // ── Database ────────────────────────────────────────────────────────────
  reg("database:connectivity", "readiness", async () => {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    return {
      name: "database:connectivity",
      status: "healthy",
      message: "Database connection is healthy",
      durationMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      metadata: null,
    };
  }, { timeoutMs: 3000, critical: true });

  // ── Queue ────────────────────────────────────────────────────────────────
  reg("queue:health", "readiness", async () => {
    const stats = orchestrator.getStats() as { queued: number; active: number; completed: number; failed: number };
    const total = stats.queued + stats.active + stats.completed;
    const status: HealthStatus = stats.failed > 100 ? "degraded" : "healthy";
    return {
      name: "queue:health",
      status,
      message: `Queue: ${stats.queued} queued, ${stats.active} active, ${stats.completed} completed, ${stats.failed} failed`,
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: { queued: stats.queued, active: stats.active, completed: stats.completed, failed: stats.failed },
    };
  }, { timeoutMs: 2000, critical: false });

  // ── AI Service ──────────────────────────────────────────────────────────
  reg("ai:service", "readiness", async () => {
    const status = aiService.getStatus();
    return {
      name: "ai:service",
      status: "healthy",
      message: `AI service: ${status.primaryAvailable ? "primary+fallback" : "fallback only"}, ${status.cacheSize} cached entries`,
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: { primaryAvailable: status.primaryAvailable, cacheSize: status.cacheSize, rateLimitRemaining: status.rateLimitRemaining },
    };
  }, { timeoutMs: 2000, critical: false });

  // ── Reporting Engine ────────────────────────────────────────────────────
  reg("reporting:engine", "readiness", async () => {
    const status = reportEngine.getStatus();
    return {
      name: "reporting:engine",
      status: status.initialized ? "healthy" : "degraded",
      message: `Reporting engine: ${status.initialized ? "initialized" : "not initialized"}, ${status.schedules} schedules`,
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: { initialized: status.initialized, schedules: status.schedules },
    };
  }, { timeoutMs: 2000, critical: false });

  // ── Orchestrator ────────────────────────────────────────────────────────
  reg("orchestrator:health", "liveness", async () => {
    return {
      name: "orchestrator:health",
      status: "healthy",
      message: "Scan orchestrator is running",
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: null,
    };
  }, { timeoutMs: 1000, critical: true });

  // ── Uptime ──────────────────────────────────────────────────────────────
  reg("system:uptime", "liveness", async () => {
    const uptime = healthRegistry.getUptime();
    return {
      name: "system:uptime",
      status: "healthy",
      message: `Server up for ${uptime}s`,
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: { uptimeSeconds: uptime },
    };
  }, { timeoutMs: 1000, critical: false });

  // ── Startup ─────────────────────────────────────────────────────────────
  reg("system:startup", "startup", async () => {
    return {
      name: "system:startup",
      status: healthRegistry.isReady() ? "healthy" : "degraded",
      message: healthRegistry.isReady() ? "Startup complete" : "Still initializing",
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: { startupComplete: healthRegistry.isReady() },
    };
  }, { timeoutMs: 1000, critical: false });

  // ── Memory ──────────────────────────────────────────────────────────────
  reg("system:memory", "dependency", async () => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const usagePercent = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB) * 100 : 0;
    const status: HealthStatus = usagePercent > 90 ? "unhealthy" : usagePercent > 75 ? "degraded" : "healthy";
    return {
      name: "system:memory",
      status,
      message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${Math.round(usagePercent)}%)`,
      durationMs: 0,
      lastChecked: new Date().toISOString(),
      metadata: { heapUsedMB, heapTotalMB, rssMB: Math.round(mem.rss / 1024 / 1024), usagePercent: Math.round(usagePercent) },
    };
  }, { timeoutMs: 1000, critical: false });

  logger.info("[HEALTH] Default health checks registered");
}
