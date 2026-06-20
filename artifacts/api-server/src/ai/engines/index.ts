// ── AI Intelligence Engine Exports ─────────────────────────────────────────

export { IntelligenceEngine } from "./intelligence-engine";
export { CorrelationEngine } from "./correlation.engine";
export { FalsePositiveEngine } from "./false-positive.engine";
export { VulnerabilityUnderstandingEngine } from "./vulnerability-understanding.engine";
export { RiskScoringEngine } from "./risk-scoring.engine";
export { AttackChainEngine } from "./attack-chain.engine";
export { RemediationEngine } from "./remediation.engine";
export { ScanOptimizationEngine } from "./scan-optimization.engine";
export { LearningEngine } from "./learning.engine";

export type {
  IntelligenceScanReport,
  CorrelatedFindingAnalysis,
} from "./intelligence-engine";
export type { IntelligenceEngineConfig } from "../types";
