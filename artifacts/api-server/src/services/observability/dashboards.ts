// ---------------------------------------------------------------------------
// Observability Dashboards ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Professional dashboard definitions for:
// Executive, SOC, Infrastructure, Worker, Plugin, API, Database,
// Security, Compliance, AI, Performance, System Health

export interface DashboardPanel {
  id: string;
  title: string;
  type: "stat" | "timeseries" | "bar" | "pie" | "table" | "heatmap" | "gauge" | "log" | "alert_list";
  metrics: string[];
  width: 1 | 2 | 3 | 4 | 6 | 8 | 12; // grid columns (12 total)
  height: 1 | 2 | 3; // grid rows
  color?: string;
  thresholds?: { warning: number; critical: number };
  unit?: string;
}

export interface DashboardSection {
  title: string;
  description: string;
  panels: DashboardPanel[];
}

export interface DashboardDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  refreshIntervalMs: number;
  sections: DashboardSection[];
}

// ── 1. Executive Dashboard ────────────────────────────────────────────────

const executiveDashboard: DashboardDefinition = {
  id: "executive",
  name: "Executive Dashboard",
  description: "High-level security posture for C-suite and board members",
  icon: "📊",
  category: "executive",
  refreshIntervalMs: 60_000,
  sections: [
    {
      title: "Security Posture Overview",
      description: "Top-level security metrics and risk indicators",
      panels: [
        { id: "risk-score", title: "Risk Score", type: "gauge", metrics: ["risk_score"], width: 3, height: 2, thresholds: { warning: 40, critical: 20 }, color: "#22d3ee", unit: "/100" },
        { id: "total-vulns", title: "Total Vulnerabilities", type: "stat", metrics: ["vulnerabilities_total"], width: 3, height: 1, color: "#e2e8f0" },
        { id: "critical-vulns", title: "Critical Vulnerabilities", type: "stat", metrics: ["vulnerabilities_total{severity=\"critical\"}"], width: 2, height: 1, color: "#ef4444" },
        { id: "open-scans", title: "Active Scans", type: "stat", metrics: ["scans_total{status=\"running\"}"], width: 2, height: 1, color: "#3b82f6" },
        { id: "compliance-score", title: "Compliance Score", type: "gauge", metrics: ["compliance_score"], width: 2, height: 2, thresholds: { warning: 60, critical: 40 }, color: "#10b981", unit: "%" },
      ],
    },
    {
      title: "Vulnerability Trends",
      description: "30-day vulnerability trend analysis",
      panels: [
        { id: "vuln-timeline", title: "Vulnerabilities Over Time", type: "timeseries", metrics: ["vulnerabilities_total"], width: 6, height: 2 },
        { id: "severity-pie", title: "Severity Distribution", type: "pie", metrics: ["vulnerabilities_total"], width: 3, height: 2 },
        { id: "risk-heatmap", title: "Risk Heatmap", type: "heatmap", metrics: ["risk_score"], width: 3, height: 2 },
      ],
    },
    {
      title: "Remediation Progress",
      description: "Remediation tracking and SLA compliance",
      panels: [
        { id: "remediation-rate", title: "Remediation Rate", type: "stat", metrics: ["remediation_rate"], width: 3, height: 1, unit: "%" },
        { id: "mttr", title: "Mean Time to Remediate", type: "stat", metrics: ["mttr_hours"], width: 3, height: 1, unit: "hours" },
        { id: "open-vs-closed", title: "Open vs Closed Findings", type: "bar", metrics: ["vulnerabilities_total"], width: 6, height: 2 },
      ],
    },
  ],
};

// ── 2. SOC Dashboard ──────────────────────────────────────────────────────

const socDashboard: DashboardDefinition = {
  id: "soc",
  name: "SOC Dashboard",
  description: "Security Operations Center real-time monitoring",
  icon: "🛡️",
  category: "soc",
  refreshIntervalMs: 15_000,
  sections: [
    {
      title: "Current Threats",
      description: "Active security events and alerts",
      panels: [
        { id: "active-alerts", title: "Active Alerts", type: "stat", metrics: ["alerts_firing"], width: 2, height: 1, color: "#ef4444" },
        { id: "critical-alerts", title: "Critical Alerts", type: "stat", metrics: ["alerts_critical"], width: 2, height: 1, color: "#ef4444" },
        { id: "blocked-requests", title: "Blocked Requests (24h)", type: "stat", metrics: ["blocked_requests_total"], width: 2, height: 1, color: "#f97316" },
        { id: "auth-failures", title: "Auth Failures (1h)", type: "stat", metrics: ["auth_failure_total"], width: 2, height: 1, color: "#eab308" },
        { id: "brute-force", title: "Brute Force Attempts", type: "stat", metrics: ["brute_force_attempts_total"], width: 2, height: 1, color: "#ef4444" },
        { id: "suspicious-activities", title: "Suspicious Activities", type: "stat", metrics: ["suspicious_activity_total"], width: 2, height: 1, color: "#f97316" },
      ],
    },
    {
      title: "Alert Timeline",
      description: "Real-time alert stream",
      panels: [
        { id: "alert-timeline", title: "Alert Timeline", type: "timeseries", metrics: ["alerts_total"], width: 12, height: 2 },
      ],
    },
    {
      title: "Recent Events",
      description: "Latest security events",
      panels: [
        { id: "event-log", title: "Event Log", type: "log", metrics: ["events"], width: 8, height: 3 },
        { id: "alert-list", title: "Active Alerts", type: "alert_list", metrics: ["alerts_firing"], width: 4, height: 3 },
      ],
    },
  ],
};

// ── 3. Infrastructure Dashboard ────────────────────────────────────────────

const infraDashboard: DashboardDefinition = {
  id: "infrastructure",
  name: "Infrastructure Dashboard",
  description: "System resource monitoring and infrastructure health",
  icon: "⚙️",
  category: "infrastructure",
  refreshIntervalMs: 10_000,
  sections: [
    {
      title: "System Resources",
      description: "CPU, memory, disk, and network metrics",
      panels: [
        { id: "cpu-usage", title: "CPU Usage", type: "gauge", metrics: ["cpu_usage_percent"], width: 3, height: 2, thresholds: { warning: 80, critical: 90 }, color: "#3b82f6", unit: "%" },
        { id: "memory-usage", title: "Memory Usage", type: "gauge", metrics: ["memory_usage_bytes"], width: 3, height: 2, thresholds: { warning: 75, critical: 90 }, color: "#8b5cf6", unit: "MB" },
        { id: "disk-usage", title: "Disk Usage", type: "gauge", metrics: ["disk_usage_bytes"], width: 3, height: 2, thresholds: { warning: 80, critical: 95 }, color: "#10b981", unit: "%" },
        { id: "network-io", title: "Network I/O", type: "stat", metrics: ["network_bytes_in"], width: 3, height: 1, color: "#06b6d4", unit: "bps" },
      ],
    },
    {
      title: "Performance Metrics",
      description: "System performance and throughput",
      panels: [
        { id: "cpu-trend", title: "CPU Trend", type: "timeseries", metrics: ["cpu_usage_percent"], width: 4, height: 2 },
        { id: "memory-trend", title: "Memory Trend", type: "timeseries", metrics: ["memory_usage_bytes"], width: 4, height: 2 },
        { id: "disk-trend", title: "Disk I/O", type: "timeseries", metrics: ["disk_io_bytes"], width: 4, height: 2 },
      ],
    },
    {
      title: "System Health",
      description: "Component health status",
      panels: [
        { id: "open-connections", title: "Open Connections", type: "stat", metrics: ["open_connections"], width: 3, height: 1, color: "#64748b" },
        { id: "active-handles", title: "Active Handles", type: "stat", metrics: ["active_handles"], width: 3, height: 1, color: "#64748b" },
        { id: "container-count", title: "Container Count", type: "stat", metrics: ["container_count"], width: 3, height: 1, color: "#22d3ee" },
        { id: "pod-count", title: "Pod Count", type: "stat", metrics: ["pod_count"], width: 3, height: 1, color: "#22d3ee" },
      ],
    },
  ],
};

// ── 4. Worker Dashboard ────────────────────────────────────────────────────

const workerDashboard: DashboardDefinition = {
  id: "worker",
  name: "Worker Dashboard",
  description: "Worker pool performance and task execution monitoring",
  icon: "🔧",
  category: "worker",
  refreshIntervalMs: 15_000,
  sections: [
    {
      title: "Worker Pool",
      description: "Worker availability and utilization",
      panels: [
        { id: "workers-online", title: "Workers Online", type: "stat", metrics: ["workers_total{status=\"online\"}"], width: 3, height: 1, color: "#22c55e" },
        { id: "workers-busy", title: "Workers Busy", type: "stat", metrics: ["workers_total{status=\"busy\"}"], width: 3, height: 1, color: "#eab308" },
        { id: "workers-offline", title: "Workers Offline", type: "stat", metrics: ["workers_total{status=\"offline\"}"], width: 3, height: 1, color: "#ef4444" },
        { id: "worker-utilization", title: "Worker Utilization", type: "gauge", metrics: ["worker_utilization"], width: 3, height: 2, color: "#22d3ee", unit: "%" },
      ],
    },
    {
      title: "Task Performance",
      description: "Task execution metrics",
      panels: [
        { id: "tasks-completed", title: "Tasks Completed", type: "stat", metrics: ["worker_tasks_total{result=\"completed\"}"], width: 2, height: 1, color: "#22c55e" },
        { id: "tasks-failed", title: "Tasks Failed", type: "stat", metrics: ["worker_tasks_total{result=\"failed\"}"], width: 2, height: 1, color: "#ef4444" },
        { id: "tasks-running", title: "Tasks Running", type: "stat", metrics: ["worker_tasks_total{result=\"running\"}"], width: 2, height: 1, color: "#3b82f6" },
        { id: "task-duration", title: "Task Duration (p95)", type: "stat", metrics: ["worker_task_duration_ms{quantile=\"0.95\"}"], width: 2, height: 1, color: "#8b5cf6", unit: "ms" },
        { id: "task-trend", title: "Task Completion Trend", type: "timeseries", metrics: ["worker_tasks_total"], width: 4, height: 2 },
        { id: "duration-dist", title: "Duration Distribution", type: "heatmap", metrics: ["worker_task_duration_ms"], width: 4, height: 2 },
      ],
    },
  ],
};

// ── 5. Plugin Dashboard ────────────────────────────────────────────────────

const pluginDashboard: DashboardDefinition = {
  id: "plugin",
  name: "Plugin Dashboard",
  description: "Plugin health, execution, and performance monitoring",
  icon: "🧩",
  category: "plugin",
  refreshIntervalMs: 30_000,
  sections: [
    {
      title: "Plugin Overview",
      description: "Plugin count and health status",
      panels: [
        { id: "plugins-active", title: "Active Plugins", type: "stat", metrics: ["plugins_total{status=\"active\"}"], width: 3, height: 1, color: "#22c55e" },
        { id: "plugins-error", title: "Failed Plugins", type: "stat", metrics: ["plugins_total{status=\"error\"}"], width: 3, height: 1, color: "#ef4444" },
        { id: "plugins-avg-health", title: "Avg Health Score", type: "gauge", metrics: ["plugin_health_score"], width: 3, height: 2, color: "#22d3ee", unit: "/100" },
      ],
    },
    {
      title: "Plugin Execution",
      description: "Execution metrics across all plugins",
      panels: [
        { id: "plugin-exec-trend", title: "Execution Duration", type: "timeseries", metrics: ["plugin_execution_duration_ms"], width: 6, height: 2 },
        { id: "plugin-errors", title: "Errors by Plugin", type: "bar", metrics: ["plugin_errors_total"], width: 6, height: 2 },
      ],
    },
  ],
};

// ── 6. API Dashboard ───────────────────────────────────────────────────────

const apiDashboard: DashboardDefinition = {
  id: "api",
  name: "API Dashboard",
  description: "API performance, error rates, and usage metrics",
  icon: "🌐",
  category: "api",
  refreshIntervalMs: 10_000,
  sections: [
    {
      title: "API Overview",
      description: "Request volume and performance",
      panels: [
        { id: "rps", title: "Requests/sec", type: "stat", metrics: ["http_requests_total"], width: 2, height: 1, color: "#22d3ee", unit: "rps" },
        { id: "p95-latency", title: "P95 Latency", type: "stat", metrics: ["http_request_duration_ms{quantile=\"0.95\"}"], width: 2, height: 1, color: "#f97316", unit: "ms" },
        { id: "p99-latency", title: "P99 Latency", type: "stat", metrics: ["http_request_duration_ms{quantile=\"0.99\"}"], width: 2, height: 1, color: "#ef4444", unit: "ms" },
        { id: "error-rate", title: "Error Rate", type: "stat", metrics: ["http_errors_total"], width: 2, height: 1, color: "#ef4444", unit: "%" },
        { id: "success-rate", title: "Success Rate", type: "stat", metrics: ["http_requests_total"], width: 2, height: 1, color: "#22c55e", unit: "%" },
        { id: "avg-response", title: "Avg Response Time", type: "stat", metrics: ["http_request_duration_ms"], width: 2, height: 1, color: "#3b82f6", unit: "ms" },
      ],
    },
    {
      title: "API Latency & Errors",
      description: "Latency distribution and error breakdown",
      panels: [
        { id: "latency-trend", title: "Latency Over Time", type: "timeseries", metrics: ["http_request_duration_ms"], width: 6, height: 2 },
        { id: "errors-by-route", title: "Errors by Route", type: "bar", metrics: ["http_errors_total"], width: 3, height: 2 },
        { id: "requests-by-method", title: "Requests by Method", type: "pie", metrics: ["http_requests_total"], width: 3, height: 2 },
      ],
    },
  ],
};

// ── 7. Database Dashboard ──────────────────────────────────────────────────

const databaseDashboard: DashboardDefinition = {
  id: "database",
  name: "Database Dashboard",
  description: "Database performance, queries, and connection monitoring",
  icon: "🗄️",
  category: "database",
  refreshIntervalMs: 10_000,
  sections: [
    {
      title: "Database Health",
      description: "Connection pool and query performance",
      panels: [
        { id: "active-connections", title: "Active Connections", type: "stat", metrics: ["db_connections_active"], width: 3, height: 1, color: "#3b82f6" },
        { id: "idle-connections", title: "Idle Connections", type: "stat", metrics: ["db_connections_idle"], width: 3, height: 1, color: "#64748b" },
        { id: "queries-per-sec", title: "Queries/sec", type: "stat", metrics: ["db_queries_total"], width: 3, height: 1, color: "#22d3ee", unit: "qps" },
        { id: "db-errors", title: "DB Errors", type: "stat", metrics: ["db_errors_total"], width: 3, height: 1, color: "#ef4444" },
      ],
    },
    {
      title: "Query Performance",
      description: "Query duration and throughput trends",
      panels: [
        { id: "query-duration", title: "Query Duration (p95)", type: "timeseries", metrics: ["db_query_duration_ms"], width: 6, height: 2 },
        { id: "query-volume", title: "Query Volume", type: "timeseries", metrics: ["db_queries_total"], width: 6, height: 2 },
      ],
    },
  ],
};

// ── 8. Security Dashboard ──────────────────────────────────────────────────

const securityDashboard: DashboardDefinition = {
  id: "security",
  name: "Security Dashboard",
  description: "Security posture, threats, and compliance monitoring",
  icon: "🔒",
  category: "security",
  refreshIntervalMs: 30_000,
  sections: [
    {
      title: "Security Posture",
      description: "Overall security metrics",
      panels: [
        { id: "security-score", title: "Security Score", type: "gauge", metrics: ["security_score"], width: 3, height: 2, thresholds: { warning: 60, critical: 40 }, color: "#22d3ee", unit: "/100" },
        { id: "critical-vulns", title: "Critical", type: "stat", metrics: ["vulnerabilities_total{severity=\"critical\"}"], width: 2, height: 1, color: "#ef4444" },
        { id: "high-vulns", title: "High", type: "stat", metrics: ["vulnerabilities_total{severity=\"high\"}"], width: 2, height: 1, color: "#f97316" },
        { id: "medium-vulns", title: "Medium", type: "stat", metrics: ["vulnerabilities_total{severity=\"medium\"}"], width: 2, height: 1, color: "#eab308" },
        { id: "false-positives", title: "False Positive Rate", type: "stat", metrics: ["false_positive_rate"], width: 3, height: 1, color: "#64748b", unit: "%" },
      ],
    },
    {
      title: "Security Threats",
      description: "Active threats and attack metrics",
      panels: [
        { id: "auth-attacks", title: "Auth Attacks", type: "timeseries", metrics: ["auth_failure_total"], width: 4, height: 2 },
        { id: "blocked-requests-trend", title: "Blocked Requests", type: "timeseries", metrics: ["blocked_requests_total"], width: 4, height: 2 },
        { id: "attack-surface", title: "Attack Surface", type: "stat", metrics: ["attack_surface_size"], width: 4, height: 1, color: "#f97316" },
      ],
    },
  ],
};

// ── 9. Compliance Dashboard ────────────────────────────────────────────────

const complianceDashboard: DashboardDefinition = {
  id: "compliance",
  name: "Compliance Dashboard",
  description: "Compliance framework coverage and audit readiness",
  icon: "📋",
  category: "compliance",
  refreshIntervalMs: 60_000,
  sections: [
    {
      title: "Compliance Overview",
      description: "Framework coverage scores",
      panels: [
        { id: "compliance-score", title: "Overall Compliance", type: "gauge", metrics: ["compliance_score"], width: 4, height: 2, thresholds: { warning: 60, critical: 40 }, color: "#10b981", unit: "%" },
        { id: "frameworks-passed", title: "Frameworks Passing", type: "stat", metrics: ["compliance_frameworks_passing"], width: 2, height: 1, color: "#22c55e" },
        { id: "frameworks-failed", title: "Frameworks Failing", type: "stat", metrics: ["compliance_frameworks_failing"], width: 2, height: 1, color: "#ef4444" },
        { id: "controls-passed", title: "Controls Passed", type: "stat", metrics: ["compliance_controls_passed"], width: 2, height: 1, color: "#22c55e" },
        { id: "controls-failed", title: "Controls Failed", type: "stat", metrics: ["compliance_controls_failed"], width: 2, height: 1, color: "#ef4444" },
      ],
    },
    {
      title: "Framework Coverage",
      description: "Coverage by framework",
      panels: [
        { id: "owasp-coverage", title: "OWASP Top 10", type: "gauge", metrics: ["compliance_owasp_coverage"], width: 3, height: 1, color: "#8b5cf6", unit: "%" },
        { id: "pci-coverage", title: "PCI DSS", type: "gauge", metrics: ["compliance_pci_coverage"], width: 3, height: 1, color: "#3b82f6", unit: "%" },
        { id: "iso-coverage", title: "ISO 27001", type: "gauge", metrics: ["compliance_iso_coverage"], width: 3, height: 1, color: "#10b981", unit: "%" },
        { id: "nist-coverage", title: "NIST CSF", type: "gauge", metrics: ["compliance_nist_coverage"], width: 3, height: 1, color: "#22d3ee", unit: "%" },
      ],
    },
  ],
};

// ── 10. AI Dashboard ──────────────────────────────────────────────────────

const aiDashboard: DashboardDefinition = {
  id: "ai",
  name: "AI Dashboard",
  description: "AI engine performance, usage, and accuracy monitoring",
  icon: "🤖",
  category: "ai",
  refreshIntervalMs: 30_000,
  sections: [
    {
      title: "AI Engine Overview",
      description: "AI request volume and performance",
      panels: [
        { id: "ai-requests", title: "AI Requests/min", type: "stat", metrics: ["ai_requests_total"], width: 2, height: 1, color: "#22d3ee", unit: "req/min" },
        { id: "ai-latency", title: "Avg Processing Time", type: "stat", metrics: ["ai_request_duration_ms"], width: 2, height: 1, color: "#f97316", unit: "ms" },
        { id: "ai-cache-hit", title: "Cache Hit Rate", type: "stat", metrics: ["ai_cache_hits_total"], width: 2, height: 1, color: "#22c55e", unit: "%" },
        { id: "ai-errors", title: "Error Rate", type: "stat", metrics: ["ai_errors_total"], width: 2, height: 1, color: "#ef4444", unit: "%" },
        { id: "ai-rate-limit", title: "Rate Limit Remaining", type: "stat", metrics: ["ai_rate_limit_remaining"], width: 2, height: 1, color: "#eab308" },
        { id: "ai-cache-size", title: "Cache Size", type: "stat", metrics: ["ai_cache_size"], width: 2, height: 1, color: "#64748b" },
      ],
    },
    {
      title: "AI Engine Breakdown",
      description: "Performance by AI sub-engine",
      panels: [
        { id: "ai-engine-requests", title: "Requests by Engine", type: "bar", metrics: ["ai_engine_requests_total"], width: 4, height: 2 },
        { id: "ai-engine-latency", title: "Processing Time by Engine", type: "timeseries", metrics: ["ai_engine_processing_time_ms"], width: 4, height: 2 },
        { id: "ai-correlations", title: "Correlations Found", type: "stat", metrics: ["ai_correlations_found"], width: 2, height: 1, color: "#22d3ee" },
        { id: "ai-attack-chains", title: "Attack Chains Detected", type: "stat", metrics: ["ai_attack_chains_detected"], width: 2, height: 1, color: "#ef4444" },
      ],
    },
  ],
};

// ── 11. Performance Dashboard ──────────────────────────────────────────────

const performanceDashboard: DashboardDefinition = {
  id: "performance",
  name: "Performance Dashboard",
  description: "System-wide performance metrics, throughput, and latency analysis",
  icon: "⚡",
  category: "performance",
  refreshIntervalMs: 10_000,
  sections: [
    {
      title: "Request Throughput",
      description: "Request volume and latency percentiles across all services",
      panels: [
        { id: "global-rps", title: "Global Requests/sec", type: "stat", metrics: ["http_requests_total"], width: 2, height: 1, color: "#22d3ee", unit: "rps" },
        { id: "p50-latency", title: "P50 Latency", type: "stat", metrics: ["http_request_duration_ms{quantile=\"0.5\"}"], width: 2, height: 1, color: "#10b981", unit: "ms" },
        { id: "p95-latency", title: "P95 Latency", type: "stat", metrics: ["http_request_duration_ms{quantile=\"0.95\"}"], width: 2, height: 1, color: "#f97316", unit: "ms" },
        { id: "p99-latency", title: "P99 Latency", type: "stat", metrics: ["http_request_duration_ms{quantile=\"0.99\"}"], width: 2, height: 1, color: "#ef4444", unit: "ms" },
        { id: "error-rate-perf", title: "Error Rate", type: "stat", metrics: ["http_errors_total"], width: 2, height: 1, color: "#ef4444", unit: "%" },
        { id: "concurrent-reqs", title: "Concurrent Requests", type: "stat", metrics: ["http_concurrent_requests"], width: 2, height: 1, color: "#8b5cf6" },
      ],
    },
    {
      title: "Latency Distribution",
      description: "Latency heatmap and breakdown by route and method",
      panels: [
        { id: "latency-heatmap", title: "Latency Heatmap", type: "heatmap", metrics: ["http_request_duration_ms"], width: 6, height: 2 },
        { id: "latency-timeline", title: "Latency Timeline (P50/P95/P99)", type: "timeseries", metrics: ["http_request_duration_ms"], width: 6, height: 2 },
      ],
    },
    {
      title: "Service Breakdown",
      description: "Performance by service endpoint",
      panels: [
        { id: "slowest-routes", title: "Slowest Routes", type: "bar", metrics: ["http_request_duration_ms"], width: 4, height: 2 },
        { id: "throughput-trend", title: "Throughput Trend", type: "timeseries", metrics: ["http_requests_total"], width: 4, height: 2 },
        { id: "error-trend", title: "Error Trend", type: "timeseries", metrics: ["http_errors_total"], width: 4, height: 2 },
      ],
    },
  ],
};

// ── 12. System Health Dashboard ────────────────────────────────────────────

const systemHealthDashboard: DashboardDefinition = {
  id: "system-health",
  name: "System Health Dashboard",
  description: "Complete system health overview with all component status",
  icon: "❤️",
  category: "system",
  refreshIntervalMs: 10_000,
  sections: [
    {
      title: "Component Status",
      description: "Health status of all system components",
      panels: [
        { id: "api-health", title: "API Server", type: "stat", metrics: ["health_api"], width: 2, height: 1, color: "#22c55e" },
        { id: "db-health", title: "Database", type: "stat", metrics: ["health_database"], width: 2, height: 1, color: "#3b82f6" },
        { id: "queue-health", title: "Queue System", type: "stat", metrics: ["health_queue"], width: 2, height: 1, color: "#8b5cf6" },
        { id: "ai-health", title: "AI Engine", type: "stat", metrics: ["health_ai"], width: 2, height: 1, color: "#22d3ee" },
        { id: "worker-health", title: "Workers", type: "stat", metrics: ["health_workers"], width: 2, height: 1, color: "#10b981" },
        { id: "reporting-health", title: "Reporting Engine", type: "stat", metrics: ["health_reporting"], width: 2, height: 1, color: "#f97316" },
      ],
    },
    {
      title: "System Metrics",
      description: "Aggregate system performance",
      panels: [
        { id: "uptime", title: "Uptime", type: "stat", metrics: ["uptime_seconds"], width: 3, height: 1, color: "#22c55e", unit: "hours" },
        { id: "memory-heap", title: "Heap Memory", type: "stat", metrics: ["memory_heap_bytes"], width: 3, height: 1, color: "#8b5cf6", unit: "MB" },
        { id: "cpu-total", title: "Total CPU Time", type: "stat", metrics: ["cpu_usage_percent"], width: 3, height: 1, color: "#3b82f6", unit: "s" },
        { id: "queue-total", title: "Queue Depth", type: "stat", metrics: ["queue_depth"], width: 3, height: 1, color: "#eab308" },
      ],
    },
  ],
};

// ── Dashboard Registry ─────────────────────────────────────────────────────

export const ALL_DASHBOARDS: DashboardDefinition[] = [
  executiveDashboard,
  socDashboard,
  infraDashboard,
  workerDashboard,
  pluginDashboard,
  apiDashboard,
  databaseDashboard,
  securityDashboard,
  complianceDashboard,
  aiDashboard,
  performanceDashboard,
  systemHealthDashboard,
];

export const DASHBOARD_MAP = new Map<string, DashboardDefinition>(
  ALL_DASHBOARDS.map(d => [d.id, d]),
);

export function getDashboard(id: string): DashboardDefinition | undefined {
  return DASHBOARD_MAP.get(id);
}

export function listDashboards(): Array<{ id: string; name: string; description: string; icon: string; category: string; panelCount: number }> {
  return ALL_DASHBOARDS.map(d => ({
    id: d.id,
    name: d.name,
    description: d.description,
    icon: d.icon,
    category: d.category,
    panelCount: d.sections.reduce((sum, s) => sum + s.panels.length, 0),
  }));
}
