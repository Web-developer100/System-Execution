import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { db, toolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ToolResult, LogLevel } from "../types";
import type { ToolExecutor } from "../executor.interface";

// ── Docker Executor ────────────────────────────────────────────────────────
//
// Runs security tools inside isolated Docker containers with:
//   - Resource limits (CPU, memory)
//   - Network isolation (restricted / bridge / none)
//   - Read-only root filesystem
//   - Automatic container cleanup after execution
//   - Async operations throughout (no execSync — never blocks the event loop)
//   - Configurable Docker image per tool (from DB or fallback)
//
// Sandbox configuration is read from the tool's `sandboxProfile` JSON field
// stored in the database during installation.
//
// Priority: DockerExecutor is registered at priority 50 (higher than
// SubprocessExecutor's 100).  canExecute() returns `false` when the Docker
// daemon is unreachable, which allows the orchestrator to fall through to
// the subprocess executor automatically.

interface SandboxProfile {
  engine: string;
  network: "bridge" | "host" | "none" | "restricted";
  cpu: string;
  memory: string;
  filesystem: "temporary" | "persistent" | "readonly";
  cleanup: boolean;
}

const DEFAULT_PROFILE: SandboxProfile = {
  engine: "docker",
  network: "restricted",
  cpu: "1",
  memory: "1024m",
  filesystem: "temporary",
  cleanup: true,
};

const MAX_OUTPUT_CHARS = 500_000;

/** How often (ms) we re-check docker availability */
const DOCKER_AVAILABILITY_TTL = 60_000;

// ── Async helpers (promisified execFile, never execSync) ───────────────────

function execFileAsync(
  file: string,
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = execFile(file, args, {
      timeout: options.timeout,
      maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
      windowsHide: true,
    },    (err, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        // When err is set but code is null (e.g. timeout), use -1 to indicate abnormal exit
        exitCode: err ? (typeof err.code === 'number' ? err.code : -1) : 0,
      });
    });
  });
}

export class DockerExecutor implements ToolExecutor {
  readonly name = "docker";

  private _dockerAvailable: boolean | null = null;
  private _lastDockerCheck = 0;

  // ── Tool Executor Interface ──────────────────────────────────────────────

  /**
   * Returns true only if Docker is confirmed available.
   * When Docker is unavailable, returns false so the orchestrator falls
   * through to SubprocessExecutor automatically.
   */
  canExecute(_toolName: string): boolean {
    // Use cached result if within TTL
    if (this._dockerAvailable !== null && Date.now() - this._lastDockerCheck < DOCKER_AVAILABILITY_TTL) {
      return this._dockerAvailable;
    }

    // Trigger an async refresh (don't await — cache will be updated)
    // For the current call, use the stale cached value or optimistically
    // return true if we've never checked before.
    if (this._dockerAvailable === null) {
      this.refreshDockerAvailability().catch(() => {});
      return true; // optimistic — first call assumes available
    }

    return this._dockerAvailable;
  }

  private async refreshDockerAvailability(): Promise<boolean> {
    try {
      const { exitCode } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
      });
      this._dockerAvailable = exitCode === 0;
    } catch {
      this._dockerAvailable = false;
    }
    this._lastDockerCheck = Date.now();
    return this._dockerAvailable ?? false;
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

    // ── Confirm Docker is available ───────────────────────────────────────

    const dockerOk = await this.refreshDockerAvailability();
    if (!dockerOk) {
      void emitLog("error", `[DOCKER:${toolName.toUpperCase()}] Docker daemon unreachable`);
      return this.failedResult(toolName, startedAt, [
        "Docker daemon is not available on this host.",
      ]);
    }

    // ── Resolve the Docker image ──────────────────────────────────────────

    const resolved = await this.resolveImage(toolName, toolPath);
    if (!resolved) {
      void emitLog("warn", `[DOCKER:${toolName.toUpperCase()}] No Docker image configured`);
      return this.failedResult(toolName, startedAt, [
        `No Docker image is available for tool "${toolName}".`,
      ]);
    }

    const { image, useLocalMount } = resolved;

    // ── Parse sandbox profile ─────────────────────────────────────────────

    const profile = await this.loadSandboxProfile(toolName);

    void emitLog("info", `[DOCKER:${toolName.toUpperCase()}] Image: ${image} | CPU: ${profile.cpu} | MEM: ${profile.memory} | NET: ${profile.network}`);

    // ── Ensure image is pulled (async, non-blocking) ─────────────────────

    await this.ensureImage(image, toolName, emitLog);

    // ── Build docker run args ─────────────────────────────────────────────

    const containerName = `v8-${toolName}-${randomUUID().slice(0, 8)}`;

    const dockerArgs = this.buildDockerArgs({
      toolName,
      toolPath,
      target,
      image,
      containerName,
      profile,
      useLocalMount,
      useProxy: config.useProxy,
      proxyUrl: config.proxyUrl,
      env: config.environment,
    });

    const command = "docker";
    void emitLog("debug", `[DOCKER:${toolName.toUpperCase()}] docker ${dockerArgs.join(" ")}`);

    // ── Execute ───────────────────────────────────────────────────────────

    return new Promise<ToolResult>((resolve) => {
      const child = spawn(command, dockerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        shell: false,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // ── Output collection ──────────────────────────────────────────────

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = (stdout + chunk.toString()).slice(-MAX_OUTPUT_CHARS);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr = (stderr + text).slice(-MAX_OUTPUT_CHARS);

        const pct = this.tryExtractProgress(text);
        if (pct !== null) void emitProgress(pct);
      });

      // ── Abort handling ──────────────────────────────────────────────────

      const onAbort = async () => {
        timedOut = true;
        void emitLog("warn", `[DOCKER:${toolName.toUpperCase()}] Abort — stopping container ${containerName}`);

        await execFileAsync("docker", ["stop", "--time", "5", containerName], { timeout: 10_000 }).catch(() => {});

        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // already dead
          }
          execFileAsync("docker", ["rm", "--force", containerName], { timeout: 5_000 }).catch(() => {});
        }, 3000);
      };

      const abortHandler = () => { void onAbort(); };

      if (config.abortSignal.aborted) {
        void onAbort();
      } else {
        config.abortSignal.addEventListener("abort", abortHandler, { once: true });
      }

      const removeAbortListener = () => {
        config.abortSignal.removeEventListener("abort", abortHandler);
      };

      // ── Process lifecycle ──────────────────────────────────────────────

      child.on("error", (err) => {
        removeAbortListener();
        void emitLog("error", `[DOCKER:${toolName.toUpperCase()}] Spawn error: ${err.message}`);
        resolve(this.makeResult(toolName, null, null, stdout, stderr, startedAt, [
          `Docker spawn error: ${err.message}`,
        ]));
      });

      child.on("close", (code, sig) => {
        removeAbortListener();
        const completedAt = new Date();

        if (timedOut) {
          void emitLog("warn", `[DOCKER:${toolName.toUpperCase()}] Timed out — container killed`);
        } else if (code === 0) {
          void emitLog("success", `[DOCKER:${toolName.toUpperCase()}] Completed (exit 0)`);
        } else {
          void emitLog("warn", `[DOCKER:${toolName.toUpperCase()}] Exited code ${code} signal ${sig}`);
        }

        void emitProgress(100);

        resolve({
          toolName,
          exitCode: code,
          signal: sig,
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

  // ── Docker availability (async, cached) ──────────────────────────────────

  // ── Image resolution ─────────────────────────────────────────────────────

  private async resolveImage(
    toolName: string,
    toolPath: string,
  ): Promise<{ image: string; useLocalMount: boolean } | null> {
    try {
      const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.name, toolName));

      if (tool) {
        if (tool.dockerImage) {
          return { image: tool.dockerImage, useLocalMount: true };
        }

        if (tool.sandboxProfile) {
          try {
            const profile = JSON.parse(tool.sandboxProfile) as Partial<SandboxProfile> & { image?: string };
            if (profile.image) {
              return { image: profile.image, useLocalMount: true };
            }
          } catch {
            // Invalid JSON — skip
          }
        }

        if (tool.localPath) {
          return { image: "ubuntu:24.04", useLocalMount: true };
        }
      }
    } catch {
      // DB error — fall through
    }

    // Try a tool-specific image name as fallback
    return { image: `v8-tool-${toolName}`, useLocalMount: false };
  }

  // ── Sandbox profile ──────────────────────────────────────────────────────

  private async loadSandboxProfile(toolName: string): Promise<SandboxProfile> {
    try {
      const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.name, toolName));
      if (tool?.sandboxProfile) {
        const parsed = JSON.parse(tool.sandboxProfile) as Partial<SandboxProfile>;
        return { ...DEFAULT_PROFILE, ...parsed };
      }
    } catch {
      // DB error — use defaults
    }
    return { ...DEFAULT_PROFILE };
  }

  // ── Async image pull ────────────────────────────────────────────────────

  private async ensureImage(
    image: string,
    toolName: string,
    emitLog: (level: LogLevel, msg: string) => Promise<void>,
  ): Promise<void> {
    // Check if image exists locally (async, non-blocking)
    const inspectResult = await execFileAsync("docker", ["image", "inspect", image, "--format", "{{.Id}}"], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });

    if (inspectResult.exitCode === 0) return; // Image exists

    void emitLog("info", `[DOCKER:${toolName.toUpperCase()}] Pulling image: ${image}`);

    const pullResult = await execFileAsync("docker", ["pull", image], {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (pullResult.exitCode === 0) {
      void emitLog("success", `[DOCKER:${toolName.toUpperCase()}] Image pulled: ${image}`);
    } else {
      void emitLog("warn", `[DOCKER:${toolName.toUpperCase()}] Image pull failed: ${pullResult.stderr.slice(0, 500)}`);
    }
  }

  // ── Docker args builder ──────────────────────────────────────────────────

  private buildDockerArgs(params: {
    toolName: string;
    toolPath: string;
    target: string;
    image: string;
    containerName: string;
    profile: SandboxProfile;
    useLocalMount: boolean;
    useProxy: boolean;
    proxyUrl?: string;
    env?: Record<string, string>;
  }): string[] {
    const { toolName, toolPath, target, image, containerName, profile, useLocalMount, useProxy, proxyUrl, env } = params;
    const args: string[] = [];

    args.push("run", "--rm");

    // Resource limits
    args.push("--memory", profile.memory);
    // Set memory+swap to 2x memory to prevent OOM kills from small swap usage
    const memBytes = this.parseMemoryBytes(profile.memory);
    if (memBytes > 0) {
      args.push("--memory-swap", String(memBytes * 2));
    }
    args.push("--cpus", profile.cpu);

    // Network isolation
    const networkMode = profile.network === "restricted" ? "bridge" : profile.network;
    args.push("--network", networkMode);
    // For restricted mode, use bridge but don't publish any ports.
    // The container can still reach the internet (needed for scanning).

    // Read-only filesystem
    if (profile.filesystem === "readonly" || profile.filesystem === "temporary") {
      args.push("--read-only");
      // Allow writes to /tmp for tools that need it
      args.push("--tmpfs", "/tmp:size=64M,noexec,nosuid,nodev");
    }

    // Mount tool directory if available
    if (useLocalMount) {
      args.push("-v", `${toolPath}:/tool:ro`);
      args.push("--workdir", "/tool");
    }

    // Security hardening
    args.push("--security-opt", "no-new-privileges:true");
    args.push("--cap-drop", "ALL");

    if (this.needsNetRaw(toolName)) {
      args.push("--cap-add", "NET_RAW");
      args.push("--cap-add", "NET_ADMIN");
    }

    // DNS
    args.push("--dns", "1.1.1.1");
    args.push("--dns", "8.8.8.8");

    // Environment
    args.push("-e", `TARGET=${target}`);
    args.push("-e", `SCAN_TOOL=${toolName}`);

    if (env) {
      for (const [key, value] of Object.entries(env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    if (useProxy && proxyUrl) {
      args.push("-e", `HTTP_PROXY=${proxyUrl}`);
      args.push("-e", `HTTPS_PROXY=${proxyUrl}`);
      args.push("-e", `NO_PROXY=localhost,127.0.0.1`);
    }

    // Container name (for abort tracking)
    args.push("--name", containerName);

    // Image
    args.push(image);

    // Tool-specific command
    const { args: toolArgs } = this.buildToolCommand(toolName, toolPath, target, useLocalMount);
    args.push(...toolArgs);

    return args;
  }

  // ── Tool command builder ─────────────────────────────────────────────────

  private buildToolCommand(
    toolName: string,
    _toolPath: string,
    target: string,
    useLocalMount: boolean,
  ): { args: string[] } {
    const normalized = toolName.toLowerCase();

    switch (normalized) {
      case "nuclei":
        return { args: ["-target", target, "-jsonl", "-silent", "-timeout", "10", "-retries", "2"] };
      case "subfinder":
        return { args: ["-d", this.extractDomain(target), "-silent"] };
      case "naabu":
        return { args: ["-host", this.extractDomain(target), "-silent", "-c", "50", "-top-ports", "1000"] };
      case "ffuf":
        return { args: ["-u", `${target}/FUZZ`, "-w", "/usr/share/wordlists/dirb/common.txt", "-c", "-t", "50", "-ac", "-o", "json"] };
      default: {
        if (useLocalMount) return { args: [target] };
        return { args: [target] };
      }
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  private extractDomain(target: string): string {
    return target.replace(/^https?:\/\//, "").split("/")[0];
  }

  private needsNetRaw(toolName: string): boolean {
    const raw = ["nmap", "naabu", "masscan", "zmap", "rustscan"];
    return raw.includes(toolName.toLowerCase());
  }

  private parseMemoryBytes(mem: string): number {
    const match = mem.match(/^(\d+)(b|k|m|g)?$/i);
    if (!match) return 0;
    const val = parseInt(match[1], 10);
    const unit = (match[2] ?? "b").toLowerCase();
    const multipliers: Record<string, number> = { b: 1, k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
    return val * (multipliers[unit] ?? 1);
  }

  private tryExtractProgress(text: string): number | null {
    const pm = text.match(/Progress:\s*(\d+)%/i);
    if (pm) return Math.min(parseInt(pm[1], 10), 100);
    const fm = text.match(/\[(\d+)\/(\d+)\]/);
    if (fm) {
      const c = parseInt(fm[1], 10);
      const t = parseInt(fm[2], 10);
      if (t > 0) return Math.min(Math.round((c / t) * 100), 100);
    }
    return null;
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
      toolName, exitCode, signal, stdout, stderr,
      findings: [], parsedSuccessfully: false, parseErrors,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt, completedAt,
    };
  }

  private failedResult(toolName: string, startedAt: Date, errors: string[]): ToolResult {
    return this.makeResult(toolName, null, null, "", errors.join("\n"), startedAt, errors);
  }
}
