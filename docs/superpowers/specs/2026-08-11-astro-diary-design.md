# AstroDiary Product and Architecture Design

Date: 2026-08-11  
Status: approved; implementation in progress  
Visual reference: `ElevenHouseDesign/app/journal.jsx`  
Production routes: new `/journal` and `/me/astrologers/:astrologerUserId/journal`

## Outcome

Build AstroDiary as a production subscription product sold by one astrologer to
one already-related client. The client publishes personal observations, mood,
attachments and voice messages; the astrologer responds, asks reflection
questions and closes bounded reflection cycles. AI helps the astrologer prepare
high-quality editable drafts but never publishes on the astrologer's behalf.

The implementation must reproduce the reference layout, visual language and
measured computed styles for corresponding states. The prototype does not own
business rules, persistence, authorization, billing, AI, media or lifecycle
semantics. Those are defined here and implemented through production contracts.

This is not a chat skin over Messaging. It is a pair-bound guided journal with
a paid allowance, explicit publishing, a response obligation and astrological
context captured at the time of the entry.

## Product Thesis and Business Assessment

AstroDiary is viable as a distinct subscription because it packages an ongoing
human service, not access to a generic messaging channel. Its customer value is
continuity: the client records real-life events between consultations, sees
their astrological context and receives structured attention from their chosen
astrologer. Its seller value is a predictable recurring product with a bounded
amount of work.

The number of reflection cycles and the response SLA make the promise measurable
and protect both sides from an implied unlimited-chat obligation. The product is
therefore sold as “N reflection cycles per billing period, with an astrologer
response within M working days,” not as unlimited correspondence.

The business model would become weak or operationally dangerous if messages,
rather than cycles, were the paid unit; if unanswered work disappeared at the
end of a billing period; or if a subscriber could create unlimited simultaneous
threads. This design avoids those failure modes with one journal per pair, one
open cycle at a time and explicit period allowance.

No public astrologer catalogue, cross-promotion, group journal, public link,
assistant assignment or shared-team inbox is introduced.

## Scope

### Included

- a fixed AstroDiary product template configured and activated by the
  astrologer;
- recurring client subscription, paid periods and AstroDiary entitlement;
- one journal per active client-astrologer relationship;
- a configurable number of reflection cycles per paid period;
- configurable response SLA in astrologer working days and timezone;
- client entries, astrologer replies and astrologer reflection prompts;
- private server-side drafts and explicit publish commands;
- emoji mood input, internal numeric scores and non-diagnostic trends;
- automatic global and personal astrology context snapshots;
- images, documents and voice messages;
- AI question and reply drafts for the astrologer, using `gpt-5.5`;
- unread, due, overdue, media-processing and typed failure states;
- exact journal deep links and privacy-safe notifications;
- PDF export and an authenticated deletion/redaction request flow;
- desktop and responsive mobile interfaces for both roles;
- RU and EN copy, UTC persistence and user-timezone presentation.

### Excluded

- pause;
- streaks;
- JSON export;
- group journals;
- team or assistant access;
- a separate client-only personal journal;
- public sharing links;
- Inbox fallback or mirroring into a Messaging conversation;
- automatic crisis-keyword scanning;
- E2EE claims or a shared-key encryption architecture;
- autonomous AI, AI auto-send or a client-facing AI persona;
- marketing, discovery or cross-promotion;
- legal analysis, legal copy and separate user permission screens;
- legacy DTOs, dual read/write, backfill, compatibility views or data migration.

## Terms

| Term                   | Meaning in AstroDiary                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pair-bound journal     | The single journal owned by one existing client-astrologer relationship. It is not transferable to another astrologer or client.                                                           |
| Thread ownership       | The relationship pair owns the journal identity; role and relationship policy decide which participant may perform each action.                                                            |
| Client-visible item    | A published client entry, astrologer reply or reflection prompt that both participants can see.                                                                                            |
| Private draft          | Unpublished author-only server data. It consumes no allowance and creates no notification or response obligation.                                                                          |
| Reflection cycle       | One bounded guided exchange, paid from the current period allowance. It can begin with a client entry or an astrologer prompt and has a defined close.                                     |
| Allowance              | The number of new reflection cycles included in one successfully paid subscription period. It is not a message count.                                                                      |
| Entitlement            | A provider-neutral server decision that the client may use AstroDiary because a canonical paid period currently grants `astro_diary`. It does not depend on Stripe/ArcPay-specific fields. |
| Response obligation    | A durable task for the astrologer created when the client publishes an entry in a cycle. Normal cancellation or period end does not erase already accepted work.                           |
| Due/overdue projection | A read model calculated from the obligation timestamp, SLA, working days and timezone; it is not inferred in the browser.                                                                  |
| Author ownership       | Only the original author may edit or delete their published item and only the author may access its draft.                                                                                 |
| Version/CAS            | Every mutable draft or journal command carries the last observed revision. A stale edit fails explicitly instead of overwriting newer state.                                               |
| Context snapshot       | Immutable references and calculated facts describing the global sky and, when available, the client's chart at the relevant publish time.                                                  |
| Export/redaction       | PDF generation from authorized journal content and durable removal/tombstoning of requested journal content without inventing a hidden archive.                                            |
| Event `.v1`            | Version 1 of an internal event payload contract. It is schema versioning for consumers, not a product release or a legacy API promise.                                                     |

## Personas and Core Jobs

### Client

- capture an event, feeling or observation without losing it between sessions;
- optionally attach evidence or record a voice note;
- understand what the current astrological context was at that moment;
- receive a thoughtful human response and a useful next reflection question;
- see whether the astrologer is expected to respond and by when;
- retain read-only history after the paid relationship ends;
- export the shared history to a readable PDF or request deletion.

### Astrologer

- configure a commercially clear amount of work and price;
- see which client needs a response and which obligation is approaching SLA;
- respond in context without searching across unrelated CRM modules;
- use AI to draft a specific, natural response in their voice, then edit it;
- send an opening reflection prompt when the client has an available cycle;
- review relevant mood and astrology context without diagnostic claims;
- keep the subscription and its outstanding service obligations auditable.

## Product Configuration

The product constructor receives a fixed AstroDiary template. It creates a
normal Product aggregate with a typed AstroDiary configuration rather than a
free-form custom product.

Fixed fields:

- `type = sub`;
- `paymentModel = sub`;
- `executionMode = async`;
- `participantMode = solo`;
- `accessGrants = [journal]`;
- `deliveryFormats = [chat, audio, file]`; text, voice and attachments are all
  required capabilities, not optional product variants;
- `requiredClientData = []`, `methods = []` and `modifiers = []`; AstroDiary
  does not inherit consultation intake, astrology-method selectors or price
  modifiers;
- no trial in this contour;
- no group size, live duration or package-session semantics.

Astrologer-configurable fields:

- localized title and subtitle;
- price in minor units and an explicitly supported currency;
- billing period: week, month or year;
- `reflectionCyclesPerPeriod`, a positive bounded integer;
- `responseSlaWorkingDays`, a positive bounded integer;
- working weekdays and validated IANA timezone;
- `clientResponseWindowCalendarDays`, the bounded time in which a client may
  answer an astrologer prompt;
- localized included-items description;
- draft, active or archived product status.

The Product aggregate has a monotonic `revision`; every update and status
transition uses `expectedRevision` CAS. Purchase preparation locks and seals the
exact revision, so concurrent edits cannot change the terms between order and
provider checkout.

AI is available by default to the astrologer and is not a product toggle. The
client buys the human service; AI is an internal authoring capability.

An active product must have a positive price and may be sold only when recurring payment readiness,
subscription fulfillment and finance-revocation handling are all available. The current
prototype price `1,490 RUB/month`, sales count and “monthly analysis” are fixture
data and do not become defaults.

Starting a purchase first seals an immutable `client_subscription_contract`
containing the exact product revision, price, currency, cadence, allowance,
response window, SLA, schedule, grants and the exact initial
`OrderEconomicsSnapshot`: plan ID/version, commission basis points, allocation
revision and gross/commission/payable amounts. Its ID and digest are bound to the
order and finance purpose before any provider intent is created. Capture and
renewal never rehydrate a mutable Product or current tariff to decide what was
bought or how its money is allocated.

Paid-period boundaries use calendar cadence, not fixed hour or day durations.
The initial verified capture instant is the billing anchor and the first period
start. For every later boundary, convert that anchor to the contract's service
timezone, add the period index to the original local date and wall-clock time,
then resolve the result with the IANA rules. Week adds seven calendar days per
index; month preserves the original day of month and constrains it to the last
day only in shorter months; year preserves the original month/day and constrains
29 February only in non-leap years. Each boundary is calculated from the
original anchor, never by repeatedly adding to the previous constrained date.
For a DST gap choose the first valid later instant; for an ambiguous fall time
choose the later instant. Periods are half-open UTC ranges `[startsAt, endsAt)`
and retain the anchor, timezone, cadence, sequence and resolved local-boundary
evidence.

A renewal captured before the current period ends creates exactly one
non-overlapping future period starting at the current end. Its end is the next
boundary from the same anchor. Multiple future periods are not scheduled. If no
renewal was captured by the exact end, the paid chain lapses; a later verified
capture starts at its own capture instant and becomes the new billing anchor.
Provider fields such as `recurring_frequency_days` describe the stored-credential
charge but never become the authority for these product period boundaries.

## Subscription, Period and Entitlement Lifecycle

AstroDiary requires a new client-subscription domain. Existing platform tariff
subscriptions describe the astrologer's ElevenHouse plan and must not be reused.

### Subscription head states

- `pending_initial_payment`: contract created, no paid entitlement yet;
- `active`: a captured period currently or prospectively grants access;
- `cancel_at_period_end`: current period remains active but no renewal will be
  initiated;
- `ended`: no current paid period and no future renewal;
- `revoked`: access was terminated by a canonical succeeded full-refund or
  observed chargeback fact.

Payment-attempt state is separate from subscription state:

- `pending`;
- `succeeded`;
- `failed`;
- `outcome_unknown`.

This separation prevents a failed attempt from silently changing an already
paid current period.

### Recurring billing contour

Recurring billing is a technical payment workflow separate from the journal:

1. ClientSubscriptions seals the contract and requests the initial invoice.
2. Finance owns the reusable provider credential reference, invoice, charge
   command and reconciliation evidence. Raw payment credentials never enter
   ClientSubscriptions.
3. `apps/payment-worker` owns provider I/O. It claims a fenced charge command,
   calls the provider outside the checkout transaction and persists a known or
   ambiguous outcome through the existing finance authority.
4. A scheduler creates the next renewal invoice from the immutable contract
   before period end. It never reads current mutable product price or SLA.
5. Provider webhook/poll reconciliation completes or fails the charge. An
   ambiguous attempt is not charged again automatically.
6. The generic verified finance capture is classified by its bound purpose and
   dispatched as the IDs-only purpose event
   `client_subscription.capture_applied.v1`.
7. Only that purpose-specific event may create a client subscription period.

The current saved-card implementation for the astrologer's platform tariff is
not reused as a client-product credential. The new credential and recurring
charge records use the shared finance primitives but have their own purpose,
ownership, readiness and reconciliation tests. UI product copy clearly shows
price, cadence, next charge and how to schedule cancellation; legal copy or a
separate data-use permission flow is not designed here.

### Rules

1. A verified initial capture creates the first immutable paid period and
   activates entitlement idempotently.
2. Cancellation schedules the end of renewal; it does not terminate the
   already paid period.
3. Before period end, the client may cancel the scheduled ending and keep
   renewal active. This does not create a period or payment. After period end,
   access can only be started through a new verified payment.
4. Pause does not exist.
5. A renewal capture creates the next period exactly once. Duplicate provider
   delivery or duplicate outbox consumption cannot create a second period.
6. A failed renewal does not create a grace period or a new allowance. The
   current paid period remains valid until its exact end.
7. A successful retry before period end creates the contiguous next period. A
   successful retry after period end creates a new period from the verified
   capture time; access is never backdated by a fallback.
8. Normal cancellation, renewal failure and period end block new cycles after
   paid access ends, but keep history readable and keep already-open cycles and
   astrologer response obligations writable until they are closed.
9. A canonical succeeded full refund or ArcPay `payment.chargeback` observation
   revokes new writes immediately. Open obligations become
   `cancelled_by_finance_revocation`; history stays read-only. ArcPay exposes a
   chargeback-opening fact but no terminal won/lost or separate reversal event,
   so this product deliberately treats the observed chargeback as a permanent
   service revocation and does not fabricate a later provider outcome.
10. A blocked or removed client-astrologer relationship closes interactive
    access immediately regardless of entitlement. It is a technical relationship
    policy, not a browser-side flag.

The source entitlement is provider-neutral: it refers to the subscription,
period, grant and canonical finance evidence, never directly to a payment
provider subscription ID. ClientSubscriptions is its only writer.

Entitlement answers whether a new cycle may start. Continuation after normal
period end is a separate `AstroDiaryAccessPolicy` decision based on the existing
open cycle and response obligations. It grants only operation-specific
`read`, `continue_open_cycle`, `respond` and `close` rights. Reversal and a
blocked relationship revoke continuation writes immediately.

## Allowance and Reflection Cycles

Each successfully paid period issues an immutable allowance of
`reflectionCyclesPerPeriod`. Unused cycles do not roll over. An already-open
cycle survives period end so that a purchased exchange can be completed.

There is at most one open cycle per journal. A participant can save a draft for
the next entry, but cannot publish it until the open cycle closes and entitlement
plus allowance permit another cycle.

Allowance units have explicit `available`, `reserved`, `consumed` or `released`
state:

- a client opening entry consumes one unit atomically at publish;
- an astrologer opening prompt reserves one unit atomically at publish;
- the client's first response accepts the prompt and converts its reservation
  to consumed in the same transaction;
- client decline, astrologer withdrawal before response or response-window
  expiry closes the unaccepted cycle and releases the reservation;
- releasing a reservation after its paid period ended does not create new
  usable allowance or rollover.

A failed publish or reserve consumes nothing. A duplicate idempotency key
returns the same result. The UI shows available and reserved counts separately
so an astrologer cannot silently exhaust the client's purchased allowance.

### Client-initiated cycle

```text
client entry published
  -> awaiting astrologer response (obligation and SLA created)
  -> astrologer closing reply
     -> atomically publish + satisfy obligation + close cycle
     OR
     -> astrologer reply with one reflection follow-up prompt
        -> atomically publish + satisfy obligation + transition
        -> awaiting client follow-up
        -> client follow-up published
        -> awaiting astrologer closing response (new SLA obligation)
        -> astrologer closing reply
        -> atomically publish + satisfy obligation + close cycle
```

### Astrologer-initiated cycle

```text
astrologer opening prompt published
  -> reserve allowance + awaiting client entry until response deadline
  -> client entry published
  -> atomically consume reservation + create response obligation
  -> astrologer closing reply
  -> atomically publish + satisfy obligation + close cycle
```

The client may explicitly decline an opening or follow-up prompt. The astrologer
may withdraw an unanswered opening prompt. A scheduled worker closes an
unanswered prompt when `clientResponseWindowCalendarDays` expires. Opening
decline/withdraw/expiry releases the reservation; follow-up
decline/withdraw/expiry closes an already consumed cycle. None creates an
astrologer response obligation.

There is no generic “close” command after a reply. Terminal commands are atomic:
`publish_closing_reply`, `publish_reply_with_follow_up`, `decline_prompt`,
`withdraw_prompt` and `expire_awaiting_client`. Each writes the timeline fact,
obligation transition, cycle transition, allowance transition and IDs-only
outbox in one transaction. Additional discussion after closure requires a new
cycle.

Persisted cycle states are `awaiting_client_entry`,
`awaiting_astrologer_response`, `awaiting_client_follow_up`,
`awaiting_astrologer_closing_response` and `closed`. A closed cycle also stores a
typed reason: `completed`, `client_declined`, `prompt_withdrawn`,
`client_response_expired`, `trigger_deleted`, `journal_deleted` or
`cancelled_by_finance_revocation`. UI turn state is projected from these facts, never from
the author of the latest array item.

This bounded model preserves the human correspondence visible in the reference
while making price, workload and SLA operationally unambiguous.

## Journal and Timeline Model

One `astro_diary_journal` is created lazily for a stable relationship and
survives renewals. The subscription grants access to the journal; it does not own
or recreate the journal identity.

Client-visible timeline types:

- `client_entry`;
- `astrologer_reply`;
- `reflection_prompt`;
- `correction` linked to an earlier item;
- tombstone for a deleted/redacted item.

The prototype's “Заметка” is a client-visible astrologer reply, not a private
note. Russian UI copy becomes “Ответ” or “Комментарий”; the same visual bubble
is retained. Astrologer-private CRM notes remain outside AstroDiary and cannot
accidentally appear in its timeline, export, notification or AI context.

Drafts are stored separately, author-only and mutable through CAS. Publishing
creates an immutable timeline item revision and clears or seals the source
draft. AI output is also only a draft.

An author may edit their own published item through CAS only until another
participant publishes a dependent item or the item causes a terminal cycle
transition. The timeline shows `editedAt`. After dependency, the author adds a
linked correction instead of rewriting the statement to which someone already
responded. Neither role may edit the other role's content.

Ordinary author hide and content erasure are different commands:

- hide/tombstone preserves the lifecycle fact while removing the item from the
  normal feed; it is allowed only where the cycle matrix below has a defined
  transition;
- content erasure removes or irreversibly redacts bodies and every derivative
  while preserving only body-free IDs, financial facts and lifecycle evidence.

Lifecycle matrix:

| Command                                                                                 | Cycle/obligation result                                                                                                                       | Allowance result                           |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Client hides the opening entry before any astrologer reply                              | Atomically tombstone, close cycle with `trigger_deleted`, close open obligation as `closed_without_response`                                  | Consumed unit is not restored              |
| Client hides a follow-up entry before the closing reply                                 | Atomically tombstone, close final obligation as `closed_without_response` and close the cycle                                                 | Consumed unit is not restored              |
| Client entry is erased after a dependent astrologer item                                | Body and derivatives are redacted; dependent timeline and closed/open lifecycle facts remain                                                  | No change                                  |
| Astrologer withdraws an opening prompt before client response                           | Atomically mark prompt withdrawn and close unaccepted cycle                                                                                   | Reservation released                       |
| Astrologer withdraws an unanswered follow-up prompt                                     | Atomically mark prompt withdrawn and close the already served cycle                                                                           | Consumed unit is not restored              |
| Astrologer reply satisfied an obligation, closed a cycle or has a dependent client item | Ordinary hide is not allowed; a correction or content erasure preserves the satisfied lifecycle fact                                          | No change                                  |
| Whole journal deletion                                                                  | Immediately close journal to new writes, terminally close prompts/obligations, schedule subscription end/no renewal and start cascade erasure | No refund, credit or allowance restoration |

A whole-journal deletion never causes lazy recreation. After deletion completes
and the previous subscription has ended, a later explicit new purchase may
create a new journal epoch with a new ID; at most one non-deleted journal is
current for a relationship.

Timeline order uses server `occurredAt` plus a monotonic tie-breaker/cursor. The
client may not backdate a new publish to change history order. All timestamps
are stored in UTC and rendered in the viewer's timezone.

## Response SLA and Read State

Publishing a client entry that requires an astrologer response creates a
durable response obligation. Its due time is calculated server-side from:

- publish timestamp;
- product's `responseSlaWorkingDays` snapshot;
- product's working weekdays snapshot;
- astrologer's IANA timezone snapshot.

The exact algorithm is part of the domain contract:

1. Convert the publish instant to the SLA timezone and retain its local wall
   clock time.
2. Starting with the next local date, count only configured working weekdays.
3. The Nth counted date is the due date; combine it with the retained wall clock
   time and resolve it through the IANA timezone rules.
4. For a spring DST gap, choose the first valid later instant. For an ambiguous
   fall time, choose the later instant. Persist the resulting UTC instant plus
   all schedule snapshots.

Examples for a Monday-Friday schedule and two working days:

- Monday 10:00 -> Wednesday 10:00 in the SLA timezone;
- Friday 20:30 -> Tuesday 20:30;
- Saturday 11:00 -> Tuesday 11:00 because Monday is the first counted day.

Configured weekdays are the complete calendar for this contour; public holidays
are not silently inferred. “Due soon” begins at local `00:00` on the due date.
Both roles see the exact due instant formatted in their viewer timezone together
with the SLA timezone label. Overdue drives status, reminders and operational
metrics only; it does not automatically create a refund, credit or additional
allowance.

The obligation states are `open`, `satisfied`, `overdue`,
`cancelled_by_finance_revocation` and `closed_without_response`. “Due soon” is a read
projection, not another state. A worker emits overdue once, idempotently.

Normal period end or scheduled cancellation never deletes an open obligation.
The astrologer retains the minimum write capability needed to satisfy it and
close the already-open cycle, while neither participant can start a new cycle.

Read state uses per-participant durable cursors, not a boolean on every row.
The subscriber rail shows unread and due/overdue information in text as well as
color. Delivery of a notification does not define whether a journal item is
read.

## Mood and Trends

The client can optionally attach one mood to each client entry. The UI always
shows emoji plus localized label; color is supplementary. Internal numeric
scores support ordering and trends but are not shown as a clinical scale.

| ID         | RU label    | Emoji | Internal score |
| ---------- | ----------- | ----: | -------------: |
| `inspired` | вдохновение |    ✨ |              2 |
| `joy`      | подъём      |    😊 |              2 |
| `calm`     | спокойствие |    😌 |              1 |
| `tired`    | усталость   |    😮‍💨 |             -1 |
| `anxious`  | тревога     |    😟 |             -1 |
| `sad`      | грусть      |    😢 |             -2 |

Trends are derived from published client entries for a selected paid period or
date range: distribution by mood, change over time and enough-data state. They
are descriptive, never diagnostic or predictive. Deleted entries stop
contributing after the projection is rebuilt.

The reference streak is removed. It has inconsistent fixture semantics and
would reward daily activity even though the paid unit is a bounded reflection
cycle. The header instead shows allowance, current turn and response status.

## Astrology Context

Every published client entry captures an asynchronous immutable context
snapshot for its event time:

1. global context: lunar phase/sign and relevant calculated transits;
2. personal context, automatically included when the client has an owned birth
   profile and a calculable chart;
3. source IDs, calculation-engine revision, birth-profile revision, event UTC,
   timezone and a digest.

No manual “attach chart” action is required for normal operation. The reference
badge becomes a context-status control: `pending`, `global only`, `personal`,
`failed` or `source stale`. Missing birth data is an ordinary global-only state,
not a blocked journal.

The timeline item is publishable before context calculation completes. Context
completion updates only the context projection and never mutates the authored
body. A failed calculation remains a visible typed retry state; no hard-coded
moon phase or guessed chart is substituted.

## Attachments and Voice

AstroDiary reuses the existing private Media storage, upload and signed-read
infrastructure, but adds diary-specific purposes and authorization. Messaging
tables and conversation ownership are not reused.

Supported entry media:

- images: `image/jpeg`, `image/png`, `image/webp`, `image/avif`;
- documents: `application/pdf` only;
- voice/audio: `audio/ogg`, `audio/mpeg`, `audio/mp4`.

The initial per-asset limit is the existing private attachment limit of 20 MB.
Any future MIME or size expansion is a Media contract change with its own
processing and regression evidence, not a permissive wildcard.

Lifecycle:

```text
upload intent -> uploading -> processing -> ready
                    |            |         |
                    +-> failed <-+         +-> deleted
                         |
                         +-> explicit retry
```

Only `ready` media can be attached to a published timeline item. Attachment
binding and item publish are atomic. Signed download/playback is authorized
against the journal relationship and item visibility each time; raw object keys
and permanent URLs never enter contracts, events or logs.

The client composer supports recording, preview, discard, upload progress,
processing, playback and retry. Existing Messaging UI and transport patterns
may be reused where they are generic, but Diary receives its own contracts,
purpose values and tests.

For AI, voice is transcribed by a separate asynchronous transcription step;
images use an AstroDiary-specific vision input and PDFs use deterministic text
extraction with page references. OpenAI File Transcription does not list OGG as
an accepted input and its vision guide does not list AVIF. Therefore the
original user assets remain unchanged, while source-bound derivative commands
transcode OGG/Opus to a supported audio format and convert AVIF to PNG/WebP
before provider use. Converter version, source checksum, output checksum and
failure are persisted. This is an explicit derivative lifecycle, not a silent
format fallback. Failure of conversion, transcription or extraction is visible
and never pretends the media was understood.

### Content derivatives and retrieval

`AstroDiaryContentDerivatives` is a separate technical boundary. It owns:

- source-bound transcription commands and transcripts;
- PDF page text and image description/OCR derivatives;
- retrieval chunks, lexical search document and embeddings;
- a versioned astrologer style profile;
- explicitly curated and approved style exemplars;
- source-to-derivative lineage and cascade redaction.

Voice transcription uses the dedicated OpenAI `gpt-4o-transcribe` model, not
`gpt-5.5` audio input. Each transcription command has its own provider config,
rate limit, requested/observed model, usage, idempotency, typed failure and
`outcome_unknown` handling. Image understanding and final draft generation use
the dedicated AstroDiary `gpt-5.5` provider interface. PDF extraction is local
and records parser version, page boundaries and checksum.

Historical retrieval uses PostgreSQL full-text ranking plus explicit 3072-
dimension `text-embedding-3-large` vectors scoped to one journal, followed by
deterministic reciprocal-rank fusion and deduplication. The first production
implementation uses exact cosine search with a journal B-tree filter and a GIN
full-text index. It does not add an approximate HNSW/IVFFlat index before a
same-journal corpus benchmark proves that its recall trade-off is necessary.
The PG17 runtime uses
`pgvector/pgvector:0.8.6-pg17-trixie@sha256:a74b9af952f5609c090120bf938b0c8bca56c33ed9fb05643fd9fceec52c4a08`.
Readiness must prove both `pg_available_extensions` and installed
`pg_extension` state before the schema is accepted; failure is a blocker, not a
switch to an unowned provider vector store.

Every derivative stores source revision/digest, generator/parser/model version
and status. Editing invalidates old derivatives; deletion removes or redacts
transcripts, extracted text, chunks, embeddings, AI drafts and export artifacts
before the source is reported erased. No derivative is an independent archive.

## AI Product Behavior

AI is available by default only as an astrologer authoring assistant. It can
generate:

- a reply draft for the current client entry;
- a reflection-question draft for the current cycle or a new cycle.

It never auto-sends, never writes directly into the client-visible timeline and
never impersonates an autonomous participant. The astrologer sees the draft,
its selected context, edits it and explicitly publishes it as their own reply or
prompt.

### Model and provider contract

- requested model is always literal `gpt-5.5`;
- the observed model is stored separately and must match the accepted
  `gpt-5.5` family/snapshot rule or the attempt fails as
  `AI_MODEL_PROVENANCE_INVALID`;
- OpenAI Responses API;
- strict structured output;
- `store: false`;
- requested model, observed model, prompt ID/version, source digest, latency,
  token usage and safe terminal outcome are persisted;
- no model fallback;
- no auto-retry after an ambiguous provider outcome.

`gpt-5.6` is not used.

### Context assembly

The product does not artificially withhold useful Diary data, but the context
builder has a closed source allowlist because extra unrelated context reduces
quality and makes grounding unverifiable. Every source must also pass current
role, relationship, journal and source-ownership checks.

Allowed context is assembled in this order:

1. current client entry verbatim, including the current cycle;
2. transcription or extracted attachment content that is ready;
3. immutable global and personal astrology snapshot;
4. recent relevant published cycles;
5. older relevant fragments selected by hybrid semantic and lexical retrieval,
   filtered to the same journal and reranked;
6. astrologer's explicit style profile;
7. style exemplars explicitly selected and approved by the astrologer from
   their final published replies.

Client private drafts, deleted content, unrelated clients, permanent media URLs
and astrologer-private CRM notes are never selected. Bookings, Inbox,
consultation recordings and arbitrary CRM fields are not on the allowlist. Each
selected historical fragment has a source manifest so the UI can show why it
was used. Exemplars contribute form, tone and structure only; their
client-specific facts are stripped and cannot be copied as current facts.

### Prompt design

Versioned prompts:

- `astroDiary.replyDraft@1`;
- `astroDiary.reflectionQuestionDraft@1`;
- `astroDiary.draftReview@1`.

Reply rubric:

1. reflect a concrete event or feeling from the current entry;
2. be specific rather than using generic validation phrases;
3. use only supplied journal and astrology facts;
4. preserve the astrologer's language, form of address, warmth and length;
5. ask at most one open reflection question when appropriate;
6. avoid invented events, feelings, chart facts or certainty;
7. avoid repetitive paraphrase and unnecessary length.

Reflection-question rubric:

1. ask exactly one concrete, open question;
2. connect to the current entry or supplied context without leading the client
   to a predetermined answer;
3. avoid yes/no formulation, stacked questions and generic coaching clichés;
4. present astrology as a reflection lens, not a deterministic conclusion;
5. never invent an emotion, event, chart fact or causal claim.

Generation uses one bounded draft -> rubric review/refine sequence, implemented
as two provider attempts. There is no recursive multi-agent loop. The astrologer
remains the final reviewer.

### Durable AI command lifecycle

Generation is asynchronous:

```text
pending -> processing -> succeeded
                      -> known_failed
                      -> outcome_unknown
                      -> source_stale
                      -> cancelled
```

The command records an idempotency key and source checksum. It owns two child
attempts: generation and review/refine. Each child records requested/observed
model, usage, latency and terminal outcome. Immediately before each provider I/O
the worker rechecks actor role, relationship, operation-specific access and
source checksum. If the entry, context or draft changed, the result becomes
`source_stale` and cannot overwrite the current draft.

An ambiguous timeout in either child attempt makes the whole command
`outcome_unknown`; the first-pass draft is not exposed as a completed result and
no child is retried automatically. The astrologer can explicitly start a new
command.

AstroDiary AI is registered as `client_derived`, with technical usage evidence
required. That evidence contains actor, journal, source revision/digests and
operation authority; it is not a user-facing permission. The feature is enabled
by default for an authorized astrologer.

### Non-regression boundary

AstroDiary gets a dedicated worker composition, environment namespace, Redis
rate-limit prefix and quotas. It reuses proven AI primitives but does not change:

- existing model defaults or profile mappings;
- existing prompt text, prompt versions or schemas;
- existing feature-policy availability;
- dictionary, charts, matrix, numerology, Human Design or Flow behavior;
- existing synchronous provider request shapes;
- existing failure taxonomy or usage evidence semantics.

Before any shared AI edit, characterization tests freeze the current exact
provider request, model selection, schema, errors, rate limits and usage
records. If multimodal input requires a new provider interface, it is added as
an AstroDiary-specific interface rather than widening the existing string-only
contract and hoping every consumer still behaves the same.

## PDF Export and Deletion

PDF export is an authenticated snapshot of the shared journal that includes:

- pair identity and export time;
- timeline in canonical order;
- author, timestamps, edit markers and mood;
- visible astrology context;
- attachment names and safe references; images may be embedded, audio is listed
  with metadata rather than converted to text unless a ready transcript exists.

JSON export is not built.

Export remains available when the subscription is read-only after normal end.
It is not available after the relationship policy denies all access.

Deletion is an explicit authenticated request with target preview and final
confirmation. An author can request erasure of an owned item; deleting the whole
journal requires a client-owned journal-level command. Item hide follows the
lifecycle matrix above and is not presented as erasure.

Erasure is complete only after a durable cascade has redacted or deleted the
timeline body, prior body-bearing revisions, transcripts, PDF text, image
descriptions, retrieval chunks, embeddings, AI drafts, generated export
artifacts and owned media derivatives. Attachment access is revoked immediately
while cleanup continues. Trends and future retrieval exclude the source from
the start of the command. Body-free lifecycle IDs, allowance/financial facts and
erasure receipts remain. There is no silent browser-only hide, hidden body
archive or JSON backup.

Whole-journal deletion immediately blocks new writes and schedules subscription
end/no renewal; it does not silently refund, restore allowance or create another
journal. Completion leaves a terminal erased aggregate. A future journal
requires a later explicit purchase and a new journal epoch.

## Notifications and Realtime

Diary notifications are downstream effects. Publishing succeeds even when a
notification provider is unavailable; failed delivery is retried and observable.

Client notifications:

- astrologer published a prompt;
- astrologer replied;
- a cycle was closed;
- paid access will end or renewal failed.

Astrologer notifications:

- client published an entry;
- response due soon;
- response overdue.

Push/email payloads contain no journal body, mood, birth data or attachment key.
Every action deep-links to the exact pair journal and relevant item. Category
`message` and fallback to Inbox are forbidden.

Realtime follows the existing durable database cursor plus SSE pattern, with
Diary-owned events and authorization. It does not reuse Messaging business
threads. Reconnect uses `Last-Event-ID`; missed events are replayed from the
authorized cursor.

## Routes and Role Surfaces

### Astrologer web

- `/journal`: subscriber list and selected journal composition;
- `/journal/:journalId`: canonical deep-linkable detail state;
- product configuration opens the exact AstroDiary product in `/products`, not
  the generic product list;
- client and chart controls carry the exact client/journal context.

### Client web

- `/me/astrologers/:astrologerUserId/journal`: canonical pair journal;
- subscription purchase and status stay scoped to the selected related
  astrologer;
- a client with multiple astrologers never sees a mixed diary feed.

The current client router has only `/me`; the new route is protected by current
account, relationship and journal policy. The reference “Глазами клиента” mode
may remain as an astrologer preview only if it is backed by the same production
view model; it is not a substitute for the real client route.

## Reference-to-Production UI Contract

### Exact reference inventory

The exact prototype surface is the internal `journal` state of
`ElevenHouseDesign/app/journal.jsx`; it has no standalone URL. Desktop uses the
astrologer app shell. Mobile is a separate demo composition. The real production
client page does not exist in the reference; “Глазами клиента” is a static
astrologer preview.

At the audited `1440 x 741` desktop viewport:

- sidebar: `248 x 741`;
- topbar: `1192 x 68`, padding `0 28`, gap `16`;
- journal subheader: `1192 x 60`, padding `0 20`, gap `12`;
- main content starts at `y = 128`;
- subscriber rail: `300 px` wide;
- detail header: approximately `69 px` high, padding `14 22`, gap `13`;
- explanation card: `680 x 87`, padding `12 15`, gap `11`, radius `20`;
- bubbles: maximum width `540`, padding `12 15`, radius `14`, body
  `13.5px/1.55`, author `12.5px/600`, date/meta `11px`;
- astrologer composer: maximum width `680`, padding `12 22 16`; prompt mode is
  approximately `268 px` high; textarea measured `546 x 69.5`; primary action
  approximately `125 x 37`.

Desktop subheader contains:

- book icon tile `34 x 34`, radius `10`;
- “Астродневник” and fixture count `4`;
- “Кабинет астролога” / “Глазами клиента” segmented switch;
- box icon and “Продукт”.

Subscriber rail exact semantics:

- kicker “ВЕДУТ ДНЕВНИК”;
- row about `60 px` high, padding `11 16`, gap `11`, avatar `38`;
- selected row uses `3 px` accent edge and accent-soft background;
- gold waiting dot is `11 x 11`;
- previews are “новая запись — ответьте”, `вы: {текст}` or “нет записей”.

Detail header reference copy/actions:

- client name and avatar `40`;
- “Ведёте вместе · N дней подряд” or “нет записей”;
- current-turn pill;
- “по карте” or “Привязать карту”;
- icon-only “В профиль клиента” action;
- client preview title “Мой астродневник”;
- client preview subtitle “Ведёт астролог {name} · так это видит
  {firstName}”.

Explanation exact copy:

> Клиент ведёт записи о состоянии и событиях; вы отвечаете заметками и шлёте
> вопросы-рефлексии. Каждая запись привязана к фазе Луны и транзитам.

Legend exact copy:

- “Запись клиента”;
- “Ваша заметка”;
- “Вопрос-рефлексия”.

Client-preview helper exact copy:

> Так дневник выглядит в кабинете клиента. Переключитесь на «Кабинет
> астролога», чтобы ответить.

Empty-state exact copy:

> Записей пока нет — отправьте первый вопрос-рефлексию.

Timeline bubble variants:

- client: surface background with moon-side border;
- astrologer visible note: accent-soft with accent-side border;
- prompt: warn-soft with gold border and uppercase “ВОПРОС”;
- metadata row: moon phase/sign, transit and mood dot/label;
- avatar `32`, row gap `12`.

Astrologer composer exact reference controls and text:

- “Ответить {first name}:”;
- modes “Вопрос-рефлексия” and “Заметка”;
- current sky fixture “Растущая Луна в Тельце”;
- prompt hint “Вопрос придёт клиенту в дневник — он ответит записью.”;
- note hint “Заметка-комментарий к записям клиента, видна ему в дневнике.”;
- AI action “AI-вопрос по Луне”;
- placeholders “Ваш вопрос для рефлексии…” and “Ваша заметка…”;
- actions “Отправить” and “Добавить”.

Reference suggestion chips:

1. “Что вы почувствовали на этом новолунии?”
2. “Какое решение далось легче обычного на этой неделе?”
3. “Где вы заметили тему Сатурна — ограничения или опоры?”
4. “За что благодарны в этом лунном месяце?”

Whitespace-only composer input disables publish with `opacity: 0.5` and
`cursor: not-allowed`. Textarea focus uses a translucent gold border and a
`3 px` soft ring. The client preview has only the dashed placeholder “Здесь
клиент пишет свою запись и отмечает настроение”; it is not an input.

Reference moods are `calm/спокойствие`, `joy/подъём`, `anxious/тревога`,
`tired/усталость`, `inspired/вдохновение`, and `sad/грусть`. The reference has
color dots only; the production emoji and score decision intentionally extends
this state.

At the audited mobile demo viewport:

- the prototype uses an artificial `420 x 662` phone frame, `30 px` radius,
  fake `40 px` status bar and `75 px` bottom navigation; these chrome elements
  are not copied;
- entry path is “Ещё” -> “Ведение и контент” -> “Астродневник”;
- list header is “Ведут дневник: 4” with “Продукт”;
- list padding is `12 14 28`, gap `10`, card `390 x 72`, padding `13 15`, radius
  `20`, avatar `44`;
- detail header is approximately `54 px`, avatar `36`, with back, client,
  context and turn controls;
- turn copy is “Начните дневник”, “Ваш ход” or “Ждём клиента”;
- feed padding is `14`, gap `13`;
- composer padding is `10 14 14`, with mode control, lunar context, horizontal
  suggestions, textarea and send icon;
- the suggestion rail measured `390 px` visible against `1191 px` scroll width.

Prototype-only access and onboarding copy is evidence, not product truth:

- upsell title “«Астродневник» — в тарифе Pro”;
- buttons “Позже”, “Перейти на Pro”, “Сравнить тарифы”;
- guide step “Совместный дневник” explains the product subscription;
- guide step “Чья очередь” explains the response status;
- controls “Далее”, “Назад”, “Понятно” and “Пропустить”.

The prototype's local add prepends an item, clears the draft and shows
“Вопрос отправлен клиенту” or “Заметка добавлена”. Its AI action only
concatenates hard-coded lunar copy with a fixture suggestion. Its Product,
client-profile, chart and toast actions all lose exact context. None of those
prototype state transitions is reused.

Known fixture defects are explicitly excluded from production: unsorted
timestamps, an “empty” preview for a client who has a prompt, hard-coded current
moon, inconsistent streaks, equal note/prompt color in the default gold theme,
and a toast category that opens Inbox.

### Visual elements retained

- 248 px desktop sidebar and 68 px shared topbar;
- 60 px AstroDiary subheader;
- 300 px subscriber rail on desktop;
- reference spacing, typography, colors, radii, borders and shadows;
- client/detail header, current-turn pill and context badge;
- explanation card and legend;
- client, astrologer-reply and prompt bubble treatments;
- prompt/reply composer modes, suggestion chips and primary send action;
- mobile list -> detail navigation and compact composer.

### Prototype behavior replaced

- hard-coded subscriber data -> network-backed journals;
- array-order status -> cycle/obligation state machine;
- deterministic “AI” string -> durable `gpt-5.5` draft command;
- hard-coded moon -> async context snapshot;
- fake tariff/localStorage -> real platform capability plus client entitlement;
- generic Product link -> exact product;
- generic Clients/Engine links -> exact client context;
- static client preview -> real client composer and route;
- message-category toast -> exact Diary deep link;
- streak -> allowance and due status;
- color-only mood dot -> emoji, label and supplementary color;
- prototype phone frame/fake status bar -> responsive web layout.

### Required production states

- loading skeleton, empty, access denied and relationship blocked;
- product draft/inactive and subscription payment pending/failed/ended/revoked;
- allowance available/exhausted and open-cycle continuation after period end;
- waiting for client, response due soon, overdue and closed;
- draft saved/saving/conflict, publish pending/failed/retry;
- unread/read and pagination/history loading;
- media uploading/processing/ready/failed/playback;
- astrology context pending/global-only/personal/failed/stale;
- AI pending/generating/ready/stale/refused/rate-limited/failed/unknown;
- edit marker, delete confirmation and tombstone;
- PDF export pending/ready/failed;
- offline/reconnect and stale-CAS recovery;
- desktop, tablet and narrow mobile layouts in RU and EN.

### Accessibility corrections

- segmented modes expose selected semantics (`radiogroup` or equivalent);
- journal list exposes selection and unread/status text semantically;
- every icon-only control has an accessible name and visible focus state;
- composer has an explicit label, described errors and keyboard operation;
- dialogs trap focus, mark the background inert and restore focus;
- status never relies on color alone;
- touch targets, contrast, headings and focus visibility meet WCAG 2.2 AA;
- horizontal prompt chips remain keyboard-scrollable and do not hide focus.

## Architecture

### Bounded contexts and ownership

`ClientSubscriptions` owns:

- immutable offer snapshot: product, price, currency, cadence, allowance, SLA
  and grants;
- subscription head and paid periods;
- cancellation and renewal lifecycle;
- application receipts for canonical capture/refund/chargeback events.

`ClientEntitlements` is the provider-neutral read-only policy boundary for
capability `astro_diary`. ClientSubscriptions is the only grant writer. The
entitlement permits `start_cycle`; it does not by itself grant continuation
after period end.

`AstroDiary` owns:

- journal identity bound to relationship;
- cycles and response obligations;
- visible timeline and immutable revisions/tombstones;
- author drafts and AI commands/drafts;
- mood, context references, attachment bindings and read cursors;
- realtime projection and PDF export commands.

`AstroDiaryAccessPolicy` combines relationship state, start entitlement, an
existing open cycle and response obligations into operation-specific decisions:
`read`, `start_cycle`, `continue_open_cycle`, `respond`, `close`, `edit` and
`erase`.

`AstroDiaryContentDerivatives` owns transcription, extraction, retrieval,
style profiles/exemplars and source-bound redaction. It cannot publish timeline
items or grant journal access.

`Media` continues to own object lifecycle, validation, processing and signed
access. Diary owns why an asset is attached and who may access its entry.

`Charts/BirthData` own calculations and source profiles. Diary stores immutable
context references and digests, not duplicate chart mechanics.

`Notifications` is downstream only. `Messaging` is not a Diary owner.

### Package and app placement

- `packages/domain/src/client-subscriptions/*`;
- `packages/domain/src/client-entitlements/*`;
- `packages/domain/src/astro-diary/*`;
- `packages/domain/src/astro-diary-content-derivatives/*`;
- `packages/contracts/src/client-subscriptions.ts`;
- `packages/contracts/src/astro-diary.ts`;
- `packages/db/src/schema/client-subscriptions/*` and adapters;
- `packages/db/src/schema/astro-diary/*` and adapters;
- `packages/db/src/schema/astro-diary-content-derivatives/*` and adapters;
- `apps/public-api/src/modules/client-subscriptions/*`;
- `apps/public-api/src/modules/astro-diary/*`;
- `apps/astrologer-api/src/modules/client-subscriptions/*` read surface where
  required;
- `apps/astrologer-api/src/modules/astro-diary/*`;
- `apps/payment-worker/src/client-subscriptions/*` for provider charge I/O and
  reconciliation;
- `apps/workers/src/client-subscriptions/*` for period/lifecycle timers and
  purpose-event application only;
- `apps/workers/src/astro-diary/*`, `astro-diary-content-derivatives/*` and
  `astro-diary-ai/*`;
- `apps/notification-worker` generic Diary notification handlers;
- app-owned routes/pages and focused `features/astro-diary/*` in both web apps.

Packages do not import apps; domain declares ports and does not import DB.
Controllers remain thin. State and IDs-only outbox are committed atomically.

### Target persistence

Client subscription tables:

- `client_subscription_contracts`;
- `client_subscriptions`;
- `client_subscription_periods`;
- `client_subscription_lifecycle_events`;
- `client_entitlement_grants`;
- capture and finance-revocation application receipts.

Finance recurring-payment tables:

- `finance_client_subscription_invoices`;
- `finance_client_subscription_charge_commands`;
- provider credential-purpose bindings and reconciliation receipts.

Diary tables:

- `astro_diary_journals`;
- `astro_diary_cycles`;
- `astro_diary_response_obligations`;
- `astro_diary_timeline_items`;
- `astro_diary_timeline_item_revisions`;
- `astro_diary_drafts`;
- `astro_diary_entry_attachments`;
- `astro_diary_context_snapshots`;
- `astro_diary_read_cursors`;
- `astro_diary_realtime_events`;
- `astro_diary_ai_commands`;
- `astro_diary_ai_attempts`;
- `astro_diary_ai_drafts`;
- `astro_diary_export_commands`;
- `astro_diary_erasure_commands`;
- idempotent event-application receipts.

Derivative tables:

- `astro_diary_derivative_commands`;
- `astro_diary_transcripts`;
- `astro_diary_document_pages`;
- `astro_diary_image_descriptions`;
- `astro_diary_retrieval_chunks`, exact vector column, journal filter and FTS
  index;
- `astro_diary_style_profiles`;
- `astro_diary_style_exemplars`;
- `astro_diary_derivative_redaction_receipts`.

Key constraints include at most one non-deleted current journal per
relationship, one open cycle per journal, nonnegative and mutually consistent
available/reserved/consumed allowance, author-role consistency, same-journal
attachment/context references, monotonic revisions and lifecycle head/event
consistency.

### API shape

Public API, scoped below the selected related astrologer:

- read offer/subscription/current period and allowance;
- start, schedule cancellation and cancel a scheduled ending before period end;
- read journal summary and cursor timeline;
- save/update/delete own draft;
- publish/edit/hide/request erasure of own entry and decline a prompt;
- create/complete diary upload and request signed read;
- read mood trend and astrology context projection;
- request/read PDF export and client-owned whole-journal deletion;
- SSE event stream.

Astrologer API:

- list journals with unread/due projection;
- read journal, cycle, allowance and cursor timeline;
- save/update/delete own draft;
- publish/withdraw an opening prompt, publish an atomic closing reply or
  reply-with-follow-up command;
- edit/hide/request erasure of own published item under the lifecycle matrix;
- create/complete diary media and signed read;
- request/read AI question or reply draft;
- explicitly publish an edited AI draft;
- request/read PDF export;
- SSE event stream.

All writes use CSRF, an idempotency key, strict shared contracts and CAS where
state is mutable. Cross-owner access fails closed. The browser never supplies an
authoritative client ID, entitlement, due date, allowance or astrology fact.

### Events and workers

Canonical activation chain:

```text
finance.client_order.capture_applied.v1
  -> finance dispatcher rehydrates the purpose-bound immutable contract
  -> client_subscription.capture_applied.v1
  -> subscription worker atomically creates or renews period and entitlement
  -> client_subscription.activated.v1 / period_renewed.v1
  -> Diary and Notifications update their projections
```

The existing generic `finance.economic_payment.capture_applied` event is not a
client-order signal and is never consumed as a subscription command. Canonical
online-sale capture must atomically emit the dedicated client-order event shown
above after applying the verified capture.
Each event type has one owner and one dispatcher. Where multiple downstream
projections need the same fact, the dispatcher writes durable per-consumer
deliveries; workers do not race for one outbox row as if it were a broadcast
log.

Required subscription events:

- `client_subscription.renewal_charge_requested.v1`;
- `client_subscription.capture_applied.v1`;
- `client_subscription.activated.v1`;
- `client_subscription.period_renewed.v1`;
- `client_subscription.cancellation_scheduled.v1`;
- `client_subscription.cancellation_revoked.v1`;
- `client_subscription.renewal_failed.v1`;
- `client_subscription.period_ended.v1`;
- `client_subscription.revoked.v1`;
- `client_subscription.entitlement_changed.v1`.

Required Diary events:

- `astro_diary.cycle_opened.v1`;
- `astro_diary.cycle_closed.v1`;
- `astro_diary.timeline_item_published.v1`;
- `astro_diary.response_obligation_created.v1`;
- `astro_diary.response_obligation_satisfied.v1`;
- `astro_diary.response_obligation_overdue.v1`;
- `astro_diary.context_generation_requested.v1`;
- `astro_diary.derivative_generation_requested.v1`;
- `astro_diary.ai_generation_requested.v1`;
- `astro_diary.export_requested.v1`;
- `astro_diary.erasure_requested.v1`.

Media owns `media.asset_ready.v1`; Diary consumes that fact and does not emit a
duplicate media-ready event. Notifications consumes the canonical Diary facts
or explicit `notifications.delivery_requested.v1` deliveries, never several
overlapping “reply/prompt/item” events for one publish.

Payloads contain schema version and IDs only. Journal body, mood, birth data,
attachment keys, transcripts and AI prompts never enter outbox payloads or
application logs. Consumers rehydrate under current authorization and use
fenced claims, retries, quarantine and idempotent application receipts.

The recurring-payment contour must also produce canonical succeeded full-refund
and observed-chargeback evidence. The current ArcPay contract has no distinct
post-capture reversal or terminal chargeback-resolution event; the product does
not invent either state. Sellability readiness requires exact handling of the
provider facts that do exist, including permanent write revocation on the first
canonical chargeback observation.

### Observability and typed failures

Metrics and traces cover subscription activation/renewal/revocation lag,
allowance conflicts, open and overdue obligations, notification lag, media
processing, context generation, AI command outcomes, stale-source rejection,
PDF generation and SSE reconnect/replay.

Logs use IDs and safe codes, never journal body or sensitive attachment content.
Dashboards split provider failures, known validation failures and
`outcome_unknown` so ambiguous external operations are not retried blindly.

Representative typed failures:

- `RELATIONSHIP_NOT_ACTIVE`, `RELATIONSHIP_BLOCKED`;
- `ASTRO_DIARY_ENTITLEMENT_REQUIRED`, `ALLOWANCE_EXHAUSTED`,
  `OPEN_CYCLE_EXISTS`;
- `SUBSCRIPTION_PAYMENT_PENDING`, `SUBSCRIPTION_PAYMENT_FAILED`,
  `SUBSCRIPTION_PAYMENT_OUTCOME_UNKNOWN`, `SUBSCRIPTION_REVOKED`;
- `DIARY_REVISION_CONFLICT`, `ITEM_AUTHOR_MISMATCH`,
  `ITEM_HAS_DEPENDENT_RESPONSE`;
- `TIMEZONE_REQUIRED`;
- `ATTACHMENT_UPLOADING`, `ATTACHMENT_PROCESSING`, `ATTACHMENT_FAILED`;
- `TRANSCRIPTION_FAILED`, `DOCUMENT_EXTRACTION_FAILED`,
  `RETRIEVAL_INDEX_UNAVAILABLE`;
- `ASTRO_CONTEXT_PENDING`, `ASTRO_CONTEXT_FAILED`, `ASTRO_CONTEXT_SOURCE_STALE`;
- `AI_RATE_LIMITED`, `AI_PROVIDER_REFUSED`, `AI_PROVIDER_UNAVAILABLE`,
  `AI_PROVIDER_TIMEOUT`, `AI_OUTPUT_INVALID`, `AI_MODEL_PROVENANCE_INVALID`,
  `AI_SOURCE_STALE`, `AI_OUTCOME_UNKNOWN`;
- `EXPORT_FAILED`, `NOTIFICATION_DELIVERY_FAILED`.

No typed failure is replaced by fake success, guessed data, another model,
hard-coded astrology text or a silent simplified mode.

## Current-State Gaps and Prerequisites

The repository already has product taxonomy for `sub`, subscription period and
access grant `journal`, but this is only taxonomy:

- client commerce intentionally lists only `once` and `pack` products;
- paid-product fulfillment explicitly returns
  `client_subscription_fulfillment_unsupported`;
- no client subscription, paid-period or entitlement tables exist;
- client overview subscription counts are placeholders;
- canonical client-order capture does not emit a client-order purpose event;
  the existing generic economic-payment capture event explicitly excludes this
  path, and no client-subscription dispatcher exists;
- orders do not yet bind an immutable client-subscription contract containing
  allowance, cadence, SLA and grants;
- client-product recurring invoices, credential purpose, charge commands,
  scheduler and reconciliation do not exist;
- a symmetric full-refund/observed-chargeback entitlement revocation event is
  missing;
- `/journal` and the client journal route do not exist;
- existing Media supports private assets/audio, but not Diary client-upload
  purposes and authorization;
- Notifications is not yet a complete generic in-app notification domain.

Therefore UI work cannot honestly precede the subscription and entitlement
prerequisites. The product remains inactive for sale until capture activation,
renewal, cancellation, full-refund/chargeback revocation and reconciliation are
proven.

The database is prelaunch and empty, so the target schema is introduced once in
canonical form. No backfill, compatibility layer, legacy route, dual schema or
preservation code is created. Committed Drizzle history remains immutable; the
implementation adds the next focused forward migration and proves full lineage
with a local reset.

## Implementation Sequence

These are dependency stages for one production-ready outcome, not separate
product releases or an MVP promise.

1. Freeze current contracts and characterize existing AI, commerce, finance,
   media, relationship and realtime behavior.
2. Complete recurring finance prerequisites: immutable contract binding,
   client-product credential purpose, invoice/charge scheduler, dedicated
   client-order and client-subscription capture-applied events, and canonical
   full-refund/observed-chargeback evidence.
3. Implement ClientSubscriptions and ClientEntitlements end to end.
4. Extend the AstroDiary product template and enable orderability only behind
   proven fulfillment readiness.
5. Implement AstroDiary domain, schema, authorization, timeline, cycles,
   allowance, SLA and APIs.
6. Add realtime cursors, media/voice, context snapshots, content derivatives,
   hybrid retrieval, export and cascade deletion.
7. Add isolated transcription and AstroDiary AI commands with
   `gpt-4o-transcribe`, `text-embedding-3-large` and `gpt-5.5` worker
   compositions.
8. Add notifications with exact journal deep links.
9. Implement astrologer and client web surfaces from real contracts.
10. Run full network-backed E2E, responsive/accessibility checks and measured
    reference parity until computed styles and screenshots match.

## Verification Strategy

### Domain and contract tests

- product invariant tests for fixed template and configurable fields;
- subscription state-machine tests for initial capture, duplicate capture,
  renewal, scheduled cancellation, failed retry, end and finance revocation;
- allowance and cycle tests for both initiators, open-cycle uniqueness, period
  end, reserve/consume/release, prompt expiry, unused expiry and finance
  revocation;
- SLA golden tests for weekday counting, evening/weekend publish, DST gap/fold,
  timezone display and period end;
- author ownership, draft CAS, dependent edit/hide matrix, correction,
  tombstone/erasure and read-cursor tests;
- RU/EN strict request/response and typed-error contracts.

### Database and worker tests

- PostgreSQL constraints and transaction/concurrency races;
- state plus outbox atomicity;
- purpose-bound immutable contract digest and purpose-event dispatch;
- duplicate event application, worker crash recovery, fencing, retry and
  quarantine;
- no duplicate charge, period, allowance consumption, timeline item, AI draft
  or notification;
- full-refund/chargeback revocation and entitlement reconciliation;
- media ready-only binding, signed-read authorization and orphan cleanup;
- context snapshot checksum and stale-source behavior;
- derivative source lineage, invalidation, hybrid retrieval scoping and cascade
  redaction across transcripts, extraction, embeddings, AI and exports.

### AI quality and non-regression tests

- AstroDiary always requests literal `gpt-5.5`, validates the observed family
  and records separate child attempts for generation and review/refine;
- voice transcription always requests `gpt-4o-transcribe`; semantic retrieval
  embeddings always request `text-embedding-3-large`;
- strict structured output, source manifest, one review pass and no auto-send;
- stale checksum cannot overwrite a changed draft;
- refusal, invalid output, rate limit, timeout and unknown outcome are explicit;
- client draft, deleted item, unrelated journal, unlisted CRM source and raw
  media URL never leak;
- frozen representative RU/EN eval cases compare current-entry-only, whole
  history and selected-context variants;
- human astrologer pairwise review scores specificity, groundedness, useful
  reflection, voice match and naturalness;
- existing dictionary, chart, matrix, numerology, Human Design and Flow AI
  tests keep their exact model/profile/prompt/request behavior;
- current AI rate-limit and runtime-config assertions remain green.

The AI regression gate also freezes current `ASTROLOGER_AI_*` and
`WORKERS_FLOW_CHART_AI_*` defaults, existing profiles, prompt versions,
structured request shapes, feature policies and usage evidence. New AstroDiary
configuration lives under its own worker namespaces.

An LLM judge may provide a regression signal but cannot be the final quality
gate because published studies show position, verbosity and model-family bias.

### Authorization and security tests

- client, astrologer and combined-role matrix;
- unrelated pair, inactive/blocked relationship, exhausted allowance, ended
  period, open obligation and revoked subscription;
- CSRF, idempotency, CAS and cross-owner foreign-key attempts;
- event/log/privacy checks proving no body or raw object key emission;
- signed media expiry and replay;
- SSE authorization and cursor replay.

### Browser and visual evidence

- real local DB, real roles and network data for both apps;
- desktop, tablet and mobile reference viewports;
- loading, empty, active, due, overdue, exhausted, ended, failure and retry
  states;
- compose, mood, attachment, voice, AI draft/edit/publish, edit/delete, export,
  renewal failure and cancellation scenarios;
- keyboard navigation, focus order, modal focus, accessible names, contrast and
  screen-reader semantics;
- console and network free of unexpected errors;
- screenshots plus DOM/computed-style measurements for dimensions, padding,
  gaps, typography, colors, borders, radii, shadows, overflow and z-index.

Targeted checks expand through contracts, domain, DB, both APIs, workers, both
web apps and affected shared packages, then the repository verification gate
and empty-local-DB reset. A live OpenAI canary is run only with available local
credentials and explicit external-spend authority; mocked provider tests alone
are not reported as provider E2E evidence.

## Definition of Done

AstroDiary is complete only when:

- an astrologer can configure, activate and sell the fixed subscription product;
- verified payment activates the correct period and allowance exactly once;
- cancellation, renewal failure, period end and finance revocation have proven
  semantics;
- both roles can complete all reserve/accept/decline/expire/response/close cycle
  paths with real persistence and media;
- obligations, due/overdue, read state, context and entitlement survive reloads;
- recurring invoices and provider charges are contract-bound, reconciled and
  purpose-dispatched without reading mutable product configuration;
- AI produces editable `gpt-5.5` drafts without changing existing AI behavior;
- voice transcription, content derivatives and same-journal hybrid retrieval
  have source lineage and cascade erasure;
- no AI output is client-visible before explicit astrologer publish;
- PDF export and deletion/redaction work in active and defined read-only states;
- notifications deep-link to the exact journal without Inbox fallback;
- authorization, concurrency, worker recovery and observability gates pass;
- both production UIs match the exact reference language for corresponding
  states through measured browser evidence;
- all requested scope is implemented and verified, with no fallback, fake
  success, compatibility shim or unreported residual blocker.

## Research Evidence

Accessed 2026-08-11:

- Day One Shared Journals: pair/shared journal expectations and private shared
  history: <https://dayoneapp.com/guides/shared-journals/shared-journals/>.
- CoachAccountable Journal Entries: coach-client journaling and response
  workflow: <https://www.coachaccountable.com/knowledgeBase/journalEntries>.
- Quenza Threaded Comments: guided activity discussion patterns:
  <https://help.quenza.com/article/88-using-threaded-comments>.
- Stripe subscription lifecycle and entitlements, used as provider-independent
  lifecycle reference rather than copied provider storage:
  <https://docs.stripe.com/billing/subscriptions/overview> and
  <https://docs.stripe.com/billing/entitlements>.
- HAILEY AI-in-the-loop study: assistance can improve measured empathetic
  language while a human remains the responder:
  <https://www.nature.com/articles/s42256-022-00593-2>.
- OpenAI GPT-5.5 model reference for the selected provider model and Responses
  API capability: <https://developers.openai.com/api/docs/models/gpt-5.5>.
- OpenAI GPT-4o Transcribe reference for the dedicated speech-to-text model:
  <https://developers.openai.com/api/docs/models/gpt-4o-transcribe>.
- OpenAI File Transcription and vision input-format contracts, used to require
  explicit OGG and AVIF derivatives:
  <https://developers.openai.com/api/docs/guides/speech-to-text> and
  <https://developers.openai.com/api/docs/guides/images-vision>.
- OpenAI text-embedding-3-large reference for multilingual semantic retrieval:
  <https://developers.openai.com/api/docs/models/text-embedding-3-large>.
- pgvector 0.8.6 installation, exact search, filtered-query and hybrid-search
  guidance: <https://github.com/pgvector/pgvector>.
- PostgreSQL extension availability semantics:
  <https://www.postgresql.org/docs/17/sql-createextension.html>.
- ArcPay's current provider contract for recurring saved-card idempotency,
  timeout reconciliation, refunds and chargeback events:
  <https://api.arcpay.space/openapi.json>.
- Lost in the Middle: long context can underuse relevant information depending
  on position: <https://aclanthology.org/2024.tacl-1.9/>.
- Retrieval-Augmented Generation: retrieved source memory can improve
  specificity and factuality on suitable tasks:
  <https://proceedings.neurips.cc/paper/2020/hash/6b493230-Abstract.html>.
- Self-Refine: bounded feedback and revision can improve generation:
  <https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html>.
- G-Eval: model-based evaluation can correlate with humans but has model-output
  preference bias: <https://aclanthology.org/2023.emnlp-main.153/>.
- WCAG 2.2: <https://www.w3.org/TR/WCAG22/>.

## Written Design Review Checklist

- Product unit is a bounded cycle, not a message: yes.
- Price, cadence, allowance and response SLA are explicit: yes.
- Normal end preserves accepted work; finance revocation does not create unpaid
  work: yes.
- One pair, one current journal, one open cycle: yes.
- Private drafts and published items are distinct: yes.
- Prototype visible note is not confused with a private CRM note: yes.
- Mood uses emoji plus internal score; streak removed: yes.
- Astrology context is automatic, immutable and never guessed: yes.
- Attachments and voice use real private Media lifecycle: yes.
- AI is default for the astrologer, `gpt-5.5`, editable and never auto-sent: yes.
- Existing AI prompts, model mappings and runtime defaults remain unchanged: yes.
- No pause, groups, team access, public links, Inbox fallback, crisis scanning,
  JSON export or E2EE claim: yes.
- No legal or separate permission workflow has been invented: yes.
- No backward-compatibility or migration shim is proposed: yes.
- Current subscription/finance-revocation prerequisites are stated rather than
  hidden: yes.
- Visual reference is preserved without copying prototype state: yes.
