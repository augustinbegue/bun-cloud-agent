import type { Agent } from "../agent/agent";
import type { Database } from "bun:sqlite";
import type { ModelMessage } from "ai";
import type { ServerWebSocket } from "bun";
import { randomUUIDv7 } from "bun";
import {
  getConversation,
  upsertConversation,
} from "../state/conversations";

export interface WSData {
  conversationId: string;
}

/**
 * Create WebSocket handlers for direct client connections.
 * Protocol: JSON messages with { type, ... } structure.
 *
 * Client sends: { type: "message", content: "..." }
 * Server sends: { type: "text", content: "..." }
 *              { type: "error", error: "..." }
 *              { type: "done", conversationId: "..." }
 */
export function createWebSocketHandler(agent: Agent, db: Database) {
  return {
    open(ws: ServerWebSocket<WSData>) {
      const conversationId = randomUUIDv7();
      ws.data = { conversationId };
      ws.send(
        JSON.stringify({
          type: "connected",
          conversationId,
        })
      );
    },

    async message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as {
          type: string;
          content?: string;
          conversationId?: string;
        };

        if (msg.type !== "message" || !msg.content) {
          ws.send(JSON.stringify({ type: "error", error: "Expected { type: 'message', content: '...' }" }));
          return;
        }

        // Use the conversation ID from the message or the one assigned at connect
        const convId = msg.conversationId ?? ws.data.conversationId;

        // Load conversation history
        let messages: ModelMessage[] = [];
        const existing = getConversation(db, convId);
        if (existing) {
          try {
            messages = JSON.parse(existing.messages);
          } catch {
            messages = [];
          }
        }

        messages.push({ role: "user", content: msg.content });

        // Stream response
        const result = await agent.stream({ messages });

        let fullText = "";
        for await (const chunk of result.textStream) {
          fullText += chunk;
          ws.send(JSON.stringify({ type: "text", content: chunk }));
        }

        // Save conversation
        messages.push({ role: "assistant", content: fullText });
        upsertConversation(db, convId, "websocket", null, JSON.stringify(messages));

        ws.send(JSON.stringify({ type: "done", conversationId: convId }));
      } catch (error) {
        console.error("[ws] Error:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
    },

    close(_ws: ServerWebSocket<WSData>) {
      // Cleanup if needed
    },
  };
}
