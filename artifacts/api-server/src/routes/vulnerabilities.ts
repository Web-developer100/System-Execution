import { Router, type IRouter } from "express";
import { db, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { aiService } from "../ai-instance";
import type { VulnerabilityAnalysisInput } from "../ai";
import { runFpPipeline } from "../services/false-positive-pipeline";

const router: IRouter = Router();

function formatVuln(v: typeof vulnerabilitiesTable.$inferSelect) {
  return {
    id: v.id,
    scanId: v.scanId,
    title: v.title,
    severity: v.severity,
    url: v.url,
    status: v.status,
    description: v.description ?? null,
    evidence: v.evidence ?? null,
    fix: v.fix ?? null,
    aiValidated: v.aiValidated ?? false,
    discoveredAt: v.discoveredAt.toISOString(),
  };
}



// GET /api/vulnerabilities
router.get("/vulnerabilities", async (_req, res) => {
  try {
    const vulns = await db.select().from(vulnerabilitiesTable).orderBy(desc(vulnerabilitiesTable.discoveredAt));
    return res.json(vulns.map(formatVuln));
  } catch (err) {
    logger.error({ err }, "Get vulns error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vulnerabilities/stats
router.get("/vulnerabilities/stats", async (_req, res) => {
  try {
    const vulns = await db.select().from(vulnerabilitiesTable);
    const stats = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: vulns.length };
    for (const v of vulns) {
      const sev = v.severity as keyof typeof stats;
      if (sev in stats && sev !== "total") stats[sev]++;
    }
    return res.json(stats);
  } catch (err) {
    logger.error({ err }, "Get vuln stats error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vulnerabilities/:id
router.get("/vulnerabilities/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const vulns = await db.select().from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.id, id));
    if (!vulns[0]) return res.status(404).json({ error: "Not found" });
    return res.json(formatVuln(vulns[0]));
  } catch (err) {
    logger.error({ err }, "Get vuln error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/vulnerabilities/:id/validate — AI false-positive validation
router.post("/vulnerabilities/:id/validate", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const vulns = await db.select().from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.id, id));
    const vuln = vulns[0];
    if (!vuln) return res.status(404).json({ error: "Not found" });

    // Build input for AI analysis
    const input: VulnerabilityAnalysisInput = {
      title: vuln.title,
      severity: vuln.severity,
      description: vuln.description,
      evidence: vuln.evidence,
      url: vuln.url,
      toolName: "api",
      templateId: null,
      cveIds: [],
      cweIds: [],
      scanTarget: vuln.url,
    };

    // Run AI analysis (real LLM call or fallback heuristic)
    const result = await aiService.analyze(input);

    // Only mark as confirmed if the AI found sufficient evidence
    const confirmed = result.isTruePositive && result.confidence >= 0.6;

    // Build description: original + AI analysis
    const aiLabel = result.source === "llm"
      ? "[AI ANALYSIS — LLM]"
      : result.source === "cached"
        ? "[AI ANALYSIS — CACHED]"
        : "[AI ANALYSIS — HEURISTIC]";

    const fullDescription = vuln.description
      ? `${vuln.description}\n\n${aiLabel}\n${result.analysis}`
      : `${aiLabel}\n${result.analysis}`;

    // Append confidence and CVSS info to fix field for reference
    const remediationParts: string[] = [result.remediation];
    if (result.cvssScore !== null) {
      remediationParts.unshift(`CVSS v4 Base Score: ${result.cvssScore}/10`);
    }
    remediationParts.unshift(`Confidence: ${Math.round(result.confidence * 100)}% | Provider: ${result.provider}`);

    const [updated] = await db.update(vulnerabilitiesTable).set({
      aiValidated: true,
      status: confirmed ? "confirmed" : "inconclusive",
      description: fullDescription,
      fix: remediationParts.join("\n\n"),
    }).where(eq(vulnerabilitiesTable.id, id)).returning();

    return res.json(formatVuln(updated));
  } catch (err) {
    logger.error({ err }, "AI validate vuln error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/vulnerabilities/batch-validate — Run FP pipeline for a scan
router.post("/vulnerabilities/batch-validate", async (req, res) => {
  const scanId = parseInt(req.body?.scanId as string);
  if (isNaN(scanId)) {
    return res.status(400).json({ error: "Invalid or missing scanId" });
  }

  try {
    logger.info({ scanId }, "[ROUTE] Manual batch validation triggered");

    // Run the pipeline — this is synchronous within the request
    const result = await runFpPipeline(scanId);

    return res.json({
      scanId: result.scanId,
      total: result.total,
      confirmed: result.confirmed,
      inconclusive: result.inconclusive,
      falsePositive: result.falsePositive,
      errors: result.errors,
      durationMs: result.durationMs,
      message: `FP pipeline processed ${result.total} finding(s): `
        + `${result.confirmed} confirmed, ${result.inconclusive} inconclusive, `
        + `${result.falsePositive} false positive(s), ${result.errors} error(s).`,
    });
  } catch (err) {
    logger.error({ err, scanId }, "[ROUTE] Batch validation failed");
    return res.status(500).json({ error: "Batch validation failed" });
  }
});

export default router;
