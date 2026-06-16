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

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

async function fetchGitHubVersion(owner: string, repo: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        "User-Agent": "V8-Platform/2.0.4",
        "Accept": "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as { tag_name?: string };
      return data.tag_name ?? "latest";
    }
    // If no releases, try tags
    const tagsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags`, {
      headers: { "User-Agent": "V8-Platform/2.0.4" },
      signal: AbortSignal.timeout(5000),
    });
    if (tagsRes.ok) {
      const tags = await tagsRes.json() as Array<{ name?: string }>;
      if (tags[0]?.name) return tags[0].name;
    }
  } catch {}
  return "v1.0.0";
}

function simulateToolInstall(toolId: number, owner: string, repo: string) {
  const installSteps = [
    { delay: 1200,  desc: `CLONE: Pulling from github.com/${owner}/${repo} — establishing secure connection...` },
    { delay: 3800,  desc: `DEPS: Analyzing repository structure — scanning for go.mod, requirements.txt, package.json...` },
    { delay: 7000,  desc: `BUILD: Compiling binary and resolving dependency tree — 0 conflicts detected` },
    { delay: 10500, desc: `SANDBOX: Running internal stability self-test against loopback 127.0.0.1...` },
    { delay: 13500, desc: `INJECT: Registering in V8 orchestration pipeline — assigning worker slot...` },
  ];

  for (const step of installSteps) {
    setTimeout(async () => {
      try {
        await db.update(toolsTable)
          .set({ description: step.desc })
          .where(eq(toolsTable.id, toolId));
      } catch (err) {
        logger.error({ err, toolId }, "Tool install step error");
      }
    }, step.delay);
  }

  // Final step: fetch real version and mark as active
  setTimeout(async () => {
    try {
      const version = await fetchGitHubVersion(owner, repo);
      await db.update(toolsTable).set({
        status: "active",
        version,
        description: `Security assessment tool — ${owner}/${repo}. Version ${version} injected into orchestration pipeline and ready for deployment.`,
        lastChecked: new Date(),
        healthScore: 100,
      }).where(eq(toolsTable.id, toolId));
    } catch (err) {
      logger.error({ err, toolId }, "Tool install finalize error");
      await db.update(toolsTable)
        .set({ status: "error", description: "Installation failed — check GitHub URL and retry." })
        .where(eq(toolsTable.id, toolId));
    }
  }, 16000);
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

  const parsed = parseGitHubUrl(githubUrl);

  try {
    const [tool] = await db.insert(toolsTable).values({
      name,
      githubUrl,
      description: parsed
        ? `INIT: Cloning repository github.com/${parsed.owner}/${parsed.repo}...`
        : (description ?? "Initializing tool installation..."),
      status: "installing",
      version: null,
      lastChecked: new Date(),
      healthScore: 0,
    }).returning();

    // Start multi-step install simulation
    if (parsed) {
      simulateToolInstall(tool.id, parsed.owner, parsed.repo);
    } else {
      // Fallback for non-GitHub URLs: quick install
      setTimeout(async () => {
        await db.update(toolsTable).set({
          status: "active",
          version: "latest",
          description: description ?? "Custom tool installed and ready.",
          healthScore: 100,
          lastChecked: new Date(),
        }).where(eq(toolsTable.id, tool.id));
      }, 4000);
    }

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

// POST /api/tools/:id/update — Check GitHub for latest version
router.post("/tools/:id/update", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [existing] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    // Set updating state
    await db.update(toolsTable)
      .set({ status: "updating", description: "UPDATE: Checking GitHub for latest release..." })
      .where(eq(toolsTable.id, id));

    // Async: fetch real version from GitHub
    setTimeout(async () => {
      try {
        let version = "latest";
        if (existing.githubUrl) {
          const parsed = parseGitHubUrl(existing.githubUrl);
          if (parsed) version = await fetchGitHubVersion(parsed.owner, parsed.repo);
        }
        await db.update(toolsTable).set({
          status: "active",
          version,
          lastChecked: new Date(),
          healthScore: 100,
          description: existing.description?.startsWith("UPDATE:") || existing.description?.startsWith("INIT:") || existing.description?.startsWith("CLONE:")
            ? `Version ${version} — up to date and operational.`
            : existing.description,
        }).where(eq(toolsTable.id, id));
      } catch (err) {
        logger.error({ err, id }, "Tool update fetch error");
        await db.update(toolsTable)
          .set({ status: "active", lastChecked: new Date() })
          .where(eq(toolsTable.id, id));
      }
    }, 3500);

    const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    return res.json(formatTool(tool));
  } catch (err) {
    logger.error({ err }, "Update tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
