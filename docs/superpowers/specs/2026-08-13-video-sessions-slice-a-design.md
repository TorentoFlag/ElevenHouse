# Video Sessions Slice A Design

Date: 2026-08-13  
Status: implementation partial; live provider and browser acceptance pending  
Visual reference: `ElevenHouseDesign/app/session-call.jsx` reached through
`Calendar -> Marina K. -> Войти в сессию`  
Production surfaces: astrologer `/calendar` and `/sessions/:sessionId`; client
`/me` consultations and `/sessions/:sessionId`

## Outcome

Deliver the first production video-consultation contour for one astrologer and
one already-related client. A confirmed video booking exposes an honest join
action to both participants. Each participant completes a pre-join device check,
joins the same LiveKit room, can exchange durable text messages, can recover
from a transient network loss and sees an accessible responsive interface that
matches the approved ElevenHouse reference language.

This slice establishes a provider-neutral Sessions domain and a cross-platform
API for web now and native Swift/Kotlin later. LiveKit Cloud is the first media
adapter. Provider identities, tokens, webhooks and room state do not become
product authority.

The call is explicitly **not recorded**. Recording, transcription and AI
summary are neither hidden nor represented by disabled or simulated controls.

## Approved Decisions

- Use a separate `Sessions` bounded context rather than extending external
  Messaging or hiding the workflow inside Booking controllers.
- Use LiveKit Cloud through a provider-neutral port for the first adapter.
- Support only one astrologer and the booking's one client in Slice A.
- Support authenticated web entry from both applications and keep contracts
  compatible with the existing native bearer-session policy.
- Keep Booking and Session lifecycles separate. Ending a call does not complete
  the booking.
- Persist text chat in ElevenHouse and use a session-scoped realtime event log.
  LiveKit data channels are not durable chat authority.
- Use normal encrypted WebRTC transport in Slice A. Application-managed E2EE is
  deferred until its key distribution, recording and recovery consequences are
  designed together.
- Do not request or persist a recording consent in Slice A because no recording
  purpose exists in this contour.

## Scope

### Included

- an idempotently provisioned Session for every confirmed `video` booking;
- lifecycle projection from booking confirmation, reschedule and cancellation;
- astrologer join action in the current calendar booking detail;
- upcoming/active/recent consultation list in the client's `/me` consultations
  section;
- dedicated protected `/sessions/:sessionId` route in both web applications;
- pre-join camera/microphone preview and input/output device selection where the
  browser exposes those devices;
- typed states for permission denial, missing devices and provider/config
  unavailability;
- waiting for the other participant;
- remote video/audio, local picture-in-picture and connection-quality state;
- microphone mute/unmute, camera on/off, device switching and real screen share;
- durable text chat with ordered replay and idempotent sends;
- reconnect and post-refresh recovery;
- astrologer-controlled end-for-everyone and participant-local leave;
- provider webhook validation, deduplication and lifecycle evidence;
- responsive desktop/mobile web behavior, RU/EN copy, UTC persistence and
  user-timezone presentation;
- observability for join failures, provider callbacks, reconnects and call
  quality without sensitive media or token logging;
- one shared HTTP contract usable by future Swift and Kotlin clients.

### Explicitly excluded

- recording, recording consent, egress, playback and recording retention;
- transcription, captions, meeting notes and AI summary;
- chat attachments, images, documents, voice notes, reactions, typing indicators,
  message editing, deletion and read receipts;
- sharing the client's chart or any other ElevenHouse material inside the call;
- group calls, observers, assistants, team members or admin join capability;
- public or guest links, dial-in, phone calls, SIP and waiting-room admission by
  an unbound host;
- background blur, virtual backgrounds and noise-cancellation add-ons;
- push notifications, CallKit, Android Telecom integration or native UI
  implementation;
- self-hosted LiveKit infrastructure;
- automatic Booking completion, no-show, refund, payout, review or notification
  transitions;
- legal copy or a new consent purpose.

## Product Rules

### Eligibility and relationship

A Session belongs to exactly one Booking. The booking is eligible only when all
of the following are true:

1. its delivery format snapshot is `video`;
2. its state is `confirmed` when the first participant starts the Session;
3. the caller is either `booking.ownerUserId` acting as astrologer or
   `booking.clientUserId` acting as client;
4. the client-astrologer relationship has not become blocked;
5. the Session has not ended or expired.

After the Session becomes `active`, a later explicit Booking completion does
not invalidate reconnect credentials. Cancellation or relationship blocking
still revokes future credentials. This preserves the accepted separation
between Booking fulfillment and media connection lifecycle.

Role selection in a frontend is never authorization. One account may own both
roles, but the join endpoint derives the participant role from the authenticated
surface and booking ownership. It never accepts an astrologer/client role,
participant identity, provider room name or grants from the request body.

### Join window

- The join action becomes enabled ten minutes before `serviceStartAt`.
- Before that time the UI shows the scheduled local date/time and a disabled
  countdown state; the backend returns `SESSION_TOO_EARLY` with `joinableAt`.
- If nobody ever joins, the Session expires thirty minutes after
  `serviceEndAt` and cannot be reopened.
- Once at least one participant has joined, scheduled end time does not forcibly
  disconnect an ongoing consultation.
- If both participants are absent for fifteen consecutive minutes after a
  Session has started, an idempotent inactivity finalizer ends it with reason
  `participants_absent`. Rejoining during the grace window cancels the pending
  finalization.
- Browser refresh, a transient network loss or closing one participant's tab
  does not end the Session for the other participant.

All comparisons use UTC instants from server time. The frontend displays the
booking timezone but does not calculate authority windows.

### Ending

- The client `Leave` action disconnects only the client.
- The astrologer `Завершить` action requires confirmation and ends the Session
  for both participants through an idempotent server command.
- Provider participant disconnect events update presence evidence but do not
  by themselves complete the Session.
- A Session end never mutates Booking. The existing explicit Booking completion
  or no-show workflow remains authoritative.
- Ended and expired Sessions expose immutable metadata and read-only text chat;
  no new credentials or messages may be issued.

## Session Lifecycle

The durable state machine is intentionally smaller than the client connection
state machine.

```text
scheduled -- first verified participant joins --> active
scheduled -- booking cancelled ----------------> cancelled
scheduled -- no join by end + 30 min ----------> expired
active ---- astrologer ends -------------------> ended
active ---- both absent for 15 min ------------> ended
```

Terminal states are `cancelled`, `expired` and `ended`. A Booking reschedule
updates the Session schedule while it is `scheduled`; it is rejected as a
Session projection conflict after the Session becomes `active` or terminal.
That conflict is observable and must not silently rewrite an active room.

End reasons are `astrologer_ended` and `participants_absent`. Cancellation and
expiry are distinct terminal states rather than end reasons.

Client connection state is ephemeral and may be:

- `prejoin`;
- `requesting_permissions`;
- `ready`;
- `connecting`;
- `waiting_for_participant`;
- `connected`;
- `reconnecting`;
- `participant_left`;
- `leaving`;
- `ended`;
- `failed`.

The frontend derives these states from the validated Session projection and the
provider client SDK. It does not persist its own business lifecycle.

## Provisioning From Booking

Sessions consumes the existing immutable Booking lifecycle event contour.

- `confirmed`: create one `scheduled` Session only for `deliveryFormat=video`;
- `rescheduled`: update the scheduled UTC range and timezone only while the
  Session remains `scheduled`;
- `cancelled`: mark a scheduled Session `cancelled` and revoke future joins;
- `completed`: record no Session transition.

The consumer is idempotent by lifecycle event ID and the database enforces one
Session per Booking. The forward migration provisions Sessions for already
confirmed video bookings so rollout does not depend on a new event being
emitted. Runtime provisioning and migration backfill produce the same
invariants.

Provisioning creates only ElevenHouse state. LiveKit rooms are created by the
provider when the first authorized participant connects; an empty scheduled
Session consumes no media room.

## User Experience

### Astrologer entry

The existing `BookingDetailPanel` gains a Session block only for a confirmed
video booking. It shows one of:

- join time and disabled action before the window;
- `Войти в сессию` during the join window;
- `Вернуться в сессию` while active;
- a preparation/retry state if the projection consumer has not yet provisioned
  the Session;
- terminal copy for cancelled, expired or ended Sessions.

Clicking an enabled action navigates to the dedicated Session route. The
calendar panel remains app-owned composition and does not contain media SDK
logic.

### Client entry

The current `/me` consultations placeholder becomes a server-backed list grouped
into active, upcoming and recent. The list contains only bookings for the
authenticated client and already-related astrologers. No discovery, catalogue
or cross-promotion is introduced.

Active or joinable rows open `/sessions/:sessionId`. Earlier rows show the
joinable time. Terminal rows can open a read-only Session view with chat history.

### Pre-join

Pre-join is a real screen, not an automatic camera prompt on route load.

- The user explicitly starts device access.
- The screen previews local video, lists discovered inputs/outputs and remembers
  only non-sensitive device preferences using the provider/browser mechanism.
- Camera and microphone default to enabled after permission succeeds; the user
  may disable either before joining.
- `Join` stays disabled until eligibility and required permission/device state
  are resolved.
- Denied permission, no camera, no microphone, insecure context and device-in-use
  states receive distinct recovery instructions.
- Audio-only join caused by a missing/disabled camera is allowed. A missing
  microphone is allowed only when the user explicitly joins listen-only and the
  UI states that they cannot speak.
- The page never exposes a LiveKit token in rendered text, URL, analytics or
  persistent storage.

### In-call layout

Desktop follows the reference composition: dark full-screen Session surface,
primary remote stage, local picture-in-picture, centered controls and right-hand
chat. The header shows Session title, elapsed connected time and `Без записи`.
There is no recording icon or toggle.

Mobile uses the same web route without an iOS-frame wrapper. Video occupies the
usable viewport, controls remain reachable with 44px minimum touch targets, the
local tile is movable only if it does not obscure controls, and chat opens as a
focus-managed bottom sheet. Device orientation changes preserve connection and
chat draft.

The controls are:

- microphone;
- camera;
- device menu;
- screen share when supported;
- chat toggle on compact layouts;
- local leave for the client;
- confirmed end-for-everyone for the astrologer.

Screen sharing starts only from an explicit user gesture. Unsupported browsers
receive a typed unavailable state; the button is not rendered as a no-op.
Publishing a screen replaces the primary focus area for the remote participant
and retains both camera tiles where space permits.

### Accessibility

- The Session route has one programmatic page title and a visible heading.
- Every icon control has an accessible name and state (`aria-pressed` where
  applicable).
- Status changes such as reconnecting and participant arrival use a restrained
  live region.
- The mobile chat sheet traps focus while open and returns focus to its trigger.
- End confirmation is a real modal with focus containment and Escape behavior.
- Keyboard order follows video controls, chat and end action without hidden
  focusable elements.
- Contrast, focus rings, captions for icon-only controls and reduced motion are
  production requirements even where the prototype lacks them.

## Architecture

```text
astrologer-web / client-web
        | validated HTTP + SSE contracts
        v
astrologer-api / public-api Sessions modules
        | app composition, auth, CSRF, provider error translation
        v
packages/domain Sessions use cases and ports
        |                       |
        |                       +--> MediaRoomProviderPort
        v                                  |
packages/db Sessions adapters              v
        |                         LiveKit server adapter
        v                                  |
PostgreSQL session/chat/event state        v
                                      LiveKit Cloud

web call UI -> headless session client model -> LiveKit browser SDK
future Swift/Kotlin -> the same HTTP contracts -> native LiveKit SDKs
```

### Ownership

- `packages/contracts`: versioned Session, message, join-credential and event
  schemas shared by both APIs and web apps.
- `packages/domain/src/sessions`: lifecycle rules, authorization inputs, join
  window, message commands, provider-neutral ports and explicit errors.
- `packages/db/src/schema/sessions`: Sessions, participants, messages, provider
  events and realtime event log.
- `packages/db/src/adapters/sessions`: atomic state/message/event operations and
  Booking-backed authorization reads.
- `packages/session-infrastructure`: LiveKit token/room/admin adapter without app
  or domain imports.
- `packages/session-web-client`: provider-neutral browser room adapter and
  headless connection/device state shared by both web apps; it owns no HTTP API
  client, authorization rule or app composition.
- `apps/astrologer-api/src/modules/sessions`: astrologer routes, provider webhook
  ingress and composition.
- `apps/public-api/src/modules/sessions`: client routes and composition.
- `apps/workers`: Booking-event provisioning, expiry and absence finalizers.
- `apps/astrologer-web/src/features/sessions` and
  `apps/client-web/src/features/sessions`: API access, headless client state and
  app-owned page composition.
- `packages/design-system`: only stable visual primitives discovered to be
  reusable across both call surfaces; no Session business workflow.

`packages/domain` never imports DB, LiveKit or an app. Neither frontend imports
backend internals. The root Nest modules import feature modules rather than
assembling Session controllers directly.

## API Contract

The same response schemas are used by both APIs. Base route names are identical;
authorization differs by authenticated surface.

### Reads

```text
GET /sessions
GET /sessions/:sessionId
GET /sessions/:sessionId/messages?afterSequence=<n>&limit=<n>
GET /sessions/:sessionId/events
```

The astrologer list supports the calendar's bounded date/booking lookup. The
client list is always scoped to the authenticated client. A single Session read
returns safe booking snapshots, schedule, participant display data, lifecycle,
join policy and chat cursor. It never returns provider secrets or recording
fields.

The events route is an authenticated Server-Sent Events stream backed by a
durable Postgres event sequence. It supports `Last-Event-ID`, heartbeat and
bounded replay. It publishes only Session lifecycle and message projection
changes; media track/presence rendering remains SDK-driven.

### Commands

```text
POST /sessions/:sessionId/join-credentials
POST /sessions/:sessionId/messages
POST /sessions/:sessionId/leave
POST /sessions/:sessionId/end
POST /sessions/provider/livekit/webhook
```

- Cookie-auth commands declare existing CSRF route metadata.
- Native bearer sessions bypass CSRF only through the accepted authenticated
  device-session policy.
- `messages`, `leave` and `end` accept a caller-generated UUID `operationId`.
  The store binds operation ID to actor, Session, command type and canonical
  request hash, returning the same result on an exact retry and rejecting reuse
  with a different request.
- `join-credentials` may be retried and issues a new short-lived token only
  after repeating current authorization and lifecycle checks. It does not
  persist or replay the token.
- `end` is astrologer-only and idempotent at the aggregate transition.
- The LiveKit webhook is CSRF-exempt, verifies the signed provider JWT and body
  hash, and deduplicates the immutable provider event ID before applying any
  projection.

### Join credential response

The response contains:

- `sessionId`;
- opaque `serverUrl`;
- short-lived `participantToken`;
- `expiresAt` for initial connection;
- participant display name and derived role;
- initial microphone/camera publication grants;
- no room-administration, recording, ingress, egress or hidden-participant
  grants.

The token identity is a stable opaque Session-participant ID, not an email,
phone number or client name. The token binds exactly one room and expires after
five minutes for initial connection. Reconnect behavior follows the provider
SDK; a fresh full connection obtains a fresh credential from ElevenHouse.

## Persistence

### `sessions`

- `id` UUID primary key;
- `booking_id`, `owner_user_id`, `client_user_id` with composite ownership FKs;
- unique `booking_id`;
- state and monotonic lifecycle revision;
- scheduled start/end and timezone snapshot;
- `started_at`, `ended_at`, `end_reason`;
- opaque provider name and room reference;
- timestamps.

Constraints enforce provider `livekit`, valid state/evidence combinations,
valid schedule range and terminal evidence. Participant identities are not
stored in this row.

### `session_participants`

Exactly two rows per Session, one `astrologer` and one `client`, each bound to
the corresponding immutable user ID. The table owns the opaque provider
participant identity, first/last joined timestamps and latest presence evidence.
It never stores tokens.

### `session_messages`

- Session-scoped monotonic sequence;
- immutable sender participant ID and role;
- client operation/message ID;
- normalized UTF-8 text limited to 4,000 Unicode code points;
- server timestamp.

There are no attachment, edit or deletion columns in Slice A. A uniqueness
constraint makes exact message retry idempotent. Message persistence and its
realtime event are one transaction.

### `session_provider_events`

Stores provider event ID/type, received time, verified payload digest,
application status and safe failure classification. Raw access tokens and
sensitive provider payload fields are not persisted. Reprocessing a duplicate
event is a no-op with recorded replay evidence.

### `session_realtime_events`

Append-only, session-scoped sequence with a versioned allowlisted payload and
retention sufficient for reconnect. It is not a media telemetry store.

### Migration and recovery

The schema change is one focused forward Sessions migration after the current
journal tail. Existing migration artifacts remain untouched. The migration
backfills eligible confirmed video bookings and creates both participants in
the same transaction. Local `db:reset` must apply the full committed lineage.

## Provider Boundary

`MediaRoomProviderPort` supports only the operations required by Slice A:

- mint participant credentials from server-owned room and grant input;
- remove one participant for explicit leave/revocation when needed;
- end a room for the astrologer end command;
- validate and decode provider webhook input;
- expose a redacted readiness result.

The LiveKit implementation uses the official server SDK. Provider calls stay
outside database transactions. Durable state first records a fenced command or
transition intent; retries reconcile known provider results. An ambiguous
provider outcome is observable and reconciled through current room/webhook
evidence rather than reported as success.

Room names are opaque and environment-scoped. API keys and secrets are required
runtime configuration in deployed environments, redacted from config errors,
logs and responses. When config is absent, joins fail with typed
`SESSION_PROVIDER_UNAVAILABLE`; no demo room or fake success is substituted.

## Chat Realtime Model

Text send is HTTP because it needs durable authorization, normalization and
idempotency before publication. After commit, the Session realtime stream emits
the safe message projection. Consumers order by server sequence, suppress a
matching optimistic operation ID and backfill gaps through the message read.

LiveKit text/data streams may later carry ephemeral collaboration signals, but
they are not used for durable chat in Slice A. This prevents reconnect, native
and post-call history semantics from depending on a transient media room.

## Security and Privacy

- Every read and command rechecks Session participant ownership on the server.
- A blocked relationship or non-confirmed booking prevents new credentials.
- Access failures do not reveal whether an unrelated Session ID exists.
- Join tokens are short-lived, least-privilege and never persisted by
  ElevenHouse or the browser.
- LiveKit secret material exists only in backend runtime configuration.
- Webhook signature and body digest are validated before JSON is trusted.
- CSRF applies to cookie-auth commands; provider webhook is explicitly exempt
  only behind provider authenticity validation.
- Session identifiers may appear in protected route URLs; authorization never
  relies on their secrecy.
- Chat text is private user content. Logs contain IDs, counts, timings and safe
  error codes, not message bodies.
- Media is encrypted in transit by the provider/WebRTC stack. Slice A makes no
  end-to-end-encryption claim.
- No recording consent row is created because no recording occurs. A future
  recording slice must add its own explicit purpose, consent, storage,
  retention/deletion and E2EE decision before any capture begins.

## Error Contract

Stable public error codes include:

- `SESSION_NOT_FOUND`;
- `SESSION_NOT_PARTICIPANT` represented with the same external not-found shape;
- `SESSION_NOT_VIDEO_BOOKING`;
- `SESSION_BOOKING_NOT_CONFIRMED`;
- `SESSION_RELATIONSHIP_BLOCKED`;
- `SESSION_TOO_EARLY` with safe `joinableAt`;
- `SESSION_EXPIRED`;
- `SESSION_ENDED`;
- `SESSION_PROVIDER_UNAVAILABLE`;
- `SESSION_PROVIDER_OUTCOME_UNKNOWN`;
- `SESSION_MESSAGE_INVALID`;
- `SESSION_MESSAGE_OPERATION_CONFLICT`;
- `SESSION_END_FORBIDDEN`.

Frontend copy distinguishes retryable connection/provider failures from terminal
eligibility failures. It never converts an unknown provider outcome into a
connected or ended success state.

## Observability and Operations

Structured metrics:

- join credential success/failure by safe reason and role;
- time from first join request to provider connected;
- waiting duration until both participants connect;
- reconnect count and duration;
- connection quality buckets reported without media content;
- message persist-to-SSE latency;
- webhook verification failures, delivery lag and duplicate rate;
- provider command ambiguity/reconciliation;
- scheduled expiry and absence-finalizer lag.

Logs correlate by Session ID, Booking ID, provider event ID and trace ID. They
exclude tokens, message bodies, user contact fields and raw SDP/ICE data.

Readiness distinguishes API/database readiness from LiveKit adapter readiness.
The application may continue serving non-Session routes while Session joins
return a typed provider failure.

## Web and Native Boundary

The web implementation uses the LiveKit JavaScript SDK behind the headless
`packages/session-web-client` adapter. React components consume ElevenHouse
connection state, not raw provider event names throughout the tree.

Future native apps use the same Session list/read/join/message/end contracts and
provider participant identity model. Swift and Kotlin implement native media UI
with the official LiveKit SDKs; they do not load the web call in a WebView.
Platform camera/microphone, audio route, backgrounding and screen-capture APIs
remain native presentation concerns. No web-only cookie, DOM or EventSource
assumption is part of the domain contract; native clients may consume the same
SSE stream with authenticated streaming HTTP or use a later equivalent transport
without changing message persistence.

## Reference Translation

The reference contributes:

- full-screen dark call composition;
- remote primary stage and local PiP;
- compact circular controls;
- right-side chat on desktop;
- yellow primary emphasis, radii, typography and shadows;
- waiting/call-ended visual language.

Intentional production differences:

| Reference behavior | Slice A behavior | Reason |
| --- | --- | --- |
| Recording starts enabled | Header says `Без записи`; no recording control | Recording is outside approved scope and requires consent/retention design |
| Fake elapsed timer | Timer derives from durable server `startedAt` and a monotonic client clock, so reload continues the same interval | No simulated business state |
| Screen button is a no-op | Real supported screen share or typed unavailable state | No hidden disabled behavior |
| Chat is local component state | Server-persisted ordered text chat | Reconnect, native and history requirements |
| Attachment picker accepts files locally | No attachment control | Media purpose/scanning/retention are a later slice |
| Client chart button swaps local view | No chart-sharing control | Collaboration protocol is Slice C |
| Overlay has no dialog/focus isolation | Dedicated route and accessible modal/sheet semantics | Production accessibility |
| Fixed desktop columns on narrow width | Responsive video and bottom-sheet chat | Production mobile web requirement |

Every retained visible state must be measured and compared at equivalent
desktop and mobile viewports during implementation.

## Research

Question: which media architecture minimizes launch and operational risk while
preserving exact ElevenHouse UI control and future Swift/Kotlin clients?

Access date: 2026-08-11 through 2026-08-13.

### Sourced facts

- LiveKit publishes JavaScript, Swift and Android client SDKs and uses a Room,
  participant and track model across platforms:
  <https://docs.livekit.io/intro/basics/connect/>.
- Production access tokens are backend-signed JWTs containing room, participant
  identity, grants and expiry:
  <https://docs.livekit.io/home/server/generating-tokens>.
- Provider webhooks carry a signed JWT whose payload digest can be validated by
  the official server SDK:
  <https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/>.
- LiveKit supports managed Cloud and self-hosting; self-hosted egress is a
  separate operational service:
  <https://docs.livekit.io/transport/self-hosting/> and
  <https://docs.livekit.io/transport/media/ingress-egress/egress/>.
- Browser screen capture requires HTTPS, a fresh user gesture and a permission
  prompt on every capture:
  <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia>.
- The current LiveKit Cloud Build plan is free and includes a bounded WebRTC
  allowance; paid production plans and future egress have separate pricing:
  <https://livekit.com/pricing>.

### Repository evidence

- Booking already owns confirmed/rescheduled/completed/cancelled lifecycle
  events and UTC schedule snapshots.
- The production calendar has a real booking detail panel but no Session action.
- The client consultations section is a placeholder.
- External Messaging owns Telegram/Instagram conversations and must not own
  in-call chat, though its Postgres event-log/SSE technique is reusable.
- Media storage explicitly lists Session/recording purposes as future gaps.
- Capability inventory reports video and recordings as absent.

### Recommendation and rejected alternatives

Use LiveKit Cloud first behind provider-neutral domain and infrastructure ports.
It gives exact custom UI control, cross-platform SDKs and managed SFU/TURN
operations. The abstraction remains at product operations and grants, not a
lowest-common-denominator clone of every vendor API.

Rejected for Slice A:

- raw peer-to-peer WebRTC: ElevenHouse would own signalling, TURN, network
  adaptation, reconnection, diagnostics and native parity;
- Jitsi/prebuilt embed: insufficient control over exact visual and lifecycle
  contracts;
- Daily first: viable managed alternative, but offers no decisive advantage
  over LiveKit for a highly customized cross-platform surface;
- Twilio first: mature but more expensive/provider-specific without a matching
  benefit for this 1:1 contour;
- self-hosted LiveKit first: requires public UDP/TURN, scaling, monitoring and
  separate egress operations before product demand justifies them.

## Rollout and Configuration

Required runtime configuration is added independently to `astrologer-api` and
`public-api`, with one shared validated model:

- provider enabled flag;
- LiveKit WebSocket URL;
- API key;
- API secret;
- environment-specific opaque room prefix;
- join token TTL;
- webhook verification key selection.

Production fails deployment preflight when Sessions are enabled without valid
required provider configuration. Local tests may use the provider port test
double at composition boundaries, but the running UI must never claim a real
call without a real local or Cloud media service.

Release is capability-gated:

1. schema/domain/API deploy with Session capability disabled;
2. provision LiveKit project and webhook through separately authorized external
   operations;
3. verify secrets and webhook reachability;
4. enable internal/local accounts and run two-party canary;
5. enable join actions for ordinary eligible bookings;
6. monitor join failures, reconnect and provider usage.

Rollback disables new join credential issuance while preserving Session/chat
reads. It does not delete Sessions or messages.

## Testing and Acceptance

### Automated

- contract schemas reject unexpected fields, invalid states and leaked provider
  authority;
- domain tests cover every lifecycle transition, UTC boundary and authorization
  negative case;
- DB tests cover unique booking, exactly-two participant roles, message
  sequencing/idempotency, webhook dedupe and concurrent transition CAS;
- migration tests prove new artifacts are append-only and backfill eligible
  bookings;
- provider adapter tests verify exact token grants/TTL, webhook signatures,
  error mapping and no secret leakage;
- API e2e tests cover cookie auth, native bearer auth, CSRF, not-found privacy,
  operation replay/conflict and both roles;
- frontend tests cover pre-join, waiting, connected, reconnecting, ended,
  permission failures, chat replay and role-specific controls;
- router and i18n tests cover both apps and RU/EN.

### Integration

- full local database reset applies the complete committed lineage;
- two API processes observe the same Session/chat state;
- real Postgres SSE reconnect using `Last-Event-ID` restores a dropped message;
- provider webhook replay cannot duplicate lifecycle or presence evidence;
- worker retries cannot create a second Session or end one twice.

### Runtime E2E

Using two authenticated roles and real network-backed data:

1. open the astrologer's confirmed video booking and the client's consultation;
2. prove early join disabled in both UI and API;
3. enter pre-join, grant devices and join from the astrologer;
4. verify waiting state, then join from the client;
5. verify bidirectional audio/video and role identities;
6. toggle microphone/camera and switch available devices;
7. start/stop real screen share from a supported browser;
8. send messages in both directions, reload one client and prove ordered history;
9. interrupt network and prove reconnect/recovery;
10. deny camera/microphone and exercise recovery/listen-only paths;
11. leave as client without ending the astrologer's room;
12. rejoin, end as astrologer and prove both see terminal read-only state;
13. prove Booking remains confirmed until its separate completion action;
14. inspect console, network, logs and safe database evidence.

### Design parity and accessibility

- compare exact reference and production states at equivalent desktop and mobile
  viewports;
- measure stage/chat/control geometry, typography, color, border, radius,
  shadow, z-index and overflow;
- test keyboard traversal, visible focus, modal/sheet containment and return,
  status announcements, control names/states and touch targets;
- capture reference and production evidence outside the repository;
- record each approved deviation from the table above.

Runtime call acceptance remains blocked until authorized LiveKit credentials and
a reachable webhook exist. Automated provider tests are not a substitute for a
real two-party call.

## Implementation Decomposition

One implementation plan may deliver Slice A through independently verifiable
milestones:

1. contracts, domain lifecycle and join/message policies;
2. Sessions schema, adapters, forward migration and Booking-event provisioning;
3. LiveKit server adapter, config, webhook and provider command reconciliation;
4. astrologer/public API modules and security/e2e coverage;
5. shared headless web Session client model and LiveKit browser adapter;
6. astrologer calendar entry and dedicated call route;
7. client consultations list and dedicated call route;
8. persistent chat/SSE recovery;
9. expiry/absence workers, observability and capability gating;
10. local integration, real provider canary, responsive/accessibility and exact
    visual comparison.

Recording, AI and chart collaboration each require a separate specification and
implementation plan.

## Definition of Done

Slice A is complete only when:

- both authenticated participants can reach and complete a real LiveKit call
  from their production web surfaces;
- no third party or unrelated account can learn or join the Session;
- join timing, lifecycle, ending and Booking separation match this design;
- text chat survives reload/reconnect and becomes read-only at terminal state;
- screen sharing is real or honestly unavailable by browser capability;
- no recording, transcript, AI or attachment behavior is present or implied;
- schema lineage, targeted tests, affected package builds and repository gate
  pass;
- two-role Runtime E2E, accessibility and measured design parity pass, or any
  external provider/browser blocker is reported explicitly without a completion
  claim;
- canonical architecture/API/design inventory and capability documentation
  describe the implemented current state;
- unrelated shared-main changes remain untouched.

## User Decisions

No unresolved product or architecture decision remains for Slice A. Routine
implementation choices follow current repository patterns. New user input is
required only for an incompatible accepted ADR/security conflict, external
LiveKit account/secret authority, or a product-scope change.
