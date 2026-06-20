// ---------------------------------------------------------------------------
// Plugin SDK — Complete Type System
// ---------------------------------------------------------------------------
//
// Every plugin in the V8 ecosystem uses these types.
// No core platform code is modified when adding new plugins.
//
// Categories: scanner, recon, crawler, fuzzer, exploit, verification, AI,
//             reporting, parser, exporter, notification, authentication,
//             storage, cloud, container, SAST, DAST, IAST, SCA,
//             secrets, infrastructure, monitoring, compliance,
//             visualization, workflow, utility

import type { ToolResult, LogLevel, Finding, ToolExecutorConfig } from "../../engine/types";

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

export type PluginCategory =
  | "scanner" | "recon" | "crawler" | "fuzzer" | "exploit"
  | "verification" | "ai" | "reporting" | "parser" | "exporter"
  | "notification" | "authentication" | "storage" | "cloud" | "container"
  | "sast" | "dast" | "iast" | "sca"
  | "secrets_detection" | "infrastructure" | "monitoring" | "compliance"
  | "visualization" | "workflow" | "utility" | "network" | "web"
  | "api" | "kubernetes" | "password" | "osint" | "mobile"
  | "wireless" | "iot" | "active_directory"
  | "malware_analysis" | "reverse_engineering"
  | "source_code" | "supply_chain" | "cicd" | "tool";

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN MANIFEST
// ═══════════════════════════════════════════════════════════════════════════

export interface PluginManifest {
  /** Unique plugin ID (e.g. "com.v8platform.nuclei") */
  id: string;
  /** Display name */
  name: string;
  /** Semantic version (semver) */
  version: string;
  /** Short description */
  description: string;
  /** Plugin author */
  author: string;
  /** License identifier (MIT, Apache-2.0, GPL-3.0, etc.) */
  license: string;
  /** Repository URL */
  repository: string;
  /** Homepage URL */
  homepage?: string;
  /** Documentation URL */
  documentationUrl?: string;
  /** Plugin category */
  category: PluginCategory;
  /** Supported platforms */
  supportedPlatforms: Platform[];
  /** Supported architectures */
  supportedArchitectures: Architecture[];
  /** Minimum V8 platform version required */
  minPlatformVersion: string;
  /** Maximum V8 platform version allowed */
  maxPlatformVersion?: string;
  /** Required plugin dependencies (IDs) */
  dependencies: string[];
  /** Optional plugin dependencies (IDs) */
  optionalDependencies: string[];
  /** Required permissions */
  permissions: PluginPermissionRequest[];
  /** Network requirements */
  networkRequirements: NetworkRequirements;
  /** Resource limits */
  resourceLimits: PluginResourceLimits;
  /** Default configuration values */
  defaultConfig: Record<string, unknown>;
  /** Health check configuration */
  healthCheck: PluginHealthCheckConfig;
  /** Entry point (relative path to main module) */
  entryPoint: string;
  /** Supported input types */
  inputTypes: string[];
  /** Supported output types */
  outputTypes: string[];
  /** Events this plugin subscribes to */
  subscribedEvents: string[];
  /** Events this plugin publishes */
  publishedEvents: string[];
  /** Digital signature (base64-encoded) */
  digitalSignature?: string;
  /** File checksum (SHA-256 hex) */
  checksum?: string;
  /** Release notes URL or inline text */
  releaseNotes?: string;
  /** Search/filter tags */
  tags: string[];
  /** Whether the plugin is enabled */
  enabled: boolean;
}

export type Platform = "linux/amd64" | "linux/arm64" | "darwin/amd64" | "darwin/arm64" | "windows/amd64" | "all";
export type Architecture = "amd64" | "arm64" | "x86" | "all";

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PluginPermissionRequest {
  permission: PluginPermission;
  reason: string;
  required: boolean;
}

export type PluginPermission =
  | "network:access"
  | "network:raw_socket"
  | "filesystem:read"
  | "filesystem:write"
  | "internet:access"
  | "secrets:access"
  | "storage:access"
  | "notification:send"
  | "ai:access"
  | "worker:spawn"
  | "cloud:access"
  | "api:access"
  | "shell:execute"
  | "audit:read"
  | "audit:write"
  | "plugin:install"
  | "plugin:uninstall"
  | "scan:create"
  | "scan:read"
  | "scan:manage"
  | "vulnerability:read"
  | "vulnerability:write"
  | "report:generate";

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE LIMITS
// ═══════════════════════════════════════════════════════════════════════════

export interface PluginResourceLimits {
  /** CPU cores (e.g. "1", "2", "0.5") */
  cpu: string;
  /** Memory limit (e.g. "512m", "1g", "2g") */
  memory: string;
  /** Max execution timeout in seconds */
  timeout: number;
  /** Max disk usage in bytes */
  maxDisk: number;
  /** Max stdout/stderr size in bytes */
  maxOutput: number;
  /** Max number of file descriptors */
  maxFileDescriptors: number;
  /** Max number of processes/threads */
  maxProcesses: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface NetworkRequirements {
  /** Whether internet access is required */
  internetAccess: boolean;
  /** Whether raw sockets are required (for nmap, naabu, etc.) */
  rawSockets: boolean;
  /** Whether to allow outbound connections */
  outboundConnections: boolean;
  /** Whether to allow inbound connections */
  inboundConnections: boolean;
  /** Allowed domains (empty = any) */
  allowedDomains: string[];
  /** Allowed ports (empty = any) */
  allowedPorts: number[];
  /** Whether DNS resolution is required */
  dnsResolution: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

export interface PluginHealthCheckConfig {
  /** Health check interval in seconds (0 = disabled) */
  interval: number;
  /** Health check timeout in seconds */
  timeout: number;
  /** Command or function to check health */
  type: "command" | "http" | "function";
  /** Command to run (for type=command) */
  command?: string;
  /** Expected exit code */
  expectedExitCode?: number;
  /** Expected output contains */
  expectedOutput?: string;
  /** HTTP URL to check (for type=http) */
  httpUrl?: string;
  /** Expected HTTP status code */
  expectedStatusCode?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE STATE
// ═══════════════════════════════════════════════════════════════════════════

export type PluginLifecycleState =
  | "discovered"       // Found but not installed
  | "downloaded"       // Downloaded to local storage
  | "extracted"        // Extracted from archive
  | "verified"         // Signature/checksum verified
  | "dependencies_resolved"
  | "configured"       // Default configuration applied
  | "registered"       // Registered with registry
  | "initialized"      // initialize() called successfully
  | "healthy"          // Health check passed
  | "running"          // Currently executing
  | "updating"         // Update in progress
  | "disabled"         // Disabled by admin
  | "broken"           // Fatal error state
  | "removed";         // Uninstalled

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

export type ExecutionEnvironmentType =
  | "docker"
  | "podman"
  | "kubernetes_job"
  | "firecracker_microvm"
  | "remote_worker"
  | "dedicated_worker"
  | "subprocess";

export interface ExecutionEnvironment {
  type: ExecutionEnvironmentType;
  image?: string;
  cpu: string;
  memory: string;
  disk: string;
  network: "none" | "bridge" | "host" | "restricted";
  readOnlyRootfs: boolean;
  dropCapabilities: string[];
  addCapabilities: string[];
  environmentVariables: Record<string, string>;
  secrets: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSION INFORMATION
// ═══════════════════════════════════════════════════════════════════════════

export interface VersionInfo {
  version: string;
  publishedAt: string;
  releaseNotes: string;
  checksum: string;
  digitalSignature: string;
  downloadUrl: string;
  isBreaking: boolean;
  minPlatformVersion: string;
  maxPlatformVersion?: string;
  dependencies: Record<string, string>; // pluginId -> version range
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  category: PluginCategory;
  author: string;
  publisher: string;
  publisherVerified: boolean;
  license: string;
  latestVersion: string;
  githubUrl: string;
  homepage: string;
  documentationUrl: string;
  screenshots: string[];
  rating: number;
  downloadCount: number;
  securityScore: number;
  compatibilityScore: number;
  tags: string[];
  updatedAt: string;
  createdAt: string;
}

export interface MarketplaceSearchFilter {
  query?: string;
  category?: PluginCategory;
  author?: string;
  minRating?: number;
  maxRating?: number;
  minSecurityScore?: number;
  tags?: string[];
  sortBy?: "rating" | "downloads" | "updated" | "name";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface MarketplaceSearchResult {
  plugins: MarketplacePlugin[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN SDK INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface PluginExecutionContext {
  scanId: number;
  target: string;
  config: Record<string, unknown>;
  timeoutMs: number;
  signal: AbortSignal;
  log: (level: LogLevel, message: string) => Promise<void>;
  progress: (pct: number) => Promise<void>;
  storage: StorageAPI;
  secrets: SecretsAPI;
  events: EventAPI;
  auth: AuthHelpers;
}

export interface StorageAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface SecretsAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EventAPI {
  emit(type: string, data: Record<string, unknown>): Promise<void>;
  on(type: string, handler: (data: Record<string, unknown>) => void): () => void;
}

export interface AuthHelpers {
  getToken(): Promise<string | null>;
  refreshToken(): Promise<string>;
  hasPermission(permission: PluginPermission): boolean;
}

export interface MetricsAPI {
  increment(counter: string, value?: number): void;
  gauge(name: string, value: number): void;
  timing(name: string, durationMs: number): void;
}

export interface WorkerAPI {
  spawn(config: { task: string; payload: Record<string, unknown> }): Promise<string>;
  getStatus(workerId: string): Promise<string>;
  cancel(workerId: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "multiselect" | "secret" | "json";
  description: string;
  required: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface ConfigSchema {
  fields: ConfigField[];
  version: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface PluginExecutionResult {
  success: boolean;
  findings: Finding[];
  toolResult: ToolResult;
  metrics: {
    durationMs: number;
    cpuUsage: number;
    memoryUsage: number;
    outputSize: number;
  };
  errors: string[];
  warnings: string[];
}
