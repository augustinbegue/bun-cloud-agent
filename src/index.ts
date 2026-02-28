import { loadConfig } from "./config";
import { initDatabase } from "./state/db";
import { SkillRegistry } from "./skills";
import { memorySkill } from "./skills/built-in/memory";
import { timeSkill } from "./skills/built-in/time";
import { webSearchSkill } from "./skills/built-in/web-search";
import { shellSkill } from "./skills/built-in/shell";
import { loadMCPSkills, closeMCPClients } from "./skills/mcp/loader";
import { secretsSkill } from "./skills/built-in/secrets";
import { createModelRouter } from "./agent/model-router";
import { createAgent } from "./agent/agent";
import { setupBot } from "./chat/bot";
import { createRoutes } from "./api/routes";
import { createWebSocketHandler, type WSData } from "./api/ws";
import type { SkillContext } from "./skills/types";

// --- Bootstrap ---
const config = loadConfig();
const db = initDatabase(config.dbPath);

// --- Skills ---
const registry = new SkillRegistry();

registry.register({
  name: "memory",
  description: "Long-term memory persistence",
  version: "1.0.0",
  skill: memorySkill,
});

registry.register({
  name: "time",
  description: "Date and time utilities",
  version: "1.0.0",
  skill: timeSkill,
});

registry.register({
  name: "web-search",
  description: "Web search and URL fetching",
  version: "1.0.0",
  skill: webSearchSkill,
});

registry.register({
  name: "shell",
  description: "Sandboxed shell command execution",
  version: "1.0.0",
  skill: shellSkill,
});

if (config.vault.addr) {
  registry.register({
    name: "secrets",
    description: "Read, write, and list secrets stored in Vault / OpenBao",
    version: "1.0.0",
    skill: secretsSkill,
  });
}

// Load MCP tools from config
const mcpTools = await loadMCPSkills(config.mcpServers);

// --- Agent ---
const ctx: SkillContext = { db, config };
const router = createModelRouter(config);
const agent = createAgent(registry, ctx, router, mcpTools);

// --- Chat Bot ---
const chat = setupBot(agent, config, db);

// --- HTTP + WS Server ---
const routes = createRoutes(agent, registry, db);
const wsHandler = createWebSocketHandler(agent, db);

// Build webhook routes dynamically based on configured adapters
const webhookRoutes: Record<string, (req: Request) => Promise<Response> | Response> = {};

if (config.slack.botToken && config.slack.signingSecret) {
  webhookRoutes["/webhooks/slack"] = (req: Request) =>
    (chat.webhooks as any).slack(req, { waitUntil: (p: Promise<unknown>) => { p.catch(() => {}); } });
}
if (config.discord.botToken && config.discord.publicKey) {
  webhookRoutes["/webhooks/discord"] = (req: Request) =>
    (chat.webhooks as any).discord(req, { waitUntil: (p: Promise<unknown>) => { p.catch(() => {}); } });
}
if (config.telegram.botToken) {
  webhookRoutes["/webhooks/telegram"] = (req: Request) =>
    (chat.webhooks as any).telegram(req, { waitUntil: (p: Promise<unknown>) => { p.catch(() => {}); } });
}

const server = Bun.serve<WSData>({
  port: config.port,
  routes: {
    ...routes,
    ...webhookRoutes,
  },
  websocket: wsHandler,
  // Upgrade WebSocket requests on /ws
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { conversationId: "" },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[server] bun-cloud-agent running on http://localhost:${server.port}`);
console.log(`[server] Skills loaded: ${registry.list().map((s) => s.name).join(", ")}`);
if (Object.keys(mcpTools).length > 0) {
  console.log(`[server] MCP tools loaded: ${Object.keys(mcpTools).join(", ")}`);
}

// --- Graceful shutdown ---
process.on("SIGINT", async () => {
  console.log("\n[server] Shutting down...");
  await closeMCPClients();
  await chat.shutdown();
  db.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[server] SIGTERM received, shutting down...");
  await closeMCPClients();
  await chat.shutdown();
  db.close();
  process.exit(0);
});