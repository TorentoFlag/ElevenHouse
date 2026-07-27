# Messaging Voice Media Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse repo policy overrides generic worktree setup: execute in the existing shared checkout on `main`; do not create/switch branches or worktrees.

**Goal:** Telegram Business inbound voice messages become durable private media attachments that the astrologer can play from the Inbox.

**Architecture:** Webhook parsing persists voice metadata and a pending media-ingestion record in PostgreSQL, then acknowledges Telegram. `notification-worker` claims ingestion rows, downloads the Telegram file through a narrow provider adapter, validates/stores the audio as a private `messaging_attachment` media asset, attaches it to the message, and emits a lightweight realtime invalidation. The browser reads message media state and requests an owner-scoped short-lived playback URL only when playback is needed.

**Tech Stack:** TypeScript, NestJS `astrologer-api`, React/Vite `astrologer-web`, Drizzle/PostgreSQL, BullMQ/Redis `notification-worker`, S3-compatible private object storage, Zod contracts/validation, Vitest/Jest-style tests through `pnpm test`.

## Global Constraints

- Retention is indefinite for this slice; no automatic cleanup of ready messaging attachments.
- First implementation is inbound Telegram Business voice playback only.
- Do not add grammY, Telegraf or another full Telegram framework for file download.
- Do not expose Telegram `getFile` URLs, `file_id`, `file_path`, raw payloads, message bodies or bot token derived URLs to the browser/logs/queue payloads.
- Webhook acknowledgement must not wait for media download.
- Queue payloads carry identifiers only.
- Media storage is private; playback uses an authenticated owner-scoped API source endpoint.
- TDD is required: every behavior change starts with a failing test and a verified red result.
- Visible Inbox changes require design-parity/browser evidence before completion claim.

---

## Progress

- [x] 2026-07-27: Architecture spec written and committed as `e0cc749`.
- [x] 2026-07-27: Spec self-review found no product blockers.
- [x] Task 1: contracts and validation media surface.
- [x] Task 2: DB schema and Messaging store ingestion persistence.
- [ ] Task 3: webhook parser/service voice metadata handoff.
- [ ] Task 4: worker provider, queue and ingestion processor.
- [ ] Task 5: API media source endpoint.
- [ ] Task 6: Inbox voice playback UI.
- [ ] Task 7: runtime E2E, docs sync and final verification.

## Context And Orientation

Current implemented behavior:

- `parseTelegramBusinessWebhookUpdate` recognizes `voice` and creates fallback text.
- `recordTelegramBusinessMessage` stores `contentType = "voice"` and `mediaAssetId = null`.
- Thread reads return `mediaAssetId` but no media status object.
- Media architecture supports private assets and presigned private downloads for PDFs, but no `messaging_attachment` purpose or server-side private write port.
- `notification-worker` already handles auth delivery and outbound messaging delivery; it has Telegram Business token config for outbound messages.

Owned paths:

- `docs/superpowers/plans/2026-07-27-messaging-voice-media-ingestion.md`
- `packages/validation/src/media/*`
- `packages/contracts/src/messaging.ts` and tests
- `packages/domain/src/messaging/*`, `packages/domain/src/media/*` and tests
- `packages/db/src/schema/messaging/*`, `packages/db/src/schema/media/*`, DB adapters/tests/integration
- `apps/astrologer-api/src/modules/messaging/*`, media storage adapter/tests, API e2e tests
- `apps/notification-worker/src/*messaging-media*`, runtime config/tests, Telegram provider tests
- `apps/astrologer-web/src/features/messaging/*`, `apps/astrologer-web/src/pages/inbox/*`
- canonical docs touched only after implementation truth exists

Unowned dirty files exist in admin finance, design QA artifacts and calendar seed scripts. Do not stage or modify them.

## Interfaces And Dependencies

New contract shape:

```ts
export const MessagingMessageMediaSchema = z.strictObject({
  mediaAssetId: UuidSchema.nullable(),
  kind: z.enum(["voice"]),
  status: z.enum(["pending", "ready", "failed"]),
  durationSeconds: z.number().int().nonnegative().nullable(),
  mimeType: z.string().trim().min(1).max(100).nullable(),
  sizeBytes: z.number().int().nonnegative().nullable()
});

export const MessagingMessageMediaSourceResponseSchema = z.strictObject({
  url: z.string().trim().url(),
  expiresAt: TimestampSchema,
  mimeType: z.string().trim().min(1).max(100)
});
```

New provider metadata from parser/service:

```ts
type TelegramBusinessVoiceAttachment = {
  readonly providerFileId: string;
  readonly providerFileUniqueId: string;
  readonly durationSeconds: number;
  readonly providerMimeType: string | null;
  readonly providerSizeBytes: number | null;
};
```

New domain/store ingestion status:

```ts
type MessagingMediaIngestionStatus =
  | "pending"
  | "downloading"
  | "ready"
  | "failed"
  | "permanent_failed";
```

Worker-facing store methods:

```ts
claimDueMessageMediaIngestions(input): Promise<readonly ClaimedMessageMediaIngestion[]>;
markMessageMediaIngestionReady(input): Promise<void>;
markMessageMediaIngestionFailed(input): Promise<void>;
```

Provider adapter:

```ts
type TelegramBusinessMediaProvider = {
  getFile(input: { readonly fileId: string }): Promise<{ readonly filePath: string; readonly fileSize: number | null }>;
  downloadFile(input: { readonly filePath: string; readonly maxBytes: number }): Promise<Uint8Array>;
};
```

Private storage extension:

```ts
type PrivateObjectStorageWriterPort = {
  putPrivateObject(input: {
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly body: Uint8Array;
    readonly mimeType: string;
    readonly checksumSha256: string;
  }): Promise<void>;
};
```

## Plan Of Work

### Task 1: Contracts And Validation

**Files:**
- Modify: `packages/validation/src/media/index.ts`
- Modify: `packages/validation/src/media/index.test.ts`
- Modify: `packages/contracts/src/messaging.ts`
- Modify: `packages/contracts/src/messaging.test.ts`

**Interfaces:**
- Produces `messaging_attachment` purpose and audio MIME allow-list.
- Produces message media response and media source response contracts.

- [ ] **Step 1: Write failing validation tests**
  - Test that `mediaPurposeValues` contains `messaging_attachment`.
  - Test that `mediaUploadPurposeValues` does not contain `messaging_attachment`.
  - Test that `mediaPurposeStorageLimits.messaging_attachment` or equivalent exported limits are private, max 20 MB, and allow `audio/ogg`, `audio/mpeg`, `audio/mp4`.
  - Run: `pnpm test packages/validation/src/media/index.test.ts -- --runInBand`
  - Expected: FAIL because purpose/audio limits are missing.

- [ ] **Step 2: Implement validation constants**
  - Add `mediaAudioMimeTypeValues`.
  - Add `mediaPurposeStorageLimits` for worker-created non-upload purposes and keep browser-upload limits unchanged.
  - Include `messaging_attachment` in DB-facing purpose values.
  - Run the validation test again; expected PASS.

- [ ] **Step 3: Write failing messaging contract tests**
  - Add a message fixture with `contentType: "voice"` and `media.status = "pending"`.
  - Add source response fixture `{ url, expiresAt, mimeType }`.
  - Run: `pnpm test packages/contracts/src/messaging.test.ts -- --runInBand`
  - Expected: FAIL because schemas do not exist/accept `media`.

- [ ] **Step 4: Implement messaging contract schemas**
  - Add `MessagingMessageMediaSchema`.
  - Add nullable `media` field to `MessagingMessageSchema`.
  - Add `MessagingMessageMediaSourceResponseSchema`.
  - Run contract tests; expected PASS.

### Task 2: DB Schema And Messaging Store Persistence

**Files:**
- Modify: `packages/db/src/schema/messaging/messaging-values.ts`
- Modify: `packages/db/src/schema/messaging/messages.schema.ts`
- Create: `packages/db/src/schema/messaging/message-media-ingestions.schema.ts`
- Modify: `packages/db/src/schema/messaging/index.ts`
- Modify: `packages/db/src/schema.test.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.integration.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-read-store.ts`
- Modify: `packages/domain/src/messaging/messaging-types.ts`
- Modify: `packages/domain/src/messaging/messaging-store.ts`
- Modify: `packages/domain/src/messaging/messaging-read-store.ts`
- Modify: `packages/domain/src/messaging/messaging-use-cases.ts`
- Modify generated/baseline migration files only through the repo's accepted DB workflow.

**Interfaces:**
- Consumes Task 1 validation purpose values.
- Produces pending ingestion rows and read-model media hydration.

- [ ] **Step 1: Write failing domain/store tests**
  - Extend `RecordTelegramBusinessMessageStoreInput` with optional `voiceAttachment`.
  - Test voice message creates one pending ingestion and duplicate delivery does not create a second active ingestion.
  - Run: `pnpm test packages/domain/src/messaging/messaging-use-cases.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts -- --runInBand`
  - Expected: FAIL because interfaces/schema are missing.

- [ ] **Step 2: Add schema and domain types**
  - Add `message_media_ingestions` table with status checks and indexes.
  - Add `messages.media_asset_id -> media_assets.id` FK if absent.
  - Add `MessagingMessageMedia`, `TelegramBusinessVoiceAttachment`, ingestion statuses and store input/output types.
  - Run schema tests; expected PASS after implementation.

- [ ] **Step 3: Implement transactional persistence**
  - In `recordTelegramBusinessMessage`, insert pending ingestion for voice messages in the same transaction as message insert.
  - Store provider file IDs in the ingestion table only.
  - Ensure duplicate provider message returns existing message and does not create another ingestion.
  - Hydrate `media` in thread reads: `pending`, `ready`, `failed`, or `null`.

- [ ] **Step 4: Run DB integration**
  - Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/messaging/drizzle-messaging-store.integration.ts -- --runInBand`
  - Expected: PASS with real local DB.

### Task 3: Webhook Parser And API Service Handoff

**Files:**
- Modify: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.test.ts`

**Interfaces:**
- Consumes `TelegramBusinessVoiceAttachment`.
- Produces service call that passes provider file metadata into the store.

- [ ] **Step 1: Write failing parser/service tests**
  - Parser should expose `voiceAttachment` with file id, unique id, duration, MIME and size.
  - Service should call `recordTelegramBusinessMessage` with `voiceAttachment` for voice updates.
  - Run API messaging tests; expected FAIL on missing field.

- [ ] **Step 2: Implement parser/service handoff**
  - Keep text fallback unchanged.
  - Add `voiceAttachment` only for `contentType = "voice"`.
  - Never log or return provider file ids.
  - Run targeted API tests; expected PASS.

### Task 4: Notification Worker Media Ingestion

**Files:**
- Create: `apps/notification-worker/src/messaging-media-ingestion.provider.ts`
- Create: `apps/notification-worker/src/messaging-media-ingestion.processor.ts`
- Create: `apps/notification-worker/src/messaging-media-ingestion.queue.ts`
- Create tests for those files.
- Modify: `apps/notification-worker/src/runtime-config.ts`
- Modify: `apps/notification-worker/src/main.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts` or a focused processing store export.
- Modify: `apps/astrologer-api/src/modules/media/s3-media-object-storage.ts`
- Modify: `packages/domain/src/media/object-storage.ts`

**Interfaces:**
- Consumes pending ingestion rows from Task 2.
- Produces ready/failed ingestion state and private media assets.

- [ ] **Step 1: Write failing worker/provider tests**
  - Telegram provider calls `getFile` and downloads with max bytes.
  - Processor marks permanent failed for oversized/invalid MIME.
  - Processor creates private media asset and marks ingestion ready for valid OGG bytes.
  - Queue job payload includes only ingestion id.

- [ ] **Step 2: Implement narrow provider and queue**
  - Use `fetch`, not a bot framework.
  - Build Telegram file URL only inside provider.
  - Do not log token/file path.

- [ ] **Step 3: Implement processor**
  - Claim/reload ingestion by id.
  - Validate byte cap, MIME allow-list and checksum.
  - Write private object through media storage port.
  - Create/ready media asset and attach to message.
  - Emit `message.updated` realtime event.

- [ ] **Step 4: Wire worker main/runtime config**
  - Reuse Telegram Business token config.
  - Add queue/worker readiness checks.
  - Run worker targeted tests; expected PASS.

### Task 5: Astrologer API Media Source Endpoint

**Files:**
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.controller.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.module.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts`
- Modify or add storage/read-store methods as needed.

**Interfaces:**
- Consumes ready message media state.
- Produces `GET /messaging/messages/:messageId/media/source`.

- [ ] **Step 1: Write failing API tests**
  - Owner can fetch source for a ready voice message.
  - Not-ready media returns `message_media_not_ready`.
  - Cross-owner message returns not found/access denied without leaking existence.

- [ ] **Step 2: Implement endpoint**
  - Authenticate astrologer session.
  - Resolve message through owner-scoped Messaging read/store method.
  - Verify ready private media asset.
  - Return short-lived presigned source with original audio MIME.
  - Run API tests; expected PASS.

### Task 6: Inbox Voice Playback UI

**Files:**
- Modify: `apps/astrologer-web/src/features/messaging/api/messagingApi.ts`
- Modify: `apps/astrologer-web/src/features/messaging/api/messagingApi.test.ts`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.module.css`

**Interfaces:**
- Consumes `message.media`.
- Produces pending/ready/failed voice UI and playback source request.

- [ ] **Step 1: Use elevenhouse-design-parity before visible edits**
  - Read the skill.
  - Map Inbox design reference.
  - Capture reference/production state if required services are available.

- [ ] **Step 2: Write failing UI tests**
  - Pending voice renders disabled/loading state.
  - Ready voice fetches media source on play/focus action and renders audio.
  - Failed voice renders durable failed state.

- [ ] **Step 3: Implement UI**
  - Add API client for media source endpoint.
  - Add `VoiceMessageBubble` focused component if JSX grows.
  - Preserve current bubble visual language and responsive constraints.
  - Run frontend targeted tests; expected PASS.

### Task 7: Verification, Runtime E2E And Docs

**Files:**
- Update canonical docs only for implemented truth:
  - `docs/architecture/media-storage.md`
  - `docs/api/api-boundaries.md`
  - possibly `docs/decisions/0010-messaging-channel-architecture.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces evidence report.

- [ ] **Step 1: Run automated affected surface**
  - `pnpm test packages/validation/src/media packages/contracts/src/messaging.test.ts packages/domain/src/messaging packages/db/src/adapters/messaging apps/astrologer-api/src/modules/messaging apps/notification-worker/src apps/astrologer-web/src/features/messaging apps/astrologer-web/src/pages/inbox -- --runInBand`
  - package builds for validation/contracts/domain/db/astrologer-api/notification-worker/astrologer-web.
  - `git diff --check`.

- [ ] **Step 2: Runtime E2E**
  - Use current services if already running; do not start/stop without authority.
  - If authority is present and services need restart, restart only affected local services.
  - Send a real Telegram Business voice message through the stable tunnel.
  - Verify DB pending -> ready, private media asset, Inbox playback, no token/file IDs in browser payload.

- [ ] **Step 3: Design parity/accessibility**
  - Capture production screenshots and compare changed Inbox states to design reference.
  - Check console/network, focus/keyboard and responsive states.

- [ ] **Step 4: Final report**
  - Separate implemented, verified, partial/deferred, blocked/skipped checks, residual risk and unowned dirty files.
