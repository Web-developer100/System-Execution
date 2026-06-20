// ---------------------------------------------------------------------------
// AI Service Types — Expanded for Full Intelligence Layer
// ---------------------------------------------------------------------------

/** Result of AI-powered vulnerability analysis */
export interface AiAnalysisResult {
  /** Whether the finding was classified as a true positive */
  isTruePositive: boolean;
  /** Confidence score 0–1 */
  confidence: number;
  /** CVSS v4 score 0–10 */
  cvssScore: number | null;
  /** CWE identifiers matched */
  cweIds: string[];
  /** MITRE ATT&CK technique IDs */
  mitreIds: string[];
  /** Human-readable analysis text */
  analysis: string;
  /** Suggested remediation steps */
  remediation: string;
  /** Whether this analysis came from an LLM or fallback */
  source: "llm" | "cached" | "fallback";
  /** Provider that generated the analysis */
  provider: string;
}

/** Input for AI vulnerability analysis */
export interface VulnerabilityAnalysisInput {
  title: string;
  severity: string;
  description: string | null;
  evidence: string | null;
  url: string;
  toolName: string;
  templateId: string | null;
  cveIds: string[];
  cweIds: string[];
  scanTarget: string;
}

/** Configuration for an AI provider */
export interface AiProviderConfig {
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

/** AI Provider interface — implemented by OpenAI, Anthropic, fallback */
export interface AiProvider {
  readonly name: string;
  analyze(input: VulnerabilityAnalysisInput): Promise<AiAnalysisResult>;
}

/** Cache entry for AI analysis */
export interface CacheEntry {
  result: AiAnalysisResult;
  cachedAt: number;
  hitCount: number;
}

/** Overall AI service configuration */
export interface AiServiceConfig {
  /** Primary LLM provider config (null = use fallback only) */
  primary: AiProviderConfig | null;
  /** Whether to cache results (default: true) */
  enableCache: boolean;
  /** Cache TTL in ms (default: 24 hours) */
  cacheTtlMs: number;
  /** Rate limit: max requests per minute (default: 30) */
  rateLimitPerMinute: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE ENGINE TYPES
// ─────────────────────────────────────────────────────────────────────────────

// ── Result Correlation Engine ──────────────────────────────────────────────

export interface CorrelationInput {
  scanId: number;
  findings: CorrelatedFinding[];
}

export interface CorrelatedFinding {
  id?: number;
  /** Internal index used during correlation processing */
  _index?: number;
  /** Normalized URL for matching */
  _normalizedUrl?: string;
  /** Detected vulnerability type */
  _vulnType?: string;
  /** Correlation key */
  _key?: string;
  title: string;
  severity: string;
  url: string;
  description: string | null;
  evidence: string | null;
  toolName: string;
  templateId: string | null;
  cveIds: string[];
  cweIds: string[];
  rawOutput: string | null;
  confidence?: number;
}

export interface CorrelationResult {
  /** Deduplicated, merged findings */
  mergedFindings: MergedFinding[];
  /** Findings that were merged into others (can be archived) */
  mergedAway: number[];
  /** Correlation statistics */
  stats: CorrelationStats;
}

export interface MergedFinding {
  /** Original IDs of findings that were merged into this one */
  sourceFindingIds: number[];
  /** Tools that reported this finding */
  sourceTools: string[];
  /** Canonical title (picked from best source) */
  title: string;
  /** Highest severity among sources */
  severity: string;
  /** URL / endpoint */
  url: string;
  /** Merged description (multi-tool evidence) */
  description: string;
  /** Consolidated evidence */
  evidence: string;
  /** All CVE IDs across sources */
  cveIds: string[];
  /** All CWE IDs across sources */
  cweIds: string[];
  /** How many tools confirmed this */
  toolCount: number;
  /** Correlation confidence 0-100 */
  confidence: number;
}

export interface CorrelationStats {
  totalInput: number;
  totalMerged: number;
  uniqueFindings: number;
  deduplicationRatio: number;
  averageToolsPerFinding: number;
}

// ── False Positive Elimination Engine ──────────────────────────────────────

export type FpClassification =
  | "confirmed"
  | "high_confidence"
  | "needs_verification"
  | "false_positive";

export interface FpAnalysisInput {
  findingId: number;
  title: string;
  severity: string;
  description: string | null;
  evidence: string | null;
  url: string;
  toolName: string;
  toolConfidence: number;
  cveIds: string[];
  cweIds: string[];
  allFindingsForScan: CorrelatedFinding[];
}

export interface FpAnalysisResult {
  classification: FpClassification;
  confidence: number; // 0-100
  rationale: string;
  /** Whether the finding has HTTP evidence that can be re-checked */
  hasRecheckableEvidence: boolean;
  /** Suggested HTTP re-test payloads */
  suggestedRetestPayloads?: string[];
  /** Tool recommendations for cross-validation */
  recommendedTools?: string[];
}

// ── Vulnerability Understanding Engine ─────────────────────────────────────

export interface VulnerabilityUnderstanding {
  technicalExplanation: string;
  rootCause: string;
  attackVector: string;
  exploitabilityLevel: "low" | "medium" | "high" | "very_high";
  realWorldImpact: string;
  businessImpact: string;
  attackComplexity: "low" | "medium" | "high";
  preconditions: string[];
  affectedComponents: string[];
  attackPrerequisites: string[];
  exploitationScenarios: string[];
}

// ── Risk Scoring Engine ────────────────────────────────────────────────────

export interface RiskScoreInput {
  title: string;
  description: string | null;
  severity: string;
  evidence: string | null;
  url: string;
  cveIds: string[];
  cweIds: string[];
  toolConfidence: number;
  httpMethod?: string;
  httpStatusCode?: number;
  authRequired?: boolean;
  sensitiveDataExposed?: boolean;
}

export interface RiskScoreResult {
  // CVSS scores
  cvssV3Score: number | null;
  cvssV3Severity: "none" | "low" | "medium" | "high" | "critical" | null;
  cvssV3Vector: string | null;
  cvssV4Score: number | null;
  cvssV4Severity: "none" | "low" | "medium" | "high" | "critical" | null;
  cvssV4Vector: string | null;

  // EPSS
  epssProbability: number | null;

  // CWE
  cweIds: string[];
  capecIds: string[];

  // MITRE ATT&CK
  mitreTechniqueIds: string[];
  mitreTacticIds: string[];

  // Aggregate
  finalScore: number; // 0-10
  finalSeverity: "critical" | "high" | "medium" | "low" | "info";
  exploitProbability: number; // 0-100

  // Exploit Intelligence
  hasPublicExploit: boolean;
  hasMetasploitModule: boolean;
  exploitSources: string[];
}

// ── Attack Chain Detection ─────────────────────────────────────────────────

export interface AttackChainInput {
  scanId: number;
  findings: CorrelatedFinding[];
  allAnalyses: Array<{
    findingId: number;
    title: string;
    severity: string;
    url: string;
    classification: FpClassification;
    confidence: number;
  }>;
}

export interface AttackChainNode {
  id: string;
  label: string;
  type: "vulnerability" | "condition" | "asset" | "action";
  severity: string;
  vulnerabilityId: number;
}

export interface AttackChainEdge {
  source: string;
  target: string;
  label: string;
  type: "exploits" | "enables" | "requires" | "leads_to";
}

export interface AttackChainResult {
  chains: DetectedChain[];
  graph: {
    nodes: AttackChainNode[];
    edges: AttackChainEdge[];
  };
}

export interface DetectedChain {
  id: number;
  name: string;
  description: string;
  chainType: "xss_hijack" | "sqli_extract" | "ssrf_cloud" | "privilege_escalation" | "data_exfiltration" | "custom";
  riskScore: number; // 0-100
  steps: ChainStep[];
  entryVulnerabilityId: number;
  exitVulnerabilityId: number;
  mitigations: string[];
}

export interface ChainStep {
  order: number;
  vulnerabilityId: number;
  vulnerabilityTitle: string;
  stepType: string;
  description: string;
  exploitCondition: string;
  successProbability: number;
}

// ── Remediation Engine ─────────────────────────────────────────────────────

export type SupportedLanguage =
  | "php" | "laravel"
  | "python" | "django" | "flask"
  | "node.js" | "express"
  | "java" | "spring-boot"
  | "c#" | "asp.net"
  | "go"
  | "ruby-on-rails"
  | "javascript" | "typescript"
  | "generic";

export interface RemediationInput {
  vulnerabilityType: string;
  title: string;
  description: string | null;
  evidence: string | null;
  url: string;
  severity: string;
  language: SupportedLanguage;
  framework?: string;
  cweIds: string[];
  cveIds: string[];
}

export interface RemediationResult {
  summary: string;
  codePatch: string | null;
  beforeCode: string | null;
  afterCode: string | null;
  language: SupportedLanguage;
  configurationFix: string | null;
  wafRule: string | null;
  securityHeader: string | null;
  inputValidationRule: string | null;
  bestPractices: string[];
}

// ── Scan Optimization Engine ───────────────────────────────────────────────

export interface ScanOptimizationInput {
  target: string;
  requestedTools: string[];
  toolMetadata: ToolOptimizationMetadata[];
  scanHistory: ScanHistoryEntry[];
}

export interface ToolOptimizationMetadata {
  name: string;
  category: string;
  capabilities: string[];
  averageDurationMs: number;
  averageAccuracy: number;
  falsePositiveRate: number;
  redundancyScore: number;
  healthScore: number;
}

export interface ScanHistoryEntry {
  toolName: string;
  findingsCount: number;
  falsePositiveCount: number;
  durationMs: number;
  exitCode: number | null;
}

export interface ScanOptimizationResult {
  recommendedTools: string[];
  removedTools: string[];
  prioritizedEndpoints: string[];
  estimatedDurationMs: number;
  optimizationRationale: string;
  toolsToRunInParallel: string[][];
  wafAvoidanceStrategies: string[];
}

// ── Learning Engine ────────────────────────────────────────────────────────

export interface LearningFeedbackInput {
  scanId: number;
  toolName: string;
  findingsCount: number;
  falsePositiveCount: number;
  confirmedCount: number;
  averageAccuracy: number;
  averageConfidence: number;
  durationMs: number;
  exitCode: number | null;
  exitSignal: string | null;
}

export interface LearningEngineSnapshot {
  totalScansAnalyzed: number;
  toolAccuracyRanking: Array<{ toolName: string; accuracy: number }>;
  toolNoiseRanking: Array<{ toolName: string; fpRate: number }>;
  topFalsePositivePatterns: Array<{ pattern: string; count: number }>;
  effectiveScanPaths: Array<{ tools: string[]; successRate: number }>;
  recommendations: string[];
}

// ── Intelligence Engine Config ─────────────────────────────────────────────

export interface IntelligenceEngineConfig {
  maxCorrelationDistance: number;
  enableLearning: boolean;
  enableAttackChains: boolean;
  minConfidenceForConfirmed: number;
  minConfidenceForHighConfidence: number;
}
