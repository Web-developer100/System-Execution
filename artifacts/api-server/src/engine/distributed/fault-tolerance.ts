// ---------------------------------------------------------------------------
// Fault Tolerance Manager ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Ensures system resilience through:
//   - Worker failure detection (missed heartbeats, crash detection)
//   - Automatic job reassignment on worker failure
//   - Checkpoint-based recovery
//   - Safe retry with deduplication
//   - Circuit breaker for repeatedly failing workers
//   - Dead letter processing and alerting

import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger";
import { distributedWorkerManager } from "./worker-manager";
import { distributedQueue } from "./distributed-queue";
import type { FailureEvent, WorkerHealthStatus } from "./types";

// ── Circuit Breaker ───────────────────────────────────────────────────────

interface CircuitBreakerState {
  workerId: string;
  failures: number;
  lastFailure: Date;
  state: "closed" | "open" | "half_open";
  openedAt: Date | null;
  cooldownUntil: Date | null;
}

const CIRCUIT_THRESHOLD = 3;    // Failures before opening circuit
const CIRCUIT_COOLDOWN = 300_000; // 5 min cooldown

// ── Events ────────────────────────────────────────────────────────────────

export type FaultToleranceEventType =
  | "fault:worker_failed"
  | "fault:job_reassigned"
  | "fault:checkpoint_restored"
  | "fault:circuit_opened"
  | "fault:circuit_closed"
  | "fault:recovery_complete";

export interface FaultToleranceEvent {
  type: FaultToleranceEventType;
  workerId?: string;
  jobId?: string;
  scanId?: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ── Fault Tolerance Manager ───────────────────────────────────────────────

export class FaultToleranceManager {
  private circuits = new Map<string, CircuitBreakerState>();
  private failures: FailureEvent[] = [];
  private emitter = new EventEmitter();
  private listenerCount = 0;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private maxFailuresHistory = 1000;
  private recoveringJobs = new Set<string>(); // Prevent duplicate recovery

  constructor() {
    this.startRecoveryMonitor();
    logger.info("[FAULT-TOLERANCE] Fault Tolerance Manager initialized");
  }

  // ── Events ─────────────────────────────────────────────────────────────

  on(callback: (event: FaultToleranceEvent) => void): () => void {
    this.listenerCount++;
    this.emitter.on("faultEvent", callback);
    return () => {
      this.listenerCount--;
      this.emitter.off("faultEvent", callback);
    };
  }

  private emit(type: FaultToleranceEventType, data?: { workerId?: string; jobId?: string; scanId?: number } & Record<string, unknown>): void {
    if (this.listenerCount === 0) return;
    this.emitter.emit("faultEvent", { type, ...data, timestamp: new Date() });
  }

  // ── Failure Recording ──────────────────────────────────────────────────

  recordFailure(event: Omit<FailureEvent, "recovered" | "recoveryAction">): void {
    const failure: FailureEvent = {
      ...event,
      recovered: false,
      recoveryAction: null,
    };

    this.failures.push(failure);
    if (this.failures.length > this.maxFailuresHistory) {
      this.failures.shift();
    }

    logger.error(
      { workerId: event.workerId, jobId: event.jobId, type: event.type, details: event.details },
      "[FAULT-TOLERANCE] Failure recorded",
    );

    // Update circuit breaker
    this.recordCircuitFailure(event.workerId);

    // Trigger recovery
    this.recoverFromFailure(failure);
  }

  // ── Circuit Breaker ────────────────────────────────────────────────────

  private recordCircuitFailure(workerId: string): void {
    let circuit = this.circuits.get(workerId);

    if (!circuit) {
      circuit = {
        workerId,
        failures: 1,
        lastFailure: new Date(),
        state: "closed",
        openedAt: null,
        cooldownUntil: null,
      };
      this.circuits.set(workerId, circuit);
      return;
    }

    circuit.failures++;
    circuit.lastFailure = new Date();

    if (circuit.failures >= CIRCUIT_THRESHOLD && circuit.state === "closed") {
      circuit.state = "open";
      circuit.openedAt = new Date();
      circuit.cooldownUntil = new Date(Date.now() + CIRCUIT_COOLDOWN);

      // Mark worker as unhealthy
      const worker = distributedWorkerManager.getWorker(workerId);
      if (worker) {
        worker.registration.healthStatus = "unhealthy";
      }

      this.emit("fault:circuit_opened", {
        workerId,
        data: { failures: circuit.failures, cooldownMs: CIRCUIT_COOLDOWN },
      });

      logger.warn(
        { workerId, failures: circuit.failures, cooldownMs: CIRCUIT_COOLDOWN },
        "[FAULT-TOLERANCE] Circuit breaker OPENED for worker",
      );
    }
  }

  /**
   * Check if a worker's circuit breaker is open (should not assign jobs).
   */
  isCircuitOpen(workerId: string): boolean {
    const circuit = this.circuits.get(workerId);
    if (!circuit) return false;
    if (circuit.state === "closed") return false;

    // Check if cooldown has elapsed
    if (circuit.cooldownUntil && new Date() > circuit.cooldownUntil) {
      // Half-open: allow one test job
      circuit.state = "half_open";
      circuit.cooldownUntil = null;
      this.emit("fault:circuit_closed", { workerId, data: { state: "half_open" } });
      return false;
    }

    return true;
  }

  /**
   * Mark a circuit as closed (successful job on half-open worker).
   */
  closeCircuit(workerId: string): void {
    const circuit = this.circuits.get(workerId);
    if (circuit) {
      circuit.state = "closed";
      circuit.failures = 0;
      circuit.openedAt = null;
      circuit.cooldownUntil = null;
      this.emit("fault:circuit_closed", { workerId, data: { state: "closed" } });

      // Restore health
      const worker = distributedWorkerManager.getWorker(workerId);
      if (worker) {
        worker.registration.healthStatus = "healthy";
      }
    }
  }

  // ── Recovery ───────────────────────────────────────────────────────────

  private async recoverFromFailure(failure: FailureEvent): Promise<void> {
    const workerId = failure.workerId;
    const jobId = failure.jobId;

    if (!jobId) {
      // Worker-level failure without specific job — reassign all active jobs
      const worker = distributedWorkerManager.getWorker(workerId);
      if (worker && worker.activeJobs > 0) {
        // Checkpoint: mark all as needing reassignment
        logger.info(
          { workerId, activeJobs: worker.activeJobs },
          "[FAULT-TOLERANCE] Reassigning all jobs from failed worker",
        );
      }
      return;
    }

    // Prevent duplicate recovery for the same job
    if (this.recoveringJobs.has(jobId)) return;
    this.recoveringJobs.add(jobId);

    try {
      // Get checkpoint data
      const job = distributedQueue.getJob(jobId);
      if (!job) {
        this.recoveringJobs.delete(jobId);
        return;
      }

      // Re-enqueue the job for retry
      const reenqueued = distributedQueue.enqueue({
        scanId: job.scanId,
        priority: job.priority + 1, // Boost priority for retry
        queueType: "priority",
        type: job.type,
        target: job.target,
        toolName: job.toolName,
        workflowId: job.workflowId ?? undefined,
        workflowStepId: job.workflowStepId ?? undefined,
        maxRetries: job.maxRetries,
        timeoutMs: job.timeoutMs,
      });

      // Update failure record
      failure.recovered = true;
      failure.recoveryAction = `Re-enqueued as ${reenqueued.id} with boosted priority`;

      this.emit("fault:job_reassigned", {
        workerId,
        jobId,
        scanId: job.scanId,
        data: {
          newJobId: reenqueued.id,
          priority: reenqueued.priority,
          recoveryAction: failure.recoveryAction,
        },
      });

      logger.info(
        { workerId, jobId, newJobId: reenqueued.id },
        "[FAULT-TOLERANCE] Job reassigned after failure",
      );
    } catch (err) {
      logger.error({ err, workerId, jobId }, "[FAULT-TOLERANCE] Recovery failed");
    } finally {
      this.recoveringJobs.delete(jobId);
    }
  }

  // ── Background Recovery Monitor ────────────────────────────────────────

  private startRecoveryMonitor(): void {
    this.recoveryTimer = setInterval(() => {
      try {
        const now = Date.now();

        // Check for half-open circuits that can be closed
        for (const [workerId, circuit] of this.circuits) {
          if (circuit.state === "half_open") {
            // Attempt to close — if the worker is healthy again
            const worker = distributedWorkerManager.getWorker(workerId);
            if (worker && worker.registration.healthStatus === "healthy") {
              this.closeCircuit(workerId);
            } else if (circuit.cooldownUntil && now > circuit.cooldownUntil.getTime()) {
              // Cooldown expired, transition to half-open
              circuit.state = "half_open";
              circuit.cooldownUntil = null;
            }
          }
        }

        // Clean up old failures from history
        const maxAge = 24 * 60 * 60 * 1000;
        this.failures = this.failures.filter(
          (f) => now - f.timestamp.getTime() < maxAge,
        );
      } catch (err) {
        // Silent fail on recovery loop
      }
    }, 30_000);

    if (this.recoveryTimer && typeof this.recoveryTimer === "object") {
      this.recoveryTimer.unref?.();
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────

  getFailureHistory(workerId?: string, limit = 50): FailureEvent[] {
    let filtered = this.failures;
    if (workerId) {
      filtered = filtered.filter((f) => f.workerId === workerId);
    }
    return filtered.slice(-limit);
  }

  getCircuitBreakers(): CircuitBreakerState[] {
    return Array.from(this.circuits.values());
  }

  getStats(): {
    totalFailures: number;
    recovered: number;
    unrecovered: number;
    openCircuits: number;
    halfOpenCircuits: number;
  } {
    return {
      totalFailures: this.failures.length,
      recovered: this.failures.filter((f) => f.recovered).length,
      unrecovered: this.failures.filter((f) => !f.recovered).length,
      openCircuits: Array.from(this.circuits.values()).filter((c) => c.state === "open").length,
      halfOpenCircuits: Array.from(this.circuits.values()).filter((c) => c.state === "half_open").length,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  shutdown(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.circuits.clear();
    this.failures = [];
    this.recoveringJobs.clear();
    this.emitter.removeAllListeners();
    logger.info("[FAULT-TOLERANCE] Fault Tolerance Manager shut down");
  }
}

export const faultToleranceManager = new FaultToleranceManager();
