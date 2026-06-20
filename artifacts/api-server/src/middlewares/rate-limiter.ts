// ---------------------------------------------------------------------------
// Rate Limiting Middleware
// ---------------------------------------------------------------------------
//
// Protects the API against brute-force attacks and DoS.
// Uses express-rate-limit with different limits per route category.
//
// Tiers:
//   auth:       5 req/15min  — login brute force protection
//   default:   60 req/1min   — general API
//   scans:     10 req/1min   — scan creation is expensive
//   tools:     10 req/1min   — tool install is expensive
//   reports:    6 req/1min   — report generation is expensive

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

const standardResponse = (_req: Request, res: Response) => {
  res.status(429).json({
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please reduce request volume and retry after the window expires.",
    retryAfter: res.getHeader("Retry-After") ?? 60,
  });
};

// ── Auth endpoint: very strict (brute force protection) ────────────────────

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // dev: generous limit for development
  standardHeaders: true,
  legacyHeaders: false,
  message: undefined, // use handler below
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: "Too Many Requests",
      message: "Too many login attempts. Please wait 15 minutes before trying again.",
      retryAfter: Math.ceil(res.getHeader("Retry-After") as number ?? 900),
    });
  },
});

// ── Expensive operations (scans, tools, reports) ──────────────────────────

export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardResponse,
});

// ── General API (standard rate limit) ──────────────────────────────────────

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardResponse,
});

// ── WebSocket upgrade path: no rate limit (handled separately) ────────────

export const wsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // max 10 WS connections per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "Too Many WebSocket Connections" });
  },
});
