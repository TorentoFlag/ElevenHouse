# Deployment Topology

## Начальная форма

```text
CDN
  -> client-web assets
  -> astrologer-web assets
  -> admin-web assets

client-web -> public-api -> PostgreSQL / Redis / Queue
astrologer-web -> astrologer-api -> PostgreSQL / Redis / Queue
admin-web -> admin-api -> PostgreSQL / Redis / Queue   (scaffolded; internal modules pending)

Queue -> payment-worker
Queue -> notification-worker
Queue -> chart-worker -> chart-engine
Queue -> workers
```

## Приоритеты масштабирования

Клиентский трафик ожидается существенно выше, чем трафик астрологов/админов. Независимо масштабируемыми должны быть:

- `client-web`
- `public-api`
- доставка публичных media
- checkout/booking endpoints

Трафик астрологов и админов должен масштабироваться отдельно через
`astrologer-api` и `admin-api`. Внутренние admin/moderator workflows нельзя
добавлять в `astrologer-api`; они должны жить в `admin-api` с отдельными
auth/permissions и audit boundaries.

## Ответственности workers

- `payment-worker`: payment webhooks, reconciliation, refunds, payout jobs.
- `notification-worker`: delivery, reminders, retries, provider failover.
- `chart-worker`: BullMQ delivery, leases, retries, persistence of chart
  calculation results and internal calls to `chart-engine`.
- `chart-engine`: private Python/FastAPI runtime for Kerykeion-backed
  calculation. It is not routed by Caddy and is reachable only on the private
  deployment network. It exposes `/live` for process liveness and `/ready` for
  readiness; production healthchecks gate on `/ready`.
- `workers`: scheduled jobs, analytics ingestion, cleanup tasks.

Workers должны быть idempotent. Повтор job не должен создавать дубли payments, notifications, bookings или ledger entries.

## Production chart ephemeris

Production chart execution requires the licensed Swiss Ephemeris profile;
Moshier is permitted only for local and test evidence. Licensed data is never
downloaded or embedded by the image build. An operator with separate commercial
license authority provisions exactly `semo_18.se1` and `sepl_18.se1` in
`/opt/elevenhouse/ephemeris` on the production host. Compose mounts that
directory read-only at `/run/elevenhouse/ephemeris` inside `chart-engine`.

Before any production compose or container mutation, the deploy workflow runs
`deployment/server/preflight-chart-ephemeris.sh`. It verifies the Swiss profile,
the configured manifest revision, regular non-symlink artifacts and their exact
content hashes. Missing, substituted or unlicensed/unprovisioned artifacts stop
the rollout while the currently running deployment remains untouched.

## Production chart deployment trust boundaries

`chart-engine` and `chart-worker` do not receive the shared production env
file. Before Compose is invoked,
`deployment/server/materialize-chart-service-envs.sh` copies exact allowlists
from the protected source into `env/.env.chart-engine.production` and
`env/.env.chart-worker.production`. Missing, empty or duplicated required keys
fail the rollout without publishing partial files. The generated files have
mode `0600`; their committed `.example` counterparts are the service contracts.
Compose reads both files with `format: raw`, so values are not interpolated a
second time. Allowlisted source values must therefore be canonical, unquoted
and free of whitespace or inline comments; the materializer rejects incompatible
lines before publication while preserving literal `$` characters.

In production, the worker accepts only the internal chart-engine root origin
`http://chart-engine:8012`. When birth-place search is enabled, both
`public-api` and `astrologer-api` accept only the official Geoapify root origin
`https://api.geoapify.com`. Paths, query strings, credentials and alternate
public origins are rejected.

The deployment sequence is fail-closed:

1. provider and licensed ephemeris preflights run before remote mutation;
2. service-specific env files are materialized and checked;
3. Compose `>=2.30` parses staged Compose and non-secret deploy-env `.next`
   files before they can replace the live configuration; the currently
   successful Compose, deploy-env and image snapshot is bootstrapped once and
   is not changed by failed retries;
4. after image pull, an ephemeral `chart-worker` container validates the full
   production runtime contract without dependencies or data access, including
   the exact `postgres:5432/elevenhouse` database target and canonical chart
   execution profile; only then are both staged files promoted to live paths;
5. the existing PostgreSQL container is started without recreation and must
   become healthy;
6. `backup-postgres.sh` produces a non-empty custom archive, verifies its table
   of contents and performs a full restore parse before atomically publishing
   the `0600` backup;
7. only then may pinned infrastructure images be recreated, followed by
   baseline reconciliation, migrations and seed;
8. after the full Compose project passes health waiting, the real
   network-backed chart smoke runs against `astrologer-api`, `chart-worker` and
   the licensed Swiss `chart-engine`; its test data is removed in `finally`;
9. bounded external web smoke runs before the release is recorded as successful
   and before Docker artifact cleanup.

A failed rollout retains the verified PostgreSQL archive and does not change the
last-successful release history. Each successful release atomically publishes a
mode-`0600` snapshot containing the exact Compose file, the validated
`IMAGE_NAMESPACE`/`IMAGE_TAG`/project deploy env and all project image IDs;
cleanup retains the current containers and the last two successful image sets.
Database restoration remains an explicit operator action: automatic restore
could destroy valid writes made after the backup.

External infrastructure images are pinned by immutable multi-platform manifest
digest. The current manifests were verified on 2026-08-03 with
`docker buildx imagetools inspect`:

- `postgres:17.10-alpine3.24@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193`
- `redis:8.10.0-alpine@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241`
- `caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`
- `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`
- `quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727`

Operational rationale and provider contract were checked against the official
[Docker digest guidance](https://docs.docker.com/dhi/explore/security-concepts/digests/),
[Compose service env-file reference](https://docs.docker.com/reference/compose-file/services/#env_file)
and
[Geoapify geocoding documentation](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)
on 2026-08-03.

## Chart runtime observability

`chart-worker` collects non-overlapping queue telemetry at the explicit
production interval `CHART_WORKER_TELEMETRY_INTERVAL_MS`. Each collection uses
BullMQ counts plus the bounded ranges `waiting[0..0]` and `delayed[0..0]`; it
does not scan the queue and does not read or log job data. Shutdown stops the
timer and waits for the current bounded collection before closing the queue.
The initial collection is part of startup gating. A later timeout emits
`chart_queue_telemetry_deadline_exceeded`; another collection failure emits
`chart_queue_telemetry_failed`. Neither path invents counts. Durable recovery
uses the same non-overlap/deadline rule and distinct
`chart_recovery_deadline_exceeded` / `chart_recovery_failed` codes.

Chart logs go to process stdout as structured records. They expose operational
method/outcome/duration, queue depths/ages, durable attempts, retry/fence state
and provider provenance, but no chart inputs/outputs or exception diagnostics.
Production does not fall back to Moshier, guessed provider metadata, synthetic
queue metrics or browser-only job state. Missing Swiss artifacts/profile,
invalid positive intervals and unavailable startup dependencies fail closed.

## Production Docker artifact retention

Production deploy stores immutable successful-release snapshots under the VPS
retention directory and removes older unused Docker artifacts only after the
deploy has passed Compose health waiting, the real chart smoke and external
smoke checks. The first hardened rollout bootstraps the existing Compose file
and image IDs once. Failed and retried rollouts never overwrite that evidence.
After every verified success, `deployment/server/cleanup-docker-retention.sh`
records the new Compose file, validated non-secret deploy env and project image
IDs, then removes stopped containers, images not referenced by current
containers or the last two successful releases, build cache and unused
networks. Snapshot and Docker image IDs are validated before any cleanup
deletion.

The cleanup step intentionally does not prune Docker volumes. PostgreSQL, Redis
and MinIO data live in Docker volumes, so volume deletion is a separate
destructive operation and is never part of routine deploy cleanup.
