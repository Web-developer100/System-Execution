import { AiService } from "./ai";

// ── AI Service Singleton ───────────────────────────────────────────────────
//
// Initialized from environment variables:
//   AI_API_KEY        — OpenAI-compatible API key
//   AI_API_URL        — Base URL (default: https://api.openai.com/v1)
//   AI_MODEL          — Model name (default: gpt-4o-mini)
//   AI_CACHE_ENABLED  — Set to \"false\" to disable caching

export const aiService = new AiService({
  enableCache: process.env["AI_CACHE_ENABLED"] !== "false",
});
