import type { ToolExecutorConfig, ToolResult, LogLevel } from "./types";

// ── Tool Executor Interface ─────────────────────────────────────────────────

export interface ToolExecutor {
  /** Unique name for this executor (for logging / diagnostics) */
  readonly name: string;

  /** Return true if this executor can handle the given tool name */
  canExecute(toolName: string): boolean;

  /**
   * Execute a security tool against a target.
   *
   * The implementation is responsible for:
   *   - spawning or invoking the tool
   *   - handling timeouts (via config.abortSignal / config.timeoutMs)
   *   - collecting stdout / stderr
   *   - capturing exit code
   *   - calling emitLog() with meaningful progress messages
   *   - calling emitProgress() as the tool advances
   *   - NOT parsing output — that is delegated to OutputParser
   *
   * Returns a ToolResult with raw stdout/stderr + zero findings.
   * Parsing is done by the ScanOrchestrator after execution.
   */
  execute(params: {
    toolName: string;
    toolPath: string;
    target: string;
    scanId: number;
    config: ToolExecutorConfig;
    emitLog: (level: LogLevel, message: string) => Promise<void>;
    emitProgress: (progress: number) => Promise<void>;
  }): Promise<ToolResult>;
}
