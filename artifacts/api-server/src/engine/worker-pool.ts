import type { ToolExecutor } from "./executor.interface";
import type { OutputParser } from "./parser.interface";
import type { ExecutorRegistration, LogLevel } from "./types";

// ── Worker Pool ────────────────────────────────────────────────────────────
//
// Registry of available executors and parsers.
// Resolves the best executor/parser for a given tool name.

export interface ResolvedExecution {
  executor: ToolExecutor;
  parsers: OutputParser[];
}

export class WorkerPool {
  private executors: ExecutorRegistration[] = [];
  private parsers: OutputParser[] = [];

  // ── Executor registration ─────────────────────────────────────────────────

  registerExecutor(executor: ToolExecutor, priority = 100): void {
    // Remove existing registration for same executor
    this.executors = this.executors.filter((e) => e.executor.name !== executor.name);
    this.executors.push({ executor, priority });
    // Sort by priority ascending (lower = tried first)
    this.executors.sort((a, b) => a.priority - b.priority);
  }

  unregisterExecutor(name: string): void {
    this.executors = this.executors.filter((e) => e.executor.name !== name);
  }

  /**
   * Find the best executor for a given tool.
   * Returns undefined if no executor claims this tool.
   */
  resolveExecutor(toolName: string): ToolExecutor | undefined {
    for (const reg of this.executors) {
      if (reg.executor.canExecute(toolName)) {
        return reg.executor;
      }
    }
    return undefined;
  }

  get registeredExecutors(): ReadonlyArray<ExecutorRegistration> {
    return this.executors;
  }

  // ── Parser registration ───────────────────────────────────────────────────

  registerParser(parser: OutputParser): void {
    this.parsers.push(parser);
  }

  unregisterParser(name: string): void {
    this.parsers = this.parsers.filter((p) => p.name !== name);
  }

  /**
   * Find all parsers that can handle output from the given tool.
   * Returns at least one (the generic fallback).
   */
  resolveParsers(toolName: string): OutputParser[] {
    const matched = this.parsers.filter((p) => p.canParse(toolName));
    // If no dedicated parser, use generic fallback (must be registered separately)
    return matched.length > 0 ? matched : this.parsers.filter((p) => p.name === "generic");
  }

  get registeredParsers(): ReadonlyArray<OutputParser> {
    return this.parsers;
  }

  // ── Combined resolution ───────────────────────────────────────────────────

  resolve(toolName: string): ResolvedExecution | undefined {
    const executor = this.resolveExecutor(toolName);
    if (!executor) return undefined;
    const parsers = this.resolveParsers(toolName);
    return { executor, parsers };
  }

  /** Check if a tool has a registered executor */
  canExecute(toolName: string): boolean {
    return this.resolveExecutor(toolName) !== undefined;
  }
}
