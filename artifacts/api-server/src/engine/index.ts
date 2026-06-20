// ── Scan Executor Engine ───────────────────────────────────────────────────
//
// Public API surface for the execution engine.
// Import from here to access the orchestrator, not from individual files.

export { ScanOrchestrator } from "./scan-orchestrator";
export { JobQueue } from "./job-queue";
export { WorkerPool } from "./worker-pool";
export { SubprocessExecutor } from "./executors/subprocess.executor";
export { DockerExecutor } from "./executors/docker.executor";

export { NucleiParser } from "./parsers/nuclei.parser";
export { NmapParser } from "./parsers/nmap.parser";
export { SubfinderParser } from "./parsers/subfinder.parser";
export { GenericParser } from "./parsers/generic.parser";

export type { ToolExecutor } from "./executor.interface";
export type { OutputParser } from "./parser.interface";
export { VerificationEngine, verificationEngine } from "./verification-engine";
export { ScanPipeline } from "./pipeline";
export { OutputStandardizer, outputStandardizer } from "./standardizer";
export type { VerificationResult, VerificationStatus, FinalDecision } from "./verification-engine";
export type { PipelineStage, ScanContext } from "./pipeline";
export type { StandardizedFinding } from "./standardizer";

export type {
  ScanJob,
  ScanResult,
  ToolResult,
  Finding,
  FindingSeverity,
  LogLevel,
  ToolExecutorConfig,
  ToolExecutionContext,
  ExecutorRegistration,
  JobEvent,
  JobEventCallback,
  JobEventType,
  ScanStatus,
} from "./types";

// ── Part 8: Distributed Execution Platform ─────────────────────────────────

export * from "./distributed";
