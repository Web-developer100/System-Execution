// ---------------------------------------------------------------------------
// Observability Platform — Barrel Exports ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// All observability services, types, and utilities.

// ── Core Services ──────────────────────────────────────────────────────────
export { metricsCollector, registerDefaultMetrics, collectSystemMetrics, generatePrometheusText } from "./metrics-collector";
export { StructuredLogger, structuredLogger, log } from "./structured-logger";
export { HealthCheckRegistry, healthRegistry, registerDefaultHealthChecks } from "./health-check-registry";
export { AlertingEngine, alertingEngine } from "./alerting-engine";
export { EventStream, eventStream, emitEvent } from "./event-stream";
export { AnomalyDetector, anomalyDetector } from "./anomaly-detector";
export { CapacityPlanner, capacityPlanner } from "./capacity-planner";
export { RetentionManager, retentionManager } from "./retention-manager";

// ── Extended Services ──────────────────────────────────────────────────────
export { TracingService, tracingService, createTraceContext } from "./tracing";
export type { TraceSpan, Trace, TraceContext, TraceSpanType } from "./tracing";
export { BackupMonitor, backupMonitor } from "./backup-monitor";
export type { BackupRecord, RestoreRecord, BackupType, BackupStatus, RestoreStatus } from "./backup-monitor";
export { AuditTrailService, auditTrailService } from "./audit-trail";
export type { AuditEntry, AuditActionType } from "./audit-trail";
export { ALL_DASHBOARDS, DASHBOARD_MAP, getDashboard, listDashboards } from "./dashboards";
export type { DashboardDefinition, DashboardPanel, DashboardSection } from "./dashboards";
export { dispatchAlertToChannels, dispatchTelegram, dispatchSms, dispatchPushNotification, dispatchPagerDuty, dispatchOpsgenie, dispatchServiceNow, dispatchJira, dispatchGitHubIssue, dispatchGitLabIssue, dispatchAzureDevOps } from "./notification-channels";
export type { AlertDispatchPayload, DispatchResult } from "./notification-channels";

// ── Types ──────────────────────────────────────────────────────────────────
export type {
  MetricType, MetricDefinition, MetricSample,
  LogCategory, LogSeverity, StructuredLogEntry,
  HealthStatus, HealthCheckResult, HealthReport,
  AlertRule, AlertFiring, AlertSeverity, AlertRuleType,
  SystemEvent, SystemEventType,
  AnomalyReport,
  CapacityForecast,
} from "./types";

export { LOG_CATEGORIES, SYSTEM_EVENT_TYPES, ANOMALY_TYPES, METRIC_PREFIX, DEFAULT_RETENTION_POLICIES } from "./types";
