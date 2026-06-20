import type { AiProvider, AiAnalysisResult, VulnerabilityAnalysisInput } from "../types";
import { logger } from "../../lib/logger";

// ── Fallback Provider ─────────────────────────────────────────────────────
//
// Used when the primary LLM provider is unreachable or not configured.
// This performs basic pattern analysis WITHOUT claiming "Confirmed TRUE
// POSITIVE" like the old generateAIPatch() did.
//
// Core philosophy: when uncertain, return inconclusive (NOT confirmed).

export class FallbackProvider implements AiProvider {
  readonly name = "fallback";

  async analyze(input: VulnerabilityAnalysisInput): Promise<AiAnalysisResult> {
    const { title, description, evidence, severity, cveIds, cweIds, toolName } = input;

    const haystack = `${title} ${description ?? ""} ${evidence ?? ""} ${severity}`.toLowerCase();

    // ── Pattern detection ─────────────────────────────────────────────────

    const patterns = this.detectPatterns(haystack);
    const hasCve = cveIds.length > 0;
    const hasCwe = cweIds.length > 0;

    // ── Evidence quality assessment ───────────────────────────────────────

    const hasConcreteEvidence = this.hasConcreteEvidence(haystack);
    const hasEvidencePayload = (evidence?.length ?? 0) > 50;

    // ── Classification logic ──────────────────────────────────────────────

    let isTruePositive = false;
    let confidence = 0;
    let analysis: string;
    let remediation: string;

    if (patterns.criticalExposure && hasEvidencePayload) {
      isTruePositive = true;
      confidence = 0.75;
      analysis = `FINDING ASSESSMENT: The ${patterns.type} pattern was detected in the finding title/description. `
        + `The evidence payload suggests this may be a genuine finding. `
        + `However, without raw verification, this assessment has moderate confidence.\n\n`
        + `NOTE: This is a heuristic analysis. The LLM-powered analysis engine was unavailable. `
        + `Please manually verify before taking action.`;
      remediation = patterns.remediation;
    } else if (hasCve && hasCwe) {
      isTruePositive = false;
      confidence = 0.3;
      analysis = `FINDING ASSESSMENT: This finding references known CVE/CWE identifiers (${cveIds.join(", ")} / ${cweIds.join(", ")}) `
        + `detected by ${toolName}. The CVE reference provides credibility, but without raw evidence verification, `
        + `the platform cannot confirm this finding as a true positive.\n\n`
        + `ACTION REQUIRED: Manual verification is needed. Re-run the scan with the primary AI analysis engine online.`;
      remediation = "Manual verification required. Use the AI Validate button when the LLM provider is available.";
    } else if (hasConcreteEvidence) {
      isTruePositive = false;
      confidence = 0.2;
      analysis = `FINDING ASSESSMENT: The evidence contains concrete indicators (URLs, code snippets, file paths) `
        + `suggesting this may be a valid finding. However, the platform's AI analysis engine is running in fallback mode, `
        + `which cannot perform deep verification.\n\n`
        + `RECOMMENDATION: Mark for manual review. Do not treat as confirmed without verification.`;
      remediation = "Manual verification required. Configure the AI provider for automated analysis.";
    } else {
      isTruePositive = false;
      confidence = 0.05;
      analysis = `FINDING ASSESSMENT: Insufficient evidence to confirm or deny this finding. `
        + `The platform's AI analysis engine is currently unavailable, and the fallback analyzer `
        + `found no strong indicators to support this finding.\n\n`
        + `STATUS: INCONCLUSIVE. This finding should NOT be treated as confirmed.`;
      remediation = `Re-scan with the primary AI analysis engine online, or manually verify this finding.`;
    }

    logger.info({
      scanId: input.toolName,
      tool: toolName,
      confidence,
      isTruePositive,
      source: "fallback",
    }, "[AI] Fallback analysis complete");

    return {
      isTruePositive,
      confidence,
      cvssScore: this.estimateCvss(severity, confidence),
      cweIds: input.cweIds.length > 0 ? input.cweIds : patterns.cweIds,
      mitreIds: patterns.mitreIds,
      analysis,
      remediation,
      source: "fallback",
      provider: this.name,
    };
  }

  // ── Pattern detection ───────────────────────────────────────────────────

  private detectPatterns(text: string): {
    type: string;
    criticalExposure: boolean;
    cweIds: string[];
    mitreIds: string[];
    remediation: string;
  } {
    if (text.includes(".env") || text.includes("environment variable") || text.includes("env file")) {
      return {
        type: "sensitive_file_exposure",
        criticalExposure: true,
        cweIds: ["CWE-200"],
        mitreIds: ["T1083"],
        remediation: "Block access to .env files via web server configuration. Move environment files outside the web root.",
      };
    }
    if (text.includes(".git") || text.includes("git directory") || text.includes("git head")) {
      return {
        type: "source_code_disclosure",
        criticalExposure: true,
        cweIds: ["CWE-540"],
        mitreIds: ["T1213"],
        remediation: "Block /.git directory access via web server. Remove .git from production deployments.",
      };
    }
    if (text.includes("sql dump") || (text.includes("database") && text.includes("dump"))) {
      return {
        type: "data_exposure",
        criticalExposure: true,
        cweIds: ["CWE-200"],
        mitreIds: ["T1530"],
        remediation: "Immediately restrict access to database dump files. Rotate any exposed credentials.",
      };
    }
    if (text.includes("open port") || text.includes("port ") && text.match(/port\s+\d+/)) {
      return {
        type: "open_port",
        criticalExposure: false,
        cweIds: ["CWE-200"],
        mitreIds: ["T1046"],
        remediation: "Review open ports and restrict access via firewall rules. Close unnecessary ports.",
      };
    }
    if (text.includes("xss") || text.includes("cross-site") || text.includes("cross site")) {
      return {
        type: "cross_site_scripting",
        criticalExposure: true,
        cweIds: ["CWE-79"],
        mitreIds: ["T1059.007"],
        remediation: "Implement proper output encoding. Use Content-Security-Policy headers. Validate and sanitize user input.",
      };
    }
    if (text.includes("sql injection") || text.includes("sqli")) {
      return {
        type: "sql_injection",
        criticalExposure: true,
        cweIds: ["CWE-89"],
        mitreIds: ["T1190"],
        remediation: "Use parameterized queries / prepared statements. Implement input validation. Use an ORM with proper escaping.",
      };
    }

    return {
      type: "generic",
      criticalExposure: false,
      cweIds: [],
      mitreIds: [],
      remediation: "Manual review recommended. The fallback analyzer could not classify this finding.",
    };
  }

  private hasConcreteEvidence(text: string): boolean {
    // Check for indicators of concrete evidence
    const indicators = [
      /https?:\/\/[^\s]+/,       // URLs
      /\/[a-z_\/]{3,}\.[a-z]+/i, // File paths
      /exit code \d+/i,           // Exit codes
      /HTTP\s+\d{3}/i,            // HTTP status codes
      /[a-f0-9]{32,}/i,           // MD5/SHA hashes
      /<[a-z]+[^>]*>/i,           // HTML tags
      /['"][^'"]{50,}['"]/,       // Long strings (code snippets)
    ];
    return indicators.some((re) => re.test(text));
  }

  private estimateCvss(severity: string, confidence: number): number | null {
    if (confidence < 0.1) return null;

    const severityMap: Record<string, number> = {
      critical: 9.0,
      high: 7.0,
      medium: 5.0,
      low: 3.0,
      info: 0.0,
    };

    const base = severityMap[severity.toLowerCase()];
    if (base === undefined) return null;

    // Reduce score proportionally to confidence
    return Math.round(base * confidence * 10) / 10;
  }
}
