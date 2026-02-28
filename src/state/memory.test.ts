import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "./db";
import {
  saveMemory,
  recallMemories,
  getMemory,
  deleteMemory,
  listMemories,
} from "./memory";
import type { Database } from "bun:sqlite";

describe("Memory", () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("returns null for a missing key", () => {
    expect(getMemory(db, "missing")).toBeNull();
  });

  it("saves and retrieves a memory by key", () => {
    saveMemory(db, "user.name", "Alice");
    const row = getMemory(db, "user.name");
    expect(row).not.toBeNull();
    expect(row!.key).toBe("user.name");
    expect(row!.content).toBe("Alice");
    expect(row!.updated_at).toBeGreaterThan(0);
  });

  it("overwrites existing memory on the same key", () => {
    saveMemory(db, "user.name", "Alice");
    saveMemory(db, "user.name", "Bob");
    expect(getMemory(db, "user.name")!.content).toBe("Bob");
  });

  it("lists all memories", () => {
    saveMemory(db, "k1", "v1");
    saveMemory(db, "k2", "v2");
    const list = listMemories(db);
    expect(list).toHaveLength(2);
  });

  it("returns empty list when no memories exist", () => {
    expect(listMemories(db)).toHaveLength(0);
  });

  it("recalls memories by key substring", () => {
    saveMemory(db, "user.preference.theme", "dark");
    saveMemory(db, "project.deadline", "2025-12-01");
    const results = recallMemories(db, "preference");
    expect(results).toHaveLength(1);
    expect(results[0]!.key).toBe("user.preference.theme");
  });

  it("recalls memories by content substring", () => {
    saveMemory(db, "note", "remember to call Alice");
    saveMemory(db, "other", "buy groceries");
    const results = recallMemories(db, "Alice");
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe("remember to call Alice");
  });

  it("returns empty array when nothing matches recall query", () => {
    saveMemory(db, "k", "v");
    expect(recallMemories(db, "zzz-no-match")).toHaveLength(0);
  });

  it("deletes a memory by key", () => {
    saveMemory(db, "temp", "data");
    deleteMemory(db, "temp");
    expect(getMemory(db, "temp")).toBeNull();
  });

  it("deleting a non-existent key does not throw", () => {
    expect(() => deleteMemory(db, "ghost")).not.toThrow();
  });
});
