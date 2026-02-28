import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "./db";
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  markTaskRun,
  getDueTasks,
  createTaskRun,
  completeTaskRun,
  getTaskRuns,
} from "./tasks";
import type { Database } from "bun:sqlite";

describe("Tasks", () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves a task", () => {
    createTask(db, "t1", "Daily digest", "0 8 * * *", "Summarize my emails", "{}");
    const task = getTask(db, "t1");
    expect(task).not.toBeNull();
    expect(task!.name).toBe("Daily digest");
    expect(task!.cron).toBe("0 8 * * *");
    expect(task!.prompt).toBe("Summarize my emails");
    expect(task!.enabled).toBe(1);
    expect(task!.last_run_at).toBeNull();
  });

  it("returns null for missing task", () => {
    expect(getTask(db, "missing")).toBeNull();
  });

  it("lists all tasks", () => {
    createTask(db, "t1", "Task A", "* * * * *", "prompt A", "{}");
    createTask(db, "t2", "Task B", "0 * * * *", "prompt B", "{}");
    const all = listTasks(db);
    expect(all).toHaveLength(2);
  });

  it("updates task fields", () => {
    createTask(db, "t1", "Old name", "* * * * *", "old prompt", "{}");
    updateTask(db, "t1", { name: "New name", cron: "0 9 * * *", enabled: 0 });
    const task = getTask(db, "t1");
    expect(task!.name).toBe("New name");
    expect(task!.cron).toBe("0 9 * * *");
    expect(task!.enabled).toBe(0);
  });

  it("update with no fields is a no-op", () => {
    createTask(db, "t1", "Name", "* * * * *", "prompt", "{}");
    updateTask(db, "t1", {});
    expect(getTask(db, "t1")!.name).toBe("Name");
  });

  it("deletes a task", () => {
    createTask(db, "t1", "Name", "* * * * *", "prompt", "{}");
    deleteTask(db, "t1");
    expect(getTask(db, "t1")).toBeNull();
  });

  it("deleting a task cascades to task_runs", () => {
    createTask(db, "t1", "Name", "* * * * *", "prompt", "{}");
    createTaskRun(db, "r1", "t1");
    deleteTask(db, "t1");
    expect(getTaskRuns(db, "t1")).toHaveLength(0);
  });

  it("marks task run timestamps", () => {
    createTask(db, "t1", "Name", "* * * * *", "prompt", "{}", 1000);
    markTaskRun(db, "t1", 1000, 2000);
    const task = getTask(db, "t1");
    expect(task!.last_run_at).toBe(1000);
    expect(task!.next_run_at).toBe(2000);
  });

  it("gets due tasks", () => {
    const now = Date.now();
    createTask(db, "t1", "Due", "* * * * *", "prompt", "{}", now - 1000);
    createTask(db, "t2", "Future", "* * * * *", "prompt", "{}", now + 100000);
    createTask(db, "t3", "Disabled", "* * * * *", "prompt", "{}", now - 1000);
    updateTask(db, "t3", { enabled: 0 });

    const due = getDueTasks(db, now);
    expect(due).toHaveLength(1);
    expect(due[0]!.id).toBe("t1");
  });

  describe("Task runs", () => {
    it("creates and completes a run", () => {
      createTask(db, "t1", "Name", "* * * * *", "prompt", "{}");
      createTaskRun(db, "r1", "t1");

      const runs = getTaskRuns(db, "t1");
      expect(runs).toHaveLength(1);
      expect(runs[0]!.status).toBe("running");
      expect(runs[0]!.finished_at).toBeNull();

      completeTaskRun(db, "r1", "success", "All done");
      const updated = getTaskRuns(db, "t1");
      expect(updated[0]!.status).toBe("success");
      expect(updated[0]!.result).toBe("All done");
      expect(updated[0]!.finished_at).toBeGreaterThan(0);
    });

    it("respects limit parameter", () => {
      createTask(db, "t1", "Name", "* * * * *", "prompt", "{}");
      createTaskRun(db, "r1", "t1");
      createTaskRun(db, "r2", "t1");
      createTaskRun(db, "r3", "t1");

      const runs = getTaskRuns(db, "t1", 2);
      expect(runs).toHaveLength(2);
    });
  });
});
