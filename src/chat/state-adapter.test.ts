import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "../state/db";
import { SQLiteStateAdapter } from "./state-adapter";
import type { Database } from "bun:sqlite";

describe("SQLiteStateAdapter", () => {
  let db: Database;
  let adapter: SQLiteStateAdapter;

  beforeEach(() => {
    db = initDatabase(":memory:");
    adapter = new SQLiteStateAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  // --- Cache ---

  describe("cache", () => {
    it("returns null for missing key", async () => {
      expect(await adapter.get("missing")).toBeNull();
    });

    it("stores and retrieves a value", async () => {
      await adapter.set("key", { hello: "world" });
      expect(await adapter.get("key")).toEqual({ hello: "world" });
    });

    it("overwrites an existing value", async () => {
      await adapter.set("key", "first");
      await adapter.set("key", "second");
      expect(await adapter.get("key")).toBe("second");
    });

    it("deletes a value", async () => {
      await adapter.set("key", "value");
      await adapter.delete("key");
      expect(await adapter.get("key")).toBeNull();
    });

    it("expires a value after TTL", async () => {
      await adapter.set("ttl-key", "temporary", 1); // 1 ms TTL
      await new Promise((r) => setTimeout(r, 10));
      expect(await adapter.get("ttl-key")).toBeNull();
    });

    it("keeps a value before TTL expires", async () => {
      await adapter.set("persist-key", "here", 60_000);
      expect(await adapter.get("persist-key")).toBe("here");
    });
  });

  // --- Subscriptions ---

  describe("subscriptions", () => {
    it("returns false for unsubscribed thread", async () => {
      expect(await adapter.isSubscribed("thread-1")).toBe(false);
    });

    it("subscribes a thread", async () => {
      await adapter.subscribe("thread-1");
      expect(await adapter.isSubscribed("thread-1")).toBe(true);
    });

    it("unsubscribes a thread", async () => {
      await adapter.subscribe("thread-1");
      await adapter.unsubscribe("thread-1");
      expect(await adapter.isSubscribed("thread-1")).toBe(false);
    });

    it("idempotent subscribe does not throw", async () => {
      await adapter.subscribe("thread-2");
      await expect(adapter.subscribe("thread-2")).resolves.toBeUndefined();
    });
  });

  // --- Locks ---

  describe("locks", () => {
    it("acquires a lock for a free thread", async () => {
      const lock = await adapter.acquireLock("thread-lock", 5000);
      expect(lock).not.toBeNull();
      expect(lock!.threadId).toBe("thread-lock");
      expect(lock!.token).toBeString();
    });

    it("returns null when lock is already held", async () => {
      await adapter.acquireLock("thread-busy", 5000);
      const second = await adapter.acquireLock("thread-busy", 5000);
      expect(second).toBeNull();
    });

    it("allows re-acquiring an expired lock", async () => {
      await adapter.acquireLock("thread-exp", 1); // expires in 1 ms
      await new Promise((r) => setTimeout(r, 10));
      const lock = await adapter.acquireLock("thread-exp", 5000);
      expect(lock).not.toBeNull();
    });

    it("releases a lock", async () => {
      const lock = await adapter.acquireLock("thread-rel", 5000);
      await adapter.releaseLock(lock!);
      const reacquired = await adapter.acquireLock("thread-rel", 5000);
      expect(reacquired).not.toBeNull();
    });

    it("extends a lock with valid token", async () => {
      const lock = await adapter.acquireLock("thread-ext", 5000);
      const extended = await adapter.extendLock(lock!, 10_000);
      expect(extended).toBe(true);
    });

    it("refuses to extend lock with wrong token", async () => {
      await adapter.acquireLock("thread-wrong", 5000);
      const fakeLock = { threadId: "thread-wrong", token: "bad-token", expiresAt: 0 };
      const extended = await adapter.extendLock(fakeLock, 5000);
      expect(extended).toBe(false);
    });

    it("refuses to extend lock for unknown thread", async () => {
      const fakeLock = { threadId: "ghost-thread", token: "any", expiresAt: 0 };
      expect(await adapter.extendLock(fakeLock, 5000)).toBe(false);
    });
  });
});
