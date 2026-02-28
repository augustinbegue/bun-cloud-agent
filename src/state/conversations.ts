import type { Database } from "bun:sqlite";

export interface ConversationRow {
  id: string;
  platform: string;
  thread_id: string | null;
  messages: string; // JSON-serialized ModelMessage[]
  created_at: number;
  updated_at: number;
}

export function getConversation(db: Database, id: string): ConversationRow | null {
  return db.query<ConversationRow, [string]>(
    "SELECT * FROM conversations WHERE id = ?"
  ).get(id);
}

export function getConversationByThread(
  db: Database,
  platform: string,
  threadId: string
): ConversationRow | null {
  return db.query<ConversationRow, [string, string]>(
    "SELECT * FROM conversations WHERE platform = ? AND thread_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(platform, threadId);
}

export function upsertConversation(
  db: Database,
  id: string,
  platform: string,
  threadId: string | null,
  messages: string
): void {
  const now = Date.now();
  db.run(
    `INSERT INTO conversations (id, platform, thread_id, messages, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET messages = ?, updated_at = ?`,
    [id, platform, threadId, messages, now, now, messages, now]
  );
}

export function deleteConversation(db: Database, id: string): void {
  db.run("DELETE FROM conversations WHERE id = ?", [id]);
}
