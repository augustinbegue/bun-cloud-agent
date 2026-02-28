# bun-cloud-agent

Cloud-native personal AI assistant. Stateless Bun process + SQLite (PVC-backed) + AI SDK v6 agent loop + Chat SDK for platform integrations.

## Commands

- `bun run src/index.ts` — start the server (port 3000)
- `bun test` — run tests
- `bunx tsc --noEmit` — type-check
- `docker compose up --build` — run in Docker with persistent volume

## Bun-first

Default to Bun instead of Node.js.

- `bun <file>` not `node`/`ts-node`
- `bun install` not `npm`/`yarn`/`pnpm`
- `bun test` not `jest`/`vitest`
- `bunx` not `npx`
- Bun auto-loads `.env` — no dotenv

### Bun-native APIs (no extra deps)

- `Bun.serve()` for HTTP/WS/routes — no Express/Fastify
- `bun:sqlite` for SQLite — no better-sqlite3
- `Bun.file()` for file I/O — no fs readFile/writeFile
- `Bun.$` for shell — no execa

## Architecture

```
Chat SDK (Slack/Discord/Telegram) → Bun.serve → ToolLoopAgent → Skills (tool()) + MCP
                                                      ↕
                                                SQLite (bun:sqlite)
```

### Key packages

| Package | Role |
|---|---|
| `ai` (v6) | ToolLoopAgent, tool(), streamText, generateText |
| `@ai-sdk/openai` | OpenAI-compatible provider (Ollama, cloud) |
| `@ai-sdk/mcp` | MCP client for external tool servers |
| `chat` + `@chat-adapter/*` | Multi-platform chat bot (Slack, Discord, Telegram) |
| `zod` (v4) | Schema validation for tool inputs |

## Project structure

```
src/
  index.ts                  # Entry point — Bun.serve() + bootstrap
  config/index.ts           # Env-based config
  agent/
    agent.ts                # ToolLoopAgent with model escalation (prepareStep)
    model-router.ts         # Local-first → cloud fallback (fast/default/strong)
  skills/
    types.ts                # Skill, SkillContext, SkillDefinition interfaces
    index.ts                # SkillRegistry (register + resolve → ToolSet)
    built-in/               # memory, time, web-search, shell
    mcp/loader.ts           # MCP server connection manager (HTTP + stdio)
  state/
    db.ts                   # SQLite init (WAL mode) + schema
    conversations.ts        # Conversation CRUD
    memory.ts               # Memory persistence
  chat/
    bot.ts                  # Chat SDK setup with conditional adapters
    handlers.ts             # onNewMention/onSubscribedMessage → agent.generate()
    state-adapter.ts        # SQLite StateAdapter (locks, cache, subscriptions)
  api/
    routes.ts               # /health, /ready, /api/chat, /api/skills
    ws.ts                   # WebSocket streaming handler
```

## Skills pattern

Skills are factory functions `(ctx: SkillContext) => ToolSet`. They receive `{ db, config }` and return AI SDK `tool()` objects. Register in `src/index.ts` via `registry.register()`.

MCP servers are also loaded as tools via `@ai-sdk/mcp` `createMCPClient` — configure via `MCP_SERVERS` env var (JSON array).

## Model routing

| Tier | Default model | When used |
|---|---|---|
| `fast` | llama3.2:3b (local) | Quick tasks |
| `default` | llama3.1:8b (local) | Standard conversations |
| `strong` | gpt-4o (cloud) | Complex tasks, auto-escalated after 10 agent steps |

## Conventions

- All state in SQLite — process is stateless and can restart without data loss
- Config via env vars only (Bun auto-loads .env)
- Chat adapters only instantiated when credentials are present
- Graceful shutdown: SIGINT/SIGTERM close MCP clients, Chat SDK, and DB
