// ---------------------------------------------------------------------------
// Distributed Tracing Service ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Implements distributed tracing across all services with:
//   - Span and trace lifecycle management
//   - Context propagation via correlation/trace/span IDs
//   - Parent-child span relationships
//   - Service-to-service trace correlation
//   - In-memory trace buffer for querying recent traces
//   - Support for API, DB, Queue, Plugin, AI, Worker, Notification, Report traces

import crypto from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export type TraceSpanType =
  | "api:request" | "api:middleware"
  | "db:query" | "db:transaction"
  | "queue:publish" | "queue:consume" | "queue:retry"
  | "plugin:execute" | "plugin:install" | "plugin:update"
  | "ai:analyze" | "ai:classify" | "ai:generate"
  | "worker:execute" | "worker:heartbeat"
  | "verification:run" | "verification:verify"
  | "notification:send" | "notification:deliver"
  | "report:generate" | "report:export"
  | "scan:pipeline" | "scan:stage"
  | "integration:call" | "integration:sync"
  | "auth:login" | "auth:token"
  | "system:operation" | "system:cron";

export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  type: TraceSpanType;
  serviceName: string;
  operation: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: "ok" | "error" | "pending";
  error: string | null;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
}

export interface Trace {
  traceId: string;
  rootSpanId: string;
  spans: TraceSpan[];
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: "ok" | "error" | "pending";
  rootService: string;
  rootOperation: string;
  spanCount: number;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  serviceName: string;
}

// ── Tracing Service ────────────────────────────────────────────────────────

export class TracingService {
  private traces = new Map<string, Trace>();
  private activeSpans = new Map<string, TraceSpan>();
  private maxTraces = 5_000;
  private maxSpanDepth = 100;

  // ── Context Management ─────────────────────────────────────────────────

  createTrace(serviceName: string, operation: string): TraceContext {
    const traceId = crypto.randomUUID();
    const spanId = crypto.randomUUID();

    const rootSpan: TraceSpan = {
      spanId,
      traceId,
      parentSpanId: null,
      type: "system:operation",
      serviceName,
      operation,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      status: "pending",
      error: null,
      tags: {},
      metadata: {},
    };

    this.activeSpans.set(spanId, rootSpan);

    this.traces.set(traceId, {
      traceId,
      rootSpanId: spanId,
      spans: [rootSpan],
      startedAt: rootSpan.startedAt,
      endedAt: null,
      durationMs: null,
      status: "pending",
      rootService: serviceName,
      rootOperation: operation,
      spanCount: 1,
    });

    this.enforceLimit();

    return { traceId, spanId, parentSpanId: null, serviceName };
  }

  createSpan(
    context: TraceContext,
    type: TraceSpanType,
    operation: string,
    tags?: Record<string, string>,
    metadata?: Record<string, unknown>,
  ): TraceContext {
    const spanId = crypto.randomUUID();
    const newSpan: TraceSpan = {
      spanId,
      traceId: context.traceId,
      parentSpanId: context.spanId,
      type,
      serviceName: context.serviceName,
      operation,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      status: "pending",
      error: null,
      tags: tags ?? {},
      metadata: metadata ?? {},
    };

    this.activeSpans.set(spanId, newSpan);

    const trace = this.traces.get(context.traceId);
    if (trace && trace.spans.length < this.maxSpanDepth) {
      trace.spans.push(newSpan);
      trace.spanCount = trace.spans.length;
    }

    return { traceId: context.traceId, spanId, parentSpanId: context.spanId, serviceName: context.serviceName };
  }

  // ── Span Lifecycle ──────────────────────────────────────────────────────

  endSpan(context: TraceContext, status: "ok" | "error" = "ok", error?: string): void {
    const span = this.activeSpans.get(context.spanId);
    if (!span) return;

    const now = new Date();
    span.endedAt = now.toISOString();
    span.durationMs = now.getTime() - new Date(span.startedAt).getTime();
    span.status = status;
    if (error) span.error = error;
    this.activeSpans.delete(context.spanId);

    // Update trace status
    const trace = this.traces.get(context.traceId);
    if (trace) {
      if (status === "error") trace.status = "error";
      const allDone = trace.spans.every(s => s.status !== "pending");
      if (allDone) {
        trace.endedAt = now.toISOString();
        trace.durationMs = now.getTime() - new Date(trace.startedAt).getTime();
        if (trace.status === "pending") trace.status = "ok";
      }
    }
  }

  endTrace(context: TraceContext, status: "ok" | "error" = "ok", error?: string): void {
    // End all pending spans in this trace
    const trace = this.traces.get(context.traceId);
    if (trace) {
      for (const span of trace.spans) {
        if (span.status === "pending") {
          span.endedAt = new Date().toISOString();
          span.durationMs = Math.abs(new Date(span.startedAt).getTime() - new Date(span.endedAt).getTime());
          span.status = status;
          if (error && !span.error) span.error = error;
        }
        this.activeSpans.delete(span.spanId);
      }
      trace.endedAt = new Date().toISOString();
      trace.durationMs = Math.abs(new Date(trace.startedAt).getTime() - new Date(trace.endedAt).getTime());
      trace.status = status;
    }
  }

  // ── Add Tags/Error ──────────────────────────────────────────────────────

  addSpanTags(context: TraceContext, tags: Record<string, string>): void {
    const span = this.activeSpans.get(context.spanId);
    if (span) Object.assign(span.tags, tags);
  }

  setSpanError(context: TraceContext, error: string): void {
    const span = this.activeSpans.get(context.spanId);
    if (span) {
      span.status = "error";
      span.error = error;
    }
  }

  addSpanMetadata(context: TraceContext, metadata: Record<string, unknown>): void {
    const span = this.activeSpans.get(context.spanId);
    if (span) Object.assign(span.metadata, metadata);
  }

  // ── Query ───────────────────────────────────────────────────────────────

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  getTraces(options?: {
    serviceName?: string;
    status?: "ok" | "error" | "pending";
    operation?: string;
    limit?: number;
    offset?: number;
    since?: string;
  }): Trace[] {
    let results = Array.from(this.traces.values());

    if (options?.serviceName) {
      results = results.filter(t => t.rootService === options.serviceName);
    }
    if (options?.status) {
      results = results.filter(t => t.status === options.status);
    }
    if (options?.operation) {
      results = results.filter(t => t.rootOperation.includes(options.operation!));
    }
    if (options?.since) {
      const since = new Date(options.since).getTime();
      results = results.filter(t => new Date(t.startedAt).getTime() >= since);
    }

    results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  getSpan(spanId: string): TraceSpan | undefined {
    return this.activeSpans.get(spanId);
  }

  findSpans(traceId: string, type: TraceSpanType): TraceSpan[] {
    const trace = this.traces.get(traceId);
    return trace?.spans.filter(s => s.type === type) ?? [];
  }

  getSpanTree(traceId: string): TraceSpan[] {
    const trace = this.traces.get(traceId);
    if (!trace) return [];
    return this.buildTree(trace.spans, trace.rootSpanId);
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  getStats() {
    const allTraces = Array.from(this.traces.values());
    return {
      totalTraces: allTraces.length,
      activeSpans: this.activeSpans.size,
      okTraces: allTraces.filter(t => t.status === "ok").length,
      errorTraces: allTraces.filter(t => t.status === "error").length,
      pendingTraces: allTraces.filter(t => t.status === "pending").length,
      avgDurationMs: allTraces.length > 0
        ? Math.round(allTraces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0) / allTraces.length)
        : 0,
      services: [...new Set(allTraces.map(t => t.rootService))],
    };
  }

  clearTraces(): void {
    this.traces.clear();
    this.activeSpans.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private buildTree(spans: TraceSpan[], rootSpanId: string): TraceSpan[] {
    const root = spans.find(s => s.spanId === rootSpanId);
    if (!root) return [];
    const children = spans.filter(s => s.parentSpanId === rootSpanId);
    return [root, ...children.flatMap(c => this.buildTree(spans, c.spanId))];
  }

  private enforceLimit(): void {
    if (this.traces.size > this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      if (oldestKey) {
        const oldTrace = this.traces.get(oldestKey);
        if (oldTrace) {
          for (const span of oldTrace.spans) this.activeSpans.delete(span.spanId);
        }
        this.traces.delete(oldestKey);
      }
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const tracingService = new TracingService();

// ── Tracing Middleware Helper ──────────────────────────────────────────────
export function createTraceContext(serviceName: string, operation: string): TraceContext {
  return tracingService.createTrace(serviceName, operation);
}
