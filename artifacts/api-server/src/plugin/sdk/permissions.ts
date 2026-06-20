// ---------------------------------------------------------------------------
// Plugin SDK — Permissions Model
// ---------------------------------------------------------------------------
//
// Plugins request permissions at install time. Every permission requires
// administrator approval. Permissions can be revoked at any time.
//
// Permission flow:
//   1. Plugin declares required permissions in manifest
//   2. Admin reviews and approves/denies each permission
//   3. Plugin can only use approved permissions
//   4. Admin can revoke permissions at runtime
//   5. Plugin is notified when permissions are revoked
//
// Categories:
//   - Network: internet access, raw sockets, DNS
//   - Filesystem: read, write, temp storage
//   - Secrets: read/write secrets
//   - AI: access AI models
//   - System: spawn workers, execute shell
//   - Platform: manage plugins, scans, vulnerabilities

import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger";
import type { PluginPermission, PluginPermissionRequest } from "./types";

// ── Permission State ───────────────────────────────────────────────────────

export type PermissionStatus = "pending" | "approved" | "denied" | "revoked";

export interface PluginPermissionState {
  permission: PluginPermission;
  reason: string;
  required: boolean;
  status: PermissionStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

// ── Permission Manager ─────────────────────────────────────────────────────

export class PluginPermissionManager {
  private pluginPermissions = new Map<string, Map<PluginPermission, PluginPermissionState>>();
  private emitter = new EventEmitter();

  // ── Events ───────────────────────────────────────────────────────────────

  onPermissionChange(
    callback: (event: {
      pluginId: string;
      permission: PluginPermission;
      status: PermissionStatus;
      timestamp: Date;
    }) => void,
  ): () => void {
    this.emitter.on("permission:change", callback);
    return () => { this.emitter.off("permission:change", callback); };
  }

  // ── Permission Management ────────────────────────────────────────────────

  /**
   * Register a plugin's requested permissions for admin approval.
   * All permissions start as "pending".
   */
  registerPermissions(pluginId: string, requests: PluginPermissionRequest[]): PluginPermissionState[] {
    const existing = this.pluginPermissions.get(pluginId) ?? new Map();

    const states: PluginPermissionState[] = requests.map((req) => {
      const state: PluginPermissionState = {
        permission: req.permission,
        reason: req.reason,
        required: req.required,
        status: "pending",
        approvedAt: null,
        approvedBy: null,
        revokedAt: null,
        revokedBy: null,
      };
      existing.set(req.permission, state);
      return state;
    });

    this.pluginPermissions.set(pluginId, existing);

    logger.info({ pluginId, permissionCount: requests.length },
      `[PERMISSIONS] Registered ${requests.length} permission(s) for plugin "${pluginId}" — awaiting admin approval`);

    return states;
  }

  /**
   * Approve a specific permission for a plugin.
   */
  approvePermission(pluginId: string, permission: PluginPermission, approvedBy: string): boolean {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return false;

    const state = states.get(permission);
    if (!state) return false;

    state.status = "approved";
    state.approvedAt = new Date();
    state.approvedBy = approvedBy;

    this.emitter.emit("permission:change", {
      pluginId,
      permission,
      status: "approved",
      timestamp: new Date(),
    });

    logger.info({ pluginId, permission, approvedBy }, `[PERMISSIONS] Permission "${permission}" approved for "${pluginId}"`);
    return true;
  }

  /**
   * Approve all pending permissions for a plugin.
   */
  approveAll(pluginId: string, approvedBy: string): number {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return 0;

    let count = 0;
    for (const [, state] of states) {
      if (state.status === "pending") {
        state.status = "approved";
        state.approvedAt = new Date();
        state.approvedBy = approvedBy;
        count++;
      }
    }

    if (count > 0) {
      this.emitter.emit("permission:change", {
        pluginId,
        permission: "*",
        status: "approved",
        timestamp: new Date(),
      });
      logger.info({ pluginId, count, approvedBy }, `[PERMISSIONS] Bulk-approved ${count} permission(s) for "${pluginId}"`);
    }

    return count;
  }

  /**
   * Deny a specific permission.
   */
  denyPermission(pluginId: string, permission: PluginPermission, deniedBy: string): boolean {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return false;

    const state = states.get(permission);
    if (!state) return false;

    state.status = "denied";

    this.emitter.emit("permission:change", {
      pluginId,
      permission,
      status: "denied",
      timestamp: new Date(),
    });

    logger.warn({ pluginId, permission, deniedBy }, `[PERMISSIONS] Permission "${permission}" DENIED for "${pluginId}"`);

    // If a required permission is denied, the plugin cannot be used
    if (state.required) {
      logger.error({ pluginId, permission },
        `[PERMISSIONS] Plugin "${pluginId}" cannot function without required permission "${permission}"`);
    }

    return true;
  }

  /**
   * Revoke an approved permission.
   */
  revokePermission(pluginId: string, permission: PluginPermission, revokedBy: string): boolean {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return false;

    const state = states.get(permission);
    if (!state || state.status !== "approved") return false;

    state.status = "revoked";
    state.revokedAt = new Date();
    state.revokedBy = revokedBy;

    this.emitter.emit("permission:change", {
      pluginId,
      permission,
      status: "revoked",
      timestamp: new Date(),
    });

    logger.warn({ pluginId, permission, revokedBy }, `[PERMISSIONS] Permission "${permission}" REVOKED for "${pluginId}"`);
    return true;
  }

  /**
   * Check if a plugin has a specific permission.
   */
  hasPermission(pluginId: string, permission: PluginPermission): boolean {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return false;

    const state = states.get(permission);
    return state?.status === "approved";
  }

  /**
   * Get all permission states for a plugin.
   */
  getPermissions(pluginId: string): PluginPermissionState[] {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return [];
    return Array.from(states.values());
  }

  /**
   * Get pending permissions across all plugins (for admin dashboard).
   */
  getPendingPermissions(): Array<{ pluginId: string; permissions: PluginPermissionState[] }> {
    const pending: Array<{ pluginId: string; permissions: PluginPermissionState[] }> = [];

    for (const [pluginId, states] of this.pluginPermissions) {
      const pendingStates = Array.from(states.values()).filter((s) => s.status === "pending");
      if (pendingStates.length > 0) {
        pending.push({ pluginId, permissions: pendingStates });
      }
    }

    return pending;
  }

  /**
   * Check if all required permissions are approved for a plugin.
   */
  areRequiredPermissionsApproved(pluginId: string): boolean {
    const states = this.pluginPermissions.get(pluginId);
    if (!states) return false;

    for (const [, state] of states) {
      if (state.required && state.status !== "approved") return false;
    }

    return true;
  }

  /**
   * Remove all permissions for a plugin (on uninstall).
   */
  removePlugin(pluginId: string): void {
    this.pluginPermissions.delete(pluginId);
    logger.info({ pluginId }, `[PERMISSIONS] All permissions removed for "${pluginId}"`);
  }

  /**
   * Get permission statistics.
   */
  getStats(): { total: number; approved: number; pending: number; denied: number; revoked: number } {
    let total = 0;
    let approved = 0;
    let pending = 0;
    let denied = 0;
    let revoked = 0;

    for (const [, states] of this.pluginPermissions) {
      for (const [, state] of states) {
        total++;
        switch (state.status) {
          case "approved": approved++; break;
          case "pending": pending++; break;
          case "denied": denied++; break;
          case "revoked": revoked++; break;
        }
      }
    }

    return { total, approved, pending, denied, revoked };
  }

  /** Clear all permissions (for testing) */
  reset(): void {
    this.pluginPermissions.clear();
  }
}

export const permissionManager = new PluginPermissionManager();
