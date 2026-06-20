// ---------------------------------------------------------------------------
// Result Correlation Engine
// ---------------------------------------------------------------------------
//
// Core Responsibilities:
//   1. Merge duplicate findings from multiple tools
//   2. Detect overlapping vulnerabilities
//   3. Normalize results into unified format
//   4. Correlate multi-tool evidence
//   5. Build a single "truth model" of vulnerabilities
//
// Rules:
//   - Findings with the same URL + vulnerability type are merged
//   - CVEs are cross-referenced across tools
//   - The highest severity among duplicates is used
//   - Evidence from multiple tools is consolidated
//   - A confidence score is calculated based on tool agreement

import { logger } from "../../lib/logger";
import type {
  CorrelationInput,
  CorrelationResult,
  MergedFinding,
  CorrelationStats,
  CorrelatedFinding,
  IntelligenceEngineConfig,
} from "../types";

// ── Similarity Thresholds ──────────────────────────────────────────────────

const URL_MATCH_THRESHOLD = 0.95;
const TITLE_SIMILARITY_THRESHOLD = 0.7;
const CVE_OVERLAP_MIN = 1;

export class CorrelationEngine {
  private config: IntelligenceEngineConfig;

  constructor(config: IntelligenceEngineConfig) {
    this.config = config;
    logger.info("[CORRELATION] Result Correlation Engine initialized");
  }

  async analyze(input: CorrelationInput): Promise<CorrelationResult> {
    const { scanId, findings } = input;
    const startTime = Date.now();

    if (findings.length === 0) {
      return {
        mergedFindings: [],
        mergedAway: [],
        stats: {
          totalInput: 0,
          totalMerged: 0,
          uniqueFindings: 0,
          deduplicationRatio: 0,
          averageToolsPerFinding: 0,
        },
      };
    }

    // Step 1: Normalize all findings to a standard format
    const normalized = findings.map((f, idx) => ({
      ...f,
      _index: idx,
      _normalizedUrl: this.normalizeUrl(f.url),
      _vulnType: this.detectVulnerabilityType(f.title, f.description ?? ""),
      _key: "",
    }));

    // Assign correlation keys
    for (const f of normalized) {
      f._key = this.buildCorrelationKey(f);
    }

    // Step 2: Group by correlation key
    const groups = new Map<string, CorrelatedFinding[]>();
    for (const f of normalized) {
      const key = f._key;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }

    // Step 3: Merge each group into a single finding
    const mergedFindings: MergedFinding[] = [];
    const mergedAway: number[] = [];

    for (const [, group] of groups) {
      if (group.length === 0) continue;

      // Sort by severity (highest first) for picking the canonical finding
      group.sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity));

      const canonical = group[0];
      const tools = [...new Set(group.map((f) => f.toolName))];
      const allCves = [...new Set(group.flatMap((f) => f.cveIds))];
      const allCwes = [...new Set(group.flatMap((f) => f.cweIds))];
      const allIds = group.map((f) => f._index).filter((id): id is number => id !== undefined);

      // Mark non-canonical findings as merged away
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          const idx = group[i]._index;
          if (idx !== undefined) mergedAway.push(idx);
        }
      }

      // Build consolidated evidence
      const consolidatedEvidence = this.consolidateEvidence(group);

      // Build merged description
      const description = this.buildMergedDescription(canonical, group);

      // Calculate confidence based on tool agreement
      const confidence = this.calculateConfidence(group, allCves.length);

      mergedFindings.push({
        sourceFindingIds: allIds,
        sourceTools: tools,
        title: canonical.title,
        severity: canonical.severity,
        url: canonical.url,
        description,
        evidence: consolidatedEvidence ?? "",
        cveIds: allCves,
        cweIds: allCwes,
        toolCount: tools.length,
        confidence,
      });
    }

    // Step 4: Build final statistics
    const stats: CorrelationStats = {
      totalInput: findings.length,
      totalMerged: mergedAway.length,
      uniqueFindings: mergedFindings.length,
      deduplicationRatio: findings.length > 0
        ? Math.round((1 - mergedFindings.length / findings.length) * 100)
        : 0,
      averageToolsPerFinding: mergedFindings.length > 0
        ? Math.round(mergedFindings.reduce((sum, f) => sum + f.toolCount, 0) / mergedFindings.length)
        : 0,
    };

    const durationMs = Date.now() - startTime;

    logger.info({
      scanId,
      input: stats.totalInput,
      merged: stats.totalMerged,
      unique: stats.uniqueFindings,
      dedupRatio: `${stats.deduplicationRatio}%`,
      avgTools: stats.averageToolsPerFinding,
      durationMs,
    }, "[CORRELATION] Correlation complete");

    return { mergedFindings, mergedAway, stats };
  }

  // ── Correlation Key Builder ─────────────────────────────────────────────

  private buildCorrelationKey(finding: CorrelatedFinding): string {
    // Key = normalized URL + vulnerability type
    // This groups findings targeting the same endpoint with the same vuln type
    const url = finding._normalizedUrl ?? this.normalizeUrl(finding.url);
    const vulnType = finding._vulnType;

    // If CVEs are present, also use them as a correlation key
    if (finding.cveIds.length > 0) {
      const sortedCves = [...finding.cveIds].sort().join("|");
      return `cve:${sortedCves}`;
    }

    return `${url}::${vulnType}`;
  }

  // ── URL Normalization ────────────────────────────────────────────────────

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Normalize: lowercase, remove trailing slash, sort query params
      const path = parsed.pathname.replace(/\/$/, "").toLowerCase();
      const sortedParams = new URLSearchParams(parsed.searchParams);
      sortedParams.sort();
      const queryStr = sortedParams.toString();
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${queryStr ? `?${queryStr}` : ""}`;
    } catch {
      return url.toLowerCase().replace(/\/$/, "");
    }
  }

  // ── Vulnerability Type Detection ─────────────────────────────────────────

  private detectVulnerabilityType(title: string, description: string): string {
    const text = `${title} ${description}`.toLowerCase();

    const patterns: Array<{ type: string; pattern: RegExp }> = [
      { type: "xss", pattern: /xss|cross[-\s]site[-\s]script/i },
      { type: "sql_injection", pattern: /sql[-\s]inject|sqli/i },
      { type: "ssrf", pattern: /ssrf|server[-\s]side[-\s]request[-\s]forgery/i },
      { type: "rce", pattern: /rce|remote[-\s]code[-\s]exec|command[-\s]inject/i },
      { type: "lfi", pattern: /lfi|file[-\s]inclusion|path[-\s]traversal/i },
      { type: "open_redirect", pattern: /open[-\s]redirect|url[-\s]redirect/i },
      { type: "csrf", pattern: /csrf|cross[-\s]site[-\s]request[-\s]forgery/i },
      { type: "sensitive_data", pattern: /sensitive[-\s]data|exposure|leak|\.env|secret/i },
      { type: "open_port", pattern: /open[-\s]port|port[-\s]scan/i },
      { type: "cors", pattern: /cors[-\s]misconfig/i },
      { type: "ssl_tls", pattern: /ssl|tls|certificate/i },
      { type: "header", pattern: /header[-\s]missing|security[-\s]header/i },
      { type: "info_disclosure", pattern: /information[-\s]disclosure|banner[-\s]grab/i },
      { type: "auth_bypass", pattern: /auth[-\s]bypass|authentication[-\s]bypass/i },
      { type: "subdomain", pattern: /subdomain|dns[-\s]enum/i },
    ];

    for (const { type, pattern } of patterns) {
      if (pattern.test(text)) return type;
    }

    return "general";
  }

  // ── Evidence Consolidation ──────────────────────────────────────────────

  private consolidateEvidence(group: CorrelatedFinding[]): string {
    const evidenceParts: string[] = [];

    for (const f of group) {
      if (f.evidence && f.evidence.trim().length > 0) {
        const prefix = group.length > 1 ? `[Tool: ${f.toolName}]\n` : "";
        evidenceParts.push(`${prefix}${(f.evidence ?? "").trim()}`);
      }
    }

    return evidenceParts.length > 0 ? evidenceParts.join("\n\n---\n\n") : (group[0]?.evidence ?? "");
  }

  private buildMergedDescription(canonical: CorrelatedFinding, group: CorrelatedFinding[]): string {
    if (group.length === 1) {
      return canonical.description ?? "";
    }

    const parts: string[] = [];
    if (canonical.description) {
      parts.push(canonical.description);
    }

    // Add cross-tool confirmation note
    const tools = [...new Set(group.map((f) => f.toolName))];
    parts.push(`\n[CORRELATION] This finding was confirmed by ${tools.length} tool(s): ${tools.join(", ")}.`);
    parts.push(`[CORRELATION] CVEs identified: ${[...new Set(group.flatMap((f) => f.cveIds))].join(", ") || "none"}.`);

    // Add supplementary descriptions from other tools if different
    const uniqueDescriptions = new Set<string>();
    for (const f of group) {
      if (f.description && !uniqueDescriptions.has(f.description)) {
        uniqueDescriptions.add(f.description);
        if (f.description !== canonical.description) {
          parts.push(`\n[${f.toolName}]: ${f.description}`);
        }
      }
    }

    return parts.join("\n");
  }

  // ── Confidence Calculation ──────────────────────────────────────────────

  private calculateConfidence(group: CorrelatedFinding[], cveCount: number): number {
    let confidence = 0;

    // Base confidence from tool count (more tools = more confidence)
    const toolCount = group.length;
    confidence += Math.min(toolCount * 15, 50); // up to 50 points

    // CVE presence is strong evidence
    if (cveCount > 0) {
      confidence += Math.min(cveCount * 10, 20); // up to 20 points
    }

    // Severity bonus
    const maxSeverity = Math.max(...group.map((f) => this.severityWeight(f.severity)));
    if (maxSeverity >= 8) confidence += 15;
    else if (maxSeverity >= 5) confidence += 10;

    // Evidence quality
    const hasConcreteEvidence = group.some(
      (f) => (f.evidence?.length ?? 0) > 100,
    );
    if (hasConcreteEvidence) confidence += 15;

    return Math.min(confidence, 100);
  }

  // ── Severity Weight ──────────────────────────────────────────────────────

  private severityWeight(severity: string): number {
    const weights: Record<string, number> = {
      critical: 10,
      high: 8,
      medium: 5,
      low: 2,
      info: 0,
    };
    return weights[severity.toLowerCase()] ?? 1;
  }
}
