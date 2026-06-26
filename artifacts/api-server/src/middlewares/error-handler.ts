// ---------------------------------------------------------------------------
// Global Error Handler Middleware ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Centralized error handling that provides structured error responses
// suitable for production use. Supports validation errors, auth errors,
// not-found errors, and generic internal errors with safe message handling.

import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// ── Custom Error Classes ───────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields?: Array<{ field: string; message: string }>) {
    super(400, message, "VALIDATION_ERROR", { fields });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    super(404, `${resource}${id ? ` #${id}` : ""} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message, "UNAUTHORIZED");
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(403, message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(429, message, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

// ── Error Handler Middleware ───────────────────────────────────────────────

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // AppError — known application errors with safe messages
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
      ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    });
    return;
  }

  // Express JSON parse errors (malformed request body)
  if ("type" in err && (err as any).type === "entity.parse.failed") {
    res.status(400).json({
      error: "Invalid JSON in request body",
      code: "INVALID_JSON",
    });
    return;
  }

  // Unknown errors — log full details but only expose safe message
  logger.error({ err, stack: err.stack }, "Unhandled error");

  const message = process.env.NODE_ENV === "production"
    ? "Internal server error"
    : err.message || "Internal server error";

  res.status(500).json({
    error: message,
    code: "INTERNAL_ERROR",
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });
}

// ── Async Route Wrapper ────────────────────────────────────────────────────

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncHandler): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ── Not Found Handler ──────────────────────────────────────────────────────

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: "The requested resource was not found",
    code: "NOT_FOUND",
  });
}
