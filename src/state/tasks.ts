import type { Database } from "bun:sqlite";

export interface TaskRow {
  id: string;
  name: string;
  cron: string;
  prompt: string;
  delivery: string; // JSON
  enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TaskRunRow {
  id: string;
  task_id: string;
  status: string;
  result: string | null;
  started_at: number;
  finished_at: number | null;
}

export function createTask(
  db: Database,
  id: string,
  name: string,
  cron: string,
  prompt: string,
  delivery: string,
  nextRunAt: number | null = null,
): void {
  const now = Date.now();
  db.run(
    `INSERT INTO scheduled_tasks (id, name, cron, prompt, delivery, enabled, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, name, cron, prompt, delivery, nextRunAt, now, now],
  );
}

export function getTask(db: Database, id: string): TaskRow | null {
  return db
    .query<TaskRow, [string]>(
      "SELECT * FROM scheduled_tasks WHERE id = ?",
    )
    .get(id);
}

export function listTasks(db: Database): TaskRow[] {
  return db
    .query<TaskRow, []>(
      "SELECT * FROM scheduled_tasks ORDER BY created_at DESC",
    )
    .all();
}

export function updateTask(
  db: Database,
  id: string,
  updates: Partial<Pick<TaskRow, "name" | "cron" | "prompt" | "delivery" | "enabled" | "next_run_at">>,
): void {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
  if (updates.cron !== undefined) { fields.push("cron = ?"); values.push(updates.cron); }
  if (updates.prompt !== undefined) { fields.push("prompt = ?"); values.push(updates.prompt); }
  if (updates.delivery !== undefined) { fields.push("delivery = ?"); values.push(updates.delivery); }
  if (updates.enabled !== undefined) { fields.push("enabled = ?"); values.push(updates.enabled); }
  if (updates.next_run_at !== undefined) { fields.push("next_run_at = ?"); values.push(updates.next_run_at ?? null); }

  if (fields.length === 0) return;

  fields.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);

  db.run(`UPDATE scheduled_tasks SET ${fields.join(", ")} WHERE id = ?`, values as (string | number)[]);
}

export function deleteTask(db: Database, id: string): void {
  db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
}

export function markTaskRun(db: Database, taskId: string, lastRunAt: number, nextRunAt: number | null): void {
  db.run(
    "UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?",
    [lastRunAt, nextRunAt, Date.now(), taskId],
  );
}

export function getDueTasks(db: Database, now: number): TaskRow[] {
  return db
    .query<TaskRow, [number]>(
      "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?",
    )
    .all(now);
}

// --- Task runs ---

export function createTaskRun(db: Database, id: string, taskId: string): void {
  db.run(
    "INSERT INTO task_runs (id, task_id, status, started_at) VALUES (?, ?, 'running', ?)",
    [id, taskId, Date.now()],
  );
}

export function completeTaskRun(db: Database, id: string, status: "success" | "error", result: string): void {
  db.run(
    "UPDATE task_runs SET status = ?, result = ?, finished_at = ? WHERE id = ?",
    [status, result, Date.now(), id],
  );
}

export function getTaskRuns(db: Database, taskId: string, limit = 10): TaskRunRow[] {
  return db
    .query<TaskRunRow, [string, number]>(
      "SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(taskId, limit);
}
