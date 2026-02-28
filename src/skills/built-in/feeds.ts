import { tool } from "ai";
import { z } from "zod";
import { randomUUIDv7 } from "bun";
import { XMLParser } from "fast-xml-parser";
import type { Skill } from "../types";
import {
  addFeedSource,
  getFeedSourceByUrl,
  listFeedSources,
  deleteFeedSource,
  updateFeedFetched,
  upsertFeedEntry,
  getUnseenEntries,
  markEntriesSeen,
} from "../../state/feeds";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export const feedSkill: Skill = (ctx) => ({
  add_feed: tool({
    description: "Register an RSS or Atom feed to monitor for new articles",
    inputSchema: z.object({
      url: z.string().url().describe("Feed URL (RSS or Atom)"),
      name: z.string().describe("Human-readable name for this feed"),
      category: z.string().optional().describe("Category tag (default: 'general')"),
    }),
    execute: async ({ url, name, category }) => {
      const existing = getFeedSourceByUrl(ctx.db, url);
      if (existing) {
        return { error: `Feed already registered as "${existing.name}" (${existing.id})` };
      }

      const id = randomUUIDv7();
      addFeedSource(ctx.db, id, url, name, category ?? "general");
      return { added: true, id, name, url, category: category ?? "general" };
    },
  }),

  list_feeds: tool({
    description: "List all registered RSS/Atom feeds",
    inputSchema: z.object({}),
    execute: async () => {
      const feeds = listFeedSources(ctx.db);
      return {
        feeds: feeds.map((f) => ({
          id: f.id,
          name: f.name,
          url: f.url,
          category: f.category,
          lastFetchedAt: f.last_fetched_at ? new Date(f.last_fetched_at).toISOString() : null,
        })),
        count: feeds.length,
      };
    },
  }),

  remove_feed: tool({
    description: "Unregister a feed and delete all its stored entries",
    inputSchema: z.object({
      id: z.string().describe("Feed ID to remove"),
    }),
    execute: async ({ id }) => {
      deleteFeedSource(ctx.db, id);
      return { removed: true, id };
    },
  }),

  fetch_feed: tool({
    description: "Fetch a single feed, parse new entries, and return unread articles. Entries are stored and deduplicated.",
    inputSchema: z.object({
      id: z.string().describe("Feed source ID to fetch"),
    }),
    execute: async ({ id }) => {
      const feeds = listFeedSources(ctx.db);
      const feed = feeds.find((f) => f.id === id);
      if (!feed) return { error: `Feed ${id} not found` };

      return fetchAndStoreFeed(ctx.db, feed.id, feed.url);
    },
  }),

  fetch_all_feeds: tool({
    description: "Fetch all registered feeds, parse new entries, and return unseen articles across all feeds",
    inputSchema: z.object({}),
    execute: async () => {
      const feeds = listFeedSources(ctx.db);
      if (feeds.length === 0) return { error: "No feeds registered. Use add_feed first." };

      let totalNew = 0;
      const errors: { feed: string; error: string }[] = [];

      for (const feed of feeds) {
        try {
          const result = await fetchAndStoreFeed(ctx.db, feed.id, feed.url);
          if ("newCount" in result) {
            totalNew += result.newCount as number;
          }
        } catch (err) {
          errors.push({
            feed: feed.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const unseen = getUnseenEntries(ctx.db);
      return {
        totalNew,
        unseen: unseen.slice(0, 50).map(formatEntry),
        unseenCount: unseen.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    },
  }),

  mark_entries_seen: tool({
    description: "Mark feed entries as seen/processed so they don't appear in future fetches",
    inputSchema: z.object({
      ids: z.array(z.string()).describe("Array of entry IDs to mark as seen"),
    }),
    execute: async ({ ids }) => {
      markEntriesSeen(ctx.db, ids);
      return { marked: ids.length };
    },
  }),
});

// --- Internal helpers ---

function formatEntry(e: { id: string; title: string; summary: string | null; url: string | null; published_at: number | null }) {
  return {
    id: e.id,
    title: e.title,
    summary: e.summary?.slice(0, 300) ?? null,
    url: e.url,
    publishedAt: e.published_at ? new Date(e.published_at).toISOString() : null,
  };
}

async function fetchAndStoreFeed(
  db: import("bun:sqlite").Database,
  feedId: string,
  feedUrl: string,
): Promise<Record<string, unknown>> {
  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; bun-cloud-agent/1.0; +https://github.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(15_000),
    });
    xml = await res.text();
  } catch (err) {
    return { error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    return { error: `XML parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const items = extractItems(parsed);
  let newCount = 0;
  let lastEntryId: string | null = null;

  for (const item of items) {
    const entryId = item.guid ?? item.link ?? item.title ?? randomUUIDv7();
    const isNew = upsertFeedEntry(
      db,
      randomUUIDv7(),
      feedId,
      String(entryId),
      String(item.title ?? "Untitled"),
      item.summary ? String(item.summary).slice(0, 2000) : null,
      item.link ? String(item.link) : null,
      item.published ? new Date(String(item.published)).getTime() || null : null,
    );
    if (isNew) {
      newCount++;
      if (!lastEntryId) lastEntryId = String(entryId);
    }
  }

  updateFeedFetched(db, feedId, lastEntryId);

  const unseen = getUnseenEntries(db, feedId);
  return {
    fetched: true,
    feedId,
    newCount,
    unseen: unseen.slice(0, 30).map(formatEntry),
    unseenCount: unseen.length,
  };
}

interface FeedItem {
  title?: string;
  link?: string;
  guid?: string;
  summary?: string;
  published?: string;
}

function extractItems(parsed: Record<string, unknown>): FeedItem[] {
  // RSS 2.0: rss.channel.item
  const rss = parsed.rss as Record<string, unknown> | undefined;
  if (rss) {
    const channel = rss.channel as Record<string, unknown> | undefined;
    if (channel) {
      const items = normalizeArray(channel.item);
      return items.map((item: Record<string, unknown>) => ({
        title: getString(item.title),
        link: getString(item.link),
        guid: getString(item.guid) ?? getString((item.guid as Record<string, unknown>)?.["#text"]),
        summary: getString(item.description),
        published: getString(item.pubDate),
      }));
    }
  }

  // Atom: feed.entry
  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (feed) {
    const entries = normalizeArray(feed.entry);
    return entries.map((entry: Record<string, unknown>) => {
      // Atom links can be objects with @_href
      const link = entry.link as Record<string, unknown> | string | undefined;
      let href: string | undefined;
      if (typeof link === "string") href = link;
      else if (Array.isArray(link)) {
        const alt = link.find((l: Record<string, unknown>) => l["@_rel"] === "alternate" || !l["@_rel"]);
        href = getString((alt as Record<string, unknown>)?.["@_href"]);
      } else if (link) {
        href = getString(link["@_href"]);
      }

      return {
        title: getString(entry.title),
        link: href,
        guid: getString(entry.id),
        summary: getString(entry.summary) ?? getString(entry.content),
        published: getString(entry.published) ?? getString(entry.updated),
      };
    });
  }

  // RDF / RSS 1.0: rdf:RDF.item
  const rdf = parsed["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rdf) {
    const items = normalizeArray(rdf.item);
    return items.map((item: Record<string, unknown>) => ({
      title: getString(item.title),
      link: getString(item.link),
      guid: getString(item["@_rdf:about"]),
      summary: getString(item.description),
      published: getString(item["dc:date"]),
    }));
  }

  return [];
}

function normalizeArray(val: unknown): Record<string, unknown>[] {
  if (Array.isArray(val)) return val as Record<string, unknown>[];
  if (val && typeof val === "object") return [val as Record<string, unknown>];
  return [];
}

function getString(val: unknown): string | undefined {
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return undefined;
}
