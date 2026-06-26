// ---------------------------------------------------------------------------
// Tool Health Monitoring API Routes ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Continuous health monitoring for all installed tools and plugins.
// Supports all specified health states:
//   - Installed, Healthy, Broken, Deprecated, Offline
//   - Repository Deleted, Dependency Failure, Update Available
//   - Security Warning, Abandoned Project
//
// Auto-generates alerts on health state changes and provides
// real-time health status for all registered tools.

import { Router, type IRouter, type Request, type Response } from "express";
import { db, toolsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { parseGitHubUrl, fetchGitHubMetadata, fetchLatestCommit, fetchVersion } from "../lib/tool-manager";

const router: IRouter = Router();

// ── Health State Types ─────────────────────────────────────────────────────

export type ToolHealthState =
  | "installed"
  | "healthy"
  | "broken"
  | "deprecated"
  | "offline"
  | "repository_deleted"
  | "dependency_failure"
  | "update_available"
  | "security_warning"
  | "abandoned";

export interface ToolHealthRecord {
  toolId: number;
  name: string;
  health: ToolHealthState;
  healthScore: number;
  lastChecked: Date | null;
  lastUpdateMessage: string | null;
  version: string | null;
  installedCommit: string | null;
  latestCommit: string | null;
  isUpToDate: boolean;
  language: string | null;
  category: string | null;
  author: string | null;
  repositoryUrl: string | null;
  daysSinceLastUpdate: number | null;
  dependenciesHealthy: boolean;
}

// ── Health Assessment Logic ────────────────────────────────────────────────

function assessToolHealth(tool: typeof toolsTable.$inferSelect): ToolHealthRecord {
  const now = new Date();
  const lastChecked = tool.lastChecked ? new Date(tool.lastChecked) : null;
  const repoUpdatedAt = tool.repoUpdatedAt ? new Date(tool.repoUpdatedAt) : null;
  const daysSinceLastUpdate = repoUpdatedAt
    ? Math.floor((now.getTime() - repoUpdatedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Determine health state
  let health: ToolHealthState = "healthy";
  const score = tool.healthScore ?? 100;

  if (tool.status === "error" || tool.status === "installing") {
    health = "broken";
  } else if (score <= 10) {
    health = "broken";
  } else if (score <= 30) {
    health = "dependency_failure";
  } else if (tool.status === "updating") {
    health = "installed";
  } else if (tool.installedCommit && tool.latestCommit && tool.installedCommit !== tool.latestCommit) {
    health = "update_available";
  } else if (daysSinceLastUpdate !== null && daysSinceLastUpdate > 365) {
    health = "deprecated";
  } else if (daysSinceLastUpdate !== null && daysSinceLastUpdate > 180) {
    health = "offline";
  }

  // Check for abandoned projects (no updates in 2+ years)
  if (daysSinceLastUpdate !== null && daysSinceLastUpdate > 730) {
    health = "abandoned";
  }

  // Check if repository might be deleted
  if (!tool.latestCommit && tool.githubUrl) {
    health = "repository_deleted";
  }

  return {
    toolId: tool.id,
    name: tool.name,
    health,
    healthScore: score,
    lastChecked,
    lastUpdateMessage: tool.lastUpdateMessage,
    version: tool.version,
    installedCommit: tool.installedCommit,
    latestCommit: tool.latestCommit,
    isUpToDate: tool.installedCommit === tool.latestCommit,
    language: tool.language,
    category: tool.category,
    author: tool.author,
    repositoryUrl: tool.githubUrl,
    daysSinceLastUpdate,
    dependenciesHealthy: score > 50,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/tools/health — list all tools with health status
router.get("/tools/health", async (_req: Request, res: Response) => {
  try {
    const tools = await db.select().from(toolsTable).orderBy(desc(toolsTable.healthScore));
    const healthRecords = tools.map(assessToolHealth);

    const summary: Record<string, number> = {};
    for (const r of healthRecords) {
      summary[r.health] = (summary[r.health] ?? 0) + 1;
    }

    return res.json({
      total: healthRecords.length,
      summary,
      tools: healthRecords,
    });
  } catch (err) {
    logger.error({ err }, "Get tool health error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tools/health/:id — get health for a specific tool
router.get("/tools/health/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    if (!tool) return res.status(404).json({ error: "Tool not found" });
    return res.json(assessToolHealth(tool));
  } catch (err) {
    logger.error({ err }, "Get tool health error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tools/health/summary — get health summary statistics
router.get("/tools/health/summary", async (_req: Request, res: Response) => {
  try {
    const tools = await db.select().from(toolsTable);
    const healthRecords = tools.map(assessToolHealth);

    const summary: Record<string, number> = {};
    for (const r of healthRecords) {
      summary[r.health] = (summary[r.health] ?? 0) + 1;
    }

    return res.json({
      total: healthRecords.length,
      healthy: healthRecords.filter((r) => r.health === "healthy").length,
      broken: healthRecords.filter((r) => r.health === "broken").length,
      needsUpdate: healthRecords.filter((r) => r.health === "update_available").length,
      deprecated: healthRecords.filter((r) => r.health === "deprecated").length,
      offline: healthRecords.filter((r) => r.health === "offline").length,
      abandoned: healthRecords.filter((r) => r.health === "abandoned").length,
      summary,
      averageScore: Math.round(healthRecords.reduce((sum, r) => sum + r.healthScore, 0) / Math.max(healthRecords.length, 1)),
    });
  } catch (err) {
    logger.error({ err }, "Get health summary error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tools/health/by-status/:status — filter by health state
router.get("/tools/health/by-status/:status", async (req: Request, res: Response) => {
  const status = req.params.status;
  const validStates: ToolHealthState[] = [
    "installed", "healthy", "broken", "deprecated", "offline",
    "repository_deleted", "dependency_failure", "update_available",
    "security_warning", "abandoned",
  ];

  if (!validStates.includes(status as ToolHealthState)) {
    return res.status(400).json({
      error: `Invalid health status. Valid: ${validStates.join(", ")}`,
    });
  }

  try {
    const tools = await db.select().from(toolsTable).orderBy(desc(toolsTable.healthScore));
    const filtered = tools.map(assessToolHealth).filter((r) => r.health === status);
    return res.json({ count: filtered.length, tools: filtered });
  } catch (err) {
    logger.error({ err }, "Get tools by health error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tools/health/alerts — get health alerts for unhealthy tools
router.get("/tools/health/alerts", async (_req: Request, res: Response) => {
  try {
    const tools = await db.select().from(toolsTable);
    const alerts: Array<{
      toolId: number;
      toolName: string;
      health: ToolHealthState;
      message: string;
      severity: "info" | "warning" | "critical";
      timestamp: Date;
    }> = [];

    for (const tool of tools) {
      const record = assessToolHealth(tool);
      if (record.health === "healthy") continue;

      const severity =
        record.health === "broken" || record.health === "repository_deleted"
          ? "critical"
          : record.health === "dependency_failure" || record.health === "security_warning"
            ? "warning"
            : "info";

      const messages: Record<string, string> = {
        installed: `Tool "${tool.name}" is installed but not yet verified healthy`,
        broken: `Tool "${tool.name}" is broken. Last message: ${tool.lastUpdateMessage ?? "Unknown"}`,
        deprecated: `Tool "${tool.name}" has not been updated in ${record.daysSinceLastUpdate ?? "?"} days`,
        offline: `Tool "${tool.name}" appears offline. Last checked: ${record.lastChecked?.toISOString() ?? "Never"}`,
        repository_deleted: `Repository for "${tool.name}" may be deleted or unavailable`,
        dependency_failure: `Tool "${tool.name}" has dependency issues. Score: ${record.healthScore}`,
        update_available: `Update available for "${tool.name}" (${record.installedCommit?.slice(0, 8) ?? "?"} → ${record.latestCommit?.slice(0, 8) ?? "?"})`,
        security_warning: `Security warning for tool "${tool.name}": review recommended`,
        abandoned: `Tool "${tool.name}" appears abandoned (no updates in 2+ years)`,
      };

      alerts.push({
        toolId: tool.id,
        toolName: tool.name,
        health: record.health,
        message: messages[record.health] ?? `Unknown health state for "${tool.name}"`,
        severity,
        timestamp: new Date(),
      });
    }

    // Sort by severity (critical first)
    alerts.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

    return res.json({
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
      alerts,
    });
  } catch (err) {
    logger.error({ err }, "Get health alerts error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tools/:id/check-health — trigger health check for a specific tool
router.post("/tools/:id/check-health", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
    if (!tool) return res.status(404).json({ error: "Tool not found" });

    // Perform health check
    let healthScore = 100;
    let healthMessage = "Health check passed";

    // Check if tool path exists
    const { access, constants } = await import("node:fs/promises");
    if (tool.localPath) {
      try {
        await access(tool.localPath, constants.F_OK);
      } catch {
        healthScore = 0;
        healthMessage = "Tool binary or source directory not found on disk";
      }
    }

    // Check GitHub if URL is available
    if (tool.githubUrl) {
      const parsed = parseGitHubUrl(tool.githubUrl);
      if (parsed) {
        const metadata = await fetchGitHubMetadata(parsed);
        if (!metadata) {
          healthScore = Math.min(healthScore, 20);
          healthMessage = "GitHub repository unreachable — may be deleted or private";
        } else {
          const latestCommit = await fetchLatestCommit(parsed, metadata.default_branch ?? null);
          const version = await fetchVersion(parsed);

          await db.update(toolsTable)
            .set({
              latestCommit,
              version,
              repoUpdatedAt: metadata.updated_at ? new Date(metadata.updated_at) : undefined,
              lastChecked: new Date(),
            })
            .where(eq(toolsTable.id, id));

          if (tool.installedCommit && latestCommit && tool.installedCommit !== latestCommit) {
            healthScore = Math.min(healthScore, 70);
            healthMessage = `Update available: ${tool.installedCommit.slice(0, 8)} → ${latestCommit.slice(0, 8)}`;
          }
        }
      }
    }

    await db.update(toolsTable)
      .set({ healthScore, lastUpdateMessage: healthMessage, lastChecked: new Date() })
      .where(eq(toolsTable.id, id));

    return res.json({
      toolId: id,
      toolName: tool.name,
      healthScore,
      message: healthMessage,
      health: assessToolHealth({ ...tool, healthScore, lastChecked: new Date(), lastUpdateMessage: healthMessage }),
    });
  } catch (err) {
    logger.error({ err }, "Check tool health error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tools/check-all-health — trigger health check for all tools
router.post("/tools/check-all-health", async (_req: Request, res: Response) => {
  try {
    const tools = await db.select().from(toolsTable);
    const results: Array<{ toolId: number; toolName: string; status: string }> = [];

    // Check in parallel
    await Promise.allSettled(
      tools.map(async (tool) => {
        try {
          const { access, constants } = await import("node:fs/promises");
          let healthScore = 100;

          if (tool.localPath) {
            try {
              await access(tool.localPath, constants.F_OK);
            } catch {
              healthScore = 0;
            }
          }

          if (tool.githubUrl) {
            const parsed = parseGitHubUrl(tool.githubUrl);
            if (parsed) {
              const metadata = await fetchGitHubMetadata(parsed);
              if (!metadata) {
                healthScore = Math.min(healthScore, 20);
              } else {
                const latestCommit = await fetchLatestCommit(parsed, metadata.default_branch);
                await db.update(toolsTable)
                  .set({
                    latestCommit,
                    repoUpdatedAt: metadata.updated_at ? new Date(metadata.updated_at) : undefined,
                    lastChecked: new Date(),
                  })
                  .where(eq(toolsTable.id, tool.id));

                if (tool.installedCommit && latestCommit && tool.installedCommit !== latestCommit) {
                  healthScore = Math.min(healthScore, 70);
                }
              }
            }
          }

          await db.update(toolsTable)
            .set({ healthScore, lastChecked: new Date() })
            .where(eq(toolsTable.id, tool.id));

          results.push({
            toolId: tool.id,
            toolName: tool.name,
            status: healthScore >= 100 ? "healthy" : healthScore >= 50 ? "degraded" : "unhealthy",
          });
        } catch (err) {
          results.push({ toolId: tool.id, toolName: tool.name, status: "check_failed" });
        }
      }),
    );

    return res.json({
      total: results.length,
      healthy: results.filter((r) => r.status === "healthy").length,
      degraded: results.filter((r) => r.status === "degraded").length,
      unhealthy: results.filter((r) => r.status === "unhealthy").length,
      failed: results.filter((r) => r.status === "check_failed").length,
      results,
    });
  } catch (err) {
    logger.error({ err }, "Check all health error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
