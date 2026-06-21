import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

// GET /api/users
router.get("/users", async (_req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      tier: usersTable.tier,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(usersTable.id);
    return res.json(users.map(u => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      email: `${u.username}@v8platform.io`,
      status: "active",
      mfa: u.role === "super_admin",
    })));
  } catch (err) {
    logger.error({ err }, "Get users error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users — create user
router.post("/users", async (req, res) => {
  const { username, password, role, tier } = req.body as {
    username: string; password: string; role?: string; tier?: string;
  };
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  try {
    const [user] = await db.insert(usersTable).values({
      username: username.trim(),
      passwordHash: hashPassword(password),
      role: role ?? "operator",
      tier: tier ?? "Node_01",
    }).returning({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      tier: usersTable.tier,
      createdAt: usersTable.createdAt,
    });
    return res.status(201).json({ ...user, createdAt: user.createdAt.toISOString() });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Username already exists" });
    }
    logger.error({ err }, "Create user error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:id
router.delete("/users/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  if (id === 1) return res.status(403).json({ error: "Cannot delete the primary admin user" });
  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Delete user error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:id — update role/tier
router.patch("/users/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const { role, tier, password } = req.body as { role?: string; tier?: string; password?: string };
  try {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (role) updates.role = role;
    if (tier) updates.tier = tier;
    if (password) updates.passwordHash = hashPassword(password);
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      tier: usersTable.tier,
      createdAt: usersTable.createdAt,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ ...user, createdAt: user.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "Update user error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
