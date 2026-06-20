// ---------------------------------------------------------------------------
// AI Intelligence Engine — Central Orchestrator
// ---------------------------------------------------------------------------
//
// Coordinates all specialized AI engines:
//   1. Correlation Engine     — Merge duplicates, normalize, cross-tool evidence
//   2. FP Elimination Engine  — Aggressive false positive filtering
//   3. Vulnerability Understanding — Root cause, attack vector, impact
//   4. Risk Scoring Engine    — CVSS v3.1/v4.0, EPSS, CWE, MITRE ATT&CK
//   5. Attack Chain Detection — Chained vulnerability detection & visualization
//   6. Remediation Engine     — Language-specific code patches, WAF rules
//   7. Scan Optimization      — Best tool selection, noise reduction
//   8. Learning Engine        — Learn from past scans, improve automatically
//
// Philosophy:
//   - AI NEVER confirms vulnerabilities alone
//   - AI requires evidence from tools
//   - AI compares multiple tool outputs
//   - AI re-evaluates HTTP requests/responses
//   - AI validates reproducibility
//   - False positives are NEVER reported as real vulnerabilities

import { logger } from "../../lib/logger";
import { CorrelationEngine } from "./correlation.engine";
import { FalsePositiveEngine } from "./false-positive.engine";
import { VulnerabilityUnderstandingEngine } from "./vulnerability-understanding.engine";
import { RiskScoringEngine } from "./risk-scoring.engine";
import { AttackChainEngine } from "./attack-chain.engine";
import { RemediationEngine } from "./remediation.engine";
import { ScanOptimizationEngine } from "./scan-optimization.engine";
import { LearningEngine } from "./learning.engine";
import type { AiService } from "../ai-service";
import type {
  IntelligenceEngineConfig,
  CorrelationInput,
  CorrelationResult,
  FpAnalysisInput,
  FpAnalysisResult,
  VulnerabilityUnderstanding,
  RiskScoreInput,
  RiskScoreResult,
  AttackChainInput,
  AttackChainResult,
  RemediationInput,
  RemediationResult,
  ScanOptimizationInput,
  ScanOptimizationResult,
  LearningFeedbackInput,
  LearningEngineSnapshot,
  CorrelatedFinding,
  SupportedLanguage,
} from "../types";

const DEFAULT_CONFIG: IntelligenceEngineConfig = {
  maxCorrelationDistance: 3,
  enableLearning: true,
  enableAttackChains: true,
  minConfidenceForConfirmed: 80,
  minConfidenceForHighConfidence: 60,
};

export class IntelligenceEngine {
  readonly config: IntelligenceEngineConfig;

  readonly correlation: CorrelationEngine;
  readonly falsePositive: FalsePositiveEngine;
  readonly vulnerabilityUnderstanding: VulnerabilityUnderstandingEngine;
  readonly riskScoring: RiskScoringEngine;
  readonly attackChain: AttackChainEngine;
  readonly remediation: RemediationEngine;
  readonly scanOptimization: ScanOptimizationEngine;
  readonly learning: LearningEngine;

  private aiService: AiService;

  constructor(aiService: AiService, config?: Partial<IntelligenceEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiService = aiService;

    this.correlation = new CorrelationEngine(this.config);
    this.falsePositive = new FalsePositiveEngine(this.aiService);
    this.vulnerabilityUnderstanding = new VulnerabilityUnderstandingEngine();
    this.riskScoring = new RiskScoringEngine();
    this.attackChain = new AttackChainEngine();
    this.remediation = new RemediationEngine();
    this.scanOptimization = new ScanOptimizationEngine();
    this.learning = new LearningEngine();

    logger.info({
      correlationEnabled: true,
      fpEnabled: true,
      understandingEnabled: true,
      riskScoringEnabled: true,
      attackChainsEnabled: this.config.enableAttackChains,
      remediationEnabled: true,
      optimizationEnabled: true,
      learningEnabled: this.config.enableLearning,
    }, "[INTELLIGENCE] AI Intelligence Engine initialized with all 8 engines");
  }

  // ── Full Scan Analysis Pipeline ─────────────────────────────────────────

  /**
   * Run the complete intelligence pipeline on a completed scan.
   * This is called by the scan orchestrator after all tools have finished.
   */
  async analyzeScan(scanId: number, findings: CorrelatedFinding[]): Promise<IntelligenceScanReport> {
    const startTime = Date.now();
    logger.info({ scanId, findingCount: findings.length }, "[INTELLIGENCE] Starting full scan analysis");

    // Step 1: Correlation — merge duplicates, normalize
    logger.info({ scanId }, "[INTELLIGENCE] Step 1/8: Correlation Engine");
    const correlationResult = await this.correlation.analyze({
      scanId,
      findings,
    });
    const mergedFindings = correlationResult.mergedFindings;

    // Step 2: FP Elimination — aggressively filter false positives
    logger.info({ scanId }, "[INTELLIGENCE] Step 2/8: False Positive Elimination");

    // Convert MergedFinding[] to CorrelatedFinding[] for the FP pipeline
    const fpInputFindings: CorrelatedFinding[] = mergedFindings.map((mf, idx) => ({
      _index: idx,
      title: mf.title,
      severity: mf.severity,
      url: mf.url,
      description: mf.description,
      evidence: mf.evidence,
      toolName: mf.sourceTools[0] ?? "correlation",
      templateId: null,
      cveIds: mf.cveIds,
      cweIds: mf.cweIds,
      rawOutput: mf.evidence,
      confidence: mf.confidence,
    }));
    const fpResults = await this.runFalsePositivePipeline(scanId, fpInputFindings);

    // Filter out false positives — they must NEVER appear as real vulnerabilities
    const confirmedFindings = fpResults.filter(
      (r) => r.classification !== "false_positive",
    );

    // Step 3: Vulnerability Understanding — analyze each confirmed finding
    logger.info({ scanId }, "[INTELLIGENCE] Step 3/8: Vulnerability Understanding");
    const understandings = new Map<number, VulnerabilityUnderstanding>();
    for (const finding of confirmedFindings) {
      const understanding = this.vulnerabilityUnderstanding.analyze({
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        url: finding.url,
        evidence: finding.evidence,
        toolName: finding.toolName,
      });
      understandings.set(finding.findingId, understanding);
    }

    // Step 4: Risk Scoring — CVSS, EPSS, CWE, MITRE
    logger.info({ scanId }, "[INTELLIGENCE] Step 4/8: Risk Scoring");
    const riskScores = new Map<number, RiskScoreResult>();
    for (const finding of confirmedFindings) {
      const riskScore = this.riskScoring.score({
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        evidence: finding.evidence,
        url: finding.url,
        cveIds: finding.cveIds,
        cweIds: finding.cweIds,
        toolConfidence: finding.confidence,
      });
      riskScores.set(finding.findingId, riskScore);
    }

    // Step 5: Attack Chain Detection
    logger.info({ scanId }, "[INTELLIGENCE] Step 5/8: Attack Chain Detection");
    let attackChainResult: AttackChainResult | null = null;
    if (this.config.enableAttackChains && confirmedFindings.length >= 2) {
      attackChainResult = this.attackChain.detect({
        scanId,
        findings: confirmedFindings.map((f) => ({
          id: f.findingId,
          title: f.title,
          severity: f.severity,
          url: f.url,
          description: f.description,
          evidence: f.evidence,
          toolName: f.toolName,
          templateId: null,
          cveIds: f.cveIds,
          cweIds: f.cweIds,
          rawOutput: null,
        })),
        allAnalyses: confirmedFindings.map((f) => ({
          findingId: f.findingId,
          title: f.title,
          severity: f.severity,
          url: f.url,
          classification: "confirmed",
          confidence: f.confidence,
        })),
      });
    }

    // Step 6: Remediation — generate fixes for confirmed findings
    logger.info({ scanId }, "[INTELLIGENCE] Step 6/8: Remediation Generation");
    const remediations = new Map<number, RemediationResult>();
    for (const finding of confirmedFindings) {
      const language = this.detectLanguage(finding);
      const remediation = this.remediation.generate({
        vulnerabilityType: this.detectVulnerabilityType(finding),
        title: finding.title,
        description: finding.description,
        evidence: finding.evidence,
        url: finding.url,
        severity: finding.severity,
        language,
        cweIds: finding.cweIds,
        cveIds: finding.cveIds,
      });
      remediations.set(finding.findingId, remediation);
    }

    // Step 7: Learning Engine — record scan data
    logger.info({ scanId }, "[INTELLIGENCE] Step 7/8: Learning Engine Update");
    if (this.config.enableLearning) {
      this.learning.recordScan({
        scanId,
        confirmedFindings: confirmedFindings.length,
        falsePositives: fpResults.filter((r) => r.classification === "false_positive").length,
        totalFindings: findings.length,
        durationMs: Date.now() - startTime,
        toolsUsed: [...new Set(findings.map((f) => f.toolName))],
      });
    }

    const durationMs = Date.now() - startTime;

    const report: IntelligenceScanReport = {
      scanId,
      inputFindings: findings.length,
      correlationResult,
      fpResults,
      confirmedCount: confirmedFindings.length,
      removedFalsePositives: fpResults.filter((r) => r.classification === "false_positive").length,
      understandings: Array.from(understandings.entries()).map(([id, u]) => ({ findingId: id, understanding: u })),
      riskScores: Array.from(riskScores.entries()).map(([id, s]) => ({ findingId: id, score: s })),
      attackChainResult,
      remediations: Array.from(remediations.entries()).map(([id, r]) => ({ findingId: id, remediation: r })),
      durationMs,
    };

    logger.info({
      scanId,
      inputFindings: findings.length,
      afterCorrelation: correlationResult.stats.uniqueFindings,
      confirmedFindings: confirmedFindings.length,
      falsePositives: report.removedFalsePositives,
      attackChains: attackChainResult?.chains.length ?? 0,
      durationMs,
    }, "[INTELLIGENCE] Full scan analysis complete");

    return report;
  }

  // ── FP Pipeline (batch) ─────────────────────────────────────────────────

  private async runFalsePositivePipeline(
    scanId: number,
    findings: CorrelatedFinding[],
  ): Promise<CorrelatedFindingAnalysis[]> {
    const results: CorrelatedFindingAnalysis[] = [];

    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      const input: FpAnalysisInput = {
        findingId: i,
        title: finding.title,
        severity: finding.severity,
        description: finding.description,
        evidence: finding.evidence,
        url: finding.url,
        toolName: finding.toolName,
        toolConfidence: finding.confidence ?? 50,
        cveIds: finding.cveIds,
        cweIds: finding.cweIds,
        allFindingsForScan: findings,
      };

      const result = await this.falsePositive.analyze(input);

      // Simulate persistence: if confirmed with high confidence, mark it
      if (result.classification === "confirmed" && result.confidence >= this.config.minConfidenceForConfirmed) {
        logger.debug({ finding: finding.title, confidence: result.confidence }, "[FP] Confirmed finding");
      } else if (result.classification === "false_positive") {
        logger.debug({ finding: finding.title, rationale: result.rationale }, "[FP] Filtered false positive");
      }

      results.push({
        ...result,
        findingId: i,
        title: finding.title,
        severity: finding.severity,
        description: finding.description,
        evidence: finding.evidence,
        toolName: finding.toolName,
        cveIds: finding.cveIds,
        cweIds: finding.cweIds,
        url: finding.url,
        confidence: result.confidence,
      });
    }

    return results;
  }

  // ── Scan Optimization ────────────────────────────────────────────────────

  async optimizeScan(input: ScanOptimizationInput): Promise<ScanOptimizationResult> {
    logger.info({
      target: input.target,
      requestedTools: input.requestedTools.length,
      historyEntries: input.scanHistory.length,
    }, "[INTELLIGENCE] Running scan optimization");

    return this.scanOptimization.optimize(input);
  }

  // ── Learning Engine Stats ────────────────────────────────────────────────

  getLearningSnapshot(): LearningEngineSnapshot {
    return this.learning.getSnapshot();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private detectLanguage(finding: { title: string; description: string | null; evidence: string | null }): SupportedLanguage {
    const text = `${finding.title} ${finding.description ?? ""} ${finding.evidence ?? ""}`.toLowerCase();
    if (text.includes("php") || text.includes("laravel")) return "php";
    if (text.includes("django")) return "django";
    if (text.includes("flask")) return "flask";
    if (text.includes("python")) return "python";
    if (text.includes("express")) return "express";
    if (text.includes("node")) return "node.js";
    if (text.includes("spring")) return "spring-boot";
    if (text.includes("java")) return "java";
    if (text.includes("asp.net") || text.includes("c#") || text.includes(".net")) return "asp.net";
    if (text.includes("go ") || text.includes("golang")) return "go";
    if (text.includes("rails") || text.includes("ruby")) return "ruby-on-rails";
    if (text.includes("typescript")) return "typescript";
    if (text.includes("javascript") || text.includes("js")) return "javascript";
    return "generic";
  }

  private detectVulnerabilityType(finding: { title: string; description: string | null }): string {
    const text = `${finding.title} ${finding.description ?? ""}`.toLowerCase();
    if (text.includes("xss") || text.includes("cross-site")) return "xss";
    if (text.includes("sql injection") || text.includes("sqli")) return "sql_injection";
    if (text.includes("ssrf")) return "ssrf";
    if (text.includes("rce") || text.includes("remote code")) return "rce";
    if (text.includes("lfi") || text.includes("file inclusion")) return "file_inclusion";
    if (text.includes("open redirect")) return "open_redirect";
    if (text.includes("csrf") || text.includes("cross-site request")) return "csrf";
    if (text.includes(".env") || text.includes("sensitive file") || text.includes("exposure")) return "sensitive_data_exposure";
    if (text.includes("open port") || text.includes("port scan")) return "open_port";
    if (text.includes("cors")) return "cors_misconfiguration";
    if (text.includes("ssl") || text.includes("tls") || text.includes("certificate")) return "ssl_tls";
    return "general_vulnerability";
  }
}

// ── Report Types ───────────────────────────────────────────────────────────

export interface CorrelatedFindingAnalysis extends FpAnalysisResult {
  findingId: number;
  title: string;
  severity: string;
  description: string | null;
  evidence: string | null;
  toolName: string;
  cveIds: string[];
  cweIds: string[];
  url: string;
}

export interface IntelligenceScanReport {
  scanId: number;
  inputFindings: number;
  correlationResult: CorrelationResult;
  fpResults: CorrelatedFindingAnalysis[];
  confirmedCount: number;
  removedFalsePositives: number;
  understandings: Array<{ findingId: number; understanding: VulnerabilityUnderstanding }>;
  riskScores: Array<{ findingId: number; score: RiskScoreResult }>;
  attackChainResult: AttackChainResult | null;
  remediations: Array<{ findingId: number; remediation: RemediationResult }>;
  durationMs: number;
}
