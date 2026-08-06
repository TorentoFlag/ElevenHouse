# Flows Production Module Design

Date: 2026-08-02
Status: implementation design baseline
Product label: `Воронки`
Internal/API name: `flows`
Primary route: `/flows` in `astrologer-web`

## 1. Outcome

Build Flows as the durable practice-orchestration capability of ElevenHouse.
It must coordinate work across CRM, Booking, Products/Orders, BirthData,
Charts, AI, Messaging, Notifications, AstroCalendar and Analytics without
taking ownership of those modules' business state.

The end state is not a canvas demo and not a generic Zapier clone. A published
flow is an executable, versioned operating procedure for one astrologer's
already-related clients. It can enroll a subject from a normalized domain
event, evaluate eligibility, select exactly defined branches, wait for time,
events or human decisions, invoke owning-module commands idempotently and
explain every outcome through an immutable run trace.

## 2. Scope

### In scope

- product vocabulary, templates and authoring lifecycle;
- typed versioned graph contracts and publish validation;
- optimistic draft concurrency and immutable published versions;
- normalized event enrollment, re-entry and exit policies;
- durable execution, waits, approvals, retries, recovery and cancellation;
- explicit adapters to owning modules;
- safe simulation with no production side effects;
- gallery, template picker, builder, run history and approval/work-item UI;
- desktop and mobile reference parity for approved states;
- dashboard, CRM, Inbox and AstroCalendar projections;
- operational metrics and goal-based conversion when attribution is defined;
- security, consent, redaction, audit and plan/capability gates;
- automated, PostgreSQL integration, API/worker and browser evidence.

### Not in the first runtime slice, but part of the target module

- external message send;
- client-visible result delivery;
- AI output sent without review;
- payment initiation or mutation;
- arbitrary webhooks;
- A/B splits, parallel fan-out/fan-in and graph cycles;
- revenue attribution without an explicit goal and attribution contract.

These capabilities are phased, not silently discarded. They become available
only after their owning modules and action-time safety gates are real.

### Permanently out of product scope

- public astrologer discovery, recommendation or cross-promotion;
- a public integration marketplace;
- browser-local execution or browser-owned business state;
- cross-owner audience access;
- hidden fallback sends, fake success or prototype-only runtime behavior.

## 3. Product Model

### Primary actor

The astrologer owns definitions, activation, approvals and operating outcomes.
The client is a subject and possible recipient only when an explicit
owner-client relationship exists. Internal staff workflows remain in
`admin-api` and are not added to this module.

### Jobs to be done

1. Make practice preparation and follow-up repeatable without forgotten work.
2. Collect missing client information before a consultation or calculation.
3. Coordinate chart calculations and draft preparation without duplicating
   astrology mechanics in Flows.
4. Route sensitive or client-visible output through explicit human review.
5. Reduce routine work while preserving consent, tone and owner control.
6. Explain why a subject entered, waited, branched, failed, was suppressed or
   completed.
7. Measure operational health before claiming marketing or revenue impact.

### Product promise

An astrologer can answer all of these questions from the product:

- What starts this flow?
- Who can enter and re-enter it?
- What happens next?
- Which version is active?
- Where is each subject now?
- What is waiting for me, the client, a timer or another module?
- Why did a branch or suppression happen?
- Was an external effect actually accepted, delivered or reconciled?
- Can I stop or safely retry the run?

## 4. Current-State Verdict

The existing implementation is a useful foundation, not a production
automation runtime.

### Keep

- owner-scoped flow CRUD;
- immutable `flow_versions` and run-to-version pinning;
- runtime events, runs, step runs, approvals, delivery attempts and
  suppressions schema foundation;
- booking transactional outbox producer and retrying relay pattern;
- authenticated API surfaces and validated shared contracts;
- gallery/builder route, Dashboard approval projection and Inbox context intent;
- fail-closed `auto_send` posture.

### Correct before activation is trustworthy

- `buildExecutionPlan` currently marks reachable nodes complete without
  executing domain effects and traverses all outgoing branches;
- approval decisions update only the approval row and do not resume a step/run;
- node config is `Record<string, unknown>` and the inspector exposes raw JSON;
- draft writes have no revision predicate and can silently overwrite each
  other;
- published definitions have no clean edit-as-next-draft lifecycle;
- manual-run retries can create a new dedupe key from a new browser timestamp;
- non-client subject types are not resolved and authorized against their
  owning aggregate;
- consent/channel/quiet-hours/frequency/provider gates are not wired at action
  time;
- Inbox builds context by fetching runs for every flow and resolves a current
  node title from mutable draft data instead of the pinned version;
- the current canvas and mobile layout do not match the reference interaction
  model.

Until the durable interpreter replaces this behavior, activation, event
enrollment and manual execution must fail closed for unsupported graphs. No UI
state may present a planned traversal as completed execution.

## 5. Design Reference Decisions

Visual truth comes from the exact Flows states in `ElevenHouseDesign/` and the
live `localhost:8000/ElevenHouse.html` surface inspected on 2026-08-02.

### Preserve

- gallery hierarchy and dense operational cards;
- template-first creation modal;
- desktop three-column studio: palette, canvas, inspector;
- category colors, compact node cards and semantic branch labels;
- selected-node inspector with progressive disclosure;
- top-level save/publish/activation/simulation distinction;
- mobile flow list, vertical step timeline and bottom sheets;
- Dashboard `Задачи из воронок` projection;
- AI inspector depth when real AI node contracts become available.

### Adapt for production

- use `@xyflow/react` as the canvas projection, never as the executable model;
- use a stable left-to-right Dagre layout for new nodes while persisting manual
  presentation positions separately;
- replace raw JSON with node-kind-specific forms and inline validation;
- make template creation the primary path and blank creation secondary;
- show activation blockers and capability requirements before activation;
- make simulation choose a real test subject/event and show selected edges,
  values and blocker reasons;
- make mobile an operational monitoring, work-item, approval and node-config
  surface; graph structural add/delete/connect/reorder remains desktop-only in
  v2 because neighbor swapping is not safe DAG semantics;
- show operational metrics until explicit goal attribution exists;
- keep published versions read-only and offer `Создать новую версию`.

### Do not copy

- timer-based fake traversal;
- static fake AI responses;
- prototype-only client counts and conversion values;
- `Полный автомат` before action-time delivery gates exist;
- hidden modal content in the accessibility tree;
- mobile neighbor swapping as arbitrary graph semantics;
- visual success that is not backed by persisted runtime evidence.

### Add

- validation/issues panel with focus-to-node behavior;
- version history and active-version indicator;
- tabs for Builder, Runs, Approvals and Settings;
- selected-flow tabs query only that flow; the global operational Inbox and
  Dashboard aggregate work items/approvals across flows through a dedicated
  server projection;
- run timeline with inputs, selected edge, outputs, attempts and reasons;
- explicit retry/redrive/cancel controls with eligibility explanations;
- keyboard add/connect/delete alternatives, undo/redo and focus restoration;
- non-color execution and validation states;
- graph-size performance fixtures at 50, 100 and 250 nodes.

## 6. Definition Lifecycle

### Flow aggregate

`Flow` is the stable astrologer-owned identity. It contains product metadata,
current draft revision, `latestPublishedVersionId`, `activeVersionId` and an
enrollment state. Runtime never executes the mutable draft. `FlowVersion`
records are immutable and do not carry mutable active/paused status.

### Draft lifecycle

```text
editable -> validatable -> publishable
         -> conflict (409, explicit resolution)
```

Every mutation sends `expectedRevision` and an idempotency key. A successful
mutation increments `revision`. A stale mutation returns the current revision
and does not overwrite it.

### Published lifecycle

```text
draft revision N --publish--> immutable version V
flow enrollment: inactive -> active(version V) -> paused -> active(version V or V+1)
```

- Publish atomically validates and stores the exact graph and policy snapshot.
- The version also pins `executionSemanticsVersion`, every node executor
  contract version and immutable references required to interpret the graph.
- A run always pins `flowVersionId` and never changes version.
- Editing a published flow creates or updates the next draft revision.
- Publishing a new version updates `latestPublishedVersionId`; it does not
  switch `activeVersionId`, rewrite existing runs or enroll historical events.
- Explicit activation uses compare-and-swap on expected active version and
  draft/flow revision, validates capabilities/resources and creates a durable
  activation epoch with `effectiveFrom` and later `effectiveTo`.
- `Pause enrollment` closes the current activation epoch and prevents new
  runs. Existing runs continue by default and the UI states that explicitly.
- `Stop active runs at safe boundary` is a separate confirmed command.
- A global/per-owner/per-capability external-action kill switch prevents new
  external dispatches without erasing run/wait state.
- Archive prevents activation and preserves history.

## 7. Graph Contract

The new executable contract is `flow-graph.v2`. Existing v1 drafts require an
explicit migration; existing published v1 graphs remain readable but cannot be
activated unless compiled into supported v2 semantics.

### Separation

```text
FlowGraphV2        executable business contract
FlowPresentation  positions, viewport, collapsed state
FlowDraftState     revision, dirty/saved/conflict UI state
```

Canvas coordinates, array order and current selection never define execution.

### Node schema

Each node is a discriminated union by exact `kind`. Its config is a strict,
typed schema with unknown fields rejected. Common metadata contains stable id,
display title, config schema version and executor contract version, but
executable fields live in the kind's config. Worker deployments keep every
executor version referenced by a non-terminal run; changing implementation
code must not silently change the semantics of an in-flight published graph.

Initial executable kinds:

- trigger: `booking_confirmed`, `manual_client`;
- condition: `birth_data_available`;
- wait/human: `astrologer_work_item`, `astrologer_approval`;
- terminal: `completed`, `suppressed`, `failed`.

The V2 configuration and outcome matrix is closed, not extensible by unknown
JSON fields:

| Kind | `configSchemaVersion` | Strict config | Outgoing handles |
| --- | --- | --- | --- |
| `booking_confirmed` | `1` | one or more unique owner-scoped product UUIDs | exactly one `next` |
| `manual_client` | `1` | empty object | exactly one `next` |
| `birth_data_available` | `1` | purpose fixed to `service_preparation` | exactly one `true` and one `false` |
| `astrologer_work_item` | `1` | `consultation_preparation` task, executable title, optional instructions and priority | exactly one `success` |
| `astrologer_approval` | `1` | approval kind/title and optional bounded expiry | exactly one `approved` and one `rejected`; exactly one `timeout` iff expiry is configured |
| `completed` | `1` | stable analytics `goalKey` | none |
| `suppressed` | `1` | stable `reasonCode` | none |
| `failed` | `1` | stable `errorCode` | none |

All initial nodes pin `executorContractVersion: 1`. A compiler capability
manifest states which exact executor contracts and owning-module capabilities
the graph requires; it does not claim those executors are deployed or ready.
Static unknown capability blocks publish. Exact deployed-version, resource,
and provider readiness is mutable activation evidence. Channel consent remains
Messaging-owned evidence for a future external-send node; it is not a
BirthData, Charts or AI activation prerequisite.

Next capability slices add:

- waits: `delay_for`, `wait_until`, `wait_for_event`;
- bounded control: `repeat_until` with a required maximum attempt count,
  timeout and terminal outcome;
- calculations: `calculate_chart` and completion signal;
- AI: `reply_draft`, `interpretation_draft`, `content_draft`;
- messaging: `message_draft`, `send_message`;
- products/orders, AstroCalendar and content actions;
- explicit goal nodes for conversion analytics.

### Edge schema

Edges carry a typed `sourceHandle`:

```text
next | true | false | success | error | timeout | approved | rejected
```

Publish validation applies a node-kind/handle/target compatibility matrix.
Only a condition can emit `true` and `false`; each required branch exists
exactly once. Error and timeout edges are available only to node kinds that
define those outcomes.

### Initial execution topology

- exactly one trigger;
- directed acyclic graph;
- one execution token per run;
- a condition chooses exactly one branch;
- no implicit parallel fan-out;
- no fan-in merge: any `in-degree > 1` is invalid, including reconvergence of
  mutually exclusive condition branches;
- no cycles;
- all reachable non-terminal paths end at a terminal node;
- configurable graph/node/edge limits are validated before publish.

The V2 transport schema has hard safety caps of 200 nodes and 400 edges. The
compiler also receives validated policy limits at or below those caps; a
stricter plan/tenant limit is a publish blocker, not a parser relaxation.

Parallel split/join and arbitrary graph cycles require a future graph schema
with formal token and join semantics. They are not inferred from multiple
edges. Repeated reminders/data checks use the typed `repeat_until` composite,
whose internal attempt counter, wait policy, maximum duration and terminal
outcome are explicit; users cannot draw an unbounded back edge.

V1 remains a read/export legacy format. New create/update/publish commands
target V2 only after the control-plane migration reaches that command surface.
V1 drafts require explicit deterministic migration; a node without a lossless
mapping is a visible blocker, never a guessed conversion. Existing published
V1 stays readable and non-activatable. Existing broad V1 templates remain
versioned but unavailable until their owning capabilities have strict V2
contracts.

### Reference capability traceability

`Implement` means the target module includes the capability after its listed
prerequisite and slice. `Defer` means it remains visible only as unavailable
template documentation or is omitted from the palette; it cannot publish or
activate. `Reject` means the prototype behavior itself is not a product
capability. Every implemented row requires strict contract, domain behavior,
real adapter/integration test, operational trace and browser acceptance.

#### Triggers

| Reference trigger | Decision | Owning producer/prerequisite | Slice |
| --- | --- | --- | --- |
| New lead | Implement | CRM/direct-page relationship event | 7 |
| Product purchase | Implement | Orders/Payments confirmed lifecycle | 7 |
| Incoming message | Implement | Messaging deduplicated inbound event | 6-7 |
| Astrology event | Implement | AstroCalendar saved event occurrence | 7 |
| Segment change | Implement | CRM segment version + audience expansion | 7 |
| Form completed | Implement | Client action/Clients typed form event | 4/7 |
| Booking confirmed | Implement first | Booking transactional outbox for every confirmation path | 2 |
| Schedule/date | Implement | durable timer/timezone policy | 4 |
| Review received | Implement | Reviews producer/moderation-safe state | 7 |
| Subscription renewal/churn | Implement | Subscription lifecycle | 7 |
| Chart ready | Implement | Charts calculation completion signal | 4 |
| Journal entry | Defer until owner exists | Journal domain/event contract | 7+ |

#### Actions and delivery

| Reference action | Decision | Owning module/prerequisite | Slice |
| --- | --- | --- | --- |
| Send message | Implement gated | Messaging consent/capability/delivery/reconciliation | 6 |
| Request client/birth data | Implement | Singleton Clients/BirthData profile plus Flow-owned astrologer work item; no consent/grant or generic client-action framework in the first path | 4 |
| Build/calculate chart | Implement | Charts canonical command/result | 4 |
| Offer slot | Implement later | Booking availability/hold command | 7 |
| Request payment | Implement later | Orders/Payments idempotent request, no money mutation in Flows | 7-8 |
| Deliver result/material | Implement gated | owning calculation/content artifact + client access + delivery | 6-7 |
| Open access | Implement later | Products/Subscriptions access grant | 7 |
| Issue certificate | Defer | dedicated certificate/content ownership and verification | 8+ |
| Update tag/segment | Implement | CRM command and loop/re-entry protection | 7 |
| Create task | Implement as `FlowWorkItem` | Flows work-item lifecycle; unified Tasks only as projection | 2 |
| Outbound webhook | Defer | signed destination registry, secret storage, allowlist, retry/reconciliation | 8+ |
| Publish content | Implement later | Content moderation/publishing command | 7 |

#### Calculation actions

| Reference calculation | Decision | Prerequisite | Slice |
| --- | --- | --- | --- |
| Natal chart | Implement first | canonical saved chart calculation | 4 |
| Transits | Implement later | production saved transit mode | 7 |
| Progressions | Defer until mode ready | canonical Charts mode | 7+ |
| Directions | Defer until mode ready | canonical Charts mode | 7+ |
| Solar/lunar returns | Implement when mode ready | canonical return calculation | 7 |
| Synastry | Implement when mode ready | two authorized clients/participants | 7 |
| Composite | Defer until mode ready | canonical Charts mode | 7+ |
| Horary | Implement when saved mode ready | canonical horary calculation | 7 |
| Astrocartography | Defer until mode ready | canonical saved astrocartography mode | 7+ |
| Vedic | Defer | approved method/version and canonical engine | 8+ |
| Child chart | Defer | guardian/minor consent and product policy | 8+ |
| Numerology | Implement later | saved owner-scoped calculation | 7 |
| Destiny Matrix | Implement later | saved owner-scoped calculation | 7 |
| Human Design | Implement later | saved current-checksum calculation | 7 |

#### Content, AI, logic and handoff

| Reference node | Decision | Prerequisite | Slice |
| --- | --- | --- | --- |
| Public/subscriber post | Implement later | Content/Subscription moderation and publishing | 7 |
| Broadcast | Implement gated | audience snapshot + Messaging/Notifications safety | 7-8 |
| AI classify/summarize/extract | Implement later | typed input/output, minimization and reviewed use | 7 |
| AI score | Defer until decision policy | explainable bounded schema; cannot silently deny service | 8+ |
| AI reply draft | Implement reviewed | Messaging draft + checksum approval | 6 |
| AI content draft | Implement reviewed | Content draft + moderation | 7 |
| AI interpretation/preparation draft | Implement reviewed first | saved calculation + minimized context + approval | 5 |
| If/else | Implement first | typed operands and exactly two branches | 2 |
| Data available | Implement first | authorized owning-module read port | 2/4 |
| Consent check | Implement gated | purpose-specific consent read and action-time recheck | 4/6 |
| Reply received | Implement | Messaging correlated inbound event | 6 |
| Chart condition | Implement later | canonical calculation read port | 4/7 |
| Segment split/filter | Implement | CRM audience snapshot | 7 |
| Percentage/A-B split | Defer | explicit goal, stable assignment and sufficient volume | 8+ |
| Delay/wait until/wait for event | Implement | timer/signal runtime | 4 |
| Bounded repeat | Implement | max attempts/duration and terminal outcome | 4 |
| Handoff to astrologer | Implement as work item/approval | separate human-object semantics | 2/5 |
| Live video session | Implement as booking/session handoff | Booking/Session owns actual meeting lifecycle | 7 |
| Prototype fake AI/test execution | Reject | replaced by real simulation/executor | n/a |
| Prototype `Full auto` default | Reject | controlled auto-send is a later gated capability | n/a |

#### Templates

| Reference template | Decision | First complete slice |
| --- | --- | --- |
| Preparation for live session | Implement first product E2E | 5 |
| Async recorded reading | Implement | 7 |
| Lead magnet to upsell | Implement | 7 |
| Sleeping-client reactivation | Implement gated | 7-8 |
| No-show protection | Implement | 7 |
| Automatic content drafts | Implement reviewed | 7 |
| Solar forecast | Implement when return mode ready | 7 |
| Couple compatibility | Implement when participant/consent contour ready | 7 |
| Numerology portrait | Implement | 7 |
| Destiny Matrix | Implement | 7 |
| Human Design | Implement | 7 |
| Astrology journal reflections | Defer until Journal domain exists | 7+ |
| Blank custom flow | Implement with capability validation | 1 |

## 8. Enrollment, Re-entry And Exit

These are separate versioned policies.

### Enrollment

A normalized event contains:

```text
ownerUserId
source
sourceEventId
eventKind
subjectType
subjectId
occurrenceKey
occurredAtUtc
payloadSchemaVersion
allowlistedPayload
classification
redactionVersion
retentionPolicyId
dedupeKey
```

The event is stored once. Trigger matching selects active versions. A subject
resolver validates the owning aggregate and returns canonical client/context
identifiers before a run can be created.

Two identities are distinct:

- source ingestion: `(registeredSource, sourceEventId)` with canonical payload
  hash; same key/different payload is quarantined as a provenance conflict;
- flow enrollment: `(ownerUserId, flowId, triggerDefinitionId,
  policyScope, occurrenceKey)`.

Enrollment uniqueness is scoped to stable `flowId`, not `flowVersionId`.
Publishing a new version therefore does not re-enroll an old booking/order
occurrence. In one transaction the matcher selects the activation epoch whose
`effectiveFrom <= occurredAt < effectiveTo`, applies the policy, inserts the
unique run and pins that epoch's version. This event-time rule prevents a late
v1 occurrence from silently changing semantics after v2 activation.

Events outside the configured lateness horizon remain stored with an explicit
`late_unmatched` outcome. Automatic backfill is off. Backfill is a separate
previewable, idempotent command with its own campaign id, audience/occurrence
scope and audit record.

### Re-entry

Initial policies:

- `once_per_subject`;
- `once_per_occurrence`;
- `after_previous_completed`;
- `always`, only for explicitly safe manual flows.

The default booking policy is `once_per_occurrence`, where occurrence is the
booking id. Duplicate webhook/outbox delivery cannot create a second run.
`once_per_subject` and `after_previous_completed` are also scoped to stable
`flowId` across versions unless a future explicit product policy says
otherwise.

### Exit

Exit conditions can stop a run before another step is claimed. Examples:

- booking canceled;
- owner-client relationship revoked;
- required birth-data readiness is no longer satisfied;
- order refunded/canceled;
- owner manually stops this client/run;
- flow-level time-to-live expires.

Relationship and provider capability are rechecked immediately before an
external action; channel consent remains a Messaging-owned requirement for a
later send. Birth-data access is not a consent workflow: it is rechecked by
the active relationship and the required booking/service context.

## 9. Durable Runtime

### Source of truth

PostgreSQL is authoritative for definitions, versions, runs, tokens, attempts,
waits, signals, approvals, suppressions and trace. BullMQ can wake a worker or
carry an owning-module job, but losing a queue item cannot lose a flow.

### Run states

```text
pending | running | waiting | action_required | failed_retryable
failed_terminal | suppressed | canceling | canceled | completed | expired
```

Public run status is a deterministic projection. It is not the mutation
authority. Persisted token states are:

```text
runnable | claimed | waiting_timer | waiting_signal | waiting_external
waiting_work_item | waiting_approval | retry_scheduled
completed | failed | canceled
```

External effect state is separate:

```text
prepared -> dispatched -> waiting_result
waiting_result -> succeeded | failed | outcome_unknown
outcome_unknown -> reconciled_succeeded | reconciled_failed
```

Queue/job acceptance can move an effect to `dispatched`; it cannot select a
`success` edge or complete the action.

### Normative token transition matrix

| Current | Event | Guard and atomic writes | Next | Duplicate/stale behavior |
| --- | --- | --- | --- | --- |
| `runnable` | claim | DB time due; short transaction locks row, increments fencing token, stores owner/lease | `claimed` | another claimant skips locked row |
| `claimed` | pure success | CAS on token/state/lease owner/fence; append attempt+trace+selected edge and next token | next `runnable`/wait/terminal | zero rows means stale worker; discard result |
| `claimed` | retryable failure | same fence CAS; append failure and bounded `retryAt` | `retry_scheduled` | stale result discarded |
| `claimed` | permanent failure | same fence CAS; append failure and choose explicit error edge or terminal | next/`failed` | stale result discarded |
| `claimed` | external dispatch | same fence CAS; insert unique effect+command outbox+trace | `waiting_external` | existing semantic command is replayed, never duplicated |
| `claimed` | lease expires | recovery transaction verifies expired DB-time lease and increments fence | `runnable` | old owner can no longer finalize |
| `waiting_timer` | timer due | lock wait+token; consume one timer signal and append trace | `runnable` | duplicate timer signal is no-op |
| `waiting_signal` | matching signal | lock/CAS unmatched signal+wait+token; append trace | `runnable` | consumed signal cannot resume twice |
| `waiting_external` | result signal | unique effect correlation; update effect and select success/error outcome only for terminal provider result | `runnable`/`failed` | duplicate exact result replays; conflict quarantined |
| `waiting_work_item` | completed | pending item, authorized assignee, expected item revision | `runnable` | repeat returns prior result; stale revision conflicts |
| `waiting_approval` | approved/rejected | pending approval, payload checksum and actor valid | `runnable`/`failed` | repeat replays; stale payload conflicts |
| any non-terminal | cancel | increment token fence; record cancel request and expire pending waits/actions where safe | `canceled` or run `canceling` | repeated cancel replays |

### Race precedence

- Every contender uses row lock or compare-and-swap; the first committed valid
  transition wins, not wall-clock callback order.
- Cancel increments the fence. A later stale pure completion is rejected. An
  already dispatched external result is recorded for reconciliation but cannot
  restart the canceled token.
- Approve versus expire and work-complete versus cancel lock the same pending
  row; the loser receives the committed terminal result.
- Signal-before-wait is retained and consumed atomically when the wait is
  created; wait-before-signal is consumed by the signal handler.
- Snooze does not advance a token. It moves the item/approval due time and
  remains actionable when it returns to pending.
- Timeout may follow a typed `timeout` edge; run-level `expired` is used only
  when policy terminates the run rather than continuing it.

### One-transition rule

The interpreter advances one token through one transition at a time in three
bounded phases:

1. A short claim transaction uses `FOR UPDATE SKIP LOCKED`, assigns lease owner,
   expiry and a monotonically increasing fencing token, then commits.
2. The worker loads the pinned semantics and performs bounded pure/read work
   outside the transaction. External provider work is not performed here.
3. A short finalize transaction updates with predicate `(token_id, claimed
   state, lease_owner, fencing_token)`, asserts one affected row and atomically
   writes outcome/next state/trace or external command+outbox intent.

No future step is marked completed in advance.

Provider calls and long-running owning-module work never happen while holding
the claim transaction open. A separate owning worker executes the durable
command idempotently and returns a completion/failure signal. Lease, timer and
retry comparisons use database time to avoid worker clock skew.

### Recovery

A sweeper independently discovers:

- runnable unclaimed tokens;
- expired leases;
- due timers;
- snoozed or expired approvals;
- retryable attempts whose `retryAt` is due;
- dispatched effects that need reconciliation.

BullMQ wake-up loss increases latency but does not violate correctness.
Sweeps use bounded batches and database time. Long but bounded pure work may
heartbeat only with matching lease owner/fence; every finalize write still
uses fence CAS. Repeatedly invalid events/signals enter a visible quarantine
with reason, count and operator correlation instead of blocking the batch.
Retry ceilings are persisted, and tests inject failure before/after claim,
dispatch-intent commit, outbox publish, provider acceptance, result signal and
finalize commit.

## 10. Conditions, Waits And Signals

### Conditions

Conditions are pure domain decisions. They return selected handle, a redacted
input summary and an explicit reason. They do not mutate another module.

The initial `birth_data_available` condition calls an owner-scoped BirthData
read port with astrologer, client, booking and purpose `service_preparation`.
The port authorizes the active explicit client--astrologer relationship and the
required booking/service context, then reads the client's single canonical
profile. It distinguishes `available`, `missing` and `access_denied` without
leaking existence across owners. `available`/`missing` select `true`/`false`;
`access_denied` creates an explicit authorization suppression/failure and never
masquerades as missing data. The trace stores a redacted readiness decision and
profile revision/audit reference, never raw birth data. Relationship or context
loss before read is re-evaluated by the owning module.

### Timers

Wait config records user intent and timezone policy. Enrollment resolves a UTC
instant from an IANA timezone and stores both the intent snapshot and `dueAt`.
DST gaps/overlaps have explicit policy and test fixtures. A due timer produces
an idempotent signal; it does not depend on an in-memory timeout.

### External signals

Owning modules emit normalized completion/change events through transactional
outbox. A signal inbox deduplicates them and resumes only a token that is
waiting for the matching event kind, correlation id and pinned version.

Signals are persisted even when they arrive before the interpreter reaches its
wait node. Wait creation atomically checks the inbox and can consume an already
received matching signal. `occurredAt` and `receivedAt` are both retained so
late or out-of-order events follow an explicit node policy rather than arrival
order.

## 11. Human Work Items And Approvals

These are separate domain objects. They share an operational Inbox/Dashboard
projection but not write semantics.

### Flow work item

A `FlowWorkItem` represents work the astrologer must perform. It stores run,
token, step/version, task kind, title/instructions, assignee, priority, due/SLAs,
completion requirements, result summary, revision and timestamps.

```text
pending -> in_progress -> completed
pending/in_progress -> snoozed -> pending
pending/in_progress/snoozed -> canceled | expired
```

Completion uses expected item revision and an idempotency key, records actor and
result, advances the waiting token and appends trace in one transaction.
Snooze changes availability/due state only and never advances the flow.

The first work item is owned by Flows because its lifecycle is inseparable from
a run. It may later project into a unified Tasks module without introducing a
premature cross-module task write model.

### Flow approval

A `FlowApproval` protects an immutable candidate payload or action. It stores
run/token/step/version, approval kind, redacted preview, payload checksum,
candidate revision, approver scope, due/expiry, decision/note and timestamps.

```text
pending -> approved | rejected | expired
pending -> snoozed -> pending
```

Approval/rejection is one transaction that verifies owner, pending state,
candidate revision and checksum, records actor/decision, advances through the
typed edge and appends trace. Editing a candidate creates a new candidate
revision/checksum before approval; an old approval cannot authorize changed
content. Snooze does not approve or advance anything.

Cancel closes pending work/approvals where safe and increments the token fence.
Expiry follows an explicit timeout edge or terminal policy.

## 12. Side Effects, Retries And Redrive

Flows never writes another module's tables directly.

### Node executor registry

Each executable action binds to a domain port in the worker composition root:

```text
node kind -> typed executor -> owning-module command/use case -> outbox/job
```

The registry exposes capability metadata used by publish and activation
validation. Missing executor or provider setup is a blocker, not a fallback.

External node execution has two durable boundaries:

1. Flows records a uniquely keyed command/outbox intent and moves the token to
   `waiting_external` in one transaction.
2. The owning module executes/replays the command and emits a correlated
   completion, permanent failure or unknown-outcome signal.

Flows never treats queue acceptance as business completion.
Each node contract defines its completion milestone. For example, a Messaging
node may wait for provider `accepted`, platform `sent` or provider `delivered`;
those are distinct owning-module outcomes and the UI/trace names the one used.
Generic effect `succeeded` means that declared milestone was reached, never
merely that a worker started.

### Idempotency

Each externally observable effect receives a persistent key derived from run,
step and semantic purpose. The owning module stores/replays the command result.
BullMQ `jobId` can be an additional guard but is not the authority.

HTTP command idempotency is scoped by `(apiSurface, actorId, ownerUserId,
routeTemplate, resourceId, Idempotency-Key)`. The record stores a canonical
request hash, command status and exact status/body replay for the documented
retention window. `expectedRevision` is part of the request hash. Reusing a key
with different content returns a typed `409`; concurrent equal requests elect
one writer and replay its result. Create, publish, activate/pause/stop, manual
start, cancel, redrive, work-item completion and approval decision all use this
contract.

### Failures

- transient: bounded exponential backoff with jitter;
- rate-limited: explicit provider retry instant;
- permanent: error edge or terminal failure;
- unknown-after-dispatch: reconciliation before retry;
- exhausted: terminal failure with retry/redrive eligibility.

### Redrive

Redrive keeps the same pinned flow version, creates lineage and reruns only
eligible failed work. Previously successful externally visible effects are not
blindly repeated.

### Cancellation

Cancellation prevents new claims immediately. In-flight external work moves to
reconciliation; the UI must not promise that an already accepted provider
action was undone.

## 13. Integration Boundaries

| Module | Produces for Flows | Flows may request | Flows must not do |
| --- | --- | --- | --- |
| CRM/Clients/BirthData | relationship, profile and data-change events | owner-scoped reads, tag command later | bypass relationship or mutate profile tables |
| Client action surface | form/birth-data/material-action completion events | create a typed relationship-scoped action request | expose graph internals or another owner's request |
| Booking | confirmed/canceled/rescheduled/no-show/completed | read booking context | own booking transitions or slot rules |
| Products/Orders/Payments | claim/purchase/payment/order lifecycle | payment request through owning use case later | mutate money, ledger or order state |
| Charts | calculation completed/failed | idempotent calculation command | calculate astrology in browser/runtime |
| AI | draft completed/failed | minimized draft command | expose raw sensitive data or auto-send output |
| Messaging | inbound, delivery and capability events | draft/send command after gates | call provider directly or infer consent |
| Notifications | delivery outcomes | transactional reminder request | hide provider failures |
| AstroCalendar | global/client event occurrences | create prefilled draft/manual start | become the automation engine |
| Analytics | consumes append-only facts | none in command path | infer conversion from UI counters |

Cross-surface UI reads use server-side projections. Inbox must request flow
context for visible client/thread ids; it must not fetch every flow and every
run or resolve titles from mutable drafts.

### Client-facing contour

Flows does not expose its builder/runtime API to clients. When a flow needs
client input, it asks the owning module to create a typed `ClientActionRequest`
linked to astrologer relationship, booking/order purpose and run correlation.

`public-api`/`client-web` provide owner-branded, relationship-scoped reads and
commands for:

- requested birth-data completion;
- requested questionnaire/form completion;
- client material acknowledgment when delivery exists;
- channel/purpose opt-out and communication preferences.

Client state is explicit:

```text
unavailable | needs_input | submitting | submitted
accepted | expired | canceled | validation_error | retryable_error
```

Submission goes through the owning Clients/BirthData/Products module, not
Flows. Its transaction updates the one canonical birth profile through CAS,
records immutable history/audit actor and emits a typed profile-update/readiness
event. The signal resumes the waiting flow token idempotently after it rechecks
readiness. The client sees only the requested task, astrologer identity,
purpose, deadline and privacy context, never node ids, prompts, internal traces
or audience logic. An active linked astrologer may instead receive the ordinary
work item and enter the same profile on the client's behalf.

### Segment and broadcast enrollment

A segment trigger creates a `FlowAudienceJob`, not one run whose subject is an
entire mutable segment. The job stores the owner-scoped segment/query version,
selection instant, immutable member-id snapshot or reproducible snapshot
reference, policy and total count. It expands in bounded pages into one
independent client run per eligible member.

- each client keeps normal relationship, re-entry, consent and suppression
  checks;
- partial ineligibility is counted with explicit reasons;
- progress reports selected, enrolled, suppressed, failed and completed;
- owner and global throttles bound expansion and later delivery rates;
- cancel stops future expansion and applies the chosen safe-boundary policy to
  created runs;
- dynamic segment changes do not rewrite an existing audience snapshot;
- mass outbound remains disabled until Messaging safety and unsubscribe
  acceptance are complete.

## 14. Security, Privacy And Trust

### Authorization and provenance

| Operation | Principal | Required authority |
| --- | --- | --- |
| create/edit/validate/publish | authenticated astrologer | owns flow and every referenced resource |
| activate/pause/stop/archive | authenticated astrologer | owns flow; capability and plan gates pass |
| simulate/manual start | authenticated astrologer | owns flow and typed subject aggregate |
| cancel/redrive | authenticated astrologer | owns run; transition is eligible |
| complete work item | assigned authenticated astrologer | owner, assignee and expected revision match |
| decide approval | authorized authenticated astrologer | owner, candidate revision and checksum match |
| submit client action | authenticated/authorized client | relationship, request token/id and purpose match |
| ingest domain event/signal | registered internal producer identity | strict schema; owner derived from owning aggregate, never trusted from payload |
| claim/execute/recover | dedicated worker identity | least-privilege DB/queue capability; no user impersonation |

Normalized producers are registered by event kind and schema version. The
adapter loads or validates the owning aggregate and derives `ownerUserId`; a
caller-supplied owner field is only consistency data and cannot grant access.

### Payload and retention policy

Each event kind has a strict field allowlist, maximum serialized size,
classification (`internal`, `sensitive`, `restricted`), redaction version,
retention-policy id and optional consent-purpose/version references. Runtime
events never embed complete message bodies, raw birth datasets, card/payment
payloads, credentials or generated documents. They carry identifiers, state,
checksums and the minimum fields required for trigger matching.

The append-only audit envelope contains sequence, ids, event kind, timestamps,
actor/source, outcome code, selected handle, correlation and hashes. Sensitive
details live in separately authorized/encrypted referenced records and are
tombstonable. Erasure/anonymization replaces subject references and removes
detail payload according to the accepted data policy while preserving the
minimal non-identifying audit envelope unless a legal hold requires otherwise.
Simulation details are not persisted by default.

Numeric retention periods are not guessed in this spec. The data-governance
policy must assign them before a sensitive event/AI/delivery capability can be
activated; absence of a policy fails closed and no node can extend retention.

- All definitions, references, runs and reads are owner scoped.
- Subject resolvers validate `client`, `booking`, `order`, `segment` and event
  ids against their owning modules.
- Manual start accepts an idempotency key and a typed subject; arbitrary
  payload is not authorization.
- Referenced products, templates, segments and channels are validated at
  publish/activation and again where mutable authority matters.
- External actions are preflighted by Flows, but the owning module repeats the
  relationship, purpose-specific consent, opt-out, channel capability, quiet
  hours, frequency and plan checks atomically when accepting its command. It
  persists the consent record/purpose/version used. This closes the
  check-to-dispatch revocation window.
- AI prompts and traces use minimized/redacted context; secrets and raw
  credentials are forbidden in graph config and trace.
- Trace and snapshots follow the classification/retention policy above and are
  redacted at write time, not only when rendered.
- Sensitive approvals and external sends carry audit actor and correlation id.
- Runtime errors are typed and observable; no silent default or fallback text.
- `auto_send` remains unavailable until messaging-safe delivery passes its
  complete acceptance matrix and has an owner kill switch.

## 15. Persistence Additions

The current schema is extended rather than replaced.

Expected additions/refinements:

- `flows.revision`, draft presentation metadata, `latestPublishedVersionId`,
  `activeVersionId` and enrollment state;
- immutable activation epochs with effective interval and actor;
- versioned trigger/enrollment/re-entry/exit policy snapshot;
- pinned execution-semantics and node-executor versions;
- execution token/current activation representation;
- step attempt number, lease owner, lease expiry, fencing token, retry time and
  dispatch/reconciliation state;
- external effect/command state and semantic idempotency key;
- durable waits/timers;
- idempotent signal inbox;
- append-only `flow_run_events` with monotonic per-run sequence;
- separate work items and approvals, including revisions, checksum where
  applicable, due/expiry and snooze lifecycle;
- audience expansion jobs/snapshots for segment triggers;
- redrive lineage;
- indexes for runnable work, due waits, expired leases and owner-facing reads;
- DB constraints for owner/version/run consistency and dedupe.

Schema work follows the repository baseline-migration and local `db:reset`
runbook. No production reset is allowed.

Production uses an expand-contract reconciliation under advisory lock. The
implementation records the exact accepted legacy baseline hashes, rejects an
unknown migration history, verifies schema/data guards, applies transactional
DDL where PostgreSQL permits it, backfills in bounded resumable batches,
validates counts/constraints, updates the migration ledger and makes a repeated
run a verified no-op. Contract/drop work occurs only after all deployed code
uses the expanded schema and in-flight v1 policy is reconciled. Exact hashes
are captured from current main in the implementation plan because the shared
baseline can change before schema execution; they are never guessed here.

## 16. API Surface

Definition/control plane:

```text
GET    /flow-templates
GET    /flows
POST   /flows
GET    /flows/:flowId
PATCH  /flows/:flowId/draft              expectedRevision + idempotency
POST   /flows/:flowId/validate
POST   /flows/:flowId/publish             expectedRevision + idempotency
POST   /flows/:flowId/activate            versionId + expected active/revision
POST   /flows/:flowId/pause-enrollment
POST   /flows/:flowId/stop-runs
POST   /flows/:flowId/archive
POST   /flows/:flowId/simulate
GET    /flows/:flowId/versions
```

Runtime/operations:

```text
POST   /flows/:flowId/manual-runs          typed subject + idempotency
GET    /flows/:flowId/runs
GET    /flow-runs/:runId
POST   /flow-runs/:runId/cancel
POST   /flow-runs/:runId/redrive
GET    /flow-approvals
POST   /flow-approvals/:approvalId/decision
GET    /flow-work-items
POST   /flow-work-items/:workItemId/start
POST   /flow-work-items/:workItemId/complete
POST   /flow-work-items/:workItemId/snooze
GET    /flow-contexts?clientIds=...
```

Client-facing owning-module surface in `public-api` (route names remain owned
by the corresponding Clients/BirthData/Products module):

```text
GET    /me/action-requests
GET    /me/action-requests/:requestId
POST   /me/action-requests/:requestId/submit
POST   /me/communication-preferences/opt-out
```

Simulation can target a draft revision and returns a typed trace marked
`simulation`. It never invokes production side-effect adapters.

All mutations use existing cookie auth/CSRF metadata. Commands that can create
or advance durable state require idempotency. Owner-scoped not-found behavior
must not leak another owner's resource.

## 17. Frontend Architecture

`FlowsPage` remains app-owned composition. Feature code is split by concern:

```text
features/flows/contracts/view models
features/flows/model/definition*
features/flows/model/runtime*
features/flows/api/*
features/flows/ui/gallery/*
features/flows/ui/builder/*
features/flows/ui/runs/*
features/flows/ui/approvals/*
```

The canvas adapter maps `FlowGraphV2 + FlowPresentation` to React Flow nodes
and edges. Changes map back through typed editor commands; React Flow state is
never posted as an executable contract.

Built-in node/template/status copy uses translation keys and never enters the
executable graph as localized control values. User-authored client-facing
content declares supported RU/EN variants or an explicit locale policy;
activation fails for a required recipient locale with no approved variant.
AI language/tone is typed config, not inferred from browser locale.

### Required UI states

- loading, empty, gallery success and retryable list error;
- template picker and blank-flow path;
- draft clean/dirty/saving/saved/conflict/error;
- validation warnings/blockers and focus-to-node;
- published read-only and create-next-version;
- activation blocked/active/paused;
- simulation input/validating/running/success/blocked/error;
- run pending/running/waiting/approval/retry/failure/completed/canceled;
- work item pending/in-progress/snoozed/completed/expired/canceled;
- approval pending/approved/rejected/snoozed/expired;
- client action unavailable/input/submitting/submitted/accepted/
  expired/canceled/error in `client-web`;
- desktop and mobile responsive states;
- keyboard, focus, reduced motion and long RU/EN strings.

## 18. First Product End-to-End Outcome

Template: `Подготовка к подтверждённой консультации`.

The user-visible outcome is not satisfied by creating a generic task. The
consultation is `prepared` only after required client data is available, a real
canonical chart calculation has completed, a preparation brief candidate has
been reviewed and the astrologer has completed the preparation work item.

### Authoring

1. Astrologer chooses the template and the booking product/calculation policy.
2. The typed graph exposes required Booking, Client/BirthData, Charts and AI
   capabilities and its manual-review posture.
3. Publish creates immutable v1; explicit activation pins it in an epoch.
4. Activation is rejected if any referenced capability, executor version,
   required client-data action or retention policy is unavailable.

### Runtime

```text
booking.confirmed
  -> resolve owned booking, client, purpose and occurrence
  -> dedupe once per booking across flow versions
  -> authorized birth_data_available
     -> missing: create Clients/BirthData client action request
                 -> wait for birth-profile update/readiness event with bounded timeout
                 -> on timeout create an astrologer work item or terminate
     -> available: continue
  -> dispatch idempotent canonical chart calculation
  -> wait for chart.completed/chart.failed signal
  -> request minimized AI preparation-brief draft
  -> wait for AI result; no silent fallback
  -> create checksum-bound astrologer approval for the brief
  -> after approval create due preparation work item
  -> astrologer completes the work item
  -> terminal goal consultation_prepared
```

The client action is visible in `client-web` under the linked astrologer and
submits canonical data through Clients/BirthData. No outbound message is
implied; a future Messaging node may notify the client only after its own
safety slice. Chart mechanics remain in chart-engine/chart-worker. AI receives
minimized approved context and cannot send or deliver its output.

Reload shows the pinned version and executor semantics, trigger, birth-data
readiness decision, selected edge, waits, chart and AI command/result correlations,
approval candidate checksum, work-item actor and terminal goal. Duplicate
booking/client/chart/AI signals do not duplicate runs or effects. Pause
enrollment blocks later bookings but does not rewrite this run.

### Runtime-spine acceptance before the full outcome

Implementation may first prove the same durable interpreter with an internal
template named `Контроль подготовки`: booking -> authorized data condition ->
one reached `FlowWorkItem` -> terminal. This is an engineering acceptance
fixture, not the shipped product promise and not completion of this product
E2E.

Every code path that creates a confirmed booking must emit the same normalized
event contract. The first browser proof may use a manual booking, but paid and
provider-confirmed booking transitions cannot remain permanently outside the
producer inventory.

## 19. Capability Roadmap To End State

### Slice 0: integrity gate

- stop unsupported activation/manual/event execution from creating false
  completion;
- label existing planning responses honestly;
- preserve definition data and readable history.

### Slice 1: definition control plane

- graph v2 typed contracts;
- revision/conflict handling;
- publish/next-version lifecycle;
- compiler/validation/capability manifest;
- template-first creation.

### Slice 2: durable runtime spine

- token interpreter, leases, trace and recovery sweeper;
- booking subject resolver and enrollment;
- birth-data condition;
- separate flow work item and approval transitions;
- internal `Контроль подготовки` runtime-spine acceptance fixture.

### Slice 3: studio and operations parity

- React Flow/Dagre builder;
- typed inspectors and validation panel;
- real simulation;
- run detail, approvals, mobile timeline and Dashboard/Inbox projections.

### Slice 4: client data, waits and calculations

- duration/date/event waits with timezone/DST policy;
- client action request and `client-web` birth-data completion contour;
- chart calculation command and completion/failure signal;
- missing-data wait and recovery;
- consultation-preparation template expansion.

### Slice 5: reviewed AI and first product E2E

- minimized AI preparation-brief and later delivery-draft actions;
- checksum-bound approval/edit/reject;
- preparation work item and `consultation_prepared` terminal goal;
- complete first product E2E acceptance;
- message/material drafts only after the preparation outcome;
- run history for generated artifacts.

### Slice 6: messaging-safe delivery

- relationship/consent/opt-out/quiet-hour/frequency/provider checks;
- delivery attempts, retries and reconciliation;
- manual approve/send;
- kill switch and operational alerting.

### Slice 7: orders, AstroCalendar, content and analytics

- paid async reading and lead-magnet producers;
- AstroCalendar prefilled handoff and event enrollment;
- content drafts and post-session flows;
- goal nodes, operational metrics and evidence-based attribution.

### Slice 8: controlled automation expansion

- per-flow/channel auto-send only after complete safety acceptance;
- parallel split/join only through a new graph schema; bounded repeat remains
  the v2 safe alternative to arbitrary cycles;
- plan limits and advanced templates.

## 20. Metrics

Initial trustworthy metrics:

- active runs;
- waiting on time/event/client/astrologer;
- pending approvals/work items;
- completed, suppressed, canceled and failed runs;
- retry rate and terminal failure rate;
- median completion and waiting duration;
- approval edit/reject rate;
- manual work completed;
- delivery success and opt-out rates when delivery exists.

`Conversion` requires a typed goal node and a documented attribution window.
Before that, the UI shows `-` or an honest operational metric, never a guessed
number.

## 21. Testing And Evidence

### Domain and property tests

- typed node config and unknown-field rejection;
- allowed handle matrix;
- one trigger, reachability, terminal paths and acyclic topology;
- exactly one selected branch;
- state transition matrix;
- enrollment/re-entry/exit and occurrence dedupe;
- activation-epoch event-time selection and no-backfill default;
- wait and DST policies;
- separate work-item and approval completion/reject/snooze/expire semantics;
- signal-before-wait, out-of-order and late-event policies;
- error classification and retry exhaustion.

### Real PostgreSQL integration

- two-writer draft conflicts and concurrent publish;
- concurrent publish/activate/enroll with stable occurrence uniqueness;
- event/run/work-item dedupe;
- claim/lease fencing and expired-worker recovery;
- stale-worker finalize rejection for every token outcome;
- transition plus trace/outbox atomicity;
- signal dedupe, signal-before-wait and timer wake-up;
- external effect prepared/dispatched/result/unknown/reconciliation states;
- cancellation races and reconciliation state;
- executor-version compatibility for in-flight runs across deployment;
- owner-composite constraints and no cross-owner reads.

Fake query builders do not satisfy this level.

### API and worker

- authenticated owner scoping and no-leak 404;
- CSRF and idempotency replay;
- parallel same-key replay, different-payload conflict and revision binding;
- typed 400/409/conflict responses;
- booking outbox -> enrollment -> worker execution;
- worker crash before/after transition and action dispatch;
- failpoints before/after claim, fence finalize, outbox publish, provider
  acceptance, early result signal and reconciliation;
- transient/permanent/rate-limit failures;
- inactive-relationship or missing-context rejection before birth-data read and
  profile mutation, plus cross-owner subject/source rejection;
- unavailable capabilities fail closed.
- missing required RU/EN client-content variant blocks activation rather than
  falling back silently.

### Frontend behavior

- complete state matrix listed above;
- conflict resolution and retry;
- published read-only behavior;
- typed inspector behavior;
- one-path simulation explanation;
- server-backed run and approval reload.

### Runtime E2E

With existing services running under explicit lifecycle authority:

1. authenticate as astrologer and create from the consultation-preparation
   template;
2. edit and prove a real two-writer `409` conflict;
3. publish v1, publish v2 without switching, then explicitly activate one
   version;
4. confirm a real owned booking and observe one run/one selected branch;
5. in the missing-data fixture, open `client-web` and submit canonical birth
   data, or let the active linked astrologer enter it through the ordinary work
   item; prove one readiness recheck and resume after reload/replayed signal;
6. observe one real chart command/result and one minimized AI brief result;
7. approve the exact brief candidate, complete the separate work item and
   observe `consultation_prepared` with the pinned version;
8. replay booking/chart/AI events and prove no duplicate run/effect;
9. pause enrollment and prove a later booking is not enrolled while the
   existing run remains intact;
10. inspect console, network, persisted reads and ordered trace.

Separate deterministic E2E fixtures exercise, rather than conditionally skip:

- work item start, complete, snooze, return-to-pending, expire and cancel;
- approval approve, reject, snooze, return-to-pending, checksum conflict and
  expire/timeout edge;
- cancel before claim, during pure work and after external dispatch;
- transient retry, permanent failure, outcome-unknown reconciliation and
  eligible redrive;
- relationship or booking/service context lost before read and before profile
  mutation;
- late event, early signal and concurrent active-version switch.

### Design parity and accessibility

- exact reference/production screenshots at `1440x900`, `390x844` and a narrow
  `320x568` reflow stress viewport, with equivalent data and state;
- measured geometry, typography, colors, borders, shadows and overlays;
- open/closed modal, selected node, validation, disabled and runtime states;
- RU and EN long-string fixtures, 200% zoom/reflow, VoiceOver exercise,
  keyboard-only canvas alternative, focus containment/return, live
  announcements, semantic labels, touch targets, contrast and reduced motion;
- no hidden overlays in the accessibility tree.
- zero unexpected console errors and zero unexplained failed/duplicate network
  requests in every acceptance scenario;
- artifacts under `.design-qa/flows/<slice>/<state>/<viewport>/` with reference,
  production, measurements, network summary and intentional deviations.

### Repository gate

- targeted red/green commands per slice;
- affected integration surface;
- `pnpm verify`;
- docs checks and `git diff --check`;
- fresh browser evidence artifacts.

## 22. Rollout And Migration

- Runtime deploys in `definition_only` mode by default. Moving to `canary` or
  `enabled` is an explicit operational change backed by readiness evidence.
- Canary enrollment is restricted to an owner allowlist and executable
  capability allowlist; canary state is visible, not a hidden fake-success
  fallback.
- Global, per-owner and per-capability kill switches block new enrollment or
  external dispatch independently. They preserve state for diagnosis/resume.
- Worker drain stops new claims, lets bounded claimed work finalize or expire
  its lease, and leaves waits/signals durable. Rollback never requires deleting
  runtime rows or pretending queued work completed.
- Existing v1 definitions remain visible and exportable.
- A deterministic migration converts only node kinds with complete v2 config;
  unresolved nodes become explicit validation blockers.
- Existing v1 active state is fail-closed until compiled capabilities are
  supported; no fake execution is preserved for compatibility.
- Schema changes rebuild the current baseline and run the required local reset.
- Production follows the fail-closed hash/guard/backfill/ledger reconciliation
  in section 15 before new code depends on expanded columns.
- Activation is enabled capability by capability after integration and browser
  evidence; an unavailable node remains a visible blocker.
- Existing runs are inventoried before deploy. Unsupported v1 rows remain
  readable and non-executable; supported in-flight versions retain their
  pinned executor versions. No migration rewrites historical success.
- Operational dashboards alert on stuck leases, overdue timers, retry
  exhaustion, signal mismatches and delivery reconciliation.

## 23. Architecture Alternatives

### Chosen: PostgreSQL durable state machine

It matches the current modular monolith, existing runtime tables and outbox
patterns, keeps one execution authority and supports atomic product-facing
trace. BullMQ can reduce wake-up latency without owning correctness.

### Deferred: Temporal generic graph interpreter

Temporal provides durable event history, timers, signals and retries. It does
not remove the need for typed dynamic-graph semantics and would add a second
execution authority, interpreter-code versioning and a new operational
platform. Revisit only when measured scale or deployment topology proves the
PostgreSQL executor inadequate and a bounded spike demonstrates simpler total
operations.

### Rejected: BullMQ as primary workflow engine

Queue retention, delayed-job timing and job-lifecycle dedupe are unsuitable as
the permanent product audit and version authority. Human waits, redrive lineage
and recovery would still require a database state machine.

### Rejected: browser/local executor

It cannot survive reload, enforce authorization, coordinate idempotent side
effects or provide trustworthy history.

### Rejected: copy the prototype runtime

Its timed traversal and static AI samples are visual demonstrations, not
business execution.

## 24. Adopted Working Decisions

These decisions use the user's 2026-08-02 instruction to take end-to-end
product and architecture responsibility, preserve the reference where valid
and add/remove capabilities when justified by evidence. A later direct user
instruction can supersede them.

- First guaranteed outcome: preparation for a confirmed consultation.
- First product outcome includes client data completion, canonical chart,
  reviewed preparation brief and completed flow-owned preparation work item.
- Flow work items and approvals are separate write models and share only an
  operational projection.
- Default approval posture: internal automation plus manual human completion;
  no external auto-send.
- Draft editing: optimistic revision; published versions immutable.
- Mobile: monitoring, work-item/approval and typed node configuration; no graph
  structural editing in v2.
- Conversion: hidden/unavailable until explicit goal attribution exists.
- Publishing does not switch active version. Pause enrollment lets existing
  runs continue; stop-runs and external kill switch are separate commands.
- Runtime authority: PostgreSQL; BullMQ transport only; Temporal deferred.

## 25. Definition Of Done

The Flows module is complete only when:

- current product/architecture/API/security docs match the implementation;
- typed graph contracts and version lifecycle are enforced end to end;
- no unsupported graph can activate or claim execution success;
- enrollment and side effects are idempotent and owner scoped;
- conditions, waits, signals, work items, approvals, external effects, retries,
  cancellation and recovery have real durable semantics;
- every action goes through an owning-module port/use case;
- run history explains the exact pinned version and selected path;
- the complete consultation-preparation product flow passes client, chart, AI,
  approval/work-item and runtime E2E;
- every reference capability has the implement/defer/reject disposition in
  section 7, and every `Implement` row passes its listed acceptance evidence
  before the module is called complete;
- gallery, builder, mobile, run and approval surfaces have reference-comparison
  evidence for all approved states;
- real PostgreSQL concurrency/recovery tests, API/worker tests, accessibility
  checks and `pnpm verify` pass;
- external delivery remains disabled until its full consent/provider/retry/
  reconciliation acceptance is proven;
- no required evidence is replaced by mocks, component-only checks or
  prototype behavior.

## 26. Research Sources

Accessed 2026-08-02:

- [HubSpot workflow creation and enrollment](https://knowledge.hubspot.com/workflows/create-workflows?ref_type=adv)
- [HubSpot re-enrollment](https://knowledge.hubspot.com/workflows/add-re-enrollment-triggers-to-a-workflow)
- [Customer.io workflow builder](https://docs.customer.io/journeys/send/workflows/builder/)
- [Customer.io wait-until semantics](https://docs.customer.io/journeys/send/workflows/delays/wait-until/)
- [Customer.io exit conditions](https://docs.customer.io/journeys/campaign-exit-conditions/)
- [HighLevel execution logs](https://help.gohighlevel.com/support/solutions/articles/155000003992-workflows-improved-execution-logs-enrollment-history)
- [Temporal workflow execution](https://docs.temporal.io/workflow-execution)
- [Temporal TypeScript workflow versioning](https://docs.temporal.io/develop/typescript/workflows/versioning)
- [AWS Step Functions versions](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-cd-aliasing-versioning.html)
- [AWS Step Functions redrive](https://docs.aws.amazon.com/step-functions/latest/dg/redrive-executions.html)
- [AWS Step Functions error handling](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html)
- [BullMQ flows](https://docs.bullmq.io/guide/flows/)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [BullMQ delayed jobs](https://docs.bullmq.io/guide/jobs/delayed)
- [React Flow layout guidance](https://reactflow.dev/learn/layouting/layouting)
- [React Flow performance guidance](https://reactflow.dev/learn/advanced-use/performance)
- [W3C WCAG 2.2 dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [PostgreSQL SELECT locking clauses](https://www.postgresql.org/docs/current/sql-select.html)
- [Zod strict objects and discriminated unions](https://zod.dev/api)

Repository evidence:

- `docs/product/full-functional-scope.md`;
- `docs/superpowers/specs/2026-07-26-flows-automation-product-research.md`;
- `packages/contracts/src/flows.ts`;
- `packages/domain/src/flows/`;
- `packages/db/src/schema/flows/`;
- `packages/db/src/adapters/flows/`;
- `apps/astrologer-api/src/modules/flows/`;
- `apps/workers/src/flows/`;
- `apps/astrologer-web/src/features/flows/`;
- `apps/astrologer-web/src/pages/flows/`;
- `ElevenHouseDesign/app/flow-*.jsx` and `mobile-flows.jsx`;
- `/Users/anton/Downloads/react-flow-routing-analysis-2026-08-02.md`.
