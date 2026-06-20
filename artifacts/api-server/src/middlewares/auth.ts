// ---------------------------------------------------------------------------
// JWT Authentication Middleware
// ---------------------------------------------------------------------------
//
// Protects all /api/* routes except /api/auth/* and /api/health.
// Extracts user info from signed JWT and attaches it to req.user.
//
// Token format: Signed JWT with HMAC-SHA256
// Payload: { userId, username, role, tier, iat, exp }
// Expiry: 24 hours by default (configurable via JWT_EXPIRY env var)
//
// Usage:
//   import { requireAuth } from "../middlewares/auth";
//   router.get("/endpoint", requireAuth, handler);

import type { Request, Response, NextFunction } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── JWT Configuration ──────────────────────────────────────────────────────

const JWT_SECRET = process.env["JWT_SECRET"] ?? "v8-platform-dev-secret-change-in-production";
const JWT_EXPIRY = process.env["JWT_EXPIRY"] ?? "24h";

// ── Type augmentation for Express Request ──────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        username: string;
        role: string;
        tier: string;
      };
    }
  }
}

// ── JWT Helper Functions ───────────────────────────────────────────────────

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  tier: string;
  iat: number;
  exp: number;
}

/**
 * Sign a JWT token for the given user.
 * Returns the signed token string.
 */
export function signToken(user: {
  id: number;
  username: string;
  role: string;
  tier: string;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      tier: user.tier,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY } as SignOptions,
  );
}

/**
 * Verify and decode a JWT token.
 * Returns the decoded payload or throws.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * Express middleware that requires a valid JWT token.
 *
 * Extracts the token from the Authorization header (Bearer scheme),
 * verifies it, looks up the user in the database, and attaches
 * the user info to `req.user`.
 *
 * Returns 401 if the token is missing, invalid, or expired.
 * Returns 401 if the referenced user no longer exists.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);

    // Verify the user still exists in the database
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        tier: usersTable.tier,
      })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId));

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User account no longer exists",
      });
      return;
    }

    // Attach user to request for downstream handlers
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      tier: user.tier,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Token has expired. Please log in again.",
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token signature or malformed token.",
      });
      return;
    }

    logger.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Optional auth middleware — attaches user to req.user if a valid token
 * is present, but does not reject the request if no token is provided.
 * Useful for endpoints that have different behavior for authenticated users.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId));

    if (user) {
      req.user = {
        userId: user.id,
        username: user.username,
        role: decoded.role,
        tier: decoded.tier,
      };
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
}
