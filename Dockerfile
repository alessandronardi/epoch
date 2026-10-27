# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Native SQLite can fall back to node-gyp when no prebuilt binary is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.14.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/bots/package.json ./packages/bots/package.json
COPY packages/content/package.json ./packages/content/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
COPY packages/sim/package.json ./packages/sim/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm content:validate \
    && pnpm art:placeholders \
    && pnpm art:build \
    && pnpm typecheck \
    && pnpm build \
    && pnpm exec tsx tools/check-bundle-budget.ts \
    && pnpm --filter @epochs/server --prod deploy /out/server \
    && cd /out/server \
    && node --input-type=module -e "const { createEpochsServer } = await import('./dist/server.js'); const server = await createEpochsServer({ logger: false }); try { const res = await server.app.inject('/api/v1/healthz'); if (res.statusCode !== 200) throw new Error('healthz failed'); } finally { await server.close(); }"

# Export the PWA for an HTTPS static host / reverse proxy with BuildKit --output.
FROM scratch AS web
COPY --from=build /app/apps/web/dist/ /

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/epochs.sqlite \
    LOG_LEVEL=info

RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /out/server/ ./
USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/v1/healthz', { signal: AbortSignal.timeout(4000) }); process.exit(r.ok ? 0 : 1)"

CMD ["node", "dist/server.js"]
