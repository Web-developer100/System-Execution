import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vulnerabilitiesTable = pgTable("vulnerabilities", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull(),
  title: text("title").notNull(),
  severity: text("severity").notNull().default("info"),
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"),
  description: text("description"),
  evidence: text("evidence"),
  fix: text("fix"),
  aiValidated: boolean("ai_validated").default(false),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
});

export const insertVulnerabilitySchema = createInsertSchema(vulnerabilitiesTable).omit({ id: true, discoveredAt: true });
export type InsertVulnerability = z.infer<typeof insertVulnerabilitySchema>;
export type Vulnerability = typeof vulnerabilitiesTable.$inferSelect;
