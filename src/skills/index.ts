import type { ToolSet } from "ai";
import type { SkillContext, SkillDefinition } from "./types";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register(definition: SkillDefinition): void {
    this.skills.set(definition.name, definition);
  }

  /** Resolve all registered skills into a flat ToolSet for the agent */
  resolve(ctx: SkillContext): ToolSet {
    const tools: ToolSet = {};
    for (const [, def] of this.skills) {
      Object.assign(tools, def.skill(ctx));
    }
    return tools;
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }
}
