// ---------------------------------------------------------------------------
// Metrics Collector ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Collects Prometheus-compatible metrics across all system components:
//   - Infrastructure: CPU, memory, disk, network, GPU, containers, cluster
//   - Application: req/s, latency (avg/p95/p99), error rate, auth, queue, plugins
//   - Security: vulnerability counts, risk scores, false positives, blocked requests
//   - Worker: utilization, task completion/failure, plugin runtime
//   - Queue: depth, processing time, retry count, dead letter count
//   - AI: processing time, cache hit rate, request count, error rate
//   - Database: query count, avg query time, connection count, pool utilization
//
// All metrics are exposed as a single Prometheus text endpoint.

import { METRIC_PREFIX } from "./types";
import { logger } from "../../lib/logger";

// ── Metric Store ───────────────────────────────────────────────────────────

interface MetricBucket {
  value: number;
  labels?: Record<string, string>;
}

interface MetricStoreEntry {
  help: string;
  type: "gauge" | "counter" | "histogram" | "summary";
  buckets: MetricBucket[];
}

class MetricStore {
  private store = new Map<string, MetricStoreEntry>();
  private histograms = new Map<string, Map<string, number[]>>();

  register(name: string, help: string, type: "gauge" | "counter" | "histogram" | "summary"): void {
    const fullName = name.startsWith(METRIC_PREFIX) ? name : `${METRIC_PREFIX}${name}`;
    if (!this.store.has(fullName)) {
      this.store.set(fullName, { help, type, buckets: [] });
    }
  }

  set(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = name.startsWith(METRIC_PREFIX) ? name : `${METRIC_PREFIX}${name}`;
    if (!this.store.has(fullName)) {
      this.store.set(fullName, { help: "", type: "gauge", buckets: [] });
    }
    const entry = this.store.get(fullName)!;
    entry.type = "gauge";
    entry.buckets = entry.buckets.filter(b => !labelMatch(b.labels, labels));
    entry.buckets.push({ value, labels });
  }

  inc(name: string, by = 1, labels?: Record<string, string>): void {
    const fullName = name.startsWith(METRIC_PREFIX) ? name : `${METRIC_PREFIX}${name}`;
    if (!this.store.has(fullName)) {
      this.store.set(fullName, { help: "", type: "counter", buckets: [] });
    }
    const entry = this.store.get(fullName)!;
    entry.type = "counter";
    const existing = entry.buckets.find(b => labelMatch(b.labels, labels));
    if (existing) {
      existing.value += by;
    } else {
      entry.buckets.push({ value: by, labels });
    }
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = name.startsWith(METRIC_PREFIX) ? name : `${METRIC_PREFIX}${name}`;
    if (!this.store.has(fullName)) {
      this.store.set(fullName, { help: "", type: "histogram", buckets: [] });
    }
    const entry = this.store.get(fullName)!;
    entry.type = "histogram";
    entry.buckets.push({ value, labels });

    // Also track histogram buckets
    if (!this.histograms.has(fullName)) {
      this.histograms.set(fullName, new Map());
    }
    const labelKey = labels ? JSON.stringify(labels) : "__default__";
    const bucket = this.histograms.get(fullName)!.get(labelKey) ?? [];
    bucket.push(value);
    this.histograms.get(fullName)!.set(labelKey, bucket);
  }

  clear(): void {
    this.store.clear();
    this.histograms.clear();
  }

  /**
   * Clear metric VALUES only while preserving registered definitions.
   * Used by the retention manager to free memory without destroying
   * metric type registrations (which would break all metric collection).
   */
  clearValues(): void {
    for (const [, entry] of this.store) {
      entry.buckets = [];
    }
    this.histograms.clear();
  }

  generateText(): string {
    let output = "";

    for (const [name, entry] of this.store) {
      if (entry.help) {
        output += `# HELP ${name} ${entry.help}\n`;
      }
      output += `# TYPE ${name} ${entry.type}\n`;

      for (const bucket of entry.buckets) {
        const labelStr = formatLabels(bucket.labels);
        output += `${name}${labelStr} ${bucket.value}\n`;
      }

      // Add quantile calculations for histograms
      if (entry.type === "histogram") {
        const histKey = this.histograms.get(name);
        if (histKey) {
          for (const [labelKey, values] of histKey) {
            if (values.length === 0) continue;
            const sorted = [...values].sort((a, b) => a - b);
            const labels = labelKey === "__default__" ? undefined : JSON.parse(labelKey) as Record<string, string>;
            const ls = formatLabels({ ...labels, quantile: "0.5" });
            output += `${name}{${ls.slice(1, -1) ? `${ls.slice(1, -1)},` : ""}quantile="0.5"} ${percentile(sorted, 0.5)}\n`;
            const ls95 = formatLabels({ ...labels, quantile: "0.95" });
            output += `${name}{${ls95.slice(1, -1) ? `${ls95.slice(1, -1)},` : ""}quantile="0.95"} ${percentile(sorted, 0.95)}\n`;
            const ls99 = formatLabels({ ...labels, quantile: "0.99" });
            output += `${name}{${ls99.slice(1, -1) ? `${ls99.slice(1, -1)},` : ""}quantile="0.99"} ${percentile(sorted, 0.99)}\n`;
          }
        }
      }
    }

    return output;
  }
}

function labelMatch(a?: Record<string, string>, b?: Record<string, string>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(k => a[k] === b[k]);
}

function formatLabels(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${parts.join(",")}}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const metricsCollector = new MetricStore();

// ── Register All Metrics ───────────────────────────────────────────────────

export function registerDefaultMetrics(): void {
  const register = (name: string, help: string, type: "gauge" | "counter" | "histogram" | "summary") => {
    metricsCollector.register(name, help, type);
  };

  // Infrastructure
  register("cpu_usage_percent", "CPU usage percentage", "gauge");
  register("memory_usage_bytes", "Memory usage in bytes", "gauge");
  register("memory_heap_bytes", "Heap memory in bytes", "gauge");
  register("disk_usage_bytes", "Disk usage in bytes", "gauge");
  register("disk_free_bytes", "Free disk space in bytes", "gauge");
  register("network_bytes_in", "Network bytes received", "counter");
  register("network_bytes_out", "Network bytes transmitted", "counter");
  register("open_connections", "Open network connections", "gauge");
  register("active_handles", "Active libuv handles", "gauge");

  // Application
  register("http_requests_total", "Total HTTP requests by method and route", "counter");
  register("http_request_duration_ms", "HTTP request duration in ms", "histogram");
  register("http_errors_total", "HTTP errors by status code", "counter");
  register("auth_success_total", "Successful authentications", "counter");
  register("auth_failure_total", "Failed authentications", "counter");

  // Security
  register("vulnerabilities_total", "Vulnerabilities by severity and status", "gauge");
  register("false_positive_rate", "False positive rate as percentage", "gauge");
  register("verified_findings_total", "Verified findings by verification method", "counter");
  register("blocked_requests_total", "Blocked requests by rule", "counter");
  register("brute_force_attempts_total", "Brute force attempts blocked", "counter");

  // Worker
  register("workers_total", "Workers by status", "gauge");
  register("worker_task_duration_ms", "Worker task duration in ms", "histogram");
  register("worker_tasks_total", "Worker tasks by result", "counter");
  register("worker_cpu_percent", "Worker CPU usage percentage", "gauge");
  register("worker_memory_bytes", "Worker memory usage in bytes", "gauge");

  // Queue
  register("queue_depth", "Queue depth by queue name and state", "gauge");
  register("queue_processing_time_ms", "Queue job processing time in ms", "histogram");
  register("queue_retries_total", "Queue job retries", "counter");
  register("queue_dead_letter_total", "Dead letter queue count", "counter");
  register("queue_delay_ms", "Queue job delay in ms", "histogram");

  // Plugin
  register("plugins_total", "Plugins by status and category", "gauge");
  register("plugin_execution_duration_ms", "Plugin execution duration in ms", "histogram");
  register("plugin_errors_total", "Plugin execution errors", "counter");
  register("plugin_health_score", "Plugin health score 0-100", "gauge");

  // AI
  register("ai_requests_total", "AI analysis requests by provider", "counter");
  register("ai_request_duration_ms", "AI request duration in ms", "histogram");
  register("ai_cache_hits_total", "AI cache hits", "counter");
  register("ai_cache_misses_total", "AI cache misses", "counter");
  register("ai_errors_total", "AI request errors", "counter");
  register("ai_rate_limit_remaining", "Remaining AI rate limit", "gauge");

  // Database
  register("db_queries_total", "Database queries by type", "counter");
  register("db_query_duration_ms", "Database query duration in ms", "histogram");
  register("db_connections_active", "Active database connections", "gauge");
  register("db_connections_idle", "Idle database connections", "gauge");
  register("db_errors_total", "Database errors", "counter");

  // Scan
  register("scans_total", "Scans by status", "counter");
  register("scan_duration_ms", "Scan duration in ms", "histogram");
  register("scans_concurrent", "Concurrent active scans", "gauge");

  // Report
  register("reports_total", "Reports generated by category and format", "counter");
  register("report_generation_duration_ms", "Report generation duration in ms", "histogram");

  // AI Engine sub-metrics
  register("ai_engine_requests_total", "AI engine sub-engine requests", "counter");
  register("ai_engine_processing_time_ms", "AI engine sub-engine processing time", "histogram");
  register("ai_correlations_found", "Vulnerability correlations detected", "counter");
  register("ai_attack_chains_detected", "Attack chains detected", "counter");
  register("ai_remediations_generated", "Remediation patches generated", "counter");
  register("ai_false_positives_filtered", "False positives filtered out", "counter");

  logger.info("[METRICS] All default metrics registered");
}

// ── System Metrics Collector ───────────────────────────────────────────────

export function collectSystemMetrics(): void {
  const mem = process.memoryUsage();
  metricsCollector.set("memory_usage_bytes", mem.heapUsed);
  metricsCollector.set("memory_heap_bytes", mem.heapTotal);
  const activeHandles = (process as any)._getActiveHandles?.()?.length ?? -1;
  metricsCollector.set("active_handles", activeHandles, { type: "handles" });

  if (process.cpuUsage) {
    const cpu = process.cpuUsage();
    metricsCollector.set("cpu_usage_percent", (cpu.user + cpu.system) / 1_000_000, { type: "total" });
  }
}

// ── Prometheus-compatible text output ──────────────────────────────────────

export function generatePrometheusText(): string {
  return metricsCollector.generateText();
}
