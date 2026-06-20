import type { AiServiceConfig, AiProvider, AiAnalysisResult, VulnerabilityAnalysisInput, CacheEntry } from "./types";
import { OpenAIProvider } from "./providers/openai.provider";
import { FallbackProvider } from "./providers/fallback.provider";
import { buildCacheKey } from "./prompts/validate-vulnerability";
import { logger } from "../lib/logger";

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AiServiceConfig = {
  primary: null,
  enableCache: true,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  rateLimitPerMinute: 30,
};

// ── AI Service ─────────────────────────────────────────────────────────────
//
// The AI Service orchestrates vulnerability analysis through a chain of
// providers with in-memory caching and rate limiting.
//
// Provider chain:
//   1. Cache (if enabled and hit)
//   2. Primary LLM provider (if configured and within rate limit)
//   3. Fallback provider (always available, rule-based)
//
// Philosophy: never report a vulnerability as confirmed without verification.
// The fallback provider deliberately returns low confidence.

export class AiService {
  private config: AiServiceConfig;
  private cache = new Map<string, CacheEntry>();
  private rateLimitTimestamps: number[] = [];
  private primaryProvider: AiProvider | null = null;
  private fallbackProvider: AiProvider;

  constructor(overrides?: Partial<AiServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...overrides };

    // Initialize primary provider from env vars if available
    this.primaryProvider = this.buildPrimaryProvider();

    // Always initialize fallback
    this.fallbackProvider = new FallbackProvider();

    logger.info({
      primaryProvider: this.primaryProvider?.name ?? "none",
      cache: this.config.enableCache,
      rateLimit: `${this.config.rateLimitPerMinute}/min`,
    }, "[AI] Service initialized");
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Analyze a vulnerability finding.
   * Returns an analysis result from cache, LLM, or fallback (in that order).
   */
  async analyze(input: VulnerabilityAnalysisInput): Promise<AiAnalysisResult> {
    // 1. Check cache
    if (this.config.enableCache) {
      const cached = this.checkCache(input);
      if (cached) return cached;
    }

    // 2. Try primary LLM provider
    if (this.primaryProvider && !this.isRateLimited()) {
      try {
        this.trackRateLimit();
        const result = await this.primaryProvider.analyze(input);
        if (this.config.enableCache) {
          this.setCache(input, result);
        }
        return result;
      } catch (err) {
        logger.error({ err, provider: this.primaryProvider.name }, "[AI] Primary provider failed, falling back");
      }
    }

    // 3. Fallback provider (rule-based)
    const result = await this.fallbackProvider.analyze(input);
    if (this.config.enableCache) {
      this.setCache(input, result);
    }
    return result;
  }

  /**
   * Analyze a batch of findings.
   * Returns results in the same order as the input array.
   */
  async analyzeBatch(inputs: VulnerabilityAnalysisInput[]): Promise<AiAnalysisResult[]> {
    // Process sequentially to avoid rate limit bursts
    const results: AiAnalysisResult[] = [];
    for (const input of inputs) {
      results.push(await this.analyze(input));
    }
    return results;
  }

  /** Get service status for health checks */
  getStatus(): { primaryAvailable: boolean; cacheSize: number; rateLimitRemaining: number } {
    return {
      primaryAvailable: this.primaryProvider !== null,
      cacheSize: this.cache.size,
      rateLimitRemaining: Math.max(0, this.config.rateLimitPerMinute - this.rateLimitTimestamps.length),
    };
  }

  /** Clear the analysis cache */
  clearCache(): void {
    this.cache.clear();
    logger.info("[AI] Cache cleared");
  }

  // ── Cache ────────────────────────────────────────────────────────────────

  private checkCache(input: VulnerabilityAnalysisInput): AiAnalysisResult | null {
    const key = buildCacheKey(input);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.cachedAt;
    if (age > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hitCount++;
    logger.debug({ key: key.slice(0, 60), age, hits: entry.hitCount }, "[AI] Cache hit");
    return entry.result;
  }

  private setCache(input: VulnerabilityAnalysisInput, result: AiAnalysisResult): void {
    const key = buildCacheKey(input);
    this.cache.set(key, {
      result,
      cachedAt: Date.now(),
      hitCount: 0,
    });

    // Evict oldest entries if cache exceeds 10,000 items
    if (this.cache.size > 10_000) {
      const oldest = this.cache.entries().next();
      if (oldest.value) {
        this.cache.delete(oldest.value[0]);
      }
    }
  }

  // ── Rate limiting ────────────────────────────────────────────────────────

  private isRateLimited(): boolean {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute
    // Remove timestamps older than the window
    this.rateLimitTimestamps = this.rateLimitTimestamps.filter((t) => now - t < windowMs);
    return this.rateLimitTimestamps.length >= this.config.rateLimitPerMinute;
  }

  private trackRateLimit(): void {
    this.rateLimitTimestamps.push(Date.now());
  }

  // ── Provider initialization ──────────────────────────────────────────────

  private buildPrimaryProvider(): AiProvider | null {
    const apiKey = process.env["AI_API_KEY"];
    const baseUrl = process.env["AI_API_URL"] ?? "https://api.openai.com/v1";
    const model = process.env["AI_MODEL"] ?? "gpt-4o-mini";

    if (!apiKey) {
      logger.warn("[AI] No AI_API_KEY configured — LLM analysis unavailable, using fallback only");
      return null;
    }

    return new OpenAIProvider({
      name: "openai",
      apiKey,
      model,
      baseUrl,
      maxTokens: 1024,
      temperature: 0.1,
      timeoutMs: 30_000,
    });
  }
}
