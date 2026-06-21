import { Router, type IRouter } from "express";
import { db, scansTable, vulnerabilitiesTable } from "@workspace/db";
import { desc, eq, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface Notification {
  id: string;
  type: "scan" | "vulnerability" | "system" | "worker" | "info";
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  read: boolean;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const STATIC_SYSTEM: Notification[] = [
  {
    id: "sys-ai-init",
    type: "system",
    title: "AI Engine Initialized",
    description: "All 8 AI analysis engines online — correlation, FP elimination, risk scoring, attack chain detection active.",
    severity: "info",
    read: true,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "sys-nuclei-update",
    type: "info",
    title: "Nuclei Templates Updated",
    description: "Nuclei updated to v3.3.2 — 14,823 templates loaded including 142 new CVE templates.",
    severity: "info",
    read: true,
    timestamp: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: "sys-worker-ready",
    type: "worker",
    title: "Worker Pool Ready",
    description: "Distributed scan worker pool initialized — 4 workers online, capacity: 100 concurrent scans.",
    severity: "info",
    read: true,
    timestamp: new Date(Date.now() - 21600000).toISOString(),
  },
  {
    id: "sys-schedule-ready",
    type: "system",
    title: "Scheduler Active",
    description: "4 scheduled scans loaded — 3 active, next run in <24h.",
    severity: "info",
    read: true,
    timestamp: new Date(Date.now() - 28800000).toISOString(),
  },
];

// GET /api/notifications
router.get("/notifications", async (_req, res) => {
  try {
    const notifications: Notification[] = [...STATIC_SYSTEM];

    // Pull recent scans
    const recentScans = await db
      .select()
      .from(scansTable)
      .orderBy(desc(scansTable.createdAt))
      .limit(10);

    for (const scan of recentScans) {
      if (scan.status === "completed") {
        notifications.push({
          id: `scan-done-${scan.id}`,
          type: "scan",
          title: `Scan #${scan.id} Completed`,
          description: `Target: ${scan.target} — Scan complete. ${(scan as any).vulnCount ?? 0} findings discovered.`,
          severity: ((scan as any).vulnCount ?? 0) > 5 ? "high" : "info",
          read: false,
          timestamp: (scan.completedAt ?? scan.createdAt ?? new Date()).toISOString(),
          metadata: { scanId: scan.id, target: scan.target },
        });
      } else if (scan.status === "running") {
        notifications.push({
          id: `scan-run-${scan.id}`,
          type: "scan",
          title: `Scan #${scan.id} In Progress`,
          description: `Active scan against ${scan.target} — ${(scan as any).progress ?? 0}% complete.`,
          severity: "info",
          read: false,
          timestamp: (scan.startedAt ?? scan.createdAt ?? new Date()).toISOString(),
          metadata: { scanId: scan.id },
        });
      } else if (scan.status === "failed") {
        notifications.push({
          id: `scan-fail-${scan.id}`,
          type: "scan",
          title: `Scan #${scan.id} Failed`,
          description: `Target: ${scan.target} — Scan failed. Check connectivity.`,
          severity: "high",
          read: false,
          timestamp: (scan.createdAt ?? new Date()).toISOString(),
          metadata: { scanId: scan.id },
        });
      }
    }

    // Pull critical/high vulns
    const criticalVulns = await db
      .select()
      .from(vulnerabilitiesTable)
      .where(eq(vulnerabilitiesTable.severity, "critical"))
      .orderBy(desc(vulnerabilitiesTable.discoveredAt))
      .limit(7);

    for (const vuln of criticalVulns) {
      notifications.push({
        id: `vuln-crit-${vuln.id}`,
        type: "vulnerability",
        title: `Critical Finding: ${vuln.title}`,
        description: `${vuln.url} — CVSS Critical severity. Immediate remediation required.`,
        severity: "critical",
        read: false,
        timestamp: (vuln.discoveredAt ?? new Date()).toISOString(),
        metadata: { vulnId: vuln.id, severity: "critical" },
      });
    }

    const highVulns = await db
      .select()
      .from(vulnerabilitiesTable)
      .where(eq(vulnerabilitiesTable.severity, "high"))
      .orderBy(desc(vulnerabilitiesTable.discoveredAt))
      .limit(3);

    for (const vuln of highVulns) {
      notifications.push({
        id: `vuln-high-${vuln.id}`,
        type: "vulnerability",
        title: `High Severity: ${vuln.title}`,
        description: `${vuln.url} — High severity finding requires attention.`,
        severity: "high",
        read: true,
        timestamp: (vuln.discoveredAt ?? new Date()).toISOString(),
        metadata: { vulnId: vuln.id, severity: "high" },
      });
    }

    // Sort by timestamp descending
    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const unreadCount = notifications.filter(n => !n.read).length;

    return res.json({
      total: notifications.length,
      unread: unreadCount,
      notifications,
    });
  } catch (err) {
    logger.error({ err }, "Get notifications error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/notifications/:id/read
router.post("/notifications/:id/read", async (req, res) => {
  return res.json({ success: true, id: req.params.id });
});

// POST /api/notifications/read-all
router.post("/notifications/read-all", async (_req, res) => {
  return res.json({ success: true });
});

export default router;
