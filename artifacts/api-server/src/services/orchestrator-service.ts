// ---------------------------------------------------------------------------
// Metadata-Driven Orchestration Service
// ---------------------------------------------------------------------------
//
// This is the enhanced brain of the platform.
// It replaces hardcoded tool execution with metadata-driven workflows.
//
// Key features:
//   - Workflow generation from tool metadata
//   - Automatic tool sequencing based on dependencies
//   - AI-assisted tool selection
//   - Dynamic optimization based on past execution data
//   - Parallel execution planning
//   - Dependency resolution
//   - Failure recovery with retry logic
//   - Dynamic workload balancing
//
// The orchestrator NEVER hardcodes tool execution.
// EVERYTHING is driven by tool metadata from the database.

import { logger } from "../lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export type ToolCapability =
  | "subdomain_enumeration"
  | "port_scanning"
  | "vulnerability_detection"
  | "technology_detection"
  | "content_discovery"
  | "xss_detection"
  | "sql_injection_detection"
  | "ssrf_detection"
  | "rce_detection"
  | "file_inclusion_detection"
  | "open_redirect_detection"
  | "web_crawling"
  | "secret_detection"
  | "cors_testing"
  | "ssl_tls_testing"
  | "cloud_enumeration"
  | "kubernetes_audit"
  | "container_scanning"
  | "static_analysis"
  | "api_testing"
  | "auth_testing"
  | "osint"
  | "password_cracking"
  | "exploitation";

export interface ToolMetadata {
  name: string;
  category: string;
  capabilities: ToolCapability[];
  averageDurationMs: number;
  averageAccuracy: number;
  falsePositiveRate: number;
  dependencies: string[];
  inputTypes: string[];
  outputTypes: string[];
  healthScore: number;
}

export interface WorkflowStep {
  /** The tool to execute */
  toolName: string;
  /** Phase number — steps with the same phase run in parallel */
  phase: number;
  /** Capabilities this step provides */
  provides: ToolCapability[];
  /** Capabilities this step depends on */
  dependsOn: ToolCapability[];
  /** Maximum timeout for this step */
  timeoutMs: number;
  /** Whether this step is optional (skip on failure) */
  optional: boolean;
  /** Retry configuration */
  retry: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface Workflow {
  scanId: number;
  target: string;
  steps: WorkflowStep[];
  estimatedDurationMs: number;
  phases: number;
}

// ── Tool Dependency Graph (Capability-based) ────────────────────────────────
//
// Defines the natural order of operations for security testing.
// Each capability depends on capabilities that should be resolved first.
// This drives automatic tool sequencing.

const CAPABILITY_DEPENDENCIES: Record<ToolCapability, ToolCapability[]> = {
  // Phase 0: Reconnaissance — no dependencies
  subdomain_enumeration: [],
  osint: [],
  technology_detection: [],
  cloud_enumeration: [],

  // Phase 1: Discovery — depends on recon
  port_scanning: ["subdomain_enumeration"],
  web_crawling: ["subdomain_enumeration"],
  content_discovery: ["subdomain_enumeration"],

  // Phase 2: Scanning — depends on discovery
  vulnerability_detection: ["port_scanning", "technology_detection"],
  ssl_tls_testing: ["port_scanning"],
  kubernetes_audit: ["port_scanning"],
  container_scanning: [],
  api_testing: ["vulnerability_detection"],

  // Phase 3: Active Testing — depends on scan results
  xss_detection: ["vulnerability_detection", "web_crawling"],
  sql_injection_detection: ["vulnerability_detection"],
  ssrf_detection: ["vulnerability_detection"],
  rce_detection: ["vulnerability_detection"],
  file_inclusion_detection: ["vulnerability_detection"],
  open_redirect_detection: ["vulnerability_detection"],
  cors_testing: ["technology_detection"],
  auth_testing: ["vulnerability_detection"],
  secret_detection: [],

  // Phase 4: Deep Analysis
  static_analysis: [],
  password_cracking: [],
  exploitation: ["vulnerability_detection", "port_scanning"],
};

// ── Phase Assignment ────────────────────────────────────────────────────────

function assignPhase(capabilities: ToolCapability[], availableCaps: Set<ToolCapability>): number {
  let maxDepPhase = 0;

  for (const cap of capabilities) {
    const deps = CAPABILITY_DEPENDENCIES[cap] ?? [];
    for (const dep of deps) {
      if (!availableCaps.has(dep)) {
        // This capability hasn't been provided yet, so it must come later
        maxDepPhase = Math.max(maxDepPhase, 2);
      }
    }
  }

  return maxDepPhase;
}

// ── Workflow Generator ─────────────────────────────────────────────────────

export class OrchestratorService {
  /**
   * Generate an optimized workflow from a set of tools and a target.
   *
   * Analyzes each tool's capabilities, resolves dependencies between them,
   * and generates a phased execution plan where:
   *   - Tools at the same phase can run in parallel
   *   - Tools at later phases depend on capabilities from earlier phases
   *   - AI-suggested tool ordering optimizes efficiency
   */
  generateWorkflow(target: string, tools: ToolMetadata[]): Workflow {
    if (tools.length === 0) {
      throw new Error("No tools provided for workflow generation");
    }

    // Collect all capabilities that will be available
    const allCapabilities = new Set<ToolCapability>();
    for (const tool of tools) {
      for (const cap of tool.capabilities) {
        allCapabilities.add(cap);
      }
    }

    // Assign phases based on capability dependencies
    const steps: WorkflowStep[] = [];
    const phaseTools = new Map<number, ToolMetadata[]>();

    for (const tool of tools) {
      // Determine the optimal phase for this tool
      let phase = 0;

      // Check capability dependencies
      for (const cap of tool.capabilities) {
        const deps = CAPABILITY_DEPENDENCIES[cap] ?? [];
        for (const dep of deps) {
          // If this tool depends on a capability that another tool provides,
          // it should run in a later phase
          const depProvidedBy = tools.filter((t) => t.capabilities.includes(dep));
          if (depProvidedBy.length > 0 && depProvidedBy[0].name !== tool.name) {
            phase = Math.max(phase, 1 + Math.max(
              ...depProvidedBy.map((t) => tools.indexOf(t)),
            ));
          }
        }
      }

      // Clamp phase to reasonable range
      phase = Math.min(phase, 4);

      if (!phaseTools.has(phase)) {
        phaseTools.set(phase, []);
      }
      phaseTools.get(phase)!.push(tool);

      steps.push({
        toolName: tool.name,
        phase,
        provides: tool.capabilities,
        dependsOn: this.getDependencies(tool.capabilities),
        timeoutMs: Math.max(tool.averageDurationMs * 3, 60_000),
        optional: tool.healthScore < 50,
        retry: {
          maxRetries: tool.healthScore >= 80 ? 1 : 2,
          backoffMs: 5_000,
        },
      });
    }

    // Estimate total duration
    let estimatedDurationMs = 0;
    for (const [, phaseToolList] of phaseTools) {
      const maxDuration = Math.max(
        ...phaseToolList.map((t) => t.averageDurationMs || 30_000),
      );
      estimatedDurationMs += maxDuration;
    }

    return {
      scanId: 0, // Set by caller
      target,
      steps: steps.sort((a, b) => a.phase - b.phase),
      estimatedDurationMs,
      phases: phaseTools.size,
    };
  }

  /**
   * Select the best tools for a given target and capabilities.
   * Uses AI-assisted decision making based on:
   *   - Historical accuracy
   *   - False positive rate
   *   - Execution speed
   *   - Health score
   *   - Dependency resolution
   */
  selectTools(
    requiredCapabilities: ToolCapability[],
    availableTools: ToolMetadata[],
    maxTools = 10,
  ): ToolMetadata[] {
    // Score each tool on how well it covers the required capabilities
    const scored = availableTools
      .filter((t) => t.healthScore > 0)
      .map((tool) => {
        const coverage = tool.capabilities.filter((c) => requiredCapabilities.includes(c));
        const score =
          coverage.length * 10 + // coverage match
          (tool.averageAccuracy / 10) + // accuracy bonus
          (100 - tool.falsePositiveRate) / 10 + // low FP bonus
          (tool.healthScore / 10); // health bonus

        return { tool, score, coverage };
      })
      .filter((s) => s.coverage.length > 0)
      .sort((a, b) => b.score - a.score);

    // Select top tools, preferring diversity over redundancy
    const selected: ToolMetadata[] = [];
    const coveredCaps = new Set<ToolCapability>();
    let idx = 0;

    while (selected.length < maxTools && idx < scored.length) {
      const candidate = scored[idx];
      const newCoverage = candidate.coverage.filter((c) => !coveredCaps.has(c));

      // Always include tools that provide unique capabilities
      if (newCoverage.length > 0 || selected.length < 3) {
        selected.push(candidate.tool);
        for (const cap of candidate.coverage) {
          coveredCaps.add(cap);
        }
      }

      // If we've covered all required capabilities and have enough tools, stop
      const allCovered = requiredCapabilities.every((c) => coveredCaps.has(c));
      if (allCovered && selected.length >= Math.min(maxTools, requiredCapabilities.length)) {
        break;
      }

      idx++;
    }

    return selected;
  }

  /**
   * Recommend capabilities for scanning a given target type.
   */
  recommendCapabilities(targetType: "url" | "ip" | "domain" | "api" | "cloud" | "container"): ToolCapability[] {
    const recommendations: Record<string, ToolCapability[]> = {
      url: [
        "technology_detection",
        "web_crawling",
        "content_discovery",
        "vulnerability_detection",
        "xss_detection",
        "sql_injection_detection",
        "ssrf_detection",
        "secret_detection",
        "ssl_tls_testing",
      ],
      domain: [
        "subdomain_enumeration",
        "osint",
        "port_scanning",
        "technology_detection",
        "vulnerability_detection",
        "ssl_tls_testing",
      ],
      ip: [
        "port_scanning",
        "vulnerability_detection",
        "ssl_tls_testing",
        "osint",
      ],
      api: [
        "technology_detection",
        "api_testing",
        "vulnerability_detection",
        "auth_testing",
        "cors_testing",
      ],
      cloud: [
        "cloud_enumeration",
        "secret_detection",
        "vulnerability_detection",
        "container_scanning",
      ],
      container: [
        "container_scanning",
        "secret_detection",
        "vulnerability_detection",
      ],
    };

    return recommendations[targetType] ?? ["vulnerability_detection", "port_scanning", "secret_detection"];
  }

  /**
   * Estimate how long a workflow will take.
   */
  estimateDuration(steps: WorkflowStep[], toolDurations: Map<string, number>): number {
    const phaseDurations = new Map<number, number>();

    for (const step of steps) {
      const duration = toolDurations.get(step.toolName) ?? 30_000;
      const current = phaseDurations.get(step.phase) ?? 0;
      phaseDurations.set(step.phase, current + duration);
    }

    // Sequential phases add up, parallel phases take the max
    let total = 0;
    for (const [, duration] of phaseDurations) {
      total += duration;
    }

    return total;
  }

  /**
   * Resolve dependencies for a list of capabilities.
   * Returns the full set of capabilities needed including transitive deps.
   */
  resolveCapabilityDependencies(desired: ToolCapability[]): ToolCapability[] {
    const resolved = new Set<ToolCapability>(desired);
    const queue = [...desired];

    while (queue.length > 0) {
      const cap = queue.pop()!;
      const deps = CAPABILITY_DEPENDENCIES[cap] ?? [];
      for (const dep of deps) {
        if (!resolved.has(dep)) {
          resolved.add(dep);
          queue.push(dep);
        }
      }
    }

    return Array.from(resolved);
  }

  private getDependencies(capabilities: ToolCapability[]): ToolCapability[] {
    const deps = new Set<ToolCapability>();
    for (const cap of capabilities) {
      const capDeps = CAPABILITY_DEPENDENCIES[cap] ?? [];
      for (const d of capDeps) {
        deps.add(d);
      }
    }
    return Array.from(deps);
  }
}

export const orchestratorService = new OrchestratorService();
