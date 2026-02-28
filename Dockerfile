# syntax=docker/dockerfile:1

# --- Install dependencies ---
FROM oven/bun:1 AS install
WORKDIR /tmp/app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# --- Build stage ---
FROM oven/bun:1 AS build
WORKDIR /tmp/app

COPY package.json bun.lock* tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src/ src/

# --- Production ---
FROM oven/bun:1-slim AS release
WORKDIR /app

COPY --from=install /tmp/app/node_modules node_modules
COPY --from=build /tmp/app/src src
COPY --from=build /tmp/app/package.json .
COPY --from=build /tmp/app/tsconfig.json .

# Create data directory for SQLite PVC mount
RUN mkdir -p /app/data && chown bun:bun /app/data
VOLUME ["/app/data"]

USER bun
EXPOSE 3000/tcp

ENV DB_PATH=/app/data/agent.db

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["bun", "run", "src/index.ts"]