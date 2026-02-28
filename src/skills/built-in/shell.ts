import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";

/** Maximum execution time for shell commands (10 seconds) */
const SHELL_TIMEOUT_MS = 10_000;

/** Commands that are never allowed */
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b:(){ :|:& };:/,
  /\bfork\s+bomb/i,
  /\bshutdown\b/,
  /\breboot\b/,
];

export const shellSkill: Skill = () => ({
  run_shell: tool({
    description:
      "Execute a shell command and return stdout/stderr. Use for file operations, system info, package management, etc. Commands are time-limited and sandboxed.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to project root)"),
    }),
    execute: async ({ command, cwd }) => {
      // Safety check
      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          return {
            error: "Command blocked for safety reasons",
            exitCode: -1,
          };
        }
      }

      try {
        const proc = Bun.spawn(["sh", "-c", command], {
          cwd: cwd ?? process.cwd(),
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, TERM: "dumb" },
        });

        // Race between command completion and timeout
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => {
            proc.kill();
            reject(new Error(`Command timed out after ${SHELL_TIMEOUT_MS}ms`));
          }, SHELL_TIMEOUT_MS)
        );

        const result = await Promise.race([proc.exited, timeout]);
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();

        return {
          stdout: stdout.slice(0, 8000),
          stderr: stderr.slice(0, 2000),
          exitCode: result,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          exitCode: -1,
        };
      }
    },
  }),
});
