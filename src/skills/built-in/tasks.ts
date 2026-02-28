import { tool } from "ai";
import { z } from "zod";
import { randomUUIDv7 } from "bun";
import { Cron } from "croner";
import type { Skill } from "../types";
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskRuns,
} from "../../state/tasks";
import type { TaskScheduler } from "../../scheduler";

/**
 * Build the task-management skill.
 *
 * Because the tools need a reference to the live `TaskScheduler`
 * (which doesn't exist at registration time), we accept a lazy
 * getter that resolves once bootstrap is complete.
 */
export function createTaskSkill(getScheduler: () => TaskScheduler | null): Skill {
  return (ctx) => ({
    create_task: tool({
      description:
        "Create a new scheduled task. The agent will be invoked with the given prompt on the cron schedule. " +
        "Use standard cron syntax (minute hour day month weekday). " +
        "Delivery is a JSON object describing where to send results, e.g. {\"type\":\"slack\",\"channel\":\"#general\"}",
      inputSchema: z.object({
        name: z.string().describe("Human-readable task name"),
        cron: z.string().describe("Cron expression (e.g. '0 8 * * *' for daily at 08:00 UTC)"),
        prompt: z.string().describe("The prompt the agent will execute on each run"),
        delivery: z
          .string()
          .optional()
          .describe("JSON delivery config, e.g. {\"type\":\"slack\",\"channel\":\"#digest\"}"),
      }),
      execute: async ({ name, cron, prompt, delivery }) => {
        // Validate cron expression
        try {
          const c = new Cron(cron);
          c.stop();
        } catch {
          return { error: `Invalid cron expression: "${cron}"` };
        }

        const id = randomUUIDv7();
        const deliveryJson = delivery ?? "{}";
        const nextCron = new Cron(cron);
        const nextRun = nextCron.nextRun();
        nextCron.stop();

        createTask(ctx.db, id, name, cron, prompt, deliveryJson, nextRun?.getTime() ?? null);

        // Tell the scheduler about the new task
        getScheduler()?.reload(id);

        return {
          created: true,
          id,
          name,
          cron,
          nextRun: nextRun?.toISOString() ?? null,
        };
      },
    }),

    list_tasks: tool({
      description: "List all scheduled tasks with their status and schedule",
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = listTasks(ctx.db);
        return {
          tasks: tasks.map((t) => ({
            id: t.id,
            name: t.name,
            cron: t.cron,
            prompt: t.prompt.slice(0, 200),
            delivery: t.delivery,
            enabled: Boolean(t.enabled),
            lastRunAt: t.last_run_at ? new Date(t.last_run_at).toISOString() : null,
            nextRunAt: t.next_run_at ? new Date(t.next_run_at).toISOString() : null,
          })),
          count: tasks.length,
        };
      },
    }),

    update_task: tool({
      description: "Update a scheduled task's name, cron, prompt, delivery, or enabled status",
      inputSchema: z.object({
        id: z.string().describe("Task ID"),
        name: z.string().optional().describe("New task name"),
        cron: z.string().optional().describe("New cron expression"),
        prompt: z.string().optional().describe("New prompt"),
        delivery: z.string().optional().describe("New delivery JSON config"),
        enabled: z.boolean().optional().describe("Enable or disable the task"),
      }),
      execute: async ({ id, name, cron, prompt, delivery, enabled }) => {
        const existing = getTask(ctx.db, id);
        if (!existing) return { error: `Task ${id} not found` };

        if (cron) {
          try {
            const c = new Cron(cron);
            c.stop();
          } catch {
            return { error: `Invalid cron expression: "${cron}"` };
          }
        }

        updateTask(ctx.db, id, {
          ...(name !== undefined && { name }),
          ...(cron !== undefined && { cron }),
          ...(prompt !== undefined && { prompt }),
          ...(delivery !== undefined && { delivery }),
          ...(enabled !== undefined && { enabled: enabled ? 1 : 0 }),
        });

        getScheduler()?.reload(id);
        return { updated: true, id };
      },
    }),

    delete_task: tool({
      description: "Delete a scheduled task permanently",
      inputSchema: z.object({
        id: z.string().describe("Task ID to delete"),
      }),
      execute: async ({ id }) => {
        const existing = getTask(ctx.db, id);
        if (!existing) return { error: `Task ${id} not found` };

        getScheduler()?.remove(id);
        deleteTask(ctx.db, id);
        return { deleted: true, id, name: existing.name };
      },
    }),

    run_task_now: tool({
      description: "Immediately execute a scheduled task outside its normal schedule",
      inputSchema: z.object({
        id: z.string().describe("Task ID to run"),
      }),
      execute: async ({ id }) => {
        const scheduler = getScheduler();
        if (!scheduler) return { error: "Scheduler not available" };

        try {
          const result = await scheduler.runNow(id);
          return { executed: true, id, result: result.slice(0, 2000) };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    list_task_runs: tool({
      description: "View execution history for a scheduled task",
      inputSchema: z.object({
        id: z.string().describe("Task ID"),
        limit: z.number().optional().describe("Number of runs to return (default: 10)"),
      }),
      execute: async ({ id, limit }) => {
        const runs = getTaskRuns(ctx.db, id, limit ?? 10);
        return {
          runs: runs.map((r) => ({
            id: r.id,
            status: r.status,
            result: r.result?.slice(0, 500) ?? null,
            startedAt: new Date(r.started_at).toISOString(),
            finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
          })),
          count: runs.length,
        };
      },
    }),
  });
}
