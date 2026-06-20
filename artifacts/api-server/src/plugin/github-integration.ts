// ---------------------------------------------------------------------------
// Dynamic GitHub Plugin Integration
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { logger } from "../lib/logger";
import { manifestValidator } from "./sdk/manifest-validator";
import type { PluginManifest } from "./sdk/types";

const execFileAsync = promisify(execFile);

export type GitHubSourceType = "release" | "tag" | "branch" | "commit";

export interface GitHubSource {
  repository: string;
  type: GitHubSourceType;
  ref: string;
  isPrivate: boolean;
  token?: string;
  enterpriseUrl?: string;
  expectedChecksum?: string;
  expectedSignature?: string;
}

export interface GitHubInstallationResult {
  success: boolean;
  pluginId: string | null;
  manifest: PluginManifest | null;
  installDir: string;
  version: string;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export class GitHubPluginIntegration {
  private workspacesDir: string;
  private githubToken: string | null;

  constructor(workspacesDir?: string) {
    this.workspacesDir = workspacesDir ?? join(process.cwd(), ".plugins", "workspaces");
    this.githubToken = process.env["GITHUB_TOKEN"] ?? null;

    fs.mkdir(this.workspacesDir, { recursive: true }).catch(() => {});
    logger.info({ workspacesDir: this.workspacesDir }, "[GITHUB-INTEGRATION] GitHub Plugin Integration initialized");
  }

  async install(source: GitHubSource): Promise<GitHubInstallationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const repoDir = join(this.workspacesDir, this.sanitizeRepoName(source.repository));

    try {
      logger.info({ repo: source.repository, ref: source.ref }, "[GITHUB-INTEGRATION] Installing plugin from GitHub");

      const dirExists = await fs.stat(repoDir).then(() => true).catch(() => false);
      if (!dirExists) {
        await this.cloneRepo(source, repoDir);
      } else {
        await this.fetchRepo(source, repoDir);
      }

      await this.checkoutRef(repoDir, source.ref);

      const validation = await manifestValidator.findAndParse(repoDir);
      if (!validation.valid || !validation.manifest) {
        errors.push(...validation.errors);
        return {
          success: false, pluginId: null, manifest: null,
          installDir: repoDir, version: "unknown",
          errors: validation.errors, warnings, durationMs: Date.now() - startTime,
        };
      }

      try {
        await this.buildPlugin(repoDir, validation.manifest);
      } catch (buildErr) {
        warnings.push(`Build failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`);
      }

      if (source.expectedChecksum) {
        const checksum = await manifestValidator.computeChecksum(join(repoDir, "v8-plugin.json"));
        if (checksum !== source.expectedChecksum) {
          errors.push(`Checksum mismatch: expected ${source.expectedChecksum}, got ${checksum}`);
          return {
            success: false, pluginId: validation.manifest.id, manifest: validation.manifest,
            installDir: repoDir, version: validation.manifest.version,
            errors, warnings, durationMs: Date.now() - startTime,
          };
        }
      }

      logger.info({
        pluginId: validation.manifest.id, version: validation.manifest.version,
        repo: source.repository, ref: source.ref,
      }, "[GITHUB-INTEGRATION] Plugin installed successfully");

      return {
        success: true, pluginId: validation.manifest.id,
        manifest: validation.manifest, installDir: repoDir,
        version: validation.manifest.version, errors, warnings,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(errMsg);
      logger.error({ err, repo: source.repository }, "[GITHUB-INTEGRATION] Installation failed");
      return {
        success: false, pluginId: null, manifest: null,
        installDir: repoDir, version: "unknown",
        errors, warnings, durationMs: Date.now() - startTime,
      };
    }
  }

  async installFromRelease(repository: string, version: string): Promise<GitHubInstallationResult> {
    return this.install({ repository, type: "release", ref: version, isPrivate: false });
  }

  async checkForUpdates(repoDir: string): Promise<{ hasUpdate: boolean; latestVersion: string | null; currentVersion: string | null }> {
    try {
      const validation = await manifestValidator.findAndParse(repoDir);
      const currentVersion = validation.manifest?.version ?? null;

      await execFileAsync("git", ["fetch", "--tags"], { cwd: repoDir, timeout: 30_000 });
      const { stdout } = await execFileAsync("git", ["tag", "--list", "--sort=-version:refname"], { cwd: repoDir, timeout: 10_000 });
      const tags = stdout.trim().split("\n").filter(Boolean);
      const latestVersion = tags[0] ?? null;

      return { hasUpdate: latestVersion !== currentVersion, latestVersion, currentVersion };
    } catch (err) {
      logger.error({ err, repoDir }, "[GITHUB-INTEGRATION] Update check failed");
      return { hasUpdate: false, latestVersion: null, currentVersion: null };
    }
  }

  private async cloneRepo(source: GitHubSource, targetDir: string): Promise<void> {
    const url = this.buildCloneUrl(source);
    const args = ["clone", "--depth", "1", url, targetDir];
    if (source.type === "branch") {
      args.splice(2, 0, "--branch", source.ref);
    }
    await execFileAsync("git", args, { timeout: 120_000 });
    logger.info({ repo: source.repository, dir: targetDir }, "[GITHUB-INTEGRATION] Repository cloned");
  }

  private async fetchRepo(source: GitHubSource, targetDir: string): Promise<void> {
    await execFileAsync("git", ["fetch", "--all", "--tags"], { cwd: targetDir, timeout: 60_000 });
  }

  private async checkoutRef(targetDir: string, ref: string): Promise<void> {
    await execFileAsync("git", ["checkout", ref], { cwd: targetDir, timeout: 30_000 });
  }

  private buildCloneUrl(source: GitHubSource): string {
    const token = source.token ?? this.githubToken;
    const baseUrl = source.enterpriseUrl ?? "https://github.com";
    if (!source.repository.startsWith("http")) {
      if (token) return `https://x-access-token:${token}@${new URL(baseUrl).hostname}/${source.repository}.git`;
      return `${baseUrl}/${source.repository}.git`;
    }
    if (token) {
      const url = new URL(source.repository);
      return `https://x-access-token:${token}@${url.hostname}${url.pathname}`;
    }
    return source.repository;
  }

  private async buildPlugin(pluginDir: string, manifest: PluginManifest): Promise<void> {
    try {
      const content = await fs.readFile(join(pluginDir, "package.json"), "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.scripts?.build) {
        logger.info({ pluginId: manifest.id }, "[GITHUB-INTEGRATION] Building plugin...");
        await execFileAsync("npm", ["run", "build"], { cwd: pluginDir, timeout: 120_000 });
        logger.info({ pluginId: manifest.id }, "[GITHUB-INTEGRATION] Build complete");
      }
    } catch {
      logger.warn({ pluginId: manifest.id }, "[GITHUB-INTEGRATION] Build skipped (no package.json or build script)");
    }
  }

  private sanitizeRepoName(repo: string): string {
    return repo.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  }

  async cleanup(repoDir?: string): Promise<void> {
    if (repoDir) {
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async listInstalled(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.workspacesDir);
      const dirs: string[] = [];
      for (const entry of entries) {
        const fullPath = join(this.workspacesDir, entry);
        if ((await fs.stat(fullPath)).isDirectory()) dirs.push(entry);
      }
      return dirs;
    } catch {
      return [];
    }
  }
}

export const githubPluginIntegration = new GitHubPluginIntegration();
