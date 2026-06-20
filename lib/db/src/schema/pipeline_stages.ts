import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull(),

  // Stage Info
  stageNumber: integer("stage_number").notNull(), // 1-11
  stageName: text("stage_name").notNull(),         // reconnaissance | asset_discovery | fingerprinting | crawling | enumeration | passive_scan | active_scan | deep_scan | verification | ai_analysis | report_generation
  phase: integer("phase").default(0),              // parallel execution group

  // Execution Status
  status: text("status").notNull().default("pending"), // pending | running | completed | failed | skipped
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),

  // Tools Executed in this Stage
  toolsExecuted: jsonb("tools_executed").$type<Array<{
    toolName: string;
    status: string;
    durationMs: number;
    findingsCount: number;
    exitCode: number | null;
  }>>().default([]),

  // Results Summary
  findingsCount: integer("findings_count").default(0),
  toolsCount: integer("tools_count").default(0),

  // Error Recovery
  error: text("error"),
  retryCount: integer("retry_count").default(0),
  isFallback: boolean("is_fallback").default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({ id: true, createdAt: true });
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;
export type PipelineStage = typeof pipelineStagesTable.$inferSelect;
