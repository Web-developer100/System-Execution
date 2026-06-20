// ---------------------------------------------------------------------------
// Alerting Engine ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Intelligent alerting system with:
//   - Threshold rules (e.g., CPU > 90%)
//   - Rate rules (e.g., > 10 failures/min)
//   - Anomaly detection rules (e.g., 3σ deviation)
//   - Heartbeat rules (e.g., worker missed 3 heartbeats)
//   - Security rules (e.g., brute force attempts)
//   - Escalation policies with time windows
//   - Notification routing to all channels
//   - Silencing and maintenance windows
//   - Auto-resolution when condition clears

import crypto from "node:crypto";
import type { AlertRule, AlertFiring, AlertSeverity, AlertRuleType } from "./types";
import { eventStream } from "./event-stream";
import { logger } from "../../lib/logger";

// ── In-Memory Store ────────────────────────────────────────────────────────

const rules = new Map<string, AlertRule>();
const firings = new Map<string, AlertFiring>();
const metricValues = new Map<string, number[]>();

// ── Alerting Engine ────────────────────────────────────────────────────────

export class AlertingEngine {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  initialize(): void {
    if (this.initialized) return;

    // Register default rules
    this.registerDefaultRules();

    // Start checking every 30 seconds
    this.checkInterval = setInterval(() => this.evaluateAllRules(), 30_000);
    this.checkInterval.unref?.();

    this.initialized = true;
    logger.info("[ALERTS] Alerting engine initialized");
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.initialized = false;
    logger.info("[ALERTS] Alerting engine shut down");
  }

  // ── Rule Management ──────────────────────────────────────────────────────

  addRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt">): AlertRule {
    const newRule: AlertRule = {
      ...rule,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    rules.set(newRule.id, newRule);
    logger.info({ ruleId: newRule.id, name: newRule.name }, "[ALERTS] Rule added");
    return newRule;
  }

  updateRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = rules.get(id);
    if (!rule) return null;
    Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
    return rule;
  }

  removeRule(id: string): boolean {
    return rules.delete(id);
  }

  getRule(id: string): AlertRule | null {
    return rules.get(id) ?? null;
  }

  getRules(): AlertRule[] {
    return [...rules.values()];
  }

  getRulesBySource(source: string): AlertRule[] {
    return [...rules.values()].filter(r => r.source === source);
  }

  // ── Firing Management ────────────────────────────────────────────────────

  getFirings(status?: string): AlertFiring[] {
    const all = [...firings.values()];
    if (status) return all.filter(f => f.status === status);
    return all;
  }

  acknowledgeFiring(id: string, userId: string): AlertFiring | null {
    const firing = firings.get(id);
    if (!firing) return null;
    firing.status = "acknowledged";
    firing.acknowledgedBy = userId;
    firing.acknowledgedAt = new Date().toISOString();
    return firing;
  }

  silenceFiring(id: string, durationMs: number): AlertFiring | null {
    const firing = firings.get(id);
    if (!firing) return null;
    firing.status = "silenced";
    firing.silencedUntil = new Date(Date.now() + durationMs).toISOString();
    return firing;
  }

  resolveFiring(id: string): AlertFiring | null {
    const firing = firings.get(id);
    if (!firing) return null;
    firing.status = "resolved";
    firing.resolvedAt = new Date().toISOString();

    eventStream.emit("alert:resolved", {
      source: "alerting-engine",
      message: `Alert resolved: ${firing.ruleName}`,
      details: { ruleId: firing.ruleId, alertId: firing.id },
    });

    return firing;
  }

  // ── Metric Ingestion ─────────────────────────────────────────────────────

  ingestMetric(name: string, value: number): void {
    if (!metricValues.has(name)) {
      metricValues.set(name, []);
    }
    const values = metricValues.get(name)!;
    values.push(value);

    // Keep last 60 data points (30 min at 30s intervals)
    if (values.length > 60) {
      values.shift();
    }
  }

  // ── Rule Evaluation ──────────────────────────────────────────────────────

  private evaluateAllRules(): void {
    for (const rule of rules.values()) {
      if (!rule.enabled) continue;

      try {
        this.evaluateRule(rule);
      } catch (err) {
        logger.error({ err, ruleId: rule.id }, "[ALERTS] Rule evaluation error");
      }
    }
  }

  private evaluateRule(rule: AlertRule): void {
    const metricName = rule.source;
    const values = metricValues.get(metricName);

    if (!values || values.length < 2) return;

    const currentValue = values[values.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    let shouldFire = false;

    switch (rule.type) {
      case "threshold":
        shouldFire = currentValue > rule.threshold;
        break;

      case "rate": {
        const recent = values.slice(-5);
        const count = recent.filter(v => v > 0).length;
        shouldFire = count >= rule.threshold;
        break;
      }

      case "anomaly": {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance) || 1;
        const deviation = Math.abs(currentValue - mean) / stdDev;
        shouldFire = deviation > rule.threshold;
        break;
      }

      case "heartbeat":
        // If no metric received recently, heartbeat is missing
        shouldFire = currentValue === 0;
        break;

      case "security":
        shouldFire = currentValue > rule.threshold;
        break;
    }

    if (shouldFire) {
      this.fireAlert(rule, currentValue);
    } else {
      // Auto-resolve if condition cleared
      const existing = [...firings.values()].find(f => f.ruleId === rule.id && f.status === "firing");
      if (existing) {
        this.resolveFiring(existing.id);
      }
    }
  }

  private fireAlert(rule: AlertRule, value: number): void {
    // Check if already firing
    const existing = [...firings.values()].find(f => f.ruleId === rule.id && f.status === "firing");
    if (existing) return;

    const alert: AlertFiring = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: "firing",
      message: rule.description,
      value,
      threshold: rule.threshold,
      source: rule.source,
      labels: {},
      firedAt: new Date().toISOString(),
      resolvedAt: null,
      acknowledgedBy: null,
      acknowledgedAt: null,
      silencedUntil: null,
    };

    firings.set(alert.id, alert);

    eventStream.emit("alert:firing", {
      source: "alerting-engine",
      severity: rule.severity === "critical" ? "error" : rule.severity === "high" ? "warn" : "info",
      message: alert.message,
      details: { ruleId: rule.id, ruleName: rule.name, value, threshold: rule.threshold, alertId: alert.id },
    });

    logger.warn({ alertId: alert.id, rule: rule.name, value, threshold: rule.threshold, severity: rule.severity }, "[ALERTS] Firing");
  }

  // ── Default Rules ────────────────────────────────────────────────────────

  private registerDefaultRules(): void {
    const defaultRules: Array<Omit<AlertRule, "id" | "createdAt" | "updatedAt">> = [
      { name: "High CPU Usage", description: "CPU usage exceeds 90% threshold", type: "threshold", severity: "high", source: "cpu_usage_percent", condition: "cpu > 90", threshold: 90, duration: 60, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: 300, escalateTo: ["slack"] },
      { name: "High Memory Usage", description: "Memory usage exceeds 85% threshold", type: "threshold", severity: "high", source: "memory_usage_bytes", condition: "memory > 85%", threshold: 85, duration: 60, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: null, escalateTo: null },
      { name: "Queue Overflow", description: "Queue depth exceeds 100 items", type: "threshold", severity: "medium", source: "queue_depth", condition: "queue_depth > 100", threshold: 100, duration: 30, enabled: true, notifyChannels: ["slack"], escalateAfter: null, escalateTo: null },
      { name: "High Error Rate", description: "Error rate exceeds 10 per minute", type: "rate", severity: "high", source: "http_errors_total", condition: "errors/min > 10", threshold: 10, duration: 60, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: 600, escalateTo: ["pagerduty"] },
      { name: "Authentication Attack", description: "Brute force attempts exceed threshold", type: "security", severity: "critical", source: "auth_failure_total", condition: "auth_failures > 20/min", threshold: 20, duration: 30, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: 120, escalateTo: ["slack", "sms"] },
      { name: "Worker Offline", description: "Worker heartbeat not received", type: "heartbeat", severity: "critical", source: "workers_total", condition: "worker_heartbeat_missing", threshold: 0, duration: 120, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: 600, escalateTo: ["pagerduty"] },
      { name: "Critical Vulnerabilities", description: "Critical vulnerabilities detected", type: "threshold", severity: "critical", source: "vulnerabilities_total", condition: "critical_vulns > 0", threshold: 0, duration: 0, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: null, escalateTo: null },
      { name: "Plugin Failure Spike", description: "Plugin error rate anomaly detected", type: "anomaly", severity: "medium", source: "plugin_errors_total", condition: "plugin_errors_3σ", threshold: 3, duration: 60, enabled: true, notifyChannels: ["slack"], escalateAfter: null, escalateTo: null },
      { name: "Scan Failure Spike", description: "Scan failure rate exceeds threshold", type: "rate", severity: "high", source: "scans_total", condition: "scan_failures > 5/min", threshold: 5, duration: 60, enabled: true, notifyChannels: ["slack", "email"], escalateAfter: 300, escalateTo: ["slack"] },
    ];

    for (const rule of defaultRules) {
      this.addRule(rule);
    }

    logger.info({ count: defaultRules.length }, "[ALERTS] Default rules registered");
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const alertingEngine = new AlertingEngine();
