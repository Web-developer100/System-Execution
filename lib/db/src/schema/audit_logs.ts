import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Immutable audit log for tracking all user actions.
 * Required for SOC2 / ISO 27001 compliance.
 *
 * Rows MUST NOT be updated or deleted after insert.
 */
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  /** User ID who performed the action (null for unauthenticated actions like login failures) */
  userId: integer("user_id"),
  /** Username at time of action (denormalized for audit integrity) */
  username: text("username"),
  /** HTTP method: GET, POST, PUT, DELETE */
  method: text("method").notNull(),
  /** Request path (e.g. /api/scans) */
  path: text("path").notNull(),
  /** HTTP status code of the response */
  statusCode: integer("status_code").notNull(),
  /** Short action description (e.g. "CREATE SCAN", "DELETE TOOL") */
  action: text("action").notNull(),
  /** IP address of the requesting client */
  ip: text("ip"),
  /** User-Agent header */
  userAgent: text("user_agent"),
  /** Duration of the request in milliseconds */
  durationMs: integer("duration_ms"),
  /** Optional metadata (JSON string, e.g. target URL, tool name) */
  metadata: text("metadata"),
  /** Immutable timestamp — set once on insert, never updated */
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable)
  .omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
