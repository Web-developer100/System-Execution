import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiAnalysesTable = pgTable("ai_analyses", {
  id: serial("id").primaryKey(),
  vulnerabilityId: integer("vulnerability_id").notNull(),
  scanId: integer("scan_id").notNull(),

  // Classification
  classification: text("classification").notNull().default("needs_verification"), // confirmed | high_confidence | needs_verification | false_positive
  confidence: integer("confidence").notNull().default(0), // 0-100

  // CVSS v3.1 / v4.0 Scoring
  cvssVersion: text("cvss_version").default("4.0"),
  cvssScore: text("cvss_score"),             // e.g. "8.2"
  cvssVector: text("cvss_vector"),            // e.g. "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/..."
  cvssSeverity: text("cvss_severity"),        // none | low | medium | high | critical
  epssProbability: text("epss_probability"),  // EPSS score e.g. "0.0423"

  // CWE / CAPEC / MITRE ATT&CK
  cweIds: jsonb("cwe_ids").$type<string[]>().default([]),
  capecIds: jsonb("capec_ids").$type<string[]>().default([]),
  mitreTechniqueIds: jsonb("mitre_technique_ids").$type<string[]>().default([]),
  mitreTacticIds: jsonb("mitre_tactic_ids").$type<string[]>().default([]),

  // Vulnerability Understanding
  rootCause: text("root_cause"),
  attackVector: text("attack_vector"),
  exploitabilityLevel: text("exploitability_level"), // low | medium | high | very_high
  realWorldImpact: text("real_world_impact"),
  businessImpact: text("business_impact"),
  attackComplexity: text("attack_complexity"),       // low | medium | high
  preconditions: text("preconditions"),
  exploitProbability: integer("exploit_probability"), // 0-100

  // Remediation
  remediationSummary: text("remediation_summary"),
  remediationCodePatch: text("remediation_code_patch"),
  remediationLanguage: text("remediation_language"),
  remediationConfig: text("remediation_config"),
  remediationWafRule: text("remediation_waf_rule"),
  remediationBeforeCode: text("remediation_before_code"),
  remediationAfterCode: text("remediation_after_code"),

  // Attack Chain
  attackChainId: integer("attack_chain_id"),
  attackChainStep: integer("attack_chain_step"),

  // Evidence / Verification
  verificationStatus: text("verification_status").default("unverified"), // unverified | verified | recreated | failed
  verificationMethod: text("verification_method"),
  pocRequest: text("poc_request"),
  pocResponse: text("poc_response"),
  crossToolValidated: boolean("cross_tool_validated").default(false),
  crossToolCount: integer("cross_tool_count").default(0),

  // Multi-tool Correlation
  correlatedToolCount: integer("correlated_tool_count").default(0),
  correlatedToolNames: jsonb("correlated_tool_names").$type<string[]>().default([]),

  // Metadata
  analysisProvider: text("analysis_provider").default("ai-engine"),
  analysisDurationMs: integer("analysis_duration_ms"),
  isLearningFeedback: boolean("is_learning_feedback").default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiAnalysisSchema = createInsertSchema(aiAnalysesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiAnalysis = z.infer<typeof insertAiAnalysisSchema>;
export type AiAnalysis = typeof aiAnalysesTable.$inferSelect;
