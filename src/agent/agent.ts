import { ToolLoopAgent, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import type { SkillRegistry } from "../skills";
import type { SkillContext } from "../skills/types";
import type { ModelRouter } from "./model-router";

export function createAgent(
  registry: SkillRegistry,
  ctx: SkillContext,
  router: ModelRouter,
  extraTools: ToolSet = {}
) {
  const skillTools = registry.resolve(ctx);
  const tools = { ...skillTools, ...extraTools };

  return new ToolLoopAgent({
    model: router.get("default"),
    instructions: ctx.config.systemInstructions,
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
