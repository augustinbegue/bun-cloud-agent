import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "./db";
import {
  addFeedSource,
  getFeedSource,
  getFeedSourceByUrl,
  listFeedSources,
  deleteFeedSource,
  updateFeedFetched,
  upsertFeedEntry,
  getUnseenEntries,
  markEntriesSeen,
  listFeedEntries,
} from "./feeds";
import type { Database } from "bun:sqlite";

describe("Feeds", () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("Feed sources", () => {
    it("adds and retrieves a feed source", () => {
      addFeedSource(db, "f1", "https://example.com/rss", "Example Blog", "tech");
      const feed = getFeedSource(db, "f1");
      expect(feed).not.toBeNull();
      expect(feed!.name).toBe("Example Blog");
      expect(feed!.url).toBe("https://example.com/rss");
      expect(feed!.category).toBe("tech");
      expect(feed!.last_fetched_at).toBeNull();
    });

    it("retrieves by URL", () => {
      addFeedSource(db, "f1", "https://example.com/rss", "Example", "tech");
      const feed = getFeedSourceByUrl(db, "https://example.com/rss");
      expect(feed).not.toBeNull();
      expect(feed!.id).toBe("f1");
    });

    it("returns null for missing feed", () => {
      expect(getFeedSource(db, "missing")).toBeNull();
    });

    it("lists feeds sorted by name", () => {
      addFeedSource(db, "f1", "https://b.com/rss", "Beta Blog");
      addFeedSource(db, "f2", "https://a.com/rss", "Alpha Blog");
      const list = listFeedSources(db);
      expect(list).toHaveLength(2);
      expect(list[0]!.name).toBe("Alpha Blog");
    });

    it("deletes a feed source and cascades entries", () => {
      addFeedSource(db, "f1", "https://example.com/rss", "Example");
      upsertFeedEntry(db, "e1", "f1", "guid1", "Title", null, null, null);
      deleteFeedSource(db, "f1");
      expect(getFeedSource(db, "f1")).toBeNull();
      expect(listFeedEntries(db, "f1")).toHaveLength(0);
    });

    it("updates last fetched timestamp", () => {
      addFeedSource(db, "f1", "https://example.com/rss", "Example");
      updateFeedFetched(db, "f1", "guid-42");
      const feed = getFeedSource(db, "f1");
      expect(feed!.last_fetched_at).toBeGreaterThan(0);
      expect(feed!.last_entry_id).toBe("guid-42");
    });

    it("rejects duplicate URLs", () => {
      addFeedSource(db, "f1", "https://example.com/rss", "First");
      expect(() => addFeedSource(db, "f2", "https://example.com/rss", "Second")).toThrow();
    });
  });

  describe("Feed entries", () => {
    beforeEach(() => {
      addFeedSource(db, "f1", "https://example.com/rss", "Example");
    });

    it("inserts a new entry and returns true", () => {
      const isNew = upsertFeedEntry(db, "e1", "f1", "guid1", "Article One", "Summary", "https://example.com/1", Date.now());
      expect(isNew).toBe(true);
    });

    it("returns false for duplicate entry_id within same feed", () => {
      upsertFeedEntry(db, "e1", "f1", "guid1", "Article", null, null, null);
      const isNew = upsertFeedEntry(db, "e2", "f1", "guid1", "Article Dup", null, null, null);
      expect(isNew).toBe(false);
    });

    it("retrieves unseen entries for a feed", () => {
      upsertFeedEntry(db, "e1", "f1", "g1", "Title 1", null, null, null);
      upsertFeedEntry(db, "e2", "f1", "g2", "Title 2", null, null, null);
      const unseen = getUnseenEntries(db, "f1");
      expect(unseen).toHaveLength(2);
    });

    it("retrieves all unseen entries across feeds", () => {
      addFeedSource(db, "f2", "https://other.com/rss", "Other");
      upsertFeedEntry(db, "e1", "f1", "g1", "Title 1", null, null, null);
      upsertFeedEntry(db, "e2", "f2", "g2", "Title 2", null, null, null);
      const unseen = getUnseenEntries(db);
      expect(unseen).toHaveLength(2);
    });

    it("marks entries as seen", () => {
      upsertFeedEntry(db, "e1", "f1", "g1", "Title 1", null, null, null);
      upsertFeedEntry(db, "e2", "f1", "g2", "Title 2", null, null, null);
      markEntriesSeen(db, ["e1"]);

      const unseen = getUnseenEntries(db, "f1");
      expect(unseen).toHaveLength(1);
      expect(unseen[0]!.id).toBe("e2");
    });

    it("markEntriesSeen with empty array is a no-op", () => {
      upsertFeedEntry(db, "e1", "f1", "g1", "Title", null, null, null);
      markEntriesSeen(db, []);
      expect(getUnseenEntries(db, "f1")).toHaveLength(1);
    });

    it("lists entries with limit", () => {
      upsertFeedEntry(db, "e1", "f1", "g1", "T1", null, null, null);
      upsertFeedEntry(db, "e2", "f1", "g2", "T2", null, null, null);
      upsertFeedEntry(db, "e3", "f1", "g3", "T3", null, null, null);
      const entries = listFeedEntries(db, "f1", 2);
      expect(entries).toHaveLength(2);
    });
  });
});
