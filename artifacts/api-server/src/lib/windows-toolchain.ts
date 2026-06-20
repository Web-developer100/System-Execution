// ---------------------------------------------------------------------------
// Windows Toolchain Binary Path Mapping
// ---------------------------------------------------------------------------
//
// Provides automatic detection and mapping of Windows binary paths for
// common security tools (nuclei, nmap, subfinder, ffuf, etc.) when Docker
// is unavailable.
//
// The platform prefers Docker execution, but on Windows systems or
// environments without Docker, this helper locates native binaries via:
//   1. Environment variables (e.g. NUCLEI_PATH, NMAP_PATH)
//   2. Common install locations
//   3. PATH lookup
//   4. Chocolatey / Scoop / winget install directories
//   5. npm global packages

import { access, constants } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { logger } from "./logger";

// ── Tool Binary Descriptor ────────────────────────────────────────────────

export interface ToolBinaryDescriptor {
  /** Short tool name (e.g. "nuclei") */
  name: string;
  /** Executable filename on Windows */
  winExe: string;
  /** Executable filename on Linux/macOS */
  unixExe: string;
  /** Environment variable override */
  envVar: string;
  /** Common install locations to search */
  commonPaths: string[];
  /** npm package name (if installable via npm) */
  npmPackage?: string;
  /** Chocolatey package name (if installable via choco) */
  chocoPackage?: string;
  /** Scoop package name (if installable via scoop) */
  scoopPackage?: string;
  /** Version command to verify installation */
  versionCommand: string[];
}

// ── Known Tools Registry ──────────────────────────────────────────────────

const KNOWN_TOOLS: ToolBinaryDescriptor[] = [
  {
    name: "nuclei",
    winExe: "nuclei.exe",
    unixExe: "nuclei",
    envVar: "NUCLEI_PATH",
    commonPaths: [
      "C:\\Program Files\\nuclei",
      "C:\\Tools\\nuclei",
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\nuclei\\current"),
      path.join(os.homedir(), "AppData\\Local\\nuclei"),
    ],
    npmPackage: "@projectdiscovery/nuclei",
    chocoPackage: "nuclei",
    scoopPackage: "nuclei",
    versionCommand: ["-version"],
  },
  {
    name: "nmap",
    winExe: "nmap.exe",
    unixExe: "nmap",
    envVar: "NMAP_PATH",
    commonPaths: [
      "C:\\Program Files\\Nmap",
      "C:\\Program Files (x86)\\Nmap",
      "C:\\Tools\\nmap",
    ],
    chocoPackage: "nmap",
    scoopPackage: "nmap",
    versionCommand: ["--version"],
  },
  {
    name: "subfinder",
    winExe: "subfinder.exe",
    unixExe: "subfinder",
    envVar: "SUBFINDER_PATH",
    commonPaths: [
      "C:\\Program Files\\subfinder",
      "C:\\Tools\\subfinder",
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\subfinder\\current"),
    ],
    npmPackage: "@projectdiscovery/subfinder",
    scoopPackage: "subfinder",
    versionCommand: ["-version"],
  },
  {
    name: "ffuf",
    winExe: "ffuf.exe",
    unixExe: "ffuf",
    envVar: "FFUF_PATH",
    commonPaths: [
      "C:\\Program Files\\ffuf",
      "C:\\Tools\\ffuf",
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\ffuf\\current"),
    ],
    scoopPackage: "ffuf",
    versionCommand: ["-V"],
  },
  {
    name: "httpx",
    winExe: "httpx.exe",
    unixExe: "httpx",
    envVar: "HTTPX_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\httpx\\current"),
    ],
    npmPackage: "@projectdiscovery/httpx",
    scoopPackage: "httpx",
    versionCommand: ["-version"],
  },
  {
    name: "katana",
    winExe: "katana.exe",
    unixExe: "katana",
    envVar: "KATANA_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\katana\\current"),
    ],
    npmPackage: "@projectdiscovery/katana",
    scoopPackage: "katana",
    versionCommand: ["-version"],
  },
  {
    name: "naabu",
    winExe: "naabu.exe",
    unixExe: "naabu",
    envVar: "NAABU_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\naabu\\current"),
    ],
    scoopPackage: "naabu",
    versionCommand: ["-version"],
  },
  {
    name: "dalfox",
    winExe: "dalfox.exe",
    unixExe: "dalfox",
    envVar: "DALFOX_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\dalfox\\current"),
    ],
    scoopPackage: "dalfox",
    versionCommand: ["version"],
  },
  {
    name: "gau",
    winExe: "gau.exe",
    unixExe: "gau",
    envVar: "GAU_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
    ],
    scoopPackage: "gau",
    versionCommand: ["--version"],
  },
  {
    name: "gobuster",
    winExe: "gobuster.exe",
    unixExe: "gobuster",
    envVar: "GOBUSTER_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\gobuster\\current"),
    ],
    scoopPackage: "gobuster",
    versionCommand: ["--version"],
  },
  {
    name: "sqlmap",
    winExe: "sqlmap.py",
    unixExe: "sqlmap",
    envVar: "SQLMAP_PATH",
    commonPaths: [
      "C:\\Tools\\sqlmap",
      path.join(os.homedir(), "scoop\\apps\\sqlmap\\current"),
    ],
    chocoPackage: "sqlmap",
    scoopPackage: "sqlmap",
    versionCommand: ["--version"],
  },
  {
    name: "amass",
    winExe: "amass.exe",
    unixExe: "amass",
    envVar: "AMASS_PATH",
    commonPaths: [
      "C:\\Program Files\\amass",
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\amass\\current"),
    ],
    scoopPackage: "amass",
    versionCommand: ["version"],
  },
  {
    name: "trivy",
    winExe: "trivy.exe",
    unixExe: "trivy",
    envVar: "TRIVY_PATH",
    commonPaths: [
      "C:\\Program Files\\trivy",
      path.join(os.homedir(), "scoop\\apps\\trivy\\current"),
    ],
    scoopPackage: "trivy",
    versionCommand: ["--version"],
  },
  {
    name: "semgrep",
    winExe: "semgrep.exe",
    unixExe: "semgrep",
    envVar: "SEMGREP_PATH",
    commonPaths: [
      path.join(os.homedir(), "scoop\\apps\\semgrep\\current"),
    ],
    npmPackage: "semgrep",
    scoopPackage: "semgrep",
    versionCommand: ["--version"],
  },
  {
    name: "trufflehog",
    winExe: "trufflehog.exe",
    unixExe: "trufflehog",
    envVar: "TRUFFLEHOG_PATH",
    commonPaths: [
      path.join(os.homedir(), "go\\bin"),
      path.join(os.homedir(), "scoop\\apps\\trufflehog\\current"),
    ],
    scoopPackage: "trufflehog",
    versionCommand: ["--version"],
  },
];

// ── Resolution Result ─────────────────────────────────────────────────────

export interface ResolvedBinary {
  /** Tool name */
  name: string;
  /** Resolved absolute path to binary */
  path: string;
  /** How the binary was found */
  source: "env_var" | "common_path" | "path_lookup" | "npm_global" | "scoop" | "choco";
  /** Version string if available */
  version: string | null;
  /** Whether the binary is verified working */
  verified: boolean;
}

// ── Binary Resolver ───────────────────────────────────────────────────────

export class WindowsToolchainResolver {
  private resolved = new Map<string, ResolvedBinary>();
  private readonly isWindows: boolean;

  constructor() {
    this.isWindows = os.platform() === "win32";
    logger.info(`[TOOLCHAIN] WindowsToolchainResolver initialized (platform: ${os.platform()})`);
  }

  /**
   * Resolve the path to a tool binary.
   * Returns null if the tool cannot be found.
   */
  async resolve(name: string): Promise<ResolvedBinary | null> {
    const lowerName = name.toLowerCase();

    // Return cached result if available
    const cached = this.resolved.get(lowerName);
    if (cached) return cached;

    const descriptor = KNOWN_TOOLS.find((t) => t.name === lowerName);
    if (!descriptor) {
      logger.warn({ tool: name }, `[TOOLCHAIN] No descriptor for tool "${name}"`);
      return null;
    }

    const exeName = this.isWindows ? descriptor.winExe : descriptor.unixExe;

    // 1. Environment variable override
    const envPath = process.env[descriptor.envVar];
    if (envPath) {
      const resolvedPath = path.resolve(envPath, exeName);
      const verified = await this.verifyBinary(resolvedPath);
      if (verified) {
        const version = await this.getVersion(resolvedPath, descriptor);
        const result: ResolvedBinary = { name, path: resolvedPath, source: "env_var", version, verified };
        this.resolved.set(lowerName, result);
        return result;
      }

      // Try env var as direct path
      const directVerified = await this.verifyBinary(envPath);
      if (directVerified) {
        const version = await this.getVersion(envPath, descriptor);
        const result: ResolvedBinary = { name, path: envPath, source: "env_var", version, verified: true };
        this.resolved.set(lowerName, result);
        return result;
      }
    }

    // 2. Common install locations
    for (const dir of descriptor.commonPaths) {
      const candidate = path.join(dir, exeName);
      const verified = await this.verifyBinary(candidate);
      if (verified) {
        const version = await this.getVersion(candidate, descriptor);
        const result: ResolvedBinary = { name, path: candidate, source: "common_path", version, verified: true };
        this.resolved.set(lowerName, result);
        logger.info({ tool: name, path: candidate }, `[TOOLCHAIN] Resolved via common path`);
        return result;
      }
    }

    // 3. PATH lookup
    try {
      const whichCmd = this.isWindows ? "where" : "which";
      const stdout = execSync(`${whichCmd} ${exeName}`, {
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const line = stdout.trim().split("\n")[0]?.trim();
      if (line) {
        const version = await this.getVersion(line, descriptor);
        const result: ResolvedBinary = { name, path: line, source: "path_lookup", version, verified: true };
        this.resolved.set(lowerName, result);
        logger.info({ tool: name, path: line }, `[TOOLCHAIN] Resolved via PATH`);
        return result;
      }
    } catch {
      // Not in PATH
    }

    // 4. npm global packages
    if (descriptor.npmPackage) {
      try {
        const npmRoot = execSync("npm root -g", { timeout: 5000, encoding: "utf-8" }).trim();
        const npmBin = path.join(npmRoot, "..", ".bin", exeName);
        const verified = await this.verifyBinary(npmBin);
        if (verified) {
          const version = await this.getVersion(npmBin, descriptor);
          const result: ResolvedBinary = { name, path: npmBin, source: "npm_global", version, verified: true };
          this.resolved.set(lowerName, result);
          logger.info({ tool: name, path: npmBin }, `[TOOLCHAIN] Resolved via npm global`);
          return result;
        }
      } catch {
        // npm not available
      }
    }

    // 5. Scoop shim lookup (Windows)
    if (this.isWindows && descriptor.scoopPackage) {
      const scoopShims = [
        path.join(os.homedir(), "scoop", "shims", exeName),
        path.join(os.homedir(), "scoop", "apps", descriptor.scoopPackage, "current", exeName),
      ];
      for (const shim of scoopShims) {
        const verified = await this.verifyBinary(shim);
        if (verified) {
          const version = await this.getVersion(shim, descriptor);
          const result: ResolvedBinary = { name, path: shim, source: "scoop", version, verified: true };
          this.resolved.set(lowerName, result);
          logger.info({ tool: name, path: shim }, `[TOOLCHAIN] Resolved via Scoop`);
          return result;
        }
      }
    }

    logger.warn({ tool: name }, `[TOOLCHAIN] Could not resolve binary for "${name}"`);
    return null;
  }

  /**
   * Resolve multiple tool binaries at once.
   */
  async resolveMany(names: string[]): Promise<Map<string, ResolvedBinary>> {
    const results = new Map<string, ResolvedBinary>();
    await Promise.all(
      names.map(async (name) => {
        const resolved = await this.resolve(name);
        if (resolved) results.set(name, resolved);
      }),
    );
    return results;
  }

  /**
   * Get all resolved binaries.
   */
  getAllResolved(): ResolvedBinary[] {
    return Array.from(this.resolved.values());
  }

  /**
   * Check if Docker is available on this system.
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      execSync("docker info --format '{{.ServerVersion}}'", {
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the recommended execution mode for the platform.
   */
  async getRecommendedMode(): Promise<"docker" | "native"> {
    const dockerAvailable = await this.isDockerAvailable();
    if (dockerAvailable) {
      logger.info("[TOOLCHAIN] Docker available — recommended mode: docker");
      return "docker";
    }
    logger.warn("[TOOLCHAIN] Docker not available — falling back to native binary execution");
    return "native";
  }

  /**
   * Verify that a binary exists and is executable.
   */
  private async verifyBinary(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.X_OK | constants.R_OK);
      return true;
    } catch {
      // Try just F_OK (Windows doesn't always have X_OK)
      try {
        await access(filePath, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Get the version of a binary by running its version command.
   */
  private async getVersion(filePath: string, descriptor: ToolBinaryDescriptor): Promise<string | null> {
    try {
      const stdout = execSync(`"${filePath}" ${descriptor.versionCommand.join(" ")}`, {
        timeout: 8000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const firstLine = stdout.trim().split("\n")[0]?.trim();
      if (firstLine && firstLine.length < 200) {
        return firstLine;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clear the resolution cache.
   */
  clearCache(): void {
    this.resolved.clear();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const windowsToolchain = new WindowsToolchainResolver();
