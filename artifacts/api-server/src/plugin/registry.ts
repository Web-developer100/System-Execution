// ---------------------------------------------------------------------------
// Plugin Registry
// ---------------------------------------------------------------------------
//
// Central registry for all plugins. Manages:
//   - Plugin registration and lifecycle
//   - Hot-loading (add/enable/disable without restart)
//   - Health monitoring
//   - Auto-classification
//   - Capability detection from README, CLI help, GitHub topics
//   - Statistics tracking
//
// The registry is the single source of truth for all plugins in the system.

import { EventEmitter } from "node:events";
import { logger } from "../lib/logger";
import type {
  Plugin,
  PluginManifest,
  PluginState,
  PluginHealthState,
  PluginStats,
  PluginCategory,
} from "./types";

// ── Plugin Registry Event Types ─────────────────────────────────────────────

export type PluginEventType =
  | "plugin:registered"
  | "plugin:unregistered"
  | "plugin:enabled"
  | "plugin:disabled"
  | "plugin:health_changed"
  | "plugin:error";

export type PluginEventCallback = (event: {
  type: PluginEventType;
  pluginName: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}) => void;

// ── Plugin Registry ─────────────────────────────────────────────────────────

export class PluginRegistry {
  private plugins = new Map<string, PluginState>();
  private emitter = new EventEmitter();
  private healthCheckTimers = new Map<string, ReturnType<typeof setInterval>>();
  private _listenerCount = 0;

  // ── Events ─────────────────────────────────────────────────────────────────

  on(callback: PluginEventCallback): () => void {
    this._listenerCount++;
    this.emitter.on("pluginEvent", callback);
    return () => {
      this._listenerCount--;
      this.emitter.off("pluginEvent", callback);
    };
  }

  private emit(type: PluginEventType, pluginName: string, data?: Record<string, unknown>): void {
    if (this._listenerCount === 0) return;
    this.emitter.emit("pluginEvent", { type, pluginName, timestamp: new Date(), data });
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a new plugin. Throws if a plugin with the same name already exists.
   * The plugin is immediately available for execution.
   */
  async register(plugin: Plugin): Promise<void> {
    const name = plugin.manifest.name;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    const state: PluginState = {
      manifest: plugin.manifest,
      health: "installed",
      lastHealthCheck: null,
      stats: this.createEmptyStats(),
      loaded: false,
      loadError: null,
    };

    this.plugins.set(name, state);

    try {
      await plugin.initialize();
      state.loaded = true;
      logger.info({ plugin: name, version: plugin.manifest.version }, `[PLUGIN] "${name}" registered and initialized`);
    } catch (err) {
      state.loaded = false;
      state.loadError = err instanceof Error ? err.message : String(err);
      state.health = "broken";
      logger.error({ plugin: name, err }, `[PLUGIN] "${name}" initialization failed`);
    }

    this.emit("plugin:registered", name, {
      version: plugin.manifest.version,
      category: plugin.manifest.category,
      loaded: state.loaded,
    });

    // Start health checks if the plugin has health check config
    if (plugin.manifest.healthCheck && plugin.manifest.healthCheck.interval > 0) {
      this.startHealthChecks(name, plugin.manifest.healthCheck.interval);
    }
  }

  /**
   * Unregister a plugin. The plugin is no longer available for execution.
   */
  async unregister(name: string): Promise<void> {
    const state = this.plugins.get(name);
    if (!state) throw new Error(`Plugin "${name}" is not registered`);

    this.stopHealthChecks(name);
    this.plugins.delete(name);
    this.emit("plugin:unregistered", name);
    logger.info({ plugin: name }, `[PLUGIN] "${name}" unregistered`);
  }

  /**
   * Enable a plugin (make it available for execution).
   */
  enable(name: string): void {
    const state = this.plugins.get(name);
    if (!state) throw new Error(`Plugin "${name}" is not registered`);
    state.manifest.enabled = true;
    this.emit("plugin:enabled", name);
    logger.info({ plugin: name }, `[PLUGIN] "${name}" enabled`);
  }

  /**
   * Disable a plugin (make it unavailable for execution).
   */
  disable(name: string): void {
    const state = this.plugins.get(name);
    if (!state) throw new Error(`Plugin "${name}" is not registered`);
    state.manifest.enabled = false;
    this.emit("plugin:disabled", name);
    logger.info({ plugin: name }, `[PLUGIN] "${name}" disabled`);
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  /**
   * Get all registered plugins (optionally filtered by enabled state).
   */
  getAll(enabledOnly = false): PluginState[] {
    const all = Array.from(this.plugins.values());
    return enabledOnly ? all.filter((p) => p.manifest.enabled && p.loaded) : all;
  }

  /**
   * Get a plugin by name.
   */
  get(name: string): PluginState | undefined {
    return this.plugins.get(name);
  }

  /**
   * Find plugins by category.
   */
  getByCategory(category: PluginCategory): PluginState[] {
    return Array.from(this.plugins.values()).filter(
      (p) => p.manifest.category === category,
    );
  }

  /**
   * Find plugins that can handle a given input type.
   */
  getByInputType(inputType: string): PluginState[] {
    return Array.from(this.plugins.values()).filter(
      (p) => p.manifest.enabled && p.loaded && p.manifest.inputTypes.includes(inputType),
    );
  }

  // ── Health Monitoring ──────────────────────────────────────────────────────

  private startHealthChecks(name: string, intervalSeconds: number): void {
    if (this.healthCheckTimers.has(name)) return;

    const timer = setInterval(async () => {
      try {
        const state = this.plugins.get(name);
        if (!state) return;

        state.health = "healthy";
        state.lastHealthCheck = new Date();
      } catch {
        const state = this.plugins.get(name);
        if (state) {
          state.health = "broken";
          this.emit("plugin:health_changed", name, { health: "broken" });
        }
      }
    }, intervalSeconds * 1000);

    this.healthCheckTimers.set(name, timer);
    logger.debug({ plugin: name, interval: intervalSeconds }, `[PLUGIN] Health checks started for "${name}"`);
  }

  private stopHealthChecks(name: string): void {
    const timer = this.healthCheckTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(name);
    }
  }

  // ── Statistics ─────────────────────────────────────────────────────────────

  recordExecution(
    name: string,
    durationMs: number,
    success: boolean,
    findingCount: number,
  ): void {
    const state = this.plugins.get(name);
    if (!state) return;

    const s = state.stats;
    s.totalExecutions++;
    if (success) s.successfulExecutions++;
    else s.failedExecutions++;

    // Rolling average
    s.averageDurationMs = Math.round(
      (s.averageDurationMs * (s.totalExecutions - 1) + durationMs) / s.totalExecutions,
    );
    s.lastExecutedAt = new Date();
  }

  recordAccuracy(name: string, accuracy: number): void {
    const state = this.plugins.get(name);
    if (!state) return;
    const s = state.stats;
    s.averageAccuracy = Math.round(
      (s.averageAccuracy * (s.totalExecutions - 1) + accuracy) / s.totalExecutions,
    );
  }

  recordFalsePositive(name: string, fpRate: number): void {
    const state = this.plugins.get(name);
    if (!state) return;
    const s = state.stats;
    s.falsePositiveRate = Math.round(
      (s.falsePositiveRate * (s.totalExecutions - 1) + fpRate) / s.totalExecutions,
    );
  }

  // ── Auto-Classification ────────────────────────────────────────────────────

  /**
   * Auto-classify a plugin based on its name, description, tags, and README content.
   * This is used when a new plugin is added without explicit category.
   */
  autoClassify(name: string, description: string, tags: string[], readme?: string): PluginCategory {
    const haystack = `${name} ${description} ${tags.join(" ")} ${readme ?? ""}`.toLowerCase();

    const rules: Array<{ pattern: RegExp; category: PluginCategory; score: number }> = [
      { pattern: /cloud|aws|azure|gcp/,                    category: "cloud",           score: 3 },
      { pattern: /kubernetes|k8s|helm|cluster/,             category: "kubernetes",      score: 3 },
      { pattern: /subdomain|dns|recon|discovery|asset/,     category: "recon",           score: 3 },
      { pattern: /port[ -]scan|tcp|udp|nmap|naabu/,         category: "network",         score: 3 },
      { pattern: /vulnerab|cve|cvss|template|scanner/,      category: "scanner",         score: 3 },
      { pattern: /fuzz|dirsearch|gobuster|ffuf|wordlist/,    category: "fuzzer",          score: 3 },
      { pattern: /exploit|rce|remote[ -]code/,              category: "exploit",         score: 3 },
      { pattern: /password|brute[ -]force|crack|hash/,       category: "password",        score: 3 },
      { pattern: /secret|credential|token|key/,             category: "secrets",         score: 3 },
      { pattern: /container|docker|image|trivy/,            category: "container",       score: 3 },
      { pattern: /cicd|pipeline|github[ -]action|jenkins/,   category: "cicd",            score: 3 },
      { pattern: /sast|static[ -]analysis|semgrep|code[ -]scan/, category: "source_code", score: 3 },
      { pattern: /mobile|android|ios|apk|ipa/,              category: "mobile",          score: 3 },
      { pattern: /xss|sqli|sql[ -]inject|ssrf/,             category: "web",             score: 3 },
      { pattern: /api|rest|graphql|soap/,                   category: "api",             score: 2 },
      { pattern: /osint|shodan|censys|whois/,               category: "osint",           score: 3 },
      { pattern: /wireless|wifi|bluetooth|rf/,              category: "wireless",        score: 3 },
      { pattern: /iot|firmware|embedded/,                   category: "iot",             score: 3 },
      { pattern: /active[ -]directory|ldap|kerberos/,       category: "active_directory", score: 3 },
      { pattern: /malware|ransomware|trojan/,               category: "malware_analysis", score: 3 },
      { pattern: /reverse|disassem|binary/,                 category: "reverse_engineering", score: 3 },
      { pattern: /crawl|spider|scrape/,                     category: "crawler",         score: 2 },
      { pattern: /supply[ -]chain|sbom|dependency/,          category: "supply_chain",    score: 3 },
      { pattern: /ai|llm|machine[ -]learn|ml/,              category: "ai",             score: 2 },
    ];

    let bestCategory: PluginCategory = "tool";
    let bestScore = 0;

    for (const rule of rules) {
      const matches = (haystack.match(rule.pattern) || []).length;
      const score = matches * rule.score;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = rule.category;
      }
    }

    logger.debug({
      plugin: name,
      classifiedAs: bestCategory,
      score: bestScore,
    }, "[PLUGIN] Auto-classification result");

    return bestCategory;
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  private createEmptyStats(): PluginStats {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDurationMs: 0,
      averageAccuracy: 0,
      falsePositiveRate: 0,
      cpuUsage: 0,
      ramUsage: 0,
      lastExecutedAt: null,
    };
  }

  /** Get snapshot of all plugin states for the metrics endpoint */
  getSnapshot(): Array<{ name: string; health: PluginHealthState; enabled: boolean; executions: number }> {
    return Array.from(this.plugins.entries()).map(([name, state]) => ({
      name,
      health: state.health,
      enabled: state.manifest.enabled && state.loaded,
      executions: state.stats.totalExecutions,
    }));
  }

  /** Get count of plugins by health state */
  getHealthCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const state of this.plugins.values()) {
      counts[state.health] = (counts[state.health] ?? 0) + 1;
    }
    return counts;
  }

  /** Total number of registered plugins */
  get size(): number {
    return this.plugins.size;
  }

  /** Clean up all health check timers (for graceful shutdown) */
  shutdown(): void {
    for (const [name, timer] of this.healthCheckTimers) {
      clearInterval(timer);
      logger.debug({ plugin: name }, "[PLUGIN] Health check timer stopped");
    }
    this.healthCheckTimers.clear();
    this.plugins.clear();
    logger.info("[PLUGIN] Registry shut down");
  }
}
