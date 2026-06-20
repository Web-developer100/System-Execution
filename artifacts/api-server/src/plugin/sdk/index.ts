// ---------------------------------------------------------------------------
// Plugin SDK — Public API
// ---------------------------------------------------------------------------
//
// Import everything from here:
//   import { PluginBase, PluginLifecycleManager, ... } from "./plugin/sdk";
//
// SDK Components:
//   PluginBase          — Abstract base class for all plugins
//   ManifestValidator   — Manifest validation and parsing
//   PluginLifecycleManager — Complete lifecycle orchestration
//   PluginPermissionManager — Permission model with admin approval
//   PluginEventBus      — Event subscription and publishing
//   PluginHealthMonitor — Health monitoring with alerts
//   PluginVersionManager — Semver, rollback, canary deployments
//   DependencyResolver  — Plugin/package dependency resolution
//   PluginCliGenerator  — Plugin project scaffolding

export { PluginBase } from "./plugin-base";
export type { PluginExecutionContext, PluginExecutionResult } from "./types";
export { ManifestValidator, manifestValidator } from "./manifest-validator";
export { PluginLifecycleManager, pluginLifecycleManager } from "./lifecycle-manager";
export type { LifecycleStep, LifecycleEvent } from "./lifecycle-manager";
export { PluginPermissionManager, permissionManager } from "./permissions";
export type { PluginPermissionState, PermissionStatus } from "./permissions";
export { PluginEventBus, pluginEventBus } from "./events";
export type { PluginEvent, PluginEventType } from "./events";
export { PluginHealthMonitor, pluginHealthMonitor } from "./health-monitor";
export type { HealthStatus, PluginHealthSnapshot, HealthAlert, HealthMonitorConfig } from "./health-monitor";
export { PluginVersionManager, pluginVersionManager } from "./version-manager";
export type { VersionChannel, VersionRecord } from "./version-manager";
export { DependencyResolver, dependencyResolver } from "./dependency-resolver";
export type { Dependency, DependencyResolution, DependencyGraph, DependencyType } from "./dependency-resolver";
export { PluginCliGenerator, pluginCliGenerator } from "./cli-generator";
export type { PluginTemplate } from "./cli-generator";

// All types
export type {
  PluginManifest,
  PluginCategory,
  PluginPermission,
  PluginPermissionRequest,
  PluginResourceLimits,
  PluginLifecycleState,
  PluginHealthCheckConfig,
  NetworkRequirements,
  ExecutionEnvironment,
  ExecutionEnvironmentType,
  MarketplacePlugin,
  MarketplaceSearchFilter,
  MarketplaceSearchResult,
  VersionInfo,
  StorageAPI,
  SecretsAPI,
  EventAPI,
  AuthHelpers,
  MetricsAPI,
  WorkerAPI,
  ConfigField,
  ConfigSchema,
  PluginExecutionResult as PluginSdkExecutionResult,
} from "./types";
