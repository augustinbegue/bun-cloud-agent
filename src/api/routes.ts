import type { Agent } from "../agent/agent";
import type { SkillRegistry } from "../skills";
import type { Database } from "bun:sqlite";
import type { ModelMessage } from "ai";
import { randomUUIDv7 } from "bun";
import {
  getConversation,
  upsertConversation,
} from "../state/conversations";
import {
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskRuns,
} from "../state/tasks";
import type { TaskScheduler } from "../scheduler";

/**
 * Create HTTP API route handlers.
 */
export function createRoutes(
  agent: Agent,
  registry: SkillRegistry,
  db: Database,
  getScheduler: () => TaskScheduler | null = () => null,
) {
  return {
    /** Health check */
    "/health": () => new Response("ok"),

    /** Readiness check — verifies DB is accessible */
    "/ready": () => {
      try {
        db.query("SELECT 1").get();
        return new Response("ready");
      } catch {
        return new Response("not ready", { status: 503 });
      }
    },

    /** List registered skills */
    "/api/skills": () => {
      const skills = registry.list().map(({ name, description, version }) => ({
        name,
        description,
        version,
      }));
      return Response.json({ skills });
    },

    /** Direct HTTP chat endpoint */
    "/api/chat": async (req: Request) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        const body = (await req.json()) as {
          message?: string;
          conversationId?: string;
          messages?: ModelMessage[];
        };

        if (!body.message && !body.messages) {
          return Response.json({ error: "message or messages required" }, { status: 400 });
        }

        // Load or create conversation
        let messages: ModelMessage[] = [];
        const convId = body.conversationId ?? randomUUIDv7();

        if (body.conversationId) {
          const existing = getConversation(db, body.conversationId);
          if (existing) {
            try {
              messages = JSON.parse(existing.messages);
            } catch {
              messages = [];
            }
          }
        }

        if (body.messages) {
          messages = body.messages;
        } else if (body.message) {
          messages.push({ role: "user", content: body.message });
        }

        const result = await agent.generate({ messages });
        const responseText =
          typeof result.text === "string" ? result.text : "";

        // Save conversation
        messages.push({ role: "assistant", content: responseText });
        upsertConversation(db, convId, "http", null, JSON.stringify(messages));

        return Response.json({
          conversationId: convId,
          response: responseText,
          usage: result.usage,
        });
      } catch (error) {
        console.error("[api] Chat error:", error);
        return Response.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    },

    // --- Task admin API ---

    "/api/tasks": async (req: Request) => {
      if (req.method === "GET") {
        const tasks = listTasks(db).map((t) => ({
          id: t.id,
          name: t.name,
          cron: t.cron,
          prompt: t.prompt,
          delivery: t.delivery,
          enabled: Boolean(t.enabled),
          lastRunAt: t.last_run_at ? new Date(t.last_run_at).toISOString() : null,
          nextRunAt: t.next_run_at ? new Date(t.next_run_at).toISOString() : null,
          createdAt: new Date(t.created_at).toISOString(),
        }));
        return Response.json({ tasks });
      }
      return new Response("Method not allowed", { status: 405 });
    },

    "/api/tasks/:id": async (req: Request) => {
      const url = new URL(req.url);
      const id = url.pathname.split("/").pop()!;

      if (req.method === "GET") {
        const task = getTask(db, id);
        if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
        const runs = getTaskRuns(db, id, 20);
        return Response.json({
          ...task,
          enabled: Boolean(task.enabled),
          runs: runs.map((r) => ({
            id: r.id,
            status: r.status,
            result: r.result?.slice(0, 1000) ?? null,
            startedAt: new Date(r.started_at).toISOString(),
            finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
          })),
        });
      }

      if (req.method === "PUT") {
        const task = getTask(db, id);
        if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
        try {
          const body = (await req.json()) as Record<string, unknown>;
          updateTask(db, id, {
            ...(typeof body.name === "string" && { name: body.name }),
            ...(typeof body.cron === "string" && { cron: body.cron }),
            ...(typeof body.prompt === "string" && { prompt: body.prompt }),
            ...(typeof body.delivery === "string" && { delivery: body.delivery }),
            ...(typeof body.enabled === "boolean" && { enabled: body.enabled ? 1 : 0 }),
          });
          getScheduler()?.reload(id);
          return Response.json({ updated: true, id });
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }
      }

      if (req.method === "DELETE") {
        const task = getTask(db, id);
        if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
        getScheduler()?.remove(id);
        deleteTask(db, id);
        return Response.json({ deleted: true, id });
      }

      return new Response("Method not allowed", { status: 405 });
    },

    "/api/tasks/:id/run": async (req: Request) => {
      if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

      const url = new URL(req.url);
      const parts = url.pathname.split("/");
      const id = parts[parts.length - 2]!;

      const scheduler = getScheduler();
      if (!scheduler) return Response.json({ error: "Scheduler not available" }, { status: 503 });

      try {
        const result = await scheduler.runNow(id);
        return Response.json({ executed: true, id, result: result.slice(0, 2000) });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 404 },
        );
      }
    },
  };
}
