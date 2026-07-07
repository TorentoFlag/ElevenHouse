# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ElevenHouse production deployment foundation for `152.239.118.53`, with Dockerized frontends/backends/workers, Caddy routing, PostgreSQL/Redis/MinIO on the VPS, and GitHub Actions deployment on push to `main`.

**Architecture:** GitHub Actions builds immutable GHCR images for each deployable app and deploys them to a single VPS running Docker Compose. Caddy is the only public HTTP(S) entrypoint and proxies each domain to a frontend container, while same-origin `/api/*` traffic is routed to the matching backend container. PostgreSQL, Redis and MinIO run on the same VPS in the first production stage with persistent volumes and explicit backup/restore operations.

**Tech Stack:** Docker Engine, Docker Compose, Caddy, GitHub Actions, GHCR, Node.js 24, pnpm 10, Vite, NestJS, PostgreSQL 17, Redis 8, MinIO.

---

## File Structure

Create:

- `.dockerignore` - keep local/generated files out of Docker build contexts.
- `deployment/docker/backend.Dockerfile` - builds backend and worker Node runtime images.
- `deployment/docker/frontend.Dockerfile` - builds Vite frontend static images.
- `deployment/docker/frontend.Caddyfile` - internal static-server config for frontend containers.
- `deployment/docker/db-migrator.Dockerfile` - builds a migration runner image.
- `deployment/compose/compose.production.yml` - server-side production Compose stack.
- `deployment/caddy/Caddyfile` - edge domain routing.
- `deployment/env/.env.production.example` - production runtime env contract without real secrets.
- `deployment/env/.env.deploy.example` - deploy-time image tag and image namespace contract.
- `deployment/server/bootstrap.sh` - idempotent first-server bootstrap script.
- `deployment/server/backup-postgres.sh` - PostgreSQL backup helper.
- `deployment/server/restore-postgres.sh` - PostgreSQL restore helper.
- `.github/workflows/ci.yml` - verification workflow.
- `.github/workflows/deploy.yml` - build, publish and deploy workflow.
- `packages/observability/src/readiness.ts` - shared minimal readiness HTTP server for placeholder workers.

Modify:

- `packages/observability/src/index.ts` - export readiness helpers.
- `apps/workers/src/main.ts` - expose `/live` and `/ready`.
- `apps/payment-worker/src/main.ts` - expose `/live` and `/ready`.
- `apps/chart-worker/src/main.ts` - expose `/live` and `/ready`.

Do not modify:

- Development `docker-compose.yml`; it remains local infrastructure only.
- User-facing frontend behavior.
- Domain workflows.
- Existing dirty or unrelated work if it appears during execution.

---

### Task 1: Add Docker Context Hygiene

**Files:**

- Create: `.dockerignore`

- [ ] **Step 1: Create Docker ignore file**

Create `.dockerignore` with this exact content:

```dockerignore
.git
.github
.turbo
.DS_Store
.env
.env.*
!.env.example
node_modules
dist
coverage
build
out
.vite
*.log
*.tsbuildinfo
ElevenHouseDesign
docs/superpowers
```

- [ ] **Step 2: Verify Docker ignore syntax**

Run:

```bash
test -f .dockerignore && sed -n '1,120p' .dockerignore
```

Expected: file content prints and includes `node_modules`, `dist`, `.env.*`, and `ElevenHouseDesign`.

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: add docker build ignore rules"
```

---

### Task 2: Add Worker HTTP Readiness for Placeholder Workers

**Files:**

- Create: `packages/observability/src/readiness.ts`
- Modify: `packages/observability/src/index.ts`
- Modify: `apps/workers/src/main.ts`
- Modify: `apps/payment-worker/src/main.ts`
- Modify: `apps/chart-worker/src/main.ts`

- [ ] **Step 1: Write failing readiness tests**

Create `packages/observability/src/readiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createReadinessResponse } from "./readiness";

describe("createReadinessResponse", () => {
  it("returns a stable ready response", () => {
    expect(createReadinessResponse("payment-worker", new Date("2026-07-07T00:00:00.000Z"))).toEqual({
      service: "payment-worker",
      status: "ready",
      timestamp: "2026-07-07T00:00:00.000Z"
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- packages/observability/src/readiness.test.ts
```

Expected: FAIL because `./readiness` does not exist.

- [ ] **Step 3: Implement shared readiness HTTP helper**

Create `packages/observability/src/readiness.ts`:

```ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type BasicWorkerReadiness = {
  readonly service: string;
  readonly status: "ready";
  readonly timestamp: string;
};

export function createReadinessResponse(
  service: string,
  now: Date = new Date()
): BasicWorkerReadiness {
  return {
    service,
    status: "ready",
    timestamp: now.toISOString()
  };
}

export function createBasicWorkerReadinessServer(input: {
  readonly service: string;
  readonly getReadiness?: () => Promise<BasicWorkerReadiness> | BasicWorkerReadiness;
}): Server {
  return createServer(async (request, response) => {
    const pathname = getRequestPathname(request);

    if (pathname === "/live") {
      writeJson(response, 200, { status: "alive" });
      return;
    }

    if (pathname !== "/ready") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    try {
      const readiness = await (input.getReadiness?.() ?? createReadinessResponse(input.service));
      writeJson(response, 200, readiness);
    } catch (error) {
      writeJson(response, 503, {
        service: input.service,
        status: "unready",
        timestamp: new Date().toISOString(),
        error: normalizeErrorMessage(error)
      });
    }
  });
}

export function listenReadinessServer(input: {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    input.server.once("error", reject);
    input.server.listen(input.port, input.host, () => {
      input.server.off("error", reject);
      resolve();
    });
  });
}

function getRequestPathname(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim().slice(0, 500);
  }

  return "readiness check failed";
}
```

Append this export to `packages/observability/src/index.ts`:

```ts
export * from "./readiness";
```

- [ ] **Step 4: Update placeholder worker entrypoints**

Replace `apps/workers/src/main.ts` with:

```ts
import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer
} from "@elevenhouse/observability";

const service = "workers";
const logger = createLogger(service);
const readinessHost = process.env.WORKERS_HEALTH_HOST ?? "0.0.0.0";
const readinessPort = Number.parseInt(process.env.WORKERS_HEALTH_PORT ?? "3010", 10);
const readinessServer = createBasicWorkerReadinessServer({ service });

listenReadinessServer({
  server: readinessServer,
  host: readinessHost,
  port: readinessPort
})
  .then(() => {
    logger.info("worker process ready", {
      ...createReadinessResponse(service),
      host: readinessHost,
      port: readinessPort
    });
  })
  .catch((error: unknown) => {
    logger.error("worker readiness server failed", { error });
    process.exit(1);
  });
```

Replace `apps/payment-worker/src/main.ts` with:

```ts
import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer
} from "@elevenhouse/observability";

const service = "payment-worker";
const logger = createLogger(service);
const readinessHost = process.env.PAYMENT_WORKER_HEALTH_HOST ?? "0.0.0.0";
const readinessPort = Number.parseInt(process.env.PAYMENT_WORKER_HEALTH_PORT ?? "3011", 10);
const readinessServer = createBasicWorkerReadinessServer({ service });

listenReadinessServer({
  server: readinessServer,
  host: readinessHost,
  port: readinessPort
})
  .then(() => {
    logger.info("payment worker ready", {
      ...createReadinessResponse(service),
      host: readinessHost,
      port: readinessPort
    });
  })
  .catch((error: unknown) => {
    logger.error("payment worker readiness server failed", { error });
    process.exit(1);
  });
```

Replace `apps/chart-worker/src/main.ts` with:

```ts
import {
  createBasicWorkerReadinessServer,
  createLogger,
  createReadinessResponse,
  listenReadinessServer
} from "@elevenhouse/observability";

const service = "chart-worker";
const logger = createLogger(service);
const readinessHost = process.env.CHART_WORKER_HEALTH_HOST ?? "0.0.0.0";
const readinessPort = Number.parseInt(process.env.CHART_WORKER_HEALTH_PORT ?? "3012", 10);
const readinessServer = createBasicWorkerReadinessServer({ service });

listenReadinessServer({
  server: readinessServer,
  host: readinessHost,
  port: readinessPort
})
  .then(() => {
    logger.info("chart worker ready", {
      ...createReadinessResponse(service),
      host: readinessHost,
      port: readinessPort
    });
  })
  .catch((error: unknown) => {
    logger.error("chart worker readiness server failed", { error });
    process.exit(1);
  });
```

- [ ] **Step 5: Run targeted test and typecheck**

Run:

```bash
pnpm test -- packages/observability/src/readiness.test.ts
pnpm --filter @elevenhouse/observability typecheck
pnpm --filter @elevenhouse/workers typecheck
pnpm --filter @elevenhouse/payment-worker typecheck
pnpm --filter @elevenhouse/chart-worker typecheck
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/observability/src apps/workers/src/main.ts apps/payment-worker/src/main.ts apps/chart-worker/src/main.ts
git commit -m "feat: expose readiness for placeholder workers"
```

---

### Task 3: Add Production Dockerfiles

**Files:**

- Create: `deployment/docker/backend.Dockerfile`
- Create: `deployment/docker/frontend.Dockerfile`
- Create: `deployment/docker/frontend.Caddyfile`
- Create: `deployment/docker/db-migrator.Dockerfile`

- [ ] **Step 1: Create backend Dockerfile**

Create `deployment/docker/backend.Dockerfile`:

```dockerfile
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
```

- [ ] **Step 2: Create frontend Dockerfile and internal Caddy config**

Create `deployment/docker/frontend.Caddyfile`:

```caddyfile
:8080 {
	root * /srv
	encode zstd gzip
	try_files {path} /index.html
	file_server
}
```

Create `deployment/docker/frontend.Dockerfile`:

```dockerfile
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
RUN pnpm --filter "${APP_FILTER}" build

FROM caddy:2-alpine AS runtime
ARG APP_DIR
COPY deployment/docker/frontend.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/${APP_DIR}/dist /srv
EXPOSE 8080
```

- [ ] **Step 3: Create DB migrator Dockerfile**

Create `deployment/docker/db-migrator.Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
CMD ["pnpm", "db:migrate"]
```

- [ ] **Step 4: Build a representative backend image locally**

Run:

```bash
docker build \
  -f deployment/docker/backend.Dockerfile \
  --build-arg APP_FILTER=@elevenhouse/admin-api \
  --build-arg APP_DIR=admin-api \
  -t elevenhouse-admin-api:test .
```

Expected: image builds successfully.

- [ ] **Step 5: Build a representative frontend image locally**

Run:

```bash
docker build \
  -f deployment/docker/frontend.Dockerfile \
  --build-arg APP_FILTER=@elevenhouse/admin-web \
  --build-arg APP_DIR=admin-web \
  -t elevenhouse-admin-web:test .
```

Expected: image builds successfully.

- [ ] **Step 6: Build migrator image locally**

Run:

```bash
docker build \
  -f deployment/docker/db-migrator.Dockerfile \
  -t elevenhouse-db-migrator:test .
```

Expected: image builds successfully.

- [ ] **Step 7: Commit**

```bash
git add deployment/docker
git commit -m "build: add production dockerfiles"
```

---

### Task 4: Add Production Compose and Edge Caddy Routing

**Files:**

- Create: `deployment/compose/compose.production.yml`
- Create: `deployment/caddy/Caddyfile`
- Create: `deployment/env/.env.deploy.example`
- Create: `deployment/env/.env.production.example`

- [ ] **Step 1: Add deploy-time env example**

Create `deployment/env/.env.deploy.example`:

```dotenv
IMAGE_NAMESPACE=ghcr.io/torentoflag
IMAGE_TAG=0000000000000000000000000000000000000000
COMPOSE_PROJECT_NAME=elevenhouse
```

- [ ] **Step 2: Add runtime env example**

Create `deployment/env/.env.production.example`:

```dotenv
NODE_ENV=production

POSTGRES_DB=elevenhouse
POSTGRES_USER=elevenhouse
POSTGRES_PASSWORD=elevenhouse-example-postgres-password-change-before-production
DATABASE_URL=postgresql://elevenhouse:elevenhouse-example-postgres-password-change-before-production@postgres:5432/elevenhouse
REDIS_URL=redis://redis:6379

MINIO_ROOT_USER=elevenhouse
MINIO_ROOT_PASSWORD=elevenhouse-example-minio-password-change-before-production
MINIO_MEDIA_BUCKET=elevenhouse-media

AUTH_CODE_DELIVERY_ENCRYPTION_KEY=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=

PUBLIC_API_PORT=3001
PUBLIC_API_TRUST_PROXY=true
PUBLIC_API_SESSION_COOKIE_SECURE=true
PUBLIC_API_CSRF_SECRET=elevenhouse-example-public-csrf-secret-change-before-production
PUBLIC_API_ALLOWED_ORIGINS=https://app.elevenhouse.ai
PUBLIC_API_PASSWORDLESS_CODE_SECRET=elevenhouse-example-public-passwordless-secret-change-before-production
PUBLIC_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX=elevenhouse:public-api

ASTROLOGER_API_PORT=3002
ASTROLOGER_API_TRUST_PROXY=true
ASTROLOGER_API_SESSION_COOKIE_SECURE=true
ASTROLOGER_API_CSRF_SECRET=elevenhouse-example-astrologer-csrf-secret-change-before-production
ASTROLOGER_API_ALLOWED_ORIGINS=https://astrologer.elevenhouse.ai
ASTROLOGER_API_PASSWORDLESS_CODE_SECRET=elevenhouse-example-astrologer-passwordless-secret-change-before-production
ASTROLOGER_API_PASSWORDLESS_RATE_LIMIT_REDIS_KEY_PREFIX=elevenhouse:astrologer-api
ASTROLOGER_MEDIA_STORAGE_ENDPOINT=http://minio:9000
ASTROLOGER_MEDIA_STORAGE_REGION=us-east-1
ASTROLOGER_MEDIA_STORAGE_BUCKET=elevenhouse-media
ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID=elevenhouse
ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY=elevenhouse-example-minio-password-change-before-production
ASTROLOGER_MEDIA_STORAGE_FORCE_PATH_STYLE=true
ASTROLOGER_MEDIA_STORAGE_PUBLIC_BASE_URL=https://app.elevenhouse.ai/media/elevenhouse-media
ASTROLOGER_MEDIA_UPLOAD_TTL_SECONDS=900
ASTROLOGER_AI_ENABLED=false
ASTROLOGER_AI_PROVIDER=openai
ASTROLOGER_OPENAI_API_KEY=
ASTROLOGER_OPENAI_BASE_URL=https://api.openai.com/v1
ASTROLOGER_AI_FAST_DRAFT_MODEL=gpt-5.4-mini
ASTROLOGER_AI_QUALITY_DRAFT_MODEL=gpt-5.5

ADMIN_API_PORT=3003
ADMIN_API_TRUST_PROXY=true
ADMIN_API_ALLOWED_ORIGINS=https://admin.elevenhouse.ai

WORKERS_HEALTH_PORT=3010
PAYMENT_WORKER_HEALTH_PORT=3011
CHART_WORKER_HEALTH_PORT=3012
NOTIFICATION_WORKER_HEALTH_HOST=0.0.0.0
NOTIFICATION_WORKER_HEALTH_PORT=3013
NOTIFICATION_WORKER_OUTBOX_RELAY_INTERVAL_MS=1000
NOTIFICATION_WORKER_OUTBOX_RELAY_BATCH_SIZE=50
NOTIFICATION_WORKER_OUTBOX_PUBLISHING_LOCK_TIMEOUT_MS=60000
NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_ATTEMPTS=5
NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_BACKOFF_MS=1000
NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE=http
NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_ENDPOINT_URL=https://delivery.internal/auth/email
NOTIFICATION_WORKER_AUTH_CODE_EMAIL_DELIVERY_BEARER_TOKEN=elevenhouse-example-email-delivery-token-change-before-production
NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM=auth@elevenhouse.ai
NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL=https://delivery.internal/auth/sms
NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_BEARER_TOKEN=elevenhouse-example-sms-delivery-token-change-before-production
NOTIFICATION_WORKER_AUTH_CODE_SMS_FROM=ElevenHouse
```

- [ ] **Step 3: Add edge Caddyfile**

Create `deployment/caddy/Caddyfile`:

```caddyfile
{
	email admin@elevenhouse.ai
}

elevenhouse.ai {
	encode zstd gzip
	reverse_proxy landing:8080
}

app.elevenhouse.ai {
	encode zstd gzip

	handle_path /media/* {
		reverse_proxy minio:9000
	}

	handle_path /api/* {
		reverse_proxy public-api:3001
	}

	handle {
		reverse_proxy client-web:8080
	}
}

astrologer.elevenhouse.ai {
	encode zstd gzip

	handle_path /media/* {
		reverse_proxy minio:9000
	}

	handle_path /api/* {
		reverse_proxy astrologer-api:3002
	}

	handle {
		reverse_proxy astrologer-web:8080
	}
}

admin.elevenhouse.ai {
	encode zstd gzip

	handle_path /api/* {
		reverse_proxy admin-api:3003
	}

	handle {
		reverse_proxy admin-web:8080
	}
}
```

- [ ] **Step 4: Add production Compose stack**

Create `deployment/compose/compose.production.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ../caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      landing:
        condition: service_started
      client-web:
        condition: service_started
      astrologer-web:
        condition: service_started
      admin-web:
        condition: service_started
      public-api:
        condition: service_healthy
      astrologer-api:
        condition: service_healthy
      admin-api:
        condition: service_healthy

  landing:
    image: ${IMAGE_NAMESPACE}/elevenhouse-landing:${IMAGE_TAG}
    restart: unless-stopped

  client-web:
    image: ${IMAGE_NAMESPACE}/elevenhouse-client-web:${IMAGE_TAG}
    restart: unless-stopped

  astrologer-web:
    image: ${IMAGE_NAMESPACE}/elevenhouse-astrologer-web:${IMAGE_TAG}
    restart: unless-stopped

  admin-web:
    image: ${IMAGE_NAMESPACE}/elevenhouse-admin-web:${IMAGE_TAG}
    restart: unless-stopped

  public-api:
    image: ${IMAGE_NAMESPACE}/elevenhouse-public-api:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  astrologer-api:
    image: ${IMAGE_NAMESPACE}/elevenhouse-astrologer-api:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_started
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  admin-api:
    image: ${IMAGE_NAMESPACE}/elevenhouse-admin-api:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3003/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  workers:
    image: ${IMAGE_NAMESPACE}/elevenhouse-workers:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3010/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  payment-worker:
    image: ${IMAGE_NAMESPACE}/elevenhouse-payment-worker:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3011/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  chart-worker:
    image: ${IMAGE_NAMESPACE}/elevenhouse-chart-worker:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3012/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  notification-worker:
    image: ${IMAGE_NAMESPACE}/elevenhouse-notification-worker:${IMAGE_TAG}
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3013/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10

  db-migrator:
    image: ${IMAGE_NAMESPACE}/elevenhouse-db-migrator:${IMAGE_TAG}
    profiles:
      - maintenance
    env_file:
      - ../env/.env.production
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    env_file:
      - ../env/.env.production
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$${POSTGRES_USER}\" -d \"$${POSTGRES_DB}\""]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:8-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10

  minio:
    image: quay.io/minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    env_file:
      - ../env/.env.production
    volumes:
      - minio-data:/data

  minio-init:
    image: quay.io/minio/mc:latest
    restart: "no"
    env_file:
      - ../env/.env.production
    depends_on:
      minio:
        condition: service_started
    entrypoint: ["/bin/sh", "-c"]
    command: >
      "until mc alias set local http://minio:9000 \"$${MINIO_ROOT_USER}\" \"$${MINIO_ROOT_PASSWORD}\"; do sleep 2; done &&
      mc mb --ignore-existing local/\"$${MINIO_MEDIA_BUCKET}\" &&
      mc anonymous set download local/\"$${MINIO_MEDIA_BUCKET}\""

volumes:
  caddy-data:
  caddy-config:
  postgres-data:
  redis-data:
  minio-data:
```

- [ ] **Step 5: Validate Compose rendering**

Run:

```bash
cp deployment/env/.env.deploy.example /tmp/elevenhouse.env.deploy
docker compose \
  --env-file /tmp/elevenhouse.env.deploy \
  -f deployment/compose/compose.production.yml \
  config >/tmp/elevenhouse.compose.rendered.yml
test -s /tmp/elevenhouse.compose.rendered.yml
```

Expected: command exits 0 and rendered compose file is non-empty.

- [ ] **Step 6: Commit**

```bash
git add deployment/compose deployment/caddy deployment/env
git commit -m "ops: add production compose and routing config"
```

---

### Task 5: Add Server Bootstrap and Backup Scripts

**Files:**

- Create: `deployment/server/bootstrap.sh`
- Create: `deployment/server/backup-postgres.sh`
- Create: `deployment/server/restore-postgres.sh`

- [ ] **Step 1: Add bootstrap script**

Create `deployment/server/bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != "0" ]]; then
  echo "bootstrap must run as root" >&2
  exit 1
fi

install -d -m 0755 /opt/elevenhouse
install -d -m 0755 /opt/elevenhouse/compose
install -d -m 0755 /opt/elevenhouse/caddy
install -d -m 0700 /opt/elevenhouse/env
install -d -m 0700 /opt/elevenhouse/backups/postgres

apt-get update
apt-get install -y ca-certificates curl gnupg ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "local"
}
EOF

systemctl enable --now docker
systemctl restart docker

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

docker --version
docker compose version
ufw status
```

- [ ] **Step 2: Add PostgreSQL backup script**

Create `deployment/server/backup-postgres.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_DIR}/backups/postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose/compose.production.yml}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/env/.env.deploy}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 0700 "${BACKUP_DIR}"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  >"${BACKUP_DIR}/elevenhouse-${STAMP}.dump"

find "${BACKUP_DIR}" -type f -name 'elevenhouse-*.dump' -mtime +14 -delete
ls -lh "${BACKUP_DIR}/elevenhouse-${STAMP}.dump"
```

- [ ] **Step 3: Add PostgreSQL restore script**

Create `deployment/server/restore-postgres.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/backup.dump" >&2
  exit 1
fi

BACKUP_FILE="$1"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/elevenhouse}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose/compose.production.yml}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/env/.env.deploy}"

test -f "${BACKUP_FILE}"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  <"${BACKUP_FILE}"
```

- [ ] **Step 4: Make scripts executable and lint shell syntax**

Run:

```bash
chmod +x deployment/server/bootstrap.sh deployment/server/backup-postgres.sh deployment/server/restore-postgres.sh
bash -n deployment/server/bootstrap.sh
bash -n deployment/server/backup-postgres.sh
bash -n deployment/server/restore-postgres.sh
```

Expected: all `bash -n` commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add deployment/server
git commit -m "ops: add server bootstrap and backup scripts"
```

---

### Task 6: Add CI Workflow

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.3

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify
        run: pnpm verify
```

- [ ] **Step 2: Validate workflow syntax locally if actionlint exists**

Run:

```bash
if command -v actionlint >/dev/null 2>&1; then actionlint .github/workflows/ci.yml; else echo "actionlint not installed"; fi
```

Expected: either PASS or `actionlint not installed`.

- [ ] **Step 3: Run repo verification**

Run:

```bash
pnpm verify
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add repository verification workflow"
```

---

### Task 7: Add Deployment Workflow

**Files:**

- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Production

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: production-deploy
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_NAMESPACE: ghcr.io/torentoflag
  IMAGE_TAG: ${{ github.sha }}

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.3

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify
        run: pnpm verify

  build-and-push:
    runs-on: ubuntu-latest
    environment: production
    needs:
      - verify
    strategy:
      fail-fast: false
      matrix:
        include:
          - image: elevenhouse-landing
            dockerfile: deployment/docker/frontend.Dockerfile
            app_filter: "@elevenhouse/landing"
            app_dir: landing
            build_args: |
              VITE_ASTROLOGER_WEB_ORIGIN=https://astrologer.elevenhouse.ai
          - image: elevenhouse-client-web
            dockerfile: deployment/docker/frontend.Dockerfile
            app_filter: "@elevenhouse/client-web"
            app_dir: client-web
            build_args: ""
          - image: elevenhouse-astrologer-web
            dockerfile: deployment/docker/frontend.Dockerfile
            app_filter: "@elevenhouse/astrologer-web"
            app_dir: astrologer-web
            build_args: ""
          - image: elevenhouse-admin-web
            dockerfile: deployment/docker/frontend.Dockerfile
            app_filter: "@elevenhouse/admin-web"
            app_dir: admin-web
            build_args: ""
          - image: elevenhouse-public-api
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/public-api"
            app_dir: public-api
            build_args: ""
          - image: elevenhouse-astrologer-api
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/astrologer-api"
            app_dir: astrologer-api
            build_args: ""
          - image: elevenhouse-admin-api
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/admin-api"
            app_dir: admin-api
            build_args: ""
          - image: elevenhouse-workers
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/workers"
            app_dir: workers
            build_args: ""
          - image: elevenhouse-payment-worker
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/payment-worker"
            app_dir: payment-worker
            build_args: ""
          - image: elevenhouse-chart-worker
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/chart-worker"
            app_dir: chart-worker
            build_args: ""
          - image: elevenhouse-notification-worker
            dockerfile: deployment/docker/backend.Dockerfile
            app_filter: "@elevenhouse/notification-worker"
            app_dir: notification-worker
            build_args: ""
          - image: elevenhouse-db-migrator
            dockerfile: deployment/docker/db-migrator.Dockerfile
            app_filter: ""
            app_dir: ""
            build_args: ""
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: |
            ${{ env.IMAGE_NAMESPACE }}/${{ matrix.image }}:${{ env.IMAGE_TAG }}
            ${{ env.IMAGE_NAMESPACE }}/${{ matrix.image }}:latest
          build-args: |
            APP_FILTER=${{ matrix.app_filter }}
            APP_DIR=${{ matrix.app_dir }}
            ${{ matrix.build_args }}
          cache-from: type=gha,scope=${{ matrix.image }}
          cache-to: type=gha,mode=max,scope=${{ matrix.image }}

  deploy:
    runs-on: ubuntu-latest
    environment: production
    needs:
      - build-and-push
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Prepare SSH
        run: |
          install -m 0700 -d ~/.ssh
          printf '%s\n' "${{ secrets.PRODUCTION_SSH_KEY }}" > ~/.ssh/elevenhouse
          chmod 0600 ~/.ssh/elevenhouse
          ssh-keyscan -H "${{ secrets.PRODUCTION_HOST }}" >> ~/.ssh/known_hosts

      - name: Upload deployment files
        run: |
          ssh -i ~/.ssh/elevenhouse "${{ secrets.PRODUCTION_USER }}@${{ secrets.PRODUCTION_HOST }}" 'install -d -m 0755 /opt/elevenhouse/compose /opt/elevenhouse/caddy /opt/elevenhouse/env /opt/elevenhouse/backups/postgres'
          scp -i ~/.ssh/elevenhouse deployment/compose/compose.production.yml "${{ secrets.PRODUCTION_USER }}@${{ secrets.PRODUCTION_HOST }}:/opt/elevenhouse/compose/compose.production.yml"
          scp -i ~/.ssh/elevenhouse deployment/caddy/Caddyfile "${{ secrets.PRODUCTION_USER }}@${{ secrets.PRODUCTION_HOST }}:/opt/elevenhouse/caddy/Caddyfile"
          scp -i ~/.ssh/elevenhouse deployment/server/backup-postgres.sh "${{ secrets.PRODUCTION_USER }}@${{ secrets.PRODUCTION_HOST }}:/opt/elevenhouse/backup-postgres.sh"
          scp -i ~/.ssh/elevenhouse deployment/server/restore-postgres.sh "${{ secrets.PRODUCTION_USER }}@${{ secrets.PRODUCTION_HOST }}:/opt/elevenhouse/restore-postgres.sh"

      - name: Deploy over SSH
        run: |
          ssh -i ~/.ssh/elevenhouse "${{ secrets.PRODUCTION_USER }}@${{ secrets.PRODUCTION_HOST }}" \
            IMAGE_NAMESPACE="${IMAGE_NAMESPACE}" \
            IMAGE_TAG="${IMAGE_TAG}" \
            GHCR_USERNAME="${{ github.actor }}" \
            GHCR_TOKEN="${{ secrets.GITHUB_TOKEN }}" \
            'bash -s' <<'REMOTE'
          set -euo pipefail
          cd /opt/elevenhouse
          chmod +x backup-postgres.sh restore-postgres.sh
          cat > env/.env.deploy <<EOF
          IMAGE_NAMESPACE=${IMAGE_NAMESPACE}
          IMAGE_TAG=${IMAGE_TAG}
          COMPOSE_PROJECT_NAME=elevenhouse
          EOF
          echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
          docker compose --env-file env/.env.deploy -f compose/compose.production.yml pull
          if docker compose --env-file env/.env.deploy -f compose/compose.production.yml ps postgres --status running >/dev/null 2>&1; then
            ./backup-postgres.sh
          fi
          docker compose --env-file env/.env.deploy -f compose/compose.production.yml up -d postgres redis minio
          docker compose --env-file env/.env.deploy -f compose/compose.production.yml up minio-init
          docker compose --env-file env/.env.deploy -f compose/compose.production.yml run --rm db-migrator
          docker compose --env-file env/.env.deploy -f compose/compose.production.yml up -d
          docker compose --env-file env/.env.deploy -f compose/compose.production.yml ps
          REMOTE

      - name: Smoke check
        run: |
          curl -fsS https://elevenhouse.ai >/dev/null
          curl -fsS https://app.elevenhouse.ai >/dev/null
          curl -fsS https://app.elevenhouse.ai/api/health
          curl -fsS https://astrologer.elevenhouse.ai >/dev/null
          curl -fsS https://astrologer.elevenhouse.ai/api/health
          curl -fsS https://admin.elevenhouse.ai >/dev/null
          curl -fsS https://admin.elevenhouse.ai/api/health
```

- [ ] **Step 2: Validate workflow syntax locally if actionlint exists**

Run:

```bash
if command -v actionlint >/dev/null 2>&1; then actionlint .github/workflows/deploy.yml; else echo "actionlint not installed"; fi
```

Expected: either PASS or `actionlint not installed`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add production deployment workflow"
```

---

### Task 8: Prepare GitHub Production Secrets

**Files:**

- No repository files changed.

- [ ] **Step 1: Create production environment in GitHub**

In repository settings for `TorentoFlag/ElevenHouse`, create environment:

```text
production
```

- [ ] **Step 2: Add required secrets**

Add these environment secrets:

```text
PRODUCTION_HOST=152.239.118.53
PRODUCTION_USER=root
PRODUCTION_SSH_KEY=paste the private key generated for this deployment key
```

- [ ] **Step 3: Verify secret-free repo state**

Run:

```bash
rg -n "BEGIN OPENSSH PRIVATE KEY|BEGIN RSA PRIVATE KEY|change-before-production" .
```

Expected: only example values under `deployment/env/.env.production.example`; no real private key or real production secret is present.

---

### Task 9: Bootstrap Server

**Files:**

- Uses: `deployment/server/bootstrap.sh`
- Uses: `deployment/compose/compose.production.yml`
- Uses: `deployment/caddy/Caddyfile`

- [ ] **Step 1: Upload and run bootstrap**

Run:

```bash
scp deployment/server/bootstrap.sh root@152.239.118.53:/root/elevenhouse-bootstrap.sh
ssh root@152.239.118.53 'bash /root/elevenhouse-bootstrap.sh'
```

Expected:

- Docker version prints.
- Docker Compose version prints.
- UFW status shows `22`, `80`, and `443` allowed.

- [ ] **Step 2: Upload deployment skeleton**

Run:

```bash
ssh root@152.239.118.53 'install -d -m 0755 /opt/elevenhouse/compose /opt/elevenhouse/caddy /opt/elevenhouse/env /opt/elevenhouse/backups/postgres'
scp deployment/compose/compose.production.yml root@152.239.118.53:/opt/elevenhouse/compose/compose.production.yml
scp deployment/caddy/Caddyfile root@152.239.118.53:/opt/elevenhouse/caddy/Caddyfile
scp deployment/server/backup-postgres.sh root@152.239.118.53:/opt/elevenhouse/backup-postgres.sh
scp deployment/server/restore-postgres.sh root@152.239.118.53:/opt/elevenhouse/restore-postgres.sh
ssh root@152.239.118.53 'chmod +x /opt/elevenhouse/backup-postgres.sh /opt/elevenhouse/restore-postgres.sh'
```

Expected: files exist under `/opt/elevenhouse`.

- [ ] **Step 3: Create production env on server**

Create `/opt/elevenhouse/env/.env.production` on the server from
`deployment/env/.env.production.example`, replacing every value that contains
`change-before-production` with a real secret.

Generate strong secrets locally with:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Expected: server env file exists and is `0600`.

- [ ] **Step 4: Create deploy env on server**

Run:

```bash
ssh root@152.239.118.53 'cat >/opt/elevenhouse/env/.env.deploy <<EOF
IMAGE_NAMESPACE=ghcr.io/torentoflag
IMAGE_TAG=0000000000000000000000000000000000000000
COMPOSE_PROJECT_NAME=elevenhouse
EOF
chmod 0600 /opt/elevenhouse/env/.env.deploy'
```

Expected: `/opt/elevenhouse/env/.env.deploy` exists and is `0600`.

---

### Task 10: First Manual Image Build and Push

**Files:**

- Uses Dockerfiles from Task 3.

- [ ] **Step 1: Authenticate to GHCR locally**

Run:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u TorentoFlag --password-stdin
```

Expected: login succeeds. `GHCR_TOKEN` must have package write permission.

- [ ] **Step 2: Build and push all images for current commit**

Run:

```bash
export IMAGE_NAMESPACE=ghcr.io/torentoflag
export IMAGE_TAG="$(git rev-parse HEAD)"

docker build -f deployment/docker/frontend.Dockerfile --build-arg APP_FILTER=@elevenhouse/landing --build-arg APP_DIR=landing --build-arg VITE_ASTROLOGER_WEB_ORIGIN=https://astrologer.elevenhouse.ai -t "$IMAGE_NAMESPACE/elevenhouse-landing:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-landing:$IMAGE_TAG"

docker build -f deployment/docker/frontend.Dockerfile --build-arg APP_FILTER=@elevenhouse/client-web --build-arg APP_DIR=client-web -t "$IMAGE_NAMESPACE/elevenhouse-client-web:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-client-web:$IMAGE_TAG"

docker build -f deployment/docker/frontend.Dockerfile --build-arg APP_FILTER=@elevenhouse/astrologer-web --build-arg APP_DIR=astrologer-web -t "$IMAGE_NAMESPACE/elevenhouse-astrologer-web:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-astrologer-web:$IMAGE_TAG"

docker build -f deployment/docker/frontend.Dockerfile --build-arg APP_FILTER=@elevenhouse/admin-web --build-arg APP_DIR=admin-web -t "$IMAGE_NAMESPACE/elevenhouse-admin-web:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-admin-web:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/public-api --build-arg APP_DIR=public-api -t "$IMAGE_NAMESPACE/elevenhouse-public-api:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-public-api:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/astrologer-api --build-arg APP_DIR=astrologer-api -t "$IMAGE_NAMESPACE/elevenhouse-astrologer-api:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-astrologer-api:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/admin-api --build-arg APP_DIR=admin-api -t "$IMAGE_NAMESPACE/elevenhouse-admin-api:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-admin-api:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/workers --build-arg APP_DIR=workers -t "$IMAGE_NAMESPACE/elevenhouse-workers:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-workers:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/payment-worker --build-arg APP_DIR=payment-worker -t "$IMAGE_NAMESPACE/elevenhouse-payment-worker:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-payment-worker:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/chart-worker --build-arg APP_DIR=chart-worker -t "$IMAGE_NAMESPACE/elevenhouse-chart-worker:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-chart-worker:$IMAGE_TAG"

docker build -f deployment/docker/backend.Dockerfile --build-arg APP_FILTER=@elevenhouse/notification-worker --build-arg APP_DIR=notification-worker -t "$IMAGE_NAMESPACE/elevenhouse-notification-worker:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-notification-worker:$IMAGE_TAG"

docker build -f deployment/docker/db-migrator.Dockerfile -t "$IMAGE_NAMESPACE/elevenhouse-db-migrator:$IMAGE_TAG" .
docker push "$IMAGE_NAMESPACE/elevenhouse-db-migrator:$IMAGE_TAG"
```

Expected: every image builds and pushes.

---

### Task 11: First Manual Server Deploy

**Files:**

- Uses server files from prior tasks.

- [ ] **Step 1: Update server image tag**

Run:

```bash
export IMAGE_TAG="$(git rev-parse HEAD)"
ssh root@152.239.118.53 "sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/' /opt/elevenhouse/env/.env.deploy"
```

Expected: `/opt/elevenhouse/env/.env.deploy` references current commit SHA.

- [ ] **Step 2: Pull images and start stateful services**

Run:

```bash
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml pull'
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml up -d postgres redis minio'
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml up minio-init'
```

Expected: Postgres and Redis become healthy, MinIO is running, and `minio-init` exits 0.

- [ ] **Step 3: Run migrations and start full stack**

Run:

```bash
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml run --rm db-migrator'
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml up -d'
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml ps'
```

Expected: all long-running services are up; healthchecks converge to healthy.

- [ ] **Step 4: Run smoke checks from local machine**

Run:

```bash
curl -fsS https://elevenhouse.ai >/dev/null
curl -fsS https://app.elevenhouse.ai >/dev/null
curl -fsS https://app.elevenhouse.ai/api/health
curl -fsS https://astrologer.elevenhouse.ai >/dev/null
curl -fsS https://astrologer.elevenhouse.ai/api/health
curl -fsS https://admin.elevenhouse.ai >/dev/null
curl -fsS https://admin.elevenhouse.ai/api/health
```

Expected: all commands exit 0; API health responses name the correct services.

- [ ] **Step 5: Verify internal worker readiness**

Run:

```bash
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml exec -T notification-worker node -e "fetch(\"http://127.0.0.1:3013/ready\").then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1); })"'
```

Expected: readiness response has `"status":"ready"`.

---

### Task 12: Push and Validate Automatic Deploy

**Files:**

- Uses `.github/workflows/ci.yml`
- Uses `.github/workflows/deploy.yml`

- [ ] **Step 1: Run final local verification**

Run:

```bash
pnpm verify
git status --short
```

Expected: `pnpm verify` passes. `git status --short` has no uncommitted deployment files except intentional current task files before final commit.

- [ ] **Step 2: Push branch**

Run:

```bash
git push origin main
```

Expected: push succeeds and GitHub Actions start.

- [ ] **Step 3: Watch workflows**

Run:

```bash
gh run list --limit 5
```

Expected: latest `CI` and `Deploy Production` runs are visible.

- [ ] **Step 4: Confirm deploy result**

Run smoke checks again after the deploy workflow completes:

```bash
curl -fsS https://elevenhouse.ai >/dev/null
curl -fsS https://app.elevenhouse.ai/api/health
curl -fsS https://astrologer.elevenhouse.ai/api/health
curl -fsS https://admin.elevenhouse.ai/api/health
ssh root@152.239.118.53 'cd /opt/elevenhouse && docker compose --env-file env/.env.deploy -f compose/compose.production.yml ps'
```

Expected: smoke checks pass and server containers run images tagged with the pushed commit SHA.

---

## Self-Review Checklist

- Spec coverage: this plan covers Dockerization, frontend containers, backend containers, workers, Postgres, Redis, MinIO, Caddy, GHCR, GitHub Actions, server bootstrap, first deploy, smoke checks and rollback prerequisites.
- No production secret is committed; all real values live in GitHub environment secrets or `/opt/elevenhouse/env/.env.production`.
- `admin-api` is included as an existing health-only backend, not as a missing service.
- Frontend production runtime uses static containers, not Vite dev servers.
- Same-origin `/api` routing is preserved for each frontend domain.
- Server process changes are explicit and happen only in the server bootstrap/deploy tasks.
