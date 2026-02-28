import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";

/**
 * Email skill — typed wrappers around the himalaya CLI.
 *
 * All tools shell out to `himalaya --output json` and return
 * structured data. Himalaya must be installed and configured
 * (see HIMALAYA_CONFIG env var).
 */
export const emailSkill: Skill = (ctx) => {
  const himalayaConfig = ctx.config.himalayaConfig;

  function himalayaArgs(...args: string[]): string[] {
    const base = ["himalaya", "--output", "json"];
    if (himalayaConfig) {
      base.push("--config", himalayaConfig);
    }
    return [...base, ...args];
  }

  async function runHimalaya(...args: string[]): Promise<{ data?: unknown; error?: string }> {
    if (!himalayaConfig) {
      return { error: "Email not configured (HIMALAYA_CONFIG not set). Install himalaya and set the env var." };
    }

    const cmd = himalayaArgs(...args);
    try {
      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
      });

      const exitCode = await Promise.race([
        proc.exited,
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            proc.kill();
            reject(new Error("himalaya command timed out after 30s"));
          }, 30_000),
        ),
      ]);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode !== 0) {
        return { error: `himalaya failed (exit ${exitCode}): ${stderr.slice(0, 500)}` };
      }

      try {
        return { data: JSON.parse(stdout) };
      } catch {
        // Some commands return non-JSON output
        return { data: stdout.trim() };
      }
    } catch (err) {
      return { error: `himalaya error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return {
    list_emails: tool({
      description: "List email envelopes (subject, from, date) from a folder. Uses himalaya CLI.",
      inputSchema: z.object({
        folder: z.string().optional().describe("Mail folder (default: INBOX)"),
        page: z.number().optional().describe("Page number (default: 1)"),
        pageSize: z.number().optional().describe("Emails per page (default: 20)"),
        account: z.string().optional().describe("Himalaya account name (if multiple configured)"),
      }),
      execute: async ({ folder, page, pageSize, account }) => {
        const args = ["envelope", "list"];
        if (folder) args.push("--folder", folder);
        if (page) args.push("--page", String(page));
        if (pageSize) args.push("--page-size", String(pageSize));
        if (account) args.unshift("--account", account);
        return runHimalaya(...args);
      },
    }),

    read_email: tool({
      description: "Read the full content of an email by its ID",
      inputSchema: z.object({
        id: z.string().describe("Email envelope ID"),
        folder: z.string().optional().describe("Mail folder (default: INBOX)"),
        account: z.string().optional().describe("Himalaya account name"),
      }),
      execute: async ({ id, folder, account }) => {
        const args = ["message", "read", id];
        if (folder) args.push("--folder", folder);
        if (account) args.unshift("--account", account);
        return runHimalaya(...args);
      },
    }),

    search_emails: tool({
      description: "Search emails using IMAP search syntax (e.g. 'from:boss subject:urgent')",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        folder: z.string().optional().describe("Mail folder to search (default: INBOX)"),
        account: z.string().optional().describe("Himalaya account name"),
      }),
      execute: async ({ query, folder, account }) => {
        const args = ["envelope", "list", "--query", query];
        if (folder) args.push("--folder", folder);
        if (account) args.unshift("--account", account);
        return runHimalaya(...args);
      },
    }),

    send_email: tool({
      description: "Send an email via himalaya/SMTP",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body text"),
        from: z.string().optional().describe("Sender address (uses default if omitted)"),
        account: z.string().optional().describe("Himalaya account name"),
      }),
      execute: async ({ to, subject, body, from, account }) => {
        if (!himalayaConfig) {
          return { error: "Email not configured (HIMALAYA_CONFIG not set)" };
        }

        const headers = [
          ...(from ? [`From: ${from}`] : []),
          `To: ${to}`,
          `Subject: ${subject}`,
        ].join("\n");
        const mml = `${headers}\n\n${body}`;

        const cmd = himalayaArgs(
          ...(account ? ["--account", account] : []),
          "message",
          "send",
        );

        try {
          const proc = Bun.spawn(cmd, {
            stdin: new TextEncoder().encode(mml),
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env },
          });

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
            return { error: `Send failed (exit ${exitCode}): ${stderr.slice(0, 500)}` };
          }

          return { sent: true, to, subject };
        } catch (err) {
          return { error: `Send failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    }),

    reply_email: tool({
      description: "Reply to an email by ID",
      inputSchema: z.object({
        id: z.string().describe("Email envelope ID to reply to"),
        body: z.string().describe("Reply body text"),
        folder: z.string().optional().describe("Mail folder (default: INBOX)"),
        account: z.string().optional().describe("Himalaya account name"),
      }),
      execute: async ({ id, body, folder, account }) => {
        if (!himalayaConfig) {
          return { error: "Email not configured (HIMALAYA_CONFIG not set)" };
        }

        const cmd = himalayaArgs(
          ...(account ? ["--account", account] : []),
          "message",
          "reply",
          id,
          ...(folder ? ["--folder", folder] : []),
        );

        try {
          const proc = Bun.spawn(cmd, {
            stdin: new TextEncoder().encode(body),
            stdout: "pipe",
            stderr: "pipe",
            env: { ...process.env },
          });

          const exitCode = await Promise.race([
            proc.exited,
            new Promise<never>((_, reject) =>
              setTimeout(() => {
                proc.kill();
                reject(new Error("himalaya reply timed out after 30s"));
              }, 30_000),
            ),
          ]);

          const stderr = await new Response(proc.stderr).text();

          if (exitCode !== 0) {
            return { error: `Reply failed (exit ${exitCode}): ${stderr.slice(0, 500)}` };
          }

          return { replied: true, id };
        } catch (err) {
          return { error: `Reply failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    }),

    list_folders: tool({
      description: "List available email folders/mailboxes",
      inputSchema: z.object({
        account: z.string().optional().describe("Himalaya account name"),
      }),
      execute: async ({ account }) => {
        const args = ["folder", "list"];
        if (account) args.unshift("--account", account);
        return runHimalaya(...args);
      },
    }),
  };
};
