# syntax=docker/dockerfile:1
# Stage 1: Install all dependencies (dev + prod) for building
FROM node:20-alpine AS deps
WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/app/package.json apps/app/

RUN pnpm install --frozen-lockfile --prod=false

# Stage 2: Build the Vite React app
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY apps/app/ apps/app/

RUN pnpm --filter @cv/app build

# Stage 3: Serve static files via nginx
FROM nginx:alpine AS runtime

COPY apps/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/app/dist /usr/share/nginx/html

EXPOSE 80
