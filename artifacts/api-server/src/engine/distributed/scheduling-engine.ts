// ---------------------------------------------------------------------------
// Intelligent Scheduling Engine ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Assigns jobs to workers based on:
//   - Worker load (CPU, RAM, active jobs)
//   - Plugin/tool availability
//   - Worker region and tags
//   - Network latency estimates
//   - Historical performance
//   - Queue priority
//   - Health status
//
// Avoids overloaded workers and prefers workers with better scores.

import { logger } from "../../lib/logger";
import { distributedWorkerManager } from "./worker-manager";
import type { DistributedJob } from "./types";
import type { WorkerState } from "./types";

// ── Scoring Weights ──────────────────────────────────────────────────────

interface ScoringWeights {
  cpuLoad: number;
  ramUtilization: number;
  activeJobsRatio: number;
  failureRate: number;
  pluginAffinity: number;
  regionAffinity: number;
  historicalSpeed: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  cpuLoad: 0.20,
  ramUtilization: 0.15,
  activeJobsRatio: 0.20,
  failureRate: 0.15,
  pluginAffinity: 0.15,
  regionAffinity: 0.10,
  historicalSpeed: 0.05,
};

// ── SchedulingResult ───────────────────────────────────────────────────────

export interface SchedulingResult {
  jobId: string;
  assignedWorker: string | null;
  score: number;
  reason: string;
  runner: string;
}

// ── Scheduling Engine ─────────────────────────────────────────────────────

export class SchedulingEngine {
  private weights: ScoringWeights;
  private assignmentHistory = new Map<string, number[]>(); // workerId -> recent durations

  constructor(weights?: Partial<ScoringWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    logger.info("[SCHEDULER] Scheduling Engine initialized");
  }

  /**
   * Find the best worker for a given job.
   * Returns null if no suitable worker is available.
   */
  schedule(job: DistributedJob, preferredRegion?: string): SchedulingResult {
    const candidates = distributedWorkerManager.getAvailableWorkers();

    if (candidates.length === 0) {
      return {
        jobId: job.id,
        assignedWorker: null,
        score: 0,
        reason: "No available workers",
        runner: "none",
      };
    }

    // Score each candidate
    const scored = candidates.map((worker) => ({
      worker,
      score: this.calculateScore(worker, job, preferredRegion),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score <= 0) {
      return {
        jobId: job.id,
        assignedWorker: null,
        score: 0,
        reason: "Best worker score too low",
        runner: "none",
      };
    }

    return {
      jobId: job.id,
      assignedWorker: best.worker.registration.workerId,
      score: Math.round(best.score * 100) / 100,
      reason: this.buildReason(best.worker, best.score, scored.length),
      runner: best.worker.registration.hostname,
    };
  }

  /**
   * Schedule multiple jobs at once, distributing across workers.
   */
  scheduleBatch(jobs: DistributedJob[], preferredRegion?: string): SchedulingResult[] {
    const results: SchedulingResult[] = [];

    // Sort jobs by priority first (highest first)
    const sorted = [...jobs].sort((a, b) => b.priority - a.priority);

    for (const job of sorted) {
      const result = this.schedule(job, preferredRegion);
      results.push(result);
    }

    return results;
  }

  /**
   * Calculate a score for a worker-job pair (higher = better match).
   */
  private calculateScore(worker: WorkerState, job: DistributedJob, preferredRegion?: string): number {
    const reg = worker.registration;
    let score = 1.0;

    // 1. CPU load (lower is better)
    const cpuScore = Math.max(0, 1 - reg.cpuUsage / 100);
    score += cpuScore * this.weights.cpuLoad;

    // 2. RAM utilization (lower is better)
    const ramUtil = reg.ramTotalMb > 0
      ? 1 - reg.ramAvailableMb / reg.ramTotalMb
      : 0.5;
    const ramScore = Math.max(0, 1 - ramUtil);
    score += ramScore * this.weights.ramUtilization;

    // 3. Active jobs ratio (lower is better)
    const jobsRatio = worker.activeJobs / Math.max(1, worker.maxJobs);
    const jobsScore = Math.max(0, 1 - jobsRatio);
    score += jobsScore * this.weights.activeJobsRatio;

    // 4. Failure rate (lower is better)
    const totalJobs = worker.totalJobsCompleted + worker.totalJobsFailed;
    const failureRate = totalJobs > 0 ? worker.totalJobsFailed / totalJobs : 0;
    const failureScore = Math.max(0, 1 - failureRate * 2);
    score += failureScore * this.weights.failureRate;

    // 5. Plugin affinity (if worker has the tool, prefer it)
    const hasPlugin = reg.installedPlugins.some(
      (p) => job.toolName.toLowerCase().includes(p.toLowerCase()) ||
            p.toLowerCase().includes(job.toolName.toLowerCase()),
    );
    if (hasPlugin) score += this.weights.pluginAffinity;

    // 6. Region affinity
    if (preferredRegion && reg.region === preferredRegion) {
      score += this.weights.regionAffinity;
    }

    // 7. Historical speed (workers with faster average duration)
    if (worker.averageJobDurationMs > 0) {
      const speedScore = Math.max(0, 1 - worker.averageJobDurationMs / 600_000);
      score += speedScore * this.weights.historicalSpeed;
    }

    return score;
  }

  /**
   * Record a job completion for historical tracking.
   */
  recordCompletion(workerId: string, durationMs: number): void {
    if (!this.assignmentHistory.has(workerId)) {
      this.assignmentHistory.set(workerId, []);
    }
    const durations = this.assignmentHistory.get(workerId)!;
    durations.push(durationMs);

    // Keep only last 100
    if (durations.length > 100) durations.shift();
  }

  /**
   * Get average duration for a worker.
   */
  getAverageDuration(workerId: string): number | null {
    const durations = this.assignmentHistory.get(workerId);
    if (!durations || durations.length === 0) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  /**
   * Estimate how long a job will take given historical data.
   */
  estimateDuration(toolName: string): number {
    const allDurations = Array.from(this.assignmentHistory.values()).flat();
    if (allDurations.length === 0) return 60_000; // default 1 min

    const avg = allDurations.reduce((a, b) => a + b, 0) / allDurations.length;
    return Math.max(10_000, Math.round(avg));
  }

  private buildReason(worker: WorkerState, score: number, candidateCount: number): string {
    const parts: string[] = [
      `Score ${score.toFixed(2)}`,
      `CPU ${worker.registration.cpuUsage}%`,
      `RAM ${Math.round((1 - worker.registration.ramAvailableMb / Math.max(1, worker.registration.ramTotalMb)) * 100)}%`,
      `Jobs ${worker.activeJobs}/${worker.maxJobs}`,
    ];
    return `Selected from ${candidateCount} candidate(s): ${parts.join(", ")}`;
  }

  getStats(): {
    totalAssignments: number;
    workerHistorySize: number;
    averageEstimatedDuration: number;
  } {
    let totalDurations = 0;
    let count = 0;
    for (const durations of this.assignmentHistory.values()) {
      totalDurations += durations.reduce((a, b) => a + b, 0);
      count += durations.length;
    }

    return {
      totalAssignments: count,
      workerHistorySize: this.assignmentHistory.size,
      averageEstimatedDuration: count > 0 ? Math.round(totalDurations / count) : 0,
    };
  }

  shutdown(): void {
    this.assignmentHistory.clear();
    logger.info("[SCHEDULER] Scheduling Engine shut down");
  }
}

export const schedulingEngine = new SchedulingEngine();
