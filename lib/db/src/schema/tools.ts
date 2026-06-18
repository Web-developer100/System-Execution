import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const toolsTable = pgTable("tools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  githubUrl: text("github_url"),
  status: text("status").notNull().default("active"),
  version: text("version"),
  language: text("language"),
  category: text("category"),
  capabilities: text("capabilities"),
  author: text("author"),
  license: text("license"),
  topics: text("topics"),
  dockerImage: text("docker_image"),
  installCommands: text("install_commands"),
  buildCommands: text("build_commands"),
  runCommand: text("run_command"),
  sandboxProfile: text("sandbox_profile"),
  localPath: text("local_path"),
  defaultBranch: text("default_branch"),
  installedCommit: text("installed_commit"),
  latestCommit: text("latest_commit"),
  repoCreatedAt: timestamp("repo_created_at"),
  repoUpdatedAt: timestamp("repo_updated_at"),
  installLog: text("install_log"),
  installStartedAt: timestamp("install_started_at"),
  installCompletedAt: timestamp("install_completed_at"),
  lastUpdateMessage: text("last_update_message"),
  lastChecked: timestamp("last_checked"),
  healthScore: integer("health_score").default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertToolSchema = createInsertSchema(toolsTable).omit({ id: true, createdAt: true });
export type InsertTool = z.infer<typeof insertToolSchema>;
export type Tool = typeof toolsTable.$inferSelect;
