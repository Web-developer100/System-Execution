import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { signToken, requireAuth } from "../middlewares/auth";
import { createHash } from "node:crypto";

const router: IRouter = Router();

function hashPassword(pw: string): string {
  // SHA-256 hex digest for deterministic dev-mode authentication.
  // In production, replace with bcrypt and proper password policies.
  return createHash("sha256").update(pw).digest("hex");
}

function verifyPassword(pw: string, hash: string): boolean {
  return hashPassword(pw) === hash;
}

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.username, username));
    const user = users[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Sign a proper JWT token with HMAC-SHA256
    const token = signToken(user);

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tier: user.tier,
        createdAt: user.createdAt.toISOString(),
      },
      token,
    });
  } catch (err) {
    logger.error({ err }, "Login error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (_req, res) => {
  res.json({ message: "Logged out" });
});

// GET /api/auth/me — protected by JWT middleware
router.get("/auth/me", requireAuth, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      tier: usersTable.tier,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.userId));

  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    tier: user.tier,
    createdAt: user.createdAt.toISOString(),
  });
});

export function hashPasswordExport(pw: string): string {
  return hashPassword(pw);
}

export default router;
