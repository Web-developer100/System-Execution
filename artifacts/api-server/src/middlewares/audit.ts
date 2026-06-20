// ---------------------------------------------------------------------------
// Audit Log Middleware
// ---------------------------------------------------------------------------
//
// Records every authenticated API request to the audit_logs table.
// Provides an immutable audit trail required for SOC2 / ISO 27001 compliance.
//
// Rows are INSERT-only — never updated or deleted after creation.
// Sensitive request bodies (passwords, tokens) are NOT logged.

import type { Request, Response, NextFunction } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";

// ── Sensitive paths whose bodies should NOT be logged ──────────────────────

const SENSITIVE_PATHS = new Set(["/auth/login", "/auth/logout"]);

// ── Action Mapping ─────────────────────────────────────────────────────────

function inferAction(method: string, path: string): string {
  // Strip leading /api and trailing IDs
  const normalized = path.replace(/^\/api/, "").replace(/\/\d+/g, "/:id");

  const methodAction: Record<string, string> = {
    GET: "READ",
    POST: "CREATE",
    PUT: "UPDATE",
    PATCH: "UPDATE",
    DELETE: "DELETE",
  };

  const action = methodAction[method] ?? method;

  // Build a readable action string
  const parts = normalized.split("/").filter(Boolean);
  const resource = parts.map((p) => p.toUpperCase()).join("_");

  return resource ? `${action}_${resource}` : action;
}

// ── Middleware ─────────────────────────────────────────────────────────────

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Store original end to intercept the response
  const originalEnd = res.end.bind(res);

  // Override end to capture the response status and log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = function (this: Response, ...args: any[]) {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Only log authenticated requests or significant events
    const shouldLog = req.user || statusCode >= 400;

    if (shouldLog) {
      const action = inferAction(req.method, req.path);
      const metadata: Record<string, unknown> = {};

      // Extract useful metadata from request (no sensitive data)
      if (req.body && typeof req.body === "object" && !SENSITIVE_PATHS.has(req.path)) {
        const body = req.body as Record<string, unknown>;
        if (body.target) metadata.target = body.target;
        if (body.tools) metadata.tools = body.tools;
        if (body.name) metadata.toolName = body.name;
        if (body.ip) metadata.ip = body.ip;
        if (body.scanId) metadata.scanId = body.scanId;
        if (body.protocol) metadata.protocol = body.protocol;
      }

      // Fire-and-forget DB insert
      db.insert(auditLogsTable)
        .values({
          userId: req.user?.userId ?? null,
          username: req.user?.username ?? "anonymous",
          method: req.method,
          path: req.path,
          statusCode,
          action,
          ip: req.ip ?? req.socket.remoteAddress ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          durationMs,
          metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        })
        .catch((err: Error) => {
          logger.error({ err }, "Audit log insert failed");
        });
    }

    return originalEnd(...args);
  };

  next();
}
