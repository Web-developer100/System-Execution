// ── Error Handler Middleware Unit Tests ⭐⭐⭐⭐⭐ ──────────────────────────────
//
// Tests the error handler middleware including:
//   - AppError class hierarchy (ValidationError, NotFoundError, AuthError, etc.)
//   - Error handler middleware behavior for each error type
//   - Stack trace inclusion in non-production mode
//   - JSON parse error handling
//   - Unknown error handling
//   - notFoundHandler
//   - asyncHandler wrapper

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from "../middlewares/error-handler";

// ── Helper to create mock request/response ─────────────────────────────────

function createMockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockReq(): Request {
  return {} as Request;
}

describe("AppError classes", () => {
  describe("AppError", () => {
    it("should create an AppError with status and message", () => {
      const err = new AppError(418, "I'm a teapot", "TEAPOT", { brew: "coffee" });
      expect(err.statusCode).toBe(418);
      expect(err.message).toBe("I'm a teapot");
      expect(err.code).toBe("TEAPOT");
      expect(err.details).toEqual({ brew: "coffee" });
      expect(err.name).toBe("AppError");
    });

    it("should create an AppError without optional fields", () => {
      const err = new AppError(500, "Server error");
      expect(err.statusCode).toBe(500);
      expect(err.message).toBe("Server error");
      expect(err.code).toBeUndefined();
      expect(err.details).toBeUndefined();
    });
  });

  describe("ValidationError", () => {
    it("should create a 400 error with fields", () => {
      const fields = [{ field: "email", message: "Invalid email" }];
      const err = new ValidationError("Validation failed", fields);
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details?.fields).toEqual(fields);
    });
  });

  describe("NotFoundError", () => {
    it("should create a 404 error with resource name", () => {
      const err = new NotFoundError("Scan", 42);
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe("Scan #42 not found");
      expect(err.code).toBe("NOT_FOUND");
    });

    it("should create a 404 error without ID", () => {
      const err = new NotFoundError("Resource");
      expect(err.message).toBe("Resource not found");
    });
  });

  describe("AuthError", () => {
    it("should create a 401 error with default message", () => {
      const err = new AuthError();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("Authentication required");
      expect(err.code).toBe("UNAUTHORIZED");
    });

    it("should create a 401 error with custom message", () => {
      const err = new AuthError("Token expired");
      expect(err.message).toBe("Token expired");
    });
  });

  describe("ForbiddenError", () => {
    it("should create a 403 error", () => {
      const err = new ForbiddenError("Admin access required");
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
    });
  });

  describe("ConflictError", () => {
    it("should create a 409 error", () => {
      const err = new ConflictError("Resource already exists");
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe("CONFLICT");
    });
  });

  describe("RateLimitError", () => {
    it("should create a 429 error with default message", () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
      expect(err.message).toBe("Too many requests");
      expect(err.code).toBe("RATE_LIMITED");
    });
  });
});

describe("Error Handler Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle AppError with status code and message", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new AppError(400, "Bad request", "BAD_REQUEST");
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Bad request",
        code: "BAD_REQUEST",
      }),
    );
  });

  it("should handle ValidationError with fields", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new ValidationError("Invalid input", [
      { field: "name", message: "Name is required" },
    ]);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        details: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ field: "name" }),
          ]),
        }),
      }),
    );
  });

  it("should handle AuthError with 401", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new AuthError("Invalid token");
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid token",
        code: "UNAUTHORIZED",
      }),
    );
  });

  it("should handle NotFoundError with 404", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new NotFoundError("User", 5);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "User #5 not found",
        code: "NOT_FOUND",
      }),
    );
  });

  it("should include stack trace in non-production mode", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new AppError(500, "Test error");
    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String),
      }),
    );

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should NOT include stack trace in production mode", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new AppError(500, "Test error");
    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({
        stack: expect.any(String),
      }),
    );

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should handle entity.parse.failed (malformed JSON)", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new Error("Unexpected token");
    (err as any).type = "entity.parse.failed";
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid JSON in request body",
        code: "INVALID_JSON",
      }),
    );
  });

  it("should handle unknown errors with 500", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const err = new Error("Something unexpected happened");
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      }),
    );

    process.env.NODE_ENV = originalNodeEnv;
  });
});

describe("notFoundHandler", () => {
  it("should return 404 with JSON response", () => {
    const req = createMockReq();
    const res = createMockRes();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "The requested resource was not found",
      code: "NOT_FOUND",
    });
  });
});

describe("asyncHandler", () => {
  it("should call the wrapped function with req, res, next", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(fn);

    wrapped(req, res, next);

    // Wait a tick for promise to resolve
    await new Promise(process.nextTick);

    expect(fn).toHaveBeenCalledWith(req, res, next);
  });

  it("should catch errors and forward to next", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    const error = new Error("Async error");
    const fn = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(fn);

    wrapped(req, res, next);

    // Wait a tick for promise to reject
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(error);
  });
});
