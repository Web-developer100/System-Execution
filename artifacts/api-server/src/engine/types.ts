// ---------------------------------------------------------------------------
// Engine types — shared across executor, parser, queue, and orchestrator
// ---------------------------------------------------------------------------

export type ScanStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type LogLevel = "info" | "warn" | "error" | "success" | "debug";

// ── Scan Job ────────────────────────────────────────────────────────────────

export interface ScanJob {
  id: number;
  target: string;
  tools: string[];
  useProxy: boolean;
  status: ScanStatus;
  progress: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

// ── Vulnerability Finding ───────────────────────────────────────────────────

export interface Finding {
  /** Database ID (optional for pre-persistence findings) */
  id?: number;
  scanId: number;
  title: string;
  severity: FindingSeverity;
  url: string;
  description: string | null;
  evidence: string | null;
  fix: string | null;
  toolName: string;
  templateId: string | null;
  cveIds: string[];
  cweIds: string[];
  rawOutput: string | null;
}

// ── Individual Tool Execution Result ────────────────────────────────────────

export interface ToolResult {
  toolName: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  findings: Finding[];
  parsedSuccessfully: boolean;
  parseErrors: string[];
  /** Duration in milliseconds */
  durationMs: number;
  startedAt: Date;
  completedAt: Date;
}

// ── Complete Scan Result ────────────────────────────────────────────────────

export interface ScanResult {
  scanId: number;
  target: string;
  status: ScanStatus;
  findings: Finding[];
  toolResults: ToolResult[];
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  error: string | null;
}

// ── Executor Configuration ──────────────────────────────────────────────────

export interface ToolExecutorConfig {
  /** Maximum time in ms before the tool is killed */
  timeoutMs: number;
  /** Abort signal to cancel execution */
  abortSignal: AbortSignal;
  /** Whether to route through the proxy pool */
  useProxy: boolean;
  /** Proxy URL if proxy routing is enabled */
  proxyUrl?: string;
  /** Extra environment variables for the subprocess */
  environment?: Record<string, string>;
  /** Path to a wordlist file for fuzzing/content discovery tools */
  wordlistPath?: string;
}

// ── Execution Context (passed to executor) ──────────────────────────────────

export interface ToolExecutionContext {
  /** Short tool name (e.g. "nuclei", "nmap") */
  toolName: string;
  /** Resolved filesystem path to the tool binary / directory */
  toolPath: string;
  /** The scan target (URL, IP, domain) */
  target: string;
  /** Scan ID for correlation */
  scanId: number;
  /** Configuration for this execution */
  config: ToolExecutorConfig;
  /** Emit a structured log line */
  emitLog: (level: LogLevel, message: string) => Promise<void>;
  /** Report progress percentage (0-100) */
  emitProgress: (progress: number) => Promise<void>;
}

import type { ToolExecutor } from "./executor.interface";

// ── Executor Registration ───────────────────────────────────────────────────

export interface ExecutorRegistration {
  executor: ToolExecutor;
  /** Priority: lower numbers are tried first when multiple executors claim the same tool */
  priority: number;
}

// ── Job Queue Types ─────────────────────────────────────────────────────────

export type JobEventType =
  | "queued"
  | "started"
  | "progress"
  | "log"
  | "completed"
  | "failed"
  | "stopped";

export interface JobEvent {
  type: JobEventType;
  scanId: number;
  timestamp: Date;
  data: Record<string, unknown>;
}

export type JobEventCallback = (event: JobEvent) => void;
