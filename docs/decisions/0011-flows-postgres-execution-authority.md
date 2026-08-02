# 0011. PostgreSQL As Flows Execution Authority

Date: 2026-08-02

## Status

Accepted for implementation planning.

## Context

ElevenHouse Flows are user-authored, versioned, long-running operating
procedures for an astrologer's practice. They can wait for time, domain events
or human approval and eventually coordinate CRM, Booking, Charts, AI,
Messaging, Products/Orders, Notifications and AstroCalendar.

The repository already stores flow definitions, immutable versions, runtime
events, runs, step runs, approvals, delivery attempts and suppressions in
PostgreSQL. It also uses transactional outbox and BullMQ-backed workers for
other asynchronous contours.

The current runtime foundation is not yet an executor: it plans a traversal and
can persist future steps as completed without executing their business effect.
Before extending it, ElevenHouse needs one durable execution authority and
formal graph semantics.

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
- pins interpreter semantics, event schema and every node executor semantic
  version required by the published graph;
- rejects unsupported graphs before publish/activation.

### Enrollment service

- consumes normalized, deduplicated domain events;
- resolves and authorizes typed subjects against owning modules;
- applies independent enrollment, re-entry and exit policies;
- selects a persisted activation epoch by event occurrence time;
- deduplicates on stable flow/trigger/policy occurrence rather than version;
- creates one run pinned to one immutable flow and executor version manifest.

### Graph interpreter

- advances one execution token through one node transition at a time;
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

### Executor worker

Execution has three bounded phases:

1. A short claim transaction locks runnable work, records lease owner/expiry,
   increments a fencing token and commits.
2. Bounded pure/read work runs outside the transaction. No provider call is
   performed under the claim.
3. A short finalize transaction compare-and-swaps on token id, claimed state,
   lease owner and fence; it asserts one row and atomically writes outcome,
   next work, trace and, for external work, command/outbox intent.

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

## Dependency Boundaries

- `packages/domain` defines interpreter decisions and ports and does not import
  `packages/db`.
- `packages/db` owns schema, transactions, claims, constraints and adapters.
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
  production reset is prohibited.
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

- [Flows production module design](../superpowers/specs/2026-08-02-flows-production-module-design.md)
- [PostgreSQL locking clauses](https://www.postgresql.org/docs/current/sql-select.html)
- [Temporal workflow execution](https://docs.temporal.io/workflow-execution)
- [Temporal workflow versioning](https://docs.temporal.io/develop/typescript/workflows/versioning)
- [BullMQ flows](https://docs.bullmq.io/guide/flows/)
- [BullMQ delayed jobs](https://docs.bullmq.io/guide/jobs/delayed)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
