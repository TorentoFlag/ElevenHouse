# Messaging Rich Media Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse repo policy overrides generic worktree setup: execute in the existing shared checkout on `main`; do not create/switch branches or worktrees.

**Goal:** Telegram Business inbound photos and video circles become durable private messaging attachments shown in the Inbox, reusing the existing voice media pipeline.

**Architecture:** Telegram webhooks persist provider media metadata and a pending ingestion row, then acknowledge Telegram. `notification-worker` downloads by ingestion id through Bot API `getFile`, validates type/size from provider metadata plus bytes, stores private `messaging_attachment` media, and updates the message. The browser renders ready images and video notes through the existing owner-scoped media source endpoint.

**Tech Stack:** TypeScript, NestJS `astrologer-api`, React/Vite `astrologer-web`, Drizzle/PostgreSQL, BullMQ/Redis `notification-worker`, S3-compatible private storage, Zod contracts/validation, Vitest/Jest-style tests.

## Global Constraints

- Inbound only: no outbound image/video-note sending in this slice.
- Keep Telegram Business / Secretary bot as the only implemented provider mode.
- Queue payloads carry identifiers only.
- Do not expose Telegram `file_id`, `file_path`, raw payloads, bot-token URLs or private storage keys to the browser.
- Keep Bot API download limit at 20 MB for `messaging_attachment`.
- Do not implement generic documents/files except image documents when Telegram supplies an image MIME.
- Webhook acknowledgement must not wait for media download.
- Use TDD for parser, contracts, store/worker and UI behavior.
- Runtime E2E requires real Hookdeck/Telegram/MinIO/browser evidence.

---

## Research

Question: Which Telegram Business media fields must ElevenHouse support for photos and video circles, and how should they fit the current media ingestion pipeline?

Decision affected: Messaging content types, provider media metadata, worker validation and Inbox rendering.

Accessed: 2026-07-27.

### Sources

- https://core.telegram.org/bots/api - official Bot API, `Update`, `Message`, `PhotoSize`, `VideoNote`, `File`, `getFile`.

### Findings

- Sourced fact: Telegram `business_message` is a `Message`, so media appears in the standard `Message` fields.
- Sourced fact: `photo` is an array of `PhotoSize`; each size has `file_id`, `file_unique_id`, dimensions and optional size.
- Sourced fact: `video_note` has `file_id`, `file_unique_id`, `length`, `duration`, optional thumbnail and optional size.
- Sourced fact: `getFile` prepares downloads and Bot API file download is limited to 20 MB; file links are token-bearing and must remain backend-only.
- Sourced fact: `getFile` may not preserve original MIME/name, so ElevenHouse must save MIME/name when present in the incoming message and validate bytes after download.
- Repository evidence: `docs/decisions/0010-messaging-channel-architecture.md` requires identifier-only queues and private owner-scoped playback URLs.
- Repository evidence: current voice implementation already persists `message_media_ingestions` and uses private `messaging_attachment` media.

### Options

1. Extend current ingestion with `kind: image | video_note | voice`.
   Benefits: one async provider-media pipeline, same security boundary, minimal schema expansion. Risks: worker must validate more MIME families.
2. Add separate image/video tables and endpoints.
   Benefits: narrow schemas per media type. Risks: duplicates queue/storage/retry logic and diverges from ADR 0010.
3. Store provider URLs directly for media playback.
   Benefits: fastest implementation. Risks: leaks bot-token URLs, violates private storage and owner-scoped playback requirements.

### Recommendation

Use option 1. Generalize the provider attachment metadata while preserving the same `messaging_attachment` purpose, ingestion table and media source endpoint.

### Rejected Alternatives

- Separate pipelines are rejected because they duplicate retry/storage/idempotency logic without product benefit.
- Direct Telegram playback URLs are rejected because provider file URLs contain the bot token and expire independently of ElevenHouse authorization.

### User Decisions

Approved: implement inbound `image` and `video_note` in the current pipeline, limit 20 MB, no generic documents except image documents.

## Progress

- [x] 2026-07-27: Research and implementation direction approved by user.
- [ ] Task 1: contracts, validation and domain content/media types.
- [ ] Task 2: Telegram parser and API service handoff.
- [ ] Task 3: DB/domain store ingestion metadata and read hydration.
- [ ] Task 4: worker validation/storage for image and video-note media.
- [ ] Task 5: Inbox image/video-note rendering.
- [ ] Task 6: automated, integration and live runtime verification.

## Plan Of Work

### Task 1: Contracts, Validation And Domain Types

**Files:**
- Modify: `packages/validation/src/media/index.ts`
- Modify: `packages/validation/src/media/index.test.ts`
- Modify: `packages/contracts/src/messaging.ts`
- Modify: `packages/contracts/src/messaging.test.ts`
- Modify: `packages/domain/src/messaging/messaging-types.ts`
- Modify: `packages/db/src/schema/messaging/messaging-values.ts`

**Interfaces:**
- Produce `MessagingMessageContentType = "text" | "image" | "file" | "voice" | "video_note" | "unsupported"`.
- Produce `MessagingMessageMedia.kind = "voice" | "image" | "video_note"`.
- Produce media fields `durationSeconds`, `width`, `height`, `mimeType`, `sizeBytes`.
- Extend `messaging_attachment` allowed MIME to image and video-note MIME families.

**Steps:**
- [ ] Write failing validation tests for image/video MIME acceptance on `messaging_attachment`.
- [ ] Run validation tests and confirm failure.
- [ ] Write failing contract tests for image and video-note message media.
- [ ] Run contract tests and confirm failure.
- [ ] Implement schemas/types/enums.
- [ ] Re-run focused tests and confirm pass.

### Task 2: Telegram Parser And Service Handoff

**Files:**
- Modify: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/telegram-business-webhook.test.ts`
- Modify: `packages/domain/src/messaging/messaging-store.ts`
- Modify: `packages/domain/src/messaging/messaging-use-cases.ts`
- Modify: `packages/domain/src/messaging/messaging-use-cases.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/messaging/messaging.e2e.test.ts`

**Interfaces:**
- Replace voice-only attachment input with provider media attachment:
  `kind`, `providerFileId`, `providerFileUniqueId`, `durationSeconds`, `width`, `height`, `providerMimeType`, `providerSizeBytes`.
- Parser chooses largest Telegram `photo` size and parses `video_note`.

**Steps:**
- [ ] Write parser tests for `photo`, `video_note` and image `document`.
- [ ] Run parser tests and confirm failure.
- [ ] Write domain/service tests proving provider media attachment is passed and unsupported documents stay unsupported.
- [ ] Run focused tests and confirm failure.
- [ ] Implement parser and service handoff.
- [ ] Re-run focused parser/domain/API tests and confirm pass.

### Task 3: Store Persistence And Read Hydration

**Files:**
- Modify: `packages/db/src/schema/messaging/message-media-ingestions.schema.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.integration.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-read-store.ts`

**Interfaces:**
- Add nullable `width` and `height` to ingestion rows.
- Store provider media metadata for voice, image and video-note in the same transaction as message creation.
- Hydrate read model media kind/status/dimensions from ingestion rows.

**Steps:**
- [ ] Write failing store tests for photo/video-note ingestion rows and duplicate webhook dedupe.
- [ ] Run store tests and confirm failure.
- [ ] Implement schema/store/read changes.
- [ ] Update baseline migration according to current repository pattern.
- [ ] Run focused DB store and integration tests.

### Task 4: Worker Media Processing

**Files:**
- Modify: `apps/notification-worker/src/messaging-media-ingestion.types.ts`
- Modify: `apps/notification-worker/src/messaging-media-ingestion.processor.ts`
- Modify: `apps/notification-worker/src/messaging-media-ingestion.processor.test.ts`
- Modify: `apps/notification-worker/src/messaging-media-ingestion.storage.ts`
- Modify: `apps/notification-worker/src/runtime-config.ts`

**Interfaces:**
- Worker validates MIME by `kind`: audio, image or video-note.
- Original filenames use stable names: `telegram-voice.*`, `telegram-image.*`, `telegram-video-note.*`.
- Store `image/*` and `video/mp4` as private `messaging_attachment`.

**Steps:**
- [ ] Write failing processor tests for JPEG/PNG/WebP images and MP4 video-note.
- [ ] Run processor tests and confirm failure.
- [ ] Implement MIME detection and storage naming.
- [ ] Re-run worker tests.

### Task 5: Inbox Rendering

**Files:**
- Create or replace: `apps/astrologer-web/src/pages/inbox/MessageMediaBubble.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/VoiceMessageBubble.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.module.css`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPageView.test.tsx`

**Interfaces:**
- Render ready image as private sourced `<img>`.
- Render ready video note as circular `<video controls>`.
- Preserve pending/failed states for all media kinds.

**Steps:**
- [ ] Write failing UI tests for image and video-note ready/pending/failed states.
- [ ] Run UI tests and confirm failure.
- [ ] Implement component and styles.
- [ ] Re-run UI tests.

### Task 6: Verification

**Files:**
- Modify docs only after implementation truth exists:
  `docs/api/api-boundaries.md`, `docs/architecture/media-storage.md`, `docs/decisions/0010-messaging-channel-architecture.md`.

**Steps:**
- [ ] Run targeted tests for validation, contracts, parser, domain, DB store, worker and Inbox.
- [ ] Run affected package typechecks/builds.
- [ ] Run DB integration test with local database.
- [ ] Restart local `astrologer-api` and `notification-worker` only if needed for runtime verification.
- [ ] Verify live Telegram Business image and video-note through Hookdeck, DB, worker, MinIO and browser network.
- [ ] Capture runtime evidence and note any residual risk.
