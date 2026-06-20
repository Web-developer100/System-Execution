import type { AiProvider, AiProviderConfig, AiAnalysisResult, VulnerabilityAnalysisInput } from "../types";
import { buildSystemPrompt, buildUserPrompt } from "../prompts/validate-vulnerability";
import { logger } from "../../lib/logger";

// ── OpenAI-Compatible Provider ─────────────────────────────────────────────
//
// Supports any OpenAI-compatible API (OpenAI, Anthropic via API proxy,
// local models via Ollama/LM Studio, Azure OpenAI, etc.)

export class OpenAIProvider implements AiProvider {
  readonly name: string;
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.name = `openai:${config.model}`;
    this.config = config;
  }

  async analyze(input: VulnerabilityAnalysisInput): Promise<AiAnalysisResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input);

    const body = {
      model: this.config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      response_format: { type: "json_object" },
    };

    const startTime = Date.now();

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error({ status: response.status, error: errorText, model: this.config.model },
        "[AI] OpenAI API error");
      throw new Error(`OpenAI API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const json = await response.json() as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    // Log token usage for cost tracking
    if (json.usage) {
      logger.debug({
        model: this.config.model,
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        durationMs,
      }, "[AI] Token usage");
    }

    // Parse the JSON response from the LLM
    return this.parseResponse(content);
  }

  private parseResponse(raw: string): AiAnalysisResult {
    // Try to extract JSON from the response (handles edge cases where LLM adds commentary)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      logger.warn({ raw: raw.slice(0, 300) }, "[AI] Failed to parse LLM response as JSON");
      // Return a safe default
      return {
        isTruePositive: false,
        confidence: 0,
        cvssScore: null,
        cweIds: [],
        mitreIds: [],
        analysis: `AI analysis engine could not parse the LLM response. The raw response has been logged for debugging.`,
        remediation: "Manual review recommended — AI analysis failed to produce a structured result.",
        source: "llm",
        provider: this.name,
      };
    }

    return {
      isTruePositive: typeof parsed.isTruePositive === "boolean" ? parsed.isTruePositive : false,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      cvssScore: parsed.cvssScore != null ? Math.max(0, Math.min(10, Number(parsed.cvssScore))) : null,
      cweIds: Array.isArray(parsed.cweIds) ? parsed.cweIds.filter((c): c is string => typeof c === "string") : [],
      mitreIds: Array.isArray(parsed.mitreIds) ? parsed.mitreIds.filter((m): m is string => typeof m === "string") : [],
      analysis: typeof parsed.analysis === "string" ? parsed.analysis : "No analysis provided.",
      remediation: typeof parsed.remediation === "string" ? parsed.remediation : "No remediation provided.",
      source: "llm",
      provider: this.name,
    };
  }
}
