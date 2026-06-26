// ── Docs Route Unit Tests ⭐⭐⭐⭐⭐ ──────────────────────────────────────────
//
// Tests the API documentation routes including:
//   - Swagger UI HTML serving
//   - OpenAPI JSON spec serving
//   - OpenAPI YAML text serving
//   - Spec structure validation

import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import docsRouter from "../routes/docs";

// ── Helper to create mock request/response ─────────────────────────────────

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/docs",
    headers: {},
    ...overrides,
  } as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

// ── Helper to get route handler ────────────────────────────────────────────

function getRouteHandler(path: string): ((...args: any[]) => void) | null {
  const layer = (docsRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.get,
  );
  if (!layer?.route?.stack?.[0]?.handle) return null;
  return layer.route.stack[0].handle;
}

describe("Docs Routes", () => {
  describe("GET /docs", () => {
    it("should serve Swagger UI HTML", () => {
      const handler = getRouteHandler("/docs");
      expect(handler).toBeDefined();

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      handler!(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("SwaggerUI"));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("V8 Platform API Documentation"));
    });
  });

  describe("GET /docs/openapi.json", () => {
    it("should serve OpenAPI spec as JSON", () => {
      const handler = getRouteHandler("/docs/openapi.json");
      expect(handler).toBeDefined();

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      handler!(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          openapi: expect.any(String),
          info: expect.objectContaining({
            title: expect.stringContaining("V8"),
          }),
        }),
      );
    });

    it("should include security scheme definitions", () => {
      const handler = getRouteHandler("/docs/openapi.json");
      expect(handler).toBeDefined();

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      handler!(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.objectContaining({
            securitySchemes: expect.objectContaining({
              bearerAuth: expect.objectContaining({
                type: "http",
                scheme: "bearer",
              }),
            }),
          }),
        }),
      );
    });
  });

  describe("GET /docs/openapi.yaml", () => {
    it("should serve YAML as text", () => {
      const handler = getRouteHandler("/docs/openapi.yaml");
      expect(handler).toBeDefined();

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      handler!(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/yaml; charset=utf-8");
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("V8 Neural Exploitation Platform API"));
    });
  });
});
