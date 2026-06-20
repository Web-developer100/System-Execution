import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const attackChainsTable = pgTable("attack_chains", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull(),

  // Chain Identification
  name: text("name").notNull(),
  description: text("description"),
  chainType: text("chain_type").notNull(), // xss_hijack | sqli_extract | ssrf_cloud | custom
  riskScore: integer("risk_score").default(0), // 0-100

  // Entry and Exit Points
  entryVulnerability: text("entry_vulnerability").notNull(),
  entryVulnerabilityId: integer("entry_vulnerability_id"),
  exitVulnerability: text("exit_vulnerability"),
  exitVulnerabilityId: integer("exit_vulnerability_id"),

  // Chain Steps (ordered list)
  steps: jsonb("steps").$type<Array<{
    order: number;
    vulnerabilityId: number;
    vulnerabilityTitle: string;
    stepType: string;            // initial_access | privilege_escalation | lateral_movement | data_exfil | rce
    description: string;
    exploitCondition: string;
    successProbability: number;  // 0-100
  }>>().default([]),

  // Visualization Data
  visualizationData: jsonb("visualization_data").$type<{
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      severity: string;
    }>;
    edges: Array<{
      source: string;
      target: string;
      label: string;
    }>;
  }>(),

  // Attack Path Metrics
  totalSteps: integer("total_steps").default(0),
  attackComplexity: text("attack_complexity").default("medium"), // low | medium | high
  prerequisites: jsonb("prerequisites").$type<string[]>().default([]),
  mitigations: jsonb("mitigations").$type<string[]>().default([]),

  // Status
  status: text("status").default("detected"), // detected | blocked | remediated | verified

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttackChainSchema = createInsertSchema(attackChainsTable).omit({ id: true, createdAt: true });
export type InsertAttackChain = z.infer<typeof insertAttackChainSchema>;
export type AttackChain = typeof attackChainsTable.$inferSelect;
