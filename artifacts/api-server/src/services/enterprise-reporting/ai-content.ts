// ---------------------------------------------------------------------------
// AI Report Content Generator ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Generates executive summaries, risk narratives, business impact analyses,
// compliance gap analyses, and security posture assessments using the AiService.
// These are used by the Enterprise Report Engine to enrich report templates.

import { aiService } from "../../ai-instance";
import type { ReportData } from "../report-generator";
import type { AiReportContent } from "./types";
import { logger } from "../../lib/logger";

// ── Cache ──────────────────────────────────────────────────────────────────

const contentCache = new Map<string, { content: AiReportContent; generatedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(scanId: number, category: string): string {
  return `${scanId}:${category}`;
}

// ── AI Content Generator ───────────────────────────────────────────────────

export async function generateAiReportContent(
  data: ReportData,
  category: string,
): Promise<AiReportContent> {
  const key = cacheKey(data.scanId, category);
  const cached = contentCache.get(key);
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  // Build the analysis input from the report data
  const criticalCount = data.severities.critical ?? 0;
  const highCount = data.severities.high ?? 0;
  const mediumCount = data.severities.medium ?? 0;
  const total = data.totalFindings;
  const riskScore = calculateRiskScore(data);

  let content: AiReportContent;

  try {
    // Try to use the AiService for LLM-generated content
    const severitySummary = Object.entries(data.severities)
      .filter(([_, c]) => c > 0)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(", ") || "none";

    // Generate executive summary via AI
    const aiInput = {
      title: `Report Content Generation for Scan #${data.scanId}`,
      severity: criticalCount > 0 ? "critical" : highCount > 0 ? "high" : mediumCount > 0 ? "medium" : "low",
      description: `Scan of ${data.target} with ${total} findings (${severitySummary}). Risk score: ${riskScore}/100.`,
      evidence: null,
      url: data.target,
      toolName: "report-engine",
      templateId: null,
      cveIds: [],
      cweIds: [],
      scanTarget: data.target,
    };

    const result = await aiService.analyze(aiInput);

    content = {
      executiveSummary: result.analysis.slice(0, 800),
      riskNarrative: generateRiskNarrative(data, riskScore),
      businessImpact: generateBusinessImpact(data, riskScore),
      remediationSummary: generateRemediationSummary(data),
      developerExplanation: generateDeveloperExplanation(data),
      attackChainDescription: generateAttackChainDescription(data),
      prioritizationRecommendations: generatePrioritizationRecommendations(data),
      complianceGapAnalysis: generateComplianceGapAnalysis(data),
      nextActions: generateNextActions(data, riskScore),
      securityPostureAssessment: generateSecurityPostureAssessment(data, riskScore),
    };

    // Override the executive summary with the AI-generated one if good quality
    if (result.analysis.length > 50) {
      content.executiveSummary = result.analysis;
    }
  } catch (err) {
    logger.warn({ err, scanId: data.scanId }, "[AI-REPORT] Failed to generate AI content, using heuristic fallback");
    // Fallback to heuristic-generated content
    content = {
      executiveSummary: generateHeuristicExecutiveSummary(data, riskScore),
      riskNarrative: generateRiskNarrative(data, riskScore),
      businessImpact: generateBusinessImpact(data, riskScore),
      remediationSummary: generateRemediationSummary(data),
      developerExplanation: generateDeveloperExplanation(data),
      attackChainDescription: generateAttackChainDescription(data),
      prioritizationRecommendations: generatePrioritizationRecommendations(data),
      complianceGapAnalysis: generateComplianceGapAnalysis(data),
      nextActions: generateNextActions(data, riskScore),
      securityPostureAssessment: generateSecurityPostureAssessment(data, riskScore),
    };
  }

  // Cache the result
  contentCache.set(key, { content, generatedAt: Date.now() });

  // Limit cache size
  if (contentCache.size > 500) {
    const oldest = contentCache.entries().next();
    if (oldest.value) contentCache.delete(oldest.value[0]);
  }

  return content;
}

// ── Heuristic Executive Summary ────────────────────────────────────────────

function generateHeuristicExecutiveSummary(data: ReportData, riskScore: number): string {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;
  const total = data.totalFindings;

  if (total === 0) {
    return `Scan #${data.scanId} against ${data.target} completed with no findings. The target shows no identifiable security vulnerabilities within the scope of tools used.`;
  }

  const riskLabel = cr > 0 ? "CRITICAL" : hi > 0 ? "HIGH" : me > 5 ? "MEDIUM" : "LOW";
  const confirmed = data.statuses.confirmed ?? 0;
  const aiValidated = data.findings.filter(f => f.aiValidated).length;

  return `Scan #${data.scanId} against ${data.target} completed with ${total} finding(s). ` +
    `Overall risk level: ${riskLabel} (${riskScore}/100). ` +
    `${cr} critical, ${hi} high, ${me} medium severity vulnerabilities identified. ` +
    `${aiValidated}/${total} findings AI-validated, ${confirmed} confirmed. ` +
    `Immediate remediation is ${cr > 0 ? "required" : hi > 0 ? "recommended" : "advised"} ` +
    `for the highest-severity findings to reduce attack surface exposure.`;
}

// ── Risk Narrative ─────────────────────────────────────────────────────────

function generateRiskNarrative(data: ReportData, riskScore: number): string {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;

  if (cr === 0 && hi === 0) {
    return "The overall security posture of the target is stable with no critical or high-risk findings. Continued monitoring and periodic reassessment are recommended to maintain this security level.";
  }

  const narrative: string[] = [];
  if (cr > 0) {
    narrative.push(`${cr} critical vulnerability(ies) were identified that could allow an attacker to gain unauthorized access, execute arbitrary code, or extract sensitive data without authentication. These findings represent the highest priority for remediation.`);
  }
  if (hi > 0) {
    narrative.push(`${hi} high-severity finding(s) were identified that could potentially be exploited to compromise the confidentiality, integrity, or availability of the target system.`);
  }
  narrative.push("The combination of these findings, particularly if chained together, could significantly increase the overall risk exposure and likelihood of successful compromise.");
  return narrative.join(" ");
}

// ── Business Impact ────────────────────────────────────────────────────────

function generateBusinessImpact(data: ReportData, riskScore: number): string {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;

  const impacts: string[] = [];

  if (cr > 0) {
    impacts.push("Critical vulnerabilities pose direct risk to business operations and could lead to data breaches, regulatory fines ($1M+ for GDPR/SOX violations), reputational damage, and loss of customer trust.");
  }
  if (hi > 0) {
    impacts.push("High-severity findings could result in unauthorized data access, account compromise, and service disruption, impacting SLA commitments and customer contracts.");
  }
  if (me > 5) {
    impacts.push("The volume of medium-severity findings suggests systemic security weaknesses that increase long-term maintenance costs and security debt.");
  }
  if (data.findings.some(f => f.severity === "critical" || f.severity === "high")) {
    impacts.push("Regulatory compliance exposure: PCI DSS, SOC 2, ISO 27001, and GDPR requirements mandate timely remediation of identified vulnerabilities.");
  }

  return impacts.join(" ") || "The current findings have minimal direct business impact but should be addressed as part of standard security hygiene.";
}

// ── Remediation Summary ────────────────────────────────────────────────────

function generateRemediationSummary(data: ReportData): string {
  const fixable = data.findings.filter(f => f.fix);
  const withAi = data.findings.filter(f => f.aiValidated);

  if (fixable.length === 0) {
    return "No automated remediation patches were generated. Manual review and remediation by the security team is required.";
  }

  return `${fixable.length} of ${data.totalFindings} findings have AI-generated remediation patches. ` +
    `${withAi.length} findings include AI-validated analysis. ` +
    `Priority should be given to ${data.severities.critical ?? 0} critical and ${data.severities.high ?? 0} high-severity findings. ` +
    `Apply patches in order of severity, starting with externally-facing systems and critical assets.`;
}

// ── Developer Explanation ──────────────────────────────────────────────────

function generateDeveloperExplanation(data: ReportData): string {
  const withFixes = data.findings.filter(f => f.fix);
  const topFindings = withFixes.slice(0, 5);

  if (topFindings.length === 0) {
    return "No specific developer remediation guidance was generated for this scan. Review the detailed findings for manual remediation steps.";
  }

  const lines = topFindings.map(f =>
    `- **${f.title}** (${f.severity.toUpperCase()}): ${(f.fix ?? "").split("\n")[0] ?? "Review the finding for guidance."}`
  );

  return `The following remediation patches have been generated:\n\n${lines.join("\n")}\n\nApply patches in a staging environment first, then verify with a follow-up scan before deploying to production.`;
}

// ── Attack Chain Description ───────────────────────────────────────────────

function generateAttackChainDescription(data: ReportData): string {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;

  if (cr === 0 && hi === 0) {
    return "No attack chains were identified. All findings are independent, low-severity issues that do not form chained exploit paths.";
  }

  const criticalFindings = data.findings.filter(f => f.severity === "critical");
  const highFindings = data.findings.filter(f => f.severity === "high");

  let desc = `Potentially dangerous attack chains identified involving ${criticalFindings.length} critical and ${highFindings.length} high-severity findings. `;
  if (criticalFindings.length > 0) {
    const sampleTitle = criticalFindings[0]?.title ?? "critical finding";
    desc += `Example: An attacker could exploit "${sampleTitle}" to gain initial access, then chain with other findings to escalate privileges or move laterally. `;
  }
  desc += "Each chain should be evaluated independently, as successful exploitation of chained vulnerabilities can lead to significantly greater impact than individual findings.";
  return desc;
}

// ── Prioritization Recommendations ─────────────────────────────────────────

function generatePrioritizationRecommendations(data: ReportData): string[] {
  const recs: string[] = [];
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;

  if (cr > 0) {
    recs.push(`Immediately remediate all ${cr} critical findings — prioritize externally-facing endpoints and authentication mechanisms.`);
  }
  if (hi > 0) {
    recs.push(`Address ${hi} high-severity findings within 7 days — focus on data validation, access controls, and secure configuration.`);
  }
  recs.push(`Conduct a manual security review of all findings with "inconclusive" status to eliminate false positives.`);
  recs.push(`Schedule a follow-up scan after remediation to verify fix effectiveness.`);
  recs.push(`Update security policies and incident response playbooks based on identified vulnerability patterns.`);

  return recs;
}

// ── Compliance Gap Analysis ───────────────────────────────────────────────

function generateComplianceGapAnalysis(data: ReportData): string {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;

  if (cr === 0 && hi === 0) {
    return "No critical or high-severity compliance gaps identified. Standard security controls appear to be functioning adequately.";
  }

  return `${cr + hi} findings with severity critical or high represent potential compliance violations. ` +
    `PCI DSS Requirement 6 (develop and maintain secure systems) and ISO 27001 A.12.6 (technical vulnerability management) mandate timely remediation. ` +
    `SOC 2 CC7.1 (detection and response) requires monitoring and alerting for security events related to these vulnerabilities.`;
}

// ── Next Actions ───────────────────────────────────────────────────────────

function generateNextActions(data: ReportData, riskScore: number): string[] {
  const actions: string[] = [];
  const cr = data.severities.critical ?? 0;

  if (cr > 0) {
    actions.push("Remediate all critical findings immediately (within 24 hours).");
    actions.push("Perform emergency patch deployment for affected systems.");
  }

  actions.push("Review and triage all findings through the vulnerability management workflow.");
  actions.push("Assign findings to responsible development teams with severity-based SLA targets.");

  if (data.statuses.inconclusive != null && data.statuses.inconclusive > 0) {
    actions.push("Manually verify all inconclusive findings — false positives should be dismissed, confirmed findings should be re-classified.");
  }

  actions.push("Generate compliance evidence package for auditors if PCI DSS, SOC 2, or ISO 27001 scope is affected.");
  actions.push("Schedule follow-up scan within 30 days to measure remediation progress.");

  return actions;
}

// ── Security Posture Assessment ────────────────────────────────────────────

function generateSecurityPostureAssessment(data: ReportData, riskScore: number): string {
  if (data.totalFindings === 0) {
    return "EXCELLENT — No vulnerabilities detected. The target demonstrates strong security posture with effective controls.";
  }

  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;

  if (cr > 0) {
    return `CRITICAL — ${cr} critical vulnerabilities indicate fundamental security weaknesses. Immediate executive attention and resource allocation required. Overall security posture score: ${riskScore}/100.`;
  }
  if (hi > 3) {
    return `POOR — ${hi} high-severity findings suggest significant security gaps. Dedicated remediation sprints and enhanced security controls recommended. Posture score: ${riskScore}/100.`;
  }
  if (hi > 0 || me > 5) {
    return `FAIR — ${hi} high and ${me} medium findings indicate moderate security weaknesses. Standard remediation processes should be followed. Posture score: ${riskScore}/100.`;
  }
  return `GOOD — ${data.totalFindings} low-severity findings detected. The target maintains a reasonable security posture. Posture score: ${riskScore}/100.`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateRiskScore(data: ReportData): number {
  const cr = data.severities.critical ?? 0;
  const hi = data.severities.high ?? 0;
  const me = data.severities.medium ?? 0;
  const lo = data.severities.low ?? 0;
  const total = data.totalFindings;

  if (total === 0) return 100;

  const weightedScore = Math.max(0, 100 - (cr * 15 + hi * 8 + me * 4 + lo * 1));
  return Math.min(100, weightedScore);
}

// ── Clear Cache ────────────────────────────────────────────────────────────

export function clearAiContentCache(): void {
  contentCache.clear();
}
