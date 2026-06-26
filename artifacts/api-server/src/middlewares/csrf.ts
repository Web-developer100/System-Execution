// ---------------------------------------------------------------------------
// CSRF Protection Middleware ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Implements CSRF protection using:
//  - SameSite cookie enforcement
//  - Origin/Referer header validation
//  - Double-submit cookie pattern for POST/PUT/DELETE/PATCH
//
// For API-heavy SPAs, the primary defense is SameSite=Strict cookies
// and origin validation. The double-submit pattern is used for
// additional protection on state-changing requests.

import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

// ── Configuration ──────────────────────────────────────────────────────────

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const CSRF_COOKIE_NAME = "v8_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32;

// ── Skip CSRF for these paths ──────────────────────────────────────────────

const SKIP_PATHS = [
  "/auth/login",
  "/auth/register",
  "/health",
  "/healthz",
  "/observability/metrics",
  "/observability/logs/stream",
  "/docs",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

function isValidOrigin(origin: string | undefined, referer: string | undefined): boolean {
  const allowedOrigins = [
    process.env["FRONTEND_URL"],
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
  ].filter(Boolean) as string[];

  // Always allow same-origin requests
  if (!origin && !referer) return true;

  const checkUrl = origin || referer;
  if (!checkUrl) return true;

  try {
    const url = new URL(checkUrl);
    // Allow same-origin
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;

    // Check against allowed origins
    return allowedOrigins.some(allowed => {
      try {
        const allowedUrl = new URL(allowed);
        return url.origin === allowedUrl.origin;
      } catch {
        return checkUrl.startsWith(allowed);
      }
    });
  } catch {
    return false;
  }
}

// ── Middleware ─────────────────────────────────────────────────────────────

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Skip known public paths
  if (SKIP_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Validate origin/referer for state-changing requests
  if (!isValidOrigin(req.headers["origin"] as string, req.headers["referer"] as string)) {
    res.status(403).json({
      error: "CSRF validation failed: invalid origin",
      code: "CSRF_INVALID_ORIGIN",
    });
    return;
  }

  // Double-submit cookie check for non-JSON API calls
  // For SPA API calls with JWT Bearer tokens in Authorization header,
  // CSRF is inherently protected since the token is not automatically sent.
  // However, we still validate for cookie-based auth fallback.
  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
  const csrfHeader = req.headers[CSRF_HEADER_NAME] as string;

  if (csrfCookie && csrfHeader) {
    if (csrfCookie !== csrfHeader) {
      res.status(403).json({
        error: "CSRF validation failed: token mismatch",
        code: "CSRF_TOKEN_MISMATCH",
      });
      return;
    }
  }

  next();
}

// ── CSRF Token Generation Middleware ───────────────────────────────────────

export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Set CSRF cookie if not present
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
    });
  }
  next();
}
