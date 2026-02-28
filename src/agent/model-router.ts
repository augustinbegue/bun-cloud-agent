import { createOpenAI } from "@ai-sdk/openai";
import type { AgentConfig } from "../config";

export type ModelTier = "fast" | "default" | "strong";

export function createModelRouter(config: AgentConfig) {
  const localProvider = createOpenAI({
    baseURL: config.localModelUrl,
    apiKey: "ollama", // local providers typically don't need a real key
  });

  const cloudProvider = createOpenAI({
    baseURL: config.cloudModelUrl,
    apiKey: config.cloudApiKey,
  });

  return {
    get(tier: ModelTier) {
      switch (tier) {
        case "fast":
          return localProvider(config.localModelFast);
        case "default":
          return localProvider(config.localModelDefault);
        case "strong":
          return cloudProvider(config.cloudModelStrong);
      }
    },

    /** Check if local model is reachable */
    async healthCheck(): Promise<boolean> {
      try {
        const res = await fetch(`${config.localModelUrl}/models`, {
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
