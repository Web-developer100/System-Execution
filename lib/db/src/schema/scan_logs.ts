import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanLogsTable = pgTable("scan_logs", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull(),
  message: text("message").notNull(),
  level: text("level").notNull().default("info"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertScanLogSchema = createInsertSchema(scanLogsTable).omit({ id: true, timestamp: true });
export type InsertScanLog = z.infer<typeof insertScanLogSchema>;
export type ScanLog = typeof scanLogsTable.$inferSelect;
