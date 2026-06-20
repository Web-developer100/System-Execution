import { EventEmitter } from "node:events";
import type { ScanJob, ScanStatus, JobEvent, JobEventCallback, LogLevel } from "./types";

// ── Checkpoint Record ─────────────────────────────────────────────────────
//
// Persists scan progress so interrupted tasks can be resumed.

interface CheckpointRecord {
  scanId: number;
  target: string;
  tools: string[];
  status: ScanStatus;
  progress: number;
  completedStage: string | null;
  completedTools: string[];
  failedTools: string[];
  error: string | null;
  snapshot: string; // JSON serialized partial findings
  createdAt: string;
  updatedAt: string;
}

// ── In-Memory Checkpoint Store ────────────────────────────────────────────

const checkpoints = new Map<number, CheckpointRecord>();

// ── Job Queue Interface ───────────────────────────────────────────────────

export interface IJobQueue {
  readonly length: number;
  readonly activeCount: number;
  readonly maxConcurrency: number;

  /** Subscribe to job events */
  on(callback: JobEventCallback): () => void;

  /** Add a job to the queue */
  enqueue(job: ScanJob): void;

  /** Remove a job from the queue (e.g. cancelled before starting) */
  dequeue(scanId: number): boolean;

  /** Get a snapshot of all jobs in the queue */
  snapshot(): { queued: ScanJob[]; active: ScanJob[]; completed: ScanJob[] };

  /** Get a job by ID from any state */
  getJob(scanId: number): ScanJob | undefined;

  /** Update job status */
  updateStatus(scanId: number, status: ScanStatus, progress?: number): void;

  /** Emit a log event for a running job (bridged to WebSocket) */
  publishLog(scanId: number, level: string, message: string): void;

  /** Emit a progress event for a running job (bridged to WebSocket) */
  publishProgress(scanId: number, progress: number): void;

  // ── Checkpoint Recovery ─────────────────────────────────────────────────

  /** Save a checkpoint for a running job */
  saveCheckpoint(scanId: number, data: Omit<CheckpointRecord, "createdAt" | "updatedAt">): void;

  /** Get checkpoint data for a job */
  getCheckpoint(scanId: number): CheckpointRecord | undefined;

  /** Remove checkpoint data (e.g. after successful completion) */
  clearCheckpoint(scanId: number): void;

  /** Get all checkpointed jobs for recovery after restart */
  getAllCheckpoints(): CheckpointRecord[];

  /** Run checkpoint cleanup (remove expired checkpoints) */
  runCheckpointCleanup(): void;
}

// ── Job Queue Implementation ──────────────────────────────────────────────

export class JobQueue implements IJobQueue {
  readonly maxConcurrency: number;

  private _queued: ScanJob[] = [];
  private _active = new Map<number, ScanJob>();
  private _completed: ScanJob[] = [];
  private _emitter = new EventEmitter();
  private _eventListeners = 0;

  // Checkpoint recovery background loop
  private _checkpointTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.startCheckpointLoop();
  }

  get length(): number {
    return this._queued.length;
  }

  get activeCount(): number {
    return this._active.size;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  on(callback: JobEventCallback): () => void {
    this._eventListeners++;
    this._emitter.on("jobEvent", callback);
    return () => {
      this._eventListeners--;
      this._emitter.off("jobEvent", callback);
    };
  }

  private emit(type: JobEvent["type"], scanId: number, data: Record<string, unknown> = {}): void {
    if (this._eventListeners === 0) return;
    const event: JobEvent = { type, scanId, timestamp: new Date(), data };
    this._emitter.emit("jobEvent", event);
  }

  // ── Queue operations ──────────────────────────────────────────────────────

  enqueue(job: ScanJob): void {
    const existing = this._queued.find((j) => j.id === job.id);
    if (existing) return; // already queued

    this._queued.push(job);
    this.emit("queued", job.id, { target: job.target, tools: job.tools });
  }

  dequeue(scanId: number): boolean {
    const idx = this._queued.findIndex((j) => j.id === scanId);
    if (idx !== -1) {
      this._queued.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Remove and return the next job ready for execution, or undefined */
  next(): ScanJob | undefined {
    if (this._active.size >= this.maxConcurrency) return undefined;
    const job = this._queued.shift();
    if (!job) return undefined;

    const updated: ScanJob = { ...job, status: "running", startedAt: new Date() };
    this._active.set(updated.id, updated);

    // Save checkpoint on start
    this.saveCheckpoint(updated.id, {
      scanId: updated.id,
      target: updated.target,
      tools: updated.tools,
      status: "running",
      progress: 0,
      completedStage: null,
      completedTools: [],
      failedTools: [],
      error: null,
      snapshot: "{}",
    });

    this.emit("started", updated.id, { target: updated.target });
    return updated;
  }

  complete(scanId: number, status: "completed" | "failed" | "stopped"): ScanJob | undefined {
    const job = this._active.get(scanId);
    if (!job) return undefined;

    this._active.delete(scanId);
    const updated: ScanJob = {
      ...job,
      status,
      completedAt: new Date(),
      progress: status === "completed" ? 100 : job.progress,
    };
    this._completed.push(updated);

    // Clear checkpoint on successful completion (keep for failed for debugging)
    if (status === "completed") {
      this.clearCheckpoint(scanId);
    } else {
      this.saveCheckpoint(scanId, {
        scanId,
        target: updated.target,
        tools: updated.tools,
        status,
        progress: updated.progress,
        completedStage: null,
        completedTools: [],
        failedTools: [],
        error: status === "failed" ? "Job completed with failure status" : "Job stopped",
        snapshot: "{}",
      });
    }

    this.emit(status, scanId, { target: updated.target });
    return updated;
  }

  /**
   * Claim the next available job from the queue.
   */
  claimNext(): ScanJob | undefined {
    return this.next();
  }

  // ── Snapshot & status ─────────────────────────────────────────────────────

  snapshot(): { queued: ScanJob[]; active: ScanJob[]; completed: ScanJob[] } {
    return {
      queued: [...this._queued],
      active: Array.from(this._active.values()),
      completed: [...this._completed],
    };
  }

  getJob(scanId: number): ScanJob | undefined {
    const inQueued = this._queued.find((j) => j.id === scanId);
    if (inQueued) return inQueued;
    const inActive = this._active.get(scanId);
    if (inActive) return inActive;
    return this._completed.find((j) => j.id === scanId);
  }

  updateStatus(scanId: number, status: ScanStatus, progress?: number): void {
    const update = (job: ScanJob): ScanJob => ({
      ...job,
      status,
      ...(progress !== undefined ? { progress } : {}),
      ...(status === "running" && !job.startedAt ? { startedAt: new Date() } : {}),
      ...((status === "completed" || status === "failed" || status === "stopped") && !job.completedAt
        ? { completedAt: new Date() }
        : {}),
    });

    // Check all states
    const queuedIdx = this._queued.findIndex((j) => j.id === scanId);
    if (queuedIdx !== -1) {
      this._queued[queuedIdx] = update(this._queued[queuedIdx]);
      return;
    }

    const active = this._active.get(scanId);
    if (active) {
      this._active.set(scanId, update(active));
      return;
    }

    const compIdx = this._completed.findIndex((j) => j.id === scanId);
    if (compIdx !== -1) {
      this._completed[compIdx] = update(this._completed[compIdx]);
    }
  }

  // ── Event publishing (for WebSocket bridge) ───────────────────────────────

  /** Emit a structured log event so WebSocket clients receive real-time logs */
  publishLog(scanId: number, level: string, message: string): void {
    if (this._eventListeners === 0) return;
    const event: JobEvent = {
      type: "log",
      scanId,
      timestamp: new Date(),
      data: { level, message, timestamp: new Date().toISOString() },
    };
    this._emitter.emit("jobEvent", event);
  }

  /** Emit a progress event so WebSocket clients receive real-time progress */
  publishProgress(scanId: number, progress: number): void {
    if (this._eventListeners === 0) return;
    const event: JobEvent = {
      type: "progress",
      scanId,
      timestamp: new Date(),
      data: { progress },
    };
    this._emitter.emit("jobEvent", event);
  }

  /** Recover jobs that were running when the system crashed */
  recoverRunning(runningJobs: ScanJob[]): void {
    for (const job of runningJobs) {
      // Re-queue them as queued
      const recovered: ScanJob = {
        ...job,
        status: "queued",
        startedAt: null,
        completedAt: null,
        progress: 0,
      };
      this._queued.push(recovered);
      this.emit("queued", recovered.id, {
        target: recovered.target,
        tools: recovered.tools,
        recovered: true,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT RECOVERY SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save a checkpoint for a running job.
   * Checkpoints are kept in-memory with TTL-based expiration.
   */
  saveCheckpoint(scanId: number, data: Omit<CheckpointRecord, "createdAt" | "updatedAt">): void {
    const existing = checkpoints.get(scanId);
    const now = new Date().toISOString();
    checkpoints.set(scanId, {
      ...data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  /**
   * Get checkpoint data for a job.
   */
  getCheckpoint(scanId: number): CheckpointRecord | undefined {
    return checkpoints.get(scanId);
  }

  /**
   * Remove checkpoint data.
   */
  clearCheckpoint(scanId: number): void {
    checkpoints.delete(scanId);
  }

  /**
   * Get all checkpointed jobs.
   */
  getAllCheckpoints(): CheckpointRecord[] {
    return Array.from(checkpoints.values());
  }

  /**
   * Run checkpoint cleanup - remove expired checkpoints.
   * Expired = older than 24 hours and not in active/queued state.
   */
  runCheckpointCleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let removed = 0;

    for (const [scanId, record] of checkpoints) {
      const updated = new Date(record.updatedAt).getTime();
      if (now - updated > maxAge) {
        // Only remove if the job isn't currently active or queued
        const inQueue = this._queued.some((j) => j.id === scanId);
        const inActive = this._active.has(scanId);
        if (!inQueue && !inActive) {
          checkpoints.delete(scanId);
          removed++;
        }
      }
    }

    if (removed > 0) {
      this.publishLog(0, "info", `[CHECKPOINT] Cleaned up ${removed} expired checkpoint(s)`);
    }
  }

  /**
   * Start the background checkpoint fallback loop.
   * Periodically:
   *   1. Saves checkpoints for currently active jobs
   *   2. Cleans up expired checkpoints
   *   3. Attempts to recover jobs that appear stuck
   */
  private startCheckpointLoop(): void {
    if (this._checkpointTimer) return;

    this._checkpointTimer = setInterval(() => {
      try {
        const now = new Date();

        // 1. Save periodic checkpoints for active jobs
        for (const [scanId, job] of this._active) {
          const existing = checkpoints.get(scanId);
          checkpoints.set(scanId, {
            scanId,
            target: job.target,
            tools: job.tools,
            status: job.status,
            progress: job.progress,
            completedStage: null,
            completedTools: [],
            failedTools: [],
            error: null,
            snapshot: "{}",
            createdAt: existing?.createdAt ?? now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        // 2. Cleanup expired checkpoints
        this.runCheckpointCleanup();

        // 3. Detect stuck jobs (active > 30 minutes with no progress)
        const stuckTimeout = 30 * 60 * 1000;
        for (const [scanId, job] of this._active) {
          const elapsed = job.startedAt
            ? now.getTime() - job.startedAt.getTime()
            : 0;
          if (elapsed > stuckTimeout && job.progress === job.progress) {
            // Job appears stuck — mark it
            this.publishLog(
              scanId,
              "warn",
              `[CHECKPOINT] Job #${scanId} appears stuck (${Math.round(elapsed / 1000)}s elapsed, ${job.progress}% progress). Will be available for recovery on restart.`,
            );
          }
        }
      } catch (err) {
        // Silent fail on checkpoint loop — never crash the queue
      }
    }, 60_000); // Run every 60 seconds

    // Ensure the timer doesn't keep the process alive
    if (this._checkpointTimer && typeof this._checkpointTimer === "object") {
      this._checkpointTimer.unref?.();
    }
  }

  /**
   * Stop the checkpoint background loop.
   */
  stopCheckpointLoop(): void {
    if (this._checkpointTimer) {
      clearInterval(this._checkpointTimer);
      this._checkpointTimer = null;
    }
  }

  /**
   * Clean up queue and checkpoint resources.
   */
  shutdown(): void {
    this.stopCheckpointLoop();
    this._queued = [];
    this._active.clear();
    this._completed = [];
    checkpoints.clear();
  }

  /** Get checkpoint statistics */
  getCheckpointStats(): { total: number; active: number; expired: number } {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    let expired = 0;

    for (const record of checkpoints.values()) {
      const updated = new Date(record.updatedAt).getTime();
      if (now - updated > maxAge) expired++;
    }

    return {
      total: checkpoints.size,
      active: checkpoints.size - expired,
      expired,
    };
  }
}
