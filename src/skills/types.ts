import type { ToolSet } from "ai";
import type { Database } from "bun:sqlite";
import type { AgentConfig } from "../config";

export interface SkillContext {
  db: Database;
  config: AgentConfig;
}

/** A Skill is a factory that receives context and returns AI SDK tools */
export type Skill = (ctx: SkillContext) => ToolSet;

/** Metadata for a registered skill */
export interface SkillDefinition {
  name: string;
  description: string;
  version: string;
  skill: Skill;
}
