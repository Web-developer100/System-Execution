// ---------------------------------------------------------------------------
// Output Standardization Layer
// ---------------------------------------------------------------------------
//
// All tool outputs must be converted into a unified format:
// {
//   "vulnerability": "",
//   "severity": "",
//   "confidence": "",
//   "evidence": {
//     "request": "",
//     "response": ""
//   },
//   "source_tool": "",
//   "timestamp": ""
// }
//
// This layer processes raw tool results and normalizes them into
// a consistent, structured format for downstream processing
// (correlation, FP elimination, risk scoring, etc.)

import { logger } from "../lib/logger";
import type { Finding, FindingSeverity, ToolResult } from "./types";

// ── Standardized Finding Format ───────────────────────────────────────────

export interface StandardizedFinding {
  vulnerability: string;       // Short vulnerability name
  severity: string;             // critical | high | medium | low | info
  confidence: string;           // "confirmed" | "high" | "medium" | "low" | "none"
  evidence: {
    request: string;            // The HTTP request that triggered the finding
    response: string;           // The HTTP response evidence
    raw: string;                // Raw tool output line
  };
  source_tool: string;          // Name of the tool that found this
  timestamp: string;            // ISO timestamp of discovery
  endpoint: string;             // Target URL / IP
  cve_ids: string[];            // Related CVE identifiers
  cwe_ids: string[];            // Related CWE identifiers
  template_id: string | null;   // Template ID (e.g., nuclei template)
  type: string;                 // Vulnerability type (xss, sqli, ssrf, etc.)
  description: string;          // Human-readable description
  remediation: string;          // Suggested fix
  classification: string;       // After AI analysis: confirmed | fp | unverified
}

// ── Standardization Engine ─────────────────────────────────────────────────

export class OutputStandardizer {
  constructor() {
    logger.info("[STANDARDIZER] Output Standardization Layer initialized");
  }

  /**
   * Standardize all findings from a tool result.
   */
  standardizeFindings(toolResult: ToolResult, scanId: number, target: string): StandardizedFinding[] {
    const standardized: StandardizedFinding[] = [];
    const timestamp = new Date().toISOString();

    for (const finding of toolResult.findings) {
      standardized.push(this.standardizeFinding(finding, toolResult.toolName, timestamp, target));
    }

    // If no findings were parsed, try to extract raw output into findings
    if (standardized.length === 0 && toolResult.stdout.trim().length > 0) {
      standardized.push(...this.extractFromRawOutput(toolResult, target));
    }

    return standardized;
  }

  /**
   * Standardize a single finding.
   */
  standardizeFinding(
    finding: Finding,
    toolName: string,
    timestamp: string,
    target: string,
  ): StandardizedFinding {
    const response = finding.evidence ?? "";
    const request = this.extractRequestFromEvidence(finding.evidence ?? "", finding.url);

    return {
      vulnerability: finding.title,
      severity: finding.severity,
      confidence: this.mapConfidence(finding.severity, finding.cveIds.length),
      evidence: {
        request,
        response,
        raw: finding.rawOutput ?? "",
      },
      source_tool: toolName,
      timestamp,
      endpoint: finding.url || target,
      cve_ids: finding.cveIds,
      cwe_ids: finding.cweIds,
      template_id: finding.templateId,
      type: this.detectFindingType(finding.title, finding.description ?? ""),
      description: finding.description ?? "",
      remediation: finding.fix ?? "",
      classification: "pending",
    };
  }

  /**
   * Attempt to extract findings from raw tool output.
   * This is a fallback for tools without registered parsers.
   */
  private extractFromRawOutput(toolResult: ToolResult, target: string): StandardizedFinding[] {
    const findings: StandardizedFinding[] = [];
    const timestamp = new Date().toISOString();
    const toolName = toolResult.toolName;
    const lines = toolResult.stdout.split("\n").filter((l) => l.trim().length > 0);

    // Try to detect CVE references in the raw output
    const cvePattern = /\bCVE-\d{4}-\d{4,}\b/gi;
    for (const line of lines) {
      const cves = [...line.matchAll(cvePattern)].map((m) => m[0].toUpperCase());
      if (cves.length > 0) {
        findings.push({
          vulnerability: `CVE Reference: ${cves.slice(0, 3).join(", ")}`,
          severity: "medium",
          confidence: "medium",
          evidence: { request: "", response: line, raw: line },
          source_tool: toolName,
          timestamp,
          endpoint: target,
          cve_ids: cves,
          cwe_ids: [],
          template_id: null,
          type: "cve_reference",
          description: `Tool ${toolName} output references ${cves.length} CVE identifier(s). These may indicate known vulnerabilities.`,
          remediation: "Review referenced CVEs for applicability to the target.",
          classification: "pending",
        });
      }
    }

    // Try to detect URL patterns and HTTP status (common in web scanners)
    const urlPattern = /https?:\/\/[^\s]+/gi;
    for (const line of lines) {
      const urls = line.match(urlPattern);
      if (urls) {
        const statusMatch = line.match(/\b(\d{3})\b/);
        const sev = statusMatch && parseInt(statusMatch[1]) >= 500 ? "high"
                  : statusMatch && parseInt(statusMatch[1]) >= 400 ? "medium"
                  : "info";

        findings.push({
          vulnerability: `Endpoint Discovery: ${urls[0]}`,
          severity: sev,
          confidence: "medium",
          evidence: { request: "", response: line, raw: line },
          source_tool: toolName,
          timestamp,
          endpoint: urls[0],
          cve_ids: [],
          cwe_ids: [],
          template_id: null,
          type: "endpoint_discovery",
          description: `Tool ${toolName} discovered endpoint ${urls[0]}. Further investigation recommended.`,
          remediation: "Review endpoint for sensitive functionality or data exposure.",
          classification: "pending",
        });
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return findings.filter((f) => {
      const key = f.vulnerability + f.endpoint;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Standardize a complete scan result into an array of standardized findings.
   */
  standardizeScan(toolResults: ToolResult[], scanId: number, target: string): StandardizedFinding[] {
    const all: StandardizedFinding[] = [];

    for (const result of toolResults) {
      const standardized = this.standardizeFindings(result, scanId, target);
      all.push(...standardized);
    }

    // Final deduplication across all tools
    const seen = new Map<string, StandardizedFinding>();
    for (const finding of all) {
      const key = `${finding.vulnerability}::${finding.endpoint}`.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, finding);
      } else {
        // Merge: keep higher severity, merge CVE IDs
        const existing = seen.get(key)!;
        if (this.severityWeight(finding.severity) > this.severityWeight(existing.severity)) {
          existing.severity = finding.severity;
        }
        existing.cve_ids = [...new Set([...existing.cve_ids, ...finding.cve_ids])];
        existing.source_tool = `${existing.source_tool},${finding.source_tool}`;
      }
    }

    const unique = Array.from(seen.values());

    logger.info({
      inputFindings: all.length,
      uniqueFindings: unique.length,
      dedupCount: all.length - unique.length,
    }, "[STANDARDIZER] Scan standardization complete");

    return unique;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private mapConfidence(severity: string, cveCount: number): string {
    if (cveCount > 0) return "high";
    if (severity === "critical" || severity === "high") return "medium";
    return "low";
  }

  private detectFindingType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();
    if (/xss|cross[-\s]site[-\s]script/i.test(text)) return "xss";
    if (/sql[-\s]inject|sqli/i.test(text)) return "sql_injection";
    if (/ssrf|server[-\s]side[-\s]request/i.test(text)) return "ssrf";
    if (/rce|remote[-\s]code|command[-\s]inject/i.test(text)) return "rce";
    if (/lfi|file[-\s]inclusion|path[-\s]traversal/i.test(text)) return "file_inclusion";
    if (/open[-\s]redirect/i.test(text)) return "open_redirect";
    if (/csrf|cross[-\s]site[-\s]request/i.test(text)) return "csrf";
    if (/\.env|expos|leak|secret|credential/i.test(text)) return "sensitive_data_exposure";
    if (/open[-\s]port|port[-\s]\d+/i.test(text)) return "open_port";
    if (/cors|cross[-\s]origin/i.test(text)) return "cors";
    if (/ssl|tls|certificate/i.test(text)) return "ssl_tls";
    if (/subdomain|dns[-\s]enum/i.test(text)) return "subdomain";
    if (/header[-\s]missing|security[-\s]header/i.test(text)) return "missing_header";
    if (/cve[-\s]\d{4}[-\s]\d{4,}/i.test(text)) return "cve";
    return "general";
  }

  private extractRequestFromEvidence(evidence: string, url: string): string {
    // Try to find HTTP request in the evidence text
    const requestPatterns = [
      /(?:curl|wget)\s+['\"]([^'\"]+)['\"]/i,
      /Request:\s*([^\n]+)/i,
      /GET\s+\/[^\s]*\s+HTTP/i,
      /POST\s+\/[^\s]*\s+HTTP/i,
    ];

    for (const pattern of requestPatterns) {
      const match = evidence.match(pattern);
      if (match) return match[0];
    }

    return `GET ${url} HTTP/1.1`;
  }

  private severityWeight(severity: string): number {
    const weights: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2, info: 0 };
    return weights[severity.toLowerCase()] ?? 1;
  }
}

export const outputStandardizer = new OutputStandardizer();
