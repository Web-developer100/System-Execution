// ---------------------------------------------------------------------------
// Distributed Worker Manager ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Manages a fleet of distributed worker nodes across multiple regions.
// Handles:
//   - Worker registration and de-registration
//   - Heartbeat monitoring with configurable intervals
//   - Health status tracking (healthy/degraded/unhealthy/offline)
//   - Capability and category filtering
//   - Auto-scaling based on queue depth and load metrics
//   - Prometheus-compatible metrics export

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger";
import type {
  WorkerRegistration,
  WorkerState,
  WorkerCategory,
  WorkerHealthStatus,
  HealthCheckResult,
  WorkerLoadMetrics,
  PrometheusMetric,
} from "./types";

// ── Events ────────────────────────────────────────────────────────────────

export type WorkerEventType =
  | "worker:registered"
  | "worker:deregistered"
  | "worker:heartbeat"
  | "worker:health_changed"
  | "worker:offline"
  | "worker:overloaded"
  | "worker:autoscale";

export interface WorkerEvent {
  type: WorkerEventType;
  workerId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ── Auto-Scaling Config ──────────────────────────────────────────────────

export interface AutoScaleConfig {
  enabled: boolean;
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;   // Queue depth per worker before scaling up
  scaleDownThreshold: number; // Queue depth per worker before scaling down
  cooldownPeriodMs: number;   // Minimum time between scaling actions
  cpuThreshold: number;       // CPU % before considering overloaded
  memoryThreshold: number;    // Memory % before considering overloaded
}

const DEFAULT_AUTOSCALE: AutoScaleConfig = {
  enabled: true,
  minWorkers: 1,
  maxWorkers: 100,
  scaleUpThreshold: 10,
  scaleDownThreshold: 2,
  cooldownPeriodMs: 120_000,
  cpuThreshold: 80,
  memoryThreshold: 85,
};

// ── Heartbeat Config ─────────────────────────────────────────────────────

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;  // 30s without heartbeat = offline
const HEARTBEAT_CLEANUP_INTERVAL = 30_000;     // Check every 30s

// ── Worker Manager ────────────────────────────────────────────────────────

export class DistributedWorkerManager {
  private workers = new Map<string, WorkerState>();
  private emitter = new EventEmitter();
  private listenerCount = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private autoScaleConfig: AutoScaleConfig;
  private lastScaleAction: number = 0;
  private totalJobsStarted: number = 0;
  private totalJobsCompleted: number = 0;
  private totalJobsFailed: number = 0;

  constructor(config?: Partial<AutoScaleConfig>) {
    this.autoScaleConfig = { ...DEFAULT_AUTOSCALE, ...config };
    this.startHeartbeatMonitor();
    logger.info(
      { minWorkers: this.autoScaleConfig.minWorkers, maxWorkers: this.autoScaleConfig.maxWorkers },
      "[DISTRIBUTED] Worker Manager initialized",
    );
  }

  // ── Events ─────────────────────────────────────────────────────────────

  on(callback: (event: WorkerEvent) => void): () => void {
    this.listenerCount++;
    this.emitter.on("workerEvent", callback);
    return () => {
      this.listenerCount--;
      this.emitter.off("workerEvent", callback);
    };
  }

  private emit(type: WorkerEventType, workerId: string, data?: Record<string, unknown>): void {
    if (this.listenerCount === 0) return;
    this.emitter.emit("workerEvent", { type, workerId, timestamp: new Date(), data });
  }

  // ── Worker Registration ────────────────────────────────────────────────

  registerWorker(registration: WorkerRegistration): WorkerState {
    const existing = this.workers.get(registration.workerId);

    const state: WorkerState = {
      registration,
      lastHeartbeat: new Date(),
      connectedAt: new Date(),
      activeJobs: 0,
      maxJobs: Math.max(1, Math.floor(registration.cpuCores * 2)),
      totalJobsCompleted: existing?.totalJobsCompleted ?? 0,
      totalJobsFailed: existing?.totalJobsFailed ?? 0,
      averageJobDurationMs: existing?.averageJobDurationMs ?? 0,
    };

    this.workers.set(registration.workerId, state);
    this.emit("worker:registered", registration.workerId, {
      hostname: registration.hostname,
      region: registration.region,
      categories: registration.categories,
    });

    logger.info(
      { workerId: registration.workerId, hostname: registration.hostname, region: registration.region },
      "[DISTRIBUTED] Worker registered",
    );

    return state;
  }

  deregisterWorker(workerId: string): boolean {
    const removed = this.workers.delete(workerId);
    if (removed) {
      this.emit("worker:deregistered", workerId);
      logger.info({ workerId }, "[DISTRIBUTED] Worker deregistered");
    }
    return removed;
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────

  processHeartbeat(workerId: string, registration: Partial<WorkerRegistration>): WorkerState | null {
    const state = this.workers.get(workerId);
    if (!state) return null;

    // Update registration fields that may change
    if (registration.cpuUsage !== undefined) state.registration.cpuUsage = registration.cpuUsage;
    if (registration.ramAvailableMb !== undefined) state.registration.ramAvailableMb = registration.ramAvailableMb;
    if (registration.currentLoad !== undefined) state.registration.currentLoad = registration.currentLoad;
    if (registration.healthStatus !== undefined) {
      const oldHealth = state.registration.healthStatus;
      state.registration.healthStatus = registration.healthStatus;
      if (oldHealth !== registration.healthStatus) {
        this.emit("worker:health_changed", workerId, { oldHealth, newHealth: registration.healthStatus });
      }
    }
    if (registration.diskAvailableMb !== undefined) state.registration.diskAvailableMb = registration.diskAvailableMb;
    if (registration.ipAddress !== undefined) state.registration.ipAddress = registration.ipAddress;

    state.lastHeartbeat = new Date();
    this.emit("worker:heartbeat", workerId, {
      cpuUsage: registration.cpuUsage,
      load: registration.currentLoad,
    });

    return state;
  }

  // ── Worker Queries ─────────────────────────────────────────────────────

  getWorker(workerId: string): WorkerState | undefined {
    return this.workers.get(workerId);
  }

  getAllWorkers(): WorkerState[] {
    return Array.from(this.workers.values());
  }

  getWorkersByCategory(category: WorkerCategory): WorkerState[] {
    return Array.from(this.workers.values()).filter((w) =>
      w.registration.categories.includes(category),
    );
  }

  getWorkersByRegion(region: string): WorkerState[] {
    return Array.from(this.workers.values()).filter((w) =>
      w.registration.region === region,
    );
  }

  getWorkersByCapability(capability: string): WorkerState[] {
    return Array.from(this.workers.values()).filter((w) =>
      w.registration.capabilities.includes(capability),
    );
  }

  getHealthyWorkers(): WorkerState[] {
    return Array.from(this.workers.values()).filter((w) =>
      w.registration.healthStatus === "healthy" && this.isWorkerResponsive(w),
    );
  }

  getAvailableWorkers(minRamMb?: number): WorkerState[] {
    return this.getHealthyWorkers().filter((w) => {
      if (minRamMb && w.registration.ramAvailableMb < minRamMb) return false;
      return w.activeJobs < w.maxJobs;
    });
  }

  // ── Job Tracking ──────────────────────────────────────────────────────

  assignJob(workerId: string): boolean {
    const state = this.workers.get(workerId);
    if (!state || state.activeJobs >= state.maxJobs) return false;
    state.activeJobs++;
    this.totalJobsStarted++;
    return true;
  }

  completeJob(workerId: string, durationMs: number, failed: boolean): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    state.activeJobs = Math.max(0, state.activeJobs - 1);

    if (failed) {
      state.totalJobsFailed++;
      this.totalJobsFailed++;
    } else {
      state.totalJobsCompleted++;
      this.totalJobsCompleted++;
    }

    // Rolling average
    state.averageJobDurationMs = Math.round(
      (state.averageJobDurationMs * (state.totalJobsCompleted + state.totalJobsFailed - 1) + durationMs) /
      (state.totalJobsCompleted + state.totalJobsFailed),
    );
  }

  // ── Load Metrics ──────────────────────────────────────────────────────

  getWorkerLoadMetrics(workerId: string): WorkerLoadMetrics | null {
    const state = this.workers.get(workerId);
    if (!state) return null;

    const ramUtilization = state.registration.ramTotalMb > 0
      ? Math.round(((state.registration.ramTotalMb - state.registration.ramAvailableMb) / state.registration.ramTotalMb) * 100)
      : 0;

    const totalJobs = state.totalJobsCompleted + state.totalJobsFailed;
    const failureRate = totalJobs > 0 ? state.totalJobsFailed / totalJobs : 0;

    // Score: lower = better (used for scheduling)
    const score =
      state.registration.cpuUsage * 0.3 +
      ramUtilization * 0.25 +
      (state.activeJobs / state.maxJobs) * 100 * 0.25 +
      failureRate * 100 * 0.2;

    return {
      workerId,
      cpuUsage: state.registration.cpuUsage,
      ramUtilization,
      activeJobs: state.activeJobs,
      maxJobs: state.maxJobs,
      queueDepth: this.workers.size,
      avgJobDurationMs: state.averageJobDurationMs,
      failureRate,
      score: Math.round(score),
    };
  }

  getAllLoadMetrics(): WorkerLoadMetrics[] {
    return Array.from(this.workers.keys())
      .map((id) => this.getWorkerLoadMetrics(id))
      .filter(Boolean) as WorkerLoadMetrics[];
  }

  // ── Auto-Scaling ──────────────────────────────────────────────────────

  evaluateAutoScale(currentQueueDepth: number): { action: "scale_up" | "scale_down" | "none"; reason: string; targetCount: number } {
    if (!this.autoScaleConfig.enabled) {
      return { action: "none", reason: "Auto-scaling disabled", targetCount: this.workers.size };
    }

    const now = Date.now();
    if (now - this.lastScaleAction < this.autoScaleConfig.cooldownPeriodMs) {
      return { action: "none", reason: "Cooldown period active", targetCount: this.workers.size };
    }

    const healthyCount = this.getHealthyWorkers().length;
    const queuePerWorker = healthyCount > 0 ? currentQueueDepth / healthyCount : currentQueueDepth;

    // Scale up
    if (queuePerWorker > this.autoScaleConfig.scaleUpThreshold && healthyCount < this.autoScaleConfig.maxWorkers) {
      const desired = Math.min(
        this.autoScaleConfig.maxWorkers,
        Math.ceil(currentQueueDepth / Math.max(1, this.autoScaleConfig.scaleUpThreshold)),
      );
      this.lastScaleAction = now;
      this.emit("worker:autoscale", "auto-scaler", { action: "scale_up", from: healthyCount, to: desired });
      logger.info({ from: healthyCount, to: desired, reason: `Queue depth ${currentQueueDepth}` }, "[DISTRIBUTED] Auto-scaling UP");
      return { action: "scale_up", reason: `Queue depth ${currentQueueDepth}, ${queuePerWorker.toFixed(1)} jobs/worker`, targetCount: desired };
    }

    // Scale down
    if (queuePerWorker < this.autoScaleConfig.scaleDownThreshold && healthyCount > this.autoScaleConfig.minWorkers) {
      const desired = Math.max(
        this.autoScaleConfig.minWorkers,
        Math.ceil(currentQueueDepth / 2),
      );
      this.lastScaleAction = now;
      this.emit("worker:autoscale", "auto-scaler", { action: "scale_down", from: healthyCount, to: desired });
      logger.info({ from: healthyCount, to: desired, reason: `Queue depth ${currentQueueDepth}` }, "[DISTRIBUTED] Auto-scaling DOWN");
      return { action: "scale_down", reason: `Low queue depth ${currentQueueDepth}`, targetCount: desired };
    }

    return { action: "none", reason: "Within thresholds", targetCount: healthyCount };
  }

  // ── Health Monitoring ─────────────────────────────────────────────────

  private startHeartbeatMonitor(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      let markedOffline = 0;

      for (const [workerId, state] of this.workers) {
        if (!this.isWorkerResponsive(state)) {
          const elapsed = now - state.lastHeartbeat.getTime();
          state.registration.healthStatus = "offline";
          markedOffline++;
          this.emit("worker:offline", workerId, { lastHeartbeat: state.lastHeartbeat.toISOString(), elapsedMs: elapsed });
          logger.warn({ workerId, elapsedMs: elapsed }, "[DISTRIBUTED] Worker marked OFFLINE — heartbeat missed");
        }
      }

      if (markedOffline > 0) {
        // Clean up workers that have been offline for > 5 minutes
        const fiveMinAgo = now - 300_000;
        for (const [workerId, state] of this.workers) {
          if (state.lastHeartbeat.getTime() < fiveMinAgo && state.registration.healthStatus === "offline") {
            this.workers.delete(workerId);
            logger.info({ workerId }, "[DISTRIBUTED] Removed offline worker (TTL expired)");
          }
        }
      }
    }, HEARTBEAT_CLEANUP_INTERVAL);

    if (this.heartbeatTimer && typeof this.heartbeatTimer === "object") {
      this.heartbeatTimer.unref?.();
    }
  }

  private isWorkerResponsive(state: WorkerState): boolean {
    return Date.now() - state.lastHeartbeat.getTime() < DEFAULT_HEARTBEAT_TIMEOUT_MS;
  }

  stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Metrics ───────────────────────────────────────────────────────────

  getPrometheusMetrics(): PrometheusMetric[] {
    const metrics: PrometheusMetric[] = [];
    const all = this.getAllWorkers();
    const healthy = this.getHealthyWorkers();

    metrics.push({ name: "v8_workers_total", value: all.length, labels: {}, help: "Total registered workers", type: "gauge" });
    metrics.push({ name: "v8_workers_healthy", value: healthy.length, labels: {}, help: "Healthy workers", type: "gauge" });
    metrics.push({ name: "v8_workers_offline", value: all.filter((w) => w.registration.healthStatus === "offline").length, labels: {}, help: "Offline workers", type: "gauge" });

    // Per-region
    const regions = new Set(all.map((w) => w.registration.region));
    for (const region of regions) {
      const count = all.filter((w) => w.registration.region === region).length;
      metrics.push({ name: "v8_workers_region", value: count, labels: { region }, help: "Workers by region", type: "gauge" });
    }

    // Per-category
    const categories = new Set(all.flatMap((w) => w.registration.categories));
    for (const cat of categories) {
      const count = all.filter((w) => w.registration.categories.includes(cat)).length;
      metrics.push({ name: "v8_workers_category", value: count, labels: { category: cat }, help: "Workers by category", type: "gauge" });
    }

    // Jobs
    metrics.push({ name: "v8_jobs_started_total", value: this.totalJobsStarted, labels: {}, help: "Total jobs started", type: "counter" });
    metrics.push({ name: "v8_jobs_completed_total", value: this.totalJobsCompleted, labels: {}, help: "Total jobs completed", type: "counter" });
    metrics.push({ name: "v8_jobs_failed_total", value: this.totalJobsFailed, labels: {}, help: "Total jobs failed", type: "counter" });

    // Active jobs per worker
    for (const state of all) {
      metrics.push({
        name: "v8_worker_active_jobs",
        value: state.activeJobs,
        labels: { worker_id: state.registration.workerId, hostname: state.registration.hostname },
        help: "Active jobs on worker",
        type: "gauge",
      });
    }

    return metrics;
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  getStats(): {
    totalWorkers: number;
    healthyWorkers: number;
    offlineWorkers: number;
    totalActiveJobs: number;
    totalJobsCompleted: number;
    totalJobsFailed: number;
    regions: string[];
    categories: string[];
  } {
    const all = this.getAllWorkers();
    return {
      totalWorkers: all.length,
      healthyWorkers: this.getHealthyWorkers().length,
      offlineWorkers: all.filter((w) => w.registration.healthStatus === "offline").length,
      totalActiveJobs: all.reduce((sum, w) => sum + w.activeJobs, 0),
      totalJobsCompleted: this.totalJobsCompleted,
      totalJobsFailed: this.totalJobsFailed,
      regions: [...new Set(all.map((w) => w.registration.region))],
      categories: [...new Set(all.flatMap((w) => w.registration.categories))],
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  shutdown(): void {
    this.stopHeartbeatMonitor();
    this.workers.clear();
    this.emitter.removeAllListeners();
    logger.info("[DISTRIBUTED] Worker Manager shut down");
  }
}

export const distributedWorkerManager = new DistributedWorkerManager();
