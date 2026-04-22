# syntax=docker/dockerfile:1
# Stage 1: Install all dependencies (dev + prod) for building
FROM node:20-alpine AS deps
WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --prod=false

# Stage 2: Build TypeScript
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN pnpm --filter @cv/api build

# Produce a self-contained deployable with only production deps.
# pnpm deploy bundles the filtered workspace (including the freshly-built dist/)
# and installs a pruned node_modules tree.
RUN pnpm --filter @cv/api --prod deploy /app/deploy

# Stage 3: Minimal runtime image
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app

# Copy the self-contained deployment bundle
COPY --from=build /app/deploy ./

# Create data directory for SQLite with correct ownership
RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production

EXPOSE 4000

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
