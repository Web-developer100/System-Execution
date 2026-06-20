// ── JobQueue Unit Tests ──────────────────────────────────────────────────────
//
// Tests the core JobQueue functionality including:
//   - Enqueue / dequeue
//   - Next job claim (concurrency limits)
//   - Complete (success/fail/stop)
//   - Checkpoint save/get/clear/cleanup
//   - Recovery of running jobs after restart

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JobQueue } from "../engine/job-queue";
import type { ScanJob } from "../engine/types";

function makeJob(overrides: Partial<ScanJob> = {}): ScanJob {
  return {
    id: overrides.id ?? 1,
    target: overrides.target ?? "example.com",
    tools: overrides.tools ?? ["nuclei"],
    status: overrides.status ?? "queued",
    progress: overrides.progress ?? 0,
    useProxy: overrides.useProxy ?? false,
    createdAt: overrides.createdAt ?? new Date(),
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
  };
}

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue(3);
  });

  afterEach(() => {
    queue.shutdown();
  });

  // ── Queue Operations ──────────────────────────────────────────────────────

  describe("enqueue / dequeue", () => {
    it("should enqueue a job", () => {
      queue.enqueue(makeJob({ id: 1 }));
      const snap = queue.snapshot();
      expect(snap.queued).toHaveLength(1);
      expect(snap.queued[0].id).toBe(1);
    });

    it("should not enqueue duplicate jobs", () => {
      queue.enqueue(makeJob({ id: 1 }));
      queue.enqueue(makeJob({ id: 1 }));
      expect(queue.snapshot().queued).toHaveLength(1);
    });

    it("should dequeue a queued job", () => {
      queue.enqueue(makeJob({ id: 1 }));
      const removed = queue.dequeue(1);
      expect(removed).toBe(true);
      expect(queue.snapshot().queued).toHaveLength(0);
    });

    it("should return false for non-existent job on dequeue", () => {
      expect(queue.dequeue(999)).toBe(false);
    });
  });

  describe("next() — job claiming", () => {
    it("should claim the next queued job", () => {
      queue.enqueue(makeJob({ id: 1 }));
      const job = queue.claimNext();
      expect(job).toBeDefined();
      expect(job!.id).toBe(1);
      expect(job!.status).toBe("running");
      expect(job!.startedAt).toBeInstanceOf(Date);
    });

    it("should respect max concurrency", () => {
      const q2 = new JobQueue(2);
      q2.enqueue(makeJob({ id: 1 }));
      q2.enqueue(makeJob({ id: 2 }));
      q2.enqueue(makeJob({ id: 3 }));

      expect(q2.claimNext()).toBeDefined(); // 1/2 slots
      expect(q2.claimNext()).toBeDefined(); // 2/2 slots
      expect(q2.claimNext()).toBeUndefined(); // full
      q2.shutdown();
    });

    it("should move claimed job from queued to active", () => {
      queue.enqueue(makeJob({ id: 1 }));
      queue.claimNext();
      const snap = queue.snapshot();
      expect(snap.queued).toHaveLength(0);
      expect(snap.active).toHaveLength(1);
    });
  });

  describe("complete()", () => {
    it("should mark job as completed and move it", () => {
      queue.enqueue(makeJob({ id: 1 }));
      queue.claimNext();
      queue.complete(1, "completed");

      const snap = queue.snapshot();
      expect(snap.active).toHaveLength(0);
      expect(snap.completed).toHaveLength(1);
      expect(snap.completed[0].status).toBe("completed");
      expect(snap.completed[0].progress).toBe(100);
    });

    it("should mark job as failed", () => {
      queue.enqueue(makeJob({ id: 1 }));
      queue.claimNext();
      queue.complete(1, "failed");

      const snap = queue.snapshot();
      expect(snap.completed[0].status).toBe("failed");
    });

    it("should return undefined for unknown scanId", () => {
      const result = queue.complete(999, "completed");
      expect(result).toBeUndefined();
    });
  });

  // ── Checkpoint System ─────────────────────────────────────────────────────

  describe("checkpoints", () => {
    it("should save and retrieve a checkpoint", () => {
      queue.saveCheckpoint(1, {
        scanId: 1,
        target: "example.com",
        tools: ["nuclei"],
        status: "running",
        progress: 50,
        completedStage: null,
        completedTools: ["nuclei"],
        failedTools: [],
        error: null,
        snapshot: JSON.stringify({ findings: [] }),
      });

      const cp = queue.getCheckpoint(1);
      expect(cp).toBeDefined();
      expect(cp!.scanId).toBe(1);
      expect(cp!.progress).toBe(50);
      expect(cp!.createdAt).toBeDefined();
      expect(cp!.updatedAt).toBeDefined();
    });

    it("should clear a checkpoint", () => {
      queue.saveCheckpoint(1, {
        scanId: 1,
        target: "example.com",
        tools: ["nuclei"],
        status: "running",
        progress: 50,
        completedStage: null,
        completedTools: [],
        failedTools: [],
        error: null,
        snapshot: "{}",
      });
      queue.clearCheckpoint(1);
      expect(queue.getCheckpoint(1)).toBeUndefined();
    });

    it("should return all checkpoints", () => {
      queue.saveCheckpoint(1, {
        scanId: 1, target: "a", tools: [], status: "running", progress: 0,
        completedStage: null, completedTools: [], failedTools: [], error: null, snapshot: "{}",
      });
      queue.saveCheckpoint(2, {
        scanId: 2, target: "b", tools: [], status: "running", progress: 0,
        completedStage: null, completedTools: [], failedTools: [], error: null, snapshot: "{}",
      });
      expect(queue.getAllCheckpoints()).toHaveLength(2);
    });

    it("should provide checkpoint stats", () => {
      const stats = queue.getCheckpointStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("active");
      expect(stats).toHaveProperty("expired");
      expect(stats.total).toBe(0);
    });
  });

  // ── Recovery ──────────────────────────────────────────────────────────────

  describe("recoverRunning()", () => {
    it("should re-queue running jobs as queued", () => {
      const runningJob = makeJob({ id: 1, status: "running", startedAt: new Date(), progress: 30 });
      queue.recoverRunning([runningJob]);

      const snap = queue.snapshot();
      expect(snap.queued).toHaveLength(1);
      expect(snap.queued[0].status).toBe("queued");
      expect(snap.queued[0].progress).toBe(0);
      expect(snap.queued[0].startedAt).toBeNull();
    });
  });

  // ── Events ────────────────────────────────────────────────────────────────

  describe("events", () => {
    it("should emit queued event on enqueue", () => {
      const handler = vi.fn();
      queue.on(handler);
      queue.enqueue(makeJob({ id: 1 }));
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "queued", scanId: 1 }),
      );
    });

    it("should emit started event on claim", () => {
      const handler = vi.fn();
      queue.on(handler);
      queue.enqueue(makeJob({ id: 1 }));
      queue.claimNext();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "started", scanId: 1 }),
      );
    });
  });

  // ── Snapshot & getJob ──────────────────────────────────────────────────────

  describe("snapshot & getJob", () => {
    it("should return snapshot of all states", () => {
      queue.enqueue(makeJob({ id: 1 }));
      const snap = queue.snapshot();
      expect(snap).toHaveProperty("queued");
      expect(snap).toHaveProperty("active");
      expect(snap).toHaveProperty("completed");
    });

    it("should find a job by ID in any state", () => {
      queue.enqueue(makeJob({ id: 1 }));
      expect(queue.getJob(1)).toBeDefined();
      expect(queue.getJob(999)).toBeUndefined();
    });
  });

  // ── Log & Progress Publishing ─────────────────────────────────────────────

  describe("publishLog / publishProgress", () => {
    it("should emit log events", () => {
      const handler = vi.fn();
      queue.on(handler);
      queue.enqueue(makeJob({ id: 1 }));
      queue.claimNext();
      queue.publishLog(1, "info", "test log");
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "log",
          scanId: 1,
          data: expect.objectContaining({ level: "info", message: "test log" }),
        }),
      );
    });

    it("should emit progress events", () => {
      const handler = vi.fn();
      queue.on(handler);
      queue.enqueue(makeJob({ id: 1 }));
      queue.claimNext();
      queue.publishProgress(1, 42);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "progress",
          scanId: 1,
          data: expect.objectContaining({ progress: 42 }),
        }),
      );
    });
  });
});
