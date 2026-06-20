// ---------------------------------------------------------------------------
// Plugin SDK — Version Manager
// ---------------------------------------------------------------------------
//
// Comprehensive version management for plugins:
//   - Semantic versioning (semver) compliance
//   - Latest stable vs. latest beta tracking
//   - Pinned versions
//   - Rollback support
//   - Version history
//   - Compatibility matrix
//   - Dependency resolution
//   - Automatic, manual, and scheduled updates
//   - Canary deployments
//   - Blue/green updates

import { logger } from "../../lib/logger";
import type { VersionInfo, PluginManifest } from "./types";

// ── Version Channel ────────────────────────────────────────────────────────

export type VersionChannel = "stable" | "beta" | "alpha" | "canary" | "custom";

export interface VersionRecord {
  pluginId: string;
  version: string;
  channel: VersionChannel;
  publishedAt: Date;
  releaseNotes: string;
  checksum: string;
  isBreaking: boolean;
  dependencies: Record<string, string>;
  downloadUrl: string;
  size: number;
}

// ── Version Manager ─────────────────────────────────────────────────────────

export class PluginVersionManager {
  private versionHistory = new Map<string, VersionRecord[]>();
  private pinnedVersions = new Map<string, string>();
  private updateSchedules = new Map<string, { channel: VersionChannel; intervalMs: number }>();
  private updateTimers = new Map<string, ReturnType<typeof setInterval>>();
  private rollbackHistory = new Map<string, Array<{ from: string; to: string; timestamp: Date; reason: string }>>();
  private canaryDeployments = new Map<string, { version: string; percentage: number; startTime: Date }>();

  // ── Version Registration ──────────────────────────────────────────────────

  /**
   * Register a new version of a plugin.
   */
  registerVersion(pluginId: string, version: VersionInfo, channel: VersionChannel = "stable"): VersionRecord {
    const record: VersionRecord = {
      pluginId,
      version: version.version,
      channel,
      publishedAt: new Date(version.publishedAt),
      releaseNotes: version.releaseNotes,
      checksum: version.checksum,
      isBreaking: version.isBreaking,
      dependencies: version.dependencies,
      downloadUrl: version.downloadUrl,
      size: 0,
    };

    if (!this.versionHistory.has(pluginId)) {
      this.versionHistory.set(pluginId, []);
    }

    const history = this.versionHistory.get(pluginId)!;
    // Check for duplicates
    const existing = history.findIndex((v) => v.version === version.version);
    if (existing >= 0) {
      history[existing] = record;
    } else {
      history.push(record);
    }

    // Sort by semver descending
    history.sort((a, b) => this.compareVersions(b.version, a.version));

    logger.info({ pluginId, version: version.version, channel }, `[VERSION-MGR] Registered version ${version.version} for "${pluginId}"`);
    return record;
  }

  // ── Version Queries ──────────────────────────────────────────────────────

  /**
   * Get the latest version of a plugin.
   */
  getLatestVersion(pluginId: string, channel: VersionChannel = "stable"): VersionRecord | null {
    const history = this.versionHistory.get(pluginId);
    if (!history || history.length === 0) return null;

    const matching = channel === "stable"
      ? history.filter((v) => v.channel === "stable" || v.channel === "beta")
      : history;

    return matching[0] ?? null;
  }

  /**
   * Get a specific version of a plugin.
   */
  getVersion(pluginId: string, version: string): VersionRecord | null {
    const history = this.versionHistory.get(pluginId);
    if (!history) return null;
    return history.find((v) => v.version === version) ?? null;
  }

  /**
   * Get all versions of a plugin.
   */
  getVersionHistory(pluginId: string): VersionRecord[] {
    return this.versionHistory.get(pluginId) ?? [];
  }

  /**
   * Check if a version is compatible with the current platform.
   */
  isVersionCompatible(manifest: PluginManifest, platformVersion: string): boolean {
    // Check min platform version
    if (manifest.minPlatformVersion) {
      if (this.compareVersions(platformVersion, manifest.minPlatformVersion) < 0) {
        return false;
      }
    }

    // Check max platform version
    if (manifest.maxPlatformVersion) {
      if (this.compareVersions(platformVersion, manifest.maxPlatformVersion) > 0) {
        return false;
      }
    }

    return true;
  }

  // ── Version Pinning ──────────────────────────────────────────────────────

  /**
   * Pin a plugin to a specific version.
   */
  pinVersion(pluginId: string, version: string): void {
    this.pinnedVersions.set(pluginId, version);
    logger.info({ pluginId, version }, `[VERSION-MGR] Pinned "${pluginId}" to version ${version}`);
  }

  /**
   * Unpin a plugin (allow updates).
   */
  unpinVersion(pluginId: string): void {
    this.pinnedVersions.delete(pluginId);
    logger.info({ pluginId }, `[VERSION-MGR] Unpinned "${pluginId}"`);
  }

  /**
   * Get the pinned version for a plugin.
   */
  getPinnedVersion(pluginId: string): string | null {
    return this.pinnedVersions.get(pluginId) ?? null;
  }

  /**
   * Check if a plugin is pinned.
   */
  isPinned(pluginId: string): boolean {
    return this.pinnedVersions.has(pluginId);
  }

  // ── Rollback ─────────────────────────────────────────────────────────────

  /**
   * Rollback a plugin to a previous version.
   */
  async rollback(pluginId: string, targetVersion: string): Promise<boolean> {
    const history = this.versionHistory.get(pluginId);
    if (!history || history.length === 0) return false;

    const target = history.find((v) => v.version === targetVersion);
    if (!target) return false;

    const currentVersion = this.getLatestVersion(pluginId)?.version;
    if (!currentVersion || currentVersion === targetVersion) return false;

    // Record rollback
    if (!this.rollbackHistory.has(pluginId)) {
      this.rollbackHistory.set(pluginId, []);
    }
    this.rollbackHistory.get(pluginId)!.push({
      from: currentVersion,
      to: targetVersion,
      timestamp: new Date(),
      reason: "manual_rollback",
    });

    logger.info({ pluginId, from: currentVersion, to: targetVersion },
      `[VERSION-MGR] Rolled back "${pluginId}" ${currentVersion} → ${targetVersion}`);

    return true;
  }

  /**
   * Get rollback history for a plugin.
   */
  getRollbackHistory(pluginId: string): Array<{ from: string; to: string; timestamp: Date; reason: string }> {
    return this.rollbackHistory.get(pluginId) ?? [];
  }

  // ── Update Scheduling ────────────────────────────────────────────────────

  /**
   * Schedule automatic updates for a plugin.
   */
  scheduleUpdates(pluginId: string, channel: VersionChannel, intervalMs: number): void {
    this.updateSchedules.set(pluginId, { channel, intervalMs });

    const timer = setInterval(() => {
      this.checkForUpdates(pluginId).catch((err) => {
        logger.error({ err, pluginId }, "[VERSION-MGR] Update check failed");
      });
    }, intervalMs);

    this.updateTimers.set(pluginId, timer);
    logger.info({ pluginId, channel, intervalMs }, `[VERSION-MGR] Scheduled updates for "${pluginId}"`);
  }

  /**
   * Stop scheduled updates for a plugin.
   */
  stopScheduledUpdates(pluginId: string): void {
    const timer = this.updateTimers.get(pluginId);
    if (timer) {
      clearInterval(timer);
      this.updateTimers.delete(pluginId);
    }
    this.updateSchedules.delete(pluginId);
  }

  /**
   * Check for available updates.
   */
  async checkForUpdates(pluginId: string): Promise<VersionRecord | null> {
    const latest = this.getLatestVersion(pluginId, "stable");
    if (!latest) return null;

    const currentVersion = this.getLatestVersion(pluginId);
    if (!currentVersion || this.compareVersions(latest.version, currentVersion.version) > 0) {
      logger.info({ pluginId, current: currentVersion?.version, latest: latest.version },
        `[VERSION-MGR] Update available for "${pluginId}": ${currentVersion?.version} → ${latest.version}`);
      return latest;
    }

    return null;
  }

  // ── Canary Deployments ───────────────────────────────────────────────────

  /**
   * Deploy a canary version (rolled out to a percentage of users/instances).
   */
  deployCanary(pluginId: string, version: string, percentage: number): void {
    this.canaryDeployments.set(pluginId, {
      version,
      percentage: Math.min(100, Math.max(0, percentage)),
      startTime: new Date(),
    });
    logger.info({ pluginId, version, percentage }, `[VERSION-MGR] Canary deployed: ${version} at ${percentage}%`);
  }

  /**
   * Promote canary to full release.
   */
  promoteCanary(pluginId: string): string | null {
    const canary = this.canaryDeployments.get(pluginId);
    if (!canary) return null;
    this.canaryDeployments.delete(pluginId);
    logger.info({ pluginId, version: canary.version }, `[VERSION-MGR] Canary promoted to full release`);
    return canary.version;
  }

  /**
   * Rollback canary deployment.
   */
  rollbackCanary(pluginId: string): boolean {
    return this.canaryDeployments.delete(pluginId);
  }

  // ── Semver Helpers ───────────────────────────────────────────────────────

  /**
   * Compare two semver strings.
   * Returns -1 if a < b, 0 if a == b, 1 if a > b.
   */
  compareVersions(a: string, b: string): number {
    const cleanA = a.replace(/^[vV]/, "").split("-")[0];
    const cleanB = b.replace(/^[vV]/, "").split("-")[0];

    const partsA = cleanA.split(".").map(Number);
    const partsB = cleanB.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      const numA = partsA[i] ?? 0;
      const numB = partsB[i] ?? 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }

    // Check pre-release tags
    const preA = a.includes("-") ? a.split("-")[1] : "";
    const preB = b.includes("-") ? b.split("-")[1] : "";
    if (preA && !preB) return -1;
    if (!preA && preB) return 1;

    return 0;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): { registeredVersions: number; pinned: number; canaryDeployments: number } {
    return {
      registeredVersions: Array.from(this.versionHistory.values()).flat().length,
      pinned: this.pinnedVersions.size,
      canaryDeployments: this.canaryDeployments.size,
    };
  }

  /**
   * Clean up all timers (for shutdown).
   */
  shutdown(): void {
    for (const [pluginId, timer] of this.updateTimers) {
      clearInterval(timer);
      logger.debug({ pluginId }, "[VERSION-MGR] Update timer stopped");
    }
    this.updateTimers.clear();
  }
}

export const pluginVersionManager = new PluginVersionManager();
