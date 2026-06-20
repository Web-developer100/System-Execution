import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verificationResultsTable = pgTable("verification_results", {
  id: serial("id").primaryKey(),
  vulnerabilityId: integer("vulnerability_id").notNull(),
  scanId: integer("scan_id").notNull(),

  // Verification Status
  status: text("status").notNull().default("pending"), // pending | verified | not_reproducible | false_positive | error
  confidence: integer("confidence").default(0), // 0-100

  // Step 1 — Re-test
  retestPerformed: boolean("retest_performed").default(false),
  retestPayloads: jsonb("retest_payloads").$type<string[]>().default([]),
  retestRequest: text("retest_request"),
  retestResponse: text("retest_response"),
  retestStatusCode: integer("retest_status_code"),
  retestDurationMs: integer("retest_duration_ms"),
  retestMethod: text("retest_method"), // different_payload | different_encoding | different_params | custom

  // Step 2 — Cross-Tool Validation
  crossToolPerformed: boolean("cross_tool_performed").default(false),
  crossToolResults: jsonb("cross_tool_results").$type<Array<{
    toolName: string;
    confirmed: boolean;
    confidence: number;
    evidence: string;
  }>>().default([]),
  crossToolConfirmed: boolean("cross_tool_confirmed").default(false),
  crossToolCount: integer("cross_tool_count").default(0),

  // Step 3 — PoC Generation
  pocGenerated: boolean("poc_generated").default(false),
  pocPayload: text("poc_payload"),
  pocRequest: text("poc_request"),
  pocResponse: text("poc_response"),
  pocMinimalExploit: text("poc_minimal_exploit"),
  pocSafeValidationSteps: jsonb("poc_safe_validation_steps").$type<string[]>().default([]),
  pocReproducible: boolean("poc_reproducible").default(false),

  // Step 4 — Final Decision
  finalDecision: text("final_decision"), // confirmed | discarded | unverified
  decisionRationale: text("decision_rationale"),

  // Metadata
  verifiedBy: text("verified_by").default("ai-engine"), // ai-engine | manual | cross-tool
  totalVerificationDurationMs: integer("total_verification_duration_ms"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVerificationResultSchema = createInsertSchema(verificationResultsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
export type VerificationResult = typeof verificationResultsTable.$inferSelect;
