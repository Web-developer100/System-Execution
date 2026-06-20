// ---------------------------------------------------------------------------
// Distributed Platform — Shared Types
// ---------------------------------------------------------------------------

// ── Worker Types ──────────────────────────────────────────────────────────

export type WorkerCategory =
  | "general" | "recon" | "web_scanning" | "api_scanning" | "cloud"
  | "container" | "ai" | "verification" | "reporting"
  | "heavy_compute" | "gpu" | "custom_enterprise";

export type WorkerHealthStatus = "healthy" | "degraded" | "unhealthy" | "offline";

export interface WorkerRegistration {
  workerId: string;
  hostname: string;
  os: string;
  architecture: string;
  cpuCores: number;
  cpuUsage: number;
  ramTotalMb: number;
  ramAvailableMb: number;
  diskTotalMb: number;
  diskAvailableMb: number;
  gpuInfo: string | null;
  dockerVersion: string | null;
  kubernetesVersion: string | null;
  installedPlugins: string[];
  workerVersion: string;
  platformVersion: string;
  region: string;
  availabilityZone: string;
  ipAddress: string;
  healthStatus: WorkerHealthStatus;
  currentLoad: number;
  capabilities: string[];
  tags: string[];
  categories: WorkerCategory[];
  heartbeatIntervalMs: number;
}

export interface WorkerState {
  registration: WorkerRegistration;
  lastHeartbeat: Date;
  connectedAt: Date;
  activeJobs: number;
  maxJobs: number;
  totalJobsCompleted: number;
  totalJobsFailed: number;
  averageJobDurationMs: number;
}

// ── Queue Types ───────────────────────────────────────────────────────────

export type QueueType = "fifo" | "priority" | "scheduled" | "delayed" | "retry" | "dead_letter" | "dependency";

export interface DistributedJob {
  id: string;
  scanId: number;
  priority: number;
  queueType: QueueType;
  type: string;
  target: string;
  toolName: string;
  workflowId: string | null;
  workflowStepId: string | null;
  dependencies: string[];
  retryCount: number;
  maxRetries: number;
  status: QueuedJobStatus;
  assignedWorker: string | null;
  createdAt: Date;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  timeoutMs: number;
  progress: number;
  logs: string[];
  error: string | null;
  artifacts: string[];
}

export type QueuedJobStatus =
  | "pending" | "queued" | "scheduled" | "running"
  | "completed" | "failed" | "retrying" | "dead_letter"
  | "cancelled" | "dependency_waiting";

// ── Scheduling Types ──────────────────────────────────────────────────────

export interface SchedulingDecision {
  jobId: string;
  workerId: string | null;
  reason: string;
  estimatedStartDelay: number;
  score: number;
}

export interface WorkerLoadMetrics {
  workerId: string;
  cpuUsage: number;
  ramUtilization: number;
  activeJobs: number;
  maxJobs: number;
  queueDepth: number;
  avgJobDurationMs: number;
  failureRate: number;
  score: number;
}

// ── Workflow Types ────────────────────────────────────────────────────────

export type WorkflowStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface WorkflowDefinition {
  id: string;
  name: string;
  scanId: number;
  target: string;
  steps: WorkflowStepDefinition[];
  status: WorkflowStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  toolName: string;
  category: string;
  dependsOn: string[];
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  resourceLimits: {
    cpu: string;
    memory: string;
    disk: string;
  };
  status: WorkflowStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  attemptCount: number;
  error: string | null;
}

// ── Artifact Types ────────────────────────────────────────────────────────

export type ArtifactType =
  | "log" | "json_result" | "xml_result" | "screenshot"
  | "http_request" | "http_response" | "payload"
  | "report" | "evidence" | "pcap" | "temp_file";

export interface ArtifactRecord {
  id: string;
  scanId: number;
  jobId: string;
  toolName: string;
  type: ArtifactType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: Date;
  expiresAt: Date | null;
  metadata: Record<string, string>;
}

// ── Secrets Types ─────────────────────────────────────────────────────────

export interface SecretEntry {
  id: string;
  key: string;
  value: string;
  scope: "global" | "worker" | "plugin" | "scan";
  scopeId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  rotationCount: number;
}

// ── Fault Tolerance Types ─────────────────────────────────────────────────

export interface FailureEvent {
  workerId: string;
  jobId: string | null;
  type: "worker_crash" | "job_timeout" | "heartbeat_missed" | "execution_error";
  timestamp: Date;
  details: string;
  recovered: boolean;
  recoveryAction: string | null;
}

// ── Metric Types ──────────────────────────────────────────────────────────

export interface PrometheusMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  help: string;
  type: "gauge" | "counter" | "histogram";
}

// ── Health Check Types ────────────────────────────────────────────────────

export interface HealthCheckResult {
  workerId: string;
  status: WorkerHealthStatus;
  timestamp: Date;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
    load: number;
    uptimeSeconds: number;
  };
  pluginsHealthy: number;
  pluginsUnhealthy: number;
  latencyMs: number;
}
