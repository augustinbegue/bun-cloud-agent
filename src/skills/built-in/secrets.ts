import { tool } from "ai";
import { z } from "zod";
import type { Skill } from "../types";
import { VaultClient } from "./vault-client";

export const secretsSkill: Skill = (ctx) => {
  const client = new VaultClient(ctx.config.vault);

  return {
    read_secret: tool({
      description:
        "Read a secret stored in Vault / OpenBao. " +
        "Provide the path (e.g. 'myapp/database') and optionally a specific key to retrieve a single value. " +
        "Returns the full key/value map unless a specific key is requested.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Secret path relative to the KV mount (e.g. 'myapp/database')",
          ),
        key: z
          .string()
          .optional()
          .describe(
            "If provided, return only this key from the secret map instead of all keys",
          ),
        mount: z
          .string()
          .optional()
          .describe(
            "KV v2 mount point to use (defaults to VAULT_DEFAULT_MOUNT)",
          ),
      }),
      execute: async ({ path, key, mount }) => {
        try {
          const data = await client.kvRead(path, mount);
          if (key !== undefined) {
            if (!(key in data)) {
              return { error: `Key '${key}' not found at path '${path}'` };
            }
            return { path, key, value: data[key] };
          }
          return { path, data };
        } catch (err) {
          return {
            error: `Failed to read secret at '${path}': ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    write_secret: tool({
      description:
        "Write (store or update) a secret in Vault / OpenBao. " +
        "Provide the path and a key/value map. " +
        "Returns the version number of the written secret.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Secret path relative to the KV mount (e.g. 'myapp/api-keys')",
          ),
        data: z
          .record(z.string())
          .describe("Key/value pairs to store under this path"),
        mount: z
          .string()
          .optional()
          .describe(
            "KV v2 mount point to use (defaults to VAULT_DEFAULT_MOUNT)",
          ),
      }),
      execute: async ({ path, data, mount }) => {
        try {
          const version = await client.kvWrite(path, data, mount);
          return { path, version, keys: Object.keys(data) };
        } catch (err) {
          return {
            error: `Failed to write secret at '${path}': ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    list_secrets: tool({
      description:
        "List secret paths under a given prefix in Vault / OpenBao. " +
        "Keys ending in '/' are sub-folders. " +
        "Use an empty path to list at the root of the mount.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Directory prefix to list (e.g. 'myapp/' or '' for root of mount)",
          ),
        mount: z
          .string()
          .optional()
          .describe(
            "KV v2 mount point to use (defaults to VAULT_DEFAULT_MOUNT)",
          ),
      }),
      execute: async ({ path, mount }) => {
        try {
          const keys = await client.kvList(path, mount);
          return { path, keys, count: keys.length };
        } catch (err) {
          return {
            error: `Failed to list secrets at '${path}': ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),
  };
};
