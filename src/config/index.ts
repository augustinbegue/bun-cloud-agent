import type { MCPSkillConfig } from "../skills/mcp/loader";

export interface AgentConfig {
  /** Server port */
  port: number;

  /** SQLite database path */
  dbPath: string;

  /** Ollama base URL (OpenAI-compatible local inference) */
  ollamaBaseUrl: string;

  /**
   * Model tiers use the `provider:model` format.
   * Examples: `ollama:llama3.1:8b`, `openai:gpt-4o`, `anthropic:claude-sonnet-4-20250514`
   */
  modelFast: string;
  modelDefault: string;
  modelStrong: string;

  /** Agent system instructions */
  systemInstructions: string;

  /** MCP server configurations */
  mcpServers: MCPSkillConfig[];

  /** Slack adapter config */
  slack: {
    botToken: string;
    signingSecret: string;
  };

  /** Discord adapter config */
  discord: {
    applicationId: string;
    botToken: string;
    publicKey: string;
  };

  /** Telegram adapter config */
  telegram: {
    botToken: string;
    secretToken: string;
  };

  /** Path to himalaya config file for email integration */
  himalayaConfig: string;

  /** Whether the task scheduler is enabled (default: true) */
  schedulerEnabled: boolean;

  /** Vault / OpenBao secrets backend config */
  vault: {
    /** Base URL of the Vault or OpenBao server (e.g. https://vault.example.com) */
    addr: string;
    /**
     * Authentication method:
     * - "token"    — static token via VAULT_TOKEN
     * - "approle"  — AppRole login via VAULT_ROLE_ID + VAULT_SECRET_ID
     * - "kubernetes" — Kubernetes SA JWT login via VAULT_K8S_ROLE
     */
    authMethod: "token" | "approle" | "kubernetes";
    /** Static Vault token (authMethod=token) */
    token: string;
    /** AppRole role_id (authMethod=approle) */
    roleId: string;
    /** AppRole secret_id (authMethod=approle) */
    secretId: string;
    /** Kubernetes auth role name (authMethod=kubernetes) */
    k8sRole: string;
    /** Kubernetes auth mount path (default: kubernetes) */
    k8sMount: string;
    /** Vault namespace header for HCP Vault (empty = not sent) */
    namespace: string;
    /** Default KV v2 mount point (default: secret) */
    defaultMount: string;
  };
}

export function loadConfig(): AgentConfig {
  const mcpServersRaw = process.env.MCP_SERVERS;
  let mcpServers: MCPSkillConfig[] = [];
  if (mcpServersRaw) {
    try {
      mcpServers = JSON.parse(mcpServersRaw);
    } catch {
      console.warn("Failed to parse MCP_SERVERS env var, ignoring");
    }
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.DB_PATH ?? "data/agent.db",

    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    modelFast: process.env.MODEL_FAST ?? "ollama:llama3.2:3b",
    modelDefault: process.env.MODEL_DEFAULT ?? "ollama:llama3.1:8b",
    modelStrong: process.env.MODEL_STRONG ?? "openai:gpt-4o",

    systemInstructions:
      process.env.SYSTEM_INSTRUCTIONS ??
      `You are a helpful personal AI assistant. You have access to various tools and skills.
Use them proactively to help the user. Be concise and direct in your responses.
When you learn important information about the user, save it to memory for future reference.`,

    himalayaConfig: process.env.HIMALAYA_CONFIG ?? "",
    schedulerEnabled: process.env.SCHEDULER_ENABLED !== "false",

    mcpServers,

    slack: {
      botToken: process.env.SLACK_BOT_TOKEN ?? "",
      signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
    },
    discord: {
      applicationId: process.env.DISCORD_APPLICATION_ID ?? "",
      botToken: process.env.DISCORD_BOT_TOKEN ?? "",
      publicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      secretToken: process.env.TELEGRAM_SECRET_TOKEN ?? "",
    },

    vault: {
      addr: process.env.VAULT_ADDR ?? "",
      authMethod: (process.env.VAULT_AUTH_METHOD ?? "token") as
        | "token"
        | "approle"
        | "kubernetes",
      token: process.env.VAULT_TOKEN ?? "",
      roleId: process.env.VAULT_ROLE_ID ?? "",
      secretId: process.env.VAULT_SECRET_ID ?? "",
      k8sRole: process.env.VAULT_K8S_ROLE ?? "",
      k8sMount: process.env.VAULT_K8S_MOUNT ?? "kubernetes",
      namespace: process.env.VAULT_NAMESPACE ?? "",
      defaultMount: process.env.VAULT_DEFAULT_MOUNT ?? "secret",
    },
  };
}
