import type { Database } from "bun:sqlite";

export interface MemoryRow {
  key: string;
  content: string;
  updated_at: number;
}

export function saveMemory(db: Database, key: string, content: string): void {
  db.run(
    "INSERT OR REPLACE INTO memories (key, content, updated_at) VALUES (?, ?, ?)",
    [key, content, Date.now()]
  );
}

export function recallMemories(db: Database, query: string): MemoryRow[] {
  // Try FTS5 first for better relevance ranking
  try {
    const ftsResults = db.query<MemoryRow, [string]>(
      `SELECT m.key, m.content, m.updated_at
       FROM memories_fts f
       JOIN memories m ON m.rowid = f.rowid
       WHERE memories_fts MATCH ?
       ORDER BY rank`
    ).all(query);
    if (ftsResults.length > 0) return ftsResults;
  } catch {
    // FTS table might not exist (e.g. pre-migration DB) — fall through
  }

  // Fallback to LIKE search
  return db.query<MemoryRow, [string, string]>(
    "SELECT key, content, updated_at FROM memories WHERE key LIKE ? OR content LIKE ? ORDER BY updated_at DESC"
  ).all(`%${query}%`, `%${query}%`);
}

export function getMemory(db: Database, key: string): MemoryRow | null {
  return db.query<MemoryRow, [string]>(
    "SELECT key, content, updated_at FROM memories WHERE key = ?"
  ).get(key);
}

export function deleteMemory(db: Database, key: string): void {
  db.run("DELETE FROM memories WHERE key = ?", [key]);
}

export function listMemories(db: Database): MemoryRow[] {
  return db.query<MemoryRow, []>(
    "SELECT key, content, updated_at FROM memories ORDER BY updated_at DESC"
  ).all();
}
