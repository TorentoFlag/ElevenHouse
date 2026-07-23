# Messaging Foundation Realtime Telegram Business Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy overrides generic worktree/feature-branch guidance: execute in the existing checkout on `main`, preserve concurrent changes, and do not commit without separate user authority.

**Goal:** Deliver the first production Messaging foundation for ElevenHouse: provider-neutral channel connections, threads, messages, inbound dedupe, outbound idempotency, delivery attempts, SSE realtime events, and the Telegram Business / Secretary bot backend seam.

**Architecture:** `Messaging` owns conversation state in domain, contracts and PostgreSQL. `astrologer-api` owns authenticated commands, webhook ingestion and SSE subscription; PostgreSQL is the source of truth; outbox/BullMQ carries identifiers only; `notification-worker` executes provider delivery jobs without owning threads or CRM relationships.

**Tech Stack:** TypeScript 6, NestJS, Drizzle ORM, PostgreSQL, BullMQ/Redis, Zod-backed contracts, React 19, Vite 8, TanStack Query 5, Vitest, existing ElevenHouse security/idempotency/outbox patterns.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Re-read complete target files and their path-scoped diff before every edit group.
- Preserve all unowned modifications, including current `apps/astrologer-web/src/features/charts/components/ChartEnginePage.*`, `.design-qa/*`, and any unrelated dirty files.
- Do not start, stop, restart, or kill frontend, API, workers, Docker, PostgreSQL, Redis, queues or other long-running processes without direct user authority.
- Do not commit, push, create a PR, switch branches, stash, rebase, cherry-pick or create a worktree without direct user authority.
- Telegram Business / Secretary bot and Telegram MTProto Account are first-class product modes. This plan implements the foundation and Telegram Business seam; MTProto login/listener is a later plan.
- Instagram is represented only as future provider shape. Do not implement Meta OAuth, App Review, webhook delivery or send-message behavior in this plan.
- Message sending is an HTTP mutation with CSRF and `Idempotency-Key`; realtime is a freshness transport, not the write path.
- SSE is the first realtime transport behind a `RealtimeGateway` abstraction. Do not bake SSE into domain types.
- Controllers must not send provider messages directly. API transactions write DB state plus outbox; worker delivery reloads authoritative state from DB.
- Queue payloads contain identifiers only, never message text, provider credentials, tokens, session strings or raw webhook bodies.
- Do not log message body, phone numbers, Telegram codes, credentials, business connection secrets or raw provider payloads.
- Do not create browser-local messaging state, fake provider success, localStorage-backed chats, disabled success paths or mocked production behavior.
- AI draft generation is out of scope. Do not send Telegram content to AI.
- Visible `/clients` and `/inbox` production UI are out of scope for this plan except for app-local API/realtime clients needed by later UI work.

---

## Source Artifacts

- Architecture spec: `docs/superpowers/specs/2026-07-21-clients-messaging-telegram-architecture-design.md`
- Product scope: `docs/product/full-functional-scope.md`
- Roadmap: `docs/product/roadmap.md`
- Design mapping: `docs/architecture/design-reference-inventory.md`
- Backend modules: `docs/architecture/backend-modules.md`
- API boundaries: `docs/api/api-boundaries.md`
- Outbox/worker ADR: `docs/decisions/0004-payments-notifications-workers.md`
- CSRF/idempotency ADR: `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`
- Existing clients module: `apps/astrologer-api/src/modules/clients/*`
- Existing clients domain: `packages/domain/src/clients/*`
- Existing clients DB adapter: `packages/db/src/adapters/clients/*`
- Existing outbox relay: `packages/db/src/adapters/outbox/drizzle-outbox-relay.ts`
- Existing notification worker pattern: `apps/notification-worker/src/auth-code-delivery.*`

## Current Shared Checkout

- Branch: `main`, ahead of `origin/main`.
- Staged files at plan creation: none.
- Existing unowned changes at plan creation:
  - `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
  - `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
  - `.design-qa/astro-calendar-analysis/`
  - `.design-qa/chart-engine-dependency-analysis/`
  - `.design-qa/chart-engine-frontend/`
- Agent-owned inputs at plan creation:
  - `docs/superpowers/specs/2026-07-21-clients-messaging-telegram-architecture-design.md`
  - this plan file.

## Scope

### Included

- Canonical docs/ADR alignment for Messaging architecture.
- Shared contracts for channel connections, external identities, threads, messages, delivery attempts, webhook ingestion result, outbound send result and realtime events.
- Domain Messaging types, errors, use cases and ports.
- Drizzle schema for messaging tables and realtime event log.
- DB adapters for messaging state, inbound dedupe, outbound idempotent creation, delivery attempts and event-log reads.
- `astrologer-api` Messaging module for authenticated reads and commands.
- Provider webhook foundation for Telegram bot updates with secret-token validation.
- Outbox payload and `notification-worker` relay/processor for outbound messaging delivery.
- Telegram Business provider adapter interface and HTTP implementation seam guarded by runtime config.
- SSE endpoint and frontend realtime client module.
- Targeted tests at contracts, domain, DB adapter, API, worker and frontend-client levels.

### Excluded

- Full `/clients` CRM UI.
- Full `/inbox` UI.
- Telegram MTProto login, encrypted user sessions, listener worker and history import.
- Real Instagram integration.
- Attachments beyond schema/read-model fields and safe `unsupported` normalization.
- AI reply drafts.
- Broadcasts and automations.
- Process startup, provider credential configuration and production webhook registration.

## File Structure

### Documentation

- Create: `docs/decisions/0010-messaging-channel-architecture.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/design-reference-inventory.md`

### Shared Contracts

- Create: `packages/contracts/src/messaging.ts`
- Create: `packages/contracts/src/messaging.test.ts`
- Modify: `packages/contracts/src/index.ts`

### Domain

- Create: `packages/domain/src/messaging/messaging-types.ts`
- Create: `packages/domain/src/messaging/messaging-errors.ts`
- Create: `packages/domain/src/messaging/messaging-events.ts`
- Create: `packages/domain/src/messaging/messaging-store.ts`
- Create: `packages/domain/src/messaging/messaging-use-cases.ts`
- Create: `packages/domain/src/messaging/messaging-use-cases.test.ts`
- Create: `packages/domain/src/messaging/index.ts`
- Modify: `packages/domain/src/index.ts`

### Database

- Create: `packages/db/src/schema/messaging/messaging-values.ts`
- Create: `packages/db/src/schema/messaging/channel-connections.schema.ts`
- Create: `packages/db/src/schema/messaging/external-identities.schema.ts`
- Create: `packages/db/src/schema/messaging/threads.schema.ts`
- Create: `packages/db/src/schema/messaging/thread-identities.schema.ts`
- Create: `packages/db/src/schema/messaging/messages.schema.ts`
- Create: `packages/db/src/schema/messaging/message-delivery-attempts.schema.ts`
- Create: `packages/db/src/schema/messaging/realtime-events.schema.ts`
- Create: `packages/db/src/schema/messaging/relations.schema.ts`
- Create: `packages/db/src/schema/messaging/index.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/outbox/outbox-events.schema.ts`
- Create: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Create: `packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts`
- Create: `packages/db/src/adapters/messaging/drizzle-messaging-store.integration.ts`
- Create: `packages/db/src/adapters/messaging/index.ts`
- Modify: `packages/db/src/adapters/index.ts`

### Astrologer API

- Modify: `apps/astrologer-api/src/app.module.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging-events.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.module.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.tokens.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging-http-errors.ts`
- Create: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.ts`
- Create: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.test.ts`
- Create: `apps/astrologer-api/src/modules/messaging/realtime-event-stream.ts`
- Create: `apps/astrologer-api/src/modules/messaging/realtime-event-stream.test.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.service.test.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts`

### Notification Worker

- Create: `apps/notification-worker/src/messaging-delivery.queue.ts`
- Create: `apps/notification-worker/src/messaging-delivery.queue.test.ts`
- Create: `apps/notification-worker/src/messaging-delivery.outbox-relay.ts`
- Create: `apps/notification-worker/src/messaging-delivery.outbox-relay.test.ts`
- Create: `apps/notification-worker/src/messaging-delivery.processor.ts`
- Create: `apps/notification-worker/src/messaging-delivery.processor.test.ts`
- Create: `apps/notification-worker/src/telegram-business-provider.ts`
- Create: `apps/notification-worker/src/telegram-business-provider.test.ts`
- Modify: `apps/notification-worker/src/main.ts`
- Modify: `apps/notification-worker/src/runtime-config.ts`
- Modify: `apps/notification-worker/src/runtime-config.test.ts`

### Astrologer Web API Client

- Create: `apps/astrologer-web/src/features/messaging/api/messagingApi.ts`
- Create: `apps/astrologer-web/src/features/messaging/api/messagingApi.test.ts`
- Create: `apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.ts`
- Create: `apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.test.ts`

---

## Task 1: Align Canonical Architecture Docs

**Files:**

- Create: `docs/decisions/0010-messaging-channel-architecture.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/design-reference-inventory.md`

**Interfaces:**

- Consumes: approved architecture spec.
- Produces: durable architecture decision and API/module mapping for implementation tasks.

- [ ] **Step 1: Re-read target docs and diffs**

Run:

```bash
sed -n '94,170p' docs/architecture/backend-modules.md
sed -n '1,260p' docs/api/api-boundaries.md
sed -n '158,162p' docs/architecture/design-reference-inventory.md
test -e docs/decisions/0010-messaging-channel-architecture.md; echo $?
git diff -- docs/architecture/backend-modules.md docs/api/api-boundaries.md docs/architecture/design-reference-inventory.md docs/decisions/0010-messaging-channel-architecture.md
```

Expected: target ADR does not exist (`1`) and no unowned diff in target docs.

- [ ] **Step 2: Write the ADR**

Create `docs/decisions/0010-messaging-channel-architecture.md` with:

```markdown
# 0010. Messaging Channel Architecture

Date: 2026-07-21

## Status

Accepted for implementation planning.

## Context

ElevenHouse needs a production Clients and Inbox contour where astrologers can
communicate with clients through external channels while preserving personal
brand. Telegram is the first provider. Telegram Business / Secretary bot and
Telegram MTProto Account are both first-class connection modes.

## Decision

Messaging owns channel connections, external identities, threads, messages,
delivery attempts, inbound dedupe, outbound idempotency and realtime event
publication. Clients owns CRM relationships, manual client creation, birth data
and private notes.

Outbound message send is an authenticated HTTP command protected by CSRF and an
Idempotency-Key. The command writes durable PostgreSQL state and an outbox event
in one transaction. Worker delivery reloads message and connection state by id
and calls provider adapters. Queue payloads contain identifiers only.

Realtime uses an app-local RealtimeGateway abstraction. The first transport is
SSE for server-to-browser freshness. WebSocket remains a later transport option
for approved bidirectional realtime features.

Telegram provider support is modeled through channel connection capabilities.
`telegram_business_bot` stores Telegram Business connection ids and rights.
`telegram_mtproto_account` stores encrypted user-session material in a later
implementation slice. Instagram is represented as a future provider adapter,
not implemented by this decision.

## Consequences

- Controllers do not send Telegram messages directly.
- Browser state is never the source of truth for messages.
- Provider credentials, sessions and message bodies are not logged or placed in
  queue payloads.
- Inbound webhooks must validate provider authenticity and dedupe provider
  update/message ids before acknowledging.
- Full Inbox UI must use durable message state plus realtime invalidation, not
  localStorage or mock conversations.
```

- [ ] **Step 3: Update module/API docs**

Modify docs so they state:

- `Messaging` is an implemented/planned domain module with provider-neutral state.
- `astrologer-api` owns authenticated `/messaging/*` commands and SSE.
- provider webhooks are CSRF-exempt only because they are provider-authenticated webhooks.
- `notification-worker` may execute Messaging delivery jobs, but Messaging owns conversation state.
- `/clients` and `/inbox` inventory rows should point to the new spec and ADR.

- [ ] **Step 4: Verify docs**

Run:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check -- docs/decisions/0010-messaging-channel-architecture.md docs/architecture/backend-modules.md docs/api/api-boundaries.md docs/architecture/design-reference-inventory.md
```

Expected: docs checks pass; diff check reports no whitespace errors.

## Task 2: Add Shared Messaging Contracts

**Files:**

- Create: `packages/contracts/src/messaging.ts`
- Create: `packages/contracts/src/messaging.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces Zod schemas and exported TypeScript types:
  - `MessagingProviderSchema`
  - `MessagingChannelModeSchema`
  - `MessagingChannelConnectionResponseSchema`
  - `MessagingExternalIdentityResponseSchema`
  - `MessagingThreadListResponseSchema`
  - `MessagingThreadResponseSchema`
  - `MessagingMessageResponseSchema`
  - `SendMessagingMessageRequestSchema`
  - `LinkMessagingThreadClientRequestSchema`
  - `CreateMessagingThreadClientRequestSchema`
  - `MessagingRealtimeEventSchema`
  - `TelegramBusinessWebhookAcceptedResponseSchema`
- Consumed by domain mappers, `astrologer-api`, `astrologer-web` API client and tests.

- [ ] **Step 1: Re-read contracts package patterns**

Run:

```bash
sed -n '1,220p' packages/contracts/src/clients.ts
sed -n '1,180p' packages/contracts/src/calendar.ts
sed -n '1,120p' packages/contracts/src/index.ts
git diff -- packages/contracts/src
```

Expected: current contracts use Zod schemas and exported inferred types.

- [ ] **Step 2: Write failing contract tests**

Create `packages/contracts/src/messaging.test.ts` with tests that assert:

- provider enum accepts `telegram` and `instagram`;
- channel mode enum accepts `telegram_business_bot`, `telegram_mtproto_account`, `instagram_graph`;
- send request trims text and rejects empty text;
- realtime event accepts `message.received` and requires monotonic string `eventId`;
- response schemas reject raw provider tokens/session fields.

Run:

```bash
pnpm test packages/contracts/src/messaging.test.ts
```

Expected: fails because `packages/contracts/src/messaging.ts` does not exist.

- [ ] **Step 3: Implement contract schemas**

Create `packages/contracts/src/messaging.ts` with enum schemas, response schemas and request schemas. Use strict objects for every browser-facing DTO. Represent provider capabilities as explicit booleans:

```ts
export const MessagingChannelCapabilitiesSchema = z.strictObject({
  canSend: z.boolean(),
  canReceive: z.boolean(),
  canRead: z.boolean(),
  supportsHistoryImport: z.boolean(),
  supportsMessageEdits: z.boolean(),
  supportsMessageDeletes: z.boolean(),
  supportsAttachments: z.boolean()
});
```

Ensure outbound send request is:

```ts
export const SendMessagingMessageRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  channelConnectionId: z.string().uuid().optional()
});
```

Export all inferred types. Add `export * from "./messaging";` to `packages/contracts/src/index.ts`.

- [ ] **Step 4: Verify contracts**

Run:

```bash
pnpm test packages/contracts/src/messaging.test.ts packages/contracts/src/index.test.ts
pnpm --filter @elevenhouse/contracts typecheck
```

Expected: tests and contracts typecheck pass.

## Task 3: Add Messaging Domain Types And Use Cases

**Files:**

- Create: `packages/domain/src/messaging/messaging-types.ts`
- Create: `packages/domain/src/messaging/messaging-errors.ts`
- Create: `packages/domain/src/messaging/messaging-events.ts`
- Create: `packages/domain/src/messaging/messaging-store.ts`
- Create: `packages/domain/src/messaging/messaging-use-cases.ts`
- Create: `packages/domain/src/messaging/messaging-use-cases.test.ts`
- Create: `packages/domain/src/messaging/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces domain functions:
  - `normalizeSendMessageInput(input)`
  - `createOutboundMessage(input)`
  - `recordInboundProviderMessage(input)`
  - `linkThreadToClient(input)`
  - `createClientFromThread(input)`
  - `markThreadRead(input)`
  - `normalizeRealtimeEvent(input)`
- Produces event type constants:
  - `messagingMessageDeliveryRequestedEventType`
  - `messagingMessageReceivedEventType`
  - `messagingThreadUpdatedEventType`
- Consumes only domain ports, no DB imports.

- [ ] **Step 1: Re-read domain patterns**

Run:

```bash
sed -n '1,260p' packages/domain/src/clients/client-use-cases.ts
sed -n '1,220p' packages/domain/src/calculations/pdf/calculation-pdf-use-cases.ts
sed -n '1,100p' packages/domain/src/index.ts
git diff -- packages/domain/src
```

Expected: use cases depend on ports and normalize inputs before store calls.

- [ ] **Step 2: Write failing domain tests**

Create `packages/domain/src/messaging/messaging-use-cases.test.ts` with in-memory store tests for:

- outbound send trims text, requires owner-scoped thread, creates one queued message and one delivery-requested outbox event;
- replay with same idempotency key and same request hash returns existing queued message;
- replay with same idempotency key and different text throws `MessagingIdempotencyConflictError`;
- inbound provider duplicate returns existing message instead of creating a second one;
- linking a thread to an unrelated client throws `MessagingClientRelationshipError`;
- create-client-from-thread calls the Clients port explicitly and does not auto-merge identities silently;
- mark-read publishes `thread.updated` realtime event.

Run:

```bash
pnpm test packages/domain/src/messaging/messaging-use-cases.test.ts
```

Expected: fails because Messaging domain files do not exist.

- [ ] **Step 3: Implement domain contracts and ports**

Define `MessagingStore` methods in `messaging-store.ts`:

```ts
export type MessagingStore = {
  readonly findThreadForAstrologer: (input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
  }) => Promise<MessagingThread | null>;
  readonly createOutboundMessage: (input: CreateOutboundMessageStoreInput) => Promise<MessagingMessage>;
  readonly findOutboundMessageByIdempotencyKey: (input: {
    readonly threadId: string;
    readonly idempotencyKey: string;
  }) => Promise<MessagingMessageWithRequestHash | null>;
  readonly recordInboundProviderMessage: (input: RecordInboundProviderMessageStoreInput) => Promise<InboundMessageRecordResult>;
  readonly linkThreadToClient: (input: LinkThreadToClientStoreInput) => Promise<MessagingThread>;
  readonly markThreadRead: (input: MarkThreadReadStoreInput) => Promise<MessagingThread>;
  readonly appendRealtimeEvent: (input: AppendMessagingRealtimeEventInput) => Promise<MessagingRealtimeEvent>;
};
```

Define a separate `MessagingClientRelationshipPort` with:

```ts
readonly assertActiveRelationship: (input: {
  readonly astrologerUserId: string;
  readonly clientUserId: string;
}) => Promise<void>;
readonly createManualClientFromExternalIdentity: (input: {
  readonly astrologerUserId: string;
  readonly displayName: string;
  readonly now: string;
}) => Promise<{ readonly clientUserId: string }>;
```

- [ ] **Step 4: Implement use cases**

Implement use cases with pure normalization and port calls. Do not import `@elevenhouse/db`. Compute request hashes using an injected `hashRequest(input)` port or a deterministic helper that returns `sha256:<hex>`.

Outbound event payload must include only:

```ts
{
  messageId: string;
  threadId: string;
  channelConnectionId: string;
  astrologerUserId: string;
}
```

No message text in outbox payload.

- [ ] **Step 5: Verify domain**

Run:

```bash
pnpm test packages/domain/src/messaging/messaging-use-cases.test.ts
pnpm --filter @elevenhouse/domain typecheck
```

Expected: tests and domain typecheck pass.

## Task 4: Add Messaging Drizzle Schema

**Files:**

- Create: `packages/db/src/schema/messaging/*`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/outbox/outbox-events.schema.ts`

**Interfaces:**

- Produces Drizzle tables for all schema names listed in the architecture spec.
- Extends `OutboxEventPayload` union with `MessagingMessageDeliveryRequestedPayload`.
- Consumed by DB adapters and notification worker relay.

- [ ] **Step 1: Re-read schema patterns**

Run:

```bash
sed -n '1,220p' packages/db/src/schema/clients/client-astrologer-relationships.schema.ts
sed -n '1,220p' packages/db/src/schema/outbox/outbox-events.schema.ts
sed -n '1,160p' packages/db/src/schema/index.ts
git diff -- packages/db/src/schema
```

Expected: current schema files use Drizzle pg-core with explicit checks and indexes.

- [ ] **Step 2: Write failing schema tests**

Create or extend schema tests to assert:

- messaging tables are exported from `packages/db/src/schema`;
- enum value arrays include Telegram Business, Telegram MTProto and Instagram future mode;
- `outbox_events` payload union accepts `messaging.message.delivery_requested`;
- table names match the spec exactly.

Run:

```bash
pnpm test packages/db/src/schema/messaging
```

Expected: fails because schema files do not exist.

- [ ] **Step 3: Implement schema files**

Create schema tables with explicit foreign keys:

- channel connections reference `users.id` by `astrologer_user_id`;
- external identities reference channel connections and optional `users.id` by `linked_client_user_id`;
- threads reference `users.id` by `astrologer_user_id` and optional `users.id` by `client_user_id`;
- messages reference threads, channel connections and external identities;
- delivery attempts reference messages;
- realtime events reference `users.id` by `astrologer_user_id`.

Use partial unique indexes where needed:

- inbound dedupe on `(channel_connection_id, provider_message_id, direction)` when provider message id is not null;
- outbound idempotency on `(thread_id, idempotency_key)` when direction is outbound;
- realtime event order index on `(astrologer_user_id, created_at, id)`.

Add check constraints for status/mode/provider values using local value arrays.

- [ ] **Step 4: Generate baseline migration**

Run:

```bash
pnpm db:generate
```

Expected: baseline migration updates deterministically. Do not run `pnpm db:reset` unless the user explicitly authorizes destructive local DB workflow.

- [ ] **Step 5: Verify schema**

Run:

```bash
pnpm test packages/db/src/schema/messaging
pnpm --filter @elevenhouse/db typecheck
git diff --check -- packages/db/src/schema packages/db/drizzle
```

Expected: schema tests, DB typecheck and diff check pass.

## Task 5: Add Messaging DB Adapter

**Files:**

- Create: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Create: `packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts`
- Create: `packages/db/src/adapters/messaging/drizzle-messaging-store.integration.ts`
- Create: `packages/db/src/adapters/messaging/index.ts`
- Modify: `packages/db/src/adapters/index.ts`

**Interfaces:**

- Implements `MessagingStore` from the domain package.
- Provides transaction-safe methods for inbound dedupe, outbound idempotent creation, delivery attempts and realtime event append.

- [ ] **Step 1: Re-read adapter patterns**

Run:

```bash
sed -n '1,360p' packages/db/src/adapters/clients/drizzle-client-store.ts
sed -n '1,220p' packages/db/src/adapters/outbox/drizzle-outbox-relay.ts
sed -n '1,180p' packages/db/src/adapters/scheduling/drizzle-idempotent-scheduling-command.ts
git diff -- packages/db/src/adapters
```

Expected: adapters map rows to domain objects and use transactions for multi-row changes.

- [ ] **Step 2: Write failing adapter tests**

Unit tests in `drizzle-messaging-store.test.ts` cover row mapping and safe error translation without local PostgreSQL.

Integration tests in `drizzle-messaging-store.integration.ts` cover:

- create channel connection;
- record inbound message twice and receive one message;
- create outbound message with outbox event in one transaction;
- create delivery attempt and mark sent;
- append realtime event and list events after cursor;
- reject cross-owner thread read.

Run:

```bash
pnpm test packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts
```

Expected: unit test fails because adapter does not exist.

- [ ] **Step 3: Implement adapter**

Implement `createDrizzleMessagingStore(database)` following `createDrizzleClientStore(database)`. Keep mapping functions local and small:

- `toMessagingChannelConnection(row)`
- `toMessagingExternalIdentity(row)`
- `toMessagingThread(row)`
- `toMessagingMessage(row)`
- `toMessagingRealtimeEvent(row)`

For inbound dedupe, catch the named unique violation and select the existing message by provider key.

For outbound create, insert message and outbox event in the same transaction. Use event type `messaging.message.delivery_requested` and aggregate id equal to `message.id`.

- [ ] **Step 4: Verify adapter unit tests**

Run:

```bash
pnpm test packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts
pnpm --filter @elevenhouse/db typecheck
```

Expected: unit tests and DB typecheck pass.

- [ ] **Step 5: Run integration tests only with existing local DB**

First read-only check:

```bash
set -a
source .env
set +a
node -e 'const u=new URL(process.env.DATABASE_URL); if(!["localhost","127.0.0.1"].includes(u.hostname)){throw new Error("DATABASE_URL is not local")}; console.log(u.hostname + ":" + u.port)'
```

If the command proves a local DB and the DB is already running, run:

```bash
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/messaging/drizzle-messaging-store.integration.ts
```

Expected: integration tests pass. If local DB is unavailable, mark integration verification blocked; do not start Docker.

## Task 6: Add Astrologer API Messaging Module

**Files:**

- Modify: `apps/astrologer-api/src/app.module.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.module.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.tokens.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging-http-errors.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.service.test.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts`

**Interfaces:**

- Produces authenticated routes:
  - `GET /messaging/channel-connections`
  - `GET /messaging/threads`
  - `GET /messaging/threads/:threadId`
  - `POST /messaging/threads/:threadId/messages`
  - `POST /messaging/threads/:threadId/link-client`
  - `POST /messaging/threads/:threadId/create-client`
  - `POST /messaging/threads/:threadId/read`
- Consumes shared contracts, Messaging domain use cases and Drizzle adapter.

- [ ] **Step 1: Re-read API module patterns**

Run:

```bash
sed -n '1,260p' apps/astrologer-api/src/modules/clients/clients.controller.ts
sed -n '1,260p' apps/astrologer-api/src/modules/clients/clients.service.ts
sed -n '1,220p' apps/astrologer-api/src/modules/bookings/bookings.controller.ts
sed -n '1,180p' apps/astrologer-api/src/app.module.ts
git diff -- apps/astrologer-api/src
```

Expected: module-local controller/service pattern with session guard, CSRF and idempotency decorators.

- [ ] **Step 2: Write failing service and e2e tests**

Service tests cover:

- list threads passes current astrologer id from session;
- send message validates body through contract and uses idempotency key;
- link-client rejects unrelated client through domain error mapping;
- create-client-from-thread returns new linked client id;
- read marks thread read.

E2E tests cover:

- unauthenticated requests return unauthorized;
- send mutation without CSRF is rejected;
- send mutation without `Idempotency-Key` is rejected;
- cross-owner thread returns safe 404;
- response schema contains no provider token/session fields.

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/messaging.service.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts
```

Expected: fails because module files do not exist.

- [ ] **Step 3: Implement module and register it**

Create `MessagingModule` with providers:

- `MessagingService`
- `MESSAGING_STORE`
- `MESSAGING_CLIENT_RELATIONSHIP_PORT`

Register `MessagingModule` in `apps/astrologer-api/src/app.module.ts`.

Use `@RequireCsrf()` and `@RequireIdempotency(...)` on durable mutations. Keep controllers thin: parse params/body, pass request/session/idempotency key to service, return service response.

- [ ] **Step 4: Verify API**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/messaging.service.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: messaging API tests and astrologer-api typecheck pass.

## Task 7: Add Telegram Business Webhook Foundation

**Files:**

- Create: `apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.ts`
- Create: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.module.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts`

**Interfaces:**

- Produces `POST /messaging/webhooks/telegram/bot`.
- Consumes Telegram webhook secret token from runtime config.
- Calls `recordInboundProviderMessage` for supported business message updates.

- [x] **Step 1: Re-read webhook/security patterns**

Run:

```bash
rg -n "webhook|RequireCsrf|rawBody|secret" apps packages docs
sed -n '1,220p' apps/astrologer-api/src/modules/security/csrf/csrf.guard.ts
sed -n '1,220p' apps/astrologer-api/src/modules/security/route-policy/route-security-policy.ts
git diff -- apps/astrologer-api/src/modules/messaging apps/astrologer-api/src/modules/security
```

Expected: webhook route must be explicitly CSRF-exempt by omission of browser mutation decorators and protected by provider secret.

- [x] **Step 2: Write failing parser tests**

Tests in `telegram-business-webhook.test.ts` cover:

- accepts Telegram `business_connection` update and extracts `business_connection_id`, user id, rights and enabled state;
- accepts `business_message` text update and extracts provider chat/message ids, sender snapshot, text and timestamp;
- maps unsupported non-text message to `contentType = "unsupported"` with no throw;
- rejects payloads missing required Telegram business identifiers.

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/telegram-business-webhook.test.ts
```

Expected: fails because parser does not exist.

- [x] **Step 3: Implement parser and controller**

Implement a pure parser in `telegram-business-webhook.ts`. Controller behavior:

- require header `x-telegram-bot-api-secret-token`;
- compare against configured `ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET`;
- return `401` on missing/wrong secret;
- parse update;
- call service method for business connection updates or inbound messages;
- return `{ "ok": true }` for accepted and duplicate updates.

Do not call Telegram Bot API from this controller.

- [x] **Step 4: Verify webhook**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/telegram-business-webhook.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: parser/e2e tests and typecheck pass.

## Task 8: Add Messaging Delivery Outbox And Worker Processor

**Files:**

- Modify: `packages/db/src/schema/outbox/outbox-events.schema.ts`
- Create: `apps/notification-worker/src/messaging-delivery.queue.ts`
- Create: `apps/notification-worker/src/messaging-delivery.queue.test.ts`
- Create: `apps/notification-worker/src/messaging-delivery.outbox-relay.ts`
- Create: `apps/notification-worker/src/messaging-delivery.outbox-relay.test.ts`
- Create: `apps/notification-worker/src/messaging-delivery.processor.ts`
- Create: `apps/notification-worker/src/messaging-delivery.processor.test.ts`
- Create: `apps/notification-worker/src/telegram-business-provider.ts`
- Create: `apps/notification-worker/src/telegram-business-provider.test.ts`
- Modify: `apps/notification-worker/src/runtime-config.ts`
- Modify: `apps/notification-worker/src/runtime-config.test.ts`
- Modify: `apps/notification-worker/src/main.ts`

**Interfaces:**

- Produces queue name `messaging.delivery`.
- Produces job name `deliver-messaging-message`.
- Job payload type is `{ outboxEventId: string }`.
- Produces `MessagingDeliveryProvider` with method `sendMessage(input)`.

- [x] **Step 1: Re-read worker patterns**

Run:

```bash
sed -n '1,220p' apps/notification-worker/src/auth-code-delivery.queue.ts
sed -n '1,220p' apps/notification-worker/src/outbox-relay.ts
sed -n '1,260p' apps/notification-worker/src/auth-code-delivery.processor.ts
sed -n '1,220p' apps/notification-worker/src/runtime-config.ts
git diff -- apps/notification-worker/src packages/db/src/schema/outbox/outbox-events.schema.ts
```

Expected: queue payloads use outbox ids and processors reload work items from DB.

- [x] **Step 2: Write failing queue/relay/processor tests**

Tests cover:

- queue job id is deterministic: `messaging-delivery-${outboxEventId}`;
- relay claims only `messaging.message.delivery_requested`;
- relay marks outbox published after queue add;
- relay backs off on queue failure;
- processor skips missing or non-queued message;
- processor calls provider with reloaded message/connection, not outbox text payload;
- sent result records attempt and marks message `sent`;
- retryable failure records attempt and throws for BullMQ retry;
- final failure marks message `failed`;
- ambiguous timeout marks message `unknown` after bounded final attempt.

Run:

```bash
pnpm test apps/notification-worker/src/messaging-delivery.queue.test.ts apps/notification-worker/src/messaging-delivery.outbox-relay.test.ts apps/notification-worker/src/messaging-delivery.processor.test.ts
```

Expected: fails because files do not exist.

- [x] **Step 3: Implement queue, relay and processor**

Follow auth-code delivery style:

- `createMessagingDeliveryQueue(redisUrl)`
- `createMessagingDeliveryWorker(redisUrl, processor)`
- `toMessagingDeliveryJobOptions({ outboxEventId, attempts, backoffMs })`
- `relayPendingMessagingOutboxEvents(input)`
- `processMessagingDeliveryJob(input)`

Add a DB processing-store adapter if the Task 5 adapter does not expose worker-specific methods cleanly. Keep it under `packages/db/src/adapters/messaging`.

- [x] **Step 4: Implement Telegram Business provider seam**

`telegram-business-provider.ts` should build Bot API requests from:

- bot token from runtime config;
- `business_connection_id` from DB state;
- target chat id from external identity;
- message text from DB state.

Tests must use a fake `fetch` function and assert:

- URL uses configured Bot API base URL;
- request body includes `business_connection_id`, `chat_id`, `text`;
- provider response message id is captured;
- non-2xx or Telegram `ok: false` maps to safe provider error codes.

Do not add a production fallback provider that pretends success when credentials are absent. Missing credentials must fail configuration/readiness for delivery execution.

- [x] **Step 5: Verify worker**

Run:

```bash
pnpm test apps/notification-worker/src/messaging-delivery.queue.test.ts apps/notification-worker/src/messaging-delivery.outbox-relay.test.ts apps/notification-worker/src/messaging-delivery.processor.test.ts apps/notification-worker/src/telegram-business-provider.test.ts apps/notification-worker/src/runtime-config.test.ts
pnpm --filter @elevenhouse/notification-worker typecheck
```

Expected: worker tests and typecheck pass.

## Task 9: Add SSE Realtime Endpoint And Event Log Reads

**Files:**

- Create: `apps/astrologer-api/src/modules/messaging/messaging-events.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/realtime-event-stream.ts`
- Create: `apps/astrologer-api/src/modules/messaging/realtime-event-stream.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.module.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts`
- Modify: `packages/contracts/src/messaging.ts`
- Modify: `packages/contracts/src/messaging.test.ts`

**Interfaces:**

- Produces `GET /messaging/events` SSE endpoint.
- Event stream accepts optional `Last-Event-ID` header.
- Service lists owner-scoped events after cursor and emits heartbeat comments.

- [x] **Step 1: Re-read Nest SSE docs usage and existing HTTP patterns**

Run:

```bash
rg -n "@Sse|Observable|EventSource|Last-Event-ID" apps packages
sed -n '1,220p' apps/astrologer-api/src/modules/identity/session/identity-current-session.service.ts
git diff -- apps/astrologer-api/src/modules/messaging packages/contracts/src/messaging.ts packages/db/src/adapters/messaging
```

Expected: no existing SSE implementation, so this task owns the first app-local pattern.

- [x] **Step 2: Write failing stream tests**

Tests cover:

- maps stored realtime events to SSE `MessageEvent` objects;
- rejects invalid `Last-Event-ID`;
- includes event id and event type;
- emits no cross-owner events;
- heartbeat event/comment is produced on idle interval using fake timers.

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/realtime-event-stream.test.ts
```

Expected: fails because stream helper does not exist.

- [x] **Step 3: Implement SSE endpoint**

Use NestJS `@Sse("events")` under `@Controller("messaging")` with `AstrologerSessionAuthGuard`. Keep the long-lived stream read-only. Do not require CSRF.

Stream behavior:

- on connect, load missed events after `Last-Event-ID` if present;
- while connected, poll the event log with a small interval until a later pub/sub optimization is approved;
- emit heartbeat comments or lightweight heartbeat messages to keep proxies alive;
- stop polling when the request closes.

The event log remains the replay source. SSE is not the source of truth.

- [x] **Step 4: Verify API realtime**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/realtime-event-stream.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: realtime tests and typecheck pass.

## Task 10: Add Frontend Messaging API And Realtime Client

**Files:**

- Create: `apps/astrologer-web/src/features/messaging/api/messagingApi.ts`
- Create: `apps/astrologer-web/src/features/messaging/api/messagingApi.test.ts`
- Create: `apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.ts`
- Create: `apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.test.ts`

**Interfaces:**

- Produces typed browser client functions:
  - `listMessagingChannelConnections()`
  - `listMessagingThreads()`
  - `getMessagingThread(threadId)`
  - `sendMessagingMessage(threadId, request, idempotencyKey)`
  - `linkMessagingThreadClient(threadId, request, idempotencyKey)`
  - `createMessagingThreadClient(threadId, request, idempotencyKey)`
  - `markMessagingThreadRead(threadId)`
  - `createMessagingRealtimeClient(input)`
- Consumed by future `/inbox` and `/clients` UI.

- [x] **Step 1: Re-read frontend API patterns**

Run:

```bash
sed -n '1,220p' apps/astrologer-web/src/features/clients/api/clientsApi.ts
sed -n '1,220p' apps/astrologer-web/src/features/calendar/api/calendarSchedulingApi.ts
rg -n "Idempotency-Key|csrf|EventSource" apps/astrologer-web/src/features apps/astrologer-web/src/shared
git diff -- apps/astrologer-web/src/features
```

Expected: existing HTTP client handles credentials and CSRF patterns; current chart component changes are unowned and must remain untouched.

- [x] **Step 2: Write failing frontend API tests**

Tests cover:

- list calls parse responses with messaging contracts;
- send passes `Idempotency-Key`;
- validation rejects unsafe response shape with provider token field;
- realtime client creates `EventSource` for `/api/messaging/events`;
- realtime client dispatches parsed event to callback;
- realtime client closes the EventSource on cleanup.

Run:

```bash
pnpm test apps/astrologer-web/src/features/messaging/api/messagingApi.test.ts apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.test.ts
```

Expected: fails because messaging frontend files do not exist.

- [x] **Step 3: Implement frontend modules**

Use existing shared HTTP client. Do not add routes or visible UI. The realtime client must be framework-light:

```ts
export type MessagingRealtimeClient = {
  readonly close: () => void;
};
```

`createMessagingRealtimeClient` accepts:

```ts
{
  readonly baseUrl: string;
  readonly onEvent: (event: MessagingRealtimeEvent) => void;
  readonly onError?: (error: unknown) => void;
  readonly eventSourceFactory?: (url: string) => EventSource;
}
```

Use injected `eventSourceFactory` in tests.

- [x] **Step 4: Verify frontend client**

Run:

```bash
pnpm test apps/astrologer-web/src/features/messaging/api/messagingApi.test.ts apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: frontend messaging API/realtime tests and astrologer-web typecheck pass. If unowned chart changes break typecheck, report them separately with exact errors and do not edit those files unless the user expands scope.

## Task 11: Broad Verification And Evidence Report

**Files:**

- Update this plan's `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections if implementation reveals material changes.

**Interfaces:**

- Consumes all previous tasks.
- Produces final evidence for the backend/realtime foundation.

- [x] **Step 1: Refresh shared-main state**

Run:

```bash
git status --short --branch
git diff --cached --name-status
git diff --stat
```

Expected: only task-owned paths are changed besides pre-existing unowned changes.

- [x] **Step 2: Run targeted package checks**

Run:

```bash
pnpm test packages/contracts/src/messaging.test.ts
pnpm test packages/domain/src/messaging/messaging-use-cases.test.ts
pnpm test packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts
pnpm test apps/astrologer-api/src/modules/messaging/messaging.service.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts
pnpm test apps/notification-worker/src/messaging-delivery.queue.test.ts apps/notification-worker/src/messaging-delivery.outbox-relay.test.ts apps/notification-worker/src/messaging-delivery.processor.test.ts apps/notification-worker/src/telegram-business-provider.test.ts
pnpm test apps/astrologer-web/src/features/messaging/api/messagingApi.test.ts apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.test.ts
```

Expected: all targeted tests pass.

- [x] **Step 3: Run affected typechecks**

Run:

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/notification-worker typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: all affected typechecks pass or failures are isolated to documented unowned paths.

- [x] **Step 4: Run docs and diff checks**

Run:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Expected: docs checks and diff check pass.

- [x] **Step 5: Run broad repository gate when unowned changes do not block it**

Run:

```bash
pnpm verify
```

Expected: full verification passes. If it fails due to pre-existing unowned chart changes, report the exact failing files and commands; do not modify them in this messaging task.

## Progress

- [x] 2026-07-21: architecture spec created for Clients, Messaging, Telegram modes, SSE, reliability and future Instagram.
- [x] 2026-07-21: user approved SSE-first realtime and two first-class Telegram connection modes.
- [x] 2026-07-21: implementation plan created for docs alignment, Messaging foundation, Telegram Business seam, worker delivery and SSE.
- [x] Task 1: ADR and canonical docs alignment.
- [x] Task 2: shared messaging contracts.
- [x] Task 3: domain Messaging use cases and ports.
- [x] Task 4: Drizzle schema and outbox payload.
- [x] Task 5: DB adapters.
- [x] Task 6: authenticated Messaging API.
- [x] Task 7: Telegram Business webhook foundation.
- [x] Task 8: delivery outbox and notification-worker processor.
- [x] Task 9: SSE realtime endpoint.
- [x] Task 10: frontend API and realtime client.
- [x] Task 11: broad verification and evidence report.

## Surprises & Discoveries

- 2026-07-21: Task 4 review exposed that provider-scoped primary identities
  need DB-level provider consistency, not adapter-only validation. The schema now
  enforces channel connection -> external identity -> thread identity provider
  agreement through composite unique targets and composite foreign keys.
- 2026-07-22: Task 5 PostgreSQL integration is blocked until the local database
  applies the rebuilt messaging baseline. The DB adapter has runnable
  integration coverage, but current `localhost:5432` lacks the messaging tables;
  no reset or migration was run without explicit destructive/local DB authority.
- 2026-07-22: Task 6 review found create/link-client durability gaps; fixed by
  moving manual client creation and thread/identity link state into idempotent
  store transactions. API, domain and DB unit/e2e checks pass; real PostgreSQL
  integration remains blocked by the same missing local messaging tables.
- 2026-07-22: Task 7 review found Telegram durability edges: Telegram
  `message_id` must be treated as chat-scoped, first-message thread creation
  needs a DB-level external-identity uniqueness guard, and Telegram Business
  connections must not be updated when the provider business connection id maps
  ambiguously. The webhook foundation now has strict integer parsing, global
  provider/external-account uniqueness for channel connections, external
  identity scoped inbound dedupe, duplicate-recovery SQL assertion coverage,
  and mutation evidence that removing `external_identity_id` from the fallback
  predicate fails the adapter regression test.
- 2026-07-22: Task 8 review found delivery finalization and provider-secret
  safety gaps. The worker now updates message status only while the outbound
  message is still `queued`, skips realtime emission on stale-state races,
  redacts Telegram Bot API token/base URL from provider error messages, and
  records final `unknown` attempts as non-retryable. Messaging delivery remains
  disabled by default and fails config parsing if enabled without Telegram bot
  credentials.
- 2026-07-22: Task 9 review found `Last-Event-ID` needed PostgreSQL int8 range
  validation. The SSE helper now rejects overlarge cursors before DB access,
  tests assert unsubscribe cleanup, and read-store tests assert owner cursor
  filtering, ascending order and limit propagation. Focused messaging tests,
  domain/db typechecks/builds and owned-path diff-check pass; full
  `@elevenhouse/astrologer-api` typecheck is blocked by unrelated unowned
  `human-design` compile errors in the shared checkout.
- 2026-07-22: Task 10 review found no Critical/Important/Minor issues. The
  frontend messaging API uses existing `application.http` patterns with
  contract parsing, CSRF/idempotency headers for durable mutations, and a
  framework-light injected EventSource realtime client for `/messaging/events`.
- 2026-07-22: Task 11 targeted verification passed for all messaging-owned
  files: 98 focused tests, affected package typechecks/builds, docs checks,
  owned-file lint and diff-check. Full `pnpm verify` is blocked in the lint
  phase by unrelated shared-checkout files:
  `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`,
  `packages/chart-engine-client/src/human-design-resolved-input.ts`, and
  `packages/contracts/src/human-design.ts`.

- None during plan creation.

## Decision Log

- 2026-07-21: Telegram Business / Secretary bot and Telegram MTProto Account are both first-class product modes.
- 2026-07-21: first realtime transport is SSE behind `RealtimeGateway`; WebSocket is reserved for later approved bidirectional realtime features.
- 2026-07-21: outbound message sending remains HTTP with CSRF and `Idempotency-Key`; sockets are not used for durable writes.
- 2026-07-21: first implementation program excludes full `/clients` and `/inbox` UI to avoid building visual surfaces before reliable provider-backed state.

## Outcomes & Retrospective

- Messaging foundation now includes provider-neutral contracts, domain use
  cases, Drizzle schema/adapters, authenticated astrologer API, Telegram
  Business webhook ingestion, delivery outbox/notification-worker processor,
  SSE event-log replay, and frontend API/realtime clients.
- Telegram Business / Secretary bot is implemented as the first provider-backed
  path. MTProto remains a first-class planned mode in schema/contracts, but no
  MTProto login/session worker was implemented in this slice.
- Runtime Telegram delivery is disabled by default in notification-worker and
  fails configuration if enabled without bot credentials. No fake success path
  exists.
- Local PostgreSQL integration for messaging adapters remains blocked until the
  local DB applies the rebuilt messaging baseline; no destructive reset/migrate
  was run without explicit authority.

## Validation And Acceptance

The program is accepted only when:

- contracts/domain/db/API/worker/frontend targeted tests pass;
- affected package typechecks pass;
- docs checks pass after ADR/doc edits;
- `pnpm verify` passes or every failure is proven unrelated to this task;
- local DB integration tests pass when an existing local DB is available, or are explicitly reported blocked by absent infrastructure;
- no queue payload or log path carries message text or provider credentials;
- no production path pretends Telegram delivery success without provider credentials.

Runtime provider acceptance for real Telegram Business credentials is a later provider-spike gate and cannot be claimed from unit tests alone.

## Idempotence And Recovery

- Re-running inbound webhook fixture with the same provider update/message ids returns the existing message.
- Re-running outbound send with the same `Idempotency-Key` and same request hash returns the existing message state.
- Reusing an `Idempotency-Key` with different request content returns a conflict.
- Relay jobs use deterministic job ids and may be retried safely.
- Worker delivery retries record attempts and never create a second logical outbound message.
- SSE reconnect uses `Last-Event-ID` and durable event-log replay.
- If migration generation changes unrelated baseline content, stop and inspect before continuing.

## Artifacts And Notes

- Architecture spec: `docs/superpowers/specs/2026-07-21-clients-messaging-telegram-architecture-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-21-messaging-foundation-realtime-telegram-business.md`
