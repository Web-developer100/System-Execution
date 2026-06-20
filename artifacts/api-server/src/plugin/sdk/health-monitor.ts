// ---------------------------------------------------------------------------
// Plugin SDK — Plugin Health Monitor
// ---------------------------------------------------------------------------
//
// Continuously monitors plugin health:
//   - Status checks (healthy, degraded, broken)
//   - Resource usage (memory, CPU, execution time)
//   - Error rate tracking
//   - Crash detection
//   - Dependency health
//   - Security alerts
//
// Generates automatic alerts when unhealthy plugins are detected.

import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger";
import type { PluginLifecycleState } from "./types";

// ── Health State ───────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "broken" | "unknown";

export interface PluginHealthSnapshot {
  pluginId: string;
  status: HealthStatus;
  metrics: {
    memoryUsageMb: number;
    cpuUsagePercent: number;
    averageExecutionTimeMs: number;
    crashCount: number;
    errorRate: number;          // 0-1
    responseTimeMs: number;
    lastExecutionTimeMs: number;
  };
  lastCheck: Date;
  lastError: string | null;
  dependencies: Array<{ id: string; status: HealthStatus }>;
  alerts: HealthAlert[];
}

export interface HealthAlert {
  id: string;
  pluginId: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  metric: string;
  value: number;
  threshold: number;
}

// ── Health Check Configuration ─────────────────────────────────────────────

export interface HealthMonitorConfig {
  /** Default check interval in seconds */
  checkInterval: number;
  /** Error rate threshold (0-1) before degrading */
  errorRateThreshold: number;
  /** Crash count threshold before marking as broken */
  crashThreshold: number;
  /** Memory threshold in MB before warning */
  memoryThresholdMb: number;
  /** CPU threshold in percent before warning */
  cpuThresholdPercent: number;
  /** Max execution time in ms before warning */
  executionTimeThresholdMs: number;
  /** Max consecutive failures before marking as broken */
  maxConsecutiveFailures: number;
  /** Whether to auto-disable broken plugins */
  autoDisableBroken: boolean;
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkInterval: 60,
  errorRateThreshold: 0.1,
  crashThreshold: 3,
  memoryThresholdMb: 512,
  cpuThresholdPercent: 80,
  executionTimeThresholdMs: 300_000,
  maxConsecutiveFailures: 5,
  autoDisableBroken: true,
};

// ── Health Monitor ─────────────────────────────────────────────────────────

export class PluginHealthMonitor {
  private config: HealthMonitorConfig;
  private healthStates = new Map<string, PluginHealthSnapshot>();
  private checkTimers = new Map<string, ReturnType<typeof setInterval>>();
  private consecutiveFailures = new Map<string, number>();
  private alerts: HealthAlert[] = [];
  private emitter = new EventEmitter();
  private nextAlertId = 1;

  constructor(config?: Partial<HealthMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info("[HEALTH-MONITOR] Plugin Health Monitor initialized");
  }

  // ── Events ───────────────────────────────────────────────────────────────

  onHealthChange(
    callback: (event: { pluginId: string; status: HealthStatus; previous: HealthStatus; alerts: HealthAlert[] }) => void,
  ): () => void {
    this.emitter.on("health:change", callback);
    return () => { this.emitter.off("health:change", callback); };
  }

  onAlert(
    callback: (alert: HealthAlert) => void,
  ): () => void {
    this.emitter.on("health:alert", callback);
    return () => { this.emitter.off("health:alert", callback); };
  }

  // ── Plugin Registration ──────────────────────────────────────────────────

  /**
   * Start monitoring a plugin.
   */
  startMonitoring(pluginId: string, intervalSeconds?: number): void {
    if (this.checkTimers.has(pluginId)) return;

    // Initialize health state
    this.healthStates.set(pluginId, {
      pluginId,
      status: "unknown",
      metrics: {
        memoryUsageMb: 0,
        cpuUsagePercent: 0,
        averageExecutionTimeMs: 0,
        crashCount: 0,
        errorRate: 0,
        responseTimeMs: 0,
        lastExecutionTimeMs: 0,
      },
      lastCheck: new Date(),
      lastError: null,
      dependencies: [],
      alerts: [],
    });

    this.consecutiveFailures.set(pluginId, 0);

    // Start periodic checks
    const interval = (intervalSeconds ?? this.config.checkInterval) * 1000;
    const timer = setInterval(() => {
      this.runHealthCheck(pluginId).catch((err) => {
        logger.error({ err, pluginId }, "[HEALTH-MONITOR] Health check error");
      });
    }, interval);

    this.checkTimers.set(pluginId, timer);
    logger.info({ pluginId, intervalSeconds: interval / 1000 }, `[HEALTH-MONITOR] Started monitoring plugin "${pluginId}"`);
  }

  /**
   * Stop monitoring a plugin.
   */
  stopMonitoring(pluginId: string): void {
    const timer = this.checkTimers.get(pluginId);
    if (timer) {
      clearInterval(timer);
      this.checkTimers.delete(pluginId);
    }
    this.healthStates.delete(pluginId);
    this.consecutiveFailures.delete(pluginId);
    logger.info({ pluginId }, `[HEALTH-MONITOR] Stopped monitoring plugin "${pluginId}"`);
  }

  // ── Health Checks ────────────────────────────────────────────────────────

  /**
   * Run a health check for a plugin.
   */
  async runHealthCheck(pluginId: string): Promise<HealthStatus> {
    const state = this.healthStates.get(pluginId);
    if (!state) return "unknown";

    const previous = state.status;
    const startTime = Date.now();

    try {
      // Simulate health check (in production, this calls plugin.onHealthCheck())
      state.metrics.responseTimeMs = Date.now() - startTime;
      state.lastCheck = new Date();

      // Determine health status based on metrics
      const status = this.evaluateHealth(state);

      // Update state
      state.status = status;

      // Check thresholds and generate alerts
      this.checkThresholds(pluginId, state);

      // Reset consecutive failures on success
      this.consecutiveFailures.set(pluginId, 0);

      if (status !== previous) {
        this.emitter.emit("health:change", {
          pluginId,
          status,
          previous,
          alerts: state.alerts.filter((a) => !a.acknowledged),
        });

        logger.info({ pluginId, status, previous },
          `[HEALTH-MONITOR] Plugin "${pluginId}" status: ${previous} → ${status}`);
      }

      return status;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      state.lastError = errMsg;
      state.status = "broken";
      state.lastCheck = new Date();

      const cf = (this.consecutiveFailures.get(pluginId) ?? 0) + 1;
      this.consecutiveFailures.set(pluginId, cf);

      this.createAlert(pluginId, "critical", `Health check failed: ${errMsg}`, "errorRate", cf, this.config.maxConsecutiveFailures);

      if (cf >= this.config.maxConsecutiveFailures && this.config.autoDisableBroken) {
        logger.error({ pluginId, consecutiveFailures: cf },
          `[HEALTH-MONITOR] Plugin "${pluginId}" BROKEN — auto-disable required`);
      }

      this.emitter.emit("health:change", { pluginId, status: "broken", previous, alerts: [] });
      return "broken";
    }
  }

  /**
   * Evaluate overall health from metrics.
   */
  private evaluateHealth(state: PluginHealthSnapshot): HealthStatus {
    const m = state.metrics;

    // Broken conditions
    if (m.crashCount >= this.config.crashThreshold) return "broken";
    if ((this.consecutiveFailures.get(state.pluginId) ?? 0) >= this.config.maxConsecutiveFailures) return "broken";

    // Unhealthy conditions
    if (m.errorRate > this.config.errorRateThreshold) return "unhealthy";
    if (m.memoryUsageMb > this.config.memoryThresholdMb) return "unhealthy";

    // Degraded conditions
    if (m.cpuUsagePercent > this.config.cpuThresholdPercent) return "degraded";
    if (m.averageExecutionTimeMs > this.config.executionTimeThresholdMs) return "degraded";

    return "healthy";
  }

  /**
   * Check metrics against thresholds and create alerts.
   */
  private checkThresholds(pluginId: string, state: PluginHealthSnapshot): void {
    const m = state.metrics;

    if (m.memoryUsageMb > this.config.memoryThresholdMb) {
      this.createAlert(pluginId, "warning",
        `High memory usage: ${m.memoryUsageMb}MB (threshold: ${this.config.memoryThresholdMb}MB)`,
        "memoryUsageMb", m.memoryUsageMb, this.config.memoryThresholdMb);
    }

    if (m.cpuUsagePercent > this.config.cpuThresholdPercent) {
      this.createAlert(pluginId, "warning",
        `High CPU usage: ${m.cpuUsagePercent}% (threshold: ${this.config.cpuThresholdPercent}%)`,
        "cpuUsagePercent", m.cpuUsagePercent, this.config.cpuThresholdPercent);
    }

    if (m.crashCount > 0) {
      this.createAlert(pluginId, "critical",
        `Plugin crashed ${m.crashCount} time(s)`,
        "crashCount", m.crashCount, 1);
    }

    if (m.errorRate > this.config.errorRateThreshold) {
      this.createAlert(pluginId, "warning",
        `High error rate: ${(m.errorRate * 100).toFixed(1)}% (threshold: ${(this.config.errorRateThreshold * 100).toFixed(0)}%)`,
        "errorRate", m.errorRate, this.config.errorRateThreshold);
    }
  }

  // ── Metrics Recording ────────────────────────────────────────────────────

  /**
   * Record execution metrics for a plugin.
   */
  recordExecution(pluginId: string, metrics: {
    durationMs: number;
    success: boolean;
    memoryUsageMb?: number;
    cpuUsagePercent?: number;
  }): void {
    const state = this.healthStates.get(pluginId);
    if (!state) return;

    const m = state.metrics;
    const totalExecutions = m.averageExecutionTimeMs > 0
      ? Math.round(m.averageExecutionTimeMs / (m.averageExecutionTimeMs - m.lastExecutionTimeMs + 1)) + 1
      : 1;

    // Rolling averages
    m.averageExecutionTimeMs = Math.round(
      (m.averageExecutionTimeMs * (totalExecutions - 1) + metrics.durationMs) / totalExecutions,
    );
    m.lastExecutionTimeMs = metrics.durationMs;

    if (metrics.memoryUsageMb) m.memoryUsageMb = metrics.memoryUsageMb;
    if (metrics.cpuUsagePercent) m.cpuUsagePercent = metrics.cpuUsagePercent;

    if (!metrics.success) {
      m.crashCount++;
      m.errorRate = Math.min(1, m.errorRate + 0.1);
    } else {
      m.errorRate = Math.max(0, m.errorRate - 0.01);
    }
  }

  /**
   * Record a crash for a plugin.
   */
  recordCrash(pluginId: string, error: string): void {
    const state = this.healthStates.get(pluginId);
    if (!state) return;

    state.metrics.crashCount++;
    state.lastError = error;

    this.createAlert(pluginId, "critical",
      `Plugin crashed: ${error.slice(0, 200)}`,
      "crashCount", state.metrics.crashCount, this.config.crashThreshold);

    logger.error({ pluginId, error }, `[HEALTH-MONITOR] Plugin "${pluginId}" crashed`);
  }

  // ── Alert Management ─────────────────────────────────────────────────────

  private createAlert(
    pluginId: string,
    severity: "info" | "warning" | "critical",
    message: string,
    metric: string,
    value: number,
    threshold: number,
  ): void {
    const alert: HealthAlert = {
      id: `alert-${this.nextAlertId++}`,
      pluginId,
      severity,
      message,
      timestamp: new Date(),
      acknowledged: false,
      metric,
      value,
      threshold,
    };

    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    // Add to plugin's current alerts
    const state = this.healthStates.get(pluginId);
    if (state) {
      state.alerts.push(alert);
      if (state.alerts.length > 50) state.alerts.shift();
    }

    this.emitter.emit("health:alert", alert);

    logger.warn({ pluginId, severity, message }, `[HEALTH-MONITOR] Alert: ${message}`);
  }

  /**
   * Acknowledge an alert.
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  /**
   * Get all unacknowledged alerts.
   */
  getUnacknowledgedAlerts(): HealthAlert[] {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /**
   * Get health snapshot for a plugin.
   */
  getHealth(pluginId: string): PluginHealthSnapshot | undefined {
    return this.healthStates.get(pluginId);
  }

  /**
   * Get health snapshots for all monitored plugins.
   */
  getAllHealth(): PluginHealthSnapshot[] {
    return Array.from(this.healthStates.values());
  }

  /**
   * Get plugins by health status.
   */
  getByStatus(status: HealthStatus): PluginHealthSnapshot[] {
    return Array.from(this.healthStates.values()).filter((s) => s.status === status);
  }

  /**
   * Get health statistics.
   */
  getStats(): { total: number; healthy: number; degraded: number; unhealthy: number; broken: number; unknown: number; alerts: number } {
    const stats = { total: 0, healthy: 0, degraded: 0, unhealthy: 0, broken: 0, unknown: 0, alerts: this.alerts.length };
    for (const state of this.healthStates.values()) {
      stats.total++;
      switch (state.status) {
        case "healthy": stats.healthy++; break;
        case "degraded": stats.degraded++; break;
        case "unhealthy": stats.unhealthy++; break;
        case "broken": stats.broken++; break;
        default: stats.unknown++; break;
      }
    }
    return stats;
  }

  /**
   * Stop all monitoring (for shutdown).
   */
  async shutdown(): Promise<void> {
    for (const [pluginId, timer] of this.checkTimers) {
      clearInterval(timer);
      logger.debug({ pluginId }, "[HEALTH-MONITOR] Timer stopped");
    }
    this.checkTimers.clear();
    this.healthStates.clear();
    this.alerts = [];
    logger.info("[HEALTH-MONITOR] Monitor shut down");
  }
}

export const pluginHealthMonitor = new PluginHealthMonitor();
