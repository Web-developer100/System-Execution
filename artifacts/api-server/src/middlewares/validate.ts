// ---------------------------------------------------------------------------
// Input Validation Middleware ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Middleware for validating request bodies, query params, and path params
// using Zod schemas. Returns structured error messages on validation failure.

import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";

// ── Validation Source ──────────────────────────────────────────────────────

export type ValidationSource = "body" | "query" | "params" | "headers";

// ── Validation Error Formatter ─────────────────────────────────────────────

function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((issue: { path: (string | number)[]; message: string }) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// ── Validation Middleware Factory ──────────────────────────────────────────

export function validate(schema: ZodSchema, source: ValidationSource = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const data = req[source];

    const result = schema.safeParse(data);

    if (!result.success) {
      const fields = formatZodError(result.error);
      res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: { fields },
      });
      return;
    }

    // Replace the source data with parsed (and transformed) data
    req[source] = result.data;
    next();
  };
}

// ── Convenience exports ────────────────────────────────────────────────────

export const validateBody = (schema: ZodSchema) => validate(schema, "body");
export const validateQuery = (schema: ZodSchema) => validate(schema, "query");
export const validateParams = (schema: ZodSchema) => validate(schema, "params");
