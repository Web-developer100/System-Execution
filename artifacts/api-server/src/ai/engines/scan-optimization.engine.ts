// ---------------------------------------------------------------------------
// AI Scan Optimization Engine
// ---------------------------------------------------------------------------
//
// Optimizes scanning by:
//   - Selecting best tools per target
//   - Removing redundant tools
//   - Prioritizing high-value endpoints
//   - Reducing scan noise
//   - Improving scan speed
//   - Avoiding WAF detection (for authorized testing only)

import { logger } from "../../lib/logger";
import type {
  ScanOptimizationInput,
  ScanOptimizationResult,
  ToolOptimizationMetadata,
} from "../types";

export class ScanOptimizationEngine {
  constructor() {
    logger.info("[OPTIMIZATION] Scan Optimization Engine initialized");
  }

  optimize(input: ScanOptimizationInput): ScanOptimizationResult {
    const { target, requestedTools, toolMetadata, scanHistory } = input;
    const startTime = Date.now();

    // ── Step 1: Score and rank tools ─────────────────────────────────────

    const scored = this.scoreTools(requestedTools, toolMetadata, scanHistory);
    const removedTools: string[] = [];

    // ── Step 2: Remove redundant/redundant tools ─────────────────────────

    const recommended = this.eliminateRedundancy(scored, removedTools);

    // ── Step 3: Determine parallel execution groups ──────────────────────

    const parallelGroups = this.determineParallelGroups(recommended, toolMetadata);

    // ── Step 4: Prioritize endpoints ─────────────────────────────────────

    const prioritizedEndpoints = this.prioritizeEndpoints(target);

    // ── Step 5: Estimate duration ────────────────────────────────────────

    const estimatedDurationMs = this.estimateDuration(recommended, toolMetadata);

    // ── Step 6: WAF avoidance strategies ─────────────────────────────────

    const wafAvoidance = this.generateWafAvoidance(target);

    const optimizationRationale = this.buildRationale(
      requestedTools,
      recommended,
      removedTools,
      scored,
    );

    const durationMs = Date.now() - startTime;

    logger.info({
      input: requestedTools.length,
      recommended: recommended.length,
      removed: removedTools.length,
      estimatedDurationMs,
      durationMs,
    }, "[OPTIMIZATION] Scan optimization complete");

    return {
      recommendedTools: recommended,
      removedTools,
      prioritizedEndpoints,
      estimatedDurationMs,
      optimizationRationale,
      toolsToRunInParallel: parallelGroups,
      wafAvoidanceStrategies: wafAvoidance,
    };
  }

  // ── Tool Scoring ────────────────────────────────────────────────────────

  private scoreTools(
    requested: string[],
    metadata: ToolOptimizationMetadata[],
    history: ScanOptimizationInput["scanHistory"],
  ): Array<{ name: string; score: number; metadata: ToolOptimizationMetadata | null }> {
    return requested.map((name) => {
      const meta = metadata.find((m) => m.name === name) ?? null;
      const hist = history.filter((h) => h.toolName === name);

      let score = 50; // base score

      if (meta) {
        score += meta.averageAccuracy * 0.4;
        score -= meta.falsePositiveRate * 0.3;
        score -= meta.redundancyScore * 0.2;
        score += (meta.healthScore || 100) * 0.1;
      }

      // Historical performance
      if (hist.length > 0) {
        const avgFindings = hist.reduce((s, h) => s + h.findingsCount, 0) / hist.length;
        const avgFp = hist.reduce((s, h) => s + h.falsePositiveCount, 0) / hist.length;
        score += avgFindings * 0.5;
        score -= avgFp * 0.8;
      }

      return { name, score: Math.max(0, score), metadata: meta };
    });
  }

  // ── Redundancy Elimination ─────────────────────────────────────────────

  private eliminateRedundancy(
    scored: Array<{ name: string; score: number; metadata: ToolOptimizationMetadata | null }>,
    removedTools: string[],
  ): string[] {
    // Sort by score descending
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const selected: string[] = [];
    const coveredCapabilities = new Set<string>();

    for (const tool of sorted) {
      if (selected.length >= 10) {
        removedTools.push(tool.name);
        continue;
      }

      // Check if this tool provides capabilities not yet covered
      if (tool.metadata) {
        const newCaps = tool.metadata.capabilities.filter((c) => !coveredCapabilities.has(c));
        if (newCaps.length === 0 && selected.length >= 3) {
          // This tool is redundant — capabilities already covered
          removedTools.push(tool.name);
          continue;
        }
        for (const cap of newCaps) coveredCapabilities.add(cap);
      }

      selected.push(tool.name);
    }

    return selected;
  }

  // ── Parallel Grouping ──────────────────────────────────────────────────

  private determineParallelGroups(
    tools: string[],
    metadata: ToolOptimizationMetadata[],
  ): string[][] {
    if (tools.length <= 1) return [tools];

    const groups: string[][] = [];
    const currentGroup: string[] = [];

    for (const tool of tools) {
      const meta = metadata.find((m) => m.name === tool);

      // Tools with network scanning should run sequentially to avoid
      // overwhelming the target
      if (
        meta?.category === "fuzzer" ||
        meta?.category === "scanner" ||
        meta?.name.toLowerCase().includes("nuclei") ||
        meta?.name.toLowerCase().includes("ffuf")
      ) {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup.length = 0;
        }
        groups.push([tool]);
      } else {
        currentGroup.push(tool);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  // ── Endpoint Prioritization ────────────────────────────────────────────

  private prioritizeEndpoints(target: string): string[] {
    const endpoints: string[] = [];

    try {
      const baseUrl = target.startsWith("http") ? target : `https://${target}`;
      const parsed = new URL(baseUrl);

      // Priority 1: Authentication endpoints
      endpoints.push(`${parsed.origin}/login`);
      endpoints.push(`${parsed.origin}/api/auth`);

      // Priority 2: Admin interfaces
      endpoints.push(`${parsed.origin}/admin`);
      endpoints.push(`${parsed.origin}/api/admin`);

      // Priority 3: File paths
      endpoints.push(`${parsed.origin}/.env`);
      endpoints.push(`${parsed.origin}/.git/config`);

      // Priority 4: Common API routes
      endpoints.push(`${parsed.origin}/api/v1`);
      endpoints.push(`${parsed.origin}/api/users`);
      endpoints.push(`${parsed.origin}/api/data`);
    } catch {
      endpoints.push(`${target}/login`);
      endpoints.push(`${target}/admin`);
      endpoints.push(`${target}/api`);
    }

    return endpoints;
  }

  // ── Duration Estimation ─────────────────────────────────────────────────

  private estimateDuration(
    tools: string[],
    metadata: ToolOptimizationMetadata[],
  ): number {
    let total = 0;

    for (const tool of tools) {
      const meta = metadata.find((m) => m.name === tool);
      total += meta?.averageDurationMs ?? 60_000; // default 1 min
    }

    // Parallel execution reduces total time by ~40%
    return Math.round(total * 0.6);
  }

  // ── WAF Avoidance Strategies ───────────────────────────────────────────

  private generateWafAvoidance(target: string): string[] {
    const strategies: string[] = [
      "Use random delay between requests (100-500ms jitter)",
      "Rotrate User-Agent headers between requests",
    ];

    // Customize based on target
    if (target.includes("cloudflare") || target.includes("cloudfront")) {
      strategies.push("Use residential proxy pool for Cloudflare-protected targets");
      strategies.push("Set cache-busting query parameters (?t=timestamp)");
    }

    strategies.push("Send requests in lowercase (case-folding bypass)");
    strategies.push("Use HTTP/1.0 instead of HTTP/1.1 or HTTP/2");
    strategies.push("Split payloads across multiple request headers");
    strategies.push("Use Unicode/UTF-8 encoded payloads");

    return strategies;
  }

  // ── Rationale Builder ──────────────────────────────────────────────────

  private buildRationale(
    requested: string[],
    recommended: string[],
    removed: string[],
    scored: Array<{ name: string; score: number }>,
  ): string {
    const parts: string[] = [];

    parts.push(`Optimization Input: ${requested.length} tool(s) requested.`);

    if (removed.length > 0) {
      parts.push(`Tools Removed (${removed.length}): ${removed.join(", ")}.`);
      for (const tool of removed) {
        const s = scored.find((sc) => sc.name === tool);
        if (s) {
          parts.push(`  - ${tool}: Score ${Math.round(s.score)}. Redundant capabilities or poor historical performance.`);
        }
      }
    }

    parts.push(`Tools Recommended (${recommended.length}): ${recommended.join(", ")}.`);
    parts.push(`Estimated Duration: ~${this.formatDuration(this.estimateDuration(recommended, []))}.`);

    return parts.join("\n");
  }

  private formatDuration(ms: number): string {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }
}
