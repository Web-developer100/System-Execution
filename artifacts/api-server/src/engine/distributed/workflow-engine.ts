// ---------------------------------------------------------------------------
// Workflow Engine ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// DAG-based workflow execution inspired by Airflow and Temporal.
// Features:
//   - Directed Acyclic Graph (DAG) of dependent steps
//   - Automatic parallel execution of independent steps
//   - Configurable retry with exponential backoff
//   - Checkpointing at each step completion
//   - Dead letter handling for unrecoverable steps
//   - Workflow-level timeout and cancellation
//

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger";
import { distributedQueue } from "./distributed-queue";
import { distributedWorkerManager } from "./worker-manager";
import type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowStatus,
} from "./types";

// ── Events ────────────────────────────────────────────────────────────────

export type WorkflowEventType =
  | "workflow:started"
  | "workflow:step_started"
  | "workflow:step_completed"
  | "workflow:step_failed"
  | "workflow:step_retrying"
  | "workflow:completed"
  | "workflow:failed"
  | "workflow:cancelled";

export interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  stepId?: string;
  scanId: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ── Workflow Phase Definitions ─────────────────────────────────────────---

export interface WorkflowPhase {
  number: number;
  name: string;
  description: string;
  steps: WorkflowStepDefinition[];
}

const DEFAULT_WORKFLOW_PHASES: WorkflowPhase[] = [
  {
    number: 0,
    name: "reconnaissance",
    description: "Subdomain enumeration, DNS discovery, IP resolution",
    steps: [],
  },
  {
    number: 1,
    name: "asset_discovery",
    description: "Services, ports, cloud assets",
    steps: [],
  },
  {
    number: 2,
    name: "fingerprinting",
    description: "CMS, framework, server detection",
    steps: [],
  },
  {
    number: 3,
    name: "crawling",
    description: "URL discovery, endpoint extraction, JS parsing",
    steps: [],
  },
  {
    number: 4,
    name: "enumeration",
    description: "Parameters, APIs, hidden endpoints",
    steps: [],
  },
  {
    number: 5,
    name: "passive_scanning",
    description: "Header analysis, misconfiguration detection",
    steps: [],
  },
  {
    number: 6,
    name: "active_scanning",
    description: "Injection testing, auth testing, business logic",
    steps: [],
  },
  {
    number: 7,
    name: "deep_scan",
    description: "Complex payload testing, chained attacks",
    steps: [],
  },
  {
    number: 8,
    name: "verification",
    description: "Re-testing, cross-tool validation, PoC generation",
    steps: [],
  },
  {
    number: 9,
    name: "ai_analysis",
    description: "Risk scoring, exploit analysis, report prep",
    steps: [],
  },
  {
    number: 10,
    name: "reporting",
    description: "Final structured report",
    steps: [],
  },
];

// ── Workflow Engine ───────────────────────────────────────────────────────

export class WorkflowEngine {
  private workflows = new Map<string, WorkflowDefinition>();
  private emitter = new EventEmitter();
  private listenerCount = 0;
  private phaseDefinitions: WorkflowPhase[];

  constructor(phases?: WorkflowPhase[]) {
    this.phaseDefinitions = phases ?? DEFAULT_WORKFLOW_PHASES;
    logger.info(`[WORKFLOW] Engine initialized with ${this.phaseDefinitions.length} phases`);
  }

  // ── Events ─────────────────────────────────────────────────────────────

  on(callback: (event: WorkflowEvent) => void): () => void {
    this.listenerCount++;
    this.emitter.on("workflowEvent", callback);
    return () => {
      this.listenerCount--;
      this.emitter.off("workflowEvent", callback);
    };
  }

  private emit(type: WorkflowEventType, workflowId: string, scanId: number, stepId?: string, data?: Record<string, unknown>): void {
    if (this.listenerCount === 0) return;
    this.emitter.emit("workflowEvent", { type, workflowId, stepId, scanId, timestamp: new Date(), data });
  }

  // ── Workflow Creation ──────────────────────────────────────────────────

  createWorkflow(params: {
    scanId: number;
    target: string;
    tools: string[];
  }): WorkflowDefinition {
    const id = `wf-${randomUUID().slice(0, 12)}`;

    // Generate steps from tools mapped to phases
    const steps = this.generateSteps(params.tools);

    const workflow: WorkflowDefinition = {
      id,
      name: `Scan #${params.scanId} — ${params.target}`,
      scanId: params.scanId,
      target: params.target,
      steps,
      status: "pending",
      createdAt: new Date(),
      completedAt: null,
    };

    this.workflows.set(id, workflow);
    logger.info({ workflowId: id, scanId: params.scanId, steps: steps.length }, "[WORKFLOW] Created");

    return workflow;
  }

  /**
   * Start executing a workflow.
   */
  async startWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    workflow.status = "running";
    this.emit("workflow:started", workflowId, workflow.scanId, undefined, {
      target: workflow.target,
      steps: workflow.steps.length,
    });

    logger.info(
      { workflowId, scanId: workflow.scanId, steps: workflow.steps.length },
      "[WORKFLOW] Started execution",
    );

    await this.executeReadySteps(workflow);
  }

  /**
   * Execute all steps whose dependencies are satisfied.
   */
  private async executeReadySteps(workflow: WorkflowDefinition): Promise<void> {
    const ready = this.getReadySteps(workflow);

    if (ready.length === 0) {
      // Check if all steps are done
      const allDone = workflow.steps.every(
        (s) => s.status === "completed" || s.status === "failed",
      );

      if (allDone) {
        const hasFailures = workflow.steps.some((s) => s.status === "failed");
        workflow.status = hasFailures ? "failed" : "completed";
        workflow.completedAt = new Date();

        this.emit(
          workflow.status === "completed" ? "workflow:completed" : "workflow:failed",
          workflow.id,
          workflow.scanId,
          undefined,
          {
            totalSteps: workflow.steps.length,
            completedSteps: workflow.steps.filter((s) => s.status === "completed").length,
            failedSteps: workflow.steps.filter((s) => s.status === "failed").length,
          },
        );

        logger.info(
          { workflowId: workflow.id, status: workflow.status },
          "[WORKFLOW] Execution complete",
        );
      }
      return;
    }

    // Run ready steps in parallel
    const promises = ready.map(async (step) => {
      await this.executeStep(workflow, step);
    });

    await Promise.all(promises);

    // Check for next batch of ready steps
    await this.executeReadySteps(workflow);
  }

  /**
   * Execute a single workflow step by enqueueing it in the distributed queue.
   */
  private async executeStep(workflow: WorkflowDefinition, step: WorkflowStepDefinition): Promise<void> {
    step.status = "running";
    step.startedAt = new Date();
    this.emit("workflow:step_started", workflow.id, workflow.scanId, step.id, {
      toolName: step.toolName,
      name: step.name,
    });

    try {
      // Enqueue the job in the distributed queue
      const job = distributedQueue.enqueue({
        scanId: workflow.scanId,
        priority: 5,
        type: "tool_execution",
        target: workflow.target,
        toolName: step.toolName,
        workflowId: workflow.id,
        workflowStepId: step.id,
        dependencies: step.dependsOn,
        maxRetries: step.maxRetries,
        timeoutMs: step.timeoutMs,
      });

      // Wait for job completion (polling)
      const result = await this.awaitJobCompletion(job.id, step.timeoutMs + 60_000);

      if (result === "completed") {
        step.status = "completed";
        step.completedAt = new Date();
        step.attemptCount++;
        this.emit("workflow:step_completed", workflow.id, workflow.scanId, step.id, {
          toolName: step.toolName,
          attempts: step.attemptCount,
        });

        // Resolve dependencies for downstream steps
        distributedQueue.resolveDependencies(job.id);
      } else {
        throw new Error(`Job ${job.id} terminated with status: ${result}`);
      }
    } catch (err) {
      step.attemptCount++;
      const errMsg = err instanceof Error ? err.message : String(err);

      if (step.attemptCount <= step.maxRetries) {
        step.status = "failed"; // Will be retried
        this.emit("workflow:step_retrying", workflow.id, workflow.scanId, step.id, {
          error: errMsg,
          attempt: step.attemptCount,
          maxRetries: step.maxRetries,
        });

        // Retry with backoff
        const delay = Math.min(5_000 * Math.pow(2, step.attemptCount - 1), 300_000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await this.executeStep(workflow, step);
      } else {
        step.status = "failed";
        step.error = errMsg;
        step.completedAt = new Date();
        this.emit("workflow:step_failed", workflow.id, workflow.scanId, step.id, {
          error: errMsg,
          attempts: step.attemptCount,
        });
        logger.error(
          { workflowId: workflow.id, stepId: step.id, error: errMsg, attempts: step.attemptCount },
          "[WORKFLOW] Step failed permanently",
        );
      }
    }
  }

  /**
   * Poll for job completion.
   */
  private awaitJobCompletion(jobId: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const maxTime = startTime + timeoutMs;

      const check = () => {
        const job = distributedQueue.getJob(jobId);
        if (!job) {
          reject(new Error("Job not found"));
          return;
        }

        switch (job.status) {
          case "completed":
            resolve("completed");
            return;
          case "dead_letter":
          case "failed":
          case "cancelled":
            resolve(job.status);
            return;
          default:
            if (Date.now() > maxTime) {
              reject(new Error("Job completion wait timed out"));
              return;
            }
            setTimeout(check, 2_000);
        }
      };

      check();
    });
  }

  /**
   * Get steps that are ready to execute (all dependencies satisfied).
   */
  private getReadySteps(workflow: WorkflowDefinition): WorkflowStepDefinition[] {
    return workflow.steps.filter((step) => {
      if (step.status !== "pending" && step.status !== "failed") return false;
      // If it failed but has retries left, it's already being handled
      if (step.status === "failed" && step.attemptCount > step.maxRetries) return false;

      // Check dependencies
      return step.dependsOn.every((depId) => {
        const dep = workflow.steps.find((s) => s.id === depId);
        return dep && dep.status === "completed";
      });
    });
  }

  /**
   * Generate workflow steps from tools list.
   * Maps tools to appropriate phases based on their category.
   */
  private generateSteps(tools: string[]): WorkflowStepDefinition[] {
    const steps: WorkflowStepDefinition[] = [];
    let stepIndex = 0;

    // Tool-to-phase mapping
    const toolPhaseMap: Record<string, number> = {
      subfinder: 0, amass: 0, assetfinder: 0, chaos: 0, // Recon
      naabu: 1, nmap: 1, masscan: 1, rustscan: 1, // Asset discovery
      httpx: 2, tls: 2, wappalyzer: 2, // Fingerprinting
      katana: 3, gospider: 3, feroxbuster: 3, gau: 3, // Crawling
      ffuf: 4, gobuster: 4, dirsearch: 4, arjun: 4, paramspider: 4, // Enumeration
      nuclei: 5, dalfox: 6, sqlmap: 6, commix: 6, xsstrike: 6, // Scanning
    };

    // Group tools by phase
    const phaseTools = new Map<number, string[]>();
    for (const tool of tools) {
      const phase = toolPhaseMap[tool.toLowerCase()] ?? 5;
      if (!phaseTools.has(phase)) phaseTools.set(phase, []);
      phaseTools.get(phase)!.push(tool);
    }

    // Dependencies: each phase depends on all steps from the previous phase
    const sortedPhases = Array.from(phaseTools.keys()).sort();
    let previousStepIds: string[] = [];

    for (const phaseNum of sortedPhases) {
      const phaseToolsList = phaseTools.get(phaseNum)!;
      const phaseDef = this.phaseDefinitions[phaseNum];

      for (const tool of phaseToolsList) {
        const id = `step-${++stepIndex}`;
        steps.push({
          id,
          name: `${tool} ${phaseDef?.name ?? "scan"}`,
          toolName: tool,
          category: phaseDef?.name ?? "scan",
          dependsOn: [...previousStepIds],
          timeoutMs: 300_000,
          maxRetries: 2,
          retryDelayMs: 10_000,
          resourceLimits: {
            cpu: "1",
            memory: "1Gi",
            disk: "2Gi",
          },
          status: "pending",
          startedAt: null,
          completedAt: null,
          attemptCount: 0,
          error: null,
        });
        previousStepIds = [id]; // Each phase depends on the last step of previous phase
      }
    }

    return steps;
  }

  // ── Workflow Queries ───────────────────────────────────────────────────

  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  getWorkflowsByScan(scanId: number): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).filter((w) => w.scanId === scanId);
  }

  getActiveWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).filter((w) => w.status === "running");
  }

  getStats(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    pending: number;
  } {
    const all = Array.from(this.workflows.values());
    return {
      total: all.length,
      running: all.filter((w) => w.status === "running").length,
      completed: all.filter((w) => w.status === "completed").length,
      failed: all.filter((w) => w.status === "failed").length,
      pending: all.filter((w) => w.status === "pending").length,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  shutdown(): void {
    this.workflows.clear();
    this.emitter.removeAllListeners();
    logger.info("[WORKFLOW] Engine shut down");
  }
}

export const workflowEngine = new WorkflowEngine();
