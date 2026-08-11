# 0011. PostgreSQL As Flows Execution Authority

Date: 2026-08-02

## Status

Accepted; the definition compiler, immutable publish/activation/enrollment,
single-token atomic execution, retry/recovery, cancellation, persisted runtime
control and the worker lifecycle are implemented. Durable work-item and
approval waits (including snooze/expiry wakes), terminal chart and Messaging
signals, and owning-module ports for birth-data, chart, AI-draft and Messaging
effects are implemented through the Flow dispatch outbox. The fail-closed
bootstrap policy remains `definition_only`: deployment configuration may narrow
the database policy but never widen it.

The exposed V2 graph deliberately does not yet include a generic timer node or
an internal-messaging channel. Provider delivery and reconciliation remain
owned by Messaging; Flow persists a provider-neutral terminal-signal wait and
does not choose a provider or transport mode.

## Context

ElevenHouse Flows are user-authored, versioned, long-running operating
procedures for an astrologer's practice. They can wait for time, domain events
or human approval and eventually coordinate CRM, Booking, Charts, AI,
Messaging, Products/Orders, Notifications and AstroCalendar.

The repository already stores flow definitions, immutable versions, runtime
events, runs, step runs, approvals, delivery attempts and suppressions in
PostgreSQL. It also uses transactional outbox and BullMQ-backed workers for
other asynchronous contours.

At the time this decision was introduced, the runtime foundation was not yet an
executor: it could plan a traversal and persist future steps as completed
without executing their business effect. The decision established the durable
execution authority and formal graph semantics required to replace that
foundation.

The evaluated options were:

1. PostgreSQL durable state machine with worker and optional BullMQ wake-ups;
2. a generic graph interpreter hosted in Temporal with PostgreSQL definitions
   and product projections;
3. BullMQ flows/jobs as the primary workflow engine.

## Decision

PostgreSQL is the authoritative store and state machine for Flows execution.

`apps/workers` hosts the interpreter/executor and recovery sweeper. BullMQ may
accelerate wake-ups or carry owning-module jobs, but queue state is not proof
of a run, timer, approval, delivery or completion. Correctness must survive a
lost, duplicated, delayed or removed BullMQ job.

Temporal is not introduced for the current architecture. It remains a possible
future execution host only after measured scale or deployment topology proves
the PostgreSQL executor insufficient and a bounded spike demonstrates lower
total operational complexity without conflicting truth.

BullMQ is explicitly rejected as the Flows execution authority.

## Required Runtime Components

### Definition compiler

- validates typed node config and graph topology;
- validates edge/handle compatibility;
- produces a versioned capability manifest;
- pins interpreter semantics, event schema, the single trigger-matcher contract
  and every downstream node-executor semantic version required by the published
  graph;
- rejects unsupported graphs before publish/activation.

Published flows use `flow-capability-manifest.v2`. Its `triggerMatcher` is the
graph's single `booking_confirmed` or `manual_client` enrollment contract;
`kind`, `configSchemaVersion`, `matcherContractVersion` and
`eventSchemaVersion` are all explicit compatibility data. The event version
pins the normalized enrollment envelope consumed by that matcher; it is not
inferred from the event payload or current deploy. The manifest's
`nodeExecutors` contains only downstream executable kinds. The manifest is
immutable once published; its trigger entry does not add a production trigger
executor or authorize a worker token.

### Enrollment service

- consumes normalized, deduplicated domain events;
- resolves and authorizes typed subjects against owning modules;
- applies independent enrollment, re-entry and exit policies;
- selects a persisted activation epoch by event occurrence time;
- deduplicates on stable flow/trigger/policy occurrence rather than version;
- creates one run pinned to one immutable flow and executor version manifest;
- consumes the trigger transition itself and creates the first execution token
  on the unique target of the trigger's `next` edge. Trigger nodes are enrollment
  matchers, not worker attempts.

### Graph interpreter

- advances one execution token through one node transition at a time;
- rejects a token or selected transition target whose kind is an enrollment
  trigger, even when its immutable capability manifest lists that trigger entry;
- chooses exactly one edge for a condition;
- creates durable wait/approval state instead of pre-completing future work;
- invokes external behavior only through registered owning-module ports.

### Execution store

PostgreSQL persists:

- runs and pinned versions;
- latest/active version pointers and immutable activation epochs;
- execution tokens/current activations;
- step attempts and outputs;
- leases and fencing tokens;
- timers/waits and signal inbox entries;
- separate approvals and work items;
- external effect/command, retry and reconciliation state;
- suppressions and cancellation;
- append-only ordered run trace;
- redrive lineage.

### Booking lifecycle freshness

Booking remains authority for its monotonic lifecycle revision and immutable
confirmed, rescheduled and cancelled events. Flows consumes those events into a
per-Booking contiguous revision head plus immutable event receipts. A missing
revision, gap, conflicting digest or schedule mismatch is observable integrity
or projection lag; current Booking columns are never silently combined with an
older Flow deadline.

`flowRuns.snapshot` is immutable enrollment evidence. Current confirmed schedule
and applied lifecycle revision are a separate Flow-owned subject projection. A
claim derives an effective execution snapshot only from a valid contiguous head;
it does not rewrite the run snapshot. Reschedule projects the same identity onto
unfinished schedule-bound obligations and recalculates their structured deadline
basis from the pinned node policy. Completed work is historical evidence and is
never reopened or rewritten. A snoozed obligation wakes at the earlier of its
user-selected snooze instant and recalculated due instant.

Work-item reads and writes use one freshness projection. Queue output exposes a
Booking context only when aggregate revision, Flow head, schedule, occurrence
identity, pinned deadline policy and active work-item deadline agree. Aggregate
ahead of the head returns typed `context_pending` without exposing mixed schedule
data. Integrity disagreement fails closed.

Start, snooze and complete repeat that projection under the lifecycle and
runtime locks before changing the work item. A Booking-linked command must carry
the lifecycle revision shown by the queue as well as the work-item revision;
omission or mismatch is a typed conflict. The shared contract leaves the field
optional solely for non-Booking work items. Projection lag is a separate typed
conflict and both outcomes are persisted under the original idempotency key.

### Executor worker

Execution has three bounded phases:

1. A short claim transaction locks runnable work, verifies the exact pinned
   graph and its complete capability manifest against a fresh deterministic
   compiler projection, verifies the pinned executable node with the domain
   parser, then
   reads a fresh `clock_timestamp()` and uses it for claim time, update time and
   lease expiry. A transaction-start timestamp cannot shorten a lease while the
   claimant waits on validation or locks. The claim records lease owner/expiry,
   increments a fencing token and commits. Deterministic definition-integrity
   failure does not persist a lease: the locked poison token and run move
   atomically to a queryable quarantine/terminal state and append one redacted
   `run_failed` event without fabricating an attempt.
2. Bounded pure/read work runs outside the transaction. No provider call is
   performed under the claim.
3. A short finalize transaction locks and compare-and-swaps on token id, claimed
   state, lease owner and fence, then compares the persisted deadline with a
   fresh `clock_timestamp()` read after the row lock is acquired. PostgreSQL
   `transaction_timestamp()` is fixed at transaction start and is not valid for
   this post-wait lease decision. The locked database row supplies attempt
   number, claim time, owner and fence for audit history; caller-held claim
   metadata is not audit authority. Finalize asserts one row and atomically
   writes outcome, next work, trace and, for external work, command/outbox
   intent.

Runtime claim authority is evaluated inside the same PostgreSQL transaction as
the token lock. The effective permission is the intersection of the immutable
current policy, deployment ceiling, exact worker registration, live readiness
lease, active owner-subject mapping, claim kill switches and the pinned
version's requirement manifest. The environment may only narrow `mode` and
canary owners; it cannot supply lease duration, expand policy or become the
business allowlist. The policy authority row is locked before readiness and the
token, so a committed policy change or drain has an unambiguous order relative
to a claim.

Each controlled claim stores the authorizing policy revision and digest plus
the worker session and registration digest on the token. Finalization and
expired-lease recovery copy that exact evidence to the immutable attempt; a
later policy heartbeat cannot rewrite history. Legacy low-level test claims are
represented explicitly by an all-null evidence tuple and are not used by the
production worker composition.

Worker registration is exact-replay, versioned and session scoped. Startup runs
dependency preflight, global recovery and bounded maintenance before publishing
readiness. Heartbeats run without overlap and a transient failure immediately
closes local claims; lease loss, integrity failure or deployment-ceiling breach
is terminal. Shutdown closes local claim admission synchronously, persists
`draining`, settles every runtime/maintenance/transport close operation and
closes PostgreSQL last.

Runtime-control commands resolve or create the erasable actor subject inside
the same transaction that creates the immutable command. Raw actor/owner user
IDs are not copied into policy or command evidence. Replay outcomes are retained
for their exact 24-hour replay window and then purged in bounded DB-time batches;
command and registration tombstones preserve non-sensitive identity evidence.

One stable token row is the current cursor for the run. A successful advance
resolves exactly one edge from the persisted immutable graph inside the finalize
transaction, records the source attempt/event, increments the node activation
sequence, rewrites the cursor to the target and resets only the node-local
attempt counter. The fencing token remains run-wide and monotonic. Worker-held
graph or target data is never transition authority. Attempt identity is
`(token_id, node_activation_sequence, attempt_number)` so later redrive can
reactivate a node without weakening the V2 acyclic model.

Runtime decisions cross a strict discriminated parser before any database
transaction. Only a persisted `completed` node may finish a run, and its
result code is re-derived from that immutable node's `config.goalKey` during
finalization. A non-terminal executor cannot bypass graph traversal by
returning a syntactically valid terminal decision.

Lease acquisition, heartbeat and drain are operational coordination, not
business graph transitions, so they do not append product trace events by
themselves. Expired-lease recovery is business-visible: it invalidates the old
fence and atomically appends the expired attempt and ordered redacted trace.
Recovery processes one token per short transaction inside a bounded loop, so a
later poison write cannot roll back earlier committed recoveries. It schedules
a retry only while the token's pinned total-attempt budget remains; exhaustion
persists `failed_terminal` and `FLOW_EXECUTION_RETRY_EXHAUSTED`. A finalize
after the database deadline is stale even before recovery increments the fence.
A claim dated after current database time is corrupt rather than a valid lease;
recovery quarantines it instead of waiting for that future instant or creating a
synthetic attempt. Recovery candidate selection compares against
`clock_timestamp()` inside the selecting statement, not the transaction-start
clock, and post-lock validation also requires the lease deadline to have passed.
A normal claim committed after a recovery transaction began therefore remains
live. Poison quarantine uses a fresh post-lock instant for token, run and trace;
it cannot move audit chronology backward.

PostgreSQL retains microseconds while JavaScript `Date` retains milliseconds.
Every execution and cancellation post-lock clock read therefore rounds the
database epoch upward to the next representable millisecond before persisting
it. The bounded sub-millisecond extension prevents a later database instant
from being serialized behind an earlier microsecond write; rounding down is
prohibited because it can invert token, run, attempt and trace chronology.

Node evaluation and database finalization are separate failure domains. A typed
or unexpected executor failure is durably finalized through the live lease and
fence. A database/commit error from success finalization is never reclassified
as a node failure because the commit may already have happened; it propagates
to fencing and lease recovery.

Every token pins `flow-execution-retry.v1` and its numeric policy snapshot at
creation. V1 is exactly three total attempts, 1000 ms base delay and 60000 ms
cap with exponential equal-jitter backoff based on database time. Those values
are immutable compatibility data in both runtime validation and database
constraints, not per-token tuning knobs. Explicit typed transient failures use
the full budget. An unknown exception receives only one defensive retry and
then fails terminally. Permanent executor rejection fails terminally;
definition, manifest, runtime-state and runtime-trace integrity failures are
quarantined. An invalid expired claim appends one redacted terminal event but no
fabricated attempt. Durable history stores only allowlisted reason/result codes,
never raw exception text or node payload.

Database constraints are fail-closed under PostgreSQL three-valued logic:
`retry_scheduled` and `failed` states explicitly require non-null disposition
and reason before checking their allowlists. A claimed token requires
`claimed_at <= lease_expires_at` and `claimed_at <= updated_at`. Attempt numbers
are bounded to `1..3`, and every persisted attempt's fence is at least its
attempt number. Token node kinds, attempt/event source kinds and atomic-advance
target kinds are restricted to downstream executable nodes; trigger kinds are
enrollment evidence only. Runtime validation repeats these checks and rejects claim times
after the current statement clock before claim, recovery or cancellation, so an
older row created before the constraints cannot become work or poison every
recovery sweep; it is quarantined without an invented attempt.

External action state is separate from token state:

```text
prepared -> dispatched -> waiting_result
waiting_result -> succeeded | failed | outcome_unknown
outcome_unknown -> reconciled_succeeded | reconciled_failed
```

The owning module executes the durable command with a persistent semantic
idempotency key and emits a correlated result signal. Queue/job acceptance is
never an action success. A stale worker whose lease was replaced cannot commit.

### Recovery sweeper

- finds runnable unclaimed work;
- recovers expired leases;
- wakes due timers and snoozed/expired approvals;
- schedules due retries;
- identifies unknown-after-dispatch work for reconciliation.

Sweeps use database time, bounded batches, fence-aware heartbeat/finalize and a
visible poison-event quarantine. Every signal is persisted before matching, so
signal-before-wait and wait-before-signal are both lossless.

The sweeper is required even when BullMQ wake-up jobs are enabled.
Worker scheduling must remain disabled until deterministic poison work has a
durable terminal or quarantine disposition with alerting.

## Execution Guarantees

- Orchestration is at least once.
- Externally observable effects are effectively once through persistent
  idempotency and reconciliation in the owning module.
- Every run remains pinned to its original published version.
- The run also pins interpreter and node-executor semantic versions; worker
  readiness fails if non-terminal work references an unavailable version.
- Every transition appends an ordered, redacted trace event.
- Sensitive details are minimized and referenced under explicit retention/
  tombstoning policy rather than embedded permanently in the audit envelope.
- Unknown provider outcomes are reconciled before blind retry.
- Publish does not switch active version. Explicit compare-and-swap activation
  creates an effective-time epoch. Pause enrollment closes the epoch and does
  not rewrite runs; stop-runs and external-action kill switches are separate.
- Cancel prevents new claims and reports in-flight reconciliation honestly.
- Redrive repeats only eligible failed work on the same pinned version.
- Early, duplicate and out-of-order events/signals are stored and matched by
  unique source/correlation identity, not callback arrival order.

### Durable runtime control commands

Runtime controls use an immutable command tombstone and a separate exact-replay
outcome. Command identity includes API surface, actor, owner, route, run and
idempotency key; a canonical request hash distinguishes exact replay from key
reuse with different content. The outcome stores the exact HTTP status and
response body for 24-hour replay, including owner-indistinguishable `404` and
terminal `409` failures. It is immutable and non-deletable inside that window,
then may be purged under retention policy because a success response can contain
a run snapshot. The command tombstone and any command-linked redacted run trace
remain. A command row alone is not fabricated proof that its target run exists.

Immediate cancellation is defined for runnable, claimed, `retry_scheduled`,
`waiting_signal` or `waiting_work_item` token work, with run status `pending`,
`running`, `waiting` or `failed_retryable`. The transaction locks the execution
token before the run, so cancel, finalize and expired-lease recovery are
serialized and the first committed terminal transition wins. Cancellation
increments the fence, clears the lease and clears retry failure fields. A
claimed token records a canceled attempt using the locked persisted claim
identity; runnable, scheduled-retry and safe-wait tokens create no additional
attempt. Every case appends one redacted `run_canceled` trace linked to the
durable command. A deferred database guard requires that trace to reference a
succeeded cancellation command, and replay of an already canceled run verifies
the same provenance. Legacy, internally inconsistent and `waiting_external`
work fails closed: stopping a run must not claim that an already dispatched
provider effect was killed.

Cancellation does not use the transaction-start clock for its business
transition. After the token and run locks are acquired and the persisted state
is validated, it reads a fresh PostgreSQL `clock_timestamp()` and uses that
instant for the token, run, canceled attempt and trace event. Command outcome
and completion timestamps are read after that transition. This preserves audit
chronology when cancellation waited behind a worker that established a newer
claim in the meantime.

Cancellation remains available while new enrollment and scheduling are in
`definition_only`; it is an operational containment control, not executor
readiness. Cancellation v1 is strictly bodyless: an omitted body or `{}` is the
only request shape and unknown fields fail before persistence. The HTTP boundary
requires one and only one `Idempotency-Key` field line. Framework-normalized
headers are insufficient evidence because HTTP runtimes may join duplicate
field lines, so the guard checks distinct/raw request headers before accepting
the key. Transaction-local one-second lock and five-second statement budgets
bound request occupancy. A timeout rolls back the command attempt and returns
typed retryable `503 FLOW_RUNTIME_COMMAND_BUSY`; the caller retries with the
same key.

## Dependency Boundaries

- `packages/domain` defines interpreter decisions and ports and does not import
  `packages/db`.
- `packages/db` owns schema, transactions, claims, constraints and adapters.
- Persisted published-version JSON is parsed at the DB/domain adapter boundary;
  unknown graph or manifest schemas fail closed instead of crossing through a
  TypeScript cast. PostgreSQL also constrains the allowed manifest top-level
  shape and the exact V2 trigger-matcher compatibility fields.
- `apps/workers` composes the execution store, node executors and owning-module
  adapters.
- Flows never writes another module's tables directly.
- Frontend is a projection/control surface and never executes business nodes.

## Operational Requirements

- Runtime deploys `definition_only` by default, then explicit owner/capability
  canary and enabled stages.
- Global, owner and capability kill switches can stop enrollment or external
  dispatch independently without deleting state.
- Worker drain stops new claims and leaves waits/signals recoverable.
- Schema rollout uses expand-contract and fail-closed approved-hash
  reconciliation under advisory lock; unknown history is rejected and
  production reset is prohibited. Runtime catalog identity includes relation
  kind, persistence, RLS/forced-RLS, access method, constraint validation and
  index valid/ready state. Referenced integrity functions include canonical body,
  owner, language, volatility, security mode and configuration; matching trigger
  names alone are insufficient. Whitespace is normalized but case is preserved,
  including inside quoted SQL literals.
- Manifest publication validates and persists only
  `flow-capability-manifest.v2`. Rollback must preserve this contract: deploying
  a binary that expects an older graph or manifest format is prohibited.
- The main production-baseline reconciler applies both the runtime-dispatch
  outbox and execution-safety transitions for every accepted history before it
  records or asserts the current ledger identity. Each transition accepts only
  its exact predecessor or current catalog, and current-schema verification
  attests both safety catalogs independently of the broader approved migration
  lineage.
- A fresh database has no relations during the pre-migration reconciliation
  pass. Production therefore runs the same reconciler again immediately after
  the Drizzle migrator and before seeding or service startup. That second pass
  installs and attests additive safety DDL not yet present in the generated
  lineage; skipping it is a deployment failure, not an accepted fresh state.
- The deployment ledger is the exact ordered approved lineage. Reconciliation
  may accept only its documented predecessor histories; `db:migrate` applies
  missing committed entries in journal order. A ledger already claiming current
  is asserted, never silently repaired from an unknown or divergent shape.
- Old executor semantic versions remain deployable while non-terminal runs pin
  them, or move only through an explicit audited migration.

## Graph Scope

The first executable graph schema is intentionally deterministic:

- one trigger;
- acyclic topology;
- one execution token;
- exactly one selected condition branch;
- no implicit fan-out/fan-in;
- no cycles;
- repeated checks/reminders only through a typed bounded-repeat composite with
  maximum attempts, duration and terminal outcome;
- all reachable paths terminate.

Parallel split/join or arbitrary loop semantics require a future versioned
graph schema. They must not emerge from array order, canvas position or
multiple outgoing edges.

## Consequences

### Positive

- one source of execution truth;
- atomic transition, trace and outbox writes;
- direct owner-scoped operational reads;
- no new infrastructure before it is justified;
- queue outage affects latency rather than correctness;
- existing schema/outbox investment can be evolved rather than replaced.

### Negative

- ElevenHouse must implement and test the interpreter, scheduler, leases,
  recovery and redrive semantics;
- PostgreSQL indexes, retention and sweeper load require operational care;
- formal graph semantics cannot be deferred to a queue library;
- large future timer volume may require partitioning or a different engine.

### Risks

The largest risk is not the storage engine. It is ambiguous graph semantics.
A durable engine can reliably perform the wrong action if branch, merge,
re-entry, cancellation or idempotency behavior is underspecified. The graph
contract and state-transition matrix therefore precede broad canvas expansion.

## Revisit Criteria

Evaluate a Temporal spike only when repository/runtime evidence shows one or
more of the following:

- active timers/waits exceed PostgreSQL latency or maintenance targets;
- workflows commonly live for months and contain hundreds of transitions;
- polling/recovery cannot meet measured wake-up SLOs;
- execution is split across independently deployed services;
- the operating team is prepared to own Temporal cluster/retention/upgrades;
- the spike proves simpler recovery and observability without dual authority.

Any future migration must define authority, history retention, in-flight run
migration and product trace reconciliation before adoption.

## Rejected Alternatives

### Temporal now

Temporal offers durable timers, signals, retries and event history, but it does
not remove the need for a typed interpreter for dynamic user-authored graphs.
It would add a second execution/history system, interpreter-code versioning,
new deployment and local-development requirements and reconciliation with the
product-facing PostgreSQL model before current scale justifies that cost.

### BullMQ as authority

BullMQ delayed jobs, job-id dedupe and retention follow queue/job lifecycle.
They do not provide the permanent product audit, pinned-version history,
human-approval state or recovery authority required here. BullMQ remains a
transport optimization only.

### Browser execution

Browser execution cannot enforce owner authorization, survive reload, provide
durable waits/recovery or coordinate idempotent side effects. It is prohibited.

## References

- This accepted decision is the canonical record for the Flow execution model.
- [PostgreSQL locking clauses](https://www.postgresql.org/docs/current/sql-select.html)
- [Temporal workflow execution](https://docs.temporal.io/workflow-execution)
- [Temporal workflow versioning](https://docs.temporal.io/develop/typescript/workflows/versioning)
- [BullMQ flows](https://docs.bullmq.io/guide/flows/)
- [BullMQ delayed jobs](https://docs.bullmq.io/guide/jobs/delayed)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Node.js HTTP message headers](https://nodejs.org/api/http.html#messageheaders)
- [RFC 9110 field lines and combined field values](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.2)
- [AWS Step Functions StopExecution](https://docs.aws.amazon.com/step-functions/latest/apireference/API_StopExecution.html)
- [AWS Step Functions retry and catch](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html)
- [Google Cloud Workflows retry steps](https://docs.cloud.google.com/workflows/docs/reference/syntax/retrying)
- [PostgreSQL current date/time semantics](https://www.postgresql.org/docs/current/functions-datetime.html)
- [Azure Functions error handling and retries](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-error-pages)
