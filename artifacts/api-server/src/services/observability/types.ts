// ---------------------------------------------------------------------------
// Observability Platform — Shared Types ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------

// ── Metrics ────────────────────────────────────────────────────────────────

export type MetricType = "gauge" | "counter" | "histogram" | "summary";

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labels?: Record<string, string>;
}

export interface MetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

// ── Logging ────────────────────────────────────────────────────────────────

export type LogCategory =
  | "system" | "application" | "security" | "audit" | "authentication"
  | "worker" | "plugin" | "ai" | "verification" | "api"
  | "database" | "queue" | "infrastructure" | "container"
  | "kubernetes" | "notification" | "integration" | "reporting"
  | "scheduler" | "metrics";

export type LogSeverity = "debug" | "info" | "warn" | "error" | "fatal";

export interface StructuredLogEntry {
  timestamp: string;
  correlationId: string | null;
  traceId: string | null;
  requestId: string | null;
  userId: string | null;
  organizationId: string | null;
  workerId: string | null;
  pluginId: string | null;
  serviceName: string;
  hostname: string;
  severity: LogSeverity;
  category: LogCategory;
  operation: string;
  message: string;
  executionTimeMs: number | null;
  status: string | null;
  exception: string | null;
  stackTrace: string | null;
  metadata: Record<string, unknown> | null;
}

// ── Health Checks ──────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string | null;
  durationMs: number;
  lastChecked: string;
  metadata: Record<string, unknown> | null;
}

export interface HealthReport {
  status: HealthStatus;
  uptime: number;
  checks: HealthCheckResult[];
  timestamp: string;
}

// ── Alerts ─────────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";

export type AlertStatus = "firing" | "resolved" | "acknowledged" | "silenced";

export type AlertRuleType = "threshold" | "rate" | "anomaly" | "heartbeat" | "security";

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: AlertRuleType;
  severity: AlertSeverity;
  source: string; // e.g., "worker", "queue", "scan", "ai"
  condition: string; // e.g., "cpu > 90", "queue_depth > 100"
  threshold: number;
  duration: number; // seconds before firing
  enabled: boolean;
  notifyChannels: string[];
  escalateAfter: number | null; // seconds
  escalateTo: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertFiring {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  value: number;
  threshold: number;
  source: string;
  labels: Record<string, string>;
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  silencedUntil: string | null;
}

// ── Events ─────────────────────────────────────────────────────────────────

export type SystemEventType =
  | "user:login" | "user:logout" | "user:created" | "user:deleted"
  | "scan:created" | "scan:started" | "scan:completed" | "scan:failed" | "scan:stopped" | "scan:cancelled"
  | "plugin:installed" | "plugin:updated" | "plugin:removed" | "plugin:enabled" | "plugin:disabled"
  | "worker:connected" | "worker:disconnected" | "worker:health_changed"
  | "finding:created" | "finding:verified" | "finding:classified"
  | "ai:decision" | "ai:model_updated"
  | "report:generated" | "report:scheduled" | "report:delivered"
  | "notification:sent" | "notification:failed"
  | "config:changed" | "role:updated" | "permission:modified"
  | "system:restarted" | "system:error" | "system:warning"
  | "backup:completed" | "backup:failed" | "restore:completed"
  | "alert:firing" | "alert:resolved";

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  source: string;
  severity: LogSeverity;
  message: string;
  details: Record<string, unknown> | null;
  userId: string | null;
  organizationId: string | null;
  correlationId: string | null;
  timestamp: string;
}

// ── Anomaly Detection ──────────────────────────────────────────────────────

export interface AnomalyReport {
  id: string;
  type: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  deviation: number; // standard deviations from baseline
  severity: AlertSeverity;
  message: string;
  recommendation: string | null;
  detectedAt: string;
}

// ── Capacity Planning ──────────────────────────────────────────────────────

export interface CapacityForecast {
  metric: string;
  currentUsage: number;
  growthRate: number; // % per month
  projectedUsage30d: number;
  projectedUsage90d: number;
  capacityLimit: number;
  estimatedExhaustionDate: string | null;
  recommendation: string;
}

// ── Retention Policies ────────────────────────────────────────────────────

export type RetentionDataType = "logs" | "events" | "metrics" | "audit" | "reports" | "backups";

export interface RetentionPolicy {
  dataType: RetentionDataType;
  /** Maximum number of entries in the in-memory buffer (logs, events) */
  maxEntries: number;
  /** Time-to-live in milliseconds before data is eligible for sweep */
  ttlMs: number;
  /** Whether automated sweeping is enabled */
  enabled: boolean;
  /** Whether to archive before deletion (future: write to file before clearing) */
  archiveEnabled: boolean;
  /** Human-readable label */
  label: string;
  /** Last time a sweep was performed */
  lastSweptAt: string | null;
}

export interface SweepResult {
  id: string;
  timestamp: string;
  dataType: RetentionDataType;
  /** Number of entries removed */
  entriesRemoved: number;
  /** Remaining entries after sweep */
  entriesRemaining: number;
  /** Whether archival was performed */
  archived: boolean;
  /** Any error encountered */
  error: string | null;
  /** Duration in ms */
  durationMs: number;
}

export interface DataSizeInfo {
  dataType: RetentionDataType;
  currentEntries: number;
  maxEntries: number;
  utilizationPercent: number;
  oldestEntryTimestamp: string | null;
  policyEnabled: boolean;
}

// ── Default Retention Policies ─────────────────────────────────────────────

export const DEFAULT_RETENTION_POLICIES: Record<RetentionDataType, Omit<RetentionPolicy, "lastSweptAt">> = {
  logs: {
    dataType: "logs",
    maxEntries: 10_000,
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    enabled: true,
    archiveEnabled: false,
    label: "Structured Logs",
  },
  events: {
    dataType: "events",
    maxEntries: 10_000,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    enabled: true,
    archiveEnabled: false,
    label: "System Events",
  },
  metrics: {
    dataType: "metrics",
    maxEntries: 100_000,
    ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    enabled: true,
    archiveEnabled: false,
    label: "Metrics Data",
  },
  audit: {
    dataType: "audit",
    maxEntries: 100_000,
    ttlMs: 365 * 24 * 60 * 60 * 1000, // 1 year (compliance requirement)
    enabled: true,
    archiveEnabled: true,
    label: "Audit Logs",
  },
  reports: {
    dataType: "reports",
    maxEntries: 1_000,
    ttlMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    enabled: true,
    archiveEnabled: false,
    label: "Generated Reports",
  },
  backups: {
    dataType: "backups",
    maxEntries: 50,
    ttlMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    enabled: true,
    archiveEnabled: true,
    label: "System Backups",
  },
};

// ── Constants ──────────────────────────────────────────────────────────────

export const LOG_CATEGORIES: LogCategory[] = [
  "system", "application", "security", "audit", "authentication",
  "worker", "plugin", "ai", "verification", "api",
  "database", "queue", "infrastructure", "container", "kubernetes",
  "notification", "integration", "reporting", "scheduler", "metrics",
];

export const SYSTEM_EVENT_TYPES: SystemEventType[] = [
  "user:login", "user:logout", "user:created", "user:deleted",
  "scan:created", "scan:started", "scan:completed", "scan:failed", "scan:stopped", "scan:cancelled",
  "plugin:installed", "plugin:updated", "plugin:removed", "plugin:enabled", "plugin:disabled",
  "worker:connected", "worker:disconnected", "worker:health_changed",
  "finding:created", "finding:verified", "finding:classified",
  "ai:decision", "ai:model_updated",
  "report:generated", "report:scheduled", "report:delivered",
  "notification:sent", "notification:failed",
  "config:changed", "role:updated", "permission:modified",
  "system:restarted", "system:error", "system:warning",
  "backup:completed", "backup:failed", "restore:completed",
  "alert:firing", "alert:resolved",
];

export const ANOMALY_TYPES = [
  "scan_failure_spike", "worker_disconnection", "resource_spike",
  "auth_failure_burst", "queue_growth", "plugin_instability",
  "performance_regression", "infrastructure_degradation",
  "error_rate_increase", "latency_spike",
];

export const METRIC_PREFIX = "v8_";
