# WhatsApp Provider Production Design

Date: 2026-08-18
Status: planned; awaiting implementation
Production surface: astrologer Inbox and channel settings
Primary module: `apps/astrologer-api/src/modules/messaging`

## Outcome

ElevenHouse lets an astrologer connect an existing WhatsApp Business app
account and phone number through Meta Embedded Signup Coexistence. Messages sent
by WhatsApp users to that business number appear in ElevenHouse Inbox, messages
sent from ElevenHouse are delivered through WhatsApp Cloud API, delivery/read
status is reconciled, and messages the astrologer sends from WhatsApp Business
app or supported companion devices are mirrored into the same thread.

This is not a prototype or minimal demo. The first release is a production
provider contour with durable state, security boundaries, observable failure
states, retry-safe webhook handling, encrypted tokens and tested rollout gates.

## Approved Direction

- Add WhatsApp to the existing Messaging bounded context, not a new service.
- Use Meta Embedded Signup with WhatsApp Business app onboarding
  ("Coexistence") as the first supported product path.
- Treat PostgreSQL Messaging state as source of truth. Meta webhooks and Cloud
  API responses are provider evidence, not product authority by themselves.
- Process provider writes through existing durable DB and outbox/worker
  boundaries. Controllers validate and orchestrate; they do not call provider
  delivery adapters directly.
- Store WhatsApp access tokens encrypted with provider-specific AAD.
- Keep the Graph API base URL/version configurable. The default may track the
  currently verified version, but code must not hardcode a version in call
  sites.

## Product Scope

### Included

- Astrologer starts WhatsApp connection from the authenticated astrologer app.
- Backend creates a short-lived signed pending connection state bound to the
  authenticated astrologer and connection id.
- Frontend launches Meta Embedded Signup for Coexistence and sends the returned
  exchangeable token code plus session event data to the backend immediately.
- Backend exchanges the code server-to-server within the 30-second token-code
  window.
- Backend resolves the customer's WABA and business phone number through Graph
  API. `phone_number_id` from the browser is accepted as evidence but is not
  required or trusted as the only source.
- Backend verifies Coexistence readiness with Graph fields such as
  `is_on_biz_app` and `platform_type` for the resolved phone number.
- Backend subscribes the app to the customer's WABA webhooks with the customer's
  business token.
- Webhook endpoint supports Meta verification GET and signed POST.
- Webhook POST verification uses `X-Hub-Signature-256` HMAC-SHA256 over raw
  request body with the Meta app secret.
- Webhook payloads are persisted/deduped before `200 OK` when processing can be
  large, slow or lossy, especially `history` and `smb_app_state_sync`.
- Inbound `messages` create/update threads and messages in Inbox.
- `statuses` update outbound message status.
- `smb_message_echoes` mirror messages sent by the astrologer from WhatsApp
  Business app or supported companion devices.
- `account_update` handles `PARTNER_REMOVED`, `ACCOUNT_OFFBOARDED` and
  `ACCOUNT_RECONNECTED`.
- `history` import is a durable onboarding sub-flow with progress and failure
  states. It must not be best-effort hidden work.
- `smb_app_state_sync` is captured as provider contact-sync evidence and used
  only where product-approved CRM linking rules allow it.
- Outbound text replies from ElevenHouse use WhatsApp Cloud API
  `/<PHONE_NUMBER_ID>/messages` via notification-worker provider adapter.
- UI blocks or clearly explains free-form replies when WhatsApp rejects them
  because the customer service window is closed. Messages must not sit forever
  in queued state without an observable provider failure.
- RU/EN copy is supported for visible connection, sync and error states.

### Excluded From First Production Release

- Marketing campaigns, bulk sends, broadcast lists and promotional automation.
- Template management UI and business-initiated template sends outside the
  customer service window.
- WhatsApp Flows, catalogs, orders, payments and commerce messages.
- Group chats.
- Voice/video WhatsApp calls.
- Admin/moderator operations around WhatsApp accounts.
- Discovery, cross-promo or directory behavior.

The exclusions must be represented as unavailable capabilities or explicit
errors. They must not appear as clickable no-ops.

## Meta Prerequisites

The Meta application must be configured outside the codebase before production
acceptance can pass:

- Business app type with WhatsApp product enabled.
- Facebook Login for Business configuration using WhatsApp Embedded Signup.
- Coexistence / WhatsApp Business app onboarding enabled for the configuration.
- Required permissions selected for the configuration:
  `whatsapp_business_management` and `whatsapp_business_messaging`. Request
  `business_management` only if required by the selected partner flow or credit
  line operations.
- App Review Advanced Access for the permissions used to serve other
  businesses.
- Valid HTTPS domains for the hosted astrologer app.
- Facebook Login for Business settings: Client OAuth login, Web OAuth login,
  Enforce HTTPS, Embedded Browser OAuth Login, Strict Mode for redirect URIs and
  Login with the JavaScript SDK enabled.
- Allowed domains and Valid OAuth redirect URIs include the production
  astrologer host and any approved testing host.
- WhatsApp webhook callback URL:

```text
https://app.elevenhouse.ai/api/messaging/webhooks/whatsapp/cloud
```

- Verify token in Meta Dashboard equals
  `ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN`.
- Webhook fields selected at minimum:
  `messages`, `account_update`, `history`, `smb_app_state_sync`,
  `smb_message_echoes`.

## Repository Evidence

- `astrologer-api` is already mounted behind `app.elevenhouse.ai/api/*` in
  production Caddy: `deployment/caddy/Caddyfile`.
- `MessagingWebhooksController` already owns Telegram and Instagram provider
  webhook boundaries:
  `apps/astrologer-api/src/modules/messaging/messaging-webhooks.controller.ts`.
- `astrologer-api` bootstraps Nest with `{ rawBody: true }`, which supports
  provider HMAC verification:
  `apps/astrologer-api/src/main.ts`.
- Messaging ADR requires controllers to avoid direct provider sends and requires
  durable DB state plus outbox/worker delivery:
  `docs/decisions/0010-messaging-channel-architecture.md`.
- Current Messaging providers are only `telegram` and `instagram`, so WhatsApp
  requires contract/domain/schema expansion:
  `packages/domain/src/messaging/messaging-types.ts` and
  `packages/db/src/schema/messaging/messaging-values.ts`.
- Instagram Graph already provides a close local pattern for OAuth/token
  storage/webhook subscription/delivery:
  `apps/astrologer-api/src/modules/messaging/instagram-graph-auth-provider.ts`,
  `packages/db/src/schema/messaging/instagram-graph-accounts.schema.ts`, and
  `apps/notification-worker/src/instagram-graph-delivery-provider.ts`.

## Architecture

### Routes

External production routes:

```text
GET  https://app.elevenhouse.ai/api/messaging/webhooks/whatsapp/cloud
POST https://app.elevenhouse.ai/api/messaging/webhooks/whatsapp/cloud
POST https://app.elevenhouse.ai/api/messaging/channel-connections/whatsapp/cloud/start
POST https://app.elevenhouse.ai/api/messaging/channel-connections/whatsapp/cloud/complete
```

Internal Nest routes:

```text
GET  /messaging/webhooks/whatsapp/cloud
POST /messaging/webhooks/whatsapp/cloud
POST /messaging/channel-connections/whatsapp/cloud/start
POST /messaging/channel-connections/whatsapp/cloud/complete
```

The start/complete endpoints are authenticated astrologer routes and require
CSRF. The webhook endpoints are CSRF-exempt only because they validate provider
authenticity.

### Provider Identifiers

One `messaging_channel_connections` row represents one WhatsApp business phone
number connected by one astrologer.

- `provider`: `whatsapp`
- `mode`: `whatsapp_cloud`
- `externalAccountId`: WhatsApp business phone number id
- `externalOwnerUserId`: WABA id
- `displayNameSnapshot`: verified/display phone name when available
- `usernameSnapshot`: display phone number when available, stored only when
  needed for user-facing channel identity and log-redacted elsewhere

Provider-specific table:

```text
messaging_whatsapp_cloud_accounts
- id
- channel_connection_id unique references messaging_channel_connections(id)
- waba_id
- business_id nullable
- phone_number_id unique
- display_phone_number nullable
- verified_name nullable
- platform_type nullable
- is_on_biz_app boolean nullable
- access_token_encrypted jsonb not null
- token_scopes jsonb not null default []
- connected_via text not null check in ('embedded_signup_coexistence')
- history_sync_status text not null
- contact_sync_status text not null
- token_issued_at nullable
- token_expires_at nullable
- created_at
- updated_at
```

The access token is opaque and variable length. Code must not parse or assume
token format.

`history_sync_status` and `contact_sync_status` are explicit enums:

```text
not_requested
requested
syncing
completed
declined
failed
partial
```

Meta business integration tokens do not have a refresh-token flow in the
researched docs. Store `token_expires_at` only when Meta returns an expiry. On
revoked, expired, invalid-token or permission Graph errors, move the connection
to `reauth_required` or `revoked` instead of attempting a hidden refresh.

### Pending Connection State

`start` creates or refreshes a connecting channel connection and returns:

```ts
type StartWhatsAppCloudConnectionResponse = {
  readonly channelConnection: MessagingChannelConnectionRead;
  readonly embeddedSignup: {
    readonly appId: string;
    readonly configurationId: string;
    readonly graphApiVersion: string;
    readonly state: string;
  };
};
```

`state` is a signed, short-lived value containing:

- astrologer user id;
- connection id;
- nonce;
- issued-at seconds;
- expiry seconds;
- expected mode `whatsapp_cloud`;
- expected onboarding kind `coexistence`.

`complete` requires the state and the exchangeable code. It rejects expired,
malformed, mismatched or reused state.

For Coexistence, `complete` accepts only the successful Embedded Signup session
event `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. Any other event is stored or
returned as a typed unsuccessful onboarding state and must not activate a
connection.

### Webhook Ingest

All WhatsApp webhook POST requests follow this boundary:

```text
verify enabled/config
-> verify X-Hub-Signature-256 over raw body
-> parse top-level object/entry/change metadata
-> persist webhook event and dedupe key when required
-> process inline only for small idempotent message/status/account updates
-> return 200 after durable capture or completed inline transaction
-> async processor handles large history/contact sync payloads
```

Durable event table:

```text
messaging_provider_webhook_events
- id
- provider
- mode
- event_key unique
- field
- external_account_id nullable
- external_owner_user_id nullable
- payload_ref nullable
- payload_encrypted nullable
- normalized_summary jsonb not null default {}
- received_at
- processing_status
- attempt_count
- last_error_code nullable
- last_error_message nullable
- processed_at nullable
```

Raw provider body storage is not the product model and is not required for live
small events. For `messages`, `statuses`, `account_update` and simple
`smb_message_echoes`, the preferred path is:

```text
verify HMAC -> parse -> write normalized state and event key in one transaction -> 200 OK
```

For `history`, `smb_app_state_sync` and oversized or mixed payloads where
synchronous full normalization would risk timeout or data loss, the system must
durably capture enough data before `200 OK` to process later without asking Meta
to replay. Prefer normalized staging rows. If raw payload capture is needed for
those payload classes, store it encrypted or by private object reference,
redact all logs, and enforce short retention. Do not build a permanent raw
webhook archive.

Event keys are provider-scoped and deterministic:

```text
inbound message:
  whatsapp:message:<phone_number_id>:<message.id>

status:
  whatsapp:status:<phone_number_id>:<status.id>:<status.status>:<status.timestamp>

smb message echo:
  whatsapp:echo:<phone_number_id>:<message.id>:smb_message_echoes

history chunk:
  whatsapp:history-chunk:<waba_id>:<phone_number_id_or_unknown>:<phase>:<chunk_order>

history message:
  whatsapp:history-message:<phone_number_id>:<thread_or_wa_id>:<message.id>:<direction_or_source>

smb app state/contact sync item:
  whatsapp:contact-sync:<phone_number_id>:<contact_wa_id_or_phone>:<action>:<timestamp>

account update:
  whatsapp:account-update:<waba_id>:<phone_number_id_or_none>:<event>:<timestamp_or_reason_hash>
```

If Meta omits `phone_number_id` from a Coexistence/history event, route by WABA
and resolve the phone number from the stored connection or Graph verification
before mutating Inbox state. Missing phone number metadata must put the event
into a typed retry/failure state, not crash the webhook request.

### Supported Webhook Fields

`messages`:

- `value.messages[]` creates inbound messages.
- `value.statuses[]` updates outbound statuses.
- route by `value.metadata.phone_number_id`; verify WABA from `entry.id`.

`smb_message_echoes`:

- create or reconcile outbound messages sent from WhatsApp Business app.
- support text first; other supported content types may be represented as
  `unsupported` with provider metadata until media ingestion is implemented.
- revoke/edit events update message status/content only when the current
  Messaging model can represent them honestly.

`history`:

- captured durably before ack.
- process chunks asynchronously.
- dedupe chunks and messages using the event keys defined above.
- expose sync status and errors on the channel connection.
- imported messages must not increment unread counts as new live inbound
  messages unless product rules explicitly say so.

`smb_app_state_sync`:

- captured durably before ack.
- process asynchronously.
- stores provider contact evidence for future matching; it must not silently
  create CRM clients without user action or approved product rule.

`account_update`:

- `PARTNER_REMOVED`: mark connection `revoked` or `reauth_required` with reason.
- `ACCOUNT_OFFBOARDED`: mark connection `revoked`.
- `ACCOUNT_RECONNECTED`: verify Graph account/phone access before marking active.

Unknown fields are acknowledged only after signature verification and redacted
structured logging. They must not throw a retry storm.

### Outbound Delivery

`notification-worker` adds a WhatsApp Cloud delivery provider. The provider:

- decrypts the customer business token with AAD
  `messaging:whatsapp_cloud:<astrologerUserId>:<channelConnectionId>:access_token`;
- posts JSON to `<GRAPH_API_BASE_URL>/<PHONE_NUMBER_ID>/messages`;
- sends only text service messages in this release;
- records returned WhatsApp message id as provider message id;
- classifies auth/permission/asset loss as `reauth_required` or `revoked`;
- classifies customer service window/template policy failures as final
  non-retryable delivery failures with user-visible code;
- classifies Graph errors by response body `error.code`, `error_subcode` and
  `error_data.details`, not by HTTP status alone;
- retries only transient HTTP/network failures and Graph rate-limit/throughput
  errors.

Initial delivery error categories:

```text
code 190 or permission/removal errors:
  reauth_required, non-retryable for the message

code 131005 or missing permission/body details indicating access loss:
  reauth_required or provider_permission_lost

code 131047:
  final customer_service_window_closed failure; template sending is out of
  first release scope

codes 130429, 80007 and throughput/rate-limit details:
  retryable with backoff

5xx or network timeout:
  retryable with backoff

account integrity/restriction errors such as 131031:
  connection provider_error or reauth_required depending on Graph detail

unknown 4xx:
  non-retryable provider_error with redacted code/detail for support
```

Message delivery success from the send API means accepted by Meta, not delivered
to the recipient. Final delivery/read state comes from `messages.statuses[]`.

## Security And Privacy

- Never log access tokens, exchangeable codes, raw webhook payloads, message
  bodies, phone numbers, WABA tokens, registration PINs or HMAC secrets.
- Structured logs may include provider, field, counts, redacted ids, connection
  id and status codes.
- Token exchange is server-to-server only.
- Webhook HMAC comparison uses constant-time comparison and validates the
  `sha256=` prefix.
- Every external update is deduped. Provider retries are expected for up to
  seven days.
- Frontend-supplied `phone_number_id`, `waba_id` and `business_id` are evidence;
  backend Graph calls determine the final stored binding.
- Browser state is never the source of truth for connection or message state.
- Contact sync data is sensitive. It is not CRM client creation authority.
- Data deletion/deauthorization obligations for the Meta app must be reviewed
  before App Review submission. If WhatsApp requires app-level compliance URLs
  distinct from Instagram, add them in the same provider contour.

## Runtime Config

`astrologer-api`:

```text
ASTROLOGER_API_WHATSAPP_CLOUD_ENABLED
ASTROLOGER_API_WHATSAPP_CLOUD_APP_ID
ASTROLOGER_API_WHATSAPP_CLOUD_APP_SECRET
ASTROLOGER_API_WHATSAPP_CLOUD_CONFIGURATION_ID
ASTROLOGER_API_WHATSAPP_CLOUD_GRAPH_API_BASE_URL
ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN
ASTROLOGER_API_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY
ASTROLOGER_API_WHATSAPP_CLOUD_CALLBACK_STATE_TTL_SECONDS
ASTROLOGER_API_WHATSAPP_CLOUD_HISTORY_SYNC_ENABLED
```

`notification-worker`:

```text
NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED
NOTIFICATION_WORKER_WHATSAPP_CLOUD_GRAPH_API_BASE_URL
NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY
```

The Graph API base URL default should be updated only after a verified Meta
version check. As of the research date, Meta lists Graph API v26.0 as latest.

## User Experience

Connection card states:

- unavailable: provider disabled or Meta configuration missing;
- not connected;
- connecting: Embedded Signup started, pending completion;
- connected: active phone number, sync state visible;
- syncing history;
- sync warning: history declined, partial, failed or retrying;
- reauth required;
- revoked/offboarded;
- provider error.

Inbox states:

- WhatsApp channel badge and display phone number where permitted.
- Threads show WhatsApp user display name from webhook contact profile when
  available.
- If free-form reply is rejected because customer service window is closed,
  show final failed state and explanatory copy. Do not leave the message in
  queued state.
- Messages mirrored from WhatsApp Business app are displayed as astrologer
  outbound messages with normal provenance, not as inbound client messages.

## Verification Requirements

Automated:

- contract schema tests for WhatsApp connection responses and webhook payloads;
- domain tests for state/nonce, connection lifecycle, 24-hour policy failures,
  dedupe and account update transitions;
- DB integration tests for new check constraints, token row uniqueness,
  webhook event dedupe, history chunk idempotency and outbound status
  reconciliation;
- API e2e tests for start/complete, webhook GET verify, invalid HMAC, valid HMAC
  and CSRF/auth boundaries;
- notification-worker provider tests for success, retryable failure,
  non-retryable policy failure and token decryption failure;
- frontend tests for connection states and failed reply state.

Runtime:

- local webhook replay with signed fixtures;
- local worker delivery using a fake Graph server;
- browser flow through astrologer channel settings and Inbox;
- production Meta canary with a test WhatsApp Business app account once external
  app configuration and App Review state allow it.

Repository:

- route inventory and API boundaries updated;
- env examples and production preflight updated;
- `git diff --check`;
- targeted typecheck/test gates for contracts, domain, db, astrologer-api,
  notification-worker and astrologer-web;
- broad `pnpm verify` when implementation touches shared contracts/domain/db.

## Research

Question: How should ElevenHouse support astrologer-owned existing WhatsApp
Business accounts as a production messaging provider?
Decision affected: provider architecture, onboarding flow, webhook security,
delivery worker, DB model and UI state.
Accessed: 2026-08-18.

### Sources

- Meta Embedded Signup overview:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview
- Meta Embedded Signup implementation:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
- Meta Tech Provider onboarding:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
- Meta WhatsApp Business app user onboarding / Coexistence:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Meta webhook endpoint setup:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/
- Meta messages webhook reference:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages
- Meta send messages:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Meta access tokens guide:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/
- Meta `smb_message_echoes` reference:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes
- Meta `history` reference:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history
- Meta WhatsApp App Review:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review
- Meta Graph API changelog:
  https://developers.facebook.com/docs/graph-api/changelog/

### Findings

- Sourced fact: Embedded Signup returns an exchangeable token code and asset
  identifiers to the spawning window; the token code must be exchanged quickly
  server-side.
- Sourced fact: Coexistence allows existing WhatsApp Business app phone numbers
  to connect to Cloud API while the business can keep using WhatsApp Business
  app.
- Sourced fact: Coexistence setup requires webhook support for `history`,
  `smb_app_state_sync` and `smb_message_echoes` in addition to normal fields.
- Sourced fact: Coexistence session event examples can include only WABA id, so
  backend Graph resolution is required for reliable phone number binding.
- Sourced fact: Meta webhook POST validation uses `X-Hub-Signature-256` HMAC
  with the app secret and raw payload.
- Sourced fact: Meta retries failed webhook delivery for up to seven days and
  historical webhook data cannot be fetched later.
- Repository evidence: existing Messaging architecture already supports
  provider webhooks, encrypted Instagram tokens, inbound dedupe and
  worker-based outbound delivery.
- Inference: Coexistence must be first release scope because the user goal is
  existing astrologer WhatsApp Business app accounts, not new ElevenHouse-owned
  or newly registered numbers.

## Open External Blockers

- Meta app must have Embedded Signup Coexistence enabled for Tech Provider or
  Solution Partner path.
- Meta App Review / Advanced Access must allow the required permissions for
  other businesses.
- A real test WhatsApp Business app account and phone number are required for
  final provider canary.

These are external provider gates. They do not block local implementation and
automated verification, but they block a final production acceptance claim.
