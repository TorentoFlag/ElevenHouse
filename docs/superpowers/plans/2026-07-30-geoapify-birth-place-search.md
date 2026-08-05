# Geoapify Birth Place Search

## Purpose / Big Picture

Replace the astrologer chart-engine birth-place autocomplete provider with
Geoapify Address Autocomplete and remove Nominatim from the active production
path. The observable outcome is that the chart-engine birth-data form searches
places after 800 ms, only for queries with at least three normalized
characters, and receives Geoapify-resolved coordinates and timezone through the
authenticated astrologer API.

## Progress

- 2026-07-30: Confirmed Redis already exists in `astrologer-api`
  (`RedisModule`, `RedisRuntimeService`, `REDIS_URL`, `redis` dependency) and
  should be reused instead of adding a new runtime mechanism.
- 2026-07-30: Confirmed current active provider is Nominatim and contract still
  exposes `provider: "nominatim"`.
- 2026-07-30: Updated contracts to `provider: "geoapify"` and minimum query
  length of three normalized characters.
- 2026-07-30: Added Geoapify provider, Redis cache/rate-limit/single-flight
  wrapper and DI wiring in `ClientsModule`.
- 2026-07-30: Updated chart-engine autocomplete debounce to 800 ms, min length
  to three characters and raw HTTP provider errors to friendly copy.
- 2026-07-30: Targeted tests, typechecks, formatting check and `git diff
--check` passed. Runtime browser/API flow is blocked because `astrologer-api`
  is not listening on port 3002 and process lifecycle was not changed.

## Surprises & Discoveries

- Redis was already wired into `astrologer-api`; no install is needed. The
  missing part is feature-level Redis usage for birth-place search cache,
  single-flight and rate limiting.
- Current frontend debounce is 350 ms and backend contract accepts two
  characters. Both conflict with the requested Geoapify behavior.

## Decision Log

- 2026-07-30: Use existing `RedisModule`/`REDIS_CLIENT` and the existing Redis
  Lua/ZSET rate-limit pattern. Rationale: project already uses Redis as the
  operational store for throttling; cache/rate-limit state is ephemeral and
  should not be persisted in Postgres.
- 2026-07-30: Remove Nominatim from the active provider binding and contract.
  Rationale: user explicitly rejected Nominatim and requested Geoapify.
- 2026-07-30: Keep Geoapify API key server-side only. Rationale: quota-bearing
  provider credentials must not be exposed to browser code.

## Research

Question: How should Geoapify Address Autocomplete be integrated for a
production birth-place autocomplete flow?

Decision affected: Provider contract, backend configuration, cache/rate-limit
strategy and frontend request timing.

Accessed: 2026-07-30.

### Sources

- https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/ -
  official endpoint, request params and response fields.
- https://www.geoapify.com/pricing/ - official plan credits and rate-limit
  model.
- https://www.geoapify.com/pricing-details/ - official credit accounting;
  autocomplete requests consume credits.
- https://www.geoapify.com/tutorial/batch-geocoding-js-and-rate-limits/ -
  official guidance to respect provider request-rate limits.

### Findings

- Sourced fact: Geoapify autocomplete endpoint is
  `/v1/geocode/autocomplete` and requires `text` and `apiKey`.
- Sourced fact: `format=json` returns structured results with coordinates,
  formatted address, country/city/region fields and timezone data.
- Sourced fact: each autocomplete request consumes provider credits.
- Repository evidence: `apps/astrologer-api/src/modules/redis` already provides
  an API Redis client and `apps/astrologer-api/src/modules/ai/ai-rate-limiter.ts`
  uses Redis sorted sets through Lua for sliding-window limits.
- Inference: Birth-place autocomplete should use Redis for cache, single-flight
  and rate limits because this state is operational, short-lived and shared
  across API instances.

### Options

1. Direct Geoapify call from provider only. Low code cost, but wastes credits,
   has no shared throttling and repeats requests during typing bursts.
2. Geoapify provider with Redis cache and rate limits. Fits current API
   patterns, protects quota and is safe across multiple API instances.
3. Postgres-backed cache/rate limit. Durable but wrong operational store for
   ephemeral request-control state and adds avoidable DB write load.

### Recommendation

Use option 2: Geoapify provider behind Redis cache, single-flight and
sliding-window rate limits, with typed service-unavailable and rate-limit
errors.

### Rejected Alternatives

- Nominatim fallback: rejected by user and would keep the failed provider in the
  production path.
- Browser-side Geoapify calls: exposes API key and quota behavior to clients.
- In-memory cache: not shared across instances and explicitly rejected by user.
- Postgres cache/rate-limit: operationally heavier and mismatched to volatile
  provider-control state.

### User Decisions

None remaining for this implementation.

## Context and Orientation

Affected route/state:

- Frontend: chart engine birth-data form in
  `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`.
- API: `GET /clients/birth-places` in `astrologer-api`.
- Contract: `clientBirthPlaceSearchQuerySchema`,
  `clientBirthPlaceCandidateSchema`.
- Runtime: `astrologerApi.birthPlaceSearch` config and Redis client.

## Interfaces and Dependencies

- Frontend sends `{ query, limit }` through validated contracts.
- Backend validates the same query contract and requires authenticated
  astrologer session.
- Geoapify API key is read from `ASTROLOGER_API_GEOAPIFY_API_KEY`.
- Redis keys are namespaced with a configurable prefix.

## Plan of Work

1. Update tests for Geoapify provider, contract minimum query length and
   `provider: "geoapify"`.
2. Add Redis birth-place search cache/rate-limit tests.
3. Replace Nominatim provider binding with Geoapify + Redis decorator.
4. Update runtime config and Redis client port as needed.
5. Update frontend debounce to 800 ms and minimum query length to three.
6. Run targeted contract/backend/frontend checks and diff review.

## Concrete Steps

Commands run from `/Users/anton/Finext/ElevenHouse`:

- `pnpm test packages/contracts/src/clients.test.ts -- --runInBand`
- `pnpm test apps/astrologer-api/src/modules/clients/... -- --runInBand`
- `pnpm test apps/astrologer-api/src/config/runtime-config.test.ts -- --runInBand`
- `pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx -- --runInBand`
- `pnpm --filter @elevenhouse/astrologer-api typecheck`
- `pnpm --filter @elevenhouse/astrologer-web typecheck`
- `git diff --check`

## Validation and Acceptance

- Contract rejects two-character birth-place queries and accepts Geoapify
  provider candidates.
- Backend maps Geoapify responses into birth-place candidates.
- Backend does not call Geoapify when a Redis cache hit exists.
- Backend enforces Redis-backed rate limits before provider calls.
- Frontend waits 800 ms and avoids API calls under three characters.
- Nominatim references are removed from active provider/config/contract code.

## Idempotence and Recovery

No destructive commands, deploys or external writes. Redis keys are TTL-bound
and safe to recompute. Provider failures are not cached.

## Artifacts and Notes

This plan is the working implementation artifact for the current request.

## Outcomes & Retrospective

Achieved behavior:

- Nominatim active provider/config/contract code was removed.
- Geoapify Address Autocomplete is the only birth-place provider path.
- Redis protects Geoapify with shared cache, single-flight lock and
  sliding-window per-owner/global rate limits.
- Local ignored `.env` contains Geoapify runtime variables; tracked
  `.env.example` contains placeholders only.
- One bounded direct Geoapify request with the local key returned HTTP 200 and
  a `Europe/Kaliningrad` result for `Kaliningrad`.

Gaps:

- Full browser/API runtime flow was not exercised because the API process was
  not running and this task did not include process lifecycle changes.
