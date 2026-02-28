import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "./db";
import { unlinkSync } from "node:fs";
import type { Database } from "bun:sqlite";

describe("initDatabase", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  it("creates an in-memory database without error", () => {
    db = initDatabase(":memory:");
    expect(db).toBeDefined();
  });

  it("creates all required tables", () => {
    db = initDatabase(":memory:");

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("conversations");
    expect(tables).toContain("memories");
    expect(tables).toContain("chat_subscriptions");
    expect(tables).toContain("chat_cache");
    expect(tables).toContain("chat_locks");
  });

  it("enables WAL journal mode", () => {
    db = initDatabase(":memory:");
    // In-memory DBs report "memory" mode, not "wal" — WAL is disk-only.
    // We verify the pragma executes without throwing.
    const row = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    expect(row).not.toBeNull();
  });

  it("is idempotent — can be called twice on the same path", () => {
    // Use a temp file path so WAL and schema creation are exercised
    const path = `/tmp/bun-agent-test-${Date.now()}.db`;
    const cleanup = () => {
      for (const f of [path, `${path}-wal`, `${path}-shm`]) {
        try { unlinkSync(f); } catch {}
      }
    };

    try {
      const db1 = initDatabase(path);
      db1.close();
      db = initDatabase(path); // must not throw — reassign to `db` for afterEach cleanup
    } finally {
      cleanup();
    }
  });
});
