export { PluginRegistry } from "./registry";
export { GitHubPluginIntegration, githubPluginIntegration } from "./github-integration";
export { PluginMarketplace, pluginMarketplace } from "./marketplace";
// Export SDK classes (not types that conflict with plugin/types.ts)
export {
  PluginBase,
  ManifestValidator, manifestValidator,
  PluginLifecycleManager, pluginLifecycleManager,
  PluginPermissionManager, permissionManager,
  PluginEventBus, pluginEventBus,
  PluginHealthMonitor, pluginHealthMonitor,
  PluginVersionManager, pluginVersionManager,
  DependencyResolver, dependencyResolver,
  PluginCliGenerator, pluginCliGenerator,
} from "./sdk";

// Re-export old types from plugin/types.ts as-is
export type * from "./types";
