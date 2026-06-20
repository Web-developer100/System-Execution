// ---------------------------------------------------------------------------
// Plugin SDK — PluginBase Abstract Class
// ---------------------------------------------------------------------------

import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger";
import type {
  PluginManifest, PluginExecutionContext, PluginExecutionResult,
  PluginLifecycleState, ConfigSchema, StorageAPI, SecretsAPI,
  EventAPI, AuthHelpers, MetricsAPI, WorkerAPI,
} from "./types";
import type { LogLevel, Finding } from "../../engine/types";

export abstract class PluginBase {
  abstract readonly manifest: PluginManifest;
  readonly configSchema?: ConfigSchema;
  protected config: Record<string, unknown> = {};
  protected lifecycleState: PluginLifecycleState = "discovered";
  protected events = new EventEmitter();

  protected storage!: StorageAPI;
  protected secrets!: SecretsAPI;
  protected eventAPI!: EventAPI;
  protected auth!: AuthHelpers;
  protected metrics!: MetricsAPI;
  protected workerAPI!: WorkerAPI;

  async onInstall(): Promise<void> { this.lifecycleState = "downloaded"; }
  async onValidate(): Promise<void> { this.lifecycleState = "verified"; }
  async onConfigure(config: Record<string, unknown>): Promise<void> {
    this.config = { ...this.manifest.defaultConfig, ...config };
    this.lifecycleState = "configured";
  }
  async onActivate(): Promise<void> { this.lifecycleState = "registered"; }
  async onInitialize(): Promise<void> { this.lifecycleState = "initialized"; }

  async onHealthCheck(): Promise<{ healthy: boolean; message?: string; metrics?: Record<string, number> }> {
    return { healthy: true, message: "Plugin is operational" };
  }

  abstract execute(ctx: PluginExecutionContext): Promise<PluginExecutionResult>;

  async onDeactivate(): Promise<void> { this.lifecycleState = "disabled"; }
  async onUpdate(_fromVersion: string, _toVersion: string): Promise<void> {}
  async onRollback(_fromVersion: string, _toVersion: string): Promise<void> {}
  async onUninstall(): Promise<void> { this.lifecycleState = "removed"; }

  async parseOutput(_params: {
    toolName: string; scanId: number; target: string; stdout: string; stderr: string;
  }): Promise<Finding[]> {
    return [];
  }

  injectApis(apis: {
    storage: StorageAPI; secrets: SecretsAPI; events: EventAPI;
    auth: AuthHelpers; metrics: MetricsAPI; worker: WorkerAPI;
  }): void {
    this.storage = apis.storage;
    this.secrets = apis.secrets;
    this.eventAPI = apis.events;
    this.auth = apis.auth;
    this.metrics = apis.metrics;
    this.workerAPI = apis.worker;
  }

  getState(): PluginLifecycleState { return this.lifecycleState; }
  getConfig(): Record<string, unknown> { return { ...this.config }; }
  getConfigValue<T = unknown>(key: string, defaultValue?: T): T {
    return (this.config[key] as T) ?? defaultValue as T;
  }

  // Pino logger uses named methods, not .log()
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const prefix = `[PLUGIN:${this.manifest.id}]`;
    const logData = { ...meta, plugin: this.manifest.id };
    switch (level) {
      case "info": logger.info(logData, `${prefix} ${message}`); break;
      case "warn": logger.warn(logData, `${prefix} ${message}`); break;
      case "error": logger.error(logData, `${prefix} ${message}`); break;
      case "success": logger.info(logData, `${prefix} ✅ ${message}`); break;
      case "debug": logger.debug(logData, `${prefix} ${message}`); break;
    }
  }

  getRequiredPermissions() { return this.manifest.permissions.filter((p) => p.required); }

  hasPermission(permission: string): boolean {
    if (!this.auth) return false;
    return (this.auth as unknown as { hasPermission: (p: string) => boolean }).hasPermission(permission);
  }

  onEvent(eventType: string, handler: (data: Record<string, unknown>) => void): () => void {
    this.events.on(eventType, handler);
    return () => { this.events.off(eventType, handler); };
  }

  protected emitEvent(type: string, data: Record<string, unknown>): void {
    this.events.emit(type, data);
    if (this.eventAPI) void this.eventAPI.emit(type, data);
  }
}
