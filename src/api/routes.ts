import type { Agent } from "../agent/agent";
import type { SkillRegistry } from "../skills";
import type { Database } from "bun:sqlite";
import type { ModelMessage } from "ai";
import { randomUUIDv7 } from "bun";
import {
  getConversation,
  upsertConversation,
} from "../state/conversations";

/**
 * Create HTTP API route handlers.
 */
export function createRoutes(
  agent: Agent,
  registry: SkillRegistry,
  db: Database
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
  };
}
