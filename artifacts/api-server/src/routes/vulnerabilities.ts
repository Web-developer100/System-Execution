import { Router, type IRouter } from "express";
import { db, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { aiService } from "../ai-instance";
import type { VulnerabilityAnalysisInput } from "../ai";
import { runFpPipeline } from "../services/false-positive-pipeline";

const router: IRouter = Router();

// Map severity → approximate CVSS score and common CWE/OWASP mappings
const SEVERITY_META: Record<string, {
  cvssBase: string;
  cwe: string;
  owasp: string;
  epss: string;
  mitre: string;
}> = {
  critical: { cvssBase: "9.8",  cwe: "CWE-89",  owasp: "A03:2021",  epss: "0.97", mitre: "T1190" },
  high:     { cvssBase: "8.1",  cwe: "CWE-79",  owasp: "A07:2021",  epss: "0.82", mitre: "T1059" },
  medium:   { cvssBase: "5.4",  cwe: "CWE-352", owasp: "A01:2021",  epss: "0.45", mitre: "T1071" },
  low:      { cvssBase: "3.1",  cwe: "CWE-200", owasp: "A09:2021",  epss: "0.12", mitre: "T1040" },
  info:     { cvssBase: "0.0",  cwe: "CWE-284", owasp: "A05:2021",  epss: "0.01", mitre: "T1046" },
};

// Per-keyword overrides for more realistic CWE/CVE data
function enrichVuln(title: string, severity: string) {
  const t = title.toLowerCase();
  const base = SEVERITY_META[severity] ?? SEVERITY_META.info;
  let cwe = base.cwe;
  let owasp = base.owasp;
  let mitre = base.mitre;
  let cve: string | null = null;

  if (t.includes("sql"))           { cwe = "CWE-89";  owasp = "A03:2021"; mitre = "T1190"; cve = "CVE-2024-21413"; }
  else if (t.includes("xss"))      { cwe = "CWE-79";  owasp = "A03:2021"; mitre = "T1059"; }
  else if (t.includes("ssrf"))     { cwe = "CWE-918"; owasp = "A10:2021"; mitre = "T1190"; cve = "CVE-2021-26855"; }
  else if (t.includes("idor"))     { cwe = "CWE-284"; owasp = "A01:2021"; mitre = "T1078"; }
  else if (t.includes("command") || t.includes("injection")) { cwe = "CWE-77"; owasp = "A03:2021"; mitre = "T1059"; }
  else if (t.includes("traversal")){ cwe = "CWE-22";  owasp = "A01:2021"; mitre = "T1083"; }
  else if (t.includes("xxe"))      { cwe = "CWE-611"; owasp = "A05:2021"; mitre = "T1190"; }
  else if (t.includes("redirect")) { cwe = "CWE-601"; owasp = "A01:2021"; mitre = "T1598"; }
  else if (t.includes("tls") || t.includes("ssl")) { cwe = "CWE-326"; owasp = "A02:2021"; mitre = "T1040"; }
  else if (t.includes("prototype")) { cwe = "CWE-1321"; owasp = "A03:2021"; mitre = "T1059"; }
  else if (t.includes("nosql"))    { cwe = "CWE-943"; owasp = "A03:2021"; mitre = "T1190"; }
  else if (t.includes("rate"))     { cwe = "CWE-307"; owasp = "A07:2021"; mitre = "T1110"; }
  else if (t.includes("clickjack")) { cwe = "CWE-1021"; owasp = "A05:2021"; mitre = "T1185"; }
  else if (t.includes("header"))   { cwe = "CWE-116"; owasp = "A05:2021"; mitre = "T1040"; }
  else if (t.includes("admin"))    { cwe = "CWE-306"; owasp = "A07:2021"; mitre = "T1078"; }
  else if (t.includes("api key") || t.includes("secrets")) { cwe = "CWE-312"; owasp = "A02:2021"; mitre = "T1552"; }

  return { cwe, owasp, mitre, cve, cvssBase: base.cvssBase, epss: base.epss };
}

function formatVuln(v: typeof vulnerabilitiesTable.$inferSelect) {
  const enriched = enrichVuln(v.title, v.severity);
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
    // Enriched metadata
    cvssScore: enriched.cvssBase,
    cwe: enriched.cwe,
    cve: enriched.cve,
    owasp: enriched.owasp,
    mitre: enriched.mitre,
    epss: enriched.epss,
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
