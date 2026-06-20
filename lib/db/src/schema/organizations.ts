import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Multi-tenant organization hierarchy:
 *
 * Organization → Projects → Teams → Members
 *
 * Complete data isolation between organizations.
 * Every resource (scans, vulns, tools, proxies) is scoped to an organization.
 */

// ── Organizations ───────────────────────────────────────────────────────────

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  /** Billing tier: free, pro, enterprise */
  tier: text("tier").notNull().default("free"),
  /** Max projects allowed */
  maxProjects: integer("max_projects").default(5),
  /** Max team members */
  maxMembers: integer("max_members").default(10),
  /** Feature flags as JSON */
  features: jsonb("features").default({}),
  /** Whether the organization is active */
  isActive: boolean("is_active").default(true),
  /** Billing ready fields */
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Timestamps */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;

// ── Projects ────────────────────────────────────────────────────────────────

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Project-specific risk score 0-100 */
  riskScore: integer("risk_score").default(0),
  /** Color for UI identification */
  color: text("color").default("#22d3ee"),
  /** Whether the project is archived */
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

// ── Teams ───────────────────────────────────────────────────────────────────

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamSchema = createInsertSchema(teamsTable)
  .omit({ id: true, createdAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;

// ── Members (Users within an Organization) ───────────────────────────────────

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  /** Role within the organization: owner, admin, member, viewer */
  role: text("role").notNull().default("member"),
  /** Fine-grained permissions as JSON array */
  permissions: jsonb("permissions").default([]),
  /** Whether the membership is active */
  isActive: boolean("is_active").default(true),
  /** Last active timestamp */
  lastActiveAt: timestamp("last_active_at"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertMemberSchema = createInsertSchema(membersTable)
  .omit({ id: true, joinedAt: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;

// ── Roles & Permissions (RBAC) ──────────────────────────────────────────────

export interface Permission {
  resource: string;    // e.g. "scans", "vulnerabilities", "tools", "proxies", "reports"
  action: string;      // e.g. "create", "read", "update", "delete", "manage"
}

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: Permission[];
}

export const BUILT_IN_ROLES: Record<string, RoleDefinition> = {
  owner: {
    name: "Owner",
    description: "Full access to everything including billing and settings",
    permissions: [
      { resource: "*", action: "manage" },
    ],
  },
  admin: {
    name: "Administrator",
    description: "Full access to all resources except billing",
    permissions: [
      { resource: "*", action: "manage" },
    ],
  },
  member: {
    name: "Member",
    description: "Can create and manage scans, view vulnerabilities",
    permissions: [
      { resource: "scans", action: "create" },
      { resource: "scans", action: "read" },
      { resource: "scans", action: "update" },
      { resource: "scans", action: "delete" },
      { resource: "vulnerabilities", action: "read" },
      { resource: "vulnerabilities", action: "update" },
      { resource: "tools", action: "read" },
      { resource: "proxies", action: "read" },
      { resource: "reports", action: "create" },
      { resource: "reports", action: "read" },
    ],
  },
  viewer: {
    name: "Viewer",
    description: "Read-only access to scan results and vulnerabilities",
    permissions: [
      { resource: "scans", action: "read" },
      { resource: "vulnerabilities", action: "read" },
      { resource: "tools", action: "read" },
      { resource: "reports", action: "read" },
    ],
  },
};
