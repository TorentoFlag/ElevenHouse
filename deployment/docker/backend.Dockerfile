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
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${APP_FILTER}" build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace /workspace

ARG APP_DIR
ENV APP_DIR=${APP_DIR}
CMD ["sh", "-c", "node apps/${APP_DIR}/dist/main.js"]
