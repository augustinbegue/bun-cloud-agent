# bun-cloud-agent

Cloud-native personal AI assistant. Stateless Bun process + SQLite (PVC-backed) + AI SDK v6 agent loop + Chat SDK for platform integrations.

## Commands

- `bun run src/index.ts` — start the server (port 3000)
- `bun run test` — run tests
- `bun run test:coverage` — run tests with coverage report
- `bun run typecheck` — type-check (`tsc --noEmit`)
- `docker compose up --build` — run in Docker with persistent volume

## Testing

Unit tests live alongside source files (`*.test.ts`). They use `bun:sqlite` in-memory databases — no external services required.

| Test file | What it covers |
|---|---|
| `src/skills/index.test.ts` | `SkillRegistry` register, resolve, list |
| `src/state/db.test.ts` | `initDatabase` schema creation, idempotency |
| `src/state/conversations.test.ts` | Conversation CRUD + thread lookup |
| `src/state/memory.test.ts` | Memory save, recall, delete, list |
| `src/chat/state-adapter.test.ts` | `SQLiteStateAdapter` cache TTL, locks, subscriptions |
| `src/skills/built-in/time.test.ts` | `timeSkill` tool execute functions |
| `src/config/index.test.ts` | `loadConfig` env var defaults |

Components **not** covered by unit tests (require live infrastructure): `createAgent` (model), `loadMCPSkills` (MCP servers), chat bot handlers (Slack/Discord/Telegram).

### Test conventions

- All tests use `bun:test` exclusively (`describe`, `it`, `expect`) — no external test libraries.
- Co-located with source as `*.test.ts`.
- SQLite-dependent tests use `initDatabase(":memory:")` in `beforeEach` and `db.close()` in `afterEach`.
- Use nested `describe` when a module has distinct sub-features (e.g. cache, locks); flat otherwise.
- No mocking framework — tests use real implementations or trivial fakes (`{} as never`).
- Use `!` non-null assertions on indexed array access (required by `noUncheckedIndexedAccess`).
- Timer-dependent tests (TTL, lock expiry) use ≥50ms delays to avoid CI flakes.

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
    model-router.ts         # Multi-provider model registry (provider:model format)
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

Models use `provider:model` format (e.g. `ollama:llama3.1:8b`, `openai:gpt-4o`, `anthropic:claude-sonnet-4-20250514`).

| Tier | Default | Env var | When used |
|---|---|---|---|
| `fast` | `ollama:llama3.2:3b` | `MODEL_FAST` | Quick tasks |
| `default` | `ollama:llama3.1:8b` | `MODEL_DEFAULT` | Standard conversations |
| `strong` | `openai:gpt-4o` | `MODEL_STRONG` | Complex tasks, auto-escalated after 10 agent steps |

Supported providers: `ollama`, `openai`, `anthropic`, `google`, `vertex`, `mistral`, `cohere`, `bedrock`, `azure`, `xai`, `groq`, `deepseek`, `cerebras`, `fireworks`, `togetherai`, `perplexity`. Each reads credentials from its standard env var (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## CI

GitHub Actions workflows in `.github/workflows/`:

| Workflow | File | Trigger |
|---|---|---|
| CI | `ci.yml` | Push + PR to `main` — type-check + tests with coverage |
| Docker Build | `docker-publish.yml` | Push + PR to `main` — build & push to GHCR |
| Helm Release | `helm-release.yml` | Changes to `helm/` — publish Helm chart |

## Conventions

- All state in SQLite — process is stateless and can restart without data loss
- Config via env vars only (Bun auto-loads .env)
- Chat adapters only instantiated when credentials are present
- Graceful shutdown: SIGINT/SIGTERM close MCP clients, Chat SDK, and DB
