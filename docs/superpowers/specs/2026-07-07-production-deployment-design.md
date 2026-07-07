# ElevenHouse Production Deployment Design

## Status

Approved for planning on 2026-07-07.

This document captures the first production deployment design for ElevenHouse on
the VPS at `152.239.118.53`. It is a deployment design, not an implementation
plan. Implementation tasks must be written separately before editing production
configuration files.

## Goals

- Deploy ElevenHouse to `152.239.118.53`.
- Serve all public HTTPS traffic through domain-based routing.
- Run PostgreSQL and MinIO on the same server for the first production stage.
- Build and ship every deployable app as a Docker image.
- Deploy automatically on push to `main` through GitHub Actions.
- Preserve the repository architecture: separate frontend apps, backend apps,
  workers, shared packages, and admin workflows inside `admin-api`.

## Server Baseline

Read-only server audit on 2026-07-07:

- Host: `srv1785674`
- OS: Ubuntu 24.04.4 LTS
- Access: `ssh root@152.239.118.53`
- Memory: 7.8 GiB
- Root disk: 96 GiB, mostly empty
- `/opt`: empty
- Docker: not installed yet
- Firewall: inactive
- Listening ports: SSH only, plus local resolver ports

The first bootstrap must install Docker Engine with the Compose plugin, create
the `/opt/elevenhouse` deployment directory, configure firewall rules for
`22/tcp`, `80/tcp` and `443/tcp`, and configure Docker log rotation.

## DNS

The following records resolve to `152.239.118.53`:

```text
elevenhouse.ai
app.elevenhouse.ai
astrologer.elevenhouse.ai
admin.elevenhouse.ai
```

## External Routing

Use one edge reverse proxy, Caddy, as the only public HTTP(S) entrypoint.
Caddy terminates TLS, renews certificates automatically, serves public domains,
and proxies traffic into the private Docker network.

```text
elevenhouse.ai
  -> landing frontend

app.elevenhouse.ai
  -> client-web frontend
  /api/* -> public-api

astrologer.elevenhouse.ai
  -> astrologer-web frontend
  /api/* -> astrologer-api

admin.elevenhouse.ai
  -> admin-web frontend
  /api/* -> admin-api
```

Backends must not publish public host ports. They listen only inside the Docker
network. Caddy is the public boundary for HTTP(S).

Use same-origin `/api` for each frontend. This matches the current frontend
HTTP clients, reduces CORS surface, and keeps cookie/CSRF behavior simpler than
separate public backend domains.

## Frontend Containers

Frontend apps are Dockerized too.

Each frontend image performs a Vite production build and serves static assets
from a small HTTP server image:

- `landing`
- `client-web`
- `astrologer-web`
- `admin-web`

Production must not run `vite dev`. Each SPA must support history fallback to
`index.html` so direct navigation to routes such as `/auth`, `/products` or
`/settings` does not return 404.

Recommended internal static serving pattern:

- Build stage: Node 24, pnpm 10, monorepo install, filtered app build.
- Runtime stage: Caddy or nginx static server with only the built files and SPA
  fallback config.

Caddy at the edge may either proxy to these frontend containers or serve their
static files directly from mounted image outputs. The first implementation
should prefer separate frontend containers because it keeps each frontend
independently versioned and aligns with the app-boundary architecture.

## Backend Containers

Backend app images:

- `public-api`
- `astrologer-api`
- `admin-api`

Worker images:

- `notification-worker`
- `payment-worker`
- `chart-worker`
- `workers`

Database migration image:

- `db-migrator`

The API containers should expose health endpoints inside the Docker network:

- `public-api`: `/health`
- `astrologer-api`: `/health`
- `admin-api`: `/health`

The deployment should add proper readiness/liveness endpoints before relying on
container health checks for rollout quality. `notification-worker` already has
`/live` and `/ready`. The remaining worker apps currently only log readiness,
so they need HTTP readiness before they can be monitored and restarted with the
same confidence.

## Stateful Services

For the first production stage, run these stateful services on the same VPS:

- PostgreSQL
- Redis
- MinIO

PostgreSQL data must be stored in a persistent volume mounted at the official
data directory. MinIO data must also use a persistent volume or bind mount under
the deployment directory.

Required safeguards:

- no development credentials in production compose files;
- `.env` files live only on the server or in GitHub environment secrets;
- regular PostgreSQL backups to `/opt/elevenhouse/backups`;
- MinIO data backup or replication plan before storing irreplaceable user files;
- restore drill documented after the first successful deployment.

## Image Registry

Use GitHub Container Registry under the GitHub repository owner:

```text
ghcr.io/torentoflag/elevenhouse-landing:<sha>
ghcr.io/torentoflag/elevenhouse-client-web:<sha>
ghcr.io/torentoflag/elevenhouse-astrologer-web:<sha>
ghcr.io/torentoflag/elevenhouse-admin-web:<sha>
ghcr.io/torentoflag/elevenhouse-public-api:<sha>
ghcr.io/torentoflag/elevenhouse-astrologer-api:<sha>
ghcr.io/torentoflag/elevenhouse-admin-api:<sha>
ghcr.io/torentoflag/elevenhouse-notification-worker:<sha>
ghcr.io/torentoflag/elevenhouse-payment-worker:<sha>
ghcr.io/torentoflag/elevenhouse-chart-worker:<sha>
ghcr.io/torentoflag/elevenhouse-workers:<sha>
ghcr.io/torentoflag/elevenhouse-db-migrator:<sha>
```

Use immutable commit SHA tags for deployment. `latest` can exist for
convenience, but production compose must pin the selected commit SHA through an
environment variable such as `IMAGE_TAG`.

## GitHub Actions

Create two workflows:

1. `ci.yml`
   - trigger on pull requests and pushes;
   - install Node 24 and pnpm 10;
   - run `pnpm install --frozen-lockfile`;
   - run `pnpm verify`.

2. `deploy.yml`
   - trigger on push to `main`;
   - require successful CI;
   - use GitHub environment `production`;
   - build and push all Docker images to GHCR;
   - connect to `root@152.239.118.53` through SSH;
   - update `/opt/elevenhouse/.env.deploy` with `IMAGE_TAG`;
   - pull images;
   - run `db-migrator`;
   - run `docker compose up -d`;
   - verify API health and frontend HTTP responses.

Workflow security requirements:

- grant minimal `GITHUB_TOKEN` permissions;
- use environment secrets for SSH key and server connection settings;
- set deployment concurrency for production;
- avoid echoing secrets;
- pin or deliberately version third-party actions;
- make workflow changes reviewable.

## Environment Configuration

Production API environment must include:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_CODE_DELIVERY_ENCRYPTION_KEY`
- `PUBLIC_API_*` secrets, allowed origins and secure-cookie flags
- `ASTROLOGER_API_*` secrets, allowed origins and secure-cookie flags
- `ADMIN_API_ALLOWED_ORIGINS`
- `ASTROLOGER_MEDIA_STORAGE_*` pointing to MinIO
- `NOTIFICATION_WORKER_*` real delivery settings or an explicitly documented
  disabled state for the first launch

Expected origin values:

```text
PUBLIC_API_ALLOWED_ORIGINS=https://app.elevenhouse.ai
ASTROLOGER_API_ALLOWED_ORIGINS=https://astrologer.elevenhouse.ai
ADMIN_API_ALLOWED_ORIGINS=https://admin.elevenhouse.ai
```

For production cookies:

```text
PUBLIC_API_TRUST_PROXY=true
PUBLIC_API_SESSION_COOKIE_SECURE=true
ASTROLOGER_API_TRUST_PROXY=true
ASTROLOGER_API_SESSION_COOKIE_SECURE=true
ADMIN_API_TRUST_PROXY=true
```

## Rollout Flow

1. Bootstrap server.
2. Create production env files on server.
3. Build and push images from GitHub Actions.
4. Pull images on the server.
5. Start Postgres, Redis and MinIO.
6. Run database migrations.
7. Start APIs, workers and frontend containers.
8. Start or reload Caddy.
9. Run smoke checks:
   - `https://elevenhouse.ai`
   - `https://app.elevenhouse.ai`
   - `https://app.elevenhouse.ai/api/health`
   - `https://astrologer.elevenhouse.ai`
   - `https://astrologer.elevenhouse.ai/api/health`
   - `https://admin.elevenhouse.ai`
   - `https://admin.elevenhouse.ai/api/health`
   - `notification-worker` internal `/ready`
10. Record the deployed commit SHA.

## Rollback

Rollback uses the previous successful `IMAGE_TAG`:

1. Set `IMAGE_TAG` to the previous commit SHA.
2. `docker compose pull`.
3. `docker compose up -d`.
4. Repeat smoke checks.

Database rollback is not automatic. Migrations must be designed to be
backward-compatible for at least one release whenever possible. If a migration
is destructive, it needs a manual approval step and a verified backup before
deployment.

## Known Gaps Before Implementation

- Production Dockerfiles are not present yet.
- Production Compose/Caddy files are not present yet.
- GitHub Actions workflows are not present yet.
- Docker is not installed on the server yet.
- API health endpoints are simple health endpoints, not dependency readiness.
- `notification-worker` has HTTP readiness; other workers do not yet.
- `admin-api` is real but health-only. Domain admin workflows, auth,
  permissions and audit logging are not implemented yet.
- Production notification delivery provider configuration must be decided before
  passwordless auth can be considered fully production-ready.

## Primary References

- Docker Compose production guidance:
  `https://docs.docker.com/compose/how-tos/production/`
- Docker Compose dependency health checks:
  `https://docs.docker.com/compose/how-tos/startup-order/`
- Docker Build GitHub Actions:
  `https://docs.docker.com/build/ci/github-actions/`
- GitHub Docker image publishing:
  `https://docs.github.com/actions/guides/publishing-docker-images`
- GitHub Actions environments:
  `https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment`
- GitHub Actions token permissions:
  `https://docs.github.com/actions/reference/authentication-in-a-workflow`
- GitHub Actions concurrency:
  `https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs`
- Docker logging configuration:
  `https://docs.docker.com/engine/logging/configure/`
- Caddy automatic HTTPS:
  `https://caddyserver.com/docs/automatic-https`
