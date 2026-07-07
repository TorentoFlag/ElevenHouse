# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /workspace
ENV CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

ARG APP_FILTER
ARG VITE_ASTROLOGER_WEB_ORIGIN
ENV VITE_ASTROLOGER_WEB_ORIGIN=${VITE_ASTROLOGER_WEB_ORIGIN}
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${APP_FILTER}..." build

FROM caddy:2-alpine AS runtime
ARG APP_DIR
COPY deployment/docker/frontend.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/${APP_DIR}/dist /srv
EXPOSE 8080
