# Messaging Voice Media Architecture Design

Date: 2026-07-27
Status: design proposed for user review; implementation planning pending
Scope: Telegram Business inbound voice-message storage and playback for the
astrologer Inbox, with reusable media-ingestion architecture for later
attachments, outbound voice, MTProto and Instagram slices.

> This document is an architecture design artifact. After implementation,
> durable decisions must also be reflected in canonical architecture, API,
> deployment, testing, security and operations documents where they become
> implemented truth.

## 1. Purpose

ElevenHouse Messaging already records Telegram Business voice updates as durable
messages with `contentType = "voice"`, but the product still cannot play the
actual audio in the Inbox. The next slice must turn voice messages into real
private media assets without weakening the existing Messaging architecture:
webhooks acknowledge quickly, PostgreSQL remains the source of truth, provider
side effects run in workers, queue payloads carry identifiers only, and browsers
never receive Telegram bot credentials or raw provider file URLs.

The first user-visible result is simple: when a client sends a voice message to
the astrologer's connected Telegram Business account, the astrologer sees the
message in ElevenHouse and can play the audio from the chat. The underlying
design must also support future image/file attachments, outbound voice replies,
MTProto media and Instagram media without rewriting the message model.

## 2. Locked Product Decisions

- Retention is indefinite for this slice. Voice files and message media stay
  attached to the CRM conversation until an explicit message deletion,
  account/data lifecycle workflow, legal retention policy or later user-facing
  delete/export flow changes that record.
- The first implementation is inbound Telegram Business voice playback.
- Outbound voice sending, voice transcription, waveform rendering, Instagram
  media, MTProto media import and a legal retention settings UI are later
  slices.
- Telegram Business remains the first connected channel. MTProto and Instagram
  are architectural extension points, not part of this implementation slice.
- The Inbox must show a durable failed/pending media state instead of pretending
  audio exists before ingestion is complete.

## 3. Non-Goals

- Do not add a full Telegram bot framework solely for file download.
- Do not expose Telegram `getFile` URLs or bot token derived paths to the
  browser.
- Do not download provider files synchronously inside webhook acknowledgement.
- Do not add browser-only mock audio, fake `ready` states or local filesystem
  URLs.
- Do not implement malware scanning unless an actual scanner service is
  configured and tested. The design leaves a hook for scanning, but does not
  claim the capability before it exists.
- Do not introduce WebSocket for this slice. Existing SSE freshness remains
  enough because playback is read-only and message/media state changes can be
  pushed as server-to-browser invalidations.

## 4. Repository Context

Repository evidence establishes these constraints:

- `docs/decisions/0010-messaging-channel-architecture.md` says Messaging owns
  channel connections, identities, threads, messages, delivery attempts, inbound
  dedupe, outbound idempotency and realtime event publication. Provider side
  effects belong behind adapters and workers.
- The same ADR requires outbound state to be written transactionally with an
  outbox event, and queue payloads to contain identifiers only. This applies to
  media ingestion jobs as well.
- `docs/api/api-boundaries.md` states that provider webhooks must validate
  authenticity and dedupe before acknowledgement, while Messaging commands are
  authenticated and owner scoped.
- `docs/architecture/backend-modules.md` allows `notification-worker` to execute
  Messaging delivery jobs, but it must reload authoritative state and must not
  own conversations.
- `docs/architecture/media-storage.md` says media lifecycle, ownership, purpose
  validation and object storage live outside business modules. Business modules
  reference media IDs and consume media ports/read models instead of owning
  provider credentials, buckets or presigned URL policy.
- The current media baseline supports private object storage and private
  short-lived download URLs for worker-created calculation PDFs, but it does not
  yet define a messaging attachment purpose, audio MIME rules, a generic
  replace/delete lifecycle, malware scanning or recording-specific compliance.
- Current Messaging schema already has `messages.content_type` values including
  `voice` and a nullable `messages.media_asset_id`, but the current voice slice
  writes only a text fallback such as `Голосовое сообщение (0:12)`.

## 5. Research

Question: how should ElevenHouse ingest Telegram Business voice files so audio
playback is reliable, private and reusable for future channel media?

Decision affected: webhook acknowledgement, media download timing, storage
ownership, content validation, dependency choice, read contract and retry model.

Accessed: 2026-07-27.

### Sources

- Telegram Bot API, `Update`, `Voice`, `getFile`, `sendVoice` and Business
  methods: https://core.telegram.org/bots/api
- OWASP File Upload Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- grammY files plugin documentation: https://grammy.dev/plugins/files
- `file-type` npm package documentation: https://www.npmjs.com/package/file-type

### Findings

- Sourced fact: Telegram Bot API exposes business message updates, edited
  business messages and deleted business messages, and send methods accept
  `business_connection_id` where Telegram supports business-account operations.
- Sourced fact: Telegram `Voice` includes `file_id`, `file_unique_id`,
  `duration`, optional MIME type and optional file size.
- Sourced fact: Telegram `getFile` returns a `file_path`; bots can download the
  file through the Bot API file endpoint. Telegram documents that the generated
  link is valid for at least one hour and that files up to 20 MB can be
  downloaded this way.
- Sourced fact: Telegram `sendVoice` supports `business_connection_id` and
  accepts voice files in `.OGG` OPUS, `.MP3` or `.M4A` formats up to Telegram's
  documented Bot API limit for that method. This matters later for outbound
  voice, not for the first inbound slice.
- Sourced fact: OWASP recommends defense in depth for file handling: allow-list
  expected types, do not trust `Content-Type`, generate filenames, enforce size
  limits, validate authorization, store outside the webroot or behind an
  application handler, and run antivirus/sandbox checks if available.
- Sourced fact: grammY's files plugin wraps Telegram file download and URL
  helpers, but it still requires a bot token and is designed around grammY's bot
  API surface.
- Sourced fact: `file-type` detects binary file type from magic numbers in a
  buffer or stream. It does not replace business allow-lists or size limits.
- Repository evidence: ElevenHouse already has an object-storage port, private
  media assets, BullMQ workers, Messaging stores and SSE freshness. A new
  Telegram framework would duplicate this architecture for one provider call.
- Inference: A small provider adapter using the existing HTTP/fetch style is
  cleaner than adding grammY, Telegraf or another bot framework for file
  download only.
- Inference: `file-type` is a reasonable narrow dependency if implementation
  needs byte-signature validation beyond provider MIME metadata. It should live
  in the worker/storage validation path, not in the browser.

## 6. Considered Options

### Option A: Browser Plays Telegram File URLs Directly

The webhook stores `voice.file_id`; the browser asks the API for a Telegram file
URL and plays it directly.

Rejected. It couples playback to Telegram's temporary URL lifetime, risks
leaking provider file paths outside the backend, makes retention impossible to
control, and leaves the CRM history dependent on Telegram availability. It also
does not fit the existing private-media architecture.

### Option B: Webhook Downloads Voice Synchronously

The Telegram webhook validates the update, calls `getFile`, downloads the audio,
uploads it to object storage and only then acknowledges Telegram.

Rejected. This makes provider acknowledgement depend on network and storage
latency, increases duplicate retry risk, and turns a webhook boundary into a
long-running media pipeline. It conflicts with the existing outbox/worker model.

### Option C: Durable Async Media Ingestion

The webhook persists the message and provider media metadata quickly, creates a
durable media-ingestion record or outbox event in the same transaction, then a
worker downloads, validates and stores the file in private media storage. The
read model exposes `pending`, `ready` or `failed` media state.

Recommended. It fits the accepted Messaging ADR, makes retries observable,
keeps Telegram token use backend-only, preserves CRM media beyond Telegram URL
expiry, and provides a reusable ingestion model for future attachments.

## 7. Architecture Recommendation

Use durable async media ingestion.

```text
Telegram Business webhook
  -> validate secret and parse update
  -> dedupe provider update/message
  -> transaction:
       upsert thread/message
       persist voice provider metadata
       enqueue media-ingestion outbox event
  -> acknowledge Telegram

outbox relay / notification-worker
  -> claim media-ingestion job by id
  -> reload message, connection and provider metadata
  -> Telegram getFile(file_id)
  -> download with size cap and timeout
  -> validate allow-listed audio type and bytes
  -> store private object
  -> create/complete MediaAsset(purpose = messaging_attachment)
  -> attach mediaAssetId to message
  -> publish Messaging realtime invalidation

astrologer-web Inbox
  -> reads message media state
  -> if ready, asks authenticated API for short-lived private playback URL
  -> plays audio through a standard controlled audio element
```

Webhook state and ingestion state must be committed before acknowledgement. The
queue may carry only the ingestion id, message id or outbox event id. It must
not carry Telegram file IDs, message bodies, raw provider payloads or bot token
derived URLs.

## 8. Data Model

### Media Purpose

Add a worker-created media purpose:

```text
messaging_attachment
```

Rules:

- visibility: `private`
- browser upload: not allowed in this slice
- owner: astrologer user id that owns the channel connection/thread
- supported initial content: voice audio only
- allowed MIME list for first slice: `audio/ogg`, `audio/mpeg`, `audio/mp4`
  plus any exact M4A/OPUS MIME values confirmed by implementation tests
- size limit: no larger than Telegram `getFile` download support for this
  provider path, with an ElevenHouse cap at or below that limit
- storage key: generated by ElevenHouse, not provider filename or client input

The validation package remains the single source for purpose limits. Apps should
not duplicate MIME and size rules.

### Message Reference

Keep `messages.media_asset_id` nullable, but add the missing database-level
foreign key to `media_assets` during the migration if current schema still lacks
it. The intended relation is restrictive deletion while message references the
asset, unless a later explicit deletion lifecycle replaces both message content
and asset.

### Media Ingestion Records

Add a Messaging-owned ingestion table, named with the existing schema style,
for example `message_media_ingestions`.

Required fields:

- `id`
- `message_id`
- `channel_connection_id`
- `provider`
- `provider_file_id`
- `provider_file_unique_id`
- `provider_mime_type`
- `provider_size_bytes`
- `content_type`
- `duration_seconds`
- `download_status`: `pending`, `downloading`, `ready`, `failed`,
  `permanent_failed`
- `media_asset_id`
- `failure_code`
- `attempt_count`
- `next_retry_at`
- `checksum_sha256`
- `created_at`
- `updated_at`

Required constraints and indexes:

- one active ingestion per `message_id`
- index by `download_status, next_retry_at` for worker claiming
- index by `message_id` for read-model hydration
- optional future unique key by
  `channel_connection_id, provider_file_unique_id, content_type` for deduped
  reuse, but do not rely on reuse in the first implementation

`provider_file_id` is required for downloading and can be sensitive. It should
not appear in frontend contracts, logs, queue payloads or analytics events.

## 9. Domain And Ports

Messaging owns the ingestion workflow state; Media owns asset persistence and
object storage.

New or extended ports:

- `MessagingMediaIngestionStore`
  - creates pending ingestion when a voice message is recorded
  - claims due pending/failed ingestion rows with locking semantics
  - marks downloading, ready, retryable failed or permanent failed
  - attaches `mediaAssetId` to the message atomically with ready state
- `TelegramBusinessMediaProvider`
  - `getFile(fileId)`
  - `downloadFile(filePath, maxBytes)`
  - wraps Bot API errors into typed provider errors
- private object storage writer
  - use the existing `PrivateObjectStoragePort` if it already supports
    server-side writes during implementation
  - otherwise extend the media storage port narrowly instead of writing to S3
    directly from Messaging
- `MessagingRealtimePublisher`
  - publishes a thread/message invalidation after media status changes

The provider adapter can use native `fetch` or the repo's existing HTTP style.
Do not add grammY/Telegraf just to call `getFile` and download bytes. Add
`file-type` only if implementation confirms it is the smallest reliable way to
sniff downloaded audio bytes.

## 10. Runtime Flow

### Inbound Voice

1. Telegram sends `business_message` with `voice`.
2. `astrologer-api` validates the webhook secret and parses the voice metadata.
3. Messaging dedupes the provider update/message.
4. In one transaction, Messaging persists:
   - thread and participant state,
   - message with `contentType = "voice"` and fallback text,
   - provider voice metadata,
   - pending ingestion/outbox event.
5. The API acknowledges Telegram before file download.

### Worker Ingestion

1. Worker claims one due ingestion row.
2. Worker reloads the message, channel connection and provider file metadata.
3. Worker calls Telegram `getFile`.
4. Worker downloads with explicit timeout, byte cap and retry classification.
5. Worker validates provider metadata and byte-detected file type against the
   `messaging_attachment` allow-list.
6. Worker stores the audio object in private storage under a generated key.
7. Worker creates or completes the `MediaAsset` as ready.
8. Worker updates ingestion and message in one transaction where possible.
9. Worker emits a Messaging realtime event so the Inbox refreshes the message.

### Read And Playback

Thread/message read contracts expose media state, not provider internals:

```ts
type MessagingMessageMediaResponse = {
  mediaAssetId: string | null;
  kind: "voice";
  status: "pending" | "ready" | "failed";
  durationSeconds: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
};
```

When `status = "ready"`, the UI requests a short-lived playback source:

```text
GET /messaging/messages/:messageId/media/source
```

The endpoint authenticates the astrologer, verifies owner-scoped access to the
message/thread and private asset, and returns:

```ts
type MessagingMessageMediaSourceResponse = {
  url: string;
  expiresAt: string;
  mimeType: string;
};
```

The endpoint must not accept arbitrary media asset IDs because access is scoped
through the message/thread relationship.

### Deletion And Edits

Provider deletion handling should keep current message deletion semantics and
add media handling:

- if Telegram sends a supported deletion update, mark the message deleted and
  remove playback from the read model;
- physical object deletion can be deferred to a later cleanup job, but the UI
  must stop exposing the media immediately after the message is marked deleted;
- edited text updates do not mutate voice audio in this slice;
- future provider media replacement should create a new ingestion version rather
  than mutating a ready asset in place without auditability.

## 11. API Contracts

Extend Messaging contracts rather than returning raw `MediaAssetResponse` from
thread reads. The chat UI needs message-specific media state, not a generic
media-management surface.

Required contract changes:

- `MessagingMessageResponse.mediaAssetId` remains for compatibility during the
  transition.
- Add `media` or `attachment` object with kind/status/duration/MIME/size.
- Add `GET /messaging/messages/:messageId/media/source`.
- Error codes:
  - `message_media_not_found`
  - `message_media_not_ready`
  - `message_media_access_denied`
  - `message_media_deleted`
- SSE event payloads remain lightweight invalidations, for example
  `message.updated` with thread/message identifiers. Do not push file URLs over
  SSE.

## 12. Reliability, Security And Privacy

Reliability requirements:

- webhook acknowledgement does not wait for file download;
- ingestion is idempotent per message;
- worker retry distinguishes transient provider/network/storage failures from
  permanent validation failures;
- repeated Telegram webhook delivery does not create duplicate messages or
  duplicate active ingestions;
- `ready` is written only after private storage and media asset state are both
  durable;
- failed media remains visible as a failed voice bubble with retry evidence for
  operators, not as a vanished message.

Security and privacy requirements:

- Telegram bot token, `file_id`, `file_path`, raw payload and message body are
  never logged;
- queue payloads carry identifiers only;
- browser receives only ElevenHouse authenticated API responses and short-lived
  private playback URLs;
- media source endpoint checks astrologer ownership through message/thread, not
  by trusting a `mediaAssetId` query parameter;
- filenames and storage keys are generated by ElevenHouse;
- provider MIME is treated as metadata, not security proof;
- downloaded bytes are checked against allow-listed audio types;
- size and time limits are enforced before storing;
- private storage is used, not public buckets or static serving;
- optional malware scanning is a later capability unless a real scanner service
  exists in the environment and is tested.

Retention requirement:

- because product decision is indefinite retention, no automatic time-based
  cleanup is added for ready messaging attachments in this slice;
- abandoned failed/temporary objects may be cleaned only if they are not exposed
  as retained conversation history and cleanup is auditable.

## 13. Frontend Behavior

The first visible UI should stay narrow and reliable:

- pending voice: show the existing voice bubble with a disabled/loading audio
  state;
- ready voice: show playable audio inside the chat bubble with duration;
- failed voice: show a clear failed media state and keep the message in place;
- deleted voice: match current deleted-message presentation and remove playback;
- source URL expiry: fetch a fresh media source on play if the cached URL is
  missing or expired;
- no waveform/transcription in this slice.

Any visible Inbox change must follow `elevenhouse-design-parity`: compare the
implemented state against the exact design reference, test responsive states and
verify in a real browser with network-backed data.

## 14. Testing And Acceptance

Targeted tests:

- parser tests for Telegram voice metadata and ignored unsupported media;
- service/domain tests that a voice message creates one pending ingestion and
  duplicate webhook delivery does not duplicate it;
- DB schema/adapter tests for ingestion constraints, claim/retry behavior,
  message attachment and owner-scoped reads;
- provider tests for `getFile`, download success, Telegram transient errors,
  Telegram permanent missing-file errors and max-size failures;
- media validation tests for `messaging_attachment` purpose, MIME allow-list and
  non-browser-uploadability;
- worker tests with fake Telegram provider and fake object storage;
- API tests for message read media state and media-source authorization;
- frontend tests for pending, ready, failed, deleted and expired-source states.

Integration and runtime acceptance:

- local DB integration for ingestion transaction and message read hydration;
- storage integration against local MinIO if storage adapter behavior changes;
- worker integration proving a pending voice becomes ready and attaches a
  private media asset;
- Hookdeck or stable tunnel Telegram Business E2E:
  1. client sends a real voice message,
  2. webhook records it,
  3. worker downloads it,
  4. Inbox receives freshness update,
  5. astrologer plays the audio from ElevenHouse,
  6. Telegram token/file identifiers do not appear in browser network payloads
     or logs.

Required checks before claiming completion:

- targeted unit tests for touched packages/apps;
- DB integration tests for Messaging and Media changes;
- affected package builds;
- browser proof on the actual Inbox route with real network data;
- `git diff --check`;
- documentation update for implemented architecture/API/operations surfaces.

## 15. Rollout Plan

1. Schema and contracts:
   - add `messaging_attachment` media purpose and validation tests;
   - add ingestion table and message/media constraints;
   - extend Messaging contracts for message media state and media source.
2. Domain and stores:
   - add ingestion store/use cases;
   - persist pending ingestion when inbound voice message is recorded;
   - hydrate media status in read models.
3. Worker and provider:
   - implement `TelegramBusinessMediaProvider`;
   - add worker job for voice ingestion;
   - integrate private object storage and media asset creation.
4. API:
   - add owner-scoped media source endpoint;
   - ensure SSE invalidation after media state changes.
5. Frontend:
   - render pending/ready/failed voice states;
   - request short-lived source URL only when playback is needed.
6. E2E and docs:
   - run real Telegram Business voice E2E through stable tunnel;
   - update canonical architecture/API/operations docs for implemented truth.

## 16. Open Questions

No product decision blocks the implementation plan after the indefinite
retention decision. The following are intentionally deferred:

- whether to add transcription and whether it requires separate consent;
- whether outbound voice replies should be recorded from browser microphone,
  uploaded manually or forwarded from provider media;
- whether Instagram media should reuse this ingestion table unchanged or add
  provider-specific metadata columns after Meta App Review requirements are
  known;
- whether a production malware scanner will be part of the first media rollout
  or a later hardening slice.
