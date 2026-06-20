import { spawn } from "node:child_process";
import path from "node:path";
import { stat } from "node:fs/promises";
import type { ToolResult, LogLevel } from "../types";
import type { ToolExecutor } from "../executor.interface";

// ── Subprocess Executor ─────────────────────────────────────────────────────
//
// Runs any tool as a child process with:
//   - configurable timeout (via AbortSignal)
//   - stdout / stderr collection (capped to MAX_OUTPUT_CHARS)
//   - exit code and signal capture
//   - structured log emission
//   - progress emission (best-effort from stderr)

const MAX_OUTPUT_CHARS = 500_000;

export class SubprocessExecutor implements ToolExecutor {
  readonly name = "subprocess";

  /** Tools we *know* we can run as a subprocess. Accept any by default. */
  private readonly allowList: Set<string> | null;

  /**
   * @param allowList  — if provided, only these tool names are accepted.
   *                     null means accept any tool name.
   */
  constructor(allowList?: string[]) {
    this.allowList = allowList ? new Set(allowList.map((t) => t.toLowerCase())) : null;
  }

  canExecute(toolName: string): boolean {
    if (this.allowList === null) return true;
    return this.allowList.has(toolName.toLowerCase());
  }

  async execute(params: {
    toolName: string;
    toolPath: string;
    target: string;
    scanId: number;
    config: {
      timeoutMs: number;
      abortSignal: AbortSignal;
      useProxy: boolean;
      proxyUrl?: string;
      environment?: Record<string, string>;
    };
    emitLog: (level: LogLevel, message: string) => Promise<void>;
    emitProgress: (progress: number) => Promise<void>;
  }): Promise<ToolResult> {
    const { toolName, toolPath, target, config, emitLog, emitProgress } = params;
    const startedAt = new Date();

    await emitLog("info", `[${toolName.toUpperCase()}] Starting execution against ${target}`);

    // Build the command and arguments — override per-tool as needed
    const { command, args } = this.buildCommand(toolName, toolPath, target, config);

    await emitLog("debug", `[${toolName.toUpperCase()}] Command: ${command} ${args.join(" ")}`);

    const resolvedCwd = await this.resolveCwd(toolPath);

    return new Promise<ToolResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: resolvedCwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...config.environment,
          ...(config.useProxy && config.proxyUrl
            ? { HTTP_PROXY: config.proxyUrl, HTTPS_PROXY: config.proxyUrl }
            : {}),
        },
        shell: false,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      let signal: string | null = null;
      let timedOut = false;

      // ── Output collection ──────────────────────────────────────────────────

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout = (stdout + text).slice(-MAX_OUTPUT_CHARS);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr = (stderr + text).slice(-MAX_OUTPUT_CHARS);

        // Try to extract progress info from stderr (common in security tools)
        const pct = this.tryExtractProgress(text);
        if (pct !== null) {
          void emitProgress(pct);
        }
      });

      // ── Abort / Timeout handling ──────────────────────────────────────────

      const onAbort = () => {
        timedOut = true;
        child.kill("SIGTERM");
        // Give it 3 seconds to terminate gracefully, then SIGKILL
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // already dead
          }
        }, 3000);
      };

      if (config.abortSignal.aborted) {
        onAbort();
      } else {
        config.abortSignal.addEventListener("abort", onAbort, { once: true });
      }

      // Clean up abort listener when the process exits
      const removeAbortListener = () => {
        config.abortSignal.removeEventListener("abort", onAbort);
      };
      child.on("close", removeAbortListener);
      child.on("error", removeAbortListener);

      // ── Process exit ───────────────────────────────────────────────────────

      child.on("error", (err) => {
        void emitLog("error", `[${toolName.toUpperCase()}] Spawn error: ${err.message}`);
        resolve(this.makeResult(toolName, null, null, stdout, stderr, startedAt, [
          `Process spawn error: ${err.message}`,
        ]));
      });

      child.on("close", (code, sig) => {
        exitCode = code;
        signal = sig;
        const completedAt = new Date();

        if (timedOut) {
          void emitLog("warn", `[${toolName.toUpperCase()}] Timed out after ${config.timeoutMs}ms — SIGKILL sent`);
        } else if (code === 0) {
          void emitLog("success", `[${toolName.toUpperCase()}] Completed successfully (exit 0)`);
        } else {
          void emitLog("warn", `[${toolName.toUpperCase()}] Exited with code ${code} signal ${signal}`);
        }

        void emitProgress(100);

        resolve({
          toolName,
          exitCode,
          signal,
          stdout,
          stderr,
          findings: [],
          parsedSuccessfully: false,
          parseErrors: [],
          durationMs: completedAt.getTime() - startedAt.getTime(),
          startedAt,
          completedAt,
        });
      });
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildCommand(
    toolName: string,
    toolPath: string,
    target: string,
    config: { useProxy: boolean; wordlistPath?: string },
  ): { command: string; args: string[] } {
    const normalized = toolName.toLowerCase();

    // Each tool gets its own argument template
    switch (normalized) {
      case "nuclei": {
        // Nuclei supports JSONL output via -jsonl and -o
        return {
          command: toolPath,
          args: [
            "-target", target,
            "-jsonl",
            "-silent",
            "-timeout", "10",
            "-retries", "2",
            ...(config.useProxy ? ["-proxy-url", process.env["PROXY_URL"] ?? ""].filter(Boolean) : []),
          ],
        };
      }

      case "subfinder": {
        return {
          command: toolPath,
          args: ["-d", target.replace(/^https?:\/\//, "").split("/")[0], "-silent"],
        };
      }

      case "naabu": {
        return {
          command: toolPath,
          args: [
            "-host", target.replace(/^https?:\/\//, "").split("/")[0],
            "-silent",
            "-c", "50",
            "-top-ports", "1000",
          ],
        };
      }

      case "ffuf": {
        // ffuf requires a wordlist. First try the platform wordlist API, fall back to default.
        const wordlistPath = config.wordlistPath ?? "/usr/share/wordlists/dirb/common.txt";
        return {
          command: toolPath,
          args: [
            "-u", `${target}/FUZZ`,
            "-w", wordlistPath,
            "-c", "-t", "50",
            "-ac",
            "-o", "json",
          ],
        };
      }

      case "gobuster": {
        const wordlistPath = config.wordlistPath ?? "/usr/share/wordlists/dirb/common.txt";
        return {
          command: toolPath,
          args: [
            "dir",
            "-u", target,
            "-w", wordlistPath,
            "-t", "30",
            "-q",
            "-o", "/dev/stdout",
          ],
        };
      }

      case "dirsearch": {
        const wordlistPath = config.wordlistPath ?? "/usr/share/wordlists/dirb/common.txt";
        return {
          command: toolPath,
          args: [
            "-u", target,
            "-w", wordlistPath,
            "-t", "30",
            "--format", "json",
            "--plain-text-report", "/dev/stdout",
          ],
        };
      }

      default: {
        // Generic fallback: assume the tool accepts the target as its last argument
        return { command: toolPath, args: [target] };
      }
    }
  }

  /**
   * Try to extract a progress percentage from a stderr line.
   * Returns null if no progress could be parsed.
   */
  private tryExtractProgress(text: string): number | null {
    // Match patterns like "[1/100]" or "100/100" or "Progress: 45%"
    const progressMatch = text.match(/Progress:\s*(\d+)%/i);
    if (progressMatch) return Math.min(parseInt(progressMatch[1], 10), 100);

    const fractionMatch = text.match(/\[(\d+)\/(\d+)\]/);
    if (fractionMatch) {
      const current = parseInt(fractionMatch[1], 10);
      const total = parseInt(fractionMatch[2], 10);
      if (total > 0) return Math.min(Math.round((current / total) * 100), 100);
    }

    return null;
  }

  private async resolveCwd(toolPath: string): Promise<string | undefined> {
    try {
      const s = await stat(toolPath);
      if (s.isDirectory()) return toolPath;
      return path.dirname(toolPath);
    } catch {
      return undefined;
    }
  }

  private makeResult(
    toolName: string,
    exitCode: number | null,
    signal: string | null,
    stdout: string,
    stderr: string,
    startedAt: Date,
    parseErrors: string[],
  ): ToolResult {
    const completedAt = new Date();
    return {
      toolName,
      exitCode,
      signal,
      stdout,
      stderr,
      findings: [],
      parsedSuccessfully: false,
      parseErrors,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
    };
  }
}
