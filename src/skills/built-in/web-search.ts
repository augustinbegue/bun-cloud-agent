import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";

export const webSearchSkill: Skill = () => ({
  web_search: tool({
    description: "Search the web using a query. Returns text content from search results.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
    }),
    execute: async ({ query, maxResults = 5 }) => {
      // Uses DuckDuckGo HTML search (no API key needed)
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; bun-cloud-agent/1.0; +https://github.com)",
          },
        });
        const html = await res.text();

        // Extract result snippets from DDG HTML response
        const results: { title: string; snippet: string; url: string }[] = [];
        const resultRegex =
          /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
        let match: RegExpExecArray | null;
        while (
          (match = resultRegex.exec(html)) !== null &&
          results.length < maxResults
        ) {
          results.push({
            url: match[1]!.replace(/.*uddg=/, "").split("&")[0]!,
            title: match[2]!.replace(/<[^>]*>/g, "").trim(),
            snippet: match[3]!.replace(/<[^>]*>/g, "").trim(),
          });
        }

        return { results, count: results.length };
      } catch (error) {
        return {
          error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          results: [],
          count: 0,
        };
      }
    },
  }),

  fetch_url: tool({
    description: "Fetch the text content of a URL",
    inputSchema: z.object({
      url: z.string().url().describe("The URL to fetch"),
      maxLength: z
        .number()
        .optional()
        .describe("Maximum response length in characters (default: 10000)"),
    }),
    execute: async ({ url, maxLength = 10000 }) => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; bun-cloud-agent/1.0; +https://github.com)",
          },
          signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        // Strip HTML tags for readability
        const clean = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, maxLength);
        return { content: clean, url, truncated: text.length > maxLength };
      } catch (error) {
        return {
          error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
          url,
        };
      }
    },
  }),
});
