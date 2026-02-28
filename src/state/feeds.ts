import type { Database } from "bun:sqlite";

export interface FeedSourceRow {
  id: string;
  url: string;
  name: string;
  category: string;
  last_fetched_at: number | null;
  last_entry_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface FeedEntryRow {
  id: string;
  feed_id: string;
  entry_id: string;
  title: string;
  summary: string | null;
  url: string | null;
  published_at: number | null;
  seen: number;
  created_at: number;
}

// --- Feed sources ---

export function addFeedSource(
  db: Database,
  id: string,
  url: string,
  name: string,
  category = "general",
): void {
  const now = Date.now();
  db.run(
    `INSERT INTO feed_sources (id, url, name, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, url, name, category, now, now],
  );
}

export function getFeedSource(db: Database, id: string): FeedSourceRow | null {
  return db
    .query<FeedSourceRow, [string]>("SELECT * FROM feed_sources WHERE id = ?")
    .get(id);
}

export function getFeedSourceByUrl(db: Database, url: string): FeedSourceRow | null {
  return db
    .query<FeedSourceRow, [string]>("SELECT * FROM feed_sources WHERE url = ?")
    .get(url);
}

export function listFeedSources(db: Database): FeedSourceRow[] {
  return db
    .query<FeedSourceRow, []>("SELECT * FROM feed_sources ORDER BY name")
    .all();
}

export function deleteFeedSource(db: Database, id: string): void {
  db.run("DELETE FROM feed_sources WHERE id = ?", [id]);
}

export function updateFeedFetched(db: Database, id: string, lastEntryId: string | null): void {
  db.run(
    "UPDATE feed_sources SET last_fetched_at = ?, last_entry_id = ?, updated_at = ? WHERE id = ?",
    [Date.now(), lastEntryId, Date.now(), id],
  );
}

// --- Feed entries ---

export function upsertFeedEntry(
  db: Database,
  id: string,
  feedId: string,
  entryId: string,
  title: string,
  summary: string | null,
  url: string | null,
  publishedAt: number | null,
): boolean {
  const existing = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM feed_entries WHERE feed_id = ? AND entry_id = ?",
    )
    .get(feedId, entryId);

  if (existing) return false; // Already tracked

  db.run(
    `INSERT INTO feed_entries (id, feed_id, entry_id, title, summary, url, published_at, seen, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, feedId, entryId, title, summary, url, publishedAt, Date.now()],
  );
  return true; // Newly inserted
}

export function getUnseenEntries(db: Database, feedId?: string): FeedEntryRow[] {
  if (feedId) {
    return db
      .query<FeedEntryRow, [string]>(
        "SELECT * FROM feed_entries WHERE seen = 0 AND feed_id = ? ORDER BY published_at DESC, created_at DESC",
      )
      .all(feedId);
  }
  return db
    .query<FeedEntryRow, []>(
      "SELECT * FROM feed_entries WHERE seen = 0 ORDER BY published_at DESC, created_at DESC",
    )
    .all();
}

export function markEntriesSeen(db: Database, ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.run(`UPDATE feed_entries SET seen = 1 WHERE id IN (${placeholders})`, ids);
}

export function listFeedEntries(db: Database, feedId: string, limit = 50): FeedEntryRow[] {
  return db
    .query<FeedEntryRow, [string, number]>(
      "SELECT * FROM feed_entries WHERE feed_id = ? ORDER BY published_at DESC, created_at DESC LIMIT ?",
    )
    .all(feedId, limit);
}
