import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";
import { saveMemory, recallMemories, deleteMemory, listMemories } from "../../state/memory";

export const memorySkill: Skill = (ctx) => ({
  save_memory: tool({
    description: "Save a piece of information to long-term memory for future reference",
    inputSchema: z.object({
      key: z.string().describe("A short label for this memory"),
      content: z.string().describe("The information to remember"),
    }),
    execute: async ({ key, content }) => {
      saveMemory(ctx.db, key, content);
      return { saved: true, key };
    },
  }),

  recall_memory: tool({
    description: "Search long-term memory for relevant information",
    inputSchema: z.object({
      query: z.string().describe("What to search for"),
    }),
    execute: async ({ query }) => {
      const results = recallMemories(ctx.db, query);
      return { results, count: results.length };
    },
  }),

  list_memories: tool({
    description: "List all saved memories",
    inputSchema: z.object({}),
    execute: async () => {
      const results = listMemories(ctx.db);
      return { results, count: results.length };
    },
  }),

  delete_memory: tool({
    description: "Delete a specific memory by key",
    inputSchema: z.object({
      key: z.string().describe("The key of the memory to delete"),
    }),
    execute: async ({ key }) => {
      deleteMemory(ctx.db, key);
      return { deleted: true, key };
    },
  }),
});
