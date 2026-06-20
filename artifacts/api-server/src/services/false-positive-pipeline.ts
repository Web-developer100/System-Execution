// ---------------------------------------------------------------------------
// False Positive Elimination Pipeline
// ---------------------------------------------------------------------------
//
// Automatically batch-validates all findings from a completed scan using
// the AI service. Assigns status based on confidence thresholds:
//
//   confidence >= 0.6  → "confirmed"
//   confidence >= 0.2  → "inconclusive"
//   confidence <  0.2  → "false_positive" (auto-downgrade)
//
// This pipeline runs automatically when a scan completes.
// It can also be triggered manually via POST /api/vulnerabilities/batch-validate
//
// Core philosophy: never report a vulnerability as confirmed without
// sufficient AI analysis evidence.

import { db, vulnerabilitiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { aiService } from "../ai-instance";
import type { VulnerabilityAnalysisInput } from "../ai";

export interface FpPipelineResult {
  scanId: number;
  total: number;
  confirmed: number;
  inconclusive: number;
  falsePositive: number;
  errors: number;
  durationMs: number;
}

/**
 * Run the false positive elimination pipeline for a given scan.
 * Will process all vulnerabilities with status "pending" or "inconclusive".
 */
export async function runFpPipeline(scanId: number): Promise<FpPipelineResult> {
  const startTime = Date.now();

  const result: FpPipelineResult = {
    scanId,
    total: 0,
    confirmed: 0,
    inconclusive: 0,
    falsePositive: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    // Fetch all unvalidated findings for this scan
    const findings = await db
      .select()
      .from(vulnerabilitiesTable)
      .where(
        and(
          eq(vulnerabilitiesTable.scanId, scanId),
          eq(vulnerabilitiesTable.aiValidated, false),
        ),
      );

    result.total = findings.length;

    if (findings.length === 0) {
      result.durationMs = Date.now() - startTime;
      logger.info({ scanId }, "[FP-PIPELINE] No unvalidated findings to process");
      return result;
    }

    logger.info({ scanId, count: findings.length }, "[FP-PIPELINE] Starting batch validation");

    // Build AI analysis inputs
    const inputs: VulnerabilityAnalysisInput[] = findings.map((f) => ({
      title: f.title,
      severity: f.severity,
      description: f.description,
      evidence: f.evidence,
      url: f.url,
      toolName: "fp-pipeline",
      templateId: null,
      cveIds: [],
      cweIds: [],
      scanTarget: f.url,
    }));

    // Batch analyze all findings
    const analyses = await aiService.analyzeBatch(inputs);

    // Update each finding based on AI analysis
    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      const analysis = analyses[i];

      if (!analysis) {
        result.errors++;
        continue;
      }

      // Determine status based on confidence
      let status: string;
      if (analysis.isTruePositive && analysis.confidence >= 0.6) {
        status = "confirmed";
        result.confirmed++;
      } else if (analysis.confidence >= 0.2) {
        status = "inconclusive";
        result.inconclusive++;
      } else {
        status = "false_positive";
        result.falsePositive++;
      }

      // AI label for the description
      const sourceLabel = analysis.source === "llm"
        ? "[AI BATCH — LLM]"
        : analysis.source === "cached"
          ? "[AI BATCH — CACHED]"
          : "[AI BATCH — HEURISTIC]";

      const updatedDescription = finding.description
        ? `${finding.description}\n\n${sourceLabel}\n${analysis.analysis}`
        : `${sourceLabel}\n${analysis.analysis}`;

      // Build remediation text
      const remediationParts: string[] = [analysis.remediation];
      if (analysis.cvssScore !== null) {
        remediationParts.unshift(`CVSS v4 Base Score: ${analysis.cvssScore}/10`);
      }
      remediationParts.unshift(
        `Confidence: ${Math.round(analysis.confidence * 100)}% | Provider: ${analysis.provider}`,
      );

      try {
        await db
          .update(vulnerabilitiesTable)
          .set({
            aiValidated: true,
            status,
            description: updatedDescription,
            fix: remediationParts.join("\n\n"),
          })
          .where(eq(vulnerabilitiesTable.id, finding.id));
      } catch (err) {
        logger.error({ err, findingId: finding.id }, "[FP-PIPELINE] Failed to update finding");
        result.errors++;
      }
    }

    result.durationMs = Date.now() - startTime;

    logger.info({
      scanId,
      total: result.total,
      confirmed: result.confirmed,
      inconclusive: result.inconclusive,
      falsePositive: result.falsePositive,
      errors: result.errors,
      durationMs: result.durationMs,
    }, "[FP-PIPELINE] Batch validation complete");

    return result;
  } catch (err) {
    result.durationMs = Date.now() - startTime;
    logger.error({ err, scanId }, "[FP-PIPELINE] Pipeline crashed");
    return result;
  }
}
