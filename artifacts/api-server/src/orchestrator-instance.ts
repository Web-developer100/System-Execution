// ── Orchestrator Singleton ──────────────────────────────────────────────────
//
// Extracted to its own module to break the circular dependency between app.ts
// (which imports routes) and routes/scans.ts (which uses the orchestrator).
//
// Both app.ts and routes/scans.ts import orchestrator from here.

import { ScanOrchestrator } from "./engine";
import { notificationDispatcher } from "./services/notification-dispatcher";
import { logger } from "./lib/logger";

export const orchestrator = new ScanOrchestrator(
  Number(process.env.SCAN_CONCURRENCY) || 3,
);

// ── Wire Notification Dispatcher to Orchestrator Events ────────────────────
//
// Whenever a scan completes, fails, or is stopped, the notification dispatcher
// sends alerts to all configured channels (Slack, Discord, Email).

orchestrator.queue.on((event) => {
  if (event.type !== "completed" && event.type !== "failed" && event.type !== "stopped") return;
  if (!notificationDispatcher.isConfigured) return;

  const scanId = event.scanId;
  const job = orchestrator.queue.getJob(scanId);
  if (!job) return;

  // Build and dispatch notification asynchronously (non-blocking)
  const payload = notificationDispatcher.buildScanNotification({
    scanId,
    target: job.target,
    status: event.type,
    findingCount: 0, // Updated after AI analysis in executeJob
    criticalCount: 0,
    highCount: 0,
    durationMs: job.startedAt
      ? new Date().getTime() - new Date(job.startedAt).getTime()
      : 0,
    dashboardUrl: `${process.env.DASHBOARD_URL ?? "http://localhost:5173"}/scans`,
  });

  notificationDispatcher.dispatchAll(payload).then((results) => {
    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;
    if (failures > 0) {
      logger.warn(
        { scanId, successes, failures },
        "[NOTIFY] Some notification channels failed",
      );
    }
  }).catch((err) => {
    logger.error({ err, scanId }, "[NOTIFY] Notification dispatch crashed");
  });
});

logger.info("[BOOT] Notification dispatcher wired to orchestrator events");
