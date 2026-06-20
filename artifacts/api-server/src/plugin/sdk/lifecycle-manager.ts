// ---------------------------------------------------------------------------
// Plugin SDK — Lifecycle Manager
// ---------------------------------------------------------------------------

import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger";
import type { PluginLifecycleState, PluginManifest, PluginPermissionRequest } from "./types";
import { manifestValidator } from "./manifest-validator";
import { permissionManager } from "./permissions";
import { pluginEventBus } from "./events";
import type { PluginBase } from "./plugin-base";

export type LifecycleStep =
  | "discover" | "install" | "validate" | "verify_signature"
  | "resolve_dependencies" | "download" | "extract" | "configure"
  | "register" | "initialize" | "health_check" | "execute"
  | "update" | "restart" | "disable" | "enable" | "rollback" | "remove" | "cleanup";

export interface LifecycleEvent {
  pluginId: string;
  step: LifecycleStep;
  state: PluginLifecycleState;
  status: "started" | "completed" | "failed";
  timestamp: Date;
  message: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Simple in-memory storage for plugin data
class PluginStorage {
  private data = new Map<string, string>();
  get(key: string) { return Promise.resolve(this.data.get(key) ?? null); }
  set(key: string, value: string) { this.data.set(key, value); return Promise.resolve(); }
  delete(key: string) { this.data.delete(key); return Promise.resolve(); }
  list(prefix: string) { return Promise.resolve(Array.from(this.data.keys()).filter(k => k.startsWith(prefix))); }
}

class PluginSecrets {
  private data = new Map<string, string>();
  get(key: string) { return Promise.resolve(this.data.get(key) ?? process.env[key] ?? null); }
  set(key: string, value: string) { this.data.set(key, value); return Promise.resolve(); }
  delete(key: string) { this.data.delete(key); return Promise.resolve(); }
}

class PluginAuth {
  constructor(private pluginId: string) {}
  getToken() { return Promise.resolve(process.env["V8_API_TOKEN"] ?? null); }
  refreshToken() { return Promise.resolve(""); }
  hasPermission(permission: string) { return permissionManager.hasPermission(this.pluginId, permission as any); }
}

class PluginMetrics {
  increment(_counter: string, _value?: number) {}
  gauge(_name: string, _value: number) {}
  timing(_name: string, _durationMs: number) {}
}

class PluginWorker {
  spawn(_config: { task: string; payload: Record<string, unknown> }) { return Promise.resolve(`worker-${Date.now()}`); }
  getStatus(_workerId: string) { return Promise.resolve("completed"); }
  cancel(_workerId: string) { return Promise.resolve(); }
}

export class PluginLifecycleManager {
  private pluginStates = new Map<string, PluginLifecycleState>();
  private plugins = new Map<string, PluginBase>();
  private emitter = new EventEmitter();
  private lifecycleHistory: LifecycleEvent[] = [];
  private maxHistory = 5000;

  onLifecycleEvent(callback: (event: LifecycleEvent) => void): () => void {
    this.emitter.on("lifecycle", callback);
    return () => { this.emitter.off("lifecycle", callback); };
  }

  private emitLifecycleEvent(
    pluginId: string, step: LifecycleStep, state: PluginLifecycleState,
    status: "started" | "completed" | "failed", message: string,
    error?: string, metadata?: Record<string, unknown>,
  ): void {
    const event: LifecycleEvent = {
      pluginId, step, state, status, timestamp: new Date(), message, error, metadata,
    };
    this.lifecycleHistory.push(event);
    if (this.lifecycleHistory.length > this.maxHistory) this.lifecycleHistory.shift();
    this.emitter.emit("lifecycle", event);

    const logMsg = `[LIFECYCLE:${pluginId}] ${step}: ${status} — ${message}`;
    if (status === "failed") logger.error({ pluginId, step, error }, logMsg);
    else if (status === "completed") logger.info({ pluginId, step }, logMsg);
    else logger.debug({ pluginId, step }, logMsg);
  }

  async install(plugin: PluginBase, _manifestPath?: string): Promise<boolean> {
    const pluginId = plugin.manifest.id;
    logger.info({ pluginId }, `[LIFECYCLE] Starting install for "${pluginId}"`);

    try {
      this.emitLifecycleEvent(pluginId, "discover", "discovered", "started", "Discovering plugin");
      this.pluginStates.set(pluginId, "discovered");
      this.plugins.set(pluginId, plugin);
      this.emitLifecycleEvent(pluginId, "discover", "discovered", "completed", "Plugin discovered");

      this.emitLifecycleEvent(pluginId, "validate", "discovered", "started", "Validating manifest");
      const validation = manifestValidator.validate(plugin.manifest as unknown as Record<string, unknown>);
      if (!validation.valid) {
        this.emitLifecycleEvent(pluginId, "validate", "discovered", "failed", "Manifest validation failed", validation.errors.join("; "));
        return false;
      }
      await plugin.onValidate();
      this.emitLifecycleEvent(pluginId, "validate", "verified", "completed", "Manifest validated");

      this.emitLifecycleEvent(pluginId, "register", "verified", "started", "Registering permissions");
      permissionManager.registerPermissions(pluginId, plugin.manifest.permissions);
      this.emitLifecycleEvent(pluginId, "register", "verified", "completed", `${plugin.manifest.permissions.length} permission(s) registered`);

      this.emitLifecycleEvent(pluginId, "configure", "verified", "started", "Applying default configuration");
      await plugin.onConfigure(plugin.manifest.defaultConfig);
      this.emitLifecycleEvent(pluginId, "configure", "configured", "completed", "Configuration applied");

      this.emitLifecycleEvent(pluginId, "register", "configured", "started", "Registering with plugin registry");
      this.pluginStates.set(pluginId, "registered");
      this.emitLifecycleEvent(pluginId, "register", "registered", "completed", "Plugin registered");

      this.emitLifecycleEvent(pluginId, "initialize", "registered", "started", "Initializing plugin");
      await plugin.onInitialize();
      // Inject SDK APIs using concrete class instances
      plugin.injectApis({
        storage: new PluginStorage() as any,
        secrets: new PluginSecrets() as any,
        events: pluginEventBus.createAPI(pluginId) as any,
        auth: new PluginAuth(pluginId) as any,
        metrics: new PluginMetrics() as any,
        worker: new PluginWorker() as any,
      });
      this.pluginStates.set(pluginId, "initialized");
      this.emitLifecycleEvent(pluginId, "initialize", "initialized", "completed", "Plugin initialized");

      this.emitLifecycleEvent(pluginId, "initialize", "initialized", "started", "Activating plugin");
      await plugin.onActivate();
      this.pluginStates.set(pluginId, "healthy");
      this.emitLifecycleEvent(pluginId, "initialize", "healthy", "completed", "Plugin activated");

      pluginEventBus.emit("PluginInstalled", "system", {
        pluginId, name: plugin.manifest.name, version: plugin.manifest.version, category: plugin.manifest.category,
      }, { pluginId });

      logger.info({ pluginId, name: plugin.manifest.name, version: plugin.manifest.version },
        `[LIFECYCLE] Plugin "${pluginId}" installed successfully`);
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emitLifecycleEvent(pluginId, "install", "broken", "failed", "Install failed", errMsg);
      this.pluginStates.set(pluginId, "broken");
      logger.error({ pluginId, err }, `[LIFECYCLE] Plugin "${pluginId}" install FAILED`);
      return false;
    }
  }

  async disable(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    try {
      this.emitLifecycleEvent(pluginId, "disable", "healthy", "started", "Disabling plugin");
      await plugin.onDeactivate();
      this.pluginStates.set(pluginId, "disabled");
      this.emitLifecycleEvent(pluginId, "disable", "disabled", "completed", "Plugin disabled");
      pluginEventBus.emit("PluginDisabled", "system", { pluginId, name: plugin.manifest.name });
      return true;
    } catch (err) {
      this.emitLifecycleEvent(pluginId, "disable", "broken", "failed", "Disable failed", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async enable(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    try {
      this.emitLifecycleEvent(pluginId, "enable", "disabled", "started", "Enabling plugin");
      await plugin.onActivate();
      await plugin.onInitialize();
      this.pluginStates.set(pluginId, "healthy");
      this.emitLifecycleEvent(pluginId, "enable", "healthy", "completed", "Plugin enabled");
      pluginEventBus.emit("PluginEnabled", "system", { pluginId, name: plugin.manifest.name });
      return true;
    } catch (err) {
      this.emitLifecycleEvent(pluginId, "enable", "broken", "failed", "Enable failed", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async update(pluginId: string, newPlugin: PluginBase): Promise<boolean> {
    const oldPlugin = this.plugins.get(pluginId);
    if (!oldPlugin) return false;
    const fromVersion = oldPlugin.manifest.version;
    const toVersion = newPlugin.manifest.version;
    try {
      this.emitLifecycleEvent(pluginId, "update", "initialized", "started", `Updating ${fromVersion} → ${toVersion}`);
      await oldPlugin.onUpdate(fromVersion, toVersion);
      this.plugins.set(pluginId, newPlugin);
      await newPlugin.onConfigure(newPlugin.manifest.defaultConfig);
      await newPlugin.onInitialize();
      this.emitLifecycleEvent(pluginId, "update", "healthy", "completed", `Updated ${fromVersion} → ${toVersion}`);
      pluginEventBus.emit("PluginUpdated", "system", { pluginId, fromVersion, toVersion }, { pluginId });
      return true;
    } catch (err) {
      this.emitLifecycleEvent(pluginId, "update", "broken", "failed", "Update failed", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async rollback(pluginId: string, previousPlugin: PluginBase): Promise<boolean> {
    const currentPlugin = this.plugins.get(pluginId);
    if (!currentPlugin) return false;
    const fromVersion = currentPlugin.manifest.version;
    const toVersion = previousPlugin.manifest.version;
    try {
      this.emitLifecycleEvent(pluginId, "rollback", "healthy", "started", `Rolling back ${fromVersion} → ${toVersion}`);
      await currentPlugin.onRollback(fromVersion, toVersion);
      this.plugins.set(pluginId, previousPlugin);
      await previousPlugin.onInitialize();
      this.emitLifecycleEvent(pluginId, "rollback", "healthy", "completed", `Rolled back ${fromVersion} → ${toVersion}`);
      return true;
    } catch (err) {
      this.emitLifecycleEvent(pluginId, "rollback", "broken", "failed", "Rollback failed", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async remove(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    try {
      this.emitLifecycleEvent(pluginId, "remove", "disabled", "started", "Removing plugin");
      await plugin.onUninstall();
      this.pluginStates.delete(pluginId);
      this.plugins.delete(pluginId);
      this.emitLifecycleEvent(pluginId, "remove", "removed", "completed", "Plugin removed");
      permissionManager.removePlugin(pluginId);
      pluginEventBus.unsubscribeAll(pluginId);
      pluginEventBus.emit("PluginUninstalled", "system", { pluginId }, { pluginId });
      return true;
    } catch (err) {
      this.emitLifecycleEvent(pluginId, "remove", "removed", "failed", "Remove failed", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async healthCheck(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    this.emitLifecycleEvent(pluginId, "health_check", this.pluginStates.get(pluginId) ?? "discovered", "started", "Running health check");
    try {
      const result = await plugin.onHealthCheck();
      if (result.healthy) {
        this.pluginStates.set(pluginId, "healthy");
        this.emitLifecycleEvent(pluginId, "health_check", "healthy", "completed", result.message ?? "Health check passed");
        return true;
      } else {
        this.pluginStates.set(pluginId, "broken");
        this.emitLifecycleEvent(pluginId, "health_check", "broken", "failed", result.message ?? "Health check failed");
        return false;
      }
    } catch (err) {
      this.pluginStates.set(pluginId, "broken");
      this.emitLifecycleEvent(pluginId, "health_check", "broken", "failed", "Health check error", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  getState(pluginId: string): PluginLifecycleState | undefined { return this.pluginStates.get(pluginId); }
  getPlugin(pluginId: string): PluginBase | undefined { return this.plugins.get(pluginId); }

  getAllPlugins(): Array<{ plugin: PluginBase; state: PluginLifecycleState }> {
    return Array.from(this.plugins.entries()).map(([id, plugin]) => ({
      plugin, state: this.pluginStates.get(id) ?? "discovered",
    }));
  }

  getLifecycleHistory(pluginId?: string): LifecycleEvent[] {
    if (pluginId) return this.lifecycleHistory.filter((e) => e.pluginId === pluginId);
    return [...this.lifecycleHistory];
  }

  getStateCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const state of this.pluginStates.values()) counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }

  isHealthy(pluginId: string): boolean { return this.pluginStates.get(pluginId) === "healthy"; }
  isInstalled(pluginId: string): boolean { return this.plugins.has(pluginId); }

  shutdown(): void {
    for (const [pluginId, plugin] of this.plugins) {
      plugin.onDeactivate().catch(() => {});
      plugin.onUninstall().catch(() => {});
    }
    this.plugins.clear();
    this.pluginStates.clear();
    this.lifecycleHistory = [];
    logger.info("[LIFECYCLE] Plugin lifecycle manager shut down");
  }
}

export const pluginLifecycleManager = new PluginLifecycleManager();
