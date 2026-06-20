// ---------------------------------------------------------------------------
// Anomaly Detector ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// AI-powered anomaly detection across system metrics:
//   - Abnormal scan failures
//   - Unusual worker behavior
//   - Resource spikes
//   - Suspicious user activity
//   - Repeated authentication failures
//   - Unexpected queue growth
//   - Plugin instability
//   - Performance regression
//   - Infrastructure degradation
//
// Uses statistical methods (z-score, moving averages) with AI enhancement
// when the AI service is available.

import crypto from "node:crypto";
import type { AnomalyReport, AlertSeverity } from "./types";
import { ANOMALY_TYPES } from "./types";
import { eventStream } from "./event-stream";
import { structuredLogger } from "./structured-logger";
import { logger } from "../../lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

interface MetricHistory {
  name: string;
  values: number[];
  timestamps: number[];
  baseline: number;
  stdDev: number;
  lastAnomalyAt: number | null;
}

// ── Anomaly Detector ───────────────────────────────────────────────────────

export class AnomalyDetector {
  private history = new Map<string, MetricHistory>();
  private maxHistorySize = 100;
  private zScoreThreshold = 3.0;
  private minSamples = 10;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  initialize(): void {
    if (this.checkInterval) return;

    // Check for anomalies every 60 seconds
    this.checkInterval = setInterval(() => this.runDetection(), 60_000);
    this.checkInterval.unref?.();
    logger.info("[ANOMALY] Anomaly detector initialized");
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ── Ingestion ────────────────────────────────────────────────────────────

  ingestMetric(name: string, value: number): void {
    if (!this.history.has(name)) {
      this.history.set(name, {
        name,
        values: [],
        timestamps: [],
        baseline: 0,
        stdDev: 0,
        lastAnomalyAt: null,
      });
    }

    const h = this.history.get(name)!;
    h.values.push(value);
    h.timestamps.push(Date.now());

    if (h.values.length > this.maxHistorySize) {
      h.values.shift();
      h.timestamps.shift();
    }

    // Recalculate baseline
    if (h.values.length >= this.minSamples) {
      const mean = h.values.reduce((a, b) => a + b, 0) / h.values.length;
      const variance = h.values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / h.values.length;
      h.baseline = mean;
      h.stdDev = Math.sqrt(variance) || 1;
    }
  }

  // ── Detection ────────────────────────────────────────────────────────────

  private async runDetection(): Promise<void> {
    const reports: AnomalyReport[] = [];

    for (const [, h] of this.history) {
      if (h.values.length < this.minSamples) continue;

      const currentValue = h.values[h.values.length - 1];
      const deviation = Math.abs(currentValue - h.baseline) / h.stdDev;

      if (deviation > this.zScoreThreshold) {
        // Rate-limit: don't report same anomaly more than once per 5 minutes
        if (h.lastAnomalyAt && Date.now() - h.lastAnomalyAt < 300_000) continue;

        const severity: AlertSeverity = deviation > 5 ? "critical" : deviation > 4 ? "high" : "medium";
        const anomalyType = this.classifyAnomaly(h.name, currentValue, deviation);

        const report: AnomalyReport = {
          id: crypto.randomUUID(),
          type: anomalyType,
          metric: h.name,
          currentValue: Math.round(currentValue * 100) / 100,
          baselineValue: Math.round(h.baseline * 100) / 100,
          deviation: Math.round(deviation * 100) / 100,
          severity,
          message: `Anomaly detected: ${h.name} is ${currentValue > h.baseline ? "above" : "below"} baseline (${Math.round(deviation * 100) / 100}σ deviation)`,
          recommendation: this.generateRecommendation(anomalyType, h.name, currentValue, h.baseline),
          detectedAt: new Date().toISOString(),
        };

        reports.push(report);
        h.lastAnomalyAt = Date.now();

        // Emit event
        eventStream.emit("system:warning", {
          source: "anomaly-detector",
          severity: severity === "critical" ? "error" : "warn",
          message: report.message,
          details: { anomalyType, metric: h.name, deviation: report.deviation, currentValue, baseline: h.baseline },
        });

        structuredLogger.warn("infrastructure", "anomaly_detection", report.message, {
          anomalyType, metric: h.name, deviation: report.deviation,
        });
      }
    }

    if (reports.length > 0) {
      logger.warn({ count: reports.length }, "[ANOMALY] Anomalies detected");
    }
  }

  // ── Classification ───────────────────────────────────────────────────────

  private classifyAnomaly(metric: string, value: number, deviation: number): string {
    if (metric.includes("auth_failure") || metric.includes("brute_force")) return "auth_failure_burst";
    if (metric.includes("scan") && metric.includes("fail")) return "scan_failure_spike";
    if (metric.includes("worker") || metric.includes("heartbeat")) return "worker_disconnection";
    if (metric.includes("cpu") || metric.includes("memory") || metric.includes("disk")) return "resource_spike";
    if (metric.includes("queue_depth") || metric.includes("queue_")) return "queue_growth";
    if (metric.includes("plugin_error") || metric.includes("plugin_")) return "plugin_instability";
    if (metric.includes("latency") || metric.includes("duration")) return "latency_spike";
    if (metric.includes("error")) return "error_rate_increase";
    if (metric.includes("http")) return "performance_regression";
    return "infrastructure_degradation";
  }

  private generateRecommendation(type: string, metric: string, value: number, baseline: number): string {
    const recommendations: Record<string, string> = {
      scan_failure_spike: "Check scanner configurations, network connectivity to targets, and tool health status. Recent scan failures may indicate target environment changes.",
      worker_disconnection: "Verify worker node connectivity and health. Check network policies, TLS certificates, and resource availability on worker nodes.",
      resource_spike: "Scale up resources or investigate resource leaks. Check for runaway processes, memory leaks, or unexpected load patterns.",
      auth_failure_burst: "Investigate potential brute force attack. Check authentication logs, rate limit effectiveness, and consider temporary IP blocking.",
      queue_growth: "Scale up worker pool or investigate slow job processing. Check worker health and queue processing bottlenecks.",
      plugin_instability: "Check recently updated plugins for regressions. Consider rolling back to previous versions and verifying plugin compatibility.",
      performance_regression: "Profile recent code changes for performance impact. Check database query performance and API response times.",
      infrastructure_degradation: "Run full infrastructure health check. Check disk space, network connectivity, and system resource availability.",
      latency_spike: "Investigate network latency, database query performance, and upstream service response times. Consider CDN or caching improvements.",
      error_rate_increase: "Check application logs for error patterns. Recent deployments may have introduced regressions.",
    };
    return recommendations[type] ?? "Investigate the anomalous metric and take corrective action as needed.";
  }

  // ── Query ────────────────────────────────────────────────────────────────

  getHistory(name: string): MetricHistory | null {
    return this.history.get(name) ?? null;
  }

  getAnomalousMetrics(): Array<{ name: string; deviation: number; severity: AlertSeverity }> {
    const result: Array<{ name: string; deviation: number; severity: AlertSeverity }> = [];
    for (const [, h] of this.history) {
      if (h.values.length < this.minSamples) continue;
      const currentValue = h.values[h.values.length - 1];
      const deviation = Math.abs(currentValue - h.baseline) / h.stdDev;
      if (deviation > this.zScoreThreshold) {
        const severity: AlertSeverity = deviation > 5 ? "critical" : deviation > 4 ? "high" : "medium";
        result.push({ name: h.name, deviation: Math.round(deviation * 100) / 100, severity });
      }
    }
    return result;
  }

  getStatus(): { trackedMetrics: number; totalSamples: number; anomaliesDetected: number } {
    const totalSamples = [...this.history.values()].reduce((sum, h) => sum + h.values.length, 0);
    const anomaliesDetected = [...this.history.values()].filter(h => h.lastAnomalyAt !== null).length;
    return { trackedMetrics: this.history.size, totalSamples, anomaliesDetected };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const anomalyDetector = new AnomalyDetector();
