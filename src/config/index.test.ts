import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "./index";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns sensible defaults when no env vars are set", () => {
    // Clear relevant vars to test defaults
    const keys = [
      "PORT", "DB_PATH", "LOCAL_MODEL_URL", "LOCAL_MODEL_FAST", "LOCAL_MODEL_DEFAULT",
      "CLOUD_MODEL_URL", "CLOUD_API_KEY", "CLOUD_MODEL_STRONG", "SYSTEM_INSTRUCTIONS",
      "MCP_SERVERS",
    ];
    for (const k of keys) delete process.env[k];

    const cfg = loadConfig();
    expect(cfg.port).toBe(3000);
    expect(cfg.dbPath).toBe("data/agent.db");
    expect(cfg.localModelUrl).toBe("http://localhost:11434/v1");
    expect(cfg.localModelFast).toBe("llama3.2:3b");
    expect(cfg.localModelDefault).toBe("llama3.1:8b");
    expect(cfg.cloudModelUrl).toBe("https://api.openai.com/v1");
    expect(cfg.cloudModelStrong).toBe("gpt-4o");
    expect(cfg.mcpServers).toEqual([]);
  });

  it("reads PORT from env", () => {
    process.env.PORT = "8080";
    expect(loadConfig().port).toBe(8080);
  });

  it("reads DB_PATH from env", () => {
    process.env.DB_PATH = "/data/custom.db";
    expect(loadConfig().dbPath).toBe("/data/custom.db");
  });

  it("reads cloud config from env", () => {
    process.env.CLOUD_API_KEY = "sk-test";
    process.env.CLOUD_MODEL_STRONG = "gpt-4-turbo";
    const cfg = loadConfig();
    expect(cfg.cloudApiKey).toBe("sk-test");
    expect(cfg.cloudModelStrong).toBe("gpt-4-turbo");
  });

  it("parses valid MCP_SERVERS JSON", () => {
    const servers = [{ name: "my-mcp", transport: { type: "http", url: "http://localhost:9000" } }];
    process.env.MCP_SERVERS = JSON.stringify(servers);
    expect(loadConfig().mcpServers).toEqual(servers);
  });

  it("falls back to empty array on invalid MCP_SERVERS JSON", () => {
    process.env.MCP_SERVERS = "not-valid-json";
    expect(loadConfig().mcpServers).toEqual([]);
  });

  it("reads Slack credentials", () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_SIGNING_SECRET = "secret";
    const cfg = loadConfig();
    expect(cfg.slack.botToken).toBe("xoxb-test");
    expect(cfg.slack.signingSecret).toBe("secret");
  });

  it("reads Telegram credentials", () => {
    process.env.TELEGRAM_BOT_TOKEN = "telegram-token";
    expect(loadConfig().telegram.botToken).toBe("telegram-token");
  });

  it("reads Vault config", () => {
    process.env.VAULT_ADDR = "https://vault.example.com";
    process.env.VAULT_AUTH_METHOD = "approle";
    process.env.VAULT_ROLE_ID = "role-abc";
    const cfg = loadConfig();
    expect(cfg.vault.addr).toBe("https://vault.example.com");
    expect(cfg.vault.authMethod).toBe("approle");
    expect(cfg.vault.roleId).toBe("role-abc");
  });

  it("defaults vault authMethod to token", () => {
    delete process.env.VAULT_AUTH_METHOD;
    expect(loadConfig().vault.authMethod).toBe("token");
  });
});
