import { Router, type IRouter } from "express";
import { db, toolsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  fetchGitHubMetadata,
  fetchLatestCommit,
  fetchVersion,
  installToolFromGitHub,
  parseGitHubUrl,
  removeToolDirectory,
  sanitizeToolName,
  updateInstalledTool,
} from "../lib/tool-manager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Auto-classify tool by name when category is missing
const TOOL_CATEGORY_MAP: Record<string, string> = {
  nuclei: "scanner", subfinder: "recon", nmap: "network", httpx: "recon",
  ffuf: "fuzzer", sqlmap: "exploit", dalfox: "scanner", naabu: "network",
  feroxbuster: "fuzzer", dirsearch: "fuzzer", gobuster: "fuzzer",
  semgrep: "sast", trivy: "container", grype: "container", syft: "sbom",
  amass: "recon", katana: "crawler", hakrawler: "crawler",
  trufflehog: "secrets", gitleaks: "secrets", nikto: "scanner",
  rustscan: "network", masscan: "network", subzy: "scanner",
  paramspider: "recon", arjun: "recon", rengine: "platform", afrog: "scanner",
  wafw00f: "recon", whatweb: "recon", wfuzz: "fuzzer", commix: "exploit",
  burpsuite: "scanner", openvas: "scanner", nessus: "scanner",
};

function inferCategory(name: string, existing: string | null): string {
  if (existing) return existing;
  const lower = name.toLowerCase();
  for (const [key, cat] of Object.entries(TOOL_CATEGORY_MAP)) {
    if (lower.includes(key)) return cat;
  }
  return "scanner";
}

function formatTool(tool: typeof toolsTable.$inferSelect) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description ?? null,
    githubUrl: tool.githubUrl ?? null,
    status: tool.status,
    version: tool.version ?? null,
    language: tool.language ?? null,
    category: inferCategory(tool.name, tool.category),
    author: tool.author ?? null,
    license: tool.license ?? null,
    localPath: tool.localPath ?? null,
    defaultBranch: tool.defaultBranch ?? null,
    installedCommit: tool.installedCommit ?? null,
    latestCommit: tool.latestCommit ?? null,
    repoCreatedAt: tool.repoCreatedAt?.toISOString() ?? null,
    repoUpdatedAt: tool.repoUpdatedAt?.toISOString() ?? null,
    installLog: tool.installLog ?? null,
    installStartedAt: tool.installStartedAt?.toISOString() ?? null,
    installCompletedAt: tool.installCompletedAt?.toISOString() ?? null,
    lastUpdateMessage: tool.lastUpdateMessage ?? null,
    lastChecked: tool.lastChecked?.toISOString() ?? null,
    healthScore: tool.healthScore ?? 100,
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

// GET /api/tools/:id
router.get("/tools/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    if (!tool) return res.status(404).json({ error: "Not found" });
    return res.json(formatTool(tool));
  } catch (err) {
    logger.error({ err }, "Get tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tools
router.post("/tools", async (req, res) => {
  const { name, githubUrl, description } = req.body as { name: string; githubUrl: string; description?: string };
  const cleanName = sanitizeToolName(name ?? "");
  const parsed = parseGitHubUrl(githubUrl ?? "");

  if (!cleanName || !parsed) {
    return res.status(400).json({ error: "Valid tool name and GitHub URL are required" });
  }

  try {
    const repoMeta = await fetchGitHubMetadata(parsed);
    if (!repoMeta) {
      return res.status(400).json({ error: "GitHub repository could not be verified" });
    }

    const latestCommit = await fetchLatestCommit(parsed, repoMeta.default_branch);
    const version = await fetchVersion(parsed);
    const [tool] = await db.insert(toolsTable).values({
      name: cleanName,
      githubUrl: parsed.normalizedUrl,
      description: repoMeta.description ?? description ?? "Repository verified. Installation pipeline queued.",
      status: "installing",
      version,
      language: repoMeta.language ?? null,
      defaultBranch: repoMeta.default_branch ?? null,
      latestCommit,
      repoCreatedAt: repoMeta.created_at ? new Date(repoMeta.created_at) : null,
      repoUpdatedAt: repoMeta.updated_at ? new Date(repoMeta.updated_at) : null,
      lastChecked: new Date(),
      lastUpdateMessage: "Installation queued.",
      healthScore: 1,
    }).returning();

    setImmediate(() => {
      installToolFromGitHub(tool.id).catch((err) => {
        logger.error({ err, toolId: tool.id }, "Background tool installation crashed");
      });
    });

    return res.status(201).json(formatTool(tool));
  } catch (err) {
    logger.error({ err }, "Register tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tools/:id
router.delete("/tools/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [existing] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    await removeToolDirectory(existing.localPath);
    await db.delete(toolsTable).where(eq(toolsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete tool error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tools/:id/update
router.post("/tools/:id/update", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [existing] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (existing.status === "installing" || existing.status === "updating") {
      return res.status(409).json({ error: "Tool is already busy" });
    }

    const updated = await updateInstalledTool(id);
    return res.json(formatTool(updated));
  } catch (err) {
    logger.error({ err }, "Update tool error");
    const [tool] = await db.update(toolsTable)
      .set({
        status: "error",
        lastChecked: new Date(),
        healthScore: 0,
        lastUpdateMessage: err instanceof Error ? err.message : "Update failed",
      })
      .where(eq(toolsTable.id, id))
      .returning();
    if (!tool) return res.status(404).json({ error: "Not found" });
    return res.status(500).json(formatTool(tool));
  }
});

export default router;
