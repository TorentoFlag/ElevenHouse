# AstroDiary: paid private collaboration design

## Status and decisions

This is an execution artifact, not product or architecture truth. Product truth
remains the user decision, accepted contracts/domain rules, and the relevant
canonical documentation.

Approved decisions:

- AstroDiary is an independent, admin-configurable one-time paid product.
  It has no global `Pro` or platform-tariff gate.
- A confirmed capture grants the service immediately: paid-period activation,
  entitlement, `astro_diary_journal` creation, activation receipt/event and
  transactional outbox are one atomic application. There is no second delayed
  activation queue that can make a paid customer wait.
- There is no automatic renewal for AstroDiary. A later explicit purchase after
  a terminal end creates a new paid epoch and a new journal; the old journal is
  retained in an archived read-only state for both participants.
- The design reference is visual and interaction input only. Its mock data,
  local state, demo routing and `localStorage` are not production behaviour.

## Outcome

Deliver a private, relationship-scoped, paid asynchronous collaboration service
between one client and one astrologer. A client records states and events; an
astrologer responds or sends reflection prompts within the purchased service
terms. The product must preserve paid access, service limits, deadlines,
privacy, auditability and deletion rights without exposing journal content in
public discovery or generic feeds.

## Business model

### Value unit

The customer buys AstroDiary once for a configured paid access period. The
immutable product contract fixes the price, access period, relationship,
journal access, number of reflection cycles per paid period, astrologer
response SLA, client response window, working weekdays and service timezone.

A reflection cycle, not a raw message, is the billable service unit:

1. A client opens an entry cycle, or the astrologer reserves one paid-period
   allowance and sends a reflection prompt.
2. The client writes/publishes an entry or accepts/declines the prompt before
   its response deadline.
3. The astrologer publishes a reply within the configured working-day SLA.
4. The astrologer may atomically publish one follow-up prompt; otherwise the
   cycle closes.

### Roles

| Actor                           | Permitted outcome                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client participant              | Reads own active/read-only history; owns client drafts/entries, mood and prompt acceptance.                                                                  |
| Astrologer participant          | Reads journals for own relationships; owns astrologer drafts, replies and prompts; is accountable for response SLA.                                          |
| Finance/paid-period application | Supplies immutable paid authority, period, allowance and revocation facts.                                                                                   |
| System worker                   | Executes only independent, durable asynchronous work after an authoritative command: realtime delivery, reminders, context, AI, export and erasure cascades. |

There is no marketplace, cross-astrologer discovery, public timeline or
browser-owned access decision.

## User journeys and acceptance

### J1 — payment to ready journal

1. Client purchases an exact, Diary-configured one-time product in an
   existing relationship.
2. A canonical confirmed capture is applied once.
3. The same transaction creates the paid-period/entitlement and
   exactly one active journal for its `journalEpochId`; it records an immutable
   activation receipt, canonical `journal_activated` event and outbox work.
4. Client and astrologer list/detail reads show the journal immediately.
5. A retry/replay changes nothing; a stale or invalid capture cannot create a
   journal.

### J2 — client-led cycle

1. Client opens a draft in an active paid journal and publishes it.
2. The server derives participant, current period, allowance and timestamp;
   the browser cannot provide them.
3. The journal shows a client entry, mood and immutable context status.
4. An astrologer response obligation with exact SLA is open; the astrologer
   publishes a reply or closes the cycle according to service rules.

### J3 — astrologer-led reflection prompt

1. Astrologer creates/publishes a prompt; allowance reservation and prompt
   cycle are atomic.
2. Client sees it, accepts/declines or times out according to the purchased
   calendar window.
3. Accepted entry, reply and optional follow-up obey one open-cycle invariant.

### J4 — lifecycle changes

- There is no automatic renewal or saved-card charge for AstroDiary.
- Access remains active until the paid-period boundary.
- Ended/archived history is readable to the original pair but cannot receive
  new writes.
- Finance revocation immediately stops writes, closes/revokes open service
  work and never restores usable allowance.
- A new terminal repurchase creates a fresh journal epoch while the archived
  journal remains auditable/read-only.

### J5 — privacy and erasure

- Media is private, journal-scoped and server-authorized for upload, bind and
  short-lived download.
- AI receives only a current, source-digest-bound command and returns an
  editable private draft; it never auto-sends to the client.
- Item and whole-journal erasure immediately revoke read/media access, then
  complete only after exact derivative/cascade receipts are present.

## Visual product contract

Reference: `ElevenHouseDesign/app/journal.jsx` and `journal-data.jsx`.

Desktop is a master-detail workspace: subscriber list, selected journal feed,
turn/status, context/legend and composer. Mobile is a list-to-detail flow with
the composer in the detail screen. Production must preserve this visual
language, including active, unread, needs-reply, empty, loading, error,
read-only and conflict states, while using authoritative API data.

The reference's client/astrologer switch is a visual demonstration. Production
implements two separately authenticated app surfaces rather than impersonating
the other role in an astrologer browser session.

Superdesign is mandatory before production UI transfer:

1. build an approved desktop master-detail and mobile list-detail draft from
   the captured reference tokens and real state matrix;
2. carry only approved visual structure/tokens into app-owned components;
3. verify the rendered applications in a real authenticated browser with
   equivalent data and viewports.

## Current implementation and gap

| Capability          | Current evidence                                                    | Required delivery                                                                                    |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Paid Diary contract | Product/paid-period contracts and sealed epoch exist                | Extend capture application atomically with journal activation.                                       |
| Journal persistence | AstroDiary tables, constraints, events, receipts and adapters exist | Wire activation and all command effects into production transaction boundaries.                      |
| Read APIs           | Astrologer `GET /astro-diary/journals` and timeline only            | Add authenticated list/detail/timeline reads for both roles.                                         |
| Writes              | Domain command composers and DB command UoW exist                   | Expose validated role-owned draft/publish/prompt/reply/read commands with idempotency and CSRF.      |
| Client surface      | No client AstroDiary route                                          | Create relationship-scoped client module and responsive UI.                                          |
| Async operations    | DB records/outbox model exist but no runtime consumers              | Add delivery, deadline, context, AI, export and erasure workers with leases/fences/retry/quarantine. |
| Media               | Private authority model exists                                      | Add Diary-specific public upload/complete/read API and storage adapter binding.                      |
| Visual parity       | Read-only placeholder page, browser-tested empty state              | Superdesign + production implementation + real E2E for nonempty state.                               |

## Target architecture

### Module ownership

| Concern                                                     | Owner                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Product contract, cycles, SLA, command decisions            | `packages/domain/src/astro-diary`                                     |
| Validated contracts                                         | `packages/contracts/src/astro-diary.ts`                               |
| Drizzle persistence, locks, receipts/projections            | `packages/db/src/adapters/astro-diary`                                |
| Capture/paid-period application                             | existing Finance and internal ClientSubscriptions paid-period contour |
| Client endpoints                                            | new `apps/public-api/src/modules/client-astro-diary`                  |
| Astrologer endpoints                                        | existing `apps/astrologer-api/src/modules/astro-diary`                |
| User interfaces                                             | `apps/client-web`, `apps/astrologer-web`                              |
| Realtime, activation side effects, deadline, export/erasure | `apps/workers`                                                        |
| Astronomical context                                        | `apps/chart-worker`                                                   |
| Notifications                                               | `apps/notification-worker`                                            |
| AI draft generation                                         | dedicated worker consumer, never UI/browser code                      |

### Transactional activation

The canonical capture/paid-period application transaction is extended in the
following order:

```text
capture authority
  -> exact immutable paid-period contract / journal epoch
  -> paid-period head + period + entitlement
  -> astro_diary_journal for that epoch
  -> activation receipt + journal_activated event
  -> outbox/delivery rows
```

All inserts are unique/receipt-bound. On a same-key replay, return the original
result; on invalid or stale source facts, fail closed without partial journal.
The transaction must not wait for notification, SSE, AI, context, PDF or media
processing.

### HTTP and security boundary

Every write requires the correct authenticated participant, CSRF protection,
an idempotency key and aggregate version. The server derives actor, relationship,
paid epoch, access period, allowance, clock and media scope.

The client API lives under `/me/astro-diary/**`; astrologer API lives under
`/astro-diary/**`. Each owns list/detail/timeline reads, role-owned draft
operations, publishing, prompt lifecycle and read cursor. Atomic reply plus
follow-up is one command, not multiple client requests.

SSE streams body-free IDs/cursors only. Clients refetch authorized reads after
an event. `Last-Event-ID` is validated as a bounded `int8` cursor; reconnect
and every poll re-authorize the participant scope.

### Workers

Workers consume durable, scoped deliveries using short leases, fencing and
idempotent receipts. Their failure path is retry with bounded backoff, then
observable quarantine; they must never replay a financial capture or write a
second journal. Context/AI/export/erasure all revalidate current source digest
before final mutation.

## Release slices

### Slice 1 — immediate paid core

- atomic capture-to-journal activation;
- client and astrologer journal list/detail/timeline;
- draft, publish, core client entry and astrologer reply;
- paid-period allowance and SLA, read-only/archive/revocation behaviour;
- desktop/mobile empty, loading, active, error, conflict and read-only states.

### Slice 2 — full collaboration loop

- reflection prompts, accept/decline/expiry, follow-up and read cursors;
- SSE delivery and deadline/reminder workers;
- client/astrologer UI parity through approved Superdesign drafts.

### Slice 3 — protected enrichments

- private image/PDF/audio attachments and voice workflow;
- immutable astro-context calculations;
- editable AI drafts with mandatory review;
- export and erasure/cascade completion.

## Research

Question: Which technical patterns preserve a paid private collaboration
service's integrity, privacy and delivery guarantees?

Accessed: 2026-08-18.

### Sources

- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
  — transaction-scoped advisory locks and lock lifetime.
- [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html)
  — `SKIP LOCKED` queue-consumer scope.
- [NestJS server-sent events](https://docs.nestjs.com/techniques/server-sent-events)
  — Observable-based SSE lifecycle.
- [MDN Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
  — event identifiers and reconnect behaviour.
- [AWS S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
  — bearer URL expiry implications.
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
  — signed double-submit CSRF pattern.
- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint)
  — provider data handling for later AI scope.

### Findings

- Repository evidence: contracts/domain/schema model exact CAS, receipts,
  idempotency, private media authority and event delivery but production wiring
  currently exposes only astrologer journal/timeline reads.
- Sourced fact: advisory locks are appropriate for short transaction-level
  idempotency serialization; `SKIP LOCKED` is appropriate for independent
  worker delivery claims, not authoritative reads.
- Sourced fact: presigned URLs are bearer capabilities, so every Diary object
  needs short expiry and server-side authorization before issuance.
- Inference: immediate journal availability is a transactional paid-service
  outcome, while downstream fanout is independently retryable work.

### Alternatives rejected

- A separate delayed journal-activation worker: it exposes a paid user to
  avoidable activation lag and a false empty state.
- Rebinding an old journal to a new terminal paid epoch: breaks immutable
  epoch/finance authority.
- Browser/local-state composition: cannot enforce paid access, privacy,
  idempotency or audit.

## Verification and release gates

- Domain/contract: capture/replay, paid-period end/archive, cycles, allowance,
  SLA, source-digest and command conflict cases.
- PostgreSQL: activation dedupe/races, exact event/outbox effects, cross-owner
  attempts, revocation and history access, worker claim/fence/quarantine.
- API/security: client/astrologer isolation, CSRF, idempotency replay/conflict,
  bounded pagination/SSE and no body leak in deliveries.
- Object storage: nonparticipant, revoked and erased media denial; authorized
  short-lived private read.
- Browser: real captured local paid access; both roles; nonempty journal;
  desktop/mobile; keyboard; loading/empty/error/retry/conflict/read-only;
  console/network evidence.
- Visual: approved Superdesign canvas state compared with production at the
  same desktop and mobile viewports.
- Deployment: forward-only migration, worker configuration/readiness,
  exact SHA CI/deploy and fresh service/browser probes.

## Out of scope until the relevant slice

- public discovery, marketplace behaviour and cross-astrologer feed;
- browser-only business state or demo-data substitution;
- automatic client publication of AI output;
- arbitrary generic-media exposure;
- a global platform tariff gate for the feature.
