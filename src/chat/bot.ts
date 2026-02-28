import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { SQLiteStateAdapter } from "./state-adapter";
import { handleNewMention, handleSubscribedMessage } from "./handlers";
import type { Agent } from "../agent/agent";
import type { AgentConfig } from "../config";
import type { Database } from "bun:sqlite";

export function setupBot(agent: Agent, config: AgentConfig, db: Database) {
  const stateAdapter = new SQLiteStateAdapter(db);

  // Build adapters map — only include adapters that have credentials configured
  const adapters: Record<string, ReturnType<typeof createSlackAdapter> | ReturnType<typeof createDiscordAdapter> | ReturnType<typeof createTelegramAdapter>> = {};

  if (config.slack.botToken && config.slack.signingSecret) {
    adapters.slack = createSlackAdapter({
      botToken: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
    });
  }

  if (config.discord.botToken && config.discord.publicKey && config.discord.applicationId) {
    adapters.discord = createDiscordAdapter({
      applicationId: config.discord.applicationId,
      botToken: config.discord.botToken,
      publicKey: config.discord.publicKey,
    });
  }

  if (config.telegram.botToken) {
    adapters.telegram = createTelegramAdapter({
      botToken: config.telegram.botToken,
      secretToken: config.telegram.secretToken || undefined,
    });
  }

  const chat = new Chat({
    adapters,
    state: stateAdapter,
    userName: "cloud-agent",
  });

  // Handle new @mentions — subscribe and respond
  chat.onNewMention(async (thread, message) => {
    await handleNewMention(thread, message, agent, db);
  });

  // Handle follow-up messages in subscribed threads
  chat.onSubscribedMessage(async (thread, message) => {
    await handleSubscribedMessage(thread, message, agent, db);
  });

  return chat;
}
