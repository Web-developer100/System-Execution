// ── CSRF Middleware Unit Tests ⭐⭐⭐⭐⭐ ───────────────────────────────────────
//
// Tests the CSRF protection middleware including:
//   - Safe methods (GET, HEAD, OPTIONS) bypass CSRF
//   - Origin validation for state-changing methods
//   - Double-submit cookie pattern validation
//   - Skip paths for public endpoints
//   - Token generation and cookie setting

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { csrfProtection, csrfTokenMiddleware } from "../middlewares/csrf";

// ── Helper to create mock request/response ─────────────────────────────────

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/api/test",
    headers: {},
    cookies: {},
    ...overrides,
  } as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  return res;
}

// Use vi.fn() cast as NextFunction for middleware tests
type MockNext = ReturnType<typeof vi.fn>;

describe("csrfProtection", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = mockNext();
  });

  describe("safe methods", () => {
    const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

    for (const method of SAFE_METHODS) {
      it(`should skip CSRF for ${method} requests`, () => {
        const req = createMockReq({ method } as any);
        const res = createMockRes();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    }
  });

  describe("origin validation", () => {
    it("should accept requests with valid origin", () => {
      const req = createMockReq({
        method: "POST",
        path: "/api/scans",
        headers: { origin: "http://localhost:5173" },
      } as any);
      const res = createMockRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should accept requests with no origin (same-origin)", () => {
      const req = createMockReq({
        method: "POST",
        path: "/api/scans",
        headers: {},
      } as any);
      const res = createMockRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should reject requests with invalid origin", () => {
      const req = createMockReq({
        method: "POST",
        path: "/api/scans",
        headers: { origin: "https://evil.com" },
      } as any);
      const res = createMockRes();

      csrfProtection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "CSRF_INVALID_ORIGIN" }),
      );
    });
  });

  describe("skip paths", () => {
    const SKIP_PATHS = ["/auth/login", "/auth/register", "/health", "/docs"];

    for (const skipPath of SKIP_PATHS) {
      it(`should skip CSRF for ${skipPath}`, () => {
        const req = createMockReq({
          method: "POST",
          path: skipPath,
          headers: {},
        } as any);
        const res = createMockRes();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    }
  });

  describe("double-submit cookie", () => {
    it("should pass when CSRF token matches cookie", () => {
      const req = createMockReq({
        method: "POST",
        path: "/api/scans",
        headers: {
          "x-csrf-token": "abc123",
          origin: "http://localhost:5173",
        },
        cookies: { v8_csrf_token: "abc123" },
      } as any);
      const res = createMockRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should reject when CSRF token does not match cookie", () => {
      const req = createMockReq({
        method: "POST",
        path: "/api/scans",
        headers: {
          "x-csrf-token": "wrong-token",
          origin: "http://localhost:5173",
        },
        cookies: { v8_csrf_token: "abc123" },
      } as any);
      const res = createMockRes();

      csrfProtection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "CSRF_TOKEN_MISMATCH" }),
      );
    });
  });
});

  describe("csrfTokenMiddleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it("should set a CSRF cookie if not present", () => {
    const req = createMockReq({ cookies: {} } as any);
    const res = createMockRes();

    csrfTokenMiddleware(req, res, next);

    expect(res.cookie).toHaveBeenCalledWith(
      "v8_csrf_token",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
      }),
    );
    expect(next).toHaveBeenCalled();
  });

  it("should not set a CSRF cookie if already present", () => {
    const req = createMockReq({
      cookies: { v8_csrf_token: "existing-token" },
    } as any);
    const res = createMockRes();

    csrfTokenMiddleware(req, res, next);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});