export { AiService } from "./ai-service";
export { IntelligenceEngine } from "./engines/intelligence-engine";
export { intelligenceEngine } from "./intelligence-instance";
export type { AiAnalysisResult, VulnerabilityAnalysisInput, AiServiceConfig, AiProviderConfig } from "./types";
export type {
  CorrelationInput,
  CorrelationResult,
  MergedFinding,
  CorrelationStats,
  FpAnalysisInput,
  FpAnalysisResult,
  FpClassification,
  VulnerabilityUnderstanding,
  RiskScoreInput,
  RiskScoreResult,
  AttackChainInput,
  AttackChainResult,
  DetectedChain,
  AttackChainNode,
  AttackChainEdge,
  RemediationInput,
  RemediationResult,
  SupportedLanguage,
  ScanOptimizationInput,
  ScanOptimizationResult,
  LearningFeedbackInput,
  LearningEngineSnapshot,
  CorrelatedFinding,
} from "./types";
