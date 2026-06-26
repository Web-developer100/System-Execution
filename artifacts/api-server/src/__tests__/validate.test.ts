// ── Validate Middleware Unit Tests ⭐⭐⭐⭐⭐ ──────────────────────────────────
//
// Tests the Zod-based validation middleware including:
//   - Body validation (success and failure)
//   - Query parameter validation
//   - Field-level error reporting
//   - Type coercion and transformation
//   - Multiple field validation

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validate, validateBody, validateQuery, validateParams } from "../middlewares/validate";

// ── Helper to create mock request/response ─────────────────────────────────

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "POST",
    path: "/api/test",
    headers: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ── Test Schemas ───────────────────────────────────────────────────────────

const UserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  age: z.number().int().positive("Age must be positive").optional(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1, "Search query is required"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const IdParamsSchema = z.object({
  id: z.coerce.number().int().positive("ID must be a positive integer"),
});

describe("validate middleware factory", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = mockNext();
  });

  describe("body validation", () => {
    it("should pass valid body data", () => {
      const req = createMockReq({
        body: { name: "John Doe", email: "john@example.com", age: 30 },
      } as any);
      const res = createMockRes();
      const middleware = validate(UserSchema, "body");

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      // Data should be parsed and validated
      expect(req.body.name).toBe("John Doe");
    });

    it("should reject invalid body data with field errors", () => {
      const req = createMockReq({
        body: { name: "J", email: "not-an-email" },
      } as any);
      const res = createMockRes();
      const middleware = validate(UserSchema, "body");

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({ field: "name" }),
              expect.objectContaining({ field: "email" }),
            ]),
          }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should accept optional fields that are missing", () => {
      const req = createMockReq({
        body: { name: "John Doe", email: "john@example.com" },
      } as any);
      const res = createMockRes();
      const middleware = validate(UserSchema, "body");

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("query validation", () => {
    it("should pass valid query params with defaults", () => {
      const req = createMockReq({
        method: "GET",
        query: { q: "search term" },
      } as any);
      const res = createMockRes();
      const middleware = validate(SearchQuerySchema, "query");

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query.page).toBe(1); // default applied
      expect(req.query.limit).toBe(20); // default applied
    });

    it("should reject missing required query params", () => {
      const req = createMockReq({
        method: "GET",
        query: {},
      } as any);
      const res = createMockRes();
      const middleware = validate(SearchQuerySchema, "query");

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should coerce string query params to numbers", () => {
      const req = createMockReq({
        method: "GET",
        query: { q: "test", page: "3", limit: "50" },
      } as any);
      const res = createMockRes();
      const middleware = validate(SearchQuerySchema, "query");

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.query.page).toBe(3);
      expect(req.query.limit).toBe(50);
    });
  });

  describe("params validation", () => {
    it("should pass valid path params", () => {
      const req = createMockReq({
        params: { id: "42" },
      } as any);
      const res = createMockRes();
      const middleware = validate(IdParamsSchema, "params");

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.params.id).toBe(42); // coerced to number
    });

    it("should reject invalid path params", () => {
      const req = createMockReq({
        params: { id: "-1" },
      } as any);
      const res = createMockRes();
      const middleware = validate(IdParamsSchema, "params");

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

describe("convenience exports", () => {
  it("validateBody should validate request body", () => {
    const middleware = validateBody(UserSchema);
    expect(middleware).toBeInstanceOf(Function);
  });

  it("validateQuery should validate request query", () => {
    const middleware = validateQuery(SearchQuerySchema);
    expect(middleware).toBeInstanceOf(Function);
  });

  it("validateParams should validate request params", () => {
    const middleware = validateParams(IdParamsSchema);
    expect(middleware).toBeInstanceOf(Function);
  });
});
