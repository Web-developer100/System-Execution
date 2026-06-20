// ---------------------------------------------------------------------------
// Intelligence Engine Singleton
// ---------------------------------------------------------------------------
//
// Provides the AI Intelligence Engine as a singleton that can be imported
// anywhere in the platform (routes, services, orchestrator).
//
// Initializes all 8 specialized sub-engines:
//   1. Correlation
//   2. False Positive Elimination
//   3. Vulnerability Understanding
//   4. Risk Scoring
//   5. Attack Chain Detection
//   6. Remediation
//   7. Scan Optimization
//   8. Learning

import { aiService } from "../ai-instance";
import { IntelligenceEngine } from "./engines/intelligence-engine";

export const intelligenceEngine = new IntelligenceEngine(aiService, {
  enableLearning: process.env["AI_ENABLE_LEARNING"] !== "false",
  enableAttackChains: process.env["AI_ENABLE_ATTACK_CHAINS"] !== "false",
  minConfidenceForConfirmed: Number(process.env["AI_CONFIDENCE_CONFIRMED"]) || 80,
  minConfidenceForHighConfidence: Number(process.env["AI_CONFIDENCE_HIGH"]) || 60,
  maxCorrelationDistance: Number(process.env["AI_CORRELATION_DISTANCE"]) || 3,
});
