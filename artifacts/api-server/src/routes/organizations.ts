// ---------------------------------------------------------------------------
// Organization / Project / Team / Member API Routes
// ---------------------------------------------------------------------------
//
// Multi-tenant management API with RBAC enforcement.
// All resources are scoped to an organization.
// Routes: /api/organizations, /api/projects, /api/teams

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, organizationsTable, projectsTable, teamsTable, membersTable, usersTable, BUILT_IN_ROLES } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { Permission } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Middleware that requires the user to have a specific role in the organization
 * specified by `:orgId` route param.
 */
async function requireOrgRole(req: Request, res: Response, next: NextFunction, minimumRole: string): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  try {
    const [member] = await db
      .select()
      .from(membersTable)
      .where(
        and(
          eq(membersTable.organizationId, orgId),
          eq(membersTable.userId, req.user.userId),
          eq(membersTable.isActive, true),
        ),
      );

    if (!member) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    // owner > admin > member > viewer hierarchy
    const roleHierarchy: Record<string, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    };

    const userLevel = roleHierarchy[member.role] ?? 0;
    const requiredLevel = roleHierarchy[minimumRole] ?? 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: minimumRole,
        current: member.role,
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, "RBAC check error");
    res.status(500).json({ error: "Internal server error" });
  }
}

/** Require at least 'viewer' role in the org */
function requireViewer(req: Request, res: Response, next: NextFunction): void {
  void requireOrgRole(req, res, next, "viewer");
}

/** Require at least 'member' role in the org */
function requireMember(req: Request, res: Response, next: NextFunction): void {
  void requireOrgRole(req, res, next, "member");
}

/** Require at least 'admin' role in the org */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  void requireOrgRole(req, res, next, "admin");
}

/** Require 'owner' role in the org */
function requireOwner(req: Request, res: Response, next: NextFunction): void {
  void requireOrgRole(req, res, next, "owner");
}

function checkPermission(userRole: string, resource: string, action: string): boolean {
  const roleDef = BUILT_IN_ROLES[userRole];
  if (!roleDef) return false;
  // Owner and admin have full access
  if (userRole === "owner" || userRole === "admin") return true;
  return roleDef.permissions.some(
    (p) => (p.resource === "*" || p.resource === resource) && (p.action === "manage" || p.action === action),
  );
}

function formatOrg(o: typeof organizationsTable.$inferSelect) {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    description: o.description,
    tier: o.tier,
    maxProjects: o.maxProjects,
    maxMembers: o.maxMembers,
    isActive: o.isActive,
    createdAt: o.createdAt.toISOString(),
  };
}

function formatProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id,
    organizationId: p.organizationId,
    name: p.name,
    description: p.description,
    riskScore: p.riskScore,
    color: p.color,
    isArchived: p.isArchived,
    createdAt: p.createdAt.toISOString(),
  };
}

function formatMember(m: typeof membersTable.$inferSelect) {
  return {
    id: m.id,
    organizationId: m.organizationId,
    userId: m.userId,
    teamId: m.teamId,
    role: m.role,
    isActive: m.isActive,
    joinedAt: m.joinedAt.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations
router.get("/organizations", async (req: Request, res: Response) => {
  try {
    const orgs = await db.select().from(organizationsTable).orderBy(desc(organizationsTable.createdAt));
    return res.json(orgs.map(formatOrg));
  } catch (err) {
    logger.error({ err }, "Get organizations error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/organizations/:id
router.get("/organizations/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
    if (!org) return res.status(404).json({ error: "Organization not found" });
    return res.json(formatOrg(org));
  } catch (err) {
    logger.error({ err }, "Get organization error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations
router.post("/organizations", async (req: Request, res: Response) => {
  const { name, slug, description } = req.body as { name: string; slug: string; description?: string };
  if (!name || !slug) return res.status(400).json({ error: "Name and slug required" });

  try {
    const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));
    if (existing) return res.status(409).json({ error: "Organization slug already exists" });

    const [org] = await db.insert(organizationsTable).values({ name, slug, description: description ?? null }).returning();

    // Automatically add the creating user as owner
    if (req.user) {
      await db.insert(membersTable).values({
        organizationId: org.id,
        userId: req.user.userId,
        role: "owner",
        isActive: true,
      });
    }

    logger.info({ orgId: org.id, slug }, "Organization created");
    return res.status(201).json(formatOrg(org));
  } catch (err) {
    logger.error({ err }, "Create organization error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/organizations/:id
router.patch("/organizations/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const { name, description, tier, maxProjects, maxMembers, features } = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (name) update.name = name;
  if (description !== undefined) update.description = description;
  if (tier) update.tier = tier;
  if (maxProjects) update.maxProjects = maxProjects;
  if (maxMembers) update.maxMembers = maxMembers;
  if (features) update.features = features;
  update.updatedAt = new Date();

  try {
    const [updated] = await db.update(organizationsTable).set(update).where(eq(organizationsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Organization not found" });
    return res.json(formatOrg(updated));
  } catch (err) {
    logger.error({ err }, "Update organization error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/organizations/:id
router.delete("/organizations/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    await db.delete(organizationsTable).where(eq(organizationsTable.id, id));
    return res.json({ message: "Organization deleted" });
  } catch (err) {
    logger.error({ err }, "Delete organization error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS (scoped to organization)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations/:orgId/projects
router.get("/organizations/:orgId/projects", requireViewer, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  try {
    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.organizationId, orgId))
      .orderBy(desc(projectsTable.createdAt));
    return res.json(projects.map(formatProject));
  } catch (err) {
    logger.error({ err }, "Get projects error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/:orgId/projects
router.post("/organizations/:orgId/projects", requireMember, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  const { name, description, color } = req.body as { name: string; description?: string; color?: string };
  if (!name) return res.status(400).json({ error: "Project name required" });

  try {
    const [project] = await db
      .insert(projectsTable)
      .values({ organizationId: orgId, name, description: description ?? null, color: color ?? "#22d3ee" })
      .returning();

    logger.info({ orgId, projectId: project.id, name }, "Project created");
    return res.status(201).json(formatProject(project));
  } catch (err) {
    logger.error({ err }, "Create project error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/projects/:id
router.patch("/projects/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const { name, description, color, riskScore, isArchived } = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (name) update.name = name;
  if (description !== undefined) update.description = description;
  if (color) update.color = color;
  if (riskScore !== undefined) update.riskScore = riskScore;
  if (isArchived !== undefined) update.isArchived = isArchived;

  try {
    const [updated] = await db.update(projectsTable).set(update).where(eq(projectsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Project not found" });
    return res.json(formatProject(updated));
  } catch (err) {
    logger.error({ err }, "Update project error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/projects/:id
router.delete("/projects/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    return res.json({ message: "Project deleted" });
  } catch (err) {
    logger.error({ err }, "Delete project error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAMS (scoped to organization)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations/:orgId/teams
router.get("/organizations/:orgId/teams", requireViewer, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  try {
    const teams = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.organizationId, orgId))
      .orderBy(desc(teamsTable.createdAt));
    return res.json(teams);
  } catch (err) {
    logger.error({ err }, "Get teams error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/:orgId/teams
router.post("/organizations/:orgId/teams", requireAdmin, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  const { name, description } = req.body as { name: string; description?: string };
  if (!name) return res.status(400).json({ error: "Team name required" });

  try {
    const [team] = await db
      .insert(teamsTable)
      .values({ organizationId: orgId, name, description: description ?? null })
      .returning();
    return res.status(201).json(team);
  } catch (err) {
    logger.error({ err }, "Create team error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/teams/:id
router.delete("/teams/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    await db.delete(teamsTable).where(eq(teamsTable.id, id));
    return res.json({ message: "Team deleted" });
  } catch (err) {
    logger.error({ err }, "Delete team error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MEMBERS (org membership management)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations/:orgId/members
router.get("/organizations/:orgId/members", requireAdmin, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  try {
    const members = await db
      .select()
      .from(membersTable)
      .where(and(eq(membersTable.organizationId, orgId), eq(membersTable.isActive, true)));
    return res.json(members.map(formatMember));
  } catch (err) {
    logger.error({ err }, "Get members error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/:orgId/members
router.post("/organizations/:orgId/members", requireAdmin, async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  const { userId, role, teamId } = req.body as { userId: number; role?: string; teamId?: number };
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const [existing] = await db
      .select()
      .from(membersTable)
      .where(and(eq(membersTable.organizationId, orgId), eq(membersTable.userId, userId)));

    if (existing) return res.status(409).json({ error: "User is already a member" });

    const [member] = await db
      .insert(membersTable)
      .values({ organizationId: orgId, userId, role: role ?? "member", teamId: teamId ?? null, isActive: true })
      .returning();

    logger.info({ orgId, userId, role: role ?? "member" }, "Member added to organization");
    return res.status(201).json(formatMember(member));
  } catch (err) {
    logger.error({ err }, "Add member error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/members/:id (update role)
router.patch("/members/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const { role, teamId, isActive } = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (role) update.role = role;
  if (teamId !== undefined) update.teamId = teamId;
  if (isActive !== undefined) update.isActive = isActive;

  try {
    const [updated] = await db.update(membersTable).set(update).where(eq(membersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Member not found" });
    return res.json(formatMember(updated));
  } catch (err) {
    logger.error({ err }, "Update member error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/members/:id
router.delete("/members/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    await db.delete(membersTable).where(eq(membersTable.id, id));
    return res.json({ message: "Member removed" });
  } catch (err) {
    logger.error({ err }, "Remove member error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/organizations/:id/members/me (current user's membership)
router.get("/organizations/:orgId/members/me", async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const orgId = parseInt(String(req.params.orgId));
  if (isNaN(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

  try {
    const [member] = await db
      .select()
      .from(membersTable)
      .where(and(eq(membersTable.organizationId, orgId), eq(membersTable.userId, req.user.userId)));

    if (!member) return res.status(404).json({ error: "Not a member of this organization" });
    return res.json(formatMember(member));
  } catch (err) {
    logger.error({ err }, "Get my membership error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/roles (list available roles with permissions)
router.get("/roles", (_req: Request, res: Response) => {
  return res.json(BUILT_IN_ROLES);
});

export default router;
