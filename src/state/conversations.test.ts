import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "./db";
import {
  getConversation,
  getConversationByThread,
  upsertConversation,
  deleteConversation,
} from "./conversations";
import type { Database } from "bun:sqlite";

describe("Conversations", () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("returns null for a missing conversation", () => {
    expect(getConversation(db, "nonexistent")).toBeNull();
  });

  it("inserts and retrieves a conversation by id", () => {
    upsertConversation(db, "conv-1", "slack", "thread-1", "[]");
    const row = getConversation(db, "conv-1");
    expect(row).not.toBeNull();
    expect(row!.id).toBe("conv-1");
    expect(row!.platform).toBe("slack");
    expect(row!.thread_id).toBe("thread-1");
    expect(row!.messages).toBe("[]");
  });

  it("updates messages on upsert with same id", () => {
    upsertConversation(db, "conv-2", "slack", "t", "[]");
    upsertConversation(db, "conv-2", "slack", "t", '[{"role":"user"}]');
    const row = getConversation(db, "conv-2");
    expect(row!.messages).toBe('[{"role":"user"}]');
  });

  it("retrieves conversation by platform + thread", () => {
    upsertConversation(db, "conv-3", "discord", "thread-xyz", "[]");
    const row = getConversationByThread(db, "discord", "thread-xyz");
    expect(row).not.toBeNull();
    expect(row!.id).toBe("conv-3");
  });

  it("returns null when platform/thread does not match", () => {
    upsertConversation(db, "conv-4", "discord", "thread-abc", "[]");
    expect(getConversationByThread(db, "slack", "thread-abc")).toBeNull();
    expect(getConversationByThread(db, "discord", "wrong-thread")).toBeNull();
  });

  it("deletes a conversation", () => {
    upsertConversation(db, "conv-5", "telegram", null, "[]");
    deleteConversation(db, "conv-5");
    expect(getConversation(db, "conv-5")).toBeNull();
  });

  it("supports null thread_id", () => {
    upsertConversation(db, "conv-6", "api", null, "[]");
    const row = getConversation(db, "conv-6");
    expect(row!.thread_id).toBeNull();
  });
});
