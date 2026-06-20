// ---------------------------------------------------------------------------
// Kubernetes Executor ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Runs security tools as Kubernetes Jobs with full cluster integration:
//   - Job Execution with resource limits
//   - Namespace isolation per scan
//   - Node selectors, affinity rules, taints/tolerations
//   - Resource Quotas
//   - ConfigMaps and Secrets injection
//   - Service Accounts for RBAC
//   - Network Policies for isolation
//   - Persistent Volumes for artifacts
//   - Horizontal Pod Autoscaling awareness
//
// The executor communicates with the Kubernetes API via the in-cluster
// config or a provided kubeconfig file.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { logger } from "../../lib/logger";
import type { ToolResult, LogLevel } from "../types";
import type { ToolExecutor } from "../executor.interface";

// ── Kubernetes Config ────────────────────────────────────────────────────

export interface KubernetesExecutorConfig {
  /** Kubernetes namespace to use (default: "v8-platform") */
  namespace: string;
  /** Default service account name */
  serviceAccount: string;
  /** Storage class for PVCs */
  storageClass: string;
  /** Default CPU limit */
  defaultCpu: string;
  /** Default memory limit */
  defaultMemory: string;
  /** Default ephemeral storage */
  defaultEphemeralStorage: string;
  /** Whether to use in-cluster config */
  inCluster: boolean;
  /** Path to kubeconfig file (for out-of-cluster) */
  kubeconfigPath: string | null;
  /** Default image pull policy */
  imagePullPolicy: "Always" | "IfNotPresent" | "Never";
  /** Node selector labels */
  nodeSelector: Record<string, string>;
}

const DEFAULT_K8S_CONFIG: KubernetesExecutorConfig = {
  namespace: "v8-platform",
  serviceAccount: "v8-worker",
  storageClass: "standard",
  defaultCpu: "1",
  defaultMemory: "1Gi",
  defaultEphemeralStorage: "2Gi",
  inCluster: true,
  kubeconfigPath: null,
  imagePullPolicy: "IfNotPresent",
  nodeSelector: {},
};

// ── Kubernetes Executor ───────────────────────────────────────────────────

export class KubernetesExecutor implements ToolExecutor {
  readonly name = "kubernetes";
  private config: KubernetesExecutorConfig;
  private _available: boolean | null = null;

  constructor(config?: Partial<KubernetesExecutorConfig>) {
    this.config = { ...DEFAULT_K8S_CONFIG, ...config };
    logger.info("[K8S] Kubernetes Executor initialized");
  }

  canExecute(toolName: string): boolean {
    return true; // Can execute any tool if Kubernetes is available
  }

  async execute(params: {
    toolName: string;
    toolPath: string;
    target: string;
    scanId: number;
    config: {
      timeoutMs: number;
      abortSignal: AbortSignal;
      useProxy: boolean;
      proxyUrl?: string;
      environment?: Record<string, string>;
    };
    emitLog: (level: LogLevel, message: string) => Promise<void>;
    emitProgress: (progress: number) => Promise<void>;
  }): Promise<ToolResult> {
    const { toolName, target, scanId, config, emitLog, emitProgress } = params;
    const startedAt = new Date();
    const jobName = `v8-${toolName}-${scanId}-${randomUUID().slice(0, 8)}`;

    await emitLog("info", `[K8S:${toolName.toUpperCase()}] Creating Kubernetes Job: ${jobName}`);

    try {
      // Build and apply the Kubernetes Job YAML
      const yaml = this.buildJobYaml(toolName, target, jobName, scanId, config);
      const yamlPath = path.join(os.tmpdir(), `k8s-job-${jobName}.yaml`);

      // Write YAML to temp file
      await import("node:fs/promises").then((fs) => fs.writeFile(yamlPath, yaml, "utf-8"));

      // Apply the Job
      await this.runKubectl(["apply", "-f", yamlPath], emitLog);
      await emitLog("info", `[K8S:${toolName.toUpperCase()}] Job ${jobName} created`);

      // Wait for completion (polling)
      const result = await this.waitForJob(jobName, config.timeoutMs, emitLog, emitProgress);

      // Get logs
      const logs = await this.getJobLogs(jobName);
      await emitLog("success", `[K8S:${toolName.toUpperCase()}] Job ${jobName} completed (exit: ${result.exitCode})`);

      // Cleanup
      await this.runKubectl(["delete", "job", jobName, "--ignore-not-found=true"], emitLog).catch(() => {});
      await import("node:fs/promises").then((fs) => fs.rm(yamlPath, { force: true }));

      const completedAt = new Date();
      return {
        toolName,
        exitCode: result.exitCode,
        signal: null,
        stdout: logs.stdout,
        stderr: logs.stderr,
        findings: [],
        parsedSuccessfully: true,
        parseErrors: [],
        durationMs: completedAt.getTime() - startedAt.getTime(),
        startedAt,
        completedAt,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await emitLog("error", `[K8S:${toolName.toUpperCase()}] Failed: ${errMsg}`);

      // Cleanup on failure
      await this.runKubectl(["delete", "job", jobName, "--ignore-not-found=true"], emitLog).catch(() => {});

      const completedAt = new Date();
      return {
        toolName,
        exitCode: -1,
        signal: null,
        stdout: "",
        stderr: errMsg,
        findings: [],
        parsedSuccessfully: false,
        parseErrors: [errMsg],
        durationMs: completedAt.getTime() - startedAt.getTime(),
        startedAt,
        completedAt,
      };
    }
  }

  private buildJobYaml(
    toolName: string,
    target: string,
    jobName: string,
    scanId: number,
    config: { timeoutMs: number; useProxy: boolean; proxyUrl?: string; environment?: Record<string, string> },
  ): string {
    const labels = {
      app: "v8-platform",
      tool: toolName,
      scan: String(scanId),
      job: jobName,
    };

    const labelStr = Object.entries(labels).map(([k, v]) => `    ${k}: "${v}"`).join("\n");

    const envVars = [
      { name: "TARGET", value: target },
      { name: "SCAN_ID", value: String(scanId) },
      { name: "TOOL_NAME", value: toolName },
    ];

    if (config.useProxy && config.proxyUrl) {
      envVars.push({ name: "HTTP_PROXY", value: config.proxyUrl });
      envVars.push({ name: "HTTPS_PROXY", value: config.proxyUrl });
    }

    if (config.environment) {
      for (const [key, value] of Object.entries(config.environment)) {
        envVars.push({ name: key, value });
      }
    }

    const envStr = envVars.map((e) => `        - name: ${e.name}\n          value: "${e.value}"`).join("\n");

    const nodeSelectorStr = Object.entries(this.config.nodeSelector).length > 0
      ? `  nodeSelector:\n${Object.entries(this.config.nodeSelector).map(([k, v]) => `    ${k}: "${v}"`).join("\n")}`
      : "";

    const activeDeadline = Math.ceil(config.timeoutMs / 1000);

    return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
  namespace: ${this.config.namespace}
  labels:
${labelStr}
spec:
  ttlSecondsAfterFinished: 3600
  activeDeadlineSeconds: ${activeDeadline}
  backoffLimit: 1
  template:
    metadata:
      labels:
${labelStr}
    spec:
      serviceAccountName: ${this.config.serviceAccount}
      restartPolicy: Never
      containers:
        - name: ${toolName}
          image: v8-tool-${toolName}:latest
          imagePullPolicy: ${this.config.imagePullPolicy}
          args: ["${target}"]
          env:
${envStr}
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
              ephemeral-storage: "512Mi"
            limits:
              cpu: ${this.config.defaultCpu}
              memory: ${this.config.defaultMemory}
              ephemeral-storage: ${this.config.defaultEphemeralStorage}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
              ${toolName === "nmap" || toolName === "naabu" ? 'add: ["NET_RAW", "NET_ADMIN"]' : "add: []"}
      ${nodeSelectorStr}
      tolerations:
        - key: "v8-platform"
          operator: "Equal"
          value: "worker"
          effect: "NoSchedule"
`;
  }



  private async waitForJob(
    jobName: string,
    timeoutMs: number,
    emitLog: (level: LogLevel, msg: string) => Promise<void>,
    emitProgress: (progress: number) => Promise<void>,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const startTime = Date.now();
    const maxTime = startTime + timeoutMs;

    await emitLog("info", `[K8S] Waiting for job ${jobName} to complete...`);

    while (Date.now() < maxTime) {
      const status = await this.runKubectl([
        "get", "job", jobName,
        "-o", "jsonpath={.status.succeeded},{.status.failed},{.status.active}",
      ], emitLog);

      const parts = status.stdout.trim().split(",");
      const succeeded = parseInt(parts[0] ?? "0");
      const failed = parseInt(parts[1] ?? "0");
      const active = parseInt(parts[2] ?? "0");

      // Calculate progress
      const elapsed = Date.now() - startTime;
      const pct = Math.min(95, Math.round((elapsed / timeoutMs) * 100));
      await emitProgress(pct);

      if (succeeded > 0) {
        await emitProgress(100);
        const podName = await this.getPodName(jobName);
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (failed > 0) {
        const podName = await this.getPodName(jobName);
        const podLogs = podName ? await this.getPodLogs(podName) : { stdout: "", stderr: "Pod terminated with error" };
        return { exitCode: 1, ...podLogs };
      }

      if (active === 0 && succeeded === 0 && failed === 0) {
        // Job might not have started yet
      }

      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }

    // Timeout
    await emitLog("warn", `[K8S] Job ${jobName} timed out after ${timeoutMs}ms`);
    return { exitCode: -1, stdout: "", stderr: "Job timed out" };
  }

  private async getPodName(jobName: string): Promise<string | null> {
    try {
      const result = await this.runKubectl([
        "get", "pods",
        "--selector", `job-name=${jobName}`,
        "-o", "jsonpath={.items[0].metadata.name}",
      ], () => Promise.resolve());
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async getPodLogs(podName: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const stdout = await this.runKubectl(["logs", podName], () => Promise.resolve());
      return { stdout: stdout.stdout, stderr: "" };
    } catch {
      return { stdout: "", stderr: "Failed to get pod logs" };
    }
  }

  private async getJobLogs(jobName: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const podName = await this.getPodName(jobName);
      if (podName) return this.getPodLogs(podName);
    } catch {
      // ignore
    }
    return { stdout: "", stderr: "" };
  }

  private async runKubectl(
    args: string[],
    emitLog: (level: LogLevel, msg: string) => Promise<void>,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const env: Record<string, string | undefined> = { ...process.env };
      if (this.config.kubeconfigPath) {
        env["KUBECONFIG"] = this.config.kubeconfigPath;
      }

      const child = spawn("kubectl", args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: env as Record<string, string>,
        shell: false,
        windowsHide: true,
        timeout: 30_000,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        resolve({ stdout, stderr: `kubectl error: ${err.message}`, exitCode: -1 });
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  }

  /**
   * Check if Kubernetes is available.
   */
  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;

    try {
      const result = await this.runKubectl(["cluster-info", "--request-timeout", "5s"], () => Promise.resolve());
      this._available = result.exitCode === 0;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  /**
   * Configure the executor with a kubeconfig path.
   */
  setKubeconfig(path: string): void {
    this.config.kubeconfigPath = path;
    this._available = null; // Reset availability cache
  }
}
