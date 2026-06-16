import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_PASSWORD = "admin123";

function hashPassword(pw: string): string {
  // Simple deterministic hash for demo — not production-grade
  return Buffer.from(pw + "_v8salt").toString("base64");
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

    // Simple token: base64 of userId:username:timestamp
    const token = Buffer.from(`${user.id}:${user.username}:${Date.now()}`).toString("base64");

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

// GET /api/auth/me
router.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    const userId = parseInt(parts[0]);
    if (isNaN(userId)) return res.status(401).json({ error: "Invalid token" });

    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const user = users[0];
    if (!user) return res.status(401).json({ error: "User not found" });

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      tier: user.tier,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get me error");
    return res.status(401).json({ error: "Invalid token" });
  }
});

export function hashPasswordExport(pw: string): string {
  return hashPassword(pw);
}

export default router;
