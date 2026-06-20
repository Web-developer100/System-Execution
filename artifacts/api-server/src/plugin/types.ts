// ---------------------------------------------------------------------------
// Plugin System Types
// ---------------------------------------------------------------------------
//
// The plugin system allows unlimited tools to be added without modifying
// the core platform. Plugins are hot-loadable — they can be added, enabled,
// or disabled without restarting the system.
//
// Each plugin encapsulates:
//   - Tool execution (executor)
//   - Output parsing (parser)
//   - Capability detection
//   - Health monitoring
//   - Update policy
//   - AI rules
//   - Resource limits
//   - Security profile

import type { ToolResult, LogLevel, ToolExecutorConfig, Finding } from "../engine/types";

// ── Plugin Manifest ─────────────────────────────────────────────────────────

export interface PluginManifest {
  /** Unique plugin name (e.g. "nuclei", "nmap") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description */
  description: string;
  /** Category for automatic classification */
  category: PluginCategory;
  /** Plugin author */
  author: string;
  /** Semantic version */
  version: string;
  /** Minimum platform version required */
  minPlatformVersion: string;
  /** GitHub repository URL */
  repository: string;
  /** Programming language */
  language: string;
  /** License */
  license: string;
  /** Tags for search/filtering */
  tags: string[];
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** Resource limits for this plugin */
  resourceLimits: PluginResourceLimits;
  /** Security sandbox profile */
  securityProfile: PluginSecurityProfile;
  /** Input types this plugin accepts */
  inputTypes: string[];
  /** Output types this plugin produces */
  outputTypes: string[];
  /** AI rules for this plugin's findings */
  aiRules: PluginAiRules;
  /** Health check configuration */
  healthCheck: PluginHealthCheck;
  /** Update policy */
  updatePolicy: PluginUpdatePolicy;
}

// ── Plugin Category ─────────────────────────────────────────────────────────

export type PluginCategory =
  | "web" | "api" | "cloud" | "kubernetes" | "network"
  | "active_directory" | "wireless" | "iot" | "mobile"
  | "osint" | "recon" | "crawler" | "scanner" | "fuzzer"
  | "exploit" | "password" | "secrets" | "container"
  | "cicd" | "source_code" | "supply_chain" | "ai"
  | "malware_analysis" | "reverse_engineering"
  | "tool"; // Generic fallback

// ── Resource Limits ─────────────────────────────────────────────────────────

export interface PluginResourceLimits {
  /** CPU cores (e.g. "1", "2") */
  cpu: string;
  /** Memory limit (e.g. "512m", "1g") */
  memory: string;
  /** Max execution timeout in seconds */
  timeout: number;
  /** Max stdout size in bytes */
  maxStdout: number;
  /** Whether network access is allowed */
  networkAllowed: boolean;
  /** Whether filesystem write access is allowed */
  filesystemWritable: boolean;
}

// ── Security Profile ────────────────────────────────────────────────────────

export interface PluginSecurityProfile {
  /** Docker capabilities to drop */
  dropCapabilities: string[];
  /** Docker capabilities to add */
  addCapabilities: string[];
  /** Whether to run with read-only rootfs */
  readOnlyRootfs: boolean;
  /** Whether to allow privilege escalation */
  allowPrivilegeEscalation: boolean;
  /** Seccomp profile (default, unconfined, or custom) */
  seccompProfile: "default" | "unconfined" | string;
  /** AppArmor profile */
  appArmorProfile: string;
}

// ── AI Rules ────────────────────────────────────────────────────────────────

export interface PluginAiRules {
  /** Prompt template for AI validation of this plugin's findings */
  validationPrompt?: string;
  /** CWE IDs this plugin typically detects */
  cweIds: string[];
  /** MITRE ATT&CK technique IDs */
  mitreIds: string[];
  /** Default severity mapping */
  severityMapping: Record<string, string>;
  /** Whether the AI should auto-validate findings from this plugin */
  autoValidate: boolean;
  /** Minimum confidence threshold for auto-confirmation */
  confidenceThreshold: number;
}

// ── Health Check ────────────────────────────────────────────────────────────

export interface PluginHealthCheck {
  /** Command to run for health check */
  command: string;
  /** Expected exit code */
  expectedExitCode: number;
  /** Expected stdout contains */
  expectedOutput?: string;
  /** Health check interval in seconds */
  interval: number;
  /** Timeout for health check in seconds */
  timeout: number;
}

// ── Update Policy ───────────────────────────────────────────────────────────

export interface PluginUpdatePolicy {
  /** How to check for updates: "git" | "github_release" | "manual" */
  checkMode: "git" | "github_release" | "manual";
  /** Whether to auto-update */
  autoUpdate: boolean;
  /** Whether to rollback on failure */
  rollbackOnFailure: boolean;
  /** Branch to track */
  branch: string;
  /** Whether breaking changes are detected */
  detectBreakingChanges: boolean;
}

// ── Plugin State (runtime) ──────────────────────────────────────────────────

export type PluginHealthState =
  | "installed"
  | "healthy"
  | "broken"
  | "deprecated"
  | "offline"
  | "repository_deleted"
  | "dependency_failure"
  | "update_available"
  | "security_warning"
  | "abandoned";

export interface PluginState {
  manifest: PluginManifest;
  health: PluginHealthState;
  lastHealthCheck: Date | null;
  /** Execution statistics */
  stats: PluginStats;
  /** Whether the plugin is currently loaded */
  loaded: boolean;
  /** Load error message if any */
  loadError: string | null;
}

export interface PluginStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDurationMs: number;
  averageAccuracy: number;
  falsePositiveRate: number;
  cpuUsage: number;
  ramUsage: number;
  lastExecutedAt: Date | null;
}

// ── Plugin Interface (what a plugin must implement) ─────────────────────────

export interface Plugin {
  /** Plugin manifest */
  readonly manifest: PluginManifest;

  /** Initialize the plugin (called when loaded) */
  initialize(): Promise<void>;

  /** Shutdown the plugin (called when unloaded) */
  shutdown(): Promise<void>;

  /** Execute the plugin tool against a target */
  execute(params: {
    toolName: string;
    toolPath: string;
    target: string;
    scanId: number;
    config: ToolExecutorConfig;
    emitLog: (level: LogLevel, message: string) => Promise<void>;
    emitProgress: (progress: number) => Promise<void>;
  }): Promise<ToolResult>;

  /** Parse raw output from the plugin tool */
  parse(params: {
    toolName: string;
    scanId: number;
    target: string;
    stdout: string;
    stderr: string;
  }): Finding[];

  /** Run health check */
  healthCheck(): Promise<PluginHealthState>;

  /** Get current version */
  getVersion(): Promise<string>;
}

// ── Plugin Package Structure ────────────────────────────────────────────────

export interface PluginPackage {
  /** The plugin manifest file */
  manifest: PluginManifest;
  /** Plugin code (executor) */
  executor?: unknown;
  /** Plugin parser */
  parser?: unknown;
  /** Dependencies required by this plugin */
  dependencies: string[];
}
