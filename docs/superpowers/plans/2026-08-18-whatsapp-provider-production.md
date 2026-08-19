# WhatsApp Provider Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Shared-main policy forbids creating a
> worktree or branch unless the user explicitly changes that instruction.

**Goal:** Add a production-ready WhatsApp Cloud provider for existing
astrologer-owned WhatsApp Business app accounts through Meta Embedded Signup
Coexistence.

**Architecture:** WhatsApp becomes a first-class provider in the existing
Messaging bounded context. `astrologer-api` owns authenticated connection
commands and provider webhook ingestion; PostgreSQL stores connection, message,
webhook and sync state; notification-worker performs outbound provider sends
through a WhatsApp Cloud adapter. Meta Embedded Signup evidence is verified and
resolved server-side before any channel is marked active.

**Tech Stack:** TypeScript, NestJS, React/Vite, Drizzle/PostgreSQL, BullMQ,
Zod-compatible `@elevenhouse/validation`, existing ElevenHouse auth/CSRF,
existing AES-GCM secret cipher, Meta Graph API, Vitest/integration tests.

**Spec:** `docs/superpowers/specs/2026-08-18-whatsapp-provider-production-design.md`

## Global Constraints

- This is a production provider contour, not a demo or minimal module.
- Work in the existing checkout on `main`; do not branch, stash, rebase,
  checkout, switch or create a worktree.
- Preserve all unowned dirty work. Current unrelated unowned paths include
  `AGENTS.md`, `CLAUDE.md`,
  `apps/astrologer-web/src/features/availability/model/availabilityEditorForm.ts`,
  `apps/astrologer-web/src/features/availability/model/availabilityEditorForm.test.ts`,
  `apps/astrologer-web/src/pages/calendar/components/AvailabilityEditorPanel.tsx`,
  `docs/superpowers/plans/2026-08-18-astro-diary-paid-core.md` and
  `docs/superpowers/specs/2026-08-18-astro-diary-design.md`.
- Before editing existing code symbols, run GitNexus `impact` upstream for the
  exact function/class/method and report direct callers, affected processes and
  risk.
- Before each edit group, re-read target files and `git diff -- <path>`.
- Do not add fake provider success, silent fallback, browser-only state,
  unobservable queued failures or raw provider payload logging.
- All state-changing authenticated routes require existing auth, CSRF and
  idempotency rules where applicable.
- Webhook POST must verify raw-body HMAC before parsing business data.
- Browser-provided Meta asset ids are evidence, not authority; backend Graph
  resolution determines final WABA/phone binding.
- Access tokens are opaque and encrypted at rest.
- Queue payloads contain identifiers only. Workers reload authoritative DB
  state.
- Marketing templates, bulk sends, campaigns, WhatsApp Flows, commerce and
  group chats are out of first release scope and must not appear as enabled
  no-ops.
- Final production acceptance requires a real Meta canary; local tests cannot
  prove external app review or provider account state.

---

## Purpose / Big Picture

An astrologer opens channel settings, chooses WhatsApp, completes Meta Embedded
Signup for an existing WhatsApp Business app number, and sees the channel become
connected with visible sync state. Incoming WhatsApp messages, API delivery
statuses, messages sent from the WhatsApp Business app, and history sync events
are processed durably and appear in Inbox according to source-of-truth database
state. Replies from ElevenHouse are delivered by notification-worker and fail
with visible, typed provider errors when Meta rejects them.

## Context and Orientation

- Spec: `docs/superpowers/specs/2026-08-18-whatsapp-provider-production-design.md`
- Existing webhook controller:
  `apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts`
- Existing authenticated messaging controller:
  `apps/astrologer-api/src/modules/messaging/messaging.controller.ts`
- Existing Messaging service:
  `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Existing Instagram auth pattern:
  `apps/astrologer-api/src/modules/messaging/instagram-graph-auth-provider.ts`
- Existing Instagram delivery pattern:
  `apps/notification-worker/src/instagram-graph-delivery-provider.ts`
- Existing delivery processor:
  `apps/notification-worker/src/messaging-delivery.processor.ts`
- Messaging domain/store contracts:
  `packages/domain/src/messaging/*`
- Messaging schema/adapters:
  `packages/db/src/schema/messaging/*` and
  `packages/db/src/adapters/messaging/*`
- Inbox frontend:
  `apps/astrologer-web/src/pages/inbox/*` and
  `apps/astrologer-web/src/features/messaging/*`
- Production proxy:
  `deployment/caddy/Caddyfile`

## Interfaces and Dependencies

Add these provider constants everywhere provider/mode unions are defined:

```ts
export type MessagingProvider = "telegram" | "instagram" | "whatsapp";
export type MessagingChannelMode =
  | "telegram_business_bot"
  | "telegram_mtproto_account"
  | "instagram_graph"
  | "whatsapp_cloud";
```

New runtime config objects:

```ts
export type WhatsAppCloudRuntimeConfig = {
  readonly appId: string;
  readonly appSecret: string;
  readonly configurationId: string;
  readonly graphApiBaseUrl: string;
  readonly webhookVerifyToken: string;
  readonly tokenEncryptionKey: string;
  readonly callbackStateTtlSeconds: number;
  readonly historySyncEnabled: boolean;
};

export type WhatsAppCloudDeliveryOptions = {
  readonly graphApiBaseUrl: string;
  readonly tokenCipher: Aes256GcmSecretCipher;
};
```

New auth provider port:

```ts
export type WhatsAppCloudAuthProvider = {
  readonly exchangeCode: (input: { readonly code: string }) => Promise<{
    readonly accessToken: string;
    readonly grantedScopes: readonly string[];
    readonly expiresAt: Date | null;
  }>;
  readonly resolvePhoneNumber: (input: {
    readonly accessToken: string;
    readonly wabaId: string;
    readonly phoneNumberId?: string;
  }) => Promise<WhatsAppCloudResolvedPhoneNumber>;
  readonly subscribeWabaToWebhooks: (input: {
    readonly accessToken: string;
    readonly wabaId: string;
  }) => Promise<void>;
  readonly requestSmbAppDataSync: (input: {
    readonly accessToken: string;
    readonly phoneNumberId: string;
    readonly syncType: "smb_app_state_sync" | "history";
  }) => Promise<{ readonly requestId: string | null }>;
};
```

New delivery provider input:

```ts
export type WhatsAppCloudDeliveryProviderInput = {
  readonly messageId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly phoneNumberId: string;
  readonly recipientWaId: string;
  readonly text: string;
  readonly encryptedAccessToken: EncryptedMessagingSecret;
};
```

## Progress

- [x] 2026-08-18: repo and Meta research completed.
- [x] 2026-08-18: Coexistence-first production scope selected.
- [x] 2026-08-18: design spec and this implementation plan created.
- [x] 2026-08-18: review applied to file map, Coexistence completion event,
      dedupe keys, sync states, token lifecycle and Graph error classification.
- [x] 2026-08-18: Task 1 implemented: runtime config, WhatsApp Cloud parser and
      signed webhook boundary. Evidence: targeted Vitest tests and astrologer-api
      typecheck pass.
- [x] 2026-08-19: Task 2 core implemented: provider/mode contracts, schema,
      migration, store/use-cases, webhook event dedupe and WhatsApp DB
      integration tests.
- [x] 2026-08-19: Task 3 implemented: authenticated start/complete endpoints,
      signed state, server-side Graph exchange/phone resolution/subscription,
      token encryption, service/auth-provider tests and Nest route e2e.
- [x] 2026-08-19: Task 4 inline live events implemented for messages,
      statuses, account_update and smb_message_echoes. Async history/contact
      sync event persistence, relay, worker status transitions and retry/final
      failure handling implemented; real history-message materialization remains
      canary-driven because Meta payload shape must be verified against a live
      Coexistence account.
- [x] 2026-08-19: Task 5 implemented: WhatsApp Cloud outbound delivery provider,
      worker routing, DB work item loading and delivery tests.
- [x] 2026-08-19: Task 6 frontend connection slice implemented: API/model,
      Embedded Signup launcher, Inbox channel dialog and desktop/mobile browser
      smoke. Full signed-in network E2E remains open.
- [x] 2026-08-19: Task 7 env/docs/preflight/targeted verification updated.
      Runtime signed replay, signed-in browser E2E and real Meta canary remain
      open release gates.
- [ ] Implementation tasks below.

## Surprises & Discoveries

- Coexistence session event examples can include only `waba_id`; backend must
  resolve the phone number after token exchange.
- Meta retries webhook delivery for up to seven days, but historical webhook
  data cannot be fetched later. Durable capture before ack is required for
  history/contact sync payloads.
- `smb_message_echoes` is not optional for the product goal because astrologers
  can keep sending messages from WhatsApp Business app.
- Raw webhook body is needed for HMAC verification, but storing raw payload is
  not required for normal live message/status/account/echo events. Durable
  capture before ack means normalized state or short-retention encrypted/ref
  payload for sync events that cannot be normalized synchronously.
- 2026-08-19 research refresh: Meta's official WhatsApp Coexistence docs say
  business-app users must have contacts/message history synchronized within the
  post-onboarding window, and the official webhook overview identifies
  `smb_app_state_sync` as the contact-sync webhook for solution-provider
  onboarded WhatsApp Business app users:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
  and
  https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview.
  Direct page fetch returned provider rate limiting in this session, so final
  history-message materialization remains gated by live canary payload evidence.

## Decision Log

- 2026-08-18, user: the module must be production-ready, not positioned as MVP.
- 2026-08-18, architecture: first release is Coexistence-first.
- 2026-08-18, architecture: external production webhook URL is
  `https://app.elevenhouse.ai/api/messaging/webhooks/whatsapp/cloud`.
- 2026-08-18, architecture: Graph API base URL is configuration, not hardcoded.
- 2026-08-18, architecture: Coexistence complete accepts only
  `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` as successful onboarding.
- 2026-08-18, architecture: no token refresh flow is invented; token expiry is
  stored only when Meta returns it, and revoked/expired/permission errors move
  the connection to `reauth_required` or `revoked`.
- 2026-08-18, architecture: operational fields are normalized; raw webhook
  payload is not permanent source of truth.

---

### Task 1: Runtime Config and Webhook Boundary

**Files:**

- Modify: `apps/astrologer-api/src/config/runtime-config.ts`
- Create: `apps/astrologer-api/src/config/runtime-config.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts`
- Create: `apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook.ts`
- Create: `apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook.test.ts`

**Interfaces:**

- Produces: `astrologerApi.whatsappCloud` runtime config.
- Produces: `parseWhatsAppCloudWebhookChanges(body)` returning normalized
  changes with `field`, `wabaId`, `phoneNumberId`, `displayPhoneNumber`.
- Consumes: existing raw-body Nest bootstrap and Instagram HMAC pattern.

- [x] **Step 1: Run GitNexus impact for edited symbols**

Run for each existing symbol before editing:

```bash
node .gitnexus/run.cjs impact --target createAstrologerApiRuntimeConfig --direction upstream
node .gitnexus/run.cjs impact --target MessagingWebhooksController --direction upstream
```

Expected: report direct callers and risk. If risk is HIGH or CRITICAL, pause
and report before editing.

- [x] **Step 2: Write failing config and webhook parser tests**

Add tests proving:

```ts
expect(config.astrologerApi.whatsappCloud).toEqual(null);
expect(() =>
  createAstrologerApiRuntimeConfig({
    ASTROLOGER_API_WHATSAPP_CLOUD_ENABLED: "true",
    ASTROLOGER_API_WHATSAPP_CLOUD_APP_ID: "app",
    ASTROLOGER_API_WHATSAPP_CLOUD_APP_SECRET: "secret",
    ASTROLOGER_API_WHATSAPP_CLOUD_CONFIGURATION_ID: "config",
    ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "verify",
    ASTROLOGER_API_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY: validKey
  })
).not.toThrow();
```

Add parser tests for:

```ts
{
  object: "whatsapp_business_account",
  entry: [{ id: "waba-1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "phone-1", display_phone_number: "15550783881" }, messages: [{ from: "16505551234", id: "wamid.1", timestamp: "1750263773", type: "text", text: { body: "hello" } }] } }] }]
}
```

and for invalid top-level `object`.

- [x] **Step 3: Run tests red**

Run:

```bash
pnpm test apps/astrologer-api/src/config/runtime-config.test.ts apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook.test.ts
```

Expected: FAIL because config/parser do not exist.

- [x] **Step 4: Implement config, parser and controller routes**

Implement:

- `ASTROLOGER_API_WHATSAPP_CLOUD_ENABLED`
- `ASTROLOGER_API_WHATSAPP_CLOUD_APP_ID`
- `ASTROLOGER_API_WHATSAPP_CLOUD_APP_SECRET`
- `ASTROLOGER_API_WHATSAPP_CLOUD_CONFIGURATION_ID`
- `ASTROLOGER_API_WHATSAPP_CLOUD_GRAPH_API_BASE_URL`
- `ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN`
- `ASTROLOGER_API_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY`
- `ASTROLOGER_API_WHATSAPP_CLOUD_CALLBACK_STATE_TTL_SECONDS`
- `ASTROLOGER_API_WHATSAPP_CLOUD_HISTORY_SYNC_ENABLED`

Add:

```ts
@Get("whatsapp/cloud")
@Header("content-type", "text/plain")
verifyWhatsAppCloudWebhook(...)

@Post("whatsapp/cloud")
@HttpCode(200)
handleWhatsAppCloudWebhook(...)
```

Verification logic mirrors Instagram:

- disabled/missing config rejects;
- GET requires `hub.mode=subscribe`, matching verify token and challenge;
- POST requires `sha256=` signature;
- HMAC uses raw body and app secret;
- invalid signature returns 401;
- invalid payload returns 400 only after signature verification.

- [x] **Step 5: Run tests green**

Run:

```bash
pnpm test apps/astrologer-api/src/config/runtime-config.test.ts apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: PASS.

### Task 2: Domain, Contracts, DB Schema and Store

**Files:**

- Modify: `packages/domain/src/messaging/messaging-types.ts`
- Modify: `packages/domain/src/messaging/messaging-store.ts`
- Modify: `packages/domain/src/messaging/messaging-use-cases.ts`
- Modify: `packages/db/src/schema/messaging/messaging-values.ts`
- Create: `packages/db/src/schema/messaging/whatsapp-cloud-accounts.schema.ts`
- Create: `packages/db/src/schema/messaging/provider-webhook-events.schema.ts`
- Modify: `packages/db/src/schema/messaging/index.ts`
- Modify: `packages/db/src/schema/messaging/relations.schema.ts`
- Add migration under `packages/db/drizzle/`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Add integration tests under `packages/db/src/adapters/messaging/`
- Modify: `packages/contracts/src/messaging.ts`
- Modify: affected contract tests.

**Interfaces:**

- Produces provider/mode `whatsapp`/`whatsapp_cloud`.
- Produces `startWhatsAppCloudConnection`,
  `completeWhatsAppCloudConnection`, `recordWhatsAppCloudMessage`,
  `recordWhatsAppCloudStatus`, `recordWhatsAppCloudEcho`,
  `recordWhatsAppCloudAccountUpdate`, `recordWhatsAppCloudWebhookEvent`.
- Consumes Task 1 parser output.

- [x] **Step 1: Run GitNexus impact for edited store/use-case symbols**

Run:

```bash
node .gitnexus/run.cjs impact --target startInstagramGraphConnection --direction upstream
node .gitnexus/run.cjs impact --target recordInstagramGraphMessage --direction upstream
node .gitnexus/run.cjs impact --target messagingChannelConnections --direction upstream
```

Expected: report blast radius before adapting sibling patterns.

- [x] **Step 2: Write failing domain and DB integration tests**

Tests must prove:

- provider/mode accepts WhatsApp and rejects provider/mode mismatch;
- one astrologer has one active WhatsApp phone-number connection per
  `phone_number_id`;
- `externalAccountId` stores `phone_number_id`;
- `externalOwnerUserId` stores `waba_id`;
- encrypted token row is required;
- sync status accepts only `not_requested`, `requested`, `syncing`,
  `completed`, `declined`, `failed`, `partial`;
- webhook event keys are unique and deterministic for inbound messages,
  statuses, echoes, history chunks, history messages, contact sync items and
  account updates;
- webhook event dedupe key prevents duplicate history chunks;
- account update `PARTNER_REMOVED` moves active connection to `revoked`;
- account update `ACCOUNT_RECONNECTED` does not mark active until Graph verify
  path calls complete connection verification.

- [x] **Step 3: Run tests red**

Run:

```bash
pnpm test packages/domain/src/messaging/messaging-use-cases.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.whatsapp-cloud.integration.ts
```

Expected: FAIL because WhatsApp schema/store functions do not exist.

- [x] **Step 4: Implement schema and migration**

Add `whatsapp` and `whatsapp_cloud` to values and SQL checks.

Create `messaging_whatsapp_cloud_accounts` with columns from the spec.

Create `messaging_provider_webhook_events` with provider, mode, event key,
field, owner/account ids, optional `payload_ref`, optional `payload_encrypted`,
`normalized_summary`, processing status and attempt metadata. Do not use raw
JSONB webhook payload as permanent operational storage.

Use forward-only migration. Do not rewrite committed SQL, journal or snapshots.

- [x] **Step 5: Implement domain/store behavior**

Implement use cases with validation:

- bounded ids length 1..200;
- text length 1..4000;
- `connectedVia` only `embedded_signup_coexistence`;
- history/contact sync statuses only `not_requested`, `requested`, `syncing`,
  `completed`, `declined`, `failed`, `partial`;
- token encryption object required.

Store operations must use one DB transaction for connection/message/realtime
state transitions and idempotent conflicts.

Implement event-key builders with these exact shapes:

```ts
const inboundMessageEventKey = `whatsapp:message:${phoneNumberId}:${messageId}`;
const statusEventKey = `whatsapp:status:${phoneNumberId}:${messageId}:${status}:${timestamp}`;
const echoEventKey = `whatsapp:echo:${phoneNumberId}:${messageId}:smb_message_echoes`;
const historyChunkEventKey = `whatsapp:history-chunk:${wabaId}:${phoneNumberId ?? "unknown"}:${phase}:${chunkOrder}`;
const historyMessageEventKey = `whatsapp:history-message:${phoneNumberId}:${threadOrWaId}:${messageId}:${directionOrSource}`;
const contactSyncEventKey = `whatsapp:contact-sync:${phoneNumberId}:${contactWaIdOrPhone}:${action}:${timestamp}`;
const accountUpdateEventKey = `whatsapp:account-update:${wabaId}:${phoneNumberId ?? "none"}:${event}:${timestampOrReasonHash}`;
```

- [x] **Step 6: Run domain and DB tests green**

Run:

```bash
pnpm test packages/domain/src/messaging/messaging-use-cases.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.whatsapp-cloud.integration.ts
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
```

Expected: PASS.

### Task 3: Embedded Signup Start and Complete

**Files:**

- Modify: `apps/astrologer-api/src/modules/messaging/messaging.controller.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Create: `apps/astrologer-api/src/modules/messaging/whatsapp-cloud-auth-provider.ts`
- Create: `apps/astrologer-api/src/modules/messaging/whatsapp-cloud-auth-provider.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.module.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.service.test.ts`
- Create: `apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts`
- Modify: `packages/contracts/src/messaging.ts`
- Modify: `apps/astrologer-web/src/features/messaging/api/messagingApi.ts`
- Modify: `apps/astrologer-web/src/features/messaging/model/messagingQueries.ts`

**Interfaces:**

- Produces `POST /messaging/channel-connections/whatsapp/cloud/start`.
- Produces `POST /messaging/channel-connections/whatsapp/cloud/complete`.
- Consumes Task 2 store and Task 1 runtime config.

- [x] **Step 1: Run GitNexus impact**

Run:

```bash
node .gitnexus/run.cjs impact --target MessagingController --direction upstream
node .gitnexus/run.cjs impact --target MessagingService --direction upstream
node .gitnexus/run.cjs impact --target HttpInstagramGraphAuthProvider --direction upstream
```

Expected: report direct callers/risk and proceed only if not HIGH/CRITICAL
without user review.

- [x] **Step 2: Write failing service and e2e tests**

Service/auth-provider tests are implemented. Dedicated Nest e2e covers
authenticated start/complete route wiring, CSRF-protected cookie-session
boundary and WhatsApp webhook challenge/raw-body HMAC acceptance.

Tests must prove:

- unauthenticated start returns auth error;
- authenticated start requires CSRF;
- start returns `appId`, `configurationId`, `graphApiVersion`, signed `state`;
- complete requires CSRF and valid state;
- expired state redirects/returns typed error;
- state for astrologer A cannot complete astrologer B connection;
- complete accepts successful Coexistence event
  `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`;
- complete rejects any other session event without activating the connection;
- complete can succeed when browser session event contains only `waba_id`;
- complete exchanges code, resolves phone by WABA, subscribes WABA, stores
  encrypted token, starts contact/history sync requests and marks connection
  active only after Graph verification.

- [x] **Step 3: Run tests red**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/messaging.service.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts apps/astrologer-api/src/modules/messaging/whatsapp-cloud-auth-provider.test.ts
```

Expected: FAIL because routes/provider are absent.

- [x] **Step 4: Implement auth provider**

Implement Graph calls:

- `GET <graphApiBaseUrl>/oauth/access_token?client_id=...&client_secret=...&code=...`;
- phone resolution by explicit `phoneNumberId` if present, otherwise query WABA
  phone numbers and select the Coexistence-compatible phone;
- `GET <phoneNumberId>?fields=is_on_biz_app,platform_type,display_phone_number,verified_name`;
- `POST <wabaId>/subscribed_apps`;
- `POST <phoneNumberId>/smb_app_data` for `smb_app_state_sync` and `history`
  when enabled.

All provider failures return typed service errors without leaking token/code.

- [x] **Step 5: Implement start/complete routes**

Add contract schemas:

```ts
StartWhatsAppCloudConnectionResponseSchema;
CompleteWhatsAppCloudConnectionBodySchema;
CompleteWhatsAppCloudConnectionResponseSchema;
```

Complete body includes:

```ts
{
  readonly state: string;
  readonly code: string;
  readonly session: {
    readonly event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
    readonly wabaId?: string;
    readonly phoneNumberId?: string;
    readonly businessId?: string;
  };
}
```

The backend rejects every `event` value except
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. Rejected events return a typed
unsuccessful onboarding result and must not store tokens or activate the
connection.

- [x] **Step 6: Run tests green**

Service/auth-provider/contract tests, dedicated Nest e2e and astrologer-api
typecheck pass.

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/messaging.service.test.ts apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts apps/astrologer-api/src/modules/messaging/whatsapp-cloud-auth-provider.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: PASS.

### Task 4: Durable Webhook Processing

**Files:**

- Modify: `apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook.ts`
- Create: `apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook-processing.test.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Modify: `packages/domain/src/messaging/messaging-use-cases.ts`
- Modify: `apps/notification-worker/src/messaging-webhook-event.processor.ts` if a
  generic webhook processor already exists; otherwise create
  `apps/notification-worker/src/messaging-provider-webhook.processor.ts`.
- Add worker queue wiring beside existing messaging queues.

**Interfaces:**

- Consumes webhook events from Task 1 and store methods from Task 2.
- Produces durable processing for `messages`, `statuses`, `account_update`,
  `smb_message_echoes`, `history`, `smb_app_state_sync`.

- [x] **Step 1: Run GitNexus impact**

Run:

```bash
node .gitnexus/run.cjs impact --target handleInstagramGraphWebhookUpdates --direction upstream
node .gitnexus/run.cjs impact --target recordInstagramGraphMessage --direction upstream
node .gitnexus/run.cjs impact --target processMessagingDeliveryJob --direction upstream
```

Expected: report direct callers/risk.

- [x] **Step 2: Write failing webhook processing tests**

Live messages, statuses, account_update, smb_message_echoes and async
history/contact-sync provider-webhook processing status tests exist. Full
history message materialization awaits live Meta payload evidence.

Tests must prove:

- invalid HMAC is rejected before payload parsing;
- duplicate inbound `message.id` creates one message using
  `whatsapp:message:<phone_number_id>:<message.id>`;
- duplicate status updates are idempotent by
  `message id + status + timestamp`, so `sent`, `delivered` and `read` are not
  collapsed into one event;
- `statuses[].status=delivered/read/failed` updates existing outbound by
  provider message id;
- `smb_message_echoes` creates astrologer outbound messages and dedupes by
  provider message id plus echo/source event key;
- `history` payload is persisted before ack and processed by worker;
- `history` chunks and contained messages use separate event-key schemes;
- large history chunks do not require synchronous Inbox insertion before `200`;
- live `messages`, `statuses`, `account_update` and simple
  `smb_message_echoes` do not store raw webhook payload after normalized state
  is committed;
- `smb_app_state_sync` does not create CRM clients;
- `account_update` dedupes by WABA/phone, event, timestamp or reason hash;
- unknown fields are signed, recorded as ignored and acknowledged.

- [x] **Step 3: Run tests red**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook-processing.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.whatsapp-cloud.integration.ts
```

Expected: FAIL for missing behavior.

- [x] **Step 4: Implement inline processing for small live events**

Inline process:

- live inbound text messages;
- outbound statuses;
- account updates;
- simple text `smb_message_echoes`.

Each inline path still uses DB transactions and dedupe. It returns `200` only
after durable state is written.

- [x] **Step 5: Implement durable async processing for sync payloads**

Persist and enqueue:

- `history`;
- `smb_app_state_sync`;
- oversized mixed webhook events.

Worker loads event by id, processes idempotently and updates processing status.
No realtime connection/message update is emitted until a verified live payload
can be safely materialized into visible message state.

For sync payloads, the current implementation persists normalized summaries and
dedupe keys before ack. It does not store unencrypted raw message bodies in
JSONB. Message-level history import remains blocked on live payload validation
and should add encrypted payload/private reference staging if Meta sends data
that cannot be safely normalized synchronously.

- [x] **Step 6: Run tests green**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging/whatsapp-cloud-webhook-processing.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.whatsapp-cloud.integration.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/notification-worker typecheck
```

Expected: PASS.

### Task 5: WhatsApp Cloud Outbound Delivery

**Files:**

- Modify: `apps/notification-worker/src/runtime-config.ts`
- Modify: `apps/notification-worker/src/main.ts`
- Modify: `apps/notification-worker/src/messaging-delivery.processor.ts`
- Create: `apps/notification-worker/src/whatsapp-cloud-delivery-provider.ts`
- Create: `apps/notification-worker/src/whatsapp-cloud-delivery-provider.test.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-delivery-processing-store.ts`
- Modify: related delivery processing integration tests.

**Interfaces:**

- Consumes queued outbound messages for `mode === "whatsapp_cloud"`.
- Produces provider result with `provider: "whatsapp"`.

- [x] **Step 1: Run GitNexus impact**

Run:

```bash
node .gitnexus/run.cjs impact --target processMessagingDeliveryJob --direction upstream
node .gitnexus/run.cjs impact --target sendWithProvider --direction upstream
node .gitnexus/run.cjs impact --target findByOutboxEventId --direction upstream
```

Expected: report direct callers/risk before editing.

- [x] **Step 2: Write failing delivery tests**

Tests must prove:

- worker loads WhatsApp token and phone number id by outbox id;
- provider POSTs to `<graphApiBaseUrl>/<phoneNumberId>/messages`;
- payload contains `messaging_product=whatsapp`, `recipient_type=individual`,
  `to=<recipientWaId>`, `type=text`, `text.body=<message text>`;
- access token is sent in Authorization header, not URL;
- success records returned `messages[0].id`;
- Graph error body `error.code=190` marks connection `reauth_required`;
- Graph permission/access errors such as `error.code=131005` mark
  `reauth_required` or `provider_permission_lost` according to details;
- Graph customer service window error `error.code=131047` is non-retryable final
  failed with visible `customer_service_window_closed`;
- Graph rate-limit/throughput errors such as `error.code=130429` or `80007`
  are retryable with backoff;
- 5xx/network failure is retryable;
- unknown 4xx uses redacted `error.code`, `error_subcode` and
  `error_data.details` in support metadata and is non-retryable unless
  classified otherwise;
- token decryption failure is final failed and redacted.

- [x] **Step 3: Run tests red**

Run:

```bash
pnpm test apps/notification-worker/src/whatsapp-cloud-delivery-provider.test.ts packages/db/src/adapters/messaging/drizzle-messaging-delivery-processing-store.integration.ts
```

Expected: FAIL because WhatsApp delivery does not exist.

- [x] **Step 4: Implement runtime config and provider**

Add worker config:

- `NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED`
- `NOTIFICATION_WORKER_WHATSAPP_CLOUD_GRAPH_API_BASE_URL`
- `NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY`

Implement `HttpWhatsAppCloudDeliveryProvider` with the classification rules
from the spec. Classification must inspect Graph response body
`error.code`, `error_subcode` and `error_data.details`; HTTP status is only a
fallback signal.

- [x] **Step 5: Extend delivery processing store and processor**

`findByOutboxEventId` returns WhatsApp work item fields:

- `phoneNumberId`;
- `encryptedAccessToken`;
- `providerChatId` as recipient WhatsApp user id.

`sendWithProvider` dispatches `whatsapp_cloud` to `providers.whatsappCloud`.

- [x] **Step 6: Run tests green**

Run:

```bash
pnpm test apps/notification-worker/src/whatsapp-cloud-delivery-provider.test.ts packages/db/src/adapters/messaging/drizzle-messaging-delivery-processing-store.integration.ts
pnpm --filter @elevenhouse/notification-worker typecheck
pnpm --filter @elevenhouse/db typecheck
```

Expected: PASS.

### Task 6: Astrologer Web Connection and Inbox UX

**Files:**

- Modify: `apps/astrologer-web/src/features/messaging/api/messagingApi.ts`
- Modify: `apps/astrologer-web/src/features/messaging/model/messagingQueries.ts`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.tsx`
- Modify or create focused channel connection components under
  `apps/astrologer-web/src/features/messaging/ui/`
- Modify relevant i18n files.
- Add tests under `apps/astrologer-web/src/features/messaging/` and
  `apps/astrologer-web/src/pages/inbox/`.

**Interfaces:**

- Consumes Task 3 start/complete contracts.
- Consumes existing Inbox thread/message APIs plus WhatsApp provider fields.
- Produces visible channel connection states and WhatsApp failed-reply state.

- [x] **Step 1: Use design parity skill before visible edits**

Read `elevenhouse-design-parity` and inspect current Inbox/channel connection
visual references before editing visible UI.

- [x] **Step 2: Run GitNexus impact**

Run for existing edited components/functions:

```bash
node .gitnexus/run.cjs impact --target InboxPage --direction upstream
```

Expected: report direct callers/risk.

- [x] **Step 3: Write failing frontend tests**

Tests must prove:

- WhatsApp connection button calls start endpoint;
- Embedded Signup complete posts code, state and session event;
- missing `phone_number_id` in event still submits complete body;
- connected channel displays WhatsApp provider and sync state;
- revoked/reauth states display reconnect action;
- failed outbound message with customer-window error displays final failed
  state, not queued.

- [x] **Step 4: Run tests red**

Run:

```bash
pnpm test apps/astrologer-web/src/features/messaging apps/astrologer-web/src/pages/inbox
```

Expected: FAIL for missing WhatsApp UI behavior.

- [x] **Step 5: Implement frontend API/model**

Add typed API methods:

```ts
startWhatsAppCloudConnection();
completeWhatsAppCloudConnection(input);
```

Load Facebook JS SDK only from the browser interaction path. Do not place
business state in `localStorage`.

- [ ] **Step 6: Implement UI states**

Partial: not-connected, connecting, connected, reauth/revoked/error display
through channel status are implemented. Dedicated history sync/warning and
failed-reply customer-window states remain open.

Implement:

- not connected;
- connecting;
- connected;
- syncing history;
- sync warning;
- reauth required;
- revoked/offboarded;
- provider error.

Add concise RU/EN copy. Do not add marketing/template controls.

- [x] **Step 7: Run frontend tests green**

Run:

```bash
pnpm test apps/astrologer-web/src/features/messaging apps/astrologer-web/src/pages/inbox
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS.

### Task 7: Docs, Env, Preflight and Verification

**Files:**

- Modify: `.env.example`
- Modify: `deployment/env/.env.production.example`
- Modify: `deployment/server/preflight-production-providers.sh`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/api/route-inventory.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/decisions/0010-messaging-channel-architecture.md` only if the
  accepted ADR needs an explicit WhatsApp amendment.
- Modify:
  `packages/domain/src/platform-billing/platform-capability-manifest-exclusions.ts`
  only if the capability manifest check rejects the new webhook route and the
  existing Telegram/Instagram webhook-exclusion pattern applies.
- Add operational notes under the relevant docs path chosen by
  `docs/README.md`.

**Interfaces:**

- Consumes all previous tasks.
- Produces deployable configuration contract and verification evidence.

- [x] **Step 1: Update env examples and preflight**

Add all config keys from the spec. Preflight must fail closed when WhatsApp is
enabled but required app id, app secret, configuration id, verify token,
Graph API base URL or token encryption key is missing.

- [x] **Step 2: Update API and architecture docs**

Document:

- public callback URL;
- authenticated start/complete endpoints;
- webhook CSRF exemption rationale;
- provider state ownership;
- worker delivery boundary;
- external Meta prerequisites.

If capability gating verification flags
`/messaging/webhooks/whatsapp/cloud`, add it to
`platform-capability-manifest-exclusions.ts` beside the existing messaging
provider webhook exclusions. Do not otherwise introduce billing/capability
changes in the WhatsApp provider work.

- [x] **Step 3: Generate route inventory if generator is canonical**

Run the route inventory generator documented in repo scripts if routes changed.
If the generator is unavailable, update inventory manually and state the gap in
final evidence.

- [x] **Step 4: Run targeted verification**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/messaging packages/domain/src/messaging packages/db/src/adapters/messaging apps/notification-worker/src apps/astrologer-web/src/features/messaging apps/astrologer-web/src/pages/inbox
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/notification-worker typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
git diff --check
```

Expected: PASS.

Evidence captured with focused WhatsApp tests, DB integration tests, package
typechecks, build-chain, `git diff --check` and production-provider preflight.

- [ ] **Step 5: Run repository verification**

Run:

```bash
pnpm verify
```

Expected: PASS. If unrelated shared work blocks this command, capture the exact
failure and run the narrowest complete replacement gate for all touched
surfaces.

- [ ] **Step 6: Runtime local replay**

Start only local services under existing ElevenHouse local authority. Use a fake
Graph server and signed webhook fixtures to prove:

- GET verify succeeds only with correct verify token;
- invalid HMAC rejected;
- inbound message appears in DB/Inbox read model;
- status updates outbound message;
- echo creates outbound astrologer message;
- account update revokes connection;
- history event is persisted, acknowledged and processed async.

- [ ] **Step 7: Browser verification**

With local services running, use the authenticated astrologer browser session:

- open Inbox/channel settings;
- start WhatsApp connection flow with fake/test SDK harness where local Meta JS
  cannot run;
- complete channel through backend test fixture;
- inspect network requests;
- verify connected/revoked/sync/failed-reply states render without console
  errors.

- [ ] **Step 8: Production provider canary**

After explicit external authority and Meta app readiness:

- configure Meta callback URL
  `https://app.elevenhouse.ai/api/messaging/webhooks/whatsapp/cloud`;
- connect a real test WhatsApp Business app number through Embedded Signup
  Coexistence;
- send inbound message from a normal WhatsApp account;
- reply from ElevenHouse within customer service window;
- send a message from WhatsApp Business app and verify `smb_message_echoes`;
- disconnect/reconnect and verify `account_update`.

This step is blocked until Meta app configuration, permissions and a real test
business account are available.

## Validation and Acceptance

Implementation is accepted only when:

- all automated targeted checks pass;
- DB migration applies from committed lineage on local database;
- local signed webhook replay passes;
- worker delivery succeeds against fake Graph and classifies failures correctly;
- browser Inbox/channel settings prove visible states;
- production Meta canary passes or is explicitly blocked by external provider
  state with all local evidence green.

## Idempotence and Recovery

- Re-running start refreshes one connecting WhatsApp connection for the same
  astrologer instead of creating duplicates.
- Complete is idempotent for the same connection and resolved phone number.
- Duplicate webhooks are deduped by provider ids and event keys.
- History chunks can be retried by event id.
- Worker delivery retries transient failures and finalizes non-retryable
  provider policy failures.
- Account disconnect/offboard events are safe to replay.
- No destructive local or production action is required by the plan.

## Artifacts and Notes

Expected implementation artifacts:

- Signed webhook fixture files under the relevant messaging test fixture folder.
- Local fake Graph server tests for auth and delivery providers.
- Browser screenshots only if UI implementation changes visible layout.
- Final implementation report must separate implemented, verified, blocked
  provider canary and unowned dirty work.
