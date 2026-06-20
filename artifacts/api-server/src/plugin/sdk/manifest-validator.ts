// ---------------------------------------------------------------------------
// Plugin SDK — Manifest Validator
// ---------------------------------------------------------------------------

import { createHash, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { logger } from "../../lib/logger";
import type { PluginManifest, PluginPermissionRequest } from "./types";

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest: PluginManifest | null;
}

const VALID_MANIFEST_FILES = ["v8-plugin.json", "plugin.json", ".v8-plugin.json", "manifest.json"];

export class ManifestValidator {
  async findAndParse(pluginDir: string): Promise<ManifestValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await readFile(pluginDir, "utf-8");
    } catch {
      return { valid: false, errors: [`Plugin directory not found: ${pluginDir}`], warnings, manifest: null };
    }

    let manifestPath: string | null = null;
    for (const filename of VALID_MANIFEST_FILES) {
      const fullPath = `${pluginDir}/${filename}`;
      if (existsSync(fullPath)) {
        manifestPath = fullPath;
        break;
      }
    }

    if (!manifestPath) {
      return {
        valid: false,
        errors: [`No manifest file found in ${pluginDir}. Expected one of: ${VALID_MANIFEST_FILES.join(", ")}`],
        warnings, manifest: null,
      };
    }

    try {
      const content = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const result = this.validate(parsed);
      return {
        ...result,
        manifest: result.valid ? (parsed as unknown as PluginManifest) : null,
      };
    } catch (err) {
      const message = err instanceof SyntaxError
        ? `Invalid JSON in manifest file: ${err.message}`
        : `Failed to read manifest: ${err instanceof Error ? err.message : String(err)}`;
      return { valid: false, errors: [message], warnings, manifest: null };
    }
  }

  validate(manifest: Record<string, unknown>): ManifestValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    const requiredFields: Array<{ key: string; name: string; type: string }> = [
      { key: "id", name: "Plugin ID", type: "string" },
      { key: "name", name: "Plugin Name", type: "string" },
      { key: "version", name: "Version", type: "string" },
      { key: "description", name: "Description", type: "string" },
      { key: "author", name: "Author", type: "string" },
      { key: "license", name: "License", type: "string" },
      { key: "repository", name: "Repository", type: "string" },
      { key: "category", name: "Category", type: "string" },
      { key: "entryPoint", name: "Entry Point", type: "string" },
    ];

    for (const field of requiredFields) {
      const value = manifest[field.key];
      if (value === undefined || value === null || value === "") {
        errors.push(`${field.name} is required but was not provided`);
      } else if (typeof value !== field.type) {
        errors.push(`${field.name} must be a ${field.type}, got ${typeof value}`);
      }
    }

    // Semver validation
    const semverPattern = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?(?:\+[a-zA-Z0-9.]+)?$/;
    const version = manifest["version"] as string | undefined;
    if (version && !semverPattern.test(version)) {
      errors.push(`Version "${version}" is not valid semver (expected format: X.Y.Z)`);
    }

    const minPlatformVersion = manifest["minPlatformVersion"] as string | undefined;
    if (minPlatformVersion && !semverPattern.test(minPlatformVersion)) {
      errors.push(`minPlatformVersion "${minPlatformVersion}" is not valid semver`);
    }

    const maxPlatformVersion = manifest["maxPlatformVersion"] as string | undefined;
    if (maxPlatformVersion && !semverPattern.test(maxPlatformVersion)) {
      errors.push(`maxPlatformVersion "${maxPlatformVersion}" is not valid semver`);
    }

    // ID format
    const pluginId = manifest["id"] as string | undefined;
    if (pluginId && !/^[a-z0-9][a-z0-9._-]{1,64}$/.test(pluginId)) {
      errors.push(`Plugin ID "${pluginId}" is invalid. Use lowercase alphanumeric with dots, hyphens, underscores.`);
    }

    // Category validation
    const validCategories = [
      "scanner", "recon", "crawler", "fuzzer", "exploit",
      "verification", "ai", "reporting", "parser", "exporter",
      "notification", "authentication", "storage", "cloud", "container",
      "sast", "dast", "iast", "sca", "secrets_detection",
      "infrastructure", "monitoring", "compliance",
      "visualization", "workflow", "utility", "network", "web",
      "api", "kubernetes", "password", "osint", "mobile",
      "wireless", "iot", "active_directory",
      "malware_analysis", "reverse_engineering",
      "source_code", "supply_chain", "cicd", "tool",
    ];

    const category = manifest["category"] as string | undefined;
    if (category && !validCategories.includes(category)) {
      warnings.push(`Unknown category "${category}". Valid categories include: ${validCategories.slice(0, 10).join(", ")}...`);
    }

    // Permissions validation
    const permissions = manifest["permissions"];
    if (Array.isArray(permissions)) {
      for (const perm of permissions as PluginPermissionRequest[]) {
        if (typeof perm.permission !== "string") {
          warnings.push(`Permission entry missing 'permission' field`);
        }
      }
    }

    // Dependencies
    const dependencies = manifest["dependencies"];
    if (Array.isArray(dependencies)) {
      for (const dep of dependencies) {
        if (typeof dep !== "string" || dep.length === 0) {
          errors.push("Dependency IDs must be non-empty strings");
        }
      }
    }

    // Input/Output types
    const inputTypes = manifest["inputTypes"];
    if (!Array.isArray(inputTypes) || inputTypes.length === 0) {
      warnings.push("No input types specified — defaulting to [\"url\"]");
    }

    const outputTypes = manifest["outputTypes"];
    if (!Array.isArray(outputTypes) || outputTypes.length === 0) {
      warnings.push("No output types specified — defaulting to [\"json\"]");
    }

    // Checksum verification
    const checksum = manifest["checksum"] as string | undefined;
    const digitalSignature = manifest["digitalSignature"] as string | undefined;
    if (checksum && digitalSignature) {
      try {
        const sigValid = this.verifySignature(
          JSON.stringify({ id: pluginId, version, checksum }),
          digitalSignature,
        );
        if (!sigValid) {
          warnings.push("Digital signature verification failed — manifest may be tampered");
        }
      } catch {
        warnings.push("Digital signature could not be verified (no public key configured)");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      manifest: null, // Caller will cast if valid
    };
  }

  private verifySignature(payload: string, signature: string): boolean {
    try {
      const publicKey = process.env["V8_PLUGIN_SIGNING_PUBLIC_KEY"];
      if (!publicKey) {
        logger.warn("[PLUGIN-SIGNING] No V8_PLUGIN_SIGNING_PUBLIC_KEY set — skipping signature verification in dev mode");
        return true;
      }
      return verify("sha256", Buffer.from(payload, "utf-8"), publicKey, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  }

  async computeChecksum(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  }

  generateManifestTemplate(overrides: Partial<Record<string, unknown>>): string {
    const template: Record<string, unknown> = {
      id: overrides.id ?? "com.example.my-plugin",
      name: overrides.name ?? "My Plugin",
      version: overrides.version ?? "1.0.0",
      description: overrides.description ?? "A V8 platform plugin",
      author: overrides.author ?? "Plugin Developer",
      license: overrides.license ?? "MIT",
      repository: overrides.repository ?? "https://github.com/example/my-plugin",
      category: overrides.category ?? "utility",
      supportedPlatforms: overrides.supportedPlatforms ?? ["linux/amd64", "darwin/amd64"],
      supportedArchitectures: overrides.supportedArchitectures ?? ["amd64"],
      minPlatformVersion: overrides.minPlatformVersion ?? "1.0.0",
      dependencies: overrides.dependencies ?? [],
      optionalDependencies: overrides.optionalDependencies ?? [],
      permissions: overrides.permissions ?? [
        { permission: "network:access", reason: "Network scanning requires network access", required: true },
      ],
      networkRequirements: overrides.networkRequirements ?? {
        internetAccess: true, rawSockets: false, outboundConnections: true,
        inboundConnections: false, allowedDomains: [], allowedPorts: [], dnsResolution: true,
      },
      resourceLimits: overrides.resourceLimits ?? {
        cpu: "1", memory: "512m", timeout: 300, maxDisk: 104857600,
        maxOutput: 1048576, maxFileDescriptors: 128, maxProcesses: 10,
      },
      defaultConfig: overrides.defaultConfig ?? {},
      healthCheck: overrides.healthCheck ?? {
        interval: 60, timeout: 10, type: "command", command: "echo 'ok'", expectedExitCode: 0,
      },
      entryPoint: overrides.entryPoint ?? "index.js",
      inputTypes: overrides.inputTypes ?? ["url", "domain"],
      outputTypes: overrides.outputTypes ?? ["json"],
      subscribedEvents: overrides.subscribedEvents ?? ["ScanStarted", "ScanFinished"],
      publishedEvents: overrides.publishedEvents ?? [],
      tags: overrides.tags ?? [],
      enabled: true,
    };

    return JSON.stringify(template, null, 2);
  }
}

export const manifestValidator = new ManifestValidator();
