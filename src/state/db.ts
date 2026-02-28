import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function initDatabase(path = "data/agent.db"): Database {
  // Ensure the directory exists
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      thread_id TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_thread
      ON conversations(platform, thread_id);

    CREATE TABLE IF NOT EXISTS memories (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_subscriptions (
      thread_id TEXT PRIMARY KEY,
      subscribed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS chat_locks (
      thread_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- Scheduled tasks managed by the agent or admin
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron TEXT NOT NULL,
      prompt TEXT NOT NULL,
      delivery TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Execution history for scheduled tasks
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      result TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_runs_task
      ON task_runs(task_id, started_at DESC);

    -- RSS/Atom feed sources
    CREATE TABLE IF NOT EXISTS feed_sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      last_fetched_at INTEGER,
      last_entry_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Individual feed entries (articles)
    CREATE TABLE IF NOT EXISTS feed_entries (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT,
      published_at INTEGER,
      seen INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (feed_id) REFERENCES feed_sources(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_entries_unique
      ON feed_entries(feed_id, entry_id);

    CREATE INDEX IF NOT EXISTS idx_feed_entries_unseen
      ON feed_entries(seen, created_at DESC);

    -- FTS5 virtual table for full-text memory search
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      key,
      content,
      content=memories,
      content_rowid=rowid
    );

    -- Triggers to keep FTS index in sync with memories table
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, key, content)
        VALUES (new.rowid, new.key, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, key, content)
        VALUES ('delete', old.rowid, old.key, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, key, content)
        VALUES ('delete', old.rowid, old.key, old.content);
      INSERT INTO memories_fts(rowid, key, content)
        VALUES (new.rowid, new.key, new.content);
    END;
  `);

  return db;
}
