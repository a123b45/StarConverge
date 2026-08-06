FROM node:22-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY admin/package.json admin/
RUN pnpm install --frozen-lockfile=false
COPY server server
COPY admin admin
RUN pnpm --filter @starconverge/admin build \
 && pnpm --filter @starconverge/server build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/starconverge.db
COPY --from=build /app /app
COPY deploy/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data
EXPOSE 8787
ENTRYPOINT ["/entrypoint.sh"]
