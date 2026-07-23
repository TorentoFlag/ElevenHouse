# Clients Messaging Telegram Architecture Design

Date: 2026-07-21
Status: approved architecture direction; implementation planning pending
Scope: production architecture for `/clients`, `/inbox`, multi-channel
messaging, Telegram Business/Secretary bot, Telegram MTProto account mode, and
future Instagram messaging integration.

> This document is an architecture design artifact. After implementation,
> durable decisions must also be reflected in canonical architecture, API,
> deployment, testing, security, and operations documents.

## 1. Purpose

Build the Clients section as a real CRM and messaging surface for astrologers.
An astrologer must be able to manage client relationships, open a client card,
see overview/history/notes/conversation tabs, and communicate with clients from
ElevenHouse while preserving the astrologer's personal brand in external
channels.

The first messaging provider is Telegram. ElevenHouse supports two first-class
Telegram connection modes:

- `telegram_business_bot`: Telegram Business / Secretary bot connection, where
  the astrologer connects the ElevenHouse bot to their Telegram Business account
  and grants rights explicitly.
- `telegram_mtproto_account`: Telegram Account connection, where the astrologer
  authorizes ElevenHouse as an additional Telegram client through MTProto login.

Both modes are legitimate product choices. The first implementation may ship
`telegram_business_bot` earlier because it has a simpler official bot delivery
model, but contracts, database schema, adapters and UI must not treat
`telegram_mtproto_account` as a workaround, unsupported fallback, or hidden
technical escape hatch.

## 2. Locked Product Decisions

- Telegram is the first production channel.
- Instagram is architected from the start as a future provider adapter, not
  implemented in the first Telegram slice.
- The astrologer must be able to choose between Telegram Business / Secretary
  bot and Telegram Account / MTProto connection modes.
- Clients may write to the astrologer's personal Telegram account, not only to a
  platform bot.
- An unknown external chat may be linked to an existing CRM client.
- An unknown external chat may create a new manual CRM client when the
  astrologer explicitly chooses that action.
- Historical message import should be supported where provider capabilities
  allow it. The UI must not promise full old history for a provider mode that
  cannot technically provide it.
- Message content is retained as CRM history by default until explicit deletion,
  legal retention policy, or future account-data export/deletion workflow changes
  that policy.
- Attachments are stored in private object storage and referenced from message
  records.
- AI reply drafts are not part of the first implementation slice, but the
  architecture reserves a consent-bound draft workflow. AI never sends a message
  automatically.
- Realtime updates are part of the first complete Inbox release. The recommended
  initial transport is SSE behind a `RealtimeGateway` abstraction; WebSocket is
  an allowed later transport without changing the Messaging domain.

## 3. Explicitly Out Of Scope For The First Telegram Slice

- Instagram connection, App Review, permissions, and message delivery.
- WhatsApp, VK, email inbox, SMS inbox, or marketplace chat.
- Public astrologer discovery, catalog, recommendations, or cross-promotion.
- Automation/funnel actions that send messages without explicit approved
  workflow.
- AI-generated auto replies.
- Bulk broadcasts.
- Admin/operator support inbox.
- Fine-grained legal retention settings UI.
- Client-facing self-service export/delete flow.
- End-to-end encryption claims beyond provider behavior.

These are later vertical slices, not browser-only placeholders or mocked success
states.

## 4. Repository Context

Current repository evidence establishes these constraints:

- `docs/architecture/design-reference-inventory.md` maps CRM clients to future
  `/clients` in `astrologer-web` and assigns ownership across
  `ClientProfile`, `ClientRelationship`, `BirthData`, `Orders`, `Sessions`,
  `Messaging`, `Notes`, and future `CRMStages`.
- The same inventory maps Inbox and messages to future `/inbox` in
  `astrologer-web` and states that external channels must be provider-adapter
  backed and not persisted in browser storage.
- `apps/astrologer-api` already contains a `clients` feature module with list,
  detail, and birth-data update routes.
- `packages/domain/src/clients` already models `ClientRelationshipSource`
  including `manual`.
- `packages/db/src/adapters/clients/drizzle-client-store.ts` enforces
  astrologer/client role checks and owner-scoped relationship lookup.
- `docs/decisions/0004-payments-notifications-workers.md` requires
  transactional outbox plus worker-side delivery for notifications and provider
  adapters.
- `packages/db/src/adapters/outbox/drizzle-outbox-relay.ts` already implements
  claim/retry behavior with `for update skip locked`, stale publishing recovery,
  and backoff.
- `apps/notification-worker` already owns async notification delivery shape,
  retry options, and delivery attempts for auth-code delivery.
- `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md` requires CSRF for
  cookie-auth mutations and route-level idempotency for critical state changes.

## 5. Research

Question: how should ElevenHouse model Telegram personal-account messaging,
reliable multi-channel delivery, and realtime inbox updates?

Decision affected: provider mode model, webhook boundary, delivery reliability,
secret handling, history import, realtime transport, and future Instagram
adapter shape.

Accessed: 2026-07-21.

### Sources

- https://core.telegram.org/bots/features - Telegram Secretary Bots behavior,
  business message updates, rights checks, `business_connection_id` sending.
- https://core.telegram.org/api/bots/connected-business-bots - Telegram business
  connection TL updates, `connection_id`, one business bot limitation, settings
  changes, and business-ready methods.
- https://core.telegram.org/bots/api - Bot API `sendMessage`,
  `business_connection_id`, `BusinessConnection`, `readBusinessMessage`, and
  business bot rights.
- https://core.telegram.org/api/business - Telegram Business account features
  and connected-bot availability.
- https://core.telegram.org/api/auth - MTProto authorization flow and supported
  third-party code delivery methods.
- https://core.telegram.org/api/terms - Telegram API transparency, privacy,
  consent, and AI/ML data-use constraints.
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging
  - Instagram Messaging API high-level provider model for later integration.
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ -
  Meta webhook verification and `X-Hub-Signature-256`.
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  - SSE browser behavior and HTTP/1.1 connection limit considerations.
- https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API - WebSocket
  bidirectional browser API.
- https://docs.nestjs.com/techniques/server-sent-events - NestJS SSE support.
- https://docs.nestjs.com/websockets/gateways - NestJS WebSocket gateway model.

### Findings

- Sourced fact: Telegram Secretary Bots allow users to connect a bot that can
  process incoming messages and, depending on rights and settings, respond on
  the user's behalf.
- Sourced fact: Telegram business updates include connection updates, new
  business messages, edited messages, deleted messages, and callback queries.
- Sourced fact: Telegram Bot API send methods accept `business_connection_id`
  for sending on behalf of a business connection.
- Sourced fact: Telegram currently allows one business bot connected to a user
  account.
- Sourced fact: Telegram Business connected bots are available to non-Premium
  users, while other Telegram Business features may depend on Premium.
- Sourced fact: Telegram MTProto user authorization is a full client login flow,
  not OAuth. Third-party apps can use Telegram code delivery methods, while some
  SMS/Firebase paths are limited to official mobile clients.
- Sourced fact: Telegram API terms require user knowledge and consent for actions
  on behalf of the user and prohibit using Telegram platform data for AI/ML
  training or model development.
- Sourced fact: Meta webhooks sign payloads with `X-Hub-Signature-256`; future
  Instagram support must validate raw webhook payload signatures.
- Sourced fact: SSE is server-to-client push over HTTP and has browser per-domain
  connection limits under HTTP/1.1; HTTP/2 negotiates streams and avoids the
  same low per-origin behavior for typical deployments.
- Sourced fact: WebSocket enables bidirectional browser/server communication and
  NestJS supports gateway abstractions with socket.io or `ws`.
- Repository evidence: ElevenHouse already favors PostgreSQL as the business
  state authority, Redis/BullMQ as an identifier transport, and workers for
  retryable provider side effects.
- Inference: Messaging should own conversation state. `notification-worker` may
  execute provider delivery jobs, but it must not become the owner of threads,
  message records, client links, or CRM read models.
- Inference: A provider-neutral `ChannelConnection` model avoids leaking
  Telegram-specific concepts into the `/clients` card, `/inbox` list, and future
  Instagram adapter.
- Inference: SSE is the better first realtime transport because the first inbox
  needs server-to-browser events, while message sending remains safer as
  authenticated HTTP mutations with CSRF and idempotency.
- Inference: WebSocket should be reserved for later bidirectional realtime needs
  such as typing indicators, collaborative presence, call/session state, or
  high-frequency agent workflows.

### Options

1. Implement only a platform Telegram bot.
   Benefits: simplest Bot API integration. Risks: violates the personal-brand
   requirement because clients would communicate with a platform bot, not the
   astrologer's own account. Rejected.

2. Implement only Telegram Business / Secretary bot.
   Benefits: official delegated bot model, simpler secret surface, webhook-based
   inbound updates, easier retries. Risks: one connected business bot limitation,
   provider rights can be revoked, historical import may be limited. Rejected as
   the only mode because the user approved MTProto as a first-class choice.

3. Implement Telegram Business / Secretary bot and Telegram MTProto Account as
   two first-class connection modes behind one Messaging provider model.
   Benefits: supports personal brand, preserves user choice, keeps provider
   details isolated, and allows staged rollout without schema rewrite. Selected.

4. Use polling only for Inbox.
   Benefits: easiest first UI. Risks: weak CRM messaging UX, delayed delivery
   visibility, wasteful client polling, and later migration churn. Rejected.

5. Use WebSocket for all realtime and message sending.
   Benefits: full duplex from day one. Risks: duplicates mutation semantics,
   complicates CSRF/idempotency/audit and is not needed for first server-push
   requirements. Rejected for first slice.

6. Use SSE for inbound UI updates while keeping writes as HTTP commands.
   Benefits: simple auth model, browser-native reconnect, easy NestJS fit,
   minimal transport surface, and clean separation between durability and UI
   freshness. Selected for first complete Inbox release.

### Recommendation

Create a provider-neutral `Messaging` domain with durable PostgreSQL state,
transactional outbox, worker delivery, inbound webhook dedupe, encrypted
provider credentials, and realtime browser updates through an app-local
`RealtimeGateway`. Ship Telegram Business first if sequencing requires it, but
model and display Telegram MTProto Account as an equal connection mode from the
start.

## 6. Domain Boundaries

### Clients

Owns:

- platform client profile snapshots;
- astrologer-client relationships;
- relationship source and status;
- manual client creation;
- birth data;
- private CRM notes;
- client card overview read model composition.

Clients does not own external provider credentials, message delivery attempts,
Telegram webhook parsing, or provider message ids.

### Messaging

Owns:

- channel connections;
- external identities;
- thread identity and client linking;
- messages and message lifecycle;
- outbound command idempotency;
- inbound dedupe;
- delivery attempts;
- read/unread state;
- conversation read models;
- realtime event publication contract.

Messaging does not own order/payment/session transitions. It may display those
events in a client history read model only when their owning domains expose
authoritative data.

### Notifications

Owns one-way transactional notifications: reminders, passwordless auth codes,
booking/payment/session notifications, templates, preferences, and delivery
logs. It may host delivery processors for Messaging provider jobs when that is
operationally simpler, but conversation state remains in Messaging.

### AI

Owns future draft generation only after explicit consent and purpose records.
AI receives minimized context and returns an editable draft. It cannot send or
schedule external messages.

## 7. Data Model

### `messaging_channel_connections`

Stores one connected external account or channel mode.

Fields:

- `id`
- `astrologer_user_id`
- `provider`: `telegram`, future `instagram`
- `mode`: `telegram_business_bot`, `telegram_mtproto_account`, future
  `instagram_graph`
- `status`: `connecting`, `active`, `paused`, `revoked`, `reauth_required`,
  `error`
- `external_account_id`
- `display_name_snapshot`
- `username_snapshot`
- `capabilities`: JSON object with booleans such as `canSend`,
  `canReceive`, `canRead`, `supportsHistoryImport`, `supportsMessageEdits`,
  `supportsMessageDeletes`, `supportsAttachments`
- `consent_record_id`
- `connected_at`
- `last_synced_at`
- `last_error_code`
- `last_error_message`
- `created_at`
- `updated_at`

Indexes:

- `(astrologer_user_id, provider, mode, status)`
- unique active external identity per provider account where provider supports a
  stable account id.

### `telegram_business_connections`

Fields:

- `channel_connection_id`
- `business_connection_id`
- `telegram_user_id`
- `telegram_user_chat_id`
- `dc_id`
- `rights`
- `is_enabled`
- `last_connection_update_at`

Constraints:

- unique `business_connection_id`
- one active `telegram_business_bot` connection per astrologer unless Telegram
  changes the one-business-bot provider limitation and the product approves
  multiple connected business accounts.

### `telegram_mtproto_sessions`

Fields:

- `channel_connection_id`
- `session_ciphertext`
- `session_ciphertext_key_id`
- `phone_number_ciphertext`
- `phone_last4`
- `telegram_user_id`
- `dc_id`
- `auth_key_fingerprint`
- `pts`
- `qts`
- `date_cursor`
- `seq`
- `login_state`: `phone_required`, `code_required`, `password_required`,
  `authorized`, `reauth_required`, `revoked`, `error`
- `last_authorized_at`
- `last_listener_heartbeat_at`

Security rules:

- Store the MTProto session encrypted with authenticated encryption.
- Store no plaintext phone number.
- Store no Telegram 2FA password.
- Treat session ciphertext as high-sensitivity credential material.

### `messaging_external_identities`

Fields:

- `id`
- `channel_connection_id`
- `provider`
- `provider_user_id`
- `provider_chat_id`
- `username_snapshot`
- `display_name_snapshot`
- `avatar_media_id`
- `linked_client_user_id`
- `link_status`: `unlinked`, `suggested`, `linked`, `ignored`
- `first_seen_at`
- `last_seen_at`

Constraints:

- unique `(channel_connection_id, provider_chat_id)`
- linked client must belong to the same astrologer relationship.

### `messaging_threads`

Fields:

- `id`
- `astrologer_user_id`
- `client_user_id`
- `status`: `open`, `archived`, `blocked`
- `last_message_id`
- `last_message_at`
- `unread_count`
- `created_at`
- `updated_at`

Indexes:

- `(astrologer_user_id, status, last_message_at desc)`
- `(astrologer_user_id, client_user_id)`

### `messaging_thread_identities`

Maps one thread to one or more provider identities.

Fields:

- `thread_id`
- `external_identity_id`
- `is_primary`
- `created_at`

Constraints:

- unique `(thread_id, external_identity_id)`
- one primary identity per thread per provider.

### `messages`

Fields:

- `id`
- `thread_id`
- `channel_connection_id`
- `external_identity_id`
- `direction`: `inbound`, `outbound`
- `sender_kind`: `client`, `astrologer`, `system`
- `provider_message_id`
- `provider_update_id`
- `provider_sent_at`
- `content_type`: `text`, `image`, `file`, `voice`, `unsupported`
- `text_ciphertext` or `text`
- `media_asset_id`
- `status`: `received`, `queued`, `sending`, `sent`, `delivered`, `read`,
  `failed`, `unknown`, `deleted`
- `failure_code`
- `idempotency_key`
- `created_at`
- `updated_at`

Constraints:

- unique inbound provider dedupe key:
  `(channel_connection_id, provider_message_id, direction)` where
  `provider_message_id is not null`
- unique outbound idempotency key:
  `(thread_id, idempotency_key)` where `direction = 'outbound'`

### `message_delivery_attempts`

Fields:

- `id`
- `message_id`
- `attempt_number`
- `provider`
- `provider_request_id`
- `provider_response_message_id`
- `provider_status_code`
- `status`: `sent`, `failed`, `unknown`
- `retryable`
- `error_code`
- `error_message`
- `attempted_at`

### `client_notes`

Fields:

- `id`
- `astrologer_user_id`
- `client_user_id`
- `body`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `deleted_at`

Notes are private to the astrologer workspace. They are not provider messages
and are not shown to clients.

## 8. API Surface

### Astrologer CRM

Authenticated routes in `apps/astrologer-api/src/modules/clients`:

- `GET /clients`
- `POST /clients`
- `GET /clients/:clientUserId`
- `PUT /clients/:clientUserId/birth-data`
- `GET /clients/:clientUserId/notes`
- `POST /clients/:clientUserId/notes`
- `PUT /clients/:clientUserId/notes/:noteId`
- `DELETE /clients/:clientUserId/notes/:noteId`

Mutations require CSRF. Manual client creation and note mutation require
idempotency where replaying a browser action could duplicate a durable object.

### Astrologer Messaging

Authenticated routes in `apps/astrologer-api/src/modules/messaging`:

- `GET /messaging/channel-connections`
- `POST /messaging/channel-connections/telegram/business/start`
- `POST /messaging/channel-connections/telegram/mtproto/start`
- `POST /messaging/channel-connections/telegram/mtproto/code`
- `POST /messaging/channel-connections/telegram/mtproto/password`
- `POST /messaging/channel-connections/:connectionId/disconnect`
- `GET /messaging/threads`
- `GET /messaging/threads/:threadId`
- `POST /messaging/threads/:threadId/messages`
- `POST /messaging/threads/:threadId/link-client`
- `POST /messaging/threads/:threadId/create-client`
- `POST /messaging/threads/:threadId/read`
- `GET /messaging/events`

Rules:

- Browser mutations require CSRF.
- Message send, link-client, create-client, disconnect and MTProto login-step
  mutations require an `Idempotency-Key` where duplicate submission can create
  durable side effects.
- `GET /messaging/events` is an authenticated SSE endpoint using the existing
  session cookie model and owner-scoped event filtering.
- The response DTOs expose provider capability and message state, not raw
  provider tokens, session strings, Bot API responses, or MTProto internals.

### Provider Webhooks

Webhook routes are not browser routes:

- `POST /messaging/webhooks/telegram/bot`
- `GET /messaging/webhooks/meta/instagram`
- `POST /messaging/webhooks/meta/instagram`

Rules:

- No browser session is required.
- No CSRF is required.
- Every webhook must validate provider secret/signature before parsing business
  behavior.
- Telegram webhook must validate the bot webhook secret token.
- Meta webhook must validate the raw request body against
  `X-Hub-Signature-256`.
- Webhook controllers return quickly after durable write/dedupe and do not call
  external providers synchronously.

## 9. Telegram Business / Secretary Bot Flow

1. Astrologer opens channel settings in ElevenHouse.
2. Astrologer selects "Telegram Business / Secretary bot".
3. ElevenHouse creates a `messaging_channel_connections` row with
   `status = 'connecting'` and an opaque connect nonce.
4. ElevenHouse opens the Telegram connection flow for the configured bot.
5. Astrologer confirms the connection and rights inside Telegram.
6. Telegram sends a business connection update to the ElevenHouse bot webhook.
7. ElevenHouse validates the webhook, matches the connection, stores
   `business_connection_id`, Telegram user snapshot and rights.
8. Connection becomes `active` if required read/reply rights are present.
9. Incoming `business_message` updates create or update external identities,
   threads and inbound messages.
10. Astrologer replies in ElevenHouse.
11. API creates an outbound `message(status = queued)` plus outbox event.
12. Worker sends through Bot API using `business_connection_id`.
13. Provider response updates delivery attempts and message status.
14. SSE notifies the browser about new messages and status changes.

Failure states:

- Rights missing: connection stays `error` with actionable missing capability.
- Business connection disabled: connection becomes `revoked` or `paused`.
- Provider rejects `business_connection_id`: mark connection `reauth_required`
  or `revoked` based on error classification.
- One-business-bot conflict: show provider limitation and do not create fake
  active state.

History import:

- Capability defaults to `supportsHistoryImport = false` unless a bounded
  Telegram spike proves a supported history path for business connections.
- Business mode reliably imports messages received after connection.

## 10. Telegram MTProto Account Flow

1. Astrologer selects "Telegram Account".
2. ElevenHouse displays a high-trust consent screen explaining that this logs
   ElevenHouse in as another Telegram client for the astrologer's account.
3. Astrologer enters phone number.
4. Backend/worker starts MTProto authorization with ElevenHouse `api_id` and
   `api_hash`.
5. Telegram sends a code through the provider-selected delivery method.
6. Astrologer enters the code in ElevenHouse.
7. If required, astrologer enters the Telegram 2FA password.
8. ElevenHouse completes authorization and stores the encrypted MTProto session.
9. A listener worker starts or resumes the session using per-connection lease.
10. Incoming updates are normalized into external identities, threads and
    messages.
11. Outbound replies are sent by the MTProto adapter as the user account.
12. MTProto cursors are persisted after successful update processing.
13. SSE notifies the browser about new messages and status changes.

Security rules:

- Do not store Telegram 2FA password.
- Do not log phone number, code, 2FA password, session string, auth key or raw
  message text.
- Store session ciphertext with authenticated encryption and key id.
- Provide explicit disconnect that revokes local session use and stops listener
  processing.
- Treat repeated auth failures as `reauth_required`, not as silent retry loops.

History import:

- Capability defaults to `supportsHistoryImport = true`.
- The first implementation may cap import by date or message count for
  operational safety, but the product language should be "import available
  history" rather than "from connection only".
- Import must run as an idempotent background job with per-chat cursors and
  provider-message dedupe.

## 11. Instagram Future Adapter

Instagram is not implemented in the first Telegram slice, but the Messaging
model reserves:

- provider enum value `instagram`;
- mode enum value `instagram_graph`;
- webhook signature validation path;
- OAuth/token storage shape for future Meta credentials;
- external identity mapping by Instagram scoped user id / conversation id;
- message capability map, because Meta permissions and account type determine
  what can be received or sent.

Instagram implementation requires a separate research spike covering:

- Instagram Professional account requirements;
- required Meta permissions and App Review;
- webhook subscribed fields;
- send-message window and policy constraints;
- media attachment limits;
- test account/reviewer workflow;
- token refresh/revocation behavior.

## 12. Reliability Model

### Inbound

- Validate provider authenticity before processing.
- Store provider update id and provider message id.
- Deduplicate every inbound event with a unique provider key.
- Insert or update external identity, thread and message in one transaction.
- Store unsupported messages as `content_type = 'unsupported'` with safe
  metadata instead of dropping them silently.
- Acknowledge provider webhook only after durable persistence or known duplicate.
- Emit internal realtime event only after commit.

### Outbound

- Browser sends message through HTTP command with CSRF and `Idempotency-Key`.
- API validates owner-scoped thread and active channel connection.
- API creates `message(status = 'queued')` and an outbox event in one
  transaction.
- Outbox relay publishes BullMQ job with deterministic job id.
- Queue payload contains only identifiers, never message body or secrets.
- Worker reloads authoritative message, thread, connection and secret material
  from DB.
- Worker writes each delivery attempt.
- Provider success marks message `sent` and stores provider message id.
- Provider retryable failure throws to BullMQ until max attempts.
- Final provider failure marks message `failed` with safe code and UI action.
- Ambiguous network timeout marks message `unknown` after bounded retries and
  schedules reconciliation when the provider mode can reconcile.

### Reconciliation

Reconciliation jobs detect:

- messages stuck in `sending`;
- messages stuck in `unknown`;
- channel connections with stale listener heartbeat;
- Telegram business rights changes;
- MTProto sessions requiring reauth.

Reconciliation never creates a second outbound message for the same logical
idempotency key.

## 13. Realtime Model

Realtime is required for the first complete Inbox release.

### Transport

Use SSE first behind `RealtimeGateway`:

- `GET /messaging/events` authenticates the astrologer session.
- Events are owner-scoped by `astrologer_user_id`.
- Each event has a monotonic `event_id`.
- Browser sends `Last-Event-ID` on reconnect.
- Server replays missed events from a bounded durable event table or event log.
- The client refetches affected thread/message queries after receiving events.

Event types:

- `thread.created`
- `thread.updated`
- `message.received`
- `message.updated`
- `message.deleted`
- `channelConnection.updated`
- `identity.linked`
- `delivery.failed`

Why SSE first:

- The product needs server-to-browser freshness, not bidirectional socket
  commands.
- Existing browser auth and HTTP infrastructure remain simpler.
- Mutations keep CSRF, idempotency and audit semantics in normal HTTP.
- It reduces the first realtime operational surface while preserving the future
  WebSocket upgrade path.

WebSocket extraction point:

- Keep `RealtimeGateway.publish(event)` as a port.
- Keep browser subscription behind a frontend realtime client module.
- Add WebSocket later when typing indicators, collaborative presence, or
  bidirectional low-latency app commands become approved product scope.

Operational constraints:

- Deploy behind HTTP/2 or verify SSE connection behavior under the production
  proxy before launch.
- Limit one active SSE stream per browser tab.
- Send heartbeat comments to keep proxies from closing idle connections.
- Do not use SSE as the source of truth. It is a freshness transport over
  durable PostgreSQL state.

## 14. Security, Privacy, Consent And Abuse Controls

- Channel connection requires explicit astrologer consent per mode.
- Consent text for MTProto must be stronger than Business bot consent because
  MTProto authorizes ElevenHouse as an account client.
- Store credentials encrypted with authenticated encryption.
- Expose no secrets to frontend.
- Redact message body from logs.
- Keep raw provider envelopes minimal and short-lived if stored.
- Do not send Telegram content to AI unless a future explicit consent and
  purpose boundary is approved.
- Rate-limit webhook endpoints and connection/login attempts.
- Detect repeated invalid Telegram code/password attempts.
- Provide disconnect and pause actions.
- Make provider revocation observable in UI.
- Link external identities to CRM clients only by explicit astrologer action,
  except future suggestion-only matching.
- Never merge external identities silently.
- Never allow one astrologer to access another astrologer's connection, thread,
  external identity, message, note or client.

## 15. Frontend Surfaces

### `/clients`

Production route in `apps/astrologer-web`.

Visible states:

- list loading, empty, error, search, segmented filters;
- manual add client modal;
- master-detail client card;
- overview tab;
- history tab populated only by authoritative modules;
- notes tab with private CRM notes;
- conversation tab showing linked threads and channel badges;
- unlinked external identity link/create actions when opened from Inbox;
- mobile responsive CRM state matching `mobile-crm.jsx`.

No mock LTV, orders, history, or messages. Missing owning domains render empty
or unavailable states.

### `/inbox`

Production route in `apps/astrologer-web`.

Visible states:

- connection setup empty state;
- two Telegram connection cards;
- channel connected/paused/error/reauth states;
- thread list with channel badges and unread counts;
- unlinked chat state;
- link existing client;
- create manual client from chat;
- message composer;
- queued/sending/sent/failed/unknown delivery states;
- retry failed message;
- realtime inbound message update;
- mobile responsive inbox state matching `mobile-inbox.jsx`.

The UI may show both Telegram modes before both are shipped, but it must label
unimplemented mode truthfully as not yet available in the current release. It
must not present MTProto as unsafe, unofficial, or a fallback.

## 16. Implementation Slices

### Slice 0: Architecture Record

- Save this architecture design.
- Add or update ADR for Messaging channel architecture if implementation begins.
- Confirm production proxy capabilities for SSE over HTTP/2 before Inbox launch.

### Slice 1: Messaging Foundation

- Add shared contracts for channel connections, external identities, threads,
  messages, delivery attempts and realtime events.
- Add domain use cases and ports.
- Add Drizzle schema and adapters.
- Add authenticated `astrologer-api` Messaging module for read models and
  local commands.
- Add tests for owner scoping, idempotent send creation, inbound dedupe and
  link/create-client behavior.

### Slice 2: Clients CRM Foundation

- Add `/clients` route and production page shell.
- Implement manual client creation.
- Implement private notes.
- Compose overview/history/messages from real server read models.
- Preserve design visual language from `crm.jsx`, `crm-card.jsx`,
  `crm-data.jsx`, and `mobile-crm.jsx`.

### Slice 3: Realtime Foundation

- Add `GET /messaging/events` SSE endpoint.
- Add durable realtime event table or bounded event log.
- Emit events after committed message/thread/connection changes.
- Add frontend realtime client that invalidates exact React Query keys.
- Verify reconnect with `Last-Event-ID`.

### Slice 4: Telegram Business / Secretary Bot

- Add Telegram bot webhook route.
- Add business connection persistence and rights handling.
- Add inbound business message normalization.
- Add outbound Bot API adapter using `business_connection_id`.
- Add connection error/rights/revocation UI.
- Verify with Telegram test or bounded provider spike before production claim.

### Slice 5: Inbox Production UI

- Add `/inbox` route.
- Add connection modal/cards.
- Add thread list, message view, composer, link/create-client flows, retry
  states and realtime updates.
- Match `inbox.jsx`, `inbox-data.jsx`, `notifications.jsx`,
  `mobile-inbox.jsx` visual states while using production state.

### Slice 6: Telegram MTProto Account

- Add MTProto login state machine.
- Add encrypted session storage.
- Add listener worker with per-connection lease and cursor persistence.
- Add history import job with dedupe and bounded operational caps.
- Add outbound MTProto adapter.
- Add disconnect/reauth states.

### Slice 7: Instagram Spike And Adapter

- Research Meta permissions/App Review.
- Add Instagram webhook validation and connection model.
- Add provider adapter when product approves exact rollout.

## 17. Testing And Acceptance

Automated:

- contract schema tests for every DTO;
- domain tests for send idempotency, inbound dedupe, link/create-client,
  capability gates and status transitions;
- DB adapter tests for uniqueness, owner scoping, relationship checks,
  encrypted secret metadata and thread read models;
- API e2e tests for CSRF, idempotency, authenticated owner scoping, webhook
  auth, webhook duplicate replay and safe error codes;
- worker tests for retryable/final provider failures and ambiguous timeout;
- frontend model tests for message status transitions, realtime invalidation and
  link/create-client flows.

Runtime:

- local webhook fixture replay;
- Telegram Business provider spike with real business connection update;
- MTProto provider spike with test account before production release;
- SSE reconnect and missed-event replay;
- no message text or credentials in logs.

Visual/browser:

- `/clients` desktop and mobile against exact design reference states;
- `/inbox` desktop and mobile against exact design reference states;
- loading, empty, connected, unlinked, sending, failed, revoked and reauth
  states;
- keyboard/focus checks for modals, thread list, composer and link/create
  flows;
- console and network checks on real authenticated routes.

## 18. Open Follow-Up Decisions

These do not block architecture approval, but they must be resolved before the
corresponding implementation slice:

- Exact default retention duration before legal policy is formalized. Current
  product direction: retain CRM message history until explicit deletion or a
  future legal retention workflow changes it.
- Exact history import cap for MTProto first release, such as all available
  messages, last N messages per chat, or messages since a selected date.
- Whether Telegram Business mode should be hidden until connected bot setup is
  fully ready in BotFather, or visible with a preflight checklist.
- Whether first Inbox release includes attachments or text-only messages.
- Whether realtime deployment requires proxy changes for HTTP/2 before launch.

## 19. Rejected Alternatives

- Browser-local inbox state: rejected because design inventory explicitly
  requires provider-backed channels and no browser storage persistence.
- Controller-side provider sends: rejected because repository ADR requires
  async provider delivery through outbox and worker contours.
- Telegram platform bot only: rejected because it breaks the personal-brand
  requirement.
- MTProto hidden behind support flag only: rejected because the approved product
  direction gives astrologers a real choice.
- Polling-only first complete Inbox release: rejected because the user approved
  realtime from the start for a normal messaging UX.
- WebSocket as first mutation transport: rejected because it weakens the already
  established HTTP mutation, CSRF, idempotency and audit model without a first
  slice requirement for bidirectional socket commands.
