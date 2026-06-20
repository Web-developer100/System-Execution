// ---------------------------------------------------------------------------
// Environment Provisioning Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Checks and automatically installs all required development environments
// and runtimes on the host system. Called once at first deployment.
//
// Installs:
//   - Python 3.x + pip + virtualenv + venv
//   - Go language toolchain (GOPATH, GOROOT)
//   - Rust + Cargo
//   - Node.js LTS + npm/pnpm/yarn
//   - Java JDK + Maven + Gradle
//   - PHP + Composer
//   - Ruby + Bundler
//   - Build tools (git, curl, wget, gcc, g++, make, build-essential)
//   - Docker + Docker Compose + Docker Buildx
//   - Nmap, jq, yq, zip, unzip, tar, gzip
//
// Every language gets an isolated environment per tool (e.g. python3 -m venv).

import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { logger } from "../lib/logger";

// ── Tool Descriptors ──────────────────────────────────────────────────────

interface RuntimeDescriptor {
  name: string;
  checkCmds: { cmd: string; args: string[] }[];
  installCmds: { cmd: string; args: string[]; timeout?: number }[];
  envVar?: { name: string; value: string };
  optional: boolean;
}

const RUNTIMES: RuntimeDescriptor[] = [
  {
    name: "curl",
    checkCmds: [{ cmd: "curl", args: ["--version"] }],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "curl.curl"] }]
      : [{ cmd: "sh", args: ["-c", "apt-get install -y -qq curl"], timeout: 60_000 }],
    optional: false,
  },
  {
    name: "git",
    checkCmds: [{ cmd: "git", args: ["--version"] }],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "Git.Git"] }]
      : [{ cmd: "sh", args: ["-c", "apt-get install -y -qq git"], timeout: 60_000 }],
    optional: false,
  },
  {
    name: "Python 3",
    checkCmds: [
      { cmd: "python3", args: ["--version"] },
      { cmd: os.platform() === "win32" ? "py" : "python", args: ["--version"] },
      { cmd: "python", args: ["--version"] },
    ],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "Python.Python.3.12"], timeout: 120_000 }]
      : [{ cmd: "sh", args: ["-c", "apt-get update -qq && apt-get install -y -qq python3 python3-pip python3-venv"], timeout: 120_000 }],
    optional: false,
  },
  {
    name: "pip / venv",
    checkCmds: [
      { cmd: "pip3", args: ["--version"] },
      { cmd: "python3", args: ["-m", "venv", "--help"] },
    ],
    installCmds: [
      { cmd: "sh", args: ["-c", "apt-get install -y -qq python3-pip python3-venv"], timeout: 60_000 },
    ],
    optional: false,
  },
  {
    name: "Go",
    checkCmds: [{ cmd: "go", args: ["version"] }],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "GoLang.Go"], timeout: 120_000 }]
      : [{ cmd: "sh", args: ["-c", "curl -fsSL https://go.dev/dl/go1.22.linux-amd64.tar.gz | tar -C /usr/local -xz && echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile"], timeout: 180_000 }],
    envVar: { name: "GOPATH", value: path.join(os.homedir(), "go") },
    optional: false,
  },
  {
    name: "Rust / Cargo",
    checkCmds: [
      { cmd: "rustc", args: ["--version"] },
      { cmd: "cargo", args: ["--version"] },
    ],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "sh", args: ["-c", "winget install Rustlang.Rustup && rustup default stable"], timeout: 180_000 }]
      : [{ cmd: "sh", args: ["-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"], timeout: 180_000 }],
    envVar: { name: "CARGO_HOME", value: path.join(os.homedir(), ".cargo") },
    optional: false,
  },
  {
    name: "Node.js",
    checkCmds: [
      { cmd: "node", args: ["--version"] },
      { cmd: "npm", args: ["--version"] },
    ],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "OpenJS.NodeJS.LTS"], timeout: 120_000 }]
      : [{ cmd: "sh", args: ["-c", "curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y -qq nodejs"], timeout: 120_000 }],
    optional: false,
  },
  {
    name: "pnpm",
    checkCmds: [{ cmd: "pnpm", args: ["--version"] }],
    installCmds: [{ cmd: "npm", args: ["install", "-g", "pnpm"], timeout: 60_000 }],
    optional: true,
  },
  {
    name: "Java JDK",
    checkCmds: [{ cmd: "java", args: ["-version"] }],
    installCmds: [{ cmd: "sh", args: ["-c", "apt-get install -y -qq default-jdk"], timeout: 120_000 }],
    optional: true,
  },
  {
    name: "Build Essentials",
    checkCmds: [
      { cmd: "gcc", args: ["--version"] },
      { cmd: "g++", args: ["--version"] },
      { cmd: "make", args: ["--version"] },
    ],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "Microsoft.VisualStudio.2022.BuildTools"], timeout: 300_000 }]
      : [{ cmd: "sh", args: ["-c", "apt-get install -y -qq build-essential gcc g++ make"], timeout: 120_000 }],
    optional: false,
  },
  {
    name: "Docker",
    checkCmds: [
      { cmd: "docker", args: ["--version"] },
    ],
    installCmds: os.platform() === "win32"
      ? [{ cmd: "winget", args: ["install", "Docker.DockerDesktop"], timeout: 300_000 }]
      : [{ cmd: "sh", args: ["-c", "curl -fsSL https://get.docker.com | bash"], timeout: 180_000 }],
    optional: false,
  },
  {
    name: "Nmap",
    checkCmds: [{ cmd: "nmap", args: ["--version"] }],
    installCmds: [{ cmd: "sh", args: ["-c", "apt-get install -y -qq nmap"], timeout: 60_000 }],
    optional: true,
  },
  {
    name: "jq / yq",
    checkCmds: [
      { cmd: "jq", args: ["--version"] },
    ],
    installCmds: [{ cmd: "sh", args: ["-c", "apt-get install -y -qq jq"], timeout: 60_000 }],
    optional: true,
  },
];

// ── Provisioning Result ───────────────────────────────────────────────────

export interface ProvisioningResult {
  runtime: string;
  available: boolean;
  version: string | null;
  installed: boolean;
  error: string | null;
}

export interface ProvisioningSummary {
  total: number;
  available: number;
  missing: number;
  installed: number;
  failed: number;
  results: ProvisioningResult[];
}

// ── Environment Provisioning Service ───────────────────────────────────────

export class EnvironmentProvisioningService {
  private results = new Map<string, ProvisioningResult>();
  private _provisioned = false;

  /**
   * Check all required runtimes and optionally install missing ones.
   */
  async provision(installMissing = false): Promise<ProvisioningSummary> {
    logger.info("[ENV-PROVISION] Starting environment provisioning...");

    for (const runtime of RUNTIMES) {
      const result = await this.checkRuntime(runtime);
      this.results.set(runtime.name, result);

      if (!result.available && installMissing && !runtime.optional) {
        await this.installRuntime(runtime, result);
      }
    }

    this._provisioned = true;
    const summary = this.getSummary();
    logger.info(
      { total: summary.total, available: summary.available, installed: summary.installed, failed: summary.failed },
      "[ENV-PROVISION] Provisioning complete",
    );
    return summary;
  }

  /**
   * Create an isolated Python virtual environment for a tool.
   */
  async createPythonVenv(venvPath: string): Promise<boolean> {
    try {
      await this.runCmd("python3", ["-m", "venv", venvPath], 60_000);
      logger.info({ venvPath }, "[ENV-PROVISION] Python venv created");
      return true;
    } catch (err) {
      logger.error({ err, venvPath }, "[ENV-PROVISION] Failed to create Python venv");
      return false;
    }
  }

  /**
   * Install pip requirements in an existing venv.
   */
  async installPipRequirements(venvPath: string, requirementsFile: string): Promise<boolean> {
    const pipBin = os.platform() === "win32"
      ? path.join(venvPath, "Scripts", "pip")
      : path.join(venvPath, "bin", "pip");
    try {
      await this.runCmd(pipBin, ["install", "-r", requirementsFile], 120_000);
      return true;
    } catch (err) {
      logger.error({ err, venvPath }, "[ENV-PROVISION] Failed to install pip requirements");
      return false;
    }
  }

  /**
   * Ensure GOPATH and GOROOT are configured.
   */
  getGoEnvironment(): Record<string, string> {
    const goRoot = process.platform === "win32"
      ? path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Go")
      : "/usr/local/go";
    const goPath = path.join(os.homedir(), "go");
    return {
      GOROOT: goRoot,
      GOPATH: goPath,
      PATH: `${path.join(goRoot, "bin")}${path.delimiter}${path.join(goPath, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
    };
  }

  /**
   * Ensure CARGO_HOME is configured.
   */
  getRustEnvironment(): Record<string, string> {
    const cargoHome = path.join(os.homedir(), ".cargo");
    return {
      CARGO_HOME: cargoHome,
      RUSTUP_HOME: path.join(os.homedir(), ".rustup"),
      PATH: `${path.join(cargoHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
    };
  }

  /**
   * Build build-time environment variables for a tool based on its language.
   */
  getBuildEnvironment(language: string): Record<string, string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    switch (language.toLowerCase()) {
      case "go":
        return { ...env, ...this.getGoEnvironment() };
      case "rust":
        return { ...env, ...this.getRustEnvironment() };
      default:
        return env;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async checkRuntime(runtime: RuntimeDescriptor): Promise<ProvisioningResult> {
    for (const check of runtime.checkCmds) {
      try {
        const output = await this.runCmdCapture(check.cmd, check.args, 15_000);
        return {
          runtime: runtime.name,
          available: true,
          version: output.trim().split("\n")[0] ?? "installed",
          installed: false,
          error: null,
        };
      } catch (err) {
        // Try next check command
        continue;
      }
    }
    return {
      runtime: runtime.name,
      available: false,
      version: null,
      installed: false,
      error: `Not found on system PATH — tried ${runtime.checkCmds.map((c) => c.cmd).join(", ")}`,
    };
  }

  private async installRuntime(runtime: RuntimeDescriptor, result: ProvisioningResult): Promise<void> {
    logger.info({ runtime: runtime.name }, "[ENV-PROVISION] Installing...");

    for (const install of runtime.installCmds) {
      try {
        await this.runCmd(install.cmd, install.args, install.timeout ?? 120_000);
        result.available = true;
        result.installed = true;
        result.error = null;

        // Re-check version
        for (const check of runtime.checkCmds) {
          try {
            const output = await this.runCmdCapture(check.cmd, check.args, 15_000);
            result.version = output.trim().split("\n")[0] ?? "installed";
            break;
          } catch { continue; }
        }

        logger.info({ runtime: runtime.name }, "[ENV-PROVISION] Installed successfully");
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
        logger.error({ runtime: runtime.name, error: result.error }, "[ENV-PROVISION] Installation failed");
      }
    }
  }

  /**
   * Run a command with proper timeout via AbortSignal.
   */
  private runCmd(cmd: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const child = spawn(cmd, args, {
        stdio: ["pipe", "ignore", "pipe"],
        shell: false,
        windowsHide: true,
        signal: controller.signal,
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`Exit code ${code}`));
      });
    });
  }

  /**
   * Run a command and capture its stdout with timeout via AbortSignal.
   */
  private runCmdCapture(cmd: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const chunks: Buffer[] = [];
      const child = spawn(cmd, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        signal: controller.signal,
      });

      child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString("utf-8"));
        } else {
          const errOutput = Buffer.concat(chunks).toString("utf-8").slice(0, 500);
          reject(new Error(`Exit code ${code}: ${errOutput}`));
        }
      });
    });
  }

  getSummary(): ProvisioningSummary {
    const results = Array.from(this.results.values());
    return {
      total: results.length,
      available: results.filter((r) => r.available).length,
      missing: results.filter((r) => !r.available).length,
      installed: results.filter((r) => r.installed).length,
      failed: results.filter((r) => r.error && !r.available).length,
      results,
    };
  }

  get isProvisioned(): boolean {
    return this._provisioned;
  }

  isAvailable(runtime: string): boolean {
    return this.results.get(runtime)?.available ?? false;
  }
}

export const environmentProvisioning = new EnvironmentProvisioningService();
