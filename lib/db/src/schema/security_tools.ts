// ---------------------------------------------------------------------------
// security_tools — PostgreSQL Production Schema
// ---------------------------------------------------------------------------
//
// Strict relational model for managing tools, workers, workflows, and logs
// as specified in Part 11 of the V8 platform specification.
//
// Uses:
//   - UUID primary keys
//   - Custom ENUM types for tool status and execution language
//   - Timestamp with timezone for all date fields
//   - NOT NULL constraints where required

import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Custom ENUM Types ────────────────────────────────────────────────────

export const toolStatusEnum = pgEnum("tool_status_enum", [
  "ACTIVE",
  "BUILDING",
  "WARNING",
  "OFFLINE",
]);

export const executionLangEnum = pgEnum("execution_lang_enum", [
  "PYTHON",
  "GO",
  "RUST",
  "BINARY",
  "DOCKER",
]);

// ── Table Definition ─────────────────────────────────────────────────────

export const securityToolsTable = pgTable("security_tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  repositoryUrl: text("repository_url").notNull().unique(),
  description: text("description"),
  executionLanguage: executionLangEnum("execution_language").notNull(),
  binaryPath: text("binary_path"),
  currentCommitSha: text("current_commit_sha").notNull(),
  installedVersion: text("installed_version"),
  githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
  githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }),
  status: toolStatusEnum("status").notNull().default("BUILDING"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zod Schemas ──────────────────────────────────────────────────────────

export const insertSecurityToolSchema = createInsertSchema(securityToolsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSecurityTool = z.infer<typeof insertSecurityToolSchema>;
export type SecurityTool = typeof securityToolsTable.$inferSelect;
