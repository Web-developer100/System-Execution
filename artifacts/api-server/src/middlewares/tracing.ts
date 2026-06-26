// ---------------------------------------------------------------------------
// Tracing Middleware ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Express middleware that automatically creates distributed traces for every
// API request, including child spans for database queries, queue operations,
// plugin execution, AI analysis, and external integrations.
//
// Attaches trace context to req so downstream handlers can create child spans.

import type { Request, Response, NextFunction } from "express";
import { tracingService, type TraceContext, type TraceSpanType } from "../services/observability/tracing";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      traceCtx?: TraceContext;
      childSpan?: (type: TraceSpanType, operation: string, tags?: Record<string, string>, metadata?: Record<string, unknown>) => TraceContext;
      endSpan?: (status?: "ok" | "error", error?: string) => void;
    }
  }
}

// ── Span Type Mapping ─────────────────────────────────────────────────────

function routeToSpanType(method: string, path: string): TraceSpanType {
  if (path.startsWith("/api/auth")) return "auth:login";
  if (path.startsWith("/api/scans")) return "scan:pipeline";
  if (path.startsWith("/api/plugins")) return "plugin:execute";
  if (path.startsWith("/api/ai") || path.includes("ai-")) return "ai:analyze";
  if (path.startsWith("/api/reports")) return "report:generate";
  if (path.startsWith("/api/workers") || path.startsWith("/api/worker")) return "worker:execute";
  if (path.startsWith("/api/notifications")) return "notification:send";
  if (path.startsWith("/api/integrations")) return "integration:call";
  if (path.startsWith("/api/verification")) return "verification:run";
  if (path.startsWith("/api/db") || path.startsWith("/api/database")) return "db:query";
  if (path.startsWith("/api/queue")) return "queue:publish";
  if (path.startsWith("/api/metrics") || path.startsWith("/api/observability")) return "system:operation";
  return "api:request";
}

function pathToOperation(method: string, path: string): string {
  // Remove dynamic segments (UUIDs, numbers) for cleaner operation names
  const cleaned = path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
  return `${method} ${cleaned}`;
}

// ── Middleware ─────────────────────────────────────────────────────────────

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip observability/internal endpoints to reduce noise
  if (req.path === "/api/observability/metrics" ||
      req.path === "/api/health" ||
      req.path.startsWith("/api/observability/health")) {
    return next();
  }

  const operation = pathToOperation(req.method, req.path);
  const spanType = routeToSpanType(req.method, req.path);

  // Create the trace
  const ctx = tracingService.createTrace("api-server", operation);

  // Set span type
  const rootSpan = tracingService.getTrace(ctx.traceId);
  if (rootSpan && rootSpan.spans.length > 0) {
    rootSpan.spans[0]!.type = spanType;
    rootSpan.spans[0]!.tags = {
      method: req.method,
      path: req.path,
      userAgent: (req.headers["user-agent"] ?? "unknown") as string,
    };
    rootSpan.spans[0]!.metadata = {
      query: req.query as Record<string, unknown>,
      contentType: req.headers["content-type"],
    };
  }

  // Attach helpers to request
  req.traceCtx = ctx;
  req.childSpan = (type: TraceSpanType, operation: string, tags?: Record<string, string>, metadata?: Record<string, unknown>) => {
    return tracingService.createSpan(ctx, type, operation, tags, metadata);
  };
  req.endSpan = (status?: "ok" | "error", error?: string) => {
    tracingService.endSpan(ctx, status ?? "ok", error);
  };

  // End the trace when response finishes
  res.on("finish", () => {
    const status = res.statusCode >= 400 ? "error" : "ok";
    const error = res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined;

    // Add response tags
    tracingService.addSpanTags(ctx, {
      statusCode: String(res.statusCode),
      contentLength: String(res.getHeader("content-length") ?? ""),
    });

    tracingService.endSpan(ctx, status, error);

    // If trace is complete (single-span request), end the trace too
    const trace = tracingService.getTrace(ctx.traceId);
    if (trace && trace.spans.length <= 1) {
      tracingService.endTrace(ctx, status, error);
    }
  });

  next();
}

// ── Helper: Create a child span for DB queries ────────────────────────────

export function createDbSpan(req: Request, query: string): TraceContext | null {
  if (!req.childSpan) return null;
  const ctx = req.childSpan("db:query", query.slice(0, 100), {
    query: query.slice(0, 200),
  });
  return ctx;
}

// ── Helper: Create a child span for queue operations ──────────────────────

export function createQueueSpan(req: Request, operation: string, queueName: string): TraceContext | null {
  if (!req.childSpan) return null;
  return req.childSpan("queue:publish", operation, { queue: queueName });
}

// ── Helper: Create a child span for AI analysis ───────────────────────────

export function createAiSpan(req: Request, operation: string, model?: string): TraceContext | null {
  if (!req.childSpan) return null;
  return req.childSpan("ai:analyze", operation, model ? { model } : undefined);
}
