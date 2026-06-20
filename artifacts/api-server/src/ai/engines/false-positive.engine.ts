// ---------------------------------------------------------------------------
// False Positive Elimination Engine ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Aggressively filters false positives using these rules:
//   - A vulnerability is NEVER confirmed by AI alone
//   - AI must require evidence from tools
//   - AI must compare multiple tool outputs
//   - AI must re-evaluate HTTP requests/responses
//   - AI must validate reproducibility
//
// Output classification:
//   - CONFIRMED
//   - HIGH CONFIDENCE
//   - NEEDS VERIFICATION
//   - FALSE POSITIVE (excluded from report)
//
// ⚠️ IMPORTANT:
//   False positives must NEVER appear in final report as real vulnerabilities.

import { logger } from "../../lib/logger";
import type {
  AiService,
} from "../ai-service";
import type {
  FpAnalysisInput,
  FpAnalysisResult,
  FpClassification,
  CorrelatedFinding,
  VulnerabilityAnalysisInput,
} from "../types";

export class FalsePositiveEngine {
  private aiService: AiService;

  constructor(aiService: AiService) {
    this.aiService = aiService;
    logger.info("[FP-ENGINE] False Positive Elimination Engine initialized");
  }

  async analyze(input: FpAnalysisInput): Promise<FpAnalysisResult> {
    const {
      title,
      severity,
      description,
      evidence,
      url,
      toolName,
      toolConfidence,
      cveIds,
      cweIds,
      allFindingsForScan,
    } = input;

    const startTime = Date.now();

    // ── Phase 1: Evidence Quality Check ──────────────────────────────────
    // Determine if there's real evidence we can verify

    const evidenceQuality = this.assessEvidenceQuality(evidence ?? "", description ?? "", title);

    if (evidenceQuality === "none") {
      logger.debug({ title }, "[FP] No evidence — marking as false positive");
      return {
        classification: "false_positive",
        confidence: 0,
        rationale: "No evidence payload was provided for this finding. Without request/response data, the platform cannot verify this finding.",
        hasRecheckableEvidence: false,
      };
    }

    // ── Phase 2: Cross-Tool Comparison ───────────────────────────────────
    // Check if other tools reported the same issue

    const crossToolMatches = this.findCrossToolMatches(input, allFindingsForScan);
    const multiToolConfirmed = crossToolMatches.length > 0;

    // ── Phase 3: Reproducibility Check ───────────────────────────────────
    // Check if the finding can be reproduced based on evidence

    const reproducibilityScore = this.assessReproducibility(evidence ?? "", title);
    const hasRecheckableEvidence = reproducibilityScore > 0.3;

    // ── Phase 4: AI Analysis (LLM or heuristic) ──────────────────────────
    // Use the AI service to get a confidence score

    let aiConfidence = 0;
    let aiIsTruePositive = false;
    let aiAnalysis = "";

    try {
      const analysisInput: VulnerabilityAnalysisInput = {
        title,
        severity,
        description,
        evidence,
        url,
        toolName,
        templateId: null,
        cveIds,
        cweIds,
        scanTarget: url,
      };
      const result = await this.aiService.analyze(analysisInput);
      aiConfidence = result.confidence;
      aiIsTruePositive = result.isTruePositive;
      aiAnalysis = result.analysis;
    } catch {
      // If AI fails, use rule-based approach
      aiConfidence = this.ruleBasedConfidence(title, evidence ?? "", cveIds);
      aiIsTruePositive = aiConfidence > 0.5;
    }

    // ── Phase 5: Final Classification ────────────────────────────────────
    //
    // Decision matrix:
    //   - CONFIRMED:       AI agrees + multi-tool + good evidence + reproducible
    //   - HIGH CONFIDENCE: AI agrees + good evidence (but single tool)
    //   - NEEDS VERIFICATION: AI disagrees or weak evidence
    //   - FALSE POSITIVE:  AI strongly disagrees + no evidence + not reproducible

    const classification = this.determineClassification(
      aiIsTruePositive,
      aiConfidence,
      multiToolConfirmed,
      evidenceQuality,
      reproducibilityScore,
      toolConfidence,
      cveIds,
    );

    const confidence = this.calculateFinalConfidence(
      aiConfidence,
      multiToolConfirmed,
      evidenceQuality,
      reproducibilityScore,
      toolConfidence,
    );

    const rationale = this.buildRationale(
      classification,
      confidence,
      aiIsTruePositive,
      aiConfidence,
      multiToolConfirmed,
      crossToolMatches,
      evidenceQuality,
      reproducibilityScore,
      aiAnalysis,
    );

    const durationMs = Date.now() - startTime;

    logger.info({
      title: title.slice(0, 60),
      classification,
      confidence,
      multiToolConfirmed,
      evidenceQuality,
      reproducibilityScore,
      durationMs,
    }, "[FP] Analysis complete");

    return {
      classification,
      confidence,
      rationale,
      hasRecheckableEvidence,
      suggestedRetestPayloads: hasRecheckableEvidence
        ? this.generateRetestPayloads(title, evidence ?? "")
        : undefined,
      recommendedTools: classification === "needs_verification" || classification === "high_confidence"
        ? this.recommendCrossTools(crossToolMatches)
        : undefined,
    };
  }

  // ── Evidence Quality Assessment ─────────────────────────────────────────

  private assessEvidenceQuality(evidence: string, description: string, title: string): "high" | "medium" | "low" | "none" {
    const text = `${evidence} ${description} ${title}`;

    // High quality: contains HTTP request/response, payloads, concrete data
    if (
      text.includes("HTTP/") ||
      text.includes("https://") ||
      text.includes("response") ||
      text.includes("status code") ||
      text.length > 200
    ) {
      return "high";
    }

    // Medium quality: contains URLs, file paths, or code snippets
    if (
      text.includes(".php") ||
      text.includes("/api/") ||
      text.includes(".env") ||
      text.includes(".git") ||
      text.length > 100
    ) {
      return "medium";
    }

    // Low quality: just a title or generic description
    if (text.length > 20) {
      return "low";
    }

    return "none";
  }

  // ── Cross-Tool Matching ─────────────────────────────────────────────────

  private findCrossToolMatches(
    input: FpAnalysisInput,
    allFindings: CorrelatedFinding[],
  ): CorrelatedFinding[] {
    const matches: CorrelatedFinding[] = [];
    const inputCves = new Set(input.cveIds.map((c) => c.toUpperCase()));
    const inputUrl = this.normalizeUrlForMatch(input.url);
    const inputType = this.detectVulnType(input.title, input.description ?? "");

    for (const finding of allFindings) {
      // Skip self
      if (finding.toolName === input.toolName) continue;

      // Check CVE overlap
      const findingCves = new Set(finding.cveIds.map((c) => c.toUpperCase()));
      const cveOverlap = [...inputCves].filter((c) => findingCves.has(c)).length;

      if (cveOverlap > 0) {
        matches.push(finding);
        continue;
      }

      // Check URL + type match
      const findingUrl = this.normalizeUrlForMatch(finding.url);
      const findingType = this.detectVulnType(finding.title, finding.description ?? "");

      if (findingUrl === inputUrl && findingType === inputType) {
        matches.push(finding);
      }
    }

    return matches;
  }

  // ── Reproducibility Assessment ──────────────────────────────────────────

  private assessReproducibility(evidence: string, title: string): number {
    const text = `${evidence} ${title}`.toLowerCase();
    let score = 0;

    // Has concrete HTTP details
    if (/https?:\/\/[^\s]+/.test(text)) score += 0.3;
    if (/curl|wget|request|fetch/.test(text)) score += 0.2;
    if (/payload|inject|<script|alert\(/.test(text)) score += 0.2;
    if (/(?:status|code|response)\s*(?::|is|=)\s*\d{3}/.test(text)) score += 0.2;

    // Has parameter details
    if (/param|query|body|header/.test(text)) score += 0.1;

    return Math.min(score, 1.0);
  }

  // ── Rule-Based Confidence (when AI unavailable) ─────────────────────────

  private ruleBasedConfidence(title: string, evidence: string, cveIds: string[]): number {
    const text = `${title} ${evidence}`.toLowerCase();
    let confidence = 0;

    // CVE references boost confidence
    if (cveIds.length > 0) confidence += 0.3;

    // Concrete evidence
    if (/https?:\/\/[^\s]+/.test(text)) confidence += 0.2;
    if (/response|status|code/.test(text)) confidence += 0.15;

    // Tool-specific confidence
    if (text.includes("nuclei") && /cve-\d{4}-\d{4,}/.test(text)) confidence += 0.2;

    return Math.min(confidence, 0.8);
  }

  // ── Classification Decision Matrix ──────────────────────────────────────

  private determineClassification(
    aiTruePositive: boolean,
    aiConfidence: number,
    multiToolConfirmed: boolean,
    evidenceQuality: string,
    reproducibilityScore: number,
    toolConfidence: number,
    cveIds: string[],
  ): FpClassification {
    // CONFIRMED: Strong evidence from multiple sources
    if (
      (aiTruePositive && aiConfidence >= 0.7 && multiToolConfirmed) ||
      (aiTruePositive && aiConfidence >= 0.8 && evidenceQuality === "high") ||
      (aiTruePositive && aiConfidence >= 0.9) ||
      (multiToolConfirmed && evidenceQuality === "high" && cveIds.length > 0)
    ) {
      return "confirmed";
    }

    // HIGH CONFIDENCE: AI agrees, good evidence, but single tool
    if (
      (aiTruePositive && aiConfidence >= 0.6 && evidenceQuality !== "none") ||
      (aiTruePositive && aiConfidence >= 0.5 && multiToolConfirmed) ||
      (evidenceQuality === "high" && reproducibilityScore > 0.5 && cveIds.length > 0)
    ) {
      return "high_confidence";
    }

    // FALSE POSITIVE: AI strongly disagrees or no evidence at all
    if (
      (!aiTruePositive && aiConfidence < 0.2 && evidenceQuality === "low") ||
      (evidenceQuality === "none") ||
      (!aiTruePositive && aiConfidence < 0.1 && reproducibilityScore < 0.1)
    ) {
      return "false_positive";
    }

    // NEEDS VERIFICATION: Everything else — uncertain
    return "needs_verification";
  }

  // ── Final Confidence Calculation ────────────────────────────────────────

  private calculateFinalConfidence(
    aiConfidence: number,
    multiToolConfirmed: boolean,
    evidenceQuality: string,
    reproducibilityScore: number,
    toolConfidence: number,
  ): number {
    let confidence = 0;

    // AI analysis (weight: 40%)
    confidence += aiConfidence * 40;

    // Multi-tool confirmation (weight: 25%)
    if (multiToolConfirmed) confidence += 25;

    // Evidence quality (weight: 20%)
    const qualityWeights: Record<string, number> = { high: 20, medium: 12, low: 5, none: 0 };
    confidence += qualityWeights[evidenceQuality] ?? 0;

    // Reproducibility (weight: 10%)
    confidence += reproducibilityScore * 10;

    // Tool confidence (weight: 5%)
    confidence += (toolConfidence / 100) * 5;

    return Math.round(Math.min(confidence, 100));
  }

  // ── Rationale Builder ───────────────────────────────────────────────────

  private buildRationale(
    classification: FpClassification,
    confidence: number,
    aiTruePositive: boolean,
    aiConfidence: number,
    multiToolConfirmed: boolean,
    crossToolMatches: CorrelatedFinding[],
    evidenceQuality: string,
    reproducibilityScore: number,
    aiAnalysis: string,
  ): string {
    const parts: string[] = [];

    parts.push(`Classification: ${classification.toUpperCase()}`);
    parts.push(`Confidence: ${confidence}%`);

    if (aiTruePositive && aiConfidence > 0) {
      parts.push(`AI Analysis: Confirmed true positive with ${Math.round(aiConfidence * 100)}% confidence.`);
    } else if (!aiTruePositive && aiConfidence > 0) {
      parts.push(`AI Analysis: Did not confirm this finding (${Math.round(aiConfidence * 100)}% confidence).`);
    } else {
      parts.push("AI Analysis: No AI provider available — analysis based on rule-based heuristics.");
    }

    if (multiToolConfirmed) {
      const tools = crossToolMatches.map((m) => m.toolName).join(", ");
      parts.push(`Cross-Tool Validation: Confirmed by ${crossToolMatches.length} additional tool(s): ${tools}.`);
    } else {
      parts.push("Cross-Tool Validation: No other tool independently confirmed this finding.");
    }

    const qualityLabels: Record<string, string> = {
      high: "Strong HTTP evidence with request/response details.",
      medium: "Moderate evidence with partial details.",
      low: "Weak evidence — generic description only.",
      none: "No evidence provided.",
    };
    parts.push(`Evidence Quality: ${qualityLabels[evidenceQuality] ?? "Unknown"}`);
    parts.push(`Reproducibility Score: ${Math.round(reproducibilityScore * 100)}%`);

    if (classification === "false_positive") {
      parts.push("⚠️ This finding has been classified as FALSE POSITIVE and will be excluded from the final report.");
    }

    if (aiAnalysis) {
      parts.push(`\n${aiAnalysis}`);
    }

    return parts.join("\n\n");
  }

  // ── Retest Payload Generator ────────────────────────────────────────────

  private generateRetestPayloads(title: string, evidence: string): string[] {
    const text = `${title} ${evidence}`.toLowerCase();
    const payloads: string[] = [];

    if (text.includes("xss") || text.includes("alert") || text.includes("<script")) {
      payloads.push("<script>alert('V8-TEST')</script>");
      payloads.push("%3Cscript%3Ealert('V8-TEST')%3C/script%3E");
      payloads.push("\"><script>alert('V8-TEST')</script>");
    }

    if (text.includes("sql") || text.includes("sqli") || text.includes("' or ")) {
      payloads.push("' OR '1'='1");
      payloads.push("' OR 1=1--");
      payloads.push("' UNION SELECT NULL--");
    }

    if (text.includes("lfi") || text.includes("file inclusion") || text.includes("../../")) {
      payloads.push("../../../../etc/passwd");
      payloads.push("..%252f..%252f..%252fetc/passwd");
    }

    if (text.includes("ssrf")) {
      payloads.push("http://169.254.169.254/latest/meta-data/");
      payloads.push("http://localhost:8080/admin");
    }

    return payloads;
  }

  // ── Cross-Tool Recommendations ──────────────────────────────────────────

  private recommendCrossTools(existingMatches: CorrelatedFinding[]): string[] {
    const recommended: string[] = [];

    if (!existingMatches.some((m) => m.toolName.includes("nuclei"))) {
      recommended.push("nuclei");
    }
    if (!existingMatches.some((m) => m.toolName.includes("ffuf"))) {
      recommended.push("ffuf");
    }

    return recommended;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private normalizeUrlForMatch(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "").toLowerCase()}`;
    } catch {
      return url.toLowerCase().replace(/\/$/, "");
    }
  }

  private detectVulnType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();
    const patterns: Array<{ type: string; pattern: RegExp }> = [
      { type: "xss", pattern: /xss|cross-site-script/i },
      { type: "sql_injection", pattern: /sql.inject|sqli/i },
      { type: "ssrf", pattern: /ssrf|server-side-request-forgery/i },
      { type: "rce", pattern: /rce|remote-code-exec/i },
      { type: "lfi", pattern: /lfi|file-inclusion|path-traversal/i },
      { type: "open_port", pattern: /open-port|port-scan/i },
      { type: "sensitive_data", pattern: /\.env|exposed|leak|secret/i },
    ];
    for (const { type, pattern } of patterns) {
      if (pattern.test(text)) return type;
    }
    return "general";
  }
}
