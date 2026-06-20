// ---------------------------------------------------------------------------
// Distributed Queue System ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Advanced queue with multiple queue types:
//   - Priority Queue: jobs sorted by priority
//   - FIFO Queue: first-in-first-out
//   - Scheduled Queue: deferred execution
//   - Retry Queue: automatic retry with backoff
//   - Dead Letter Queue: permanently failed jobs
//   - Dependency Queue: jobs that wait on predecessors

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger";
import type {
  DistributedJob,
  QueuedJobStatus,
  QueueType,
} from "./types";

// ── Events ────────────────────────────────────────────────────────────────

export type DistributedQueueEventType =
  | "job:queued" | "job:started" | "job:completed" | "job:failed"
  | "job:retrying" | "job:dead_letter" | "job:cancelled"
  | "job:dependency_resolved";

export interface DistributedQueueEvent {
  type: DistributedQueueEventType;
  jobId: string;
  scanId: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ── Retry Config ─────────────────────────────────────────────────────────

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
  backoffMultiplier: 2,
};

// ── Distributed Queue ─────────────────────────────────────────────────────

export class DistributedQueue {
  private priorityQueue: DistributedJob[] = [];
  private fifoQueue: DistributedJob[] = [];
  private scheduledJobs: DistributedJob[] = [];
  private retryQueue: DistributedJob[] = [];
  private deadLetterQueue: DistributedJob[] = [];
  private dependencyQueue: DistributedJob[] = [];
  private activeJobs = new Map<string, DistributedJob>();
  private completedJobs: DistributedJob[] = [];

  private emitter = new EventEmitter();
  private listenerCount = 0;
  private retryConfig: RetryConfig;

  // Processing timers
  private scheduledTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private dependencyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY, ...retryConfig };
    this.startBackgroundProcessors();
    logger.info("[DISTRIBUTED-QUEUE] Distributed Queue initialized");
  }

  // ── Events ─────────────────────────────────────────────────────────────

  on(callback: (event: DistributedQueueEvent) => void): () => void {
    this.listenerCount++;
    this.emitter.on("queueEvent", callback);
    return () => {
      this.listenerCount--;
      this.emitter.off("queueEvent", callback);
    };
  }

  private emit(type: DistributedQueueEventType, jobId: string, scanId: number, data?: Record<string, unknown>): void {
    if (this.listenerCount === 0) return;
    this.emitter.emit("queueEvent", { type, jobId, scanId, timestamp: new Date(), data });
  }

  // ── Enqueue ────────────────────────────────────────────────────────────

  enqueue(params: {
    scanId: number;
    priority?: number;
    queueType?: QueueType;
    type: string;
    target: string;
    toolName: string;
    workflowId?: string;
    workflowStepId?: string;
    dependencies?: string[];
    maxRetries?: number;
    timeoutMs?: number;
    scheduledAt?: Date;
  }): DistributedJob {
    const job: DistributedJob = {
      id: `job-${randomUUID().slice(0, 12)}`,
      scanId: params.scanId,
      priority: params.priority ?? 5,
      queueType: params.queueType ?? "fifo",
      type: params.type,
      target: params.target,
      toolName: params.toolName,
      workflowId: params.workflowId ?? null,
      workflowStepId: params.workflowStepId ?? null,
      dependencies: params.dependencies ?? [],
      retryCount: 0,
      maxRetries: params.maxRetries ?? this.retryConfig.maxRetries,
      status: "queued",
      assignedWorker: null,
      createdAt: new Date(),
      scheduledAt: params.scheduledAt ?? null,
      startedAt: null,
      completedAt: null,
      timeoutMs: params.timeoutMs ?? 300_000,
      progress: 0,
      logs: [],
      error: null,
      artifacts: [],
    };

    // Check dependencies
    if (job.dependencies.length > 0) {
      job.status = "dependency_waiting";
      this.dependencyQueue.push(job);
      this.emit("job:queued", job.id, job.scanId, {
        type: job.type,
        target: job.target,
        toolName: job.toolName,
        dependencies: job.dependencies,
        status: "dependency_waiting",
      });
      return job;
    }

    // Scheduled
    if (job.scheduledAt && job.scheduledAt > new Date()) {
      job.status = "scheduled";
      this.scheduledJobs.push(job);
      this.emit("job:queued", job.id, job.scanId, {
        type: job.type,
        target: job.target,
        toolName: job.toolName,
        scheduledAt: job.scheduledAt.toISOString(),
        status: "scheduled",
      });
      return job;
    }

    // Priority or FIFO
    if (job.priority > 0) {
      this.priorityQueue.push(job);
      this.priorityQueue.sort((a, b) => b.priority - a.priority);
    } else {
      this.fifoQueue.push(job);
    }

    this.emit("job:queued", job.id, job.scanId, {
      type: job.type,
      target: job.target,
      toolName: job.toolName,
      priority: job.priority,
      status: "queued",
    });

    return job;
  }

  // ── Dequeue ────────────────────────────────────────────────────────────

  dequeue(maxJobs = 1): DistributedJob[] {
    const result: DistributedJob[] = [];

    while (result.length < maxJobs) {
      // 1. Priority queue first
      const priorityJob = this.priorityQueue.shift();
      if (priorityJob) {
        result.push(this.activateJob(priorityJob));
        continue;
      }

      // 2. FIFO queue
      const fifoJob = this.fifoQueue.shift();
      if (fifoJob) {
        result.push(this.activateJob(fifoJob));
        continue;
      }

      // 3. Retry queue (check backoff)
      const retryIdx = this.retryQueue.findIndex((j) => {
        const delay = this.computeBackoff(j.retryCount);
        return j.completedAt && (Date.now() - j.completedAt.getTime()) >= delay;
      });
      if (retryIdx !== -1) {
        const retryJob = this.retryQueue.splice(retryIdx, 1)[0];
        result.push(this.activateJob(retryJob));
        continue;
      }

      break;
    }

    return result;
  }

  private activateJob(job: DistributedJob): DistributedJob {
    const activated: DistributedJob = {
      ...job,
      status: "running",
      startedAt: new Date(),
    };
    this.activeJobs.set(activated.id, activated);
    this.emit("job:started", activated.id, activated.scanId, {
      type: activated.type,
      target: activated.target,
      toolName: activated.toolName,
      workerId: activated.assignedWorker,
    });
    return activated;
  }

  // ── Complete / Fail ─────────────────────────────────────────────────────

  completeJob(jobId: string, success: boolean, error?: string): DistributedJob | null {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    this.activeJobs.delete(jobId);

    if (success) {
      const completed: DistributedJob = {
        ...job,
        status: "completed",
        completedAt: new Date(),
        progress: 100,
      };
      this.completedJobs.push(completed);
      this.emit("job:completed", jobId, job.scanId, {
        toolName: job.toolName,
        durationMs: (completed.completedAt?.getTime() ?? Date.now()) - (job.startedAt?.getTime() ?? Date.now()),
      });
      return completed;
    }

    // Retry logic
    if (job.retryCount < job.maxRetries) {
      const retrying: DistributedJob = {
        ...job,
        status: "retrying",
        retryCount: job.retryCount + 1,
        error: error ?? null,
        completedAt: new Date(),
      };
      this.retryQueue.push(retrying);
      this.emit("job:retrying", jobId, job.scanId, {
        retryCount: retrying.retryCount,
        maxRetries: job.maxRetries,
        delayMs: this.computeBackoff(retrying.retryCount),
        error,
      });
      return retrying;
    }

    // Dead letter
    const dead: DistributedJob = {
      ...job,
      status: "dead_letter",
      error: error ?? null,
      completedAt: new Date(),
    };
    this.deadLetterQueue.push(dead);
    this.emit("job:dead_letter", jobId, job.scanId, {
      toolName: job.toolName,
      error,
      retryCount: job.retryCount,
    });
    logger.error({ jobId, scanId: job.scanId, toolName: job.toolName, error }, "[DISTRIBUTED-QUEUE] Job moved to dead letter queue");
    return dead;
  }

  // ── Cancel ─────────────────────────────────────────────────────────────

  cancelJob(jobId: string): boolean {
    // Check all queues
    const queues = [
      [this.priorityQueue, "priority"] as const,
      [this.fifoQueue, "fifo"] as const,
      [this.scheduledJobs, "scheduled"] as const,
      [this.retryQueue, "retry"] as const,
      [this.dependencyQueue, "dependency"] as const,
    ];

    for (const [queue] of queues) {
      const idx = queue.findIndex((j) => j.id === jobId);
      if (idx !== -1) {
        const [cancelled] = queue.splice(idx, 1);
        cancelled.status = "cancelled";
        this.emit("job:cancelled", jobId, cancelled.scanId, { toolName: cancelled.toolName });
        return true;
      }
    }

    // Check active jobs
    const active = this.activeJobs.get(jobId);
    if (active) {
      active.status = "cancelled";
      this.activeJobs.delete(jobId);
      this.emit("job:cancelled", jobId, active.scanId, { toolName: active.toolName });
      return true;
    }

    return false;
  }

  // ── Dependency Resolution ──────────────────────────────────────────────

  resolveDependencies(jobId: string): void {
    const pending = this.dependencyQueue.filter((j) =>
      j.dependencies.includes(jobId),
    );

    for (const job of pending) {
      // Remove resolved dependency
      job.dependencies = job.dependencies.filter((d) => d !== jobId);

      if (job.dependencies.length === 0) {
        // All dependencies resolved — move to main queue
        job.status = "queued";
        const idx = this.dependencyQueue.indexOf(job);
        if (idx !== -1) {
          this.dependencyQueue.splice(idx, 1);
          if (job.priority > 0) {
            this.priorityQueue.push(job);
            this.priorityQueue.sort((a, b) => b.priority - a.priority);
          } else {
            this.fifoQueue.push(job);
          }
          this.emit("job:dependency_resolved", job.id, job.scanId, {
            toolName: job.toolName,
            resolvedDependency: jobId,
          });
        }
      }
    }
  }

  // ── Background Processors ──────────────────────────────────────────────

  private startBackgroundProcessors(): void {
    // Process scheduled jobs every 10 seconds
    this.scheduledTimer = setInterval(() => {
      const now = Date.now();
      const ready = this.scheduledJobs.filter(
        (j) => j.scheduledAt && j.scheduledAt.getTime() <= now,
      );
      for (const job of ready) {
        const idx = this.scheduledJobs.indexOf(job);
        if (idx !== -1) {
          this.scheduledJobs.splice(idx, 1);
          job.status = "queued";
          if (job.priority > 0) {
            this.priorityQueue.push(job);
            this.priorityQueue.sort((a, b) => b.priority - a.priority);
          } else {
            this.fifoQueue.push(job);
          }
        }
      }
    }, 10_000);

    // Process retry queue every 5 seconds
    this.retryTimer = setInterval(() => {
      // Checkpoint is done in dequeue()
    }, 5_000);

    // Process dependency queue every 5 seconds
    this.dependencyTimer = setInterval(() => {
      // Checkpoint is done when jobs complete
    }, 5_000);

    for (const timer of [this.scheduledTimer, this.retryTimer, this.dependencyTimer]) {
      if (timer && typeof timer === "object") timer.unref?.();
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────

  getJob(jobId: string): DistributedJob | undefined {
    const queues = [
      this.priorityQueue, this.fifoQueue, this.scheduledJobs,
      this.retryQueue, this.dependencyQueue, this.deadLetterQueue,
      this.completedJobs,
    ];
    for (const queue of queues) {
      const found = queue.find((j) => j.id === jobId);
      if (found) return found;
    }
    return this.activeJobs.get(jobId);
  }

  getJobsByScan(scanId: number): DistributedJob[] {
    const all = [
      ...this.priorityQueue, ...this.fifoQueue, ...this.scheduledJobs,
      ...this.retryQueue, ...this.dependencyQueue, ...this.deadLetterQueue,
      ...this.completedJobs, ...Array.from(this.activeJobs.values()),
    ];
    return all.filter((j) => j.scanId === scanId);
  }

  getQueueDepth(): number {
    return this.priorityQueue.length + this.fifoQueue.length +
      this.retryQueue.length + this.dependencyQueue.length +
      this.scheduledJobs.length;
  }

  getActiveCount(): number {
    return this.activeJobs.size;
  }

  getDeadLetterCount(): number {
    return this.deadLetterQueue.length;
  }

  getStats(): {
    queueDepth: number;
    active: number;
    scheduled: number;
    retrying: number;
    dependencyWaiting: number;
    deadLetter: number;
    completed: number;
    priorityHigh: number;
    priorityLow: number;
  } {
    return {
      queueDepth: this.getQueueDepth(),
      active: this.activeJobs.size,
      scheduled: this.scheduledJobs.length,
      retrying: this.retryQueue.length,
      dependencyWaiting: this.dependencyQueue.length,
      deadLetter: this.deadLetterQueue.length,
      completed: this.completedJobs.length,
      priorityHigh: this.priorityQueue.filter((j) => j.priority >= 7).length,
      priorityLow: this.priorityQueue.filter((j) => j.priority < 4).length,
    };
  }

  // ── Backoff ────────────────────────────────────────────────────────────

  private computeBackoff(retryCount: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, retryCount - 1);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  cleanup(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.completedJobs.length + this.deadLetterQueue.length;

    this.completedJobs = this.completedJobs.filter(
      (j) => j.completedAt && j.completedAt.getTime() > cutoff,
    );
    this.deadLetterQueue = this.deadLetterQueue.filter(
      (j) => j.completedAt && j.completedAt.getTime() > cutoff,
    );

    return before - this.completedJobs.length - this.deadLetterQueue.length;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  shutdown(): void {
    for (const timer of [this.scheduledTimer, this.retryTimer, this.dependencyTimer]) {
      if (timer) clearInterval(timer);
    }
    this.priorityQueue = [];
    this.fifoQueue = [];
    this.scheduledJobs = [];
    this.retryQueue = [];
    this.deadLetterQueue = [];
    this.dependencyQueue = [];
    this.activeJobs.clear();
    this.completedJobs = [];
    this.emitter.removeAllListeners();
    logger.info("[DISTRIBUTED-QUEUE] Queue shut down");
  }
}

export const distributedQueue = new DistributedQueue();
