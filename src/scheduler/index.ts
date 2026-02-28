import { Cron } from "croner";
import { randomUUIDv7 } from "bun";
import type { Database } from "bun:sqlite";
import type { Agent } from "../agent/agent";
import {
  listTasks,
  getTask,
  markTaskRun,
  createTaskRun,
  completeTaskRun,
  type TaskRow,
} from "../state/tasks";

export interface TaskSchedulerOptions {
  db: Database;
  agent: Agent;
  /** Interval in ms to poll for due tasks (default: 30_000) */
  pollInterval?: number;
}

/**
 * In-process task scheduler that evaluates cron expressions and
 * invokes the agent for due tasks.
 *
 * Tasks and their schedules live in SQLite. The scheduler keeps
 * a `Map` of active `Cron` instances keyed by task ID. On each
 * cron tick the agent is invoked with the task's prompt and the
 * result is recorded in `task_runs`.
 */
export class TaskScheduler {
  private db: Database;
  private agent: Agent;
  private crons = new Map<string, Cron>();
  private running = false;

  constructor(opts: TaskSchedulerOptions) {
    this.db = opts.db;
    this.agent = opts.agent;
  }

  /** Load all enabled tasks from the DB and start their cron timers. */
  start(): void {
    if (this.running) return;
    this.running = true;

    const tasks = listTasks(this.db);
    for (const task of tasks) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
    console.log(`[scheduler] Started with ${this.crons.size} active task(s)`);
  }

  /** Stop all cron timers. */
  stop(): void {
    this.running = false;
    for (const [, cron] of this.crons) {
      cron.stop();
    }
    this.crons.clear();
    console.log("[scheduler] Stopped");
  }

  /** Add or reload a task's cron timer after creation / update. */
  reload(taskId: string): void {
    // Stop existing timer if any
    const existing = this.crons.get(taskId);
    if (existing) {
      existing.stop();
      this.crons.delete(taskId);
    }

    const task = getTask(this.db, taskId);
    if (!task || !task.enabled || !this.running) return;
    this.scheduleTask(task);
  }

  /** Remove a task's cron timer. */
  remove(taskId: string): void {
    const cron = this.crons.get(taskId);
    if (cron) {
      cron.stop();
      this.crons.delete(taskId);
    }
  }

  /** Force-run a task right now, outside its schedule. */
  async runNow(taskId: string): Promise<string> {
    const task = getTask(this.db, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return this.executeTask(task);
  }

  // ---

  private scheduleTask(task: TaskRow): void {
    try {
      const cron = new Cron(task.cron, { timezone: "UTC" }, () => {
        this.executeTask(task).catch((err) => {
          console.error(`[scheduler] Error executing task ${task.id}:`, err);
        });
      });

      // Store next run time
      const next = cron.nextRun();
      if (next) {
        markTaskRun(this.db, task.id, task.last_run_at ?? 0, next.getTime());
      }

      this.crons.set(task.id, cron);
    } catch (err) {
      console.error(`[scheduler] Invalid cron for task ${task.id} ("${task.cron}"):`, err);
    }
  }

  private async executeTask(task: TaskRow): Promise<string> {
    const runId = randomUUIDv7();
    const startedAt = Date.now();
    createTaskRun(this.db, runId, task.id);

    console.log(`[scheduler] Running task "${task.name}" (${task.id})`);

    try {
      // Parse delivery config and inject it into the prompt context
      let deliveryInstruction = "";
      try {
        const delivery = JSON.parse(task.delivery);
        if (delivery.type) {
          deliveryInstruction = `\n\nAfter completing the task, deliver the result using the deliver_message tool to: ${JSON.stringify(delivery)}`;
        }
      } catch {
        // No delivery config or invalid JSON — agent will just generate text
      }

      const fullPrompt = task.prompt + deliveryInstruction;

      const result = await this.agent.generate({
        messages: [{ role: "user", content: fullPrompt }],
      });

      const text = typeof result.text === "string" ? result.text : "Task completed (no text output)";
      completeTaskRun(this.db, runId, "success", text);

      // Update next run time
      const cron = this.crons.get(task.id);
      if (cron) {
        const next = cron.nextRun();
        markTaskRun(this.db, task.id, startedAt, next ? next.getTime() : null);
      }

      console.log(`[scheduler] Task "${task.name}" completed successfully`);
      return text;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      completeTaskRun(this.db, runId, "error", errMsg);
      console.error(`[scheduler] Task "${task.name}" failed:`, errMsg);

      // Still update next run time
      const cron = this.crons.get(task.id);
      if (cron) {
        const next = cron.nextRun();
        markTaskRun(this.db, task.id, startedAt, next ? next.getTime() : null);
      }

      return errMsg;
    }
  }
}
