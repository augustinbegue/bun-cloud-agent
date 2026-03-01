import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import type { SkillRegistry } from "../skills";
import type { SkillContext } from "../skills/types";
import type { ModelRouter } from "./model-router";

const TOOL_TRUTH_GUARDRAILS = `
You must be tool-truthful:
- Never claim a tool was run unless it was actually called in this response.
- Never claim an action was scheduled, saved, sent, or configured unless the corresponding tool call succeeded.
- If a field (such as a timestamp) is not present in tool output, do not invent it.
- When reporting feed checks, only summarize values from tool output (for example unseenCount, unseen items, errors).
- Suggestions are allowed, but phrase them as suggestions (e.g. "I can set up...") and do not present them as completed actions.
`;

function safeSerialize(value: unknown, maxChars: number): string {
  const seen = new WeakSet<object>();

  const replacer = (_key: string, current: unknown): unknown => {
    if (typeof current === "string") {
      return current;
    }

    if (Array.isArray(current)) {
      return current;
    }

    if (typeof current === "object" && current !== null) {
      const asRecord = current as Record<string, unknown>;
      if (seen.has(asRecord)) {
        return "[Circular]";
      }
      seen.add(asRecord);

      const redacted: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(asRecord)) {
        const lowerKey = k.toLowerCase();
        const shouldRedact =
          lowerKey.includes("password") ||
          lowerKey.includes("token") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("apikey") ||
          lowerKey.includes("api_key") ||
          lowerKey.includes("authorization");

        redacted[k] = shouldRedact ? "[REDACTED]" : v;
      }
      return redacted;
    }

    return current;
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(value, replacer);
  } catch {
    serialized = String(value);
  }

  if (!serialized) {
    return "null";
  }

  if (serialized.length <= maxChars) {
    return serialized;
  }

  return `${serialized.slice(0, maxChars)}… [truncated ${serialized.length - maxChars} chars]`;
}

function withToolLogging(tools: ToolSet, enabled: boolean, maxChars: number): ToolSet {
  if (!enabled) {
    return tools;
  }

  const wrapped: ToolSet = {};

  for (const [toolName, toolDefinition] of Object.entries(tools)) {
    const originalExecute = toolDefinition.execute;

    if (typeof originalExecute !== "function") {
      wrapped[toolName] = toolDefinition;
      continue;
    }

    wrapped[toolName] = {
      ...toolDefinition,
      execute: async (...args: unknown[]) => {
        const startedAt = Date.now();
        const input = args[0] ?? {};

        console.log(`[tool] ${toolName} -> start input=${safeSerialize(input, maxChars)}`);

        try {
          const output = await originalExecute(...args as Parameters<typeof originalExecute>);
          const elapsedMs = Date.now() - startedAt;

          console.log(
            `[tool] ${toolName} -> success durationMs=${elapsedMs} output=${safeSerialize(output, maxChars)}`
          );

          return output;
        } catch (error) {
          const elapsedMs = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : String(error);

          console.error(`[tool] ${toolName} -> error durationMs=${elapsedMs} message=${message}`);
          throw error;
        }
      },
    };
  }

  return wrapped;
}

export function createAgent(
  registry: SkillRegistry,
  ctx: SkillContext,
  router: ModelRouter,
  extraTools: ToolSet = {}
) {
  const skillTools = registry.resolve(ctx);
  const tools = withToolLogging(
    { ...skillTools, ...extraTools },
    ctx.config.toolLogging,
    ctx.config.toolLogMaxChars
  );

  return new ToolLoopAgent({
    model: router.get("default"),
    instructions: `${ctx.config.systemInstructions}\n\n${TOOL_TRUTH_GUARDRAILS}`,
    tools,
    stopWhen: stepCountIs(20),

    prepareStep: async ({ stepNumber }) => {
      // Escalate to stronger model after 10 steps (likely complex task)
      if (stepNumber > 10) {
        return { model: router.get("strong") };
      }
      return {};
    },

    onStepFinish: ({ stepNumber, usage }) => {
      console.log(
        `[agent] Step ${stepNumber} complete — tokens: ${usage.inputTokens ?? 0}+${usage.outputTokens ?? 0}`
      );
    },
  });
}

export type Agent = ReturnType<typeof createAgent>;
