// ---------------------------------------------------------------------------
// Plugin Management API Routes
// ---------------------------------------------------------------------------

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { pluginLifecycleManager } from "../plugin/sdk/lifecycle-manager";
import { permissionManager } from "../plugin/sdk/permissions";
import { pluginEventBus } from "../plugin/sdk/events";
import { pluginHealthMonitor } from "../plugin/sdk/health-monitor";
import { pluginVersionManager } from "../plugin/sdk/version-manager";
import { githubPluginIntegration } from "../plugin/github-integration";
import { pluginMarketplace } from "../plugin/marketplace";
import type { MarketplaceSearchFilter } from "../plugin/sdk/types";

const router: IRouter = Router();

function ensureString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

function ensureStringArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : val.split(",").map(s => s.trim()).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

router.get("/plugins", (_req: Request, res: Response) => {
  try {
    const plugins = pluginLifecycleManager.getAllPlugins();
    return res.json(plugins.map(({ plugin, state }) => ({
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      category: plugin.manifest.category,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      state,
      enabled: plugin.manifest.enabled,
      permissions: plugin.manifest.permissions.length,
      dependencies: plugin.manifest.dependencies.length,
      inputTypes: plugin.manifest.inputTypes,
      outputTypes: plugin.manifest.outputTypes,
    })));
  } catch (err) {
    logger.error({ err }, "List plugins error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/plugins/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const plugin = pluginLifecycleManager.getPlugin(id);
  if (!plugin) return res.status(404).json({ error: "Plugin not found" });

  return res.json({
    manifest: plugin.manifest,
    state: pluginLifecycleManager.getState(id),
    health: pluginHealthMonitor.getHealth(id),
    lifecycleHistory: pluginLifecycleManager.getLifecycleHistory(id).slice(-20),
  });
});

router.post("/plugins", async (_req: Request, res: Response) => {
  return res.status(501).json({ error: "Plugin instantiation from REST not yet supported. Use marketplace or GitHub install." });
});

router.delete("/plugins/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const success = await pluginLifecycleManager.remove(id);
    if (!success) return res.status(404).json({ error: "Plugin not found" });
    return res.json({ message: `Plugin "${id}" uninstalled` });
  } catch (err) {
    logger.error({ err, pluginId: id }, "Uninstall plugin error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/plugins/:id/enable", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const success = await pluginLifecycleManager.enable(id);
    if (!success) return res.status(404).json({ error: "Plugin not found or cannot be enabled" });
    return res.json({ message: `Plugin "${id}" enabled` });
  } catch (err) {
    logger.error({ err, pluginId: id }, "Enable plugin error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/plugins/:id/disable", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const success = await pluginLifecycleManager.disable(id);
    if (!success) return res.status(404).json({ error: "Plugin not found" });
    return res.json({ message: `Plugin "${id}" disabled` });
  } catch (err) {
    logger.error({ err, pluginId: id }, "Disable plugin error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/plugins/:id/health", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const health = pluginHealthMonitor.getHealth(id);
    if (!health) return res.status(404).json({ error: "Plugin health not found" });
    await pluginHealthMonitor.runHealthCheck(id);
    return res.json(health);
  } catch (err) {
    logger.error({ err, pluginId: id }, "Health check error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/plugins/install/github", async (req: Request, res: Response) => {
  const { repository, ref, type, isPrivate } = req.body as {
    repository: string; ref?: string; type?: "release" | "tag" | "branch" | "commit"; isPrivate?: boolean;
  };

  if (!repository) return res.status(400).json({ error: "repository is required" });

  try {
    const result = await githubPluginIntegration.install({
      repository, type: type ?? "release", ref: ref ?? "latest", isPrivate: isPrivate ?? false,
    });
    return res.status(result.success ? 201 : 400).json(result);
  } catch (err) {
    logger.error({ err, repository }, "GitHub install error");
    return res.status(500).json({ error: "GitHub installation failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════

router.get("/marketplace", (req: Request, res: Response) => {
  try {
    const filter: MarketplaceSearchFilter = {};
    const q = req.query as Record<string, string | string[]>;

    const query = ensureString(q.query);
    const category = ensureString(q.category);
    const author = ensureString(q.author);
    const minRating = ensureString(q.minRating);
    const minSecurityScore = ensureString(q.minSecurityScore);
    const tags = ensureStringArray(q.tags);
    const sortBy = ensureString(q.sortBy);
    const sortOrder = ensureString(q.sortOrder);
    const page = ensureString(q.page);
    const pageSize = ensureString(q.pageSize);

    if (query) filter.query = query;
    if (category) filter.category = category as MarketplaceSearchFilter["category"];
    if (author) filter.author = author;
    if (minRating) filter.minRating = parseFloat(minRating);
    if (minSecurityScore) filter.minSecurityScore = parseInt(minSecurityScore);
    if (tags.length > 0) filter.tags = tags;
    if (sortBy) filter.sortBy = sortBy as "rating" | "downloads" | "updated" | "name";
    if (sortOrder) filter.sortOrder = sortOrder as "asc" | "desc";
    if (page) filter.page = parseInt(page);
    if (pageSize) filter.pageSize = parseInt(pageSize);

    const result = pluginMarketplace.search(filter);
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "Marketplace search error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/marketplace/categories", (_req: Request, res: Response) => {
  try {
    return res.json(pluginMarketplace.getCategories());
  } catch (err) {
    logger.error({ err }, "Marketplace categories error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/marketplace/recommended", (req: Request, res: Response) => {
  try {
    const category = ensureString(req.query.category as string | string[]) as any;
    const limit = parseInt(ensureString(req.query.limit as string | string[]) ?? "5");
    return res.json(pluginMarketplace.getRecommended(category, limit));
  } catch (err) {
    logger.error({ err }, "Marketplace recommended error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/marketplace/stats", (_req: Request, res: Response) => {
  try {
    return res.json(pluginMarketplace.getStats());
  } catch (err) {
    logger.error({ err }, "Marketplace stats error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/marketplace/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const plugin = pluginMarketplace.getPlugin(id);
  if (!plugin) return res.status(404).json({ error: "Plugin not found in marketplace" });
  return res.json(plugin);
});

router.post("/marketplace/:id/install", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const success = await pluginMarketplace.install(id);
    if (!success) return res.status(404).json({ error: "Plugin not found in marketplace" });
    return res.json({ message: `Plugin "${id}" installation started` });
  } catch (err) {
    logger.error({ err, pluginId: id }, "Marketplace install error");
    return res.status(500).json({ error: "Installation failed" });
  }
});

router.post("/marketplace/favorites/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const isFavorite = (req.body as { favorite?: boolean })?.favorite ?? false;
  if (isFavorite) pluginMarketplace.addFavorite(id);
  else pluginMarketplace.removeFavorite(id);
  return res.json({ message: "Favorite updated", isFavorite });
});

router.get("/marketplace/favorites/list", (_req: Request, res: Response) => {
  return res.json(pluginMarketplace.getFavorites());
});

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE & PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/plugins/lifecycle/history", (req: Request, res: Response) => {
  const pluginId = ensureString(req.query.pluginId as string | string[]);
  return res.json(pluginLifecycleManager.getLifecycleHistory(pluginId).slice(-100));
});

router.get("/plugins/permissions/pending", (_req: Request, res: Response) => {
  return res.json(permissionManager.getPendingPermissions());
});

router.get("/plugins/permissions/:pluginId", (req: Request, res: Response) => {
  const pluginId = String(req.params.pluginId);
  return res.json(permissionManager.getPermissions(pluginId));
});

router.post("/plugins/permissions/approve", (req: Request, res: Response) => {
  const { pluginId, permission, approvedBy } = req.body as {
    pluginId: string; permission: string; approvedBy?: string;
  };
  if (!pluginId || !permission) return res.status(400).json({ error: "pluginId and permission required" });
  const success = permissionManager.approvePermission(pluginId, permission as any, approvedBy ?? "admin");
  if (!success) return res.status(404).json({ error: "Permission not found" });
  return res.json({ message: "Permission approved" });
});

router.post("/plugins/permissions/approve-all", (req: Request, res: Response) => {
  const { pluginId, approvedBy } = req.body as { pluginId: string; approvedBy?: string };
  if (!pluginId) return res.status(400).json({ error: "pluginId required" });
  const count = permissionManager.approveAll(pluginId, approvedBy ?? "admin");
  return res.json({ message: `${count} permission(s) approved` });
});

router.get("/plugins/stats", (_req: Request, res: Response) => {
  return res.json({
    lifecycle: pluginLifecycleManager.getStateCounts(),
    permissions: permissionManager.getStats(),
    health: pluginHealthMonitor.getStats(),
    versions: pluginVersionManager.getStats(),
    marketplace: pluginMarketplace.getStats(),
  });
});

router.get("/plugins/events/recent", (req: Request, res: Response) => {
  const limit = parseInt(ensureString(req.query.limit as string | string[]) ?? "50");
  const type = ensureString(req.query.type as string | string[]);
  return res.json(pluginEventBus.getRecentEvents(type as any, limit));
});

router.get("/plugins/events/subscribed", (_req: Request, res: Response) => {
  return res.json(pluginEventBus.getSubscribedEventTypes());
});

export default router;
