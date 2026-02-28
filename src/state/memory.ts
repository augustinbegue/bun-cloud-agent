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
