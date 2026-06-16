import { Router, type IRouter } from "express";
import { db, scansTable, scanLogsTable, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatScan(scan: typeof scansTable.$inferSelect, vulnCount = 0) {
  return {
    id: scan.id,
    target: scan.target,
    status: scan.status,
    tools: JSON.parse(scan.tools || "[]") as string[],
    progress: scan.progress ?? 0,
    vulnCount,
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
    createdAt: scan.createdAt.toISOString(),
  };
}

// Simulate a realistic scan progression with log entries and vuln discoveries
function simulateScanProgress(scanId: number, target: string, tools: string[]) {
  type StepLevel = "info" | "success" | "warn" | "error";

  const steps: Array<{ delay: number; progress: number; message: string; level: StepLevel }> = [
    { delay: 1000,  progress: 5,   level: "info",    message: `KERNEL: Scan #{id} started — target: ${target}` },
    { delay: 3000,  progress: 12,  level: "info",    message: `SUBFINDER: Enumerating subdomains for ${target}` },
    { delay: 6000,  progress: 22,  level: "success", message: `SUBFINDER: 14 subdomains discovered` },
    { delay: 9000,  progress: 30,  level: "info",    message: `NAABU: Port scanning discovered hosts (top-1000)` },
    { delay: 13000, progress: 40,  level: "info",    message: `${tools[0]?.toUpperCase() || "NUCLEI"}: Launching CVE templates` },
    { delay: 17000, progress: 52,  level: "warn",    message: `POTENTIAL_HIT: Possible misconfiguration at ${target}/admin` },
    { delay: 21000, progress: 62,  level: "info",    message: `FFUF: Directory fuzzing — 2847 paths tested` },
    { delay: 25000, progress: 72,  level: "success", message: `FFUF: Exposed endpoint found — /api/v1/debug` },
    { delay: 29000, progress: 80,  level: "info",    message: `AI_LAYER: Validating findings, filtering false positives` },
    { delay: 33000, progress: 88,  level: "info",    message: `SEMGREP: Static analysis — 0 issues in source` },
    { delay: 37000, progress: 94,  level: "warn",    message: `TRIVY: 2 CVEs detected in dependencies` },
    { delay: 41000, progress: 100, level: "success", message: `SCAN_COMPLETE: Full analysis finished — see report` },
  ];

  for (const step of steps) {
    setTimeout(async () => {
      try {
        const isLast = step.progress === 100;
        await db.update(scansTable).set({
          progress: step.progress,
          status: isLast ? "completed" : "running",
          ...(isLast ? { completedAt: new Date() } : {}),
        }).where(eq(scansTable.id, scanId));

        await db.insert(scanLogsTable).values({
          scanId,
          message: step.message.replace("#{id}", String(scanId)),
          level: step.level,
        });

        // Discover sample vulnerabilities at ~50% progress
        if (step.progress === 52) {
          const severities = ["medium", "high", "low"] as const;
          const vulnTemplates = [
            { title: "Exposed Admin Panel", severity: "high", description: "Admin panel accessible without authentication.", evidence: `HTTP 200 GET ${target}/admin\nSet-Cookie: session=...` },
            { title: "Outdated TLS Version", severity: "medium", description: "Server supports TLS 1.0 which is deprecated.", evidence: `TLS Version: 1.0\nCipher: RC4-SHA` },
            { title: "Missing Security Headers", severity: "low", description: "Response lacks X-Frame-Options and CSP headers.", evidence: `HTTP/1.1 200 OK\nServer: Apache/2.4\n(no security headers)` },
          ];
          for (const t of vulnTemplates) {
            await db.insert(vulnerabilitiesTable).values({
              scanId,
              title: t.title,
              severity: t.severity,
              url: `${target}${t.severity === "high" ? "/admin" : t.severity === "medium" ? "/api" : "/"}`,
              status: "pending",
              description: t.description,
              evidence: t.evidence,
              fix: "Update server configuration and apply security hardening.",
              aiValidated: Math.random() > 0.4,
            });
          }
        }
      } catch (err) {
        logger.error({ err, scanId }, "Scan simulation step error");
      }
    }, step.delay);
  }
}

// GET /api/scans
router.get("/scans", async (_req, res) => {
  try {
    const scans = await db.select().from(scansTable).orderBy(desc(scansTable.createdAt));
    const vulnRows = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable);
    const countMap: Record<number, number> = {};
    for (const v of vulnRows) countMap[v.scanId] = (countMap[v.scanId] ?? 0) + 1;
    return res.json(scans.map(s => formatScan(s, countMap[s.id] ?? 0)));
  } catch (err) {
    logger.error({ err }, "Get scans error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans
router.post("/scans", async (req, res) => {
  const { target, tools, useProxy } = req.body as { target: string; tools: string[]; useProxy?: boolean };
  if (!target?.trim() || !tools?.length) {
    return res.status(400).json({ error: "Target and tools are required" });
  }
  try {
    const [scan] = await db.insert(scansTable).values({
      target: target.trim(),
      tools: JSON.stringify(tools),
      status: "queued",
      useProxy: useProxy ?? false,
      progress: 0,
    }).returning();

    simulateScanProgress(scan.id, target.trim(), tools);

    return res.status(201).json(formatScan(scan, 0));
  } catch (err) {
    logger.error({ err }, "Create scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id
router.get("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, id));
    if (!scan) return res.status(404).json({ error: "Not found" });
    const vulnRows = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.scanId, id));
    return res.json(formatScan(scan, vulnRows.length));
  } catch (err) {
    logger.error({ err }, "Get scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/scans/:id
router.delete("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(scansTable).where(eq(scansTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans/:id/stop
router.post("/scans/:id/stop", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.update(scansTable)
      .set({ status: "stopped", completedAt: new Date() })
      .where(eq(scansTable.id, id))
      .returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    await db.insert(scanLogsTable).values({
      scanId: id,
      message: "SIGKILL_RECV: Process forcefully terminated by operator",
      level: "warn",
    });
    return res.json(formatScan(scan));
  } catch (err) {
    logger.error({ err }, "Stop scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id/logs
router.get("/scans/:id/logs", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const logs = await db.select().from(scanLogsTable)
      .where(eq(scanLogsTable.scanId, id))
      .orderBy(scanLogsTable.timestamp);
    return res.json(logs.map(l => ({
      id: l.id,
      scanId: l.scanId,
      message: l.message,
      level: l.level,
      timestamp: l.timestamp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Get scan logs error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
