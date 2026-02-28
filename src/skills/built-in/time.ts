import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";

export const timeSkill: Skill = () => ({
  get_current_time: tool({
    description: "Get the current date and time",
    inputSchema: z.object({
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone (e.g. 'America/New_York'). Defaults to UTC."),
    }),
    execute: async ({ timezone }) => {
      const now = new Date();
      const tz = timezone ?? "UTC";
      try {
        return {
          iso: now.toISOString(),
          formatted: now.toLocaleString("en-US", { timeZone: tz }),
          timezone: tz,
          unix: now.getTime(),
        };
      } catch {
        return {
          iso: now.toISOString(),
          formatted: now.toLocaleString("en-US", { timeZone: "UTC" }),
          timezone: "UTC",
          unix: now.getTime(),
          error: `Invalid timezone '${timezone}', fell back to UTC`,
        };
      }
    },
  }),

  date_diff: tool({
    description: "Calculate the difference between two dates",
    inputSchema: z.object({
      from: z.string().describe("Start date (ISO 8601 or natural date string)"),
      to: z.string().describe("End date (ISO 8601 or natural date string)"),
    }),
    execute: async ({ from, to }) => {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const diffMs = toDate.getTime() - fromDate.getTime();
      const days = Math.floor(diffMs / 86_400_000);
      const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
      return { days, hours, minutes, totalMs: diffMs };
    },
  }),
});
