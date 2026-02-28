import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";

/**
 * Delivery skill — allows the agent to proactively push messages
 * to configured chat platforms or email.
 *
 * Chat delivery uses the Chat SDK bot instances. Email delivery
 * shells out to himalaya (if configured).
 *
 * The `chatBot` and platform config are injected via closure so
 * the skill factory can be called at registration time.
 */
export function createDeliverSkill(
  getChatBot: () => { post: (platform: string, channel: string, text: string) => Promise<void> } | null,
): Skill {
  return (ctx) => ({
    deliver_message: tool({
      description:
        "Send a message to a destination (Slack channel, Discord channel, Telegram chat, or email). " +
        "Use this to proactively deliver digests, alerts, or task results.",
      inputSchema: z.object({
        destination: z.object({
          type: z.enum(["slack", "discord", "telegram", "email"]).describe("Platform type"),
          channel: z
            .string()
            .optional()
            .describe("Channel/chat ID for chat platforms (e.g. '#general', channel ID)"),
          address: z
            .string()
            .optional()
            .describe("Email address (for type=email)"),
          subject: z.string().optional().describe("Email subject (for type=email)"),
        }),
        content: z.string().describe("The message content to deliver"),
        format: z.enum(["markdown", "plain"]).optional().describe("Message format (default: markdown)"),
      }),
      execute: async ({ destination, content }) => {
        if (destination.type === "email") {
          return deliverEmail(destination, content, ctx.config.himalayaConfig);
        }

        // Chat platform delivery
        const bot = getChatBot();
        if (!bot) {
          return {
            error: "Chat bot not available. No chat platform is configured.",
          };
        }

        const channel = destination.channel;
        if (!channel) {
          return { error: "Channel is required for chat platform delivery" };
        }

        try {
          await bot.post(destination.type, channel, content);
          return {
            delivered: true,
            platform: destination.type,
            channel,
          };
        } catch (err) {
          return {
            error: `Delivery failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    list_destinations: tool({
      description: "List available delivery destinations (which chat platforms are configured)",
      inputSchema: z.object({}),
      execute: async () => {
        const destinations: { type: string; available: boolean }[] = [];

        destinations.push({
          type: "slack",
          available: Boolean(ctx.config.slack.botToken),
        });
        destinations.push({
          type: "discord",
          available: Boolean(ctx.config.discord.botToken),
        });
        destinations.push({
          type: "telegram",
          available: Boolean(ctx.config.telegram.botToken),
        });
        destinations.push({
          type: "email",
          available: Boolean(ctx.config.himalayaConfig),
        });

        return { destinations };
      },
    }),
  });
}

// --- Internal helpers ---

async function deliverEmail(
  destination: { address?: string; subject?: string },
  content: string,
  himalayaConfig?: string,
): Promise<Record<string, unknown>> {
  if (!himalayaConfig) {
    return { error: "Email delivery not configured (HIMALAYA_CONFIG not set)" };
  }
  if (!destination.address) {
    return { error: "Email address is required for email delivery" };
  }

  const subject = destination.subject ?? "Message from your AI agent";

  try {
    // Build a minimal MML (MIME Meta Language) message for himalaya
    const mml = `From: agent\nTo: ${destination.address}\nSubject: ${subject}\n\n${content}`;

    const proc = Bun.spawn(
      ["himalaya", "--config", himalayaConfig, "message", "send"],
      {
        stdin: new TextEncoder().encode(mml),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
      },
    );

    const exitCode = await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          proc.kill();
          reject(new Error("himalaya send timed out after 30s"));
        }, 30_000),
      ),
    ]);

    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      return { error: `himalaya send failed (exit ${exitCode}): ${stderr.slice(0, 500)}` };
    }

    return { delivered: true, to: destination.address, subject };
  } catch (err) {
    return {
      error: `Email send failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
