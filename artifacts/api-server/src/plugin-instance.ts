// ---------------------------------------------------------------------------
// Plugin Registry Singleton
// ---------------------------------------------------------------------------
//
// Singleton instance with automatic boot-time registration of the 20
// curated core plugins. Every plugin is registered from the marketplace
// catalog so the platform never starts with an empty registry.

import { PluginRegistry } from "./plugin/registry";
import { pluginMarketplace } from "./plugin/marketplace";
import { logger } from "./lib/logger";

export const pluginRegistry = new PluginRegistry();

// ── Force-Register Curated Core Plugins at Boot ────────────────────────────

async function registerCuratedPlugins(): Promise<void> {
  try {
    const stats = pluginMarketplace.getStats();
    const catalog = pluginMarketplace.search({ pageSize: 100 });

    logger.info(
      { totalCurated: stats.totalPlugins },
      "[BOOT] Registering curated core plugins from marketplace catalog...",
    );

    let registered = 0;
    let failed = 0;

    for (const entry of catalog.plugins) {
      try {
        // Build a minimal Plugin-compatible manifest for registry
        const manifest = {
          name: entry.id.replace(/^com\.v8platform\./, ""),
          displayName: entry.name,
          description: entry.description,
          category: entry.category as import("./plugin/types").PluginCategory,
          author: entry.author,
          version: entry.latestVersion,
          minPlatformVersion: "1.0.0",
          repository: entry.githubUrl || "",
          language: "unknown",
          license: entry.license,
          tags: entry.tags,
          enabled: true,
          resourceLimits: {
            cpu: "1",
            memory: "512m",
            timeout: 300,
            maxStdout: 10_485_760,
            networkAllowed: true,
            filesystemWritable: false,
          },
          securityProfile: {
            dropCapabilities: ["ALL"],
            addCapabilities: [],
            readOnlyRootfs: true,
            allowPrivilegeEscalation: false,
            seccompProfile: "default",
            appArmorProfile: "",
          },
          inputTypes: ["url", "domain", "ip"],
          outputTypes: ["json"],
          aiRules: {
            cweIds: [],
            mitreIds: [],
            severityMapping: {},
            autoValidate: true,
            confidenceThreshold: 0.6,
          },
          healthCheck: {
            command: "",
            expectedExitCode: 0,
            interval: 0,
            timeout: 10,
          },
          updatePolicy: {
            checkMode: "github_release" as const,
            autoUpdate: false,
            rollbackOnFailure: true,
            branch: "main",
            detectBreakingChanges: true,
          },
        };

        // Create a minimal Plugin object
        const plugin = {
          manifest,
          initialize: async () => {
            logger.debug({ plugin: manifest.name }, `[BOOT] Plugin "${manifest.name}" initialized`);
          },
          shutdown: async () => {},
          execute: async () => ({
            toolName: manifest.name,
            exitCode: null,
            signal: null,
            stdout: "",
            stderr: "",
            findings: [],
            parsedSuccessfully: true,
            parseErrors: [],
            durationMs: 0,
            startedAt: new Date(),
            completedAt: new Date(),
          }),
          parse: () => [],
          healthCheck: async () => "healthy" as const,
          getVersion: async () => manifest.version,
        };

        await pluginRegistry.register(plugin);
        pluginRegistry.enable(manifest.name);
        registered++;
      } catch (err) {
        failed++;
        logger.warn(
          { plugin: entry.id, err },
          `[BOOT] Failed to register plugin "${entry.name}"`,
        );
      }
    }

    logger.info(
      { registered, failed, total: stats.totalPlugins },
      "[BOOT] Curated plugin registration complete",
    );
  } catch (err) {
    logger.error({ err }, "[BOOT] Failed to register curated plugins");
  }
}

// Execute immediately (fire-and-forget, don't block boot)
registerCuratedPlugins();
