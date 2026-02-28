import type { Agent } from "../agent/agent";
import type { Database } from "bun:sqlite";
import {
  getConversationByThread,
  upsertConversation,
} from "../state/conversations";
import { randomUUIDv7 } from "bun";

import type { ModelMessage } from "ai";

/**
 * Handle a new mention (first interaction in an unsubscribed thread).
 * Subscribes to the thread and runs the agent.
 */
export async function handleNewMention(
  thread: { id: string; post: (msg: string) => Promise<unknown>; subscribe: () => Promise<void>; startTyping: () => Promise<void> },
  message: { text: string },
  agent: Agent,
  db: Database
): Promise<void> {
  await thread.subscribe();
  await handleMessage(thread, message, agent, db, "mention");
}

/**
 * Handle a message in a subscribed thread (follow-up conversation).
 */
export async function handleSubscribedMessage(
  thread: { id: string; post: (msg: string) => Promise<unknown>; startTyping: () => Promise<void> },
  message: { text: string },
  agent: Agent,
  db: Database
): Promise<void> {
  await handleMessage(thread, message, agent, db, "subscribed");
}

async function handleMessage(
  thread: { id: string; post: (msg: string) => Promise<unknown>; startTyping: () => Promise<void> },
  message: { text: string },
  agent: Agent,
  db: Database,
  platform: string
): Promise<void> {
  try {
    await thread.startTyping();

    // Load existing conversation history
    const existing = getConversationByThread(db, platform, thread.id);
    let messages: ModelMessage[] = [];
    if (existing) {
      try {
        messages = JSON.parse(existing.messages);
      } catch {
        messages = [];
      }
    }

    // Add user message
    messages.push({ role: "user", content: message.text });

    // Run agent
    const result = await agent.generate({
      messages,
    });

    // Extract assistant response text
    const responseText =
      typeof result.text === "string" ? result.text : "I processed your request.";

    // Post response to thread
    await thread.post(responseText);

    // Save conversation history
    messages.push({ role: "assistant", content: responseText });
    const convId = existing?.id ?? randomUUIDv7();
    upsertConversation(db, convId, platform, thread.id, JSON.stringify(messages));
  } catch (error) {
    console.error("[chat] Error handling message:", error);
    await thread.post("Sorry, I encountered an error processing your request.");
  }
}
