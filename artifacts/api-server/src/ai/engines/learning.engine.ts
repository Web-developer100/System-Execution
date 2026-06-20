// ---------------------------------------------------------------------------
// AI Learning Engine
// ---------------------------------------------------------------------------
//
// Learns from past scans:
//   - Which tools are most accurate
//   - Which tools produce noise
//   - Which vulnerabilities are frequently false positives
//   - Which scan paths are most effective
//
// AI improves future scan pipelines automatically.

import { logger } from "../../lib/logger";
import type { LearningEngineSnapshot } from "../types";

interface ScanRecord {
  scanId: number;
  confirmedFindings: number;
  falsePositives: number;
  totalFindings: number;
  durationMs: number;
  toolsUsed: string[];
}

interface ToolStats {
  totalScans: number;
  totalFindings: number;
  totalConfirmed: number;
  totalFalsePositives: number;
  totalDurationMs: number;
  accuracySum: number;
}

export class LearningEngine {
  private scans: ScanRecord[] = [];
  private toolStats = new Map<string, ToolStats>();
  private fpPatterns = new Map<string, number>();

  constructor() {
    logger.info("[LEARNING] AI Learning Engine initialized");
  }

  recordScan(scan: ScanRecord): void {
    this.scans.push(scan);

    // Update per-tool statistics
    for (const tool of scan.toolsUsed) {
      const stats = this.toolStats.get(tool) ?? {
        totalScans: 0,
        totalFindings: 0,
        totalConfirmed: 0,
        totalFalsePositives: 0,
        totalDurationMs: 0,
        accuracySum: 0,
      };

      stats.totalScans++;
      stats.totalFindings += scan.totalFindings;
      stats.totalConfirmed += scan.confirmedFindings;
      stats.totalFalsePositives += scan.falsePositives;
      stats.totalDurationMs += scan.durationMs;

      if (scan.totalFindings > 0) {
        stats.accuracySum += scan.confirmedFindings / scan.totalFindings;
      }

      this.toolStats.set(tool, stats);
    }

    // Keep scan history bounded
    if (this.scans.length > 1000) {
      this.scans.shift();
    }

    logger.debug({
      scanId: scan.scanId,
      findings: scan.totalFindings,
      confirmed: scan.confirmedFindings,
      fp: scan.falsePositives,
      totalScansLearned: this.scans.length,
    }, "[LEARNING] Scan recorded");
  }

  getToolAccuracy(toolName: string): number {
    const stats = this.toolStats.get(toolName);
    if (!stats || stats.totalScans === 0) return 50; // default
    return Math.round((stats.accuracySum / stats.totalScans) * 100);
  }

  getToolNoiseLevel(toolName: string): number {
    const stats = this.toolStats.get(toolName);
    if (!stats || stats.totalFindings === 0) return 50;
    return Math.round((stats.totalFalsePositives / stats.totalFindings) * 100);
  }

  getToolRecommendations(): string[] {
    const recommendations: string[] = [];

    for (const [tool, stats] of this.toolStats) {
      if (stats.totalScans >= 3) {
        const accuracy = (stats.accuracySum / stats.totalScans) * 100;
        const fpRate = stats.totalFindings > 0
          ? (stats.totalFalsePositives / stats.totalFindings) * 100
          : 0;

        if (accuracy >= 80 && fpRate <= 10) {
          recommendations.push(`${tool}: High accuracy (${Math.round(accuracy)}%), low FP (${Math.round(fpRate)}%)`);
        } else if (fpRate >= 50) {
          recommendations.push(`${tool}: High false positive rate (${Math.round(fpRate)}%) — use with caution`);
        }
      }
    }

    return recommendations;
  }

  getEffectiveScanPaths(): Array<{ tools: string[]; successRate: number }> {
    // Analyze which tool combinations produce the best results
    const pathStats = new Map<string, { count: number; confirmed: number }>();

    for (const scan of this.scans) {
      if (scan.toolsUsed.length === 0) continue;
      const key = [...scan.toolsUsed].sort().join(",");
      const stat = pathStats.get(key) ?? { count: 0, confirmed: 0 };
      stat.count++;
      stat.confirmed += scan.confirmedFindings;
      pathStats.set(key, stat);
    }

    const paths = Array.from(pathStats.entries())
      .map(([key, stat]) => ({
        tools: key.split(","),
        successRate: stat.count > 0
          ? Math.round((stat.confirmed / Math.max(1, stat.count)) * 100)
          : 0,
      }))
      .filter((p) => p.successRate > 0)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);

    return paths;
  }

  getTopFalsePositivePatterns(): Array<{ pattern: string; count: number }> {
    return Array.from(this.fpPatterns.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  getSnapshot(): LearningEngineSnapshot {
    const toolAccuracyRanking = Array.from(this.toolStats.entries())
      .map(([toolName, stats]) => ({
        toolName,
        accuracy: stats.totalScans > 0
          ? Math.round((stats.accuracySum / stats.totalScans) * 100)
          : 0,
      }))
      .sort((a, b) => b.accuracy - a.accuracy);

    const toolNoiseRanking = Array.from(this.toolStats.entries())
      .map(([toolName, stats]) => ({
        toolName,
        fpRate: stats.totalFindings > 0
          ? Math.round((stats.totalFalsePositives / stats.totalFindings) * 100)
          : 0,
      }))
      .sort((a, b) => b.fpRate - a.fpRate);

    const effectiveScanPaths = this.getEffectiveScanPaths();
    const topFpPatterns = this.getTopFalsePositivePatterns();
    const recommendations = this.getToolRecommendations();

    recommendations.push(
      `Analyzed ${this.scans.length} scan(s) across ${this.toolStats.size} tool(s)`,
    );

    if (toolAccuracyRanking.length > 0) {
      const best = toolAccuracyRanking[0];
      recommendations.push(`Best performing tool: ${best.toolName} (${best.accuracy}% accuracy)`);
    }

    if (toolNoiseRanking.length > 0 && toolNoiseRanking[0].fpRate > 40) {
      const noisiest = toolNoiseRanking[0];
      recommendations.push(`${noisiest.toolName} has high FP rate (${noisiest.fpRate}%) — verify findings carefully`);
    }

    return {
      totalScansAnalyzed: this.scans.length,
      toolAccuracyRanking,
      toolNoiseRanking,
      topFalsePositivePatterns: topFpPatterns,
      effectiveScanPaths,
      recommendations,
    };
  }
}
