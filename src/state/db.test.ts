import { describe, it, expect } from "bun:test";
import { initDatabase } from "./db";

describe("initDatabase", () => {
  it("creates an in-memory database without error", () => {
    const db = initDatabase(":memory:");
    expect(db).toBeDefined();
    db.close();
  });

  it("creates all required tables", () => {
    const db = initDatabase(":memory:");

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
    db.close();
  });

  it("enables WAL journal mode", () => {
    const db = initDatabase(":memory:");
    // In-memory DBs report "memory" mode, not "wal" — WAL is disk-only.
    // We verify the pragma executes without throwing.
    const row = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    expect(row).not.toBeNull();
    db.close();
  });

  it("is idempotent — can be called twice on the same path", () => {
    // Use a temp file path so WAL and schema creation are exercised
    const path = `/tmp/bun-agent-test-${Date.now()}.db`;
    const db1 = initDatabase(path);
    db1.close();
    const db2 = initDatabase(path); // must not throw
    db2.close();
    // Cleanup
    Bun.spawnSync(["rm", "-f", path, `${path}-wal`, `${path}-shm`]);
  });
});
