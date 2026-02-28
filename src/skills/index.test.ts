import { describe, it, expect, beforeEach } from "bun:test";
import { SkillRegistry } from "./index";
import { tool } from "ai";
import { z } from "zod";
import type { SkillDefinition } from "./types";

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it("starts empty", () => {
    expect(registry.list()).toHaveLength(0);
  });

  it("registers a skill and lists it", () => {
    const def: SkillDefinition = {
      name: "test-skill",
      description: "A test skill",
      version: "1.0.0",
      skill: () => ({}),
    };
    registry.register(def);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]!.name).toBe("test-skill");
  });

  it("overwrites existing skill with same name", () => {
    const def1: SkillDefinition = {
      name: "dupe",
      description: "first",
      version: "1.0.0",
      skill: () => ({}),
    };
    const def2: SkillDefinition = {
      name: "dupe",
      description: "second",
      version: "2.0.0",
      skill: () => ({}),
    };
    registry.register(def1);
    registry.register(def2);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]!.version).toBe("2.0.0");
  });

  it("resolve merges tools from all skills", () => {
    const toolA = tool({ description: "A", inputSchema: z.object({}), execute: async () => "a" });
    const toolB = tool({ description: "B", inputSchema: z.object({}), execute: async () => "b" });

    registry.register({
      name: "skill-a",
      description: "",
      version: "1.0.0",
      skill: () => ({ tool_a: toolA }),
    });
    registry.register({
      name: "skill-b",
      description: "",
      version: "1.0.0",
      skill: () => ({ tool_b: toolB }),
    });

    // @ts-expect-error - SkillContext not needed for these no-op skills
    const tools = registry.resolve({});
    expect(Object.keys(tools)).toContain("tool_a");
    expect(Object.keys(tools)).toContain("tool_b");
  });

  it("resolve passes context to each skill factory", () => {
    const capturedContexts: unknown[] = [];
    registry.register({
      name: "ctx-skill",
      description: "",
      version: "1.0.0",
      skill: (ctx) => {
        capturedContexts.push(ctx);
        return {};
      },
    });

    const fakeCtx = { db: {} as never, config: {} as never };
    registry.resolve(fakeCtx);
    expect(capturedContexts).toHaveLength(1);
    expect(capturedContexts[0]).toBe(fakeCtx);
  });
});
