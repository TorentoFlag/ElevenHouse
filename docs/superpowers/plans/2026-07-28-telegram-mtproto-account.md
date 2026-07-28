# Telegram MTProto Account Connection

## Purpose / Big Picture

ElevenHouse must offer astrologers two first-class Telegram connection methods:
Telegram Business / Secretary bot and Telegram Account / MTProto. This plan
implements the second method without presenting it as a fallback. The first
observable MTProto slice proves a safe account-login contour, encrypted session
handling, provider adapter behavior and worker-ready runtime configuration.

The first user-visible completion target is:

1. An astrologer selects Telegram Account / MTProto in the Inbox channel setup.
2. ElevenHouse runs a phone -> code -> optional 2FA password authorization flow.
3. A worker-owned MTProto session can receive live messages and send replies as
   the connected Telegram account.
4. Connection status, reauth and realtime freshness use the existing Messaging
   contracts and SSE surface.

History import is intentionally not part of the first completion target. It
remains a later background job slice because live reliability, secret handling
and reauth state are higher-risk prerequisites.

## Progress

- 2026-07-28: Product decision confirmed by user: implement MTProto after
  Telegram Business, but keep both methods equal choices.
- 2026-07-28: User clarified history import may be deferred if complex.
- 2026-07-28: Telegram Business stabilization was committed separately as
  `ab06ebe fix(messaging): stabilize Telegram Business inbox`.
- 2026-07-28: MTProto implementation started. Current milestone: Slice 0,
  provider spike and adapter scaffolding.
- 2026-07-28: Added MTProto runtime config, safe provider boundary, Teleproto
  low-level send wrapper, env example and worker dependencies. Targeted tests
  passed for runtime config, provider mapping and wrapper invocation.
- 2026-07-28: Added Telegram Account login contracts, domain start command,
  Drizzle session schema, current baseline SQL/snapshot entries and Drizzle
  start adapter test. History import, actual Teleproto auth calls, API routes,
  worker listeners and UI wizard remain pending slices.
- 2026-07-28: Added astrologer-api MTProto start route/config/provider wiring.
  The start flow now validates phone + explicit consent, requests a Telegram
  login code through a `teleproto` provider, persists only encrypted phone and
  `phone_code_hash`, and returns a contract-safe `code_required` response.
  Submit code/password, exported session storage, worker listener and UI wizard
  remain pending slices.
- 2026-07-28: Added MTProto code/password API state transitions. The code step
  decrypts phone + `phone_code_hash`, submits the user code to Telegram, then
  stores only an encrypted partial/final session. The password step decrypts
  the partial session, submits the password without persisting it, activates
  the channel connection and stores only the encrypted final session.
- 2026-07-28: Added the first notification-worker MTProto account runtime
  contour. The worker can claim authorized account sessions with a PostgreSQL
  lease, decrypt the saved session using the owner-scoped AAD, create a
  Teleproto-backed client through an adapter factory, expose a local leased
  session provider for outbound delivery, heartbeat/release owned leases and
  route `telegram_mtproto_account` outbox work items through the shared
  delivery retry/status pipeline. Live inbound update normalization and
  `updates.getDifference` reconciliation remain pending.
- 2026-07-28: Added live MTProto `NewMessage` ingestion for leased account
  sessions. The worker now subscribes Teleproto clients to new-message events,
  normalizes text updates, persists inbound client messages and observed
  outbound Telegram-account messages through the shared Messaging domain/DB
  store, advances Telegram cursor fields on successful persistence, and logs
  inbound processing failures. Full `updates.getDifference` gap recovery and
  MTProto media ingestion remain pending slices.

## Surprises & Discoveries

- Current domain, DB and contracts already include `telegram_mtproto_account`,
  so MTProto should extend the existing provider-neutral Messaging model rather
  than create a separate inbox subsystem.
- Current delivery path is outbox -> `notification-worker`; long-lived MTProto
  clients must live in a worker contour, not in `astrologer-api` request
  handlers.
- The repository had unrelated finance/payment-reversal schema drift visible to
  `pnpm db:generate`. The MTProto slice keeps `0000` as the only migration and
  records only the MTProto session table in the messaging baseline tests.
- The shared checkout contains unrelated dirty files in root `package.json`,
  `packages/db/package.json`, `.design-qa/*`, `apps/astrologer-web/src/features/flows/`
  and dev-calendar seed scripts. Do not stage or rewrite them for this plan.

## Decision Log

- 2026-07-28: Use `teleproto` as the first Node/TypeScript MTProto library
  behind an ElevenHouse adapter port. Rationale: the original GramJS `telegram`
  npm package is archived/deprecated and points users to `teleproto`, an
  actively maintained largely compatible fork. TDLib remains the fallback if
  the bounded spike exposes runtime instability.
- 2026-07-28: Keep history import out of the first DoD. Rationale: it is not
  required to prove account auth and live messaging, and a full backfill needs
  separate throttling, per-chat cursors and product progress states.
- 2026-07-28: Store MTProto session material only encrypted with authenticated
  encryption. Never store 2FA password; never log phone, code, password,
  session string, auth key or message body.

## Research

Question: which MTProto library and protocol semantics should shape the first
ElevenHouse implementation?

Access date: 2026-07-28.

Sources:

- Telegram User Authorization: https://core.telegram.org/api/auth
- Telegram API ID: https://core.telegram.org/api/obtaining_api_id
- Telegram Updates: https://core.telegram.org/api/updates
- Telegram `updates.getDifference`: https://core.telegram.org/method/updates.getDifference
- Telegram `messages.sendMessage`: https://core.telegram.org/method/messages.sendMessage
- GramJS quick start and package name: https://gram.js.org/
- GramJS advanced installation: https://gram.js.org/introduction/advanced-installation
- npm `telegram` package: https://www.npmjs.com/package/telegram
- npm `teleproto` package: https://www.npmjs.com/package/teleproto
- Teleproto docs: https://docs.teleproto.dev

Findings:

- Sourced fact: Telegram user authorization for third-party clients is not OAuth;
  it logs the application in as a Telegram client with `api_id` and `api_hash`.
- Sourced fact: clients must track update state and fill gaps with
  `updates.getDifference`; a pure in-memory listener is not reliable enough for
  ElevenHouse.
- Repository evidence: the first live listener slice records `NewMessage`
  events and persists Telegram `pts/qts/date/seq` cursors when supplied by
  Teleproto, but does not yet call `updates.getDifference` on startup or gap
  detection.
- Sourced fact: MTProto `messages.sendMessage` uses `random_id`, which must be
  tied to our durable outbox/idempotency model to avoid duplicate sends.
- Repository evidence: Messaging commands already persist state and outbox
  events, and `notification-worker` already owns provider delivery retries.
- Sourced fact: the GramJS `telegram` npm package is archived/deprecated and
  recommends `teleproto` as the actively maintained compatible fork.
- Inference: `teleproto` is the least disruptive first library because it keeps
  the worker in TypeScript while avoiding a newly introduced deprecated
  dependency; TDLib is more robust but adds native runtime and storage
  complexity.

Rejected alternatives:

- Put MTProto clients in `astrologer-api`: rejected because request processes
  should not own long-lived sessions/listeners.
- Implement full history import first: rejected for first slice because it
  expands reliability and UX scope before live account messaging is proven.
- Treat MTProto as support-only or hidden: rejected because the product decision
  requires a real user choice.

## Context and Orientation

Relevant existing paths:

- `docs/superpowers/specs/2026-07-21-clients-messaging-telegram-architecture-design.md`
- `docs/api/api-boundaries.md`
- `packages/domain/src/messaging/*`
- `packages/contracts/src/messaging.ts`
- `packages/db/src/schema/messaging/*`
- `packages/db/src/adapters/messaging/*`
- `apps/astrologer-api/src/modules/messaging/*`
- `apps/notification-worker/src/*messaging*`
- `apps/astrologer-web/src/pages/inbox/*`

Current state:

- `telegram_mtproto_account` exists in shared types and DB mode checks.
- UI shows the Telegram Account / MTProto option but keeps it disabled.
- `POST /messaging/channel-connections/telegram/mtproto/start`,
  `/code` and `/password` exist in `astrologer-api` with encrypted-only
  persistence and CSRF protection.
- There is no account listener worker, outbound MTProto delivery route or UI
- Notification-worker has a leased account session supervisor, outbound
  delivery route and live text `NewMessage` ingestion. Startup/gap
  reconciliation through `updates.getDifference`, MTProto media ingestion and
  UI wizard remain pending.

## Interfaces and Dependencies

Planned API routes:

- `POST /messaging/channel-connections/telegram/mtproto/start`
- `POST /messaging/channel-connections/telegram/mtproto/code`
- `POST /messaging/channel-connections/telegram/mtproto/password`
- `POST /messaging/channel-connections/:connectionId/disconnect`

Planned worker provider ports:

- `TelegramMtprotoAuthProvider`: send code, sign in with code, complete password,
  export session and read self snapshot.
- `TelegramMtprotoSessionProvider`: connect from encrypted session, listen for
  live updates, send message with durable `random_id`, fetch state difference.
- `TelegramMtprotoSecretCipher`: wraps the existing AES-256-GCM secret cipher
  with MTProto-specific AAD and key id metadata.

Dependency direction:

- `packages/domain` defines use cases and ports, not Drizzle or GramJS.
- `packages/db` owns schema and adapters.
- `apps/astrologer-api` composes auth commands.
- `apps/notification-worker` composes GramJS, delivery, listeners and workers.
- Frontend uses contracts only.

## Plan of Work

### Slice 0: Provider Spike And Worker-Ready Adapter

Observable result: codebase has a tested MTProto runtime config and provider
adapter boundary that can be wired to a real GramJS spike without leaking
credentials.

Tasks:

- Add notification-worker MTProto config for `api_id`, `api_hash`,
  session-encryption key and feature enablement.
- Add `teleproto` dependency to `apps/notification-worker`.
- Add a small provider wrapper around GramJS session/auth/send primitives behind
  an internal interface.
- Add tests for config validation, secret redaction and provider error
  classification.
- Add a dev-only spike script or documented command that runs only when explicit
  MTProto env is supplied.

### Slice 1: Contracts, Domain And DB State Machine

Observable result: MTProto login state can be persisted and read without any UI
fake success.

Tasks:

- Add request/response contracts for phone, code and password steps. Completed
  for start/code/password DTOs and login response.
- Add MTProto login/session schema and Drizzle adapters. Completed for start
  persistence with encrypted phone and phone-code-hash snapshots.
- Add domain use cases for start, submit code, submit password, reauth and
  disconnect. Completed for start/code/password; reauth/disconnect remain
  pending.
- Store no plaintext phone except masked/last4 display value; store no code,
  password or raw session.

### Slice 2: API Auth Routes

Observable result: `astrologer-api` exposes owner-scoped, CSRF-protected MTProto
auth commands with safe typed errors.

Tasks:

- Add controller routes and service methods.
- Compose provider port and secret cipher.
- Add e2e/service tests for owner scoping, CSRF, invalid code, password
  required, flood wait and no sensitive errors. Completed for CSRF,
  code/password happy states and no sensitive response/command leakage;
  invalid code/flood wait provider mapping remains pending.

### Slice 3: Worker Listener And Outbound Delivery

Observable result: active MTProto sessions are processed by worker leases and
can receive/send live messages through existing Messaging records.

Tasks:

- Add lease acquisition and heartbeat for active sessions. Completed for
  authorized session claim, heartbeat, release and reauth marking.
- Add listener startup/resume and update cursor persistence.
- Normalize inbound updates to external identities, threads and messages.
  Completed for live text `NewMessage` events with inbound/outbound direction
  split and cursor persistence; `updates.getDifference` startup/gap recovery
  remains pending.
- Generalize outbound delivery routing between Business Bot API and MTProto.
  Completed for delivery work-item union, processor routing and shared
  retry/final-status recording.
- Persist Telegram `random_id`/provider message id mapping. Completed for
  deterministic `random_id` generation and provider response message id storage
  through the existing delivery attempt/message fields.

### Slice 4: Frontend Wizard

Observable result: the disabled MTProto card becomes a real wizard with
consent, phone, code, optional password, active and reauth states.

Tasks:

- Split Telegram setup UI into method-specific components.
- Add model/api functions for MTProto auth.
- Add component tests and browser verification for the wizard.
- Keep visual language aligned with the existing Inbox modal reference.

### Slice 5: Deferred History Import

Observable result: optional background import can pull available history with
per-chat cursors, dedupe and progress. This slice starts only after live MTProto
is stable.

## Concrete Steps

All commands run from `/Users/anton/Finext/ElevenHouse`.

Initial Slice 0 red/green commands:

```bash
pnpm vitest run apps/notification-worker/src/runtime-config.test.ts
pnpm vitest run apps/notification-worker/src/telegram-mtproto-provider.test.ts
pnpm --filter @elevenhouse/notification-worker typecheck
```

Dependency command, only after tests define the expected adapter/config surface:

```bash
pnpm --filter @elevenhouse/notification-worker add teleproto
```

Do not run or restart worker processes without explicit user command.

## Validation and Acceptance

Slice 0 acceptance:

- Config tests prove MTProto env parsing and production requirements.
- Provider tests prove safe error mapping and no credential leakage.
- Typecheck passes for `@elevenhouse/notification-worker`.
- No runtime E2E claim until a real test Telegram account is connected.

Full feature acceptance:

- Unit/domain/contract tests for state machine and security rules.
- DB tests for encrypted session persistence, uniqueness and cursors.
- API e2e tests for auth, CSRF and typed errors.
- Worker tests for live updates, cursor ack, retry and reauth.
- Worker lease/outbound tests for session claim, heartbeat, release, MTProto
  delivery routing and no session-text logging.
- Browser-backed UI test for the MTProto wizard.
- Real Telegram account runtime test for login, receive, send and reauth.

## Idempotence and Recovery

- Login attempts expire and can be restarted.
- Reusing a code/password request after completion returns current connection
  state or a stable conflict, never duplicate sessions.
- Worker leases prevent multiple workers from owning the same MTProto session.
- Cursor advances only after successful message persistence.
- Disconnect stops local session use and marks the connection unavailable.
- Provider flood waits become typed retry/backoff states, not tight loops.

## Artifacts and Notes

- Current plan file:
  `docs/superpowers/plans/2026-07-28-telegram-mtproto-account.md`
- Runtime logs and screenshots must not contain phone numbers, verification
  codes, 2FA passwords, session strings, auth keys or message bodies.

## Outcomes & Retrospective

Partial, Slice 0:

- Achieved: worker runtime can parse explicit MTProto settings and fail fast on
  partial config.
- Achieved: MTProto delivery provider boundary maps flood waits, reauth-like
  failures and unknown exceptions without leaking API hash or session
  descriptors.
- Achieved: Teleproto wrapper invokes low-level `messages.SendMessage` with the
  durable random id supplied by the provider boundary.
- Not yet achieved: real account login spike, encrypted session persistence,
  listener leases/cursors, API routes and UI wizard.
