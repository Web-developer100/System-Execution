import { Router, type IRouter } from "express";
import { db, toolsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatTool(tool: typeof toolsTable.$inferSelect) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description ?? null,
    githubUrl: tool.githubUrl ?? null,
    status: tool.status,
    version: tool.version ?? null,
    lastChecked: tool.lastChecked?.toISOString() ?? null,
    healthScore: tool.healthScore ?? null,
  };
}

// GET /api/tools
router.get("/tools", async (_req, res) => {
  try {
    const tools = await db.select().from(toolsTable).orderBy(desc(toolsTable.createdAt));
    return res.json(tools.map(formatTool));
  } catch (err) {
    logger.error({ err }, "Get tools error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tools
router.post("/tools", async (req, res) => {
  const { name, githubUrl, description } = req.body as { name: string; githubUrl: string; description?: string };
  if (!name || !githubUrl) {
    return res.status(400).json({ error: "Name and githubUrl required" });
  }
  try {
    const [tool] = await db.insert(toolsTable).values({
      name,
      githubUrl,
      description: description ?? null,
      status: "active",
      version: "latest",
      lastChecked: new Date(),
      healthScore: 100,
    }).returning();
    return res.status(201).json(formatTool(tool));
  } catch (err) {
    logger.error({ err }, "Install tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tools/:id
router.delete("/tools/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(toolsTable).where(eq(toolsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tools/:id/update
router.post("/tools/:id/update", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [tool] = await db.update(toolsTable)
      .set({ status: "active", lastChecked: new Date(), healthScore: 100 })
      .where(eq(toolsTable.id, id))
      .returning();
    if (!tool) return res.status(404).json({ error: "Not found" });
    return res.json(formatTool(tool));
  } catch (err) {
    logger.error({ err }, "Update tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
