import type { StateAdapter, Lock } from "chat";
import type { Database } from "bun:sqlite";
import { randomUUIDv7 } from "bun";

/**
 * SQLite-backed StateAdapter for Chat SDK.
 * Provides subscriptions, cache with TTL, and distributed locking.
 */
export class SQLiteStateAdapter implements StateAdapter {
  constructor(private db: Database) {}

  async connect(): Promise<void> {
    // DB is already initialized — nothing to do
  }

  async disconnect(): Promise<void> {
    // DB lifecycle managed by the main process
  }

  // --- Cache ---

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = this.db
      .query<{ value: string; expires_at: number | null }, [string]>(
        "SELECT value, expires_at FROM chat_cache WHERE key = ?"
      )
      .get(key);

    if (!row) return null;
    if (row.expires_at && row.expires_at < Date.now()) {
      this.db.run("DELETE FROM chat_cache WHERE key = ?", [key]);
      return null;
    }
    return JSON.parse(row.value) as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this.db.run(
      "INSERT OR REPLACE INTO chat_cache (key, value, expires_at) VALUES (?, ?, ?)",
      [key, JSON.stringify(value), expiresAt]
    );
  }

  async delete(key: string): Promise<void> {
    this.db.run("DELETE FROM chat_cache WHERE key = ?", [key]);
  }

  // --- Locks ---

  async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    const now = Date.now();
    // Clean up expired locks
    this.db.run("DELETE FROM chat_locks WHERE expires_at < ?", [now]);

    const existing = this.db
      .query<{ token: string; expires_at: number }, [string]>(
        "SELECT token, expires_at FROM chat_locks WHERE thread_id = ?"
      )
      .get(threadId);

    if (existing && existing.expires_at > now) {
      return null; // Already locked
    }

    const token = randomUUIDv7();
    const expiresAt = now + ttlMs;

    this.db.run(
      "INSERT OR REPLACE INTO chat_locks (thread_id, token, expires_at) VALUES (?, ?, ?)",
      [threadId, token, expiresAt]
    );

    return { threadId, token, expiresAt };
  }

  async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
    const existing = this.db
      .query<{ token: string }, [string]>(
        "SELECT token FROM chat_locks WHERE thread_id = ?"
      )
      .get(lock.threadId);

    if (!existing || existing.token !== lock.token) return false;

    const newExpiry = Date.now() + ttlMs;
    this.db.run("UPDATE chat_locks SET expires_at = ? WHERE thread_id = ? AND token = ?", [
      newExpiry,
      lock.threadId,
      lock.token,
    ]);
    return true;
  }

  async releaseLock(lock: Lock): Promise<void> {
    this.db.run("DELETE FROM chat_locks WHERE thread_id = ? AND token = ?", [
      lock.threadId,
      lock.token,
    ]);
  }

  // --- Subscriptions ---

  async isSubscribed(threadId: string): Promise<boolean> {
    const row = this.db
      .query<{ thread_id: string }, [string]>(
        "SELECT thread_id FROM chat_subscriptions WHERE thread_id = ?"
      )
      .get(threadId);
    return row !== null;
  }

  async subscribe(threadId: string): Promise<void> {
    this.db.run(
      "INSERT OR REPLACE INTO chat_subscriptions (thread_id, subscribed_at) VALUES (?, ?)",
      [threadId, Date.now()]
    );
  }

  async unsubscribe(threadId: string): Promise<void> {
    this.db.run("DELETE FROM chat_subscriptions WHERE thread_id = ?", [threadId]);
  }
}
