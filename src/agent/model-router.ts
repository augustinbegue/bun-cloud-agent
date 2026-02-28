import { createProviderRegistry } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createMistral } from "@ai-sdk/mistral";
import { createCohere } from "@ai-sdk/cohere";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createCerebras } from "@ai-sdk/cerebras";
import { createFireworks } from "@ai-sdk/fireworks";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createPerplexity } from "@ai-sdk/perplexity";
import type { AgentConfig } from "../config";

export type ModelTier = "fast" | "default" | "strong";

/**
 * All supported provider keys.
 *
 * Model tiers use the `provider:model` format — e.g. `openai:gpt-4o`,
 * `anthropic:claude-sonnet-4-20250514`, `ollama:llama3.1:8b`.
 *
 * Provider-specific credentials are read from standard env vars:
 *
 * | Provider     | Env var(s)                                                        |
 * |--------------|-------------------------------------------------------------------|
 * | ollama       | OLLAMA_BASE_URL (default http://localhost:11434/v1)               |
 * | openai       | OPENAI_API_KEY                                                    |
 * | anthropic    | ANTHROPIC_API_KEY                                                 |
 * | google       | GOOGLE_GENERATIVE_AI_API_KEY                                      |
 * | vertex       | GOOGLE_VERTEX_API_KEY, GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION |
 * | mistral      | MISTRAL_API_KEY                                                   |
 * | cohere       | COHERE_API_KEY                                                    |
 * | bedrock      | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION              |
 * | azure        | AZURE_API_KEY, AZURE_RESOURCE_NAME                                |
 * | xai          | XAI_API_KEY                                                       |
 * | groq         | GROQ_API_KEY                                                      |
 * | deepseek     | DEEPSEEK_API_KEY                                                  |
 * | cerebras     | CEREBRAS_API_KEY                                                  |
 * | fireworks    | FIREWORKS_API_KEY                                                 |
 * | togetherai   | TOGETHER_AI_API_KEY                                               |
 * | perplexity   | PERPLEXITY_API_KEY                                                |
 */
export function createModelRouter(config: AgentConfig) {
  const registry = createProviderRegistry({
    // Ollama — OpenAI-compatible local inference
    ollama: createOpenAI({
      baseURL: config.ollamaBaseUrl,
      apiKey: "ollama",
    }),

    // Cloud / hosted providers — auto-configure from env vars
    openai: createOpenAI(),
    anthropic: createAnthropic(),
    google: createGoogleGenerativeAI(),
    vertex: createVertex(),
    mistral: createMistral(),
    cohere: createCohere(),
    bedrock: createAmazonBedrock(),
    azure: createAzure(),
    xai: createXai(),
    groq: createGroq(),
    deepseek: createDeepSeek(),
    cerebras: createCerebras(),
    fireworks: createFireworks(),
    togetherai: createTogetherAI(),
    perplexity: createPerplexity(),
  });

  type ModelId = Parameters<typeof registry.languageModel>[0];

  return {
    /** Get the language model for a tier (fast / default / strong). */
    get(tier: ModelTier) {
      switch (tier) {
        case "fast":
          return registry.languageModel(config.modelFast as ModelId);
        case "default":
          return registry.languageModel(config.modelDefault as ModelId);
        case "strong":
          return registry.languageModel(config.modelStrong as ModelId);
      }
    },

    /** Resolve an arbitrary `provider:model` string to a language model. */
    resolve(modelId: string) {
      return registry.languageModel(modelId as ModelId);
    },

    /** Check if the Ollama endpoint is reachable. */
    async healthCheck(): Promise<boolean> {
      try {
        const res = await fetch(`${config.ollamaBaseUrl}/models`, {
          signal: AbortSignal.timeout(3000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

export type ModelRouter = ReturnType<typeof createModelRouter>;
