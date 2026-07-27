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

Inbound provider media follows the same identifier-first async boundary.
Telegram Business voice, image and video-note messages persist provider media
metadata and a `message_media_ingestions` row with the message transaction. A
worker relay publishes identifier-only ingestion jobs, the worker reloads state
by ingestion id, downloads through a provider adapter, validates type and size,
writes a private `messaging_attachment` media asset, attaches it to the message
and emits `message.updated`.

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
- Logging must never include phone numbers, Telegram verification or 2FA codes,
  business-connection secrets, raw provider payloads, session strings,
  credentials or message bodies. Queue payloads contain identifiers only.
- Inbound webhooks must validate provider authenticity and dedupe provider
  update/message ids before acknowledging.
- Browser playback of provider media must use owner-scoped backend source
  endpoints and short-lived private storage URLs; provider file ids, file paths,
  bot-token URLs and storage bucket/key details must not leave the backend.
- Full Inbox UI must use durable message state plus realtime invalidation, not
  localStorage or mock conversations.
