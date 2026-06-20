// ---------------------------------------------------------------------------
// Observability Platform — Barrel Exports
// ---------------------------------------------------------------------------

export { metricsCollector, registerDefaultMetrics, collectSystemMetrics, generatePrometheusText } from "./metrics-collector";
export { StructuredLogger, structuredLogger, log } from "./structured-logger";
export { HealthCheckRegistry, healthRegistry, registerDefaultHealthChecks } from "./health-check-registry";
export { AlertingEngine, alertingEngine } from "./alerting-engine";
export { EventStream, eventStream, emitEvent } from "./event-stream";
export { AnomalyDetector, anomalyDetector } from "./anomaly-detector";
export { CapacityPlanner, capacityPlanner } from "./capacity-planner";
export { RetentionManager, retentionManager } from "./retention-manager";

export type {
  MetricType, MetricDefinition, MetricSample,
  LogCategory, LogSeverity, StructuredLogEntry,
  HealthStatus, HealthCheckResult, HealthReport,
  AlertRule, AlertFiring, AlertSeverity, AlertRuleType,
  SystemEvent, SystemEventType,
  AnomalyReport,
  CapacityForecast,
} from "./types";

export { LOG_CATEGORIES, SYSTEM_EVENT_TYPES, ANOMALY_TYPES, METRIC_PREFIX } from "./types";
