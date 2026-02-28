# bun-cloud-agent

Cloud-native personal AI assistant built with Bun, AI SDK v6, and Chat SDK. Stateless process with SQLite persistence, local-first inference with cloud fallback, and an extensible skill framework.

## Architecture

```
Chat SDK (Slack/Discord/Telegram) → Bun.serve (HTTP/WS) → AI SDK ToolLoopAgent → Skills
                                                                                    ├─ Built-in tools (memory, time, web-search, shell)
                                                                                    └─ MCP servers (external tool servers)
                                                            ↕
                                                      SQLite (bun:sqlite) for state
```

## Quick Start

```bash
bun install
bun run src/index.ts
```

The server starts on `http://localhost:3000` by default.

### Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /ready` | Readiness check (verifies DB) |
| `GET /api/skills` | List registered skills |
| `POST /api/chat` | Direct HTTP chat (`{ message, conversationId? }`) |
| `WS /ws` | WebSocket streaming chat |
| `POST /webhooks/slack` | Slack webhook |
| `POST /webhooks/discord` | Discord webhook |
| `POST /webhooks/telegram` | Telegram webhook |

## Configuration

All configuration is via environment variables. Create a `.env` file (Bun loads it automatically):

```env
# Server
PORT=3000
DB_PATH=data/agent.db

# Local model (Ollama or any OpenAI-compatible endpoint)
LOCAL_MODEL_URL=http://localhost:11434/v1
LOCAL_MODEL_FAST=llama3.2:3b
LOCAL_MODEL_DEFAULT=llama3.1:8b

# Cloud fallback
CLOUD_MODEL_URL=https://api.openai.com/v1
CLOUD_API_KEY=sk-...
CLOUD_MODEL_STRONG=gpt-4o

# Chat platforms (optional — only configure what you use)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
DISCORD_APPLICATION_ID=...
DISCORD_BOT_TOKEN=...
DISCORD_PUBLIC_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_SECRET_TOKEN=...

# MCP servers (JSON array, optional)
MCP_SERVERS='[{"name":"example","transport":{"type":"http","url":"http://localhost:8080"}}]'
```

## Project Structure

```
src/
  index.ts                  # Bun.serve() entry point
  config/index.ts           # Config loading from env
  agent/
    agent.ts                # ToolLoopAgent setup with model escalation
    model-router.ts         # Local-first → cloud fallback model routing
  skills/
    types.ts                # Skill interface (SkillContext, SkillDefinition)
    index.ts                # SkillRegistry
    built-in/
      memory.ts             # SQLite-backed long-term memory
      time.ts               # Date/time utilities
      web-search.ts         # DuckDuckGo search + URL fetch
      shell.ts              # Sandboxed shell execution
    mcp/
      loader.ts             # MCP server connection manager
  state/
    db.ts                   # SQLite init + migrations
    conversations.ts        # Conversation CRUD
    memory.ts               # Memory persistence
  chat/
    bot.ts                  # Chat SDK setup (Slack, Discord, Telegram)
    handlers.ts             # Message handlers → agent
    state-adapter.ts        # SQLite StateAdapter for Chat SDK
  api/
    routes.ts               # HTTP API routes
    ws.ts                   # WebSocket streaming handler
```

## Skills

Skills are factory functions that return AI SDK `ToolSet` objects:

```ts
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Skill } from "./src/skills/types";

const mySkill: Skill = (ctx) => ({
  my_tool: tool({
    description: "Does something useful",
    inputSchema: z.object({ input: z.string() }),
    execute: async ({ input }) => {
      // Use ctx.db for state, ctx.config for settings
      return { result: input.toUpperCase() };
    },
  }),
});
```

Register in `src/index.ts`:
```ts
registry.register({
  name: "my-skill",
  description: "My custom skill",
  version: "1.0.0",
  skill: mySkill,
});
```

### MCP Tools

External MCP servers are loaded as additional tools. Configure via `MCP_SERVERS` env var:

```json
[
  { "name": "filesystem", "transport": { "type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] } },
  { "name": "web-tools", "transport": { "type": "http", "url": "http://localhost:8080" } }
]
```

## Testing

Unit tests live alongside source files (`*.test.ts`). They run entirely in-process using `bun:sqlite` in-memory databases — no external services required.

```bash
bun test
```

| Test file | What it covers |
|---|---|
| `src/skills/index.test.ts` | `SkillRegistry` register, resolve, list |
| `src/state/db.test.ts` | `initDatabase` schema creation, idempotency |
| `src/state/conversations.test.ts` | Conversation CRUD + thread lookup |
| `src/state/memory.test.ts` | Memory save, recall, delete, list |
| `src/chat/state-adapter.test.ts` | `SQLiteStateAdapter` cache TTL, locks, subscriptions |
| `src/skills/built-in/time.test.ts` | `timeSkill` tool execute functions |
| `src/config/index.test.ts` | `loadConfig` env var defaults |

Components requiring live infrastructure (model endpoints, MCP servers, chat platforms) are not covered by unit tests.

## Docker

```bash
docker compose up --build
```

SQLite data persists in a named volume (`agent-data`). Configure environment variables in `docker-compose.yaml` or via `.env`.

## Model Routing

The agent uses a tiered model strategy:

| Tier | Default | Use |
|---|---|---|
| `fast` | `llama3.2:3b` (local) | Quick, simple tasks |
| `default` | `llama3.1:8b` (local) | Standard conversations |
| `strong` | `gpt-4o` (cloud) | Complex tasks, auto-escalated after 10 steps |

## Design Principles

- **Skills are tools** — every capability is an AI SDK `tool()`, built-in or MCP
- **AI SDK is the brain** — agent loop, tool calling, streaming, model abstraction
- **Chat SDK is the interface** — multi-platform chat without rebuilding adapters
- **SQLite is the state** — conversations, memory, config, Chat SDK state
- **Bun-native** — `Bun.serve()`, `bun:sqlite`, `Bun.$`, no Express/Fastify
- **Stateless process** — all state in SQLite on PVC, process can restart without data loss
