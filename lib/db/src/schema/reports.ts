import { pgTable, serial, text, integer, timestamp, boolean, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull(),
  status: text("status").notNull().default("generating"),
  downloadUrl: text("download_url"),
  
  // Enterprise fields
  reportId: text("report_id"),
  category: varchar("category", { length: 50 }).default("technical"),
  formats: jsonb("formats").default([]),
  version: varchar("version", { length: 20 }).default("1.0"),
  templateVersion: varchar("template_version", { length: 20 }).default("1.0"),
  
  // Classification & security
  classification: varchar("classification", { length: 30 }).default("internal"),
  language: varchar("language", { length: 10 }).default("en"),
  isEncrypted: boolean("is_encrypted").default(false),
  checksum: text("checksum"),
  
  // Metrics
  totalFindings: integer("total_findings").default(0),
  criticalCount: integer("critical_count").default(0),
  highCount: integer("high_count").default(0),
  mediumCount: integer("medium_count").default(0),
  lowCount: integer("low_count").default(0),
  infoCount: integer("info_count").default(0),
  riskScore: integer("risk_score").default(100),
  securityScore: integer("security_score").default(100),
  durationMs: integer("duration_ms"),
  fileSize: integer("file_size"),
  
  // Approval
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  
  // Retention
  retentionDays: integer("retention_days"),
  expiresAt: timestamp("expires_at"),
  isArchived: boolean("is_archived").default(false),
  isFavorite: boolean("is_favorite").default(false),
  
  // Tags & metadata
  tags: jsonb("tags").default([]),
  createdBy: text("created_by"),
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
