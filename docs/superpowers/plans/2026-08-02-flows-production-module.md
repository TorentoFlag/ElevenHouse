# Flows Production Module Execution Plan

> **For agentic workers:** use `superpowers:executing-plans` or
> `superpowers:subagent-driven-development` for implementation, and
> `elevenhouse-feature-delivery`, `elevenhouse-research` and
> `elevenhouse-design-parity` wherever their triggers apply. ElevenHouse
> shared-main policy overrides generic branch/worktree guidance: work in the
> existing checkout on `main`, preserve concurrent work and stage exact owned
> paths only.

**Goal:** Deliver Flows as a durable, owner-scoped practice-orchestration
module whose first complete product outcome prepares a confirmed consultation
through real client data, chart, AI review and astrologer work, while preserving
the approved design language and never reporting fake execution or completion.

**Architecture:** PostgreSQL is the single execution authority. Immutable flow
versions pin graph, policy, interpreter and executor semantics. A worker claims
one durable token at a time with lease/fencing CAS, and all cross-module effects
use typed owning-module commands plus outbox/result signals. BullMQ may wake
workers or transport owning-module jobs but cannot define business success.

**Tech stack:** TypeScript 6, Zod, NestJS, Drizzle/PostgreSQL, BullMQ/Redis,
React 19, Vite 8, TanStack Query, React Flow, Vitest and real browser evidence.

---

## Purpose / Big Picture

An astrologer opens `/flows`, creates a template-backed flow, edits a typed
graph, validates it, publishes an immutable version and explicitly activates
that version. A confirmed booking enrolls exactly one run. The run can request
missing client data, wait durably, calculate a canonical chart, request a
minimized AI preparation brief, require checksum-bound approval, create a
separate preparation work item and finish at `consultation_prepared` only after
the astrologer completes the work.

The UI shows why each step ran, waited, failed, was suppressed or needs human
action. Refresh, duplicate events, worker restarts and queue loss must not lose
or duplicate state. Publishing a newer version does not change existing runs or
switch active enrollment. External delivery remains unavailable until its
consent, capability, retry and reconciliation contour is proven.

The normative product and architecture contract is:

- `docs/superpowers/specs/2026-08-02-flows-production-module-design.md`;
- `docs/decisions/0011-flows-postgres-execution-authority.md`.

This plan translates that contract into independently verifiable behavior. It
does not reduce the Definition of Done in the design spec.

## Progress

- [x] 2026-08-02 19:23 MSK: audited reference desktop/mobile states, current
      code, DB/API/worker/frontend contour and prior Flows history.
- [x] 2026-08-02 19:23 MSK: completed product and architecture research,
      independent product/architecture/QA-security review and target-state design.
- [x] 2026-08-02 19:23 MSK: committed the design spec and PostgreSQL execution
      authority ADR as `974296f` after `docs:check:test`, `docs:check` and diff
      checks passed.
- [x] 2026-08-02 19:52 MSK: completed the initial Milestone 0 domain/API/worker
      integrity gate and targeted backend verification.
- [x] 2026-08-02 20:40 MSK: Milestone 0 implementation, affected tests,
      package gates and authenticated browser/DB evidence completed; independent
      re-review found no blocker/high findings and returned GO for an exact-path
      milestone commit.
- [x] 2026-08-02 21:00 MSK: fresh pre-commit verification completed after
      contract hardening: 32 test files / 171 tests, focused ESLint, contracts,
      domain, API and workers typecheck/build, web build, authenticated browser
      smoke and CSRF-protected cancel `409` all produced expected evidence.
- [x] 2026-08-02 21:49 MSK: Milestone 1 behavior group 1 added strict V2/read
      contracts, separate presentation state, deterministic graph compilation,
      handle/topology validation, requirement manifests and bounded compiler
      policy. Fresh verification passed 9 files / 67 tests, contracts/domain
      typecheck/build, ESLint and documentation gates; independent re-review found
      no blocker/high/medium findings and returned GO. Persistence, API validation,
      draft CAS and publish remain later groups.
- [x] 2026-08-02 22:19 MSK: Milestone 1 behavior group 2 added owner-scoped,
      CSRF-protected, read-only definition validation from shared contracts through
      domain compilation, API and frontend adapter. Valid V2 returns a canonical
      graph and requirements while activation remains explicitly blocked; invalid
      V2, V1 migration, malformed input, foreign ownership and no-write behavior
      are covered. Independent review exposed a cross-field artifact/blocker gap;
      negative tests reproduced it, the contract and blocker ordering were
      hardened, and re-review returned GO with no blocker/high/medium findings.
      Fresh affected-surface verification passed 26 files / 162 tests, focused
      ESLint, contracts/domain/API typecheck and contracts/domain/API/web builds.
      An authenticated live request returned HTTP 200, `publishable=true`,
      `activatable=false` and `FLOW_RUNTIME_EXECUTION_UNAVAILABLE`. Draft CAS,
      immutable V2 publish and persistence remain later groups.
- [x] 2026-08-03 13:38 MSK: Milestone 1 definition control-plane implementation
      now spans strict V2 create/templates/detail, optimistic draft update,
      immutable publish, exact command replay, explicit next-version draft and
      fail-closed V1 migration. PostgreSQL owns command/outcome replay, definition
      lifecycle, immutable versions and migration evidence; the single local
      baseline was reset and seeded successfully, then both adapters passed 19/19
      integration tests against the clean schema.
- [x] 2026-08-03 13:38 MSK: frontend cutover now uses only server V2 state,
      validates before publish, preserves exact issue code/path, blocks every
      structural control during mutations, retains local candidates across
      revision conflicts and offers explicit reload or retry-over-current-revision.
      V1 is readable before migration, template loading/error/retry is honest,
      definition-only runtime cannot claim active execution, and mobile structure
      editing is read-only. Affected verification passed 38 files / 253 tests,
      focused ESLint, contracts/domain builds, DB typecheck, 12 DB baseline tests,
      19 post-reset PostgreSQL integration tests and the astrologer-web production
      build.
- [x] 2026-08-03 14:02 MSK: independent pre-commit review found two release
      blockers and three migration/navigation risks. Later successful create and
      migration replays now preserve their original timestamps, unresolved
      frontend command signatures retain independent idempotency keys, dirty
      builder exit requires an explicit discard decision and browser unload is
      guarded, and V1 keeps its complete node payload readable with an exact JSON
      export. Save conflicts already retained the local candidate and exposed an
      explicit retry over the current server revision; that path remains covered.
      Fresh affected verification passed 45 files / 283 tests, both PostgreSQL
      definition adapters passed 19/19 with delayed replays, focused ESLint and
      domain/web production builds passed. Independent re-review returned GO for
      the scoped commit with no remaining blocker, high or medium findings.
- [ ] 2026-08-03 13:38 MSK: Milestone 1 network-backed browser acceptance is
      pending because neither `astrologer-web:5174` nor `astrologer-api:3002` is
      currently listening. Process policy forbids starting them without direct
      lifecycle authority; reference geometry is captured, but production desktop,
      mobile, auth, console and network evidence must still be recorded before the
      milestone checkbox can close.
- [x] Milestone 0: fail current unsupported runtime closed.
- [ ] Milestone 1: ship graph v2 definition control plane.
- [ ] Milestone 2: ship durable token runtime and recovery foundation.
- [ ] Milestone 3: ship booking enrollment and human work semantics.
- [ ] Milestone 4: ship studio/operations design parity and real simulation.
- [ ] Milestone 5: ship client data, waits and canonical chart integration.
- [ ] Milestone 6: ship reviewed AI and the first complete product E2E.
- [ ] Milestone 7: ship messaging-safe delivery.
- [ ] Milestone 8: ship remaining accepted reference capabilities and rollout
      evidence.

Update this section after every verified behavior group, not only at milestone
completion. Record partial state explicitly when an external acceptance remains
blocked.

## Surprises & Discoveries

- The existing runtime is a traversal planner, not an executor. It can create
  completed future step rows for both condition branches without evaluating a
  condition or invoking an owning module.
- Approval decision changes the approval row but does not durably resume the
  run/step.
- Current graph config is untyped `Record<string, unknown>`, drafts are
  last-write-wins and runtime context can be resolved against a mutable draft.
- Existing booking outbox production and Flows outbox relay are useful
  foundations, but queue acceptance currently cannot be treated as execution.
- 2026-08-02: retrying a matching legacy event as an error would retain an
  unbounded outbox backlog and could replay stale events after v2 activation.
  Definition-only dispatch therefore consumes it with explicit
  `execution_unavailable`, matched-flow count, no runtime writes and a sanitized
  ignored-event log.
- The reference prototype is visually broad but uses timed fake traversal,
  static AI samples and hidden mobile overlays; these are evidence for visual
  states, not production behavior.
- 2026-08-02: after explicit user lifecycle authority and authenticated login,
  the reference, astrologer-web and astrologer-api surfaces were available for
  real browser evidence. Desktop/mobile screenshots and measured geometry are
  stored under `.design-qa/flows/milestone-0/`.
- 2026-08-02: the local compiled API watcher does not rebuild upstream workspace
  package distributions atomically. Cleaning/rebuilding contracts or domain can
  briefly remove their `dist` entrypoints; build dependency packages first and
  rebuild the API before browser acceptance. The final listener and HTTP
  behavior were rechecked after this recovery.
- 2026-08-02: current local persistence has four draft flows, one paused legacy
  flow, one completed preview run, no approvals and no unpublished Flows outbox
  backlog. Slice 0 performs no silent status/history rewrite.
- 2026-08-02: response-level `historySemantics=mixed` cannot identify durable
  rows individually. Mixed or missing provenance therefore remains read-only
  and cannot display a completed run as durable success; row-level provenance
  is required before canary history projection.
- 2026-08-02: malformed payload and aggregate-mismatch outbox events are
  deterministic failures but the generic outbox schema has no durable terminal
  failure disposition. Do not overload `published` as a fake success; add a
  queryable terminal/quarantine state with alerting before durable runtime
  enrollment in Milestone 2.
- 2026-08-02: rollout metadata also requires cross-field invariants. An
  `enabled` runtime can expose only `durable_execution` history, while `canary`
  cannot claim `legacy_preview`; contract tests now reject both contradictory
  combinations.
- 2026-08-02: a normalized graph must canonicalize every semantically unordered
  collection and cannot use locale-dependent sorting. V2 sorts stable ids with
  binary string comparison and canonicalizes booking `productIds` without
  mutating input. Duplicate node/edge ids are ambiguous and are excluded from
  topology analysis rather than resolving to the first array element.
- 2026-08-02: the repository-wide astrologer-web typecheck is currently blocked
  outside this milestone by a concurrent ChartEngine fixture that still returns
  provider `nominatim` after the shared contract moved to `geoapify`. Flows
  focused tests, lint and production build are green; do not mix that foreign
  migration into this commit.
- 2026-08-02: a capability manifest is a compile-time requirements declaration,
  not evidence that matching executors or resources are deployed. The validate
  response therefore separates `publishable` from `activatable`; the live local
  API correctly kept a valid V2 graph activation-blocked without creating any
  flow, run, event or outbox write.
- 2026-08-03: a React Query retry is not the same logical command unless its
  idempotency key is retained until success. The frontend now keys unresolved
  create/update/publish/next-draft/migrate attempts by canonical command
  content and rotates the key only after acknowledgement.
- 2026-08-03: successful query invalidation can overwrite edits made while a
  mutation is in flight. Structural editing is now locked for the complete
  command window, and a newer mismatching server revision is held as an
  explicit conflict while the local candidate remains in memory.
- 2026-08-03: persisted `runtimeStatus=active` is historical configuration, not
  execution evidence when runtime availability is `definition_only`. Gallery
  and mobile summaries therefore suppress active-count claims and label the
  persisted state as execution-unavailable while still permitting pause.
- The shared worktree contains unrelated Clients/BirthPlace, AstroCalendar,
  package/lockfile and design-QA work. Those changes are valid and must not be
  reverted or mixed into Flows commits.

Add dated evidence here when implementation reveals a false assumption,
cross-module contract gap, migration constraint or runtime behavior that
changes later steps.

## Decision Log

- **2026-08-02, product/architecture:** Flows orchestrates owning modules; it
  does not own CRM, Booking, Charts, AI, Messaging, Products/Orders or Payments
  state. Rationale: preserve aggregate authority and avoid controller scripts.
- **2026-08-02, product:** the first shipped outcome is preparation for a
  confirmed consultation, not merely a generic task. Rationale: it proves the
  module's actual value and cross-module semantics.
- **2026-08-02, architecture:** PostgreSQL durable state machine is execution
  authority; BullMQ is transport only and Temporal is deferred. Rationale is
  recorded in ADR 0011.
- **2026-08-02, graph:** `flow-graph.v2` is one-trigger, one-token and acyclic,
  with exactly one condition branch and no implicit fan-out/fan-in. Repetition
  is a bounded typed composite. Rationale: deterministic semantics before broad
  canvas expressiveness.
- **2026-08-02, graph matrix:** V2 rejects every unknown kind/config field and
  treats any node with `in-degree > 1` as unsupported fan-in, including
  reconvergence of mutually exclusive branches. Initial handles are exact:
  triggers emit `next`, `birth_data_available` emits `true` and `false`, a work
  item emits `success`, approval emits `approved` and `rejected` plus `timeout`
  only when configured with expiry, and terminal nodes emit nothing. Rationale:
  no merge or outcome semantics may be inferred from canvas shape.
- **2026-08-02, compatibility:** reads accept V1 or V2, but the target write and
  publish path accepts only V2. V1 definitions remain readable/exportable and
  require explicit deterministic migration; unresolved nodes become blockers.
  Existing V1 templates remain unavailable until their owning capabilities
  have strict V2 contracts.
- **2026-08-02, aggregate:** published state belongs to immutable versions;
  enrollment state comes from activation epochs; archive is aggregate
  lifecycle. Drafts carry `revision` and `baseVersionId`, publish stores a
  compiled snapshot from an exact source revision, and `create-next-draft` is
  explicit and idempotent.
- **2026-08-02, readiness:** the compiler manifest declares required executor
  contracts but is not deployment evidence. Static unsupported capabilities
  block publish; mutable resource and exact executor-version readiness block
  activation. Until Milestone 2 provides an authoritative versioned registry,
  activation remains typed fail-closed and must not create an epoch.
- **2026-08-02, versioning:** publish creates an immutable version but does not
  activate it. Activation creates an effective-time epoch; pause closes
  enrollment while existing runs continue by default.
- **2026-08-02, safety:** work items and approvals are separate write models;
  external send is disabled until action-time consent/capability checks,
  delivery reconciliation and kill switches pass.
- **2026-08-02, UI:** desktop supports graph structure editing; mobile supports
  monitoring, approvals/work and typed node configuration, but not structural
  graph editing in v2.

## Outcomes & Retrospective

Milestone 0 is complete. The current production surface is an explicit
definition/control plane, not a false runtime:

- create, edit, publish, pause and owner-scoped history reads remain available;
- activation, simulation, manual execution, approval decisions and run
  cancellation fail with typed HTTP `409` before runtime mutation;
- booking outbox delivery is consumed as explicit `execution_unavailable` when
  a legacy active definition matches, with no run/effect record and no payload
  logging;
- legacy, mixed or missing-provenance history cannot appear as durable
  completion or live Dashboard/Inbox work;
- authenticated browser evidence covers gallery, runtime history, Dashboard and
  Inbox, including the absence of per-flow Inbox run queries while history is
  legacy-only; screenshots and measurements live under
  `.design-qa/flows/milestone-0/`.

Fresh pre-commit evidence is 32 test files / 171 tests, focused ESLint,
contracts/domain/API/workers typecheck and build, astrologer-web production
build, API health, empty browser warn/error logs and a CSRF-protected cancel
response with `FLOW_RUNTIME_EXECUTION_UNAVAILABLE`. Repository-wide
astrologer-web typecheck remains blocked only by the unrelated concurrent
Nominatim/Geoapify test fixture recorded above.

The broader production module is not complete. Milestone 1 must add the strict
v2 definition control plane; no durable execution, canary enrollment or
external effects are enabled by this outcome.

Milestone 1 is now partially implemented through strict graph compilation and
an owner-scoped read-only validation boundary. Validation is available to the
frontend through a shared-contract adapter, but the existing draft and publish
commands still use the legacy persistence model. No schema, draft revision,
immutable V2 version or activation epoch was added in this behavior group.

Do not rewrite incomplete work as achieved. At program completion, reconcile
this section against every `Implement` row and the Definition of Done in the
design spec.

---

## Context and Orientation

### Current implemented contour

Contracts:

- `packages/contracts/src/flows.ts`
- `packages/contracts/src/flows.test.ts`

Domain:

- `packages/domain/src/flows/flow-validation.ts`
- `packages/domain/src/flows/flow-use-cases.ts`
- `packages/domain/src/flows/flow-runtime-use-cases.ts`
- `packages/domain/src/flows/flow-run-state.ts`
- `packages/domain/src/flows/flow-runtime-store.ts`
- `packages/domain/src/flows/flow-runtime-outbox.ts`
- sibling tests under the same directory

Persistence:

- `packages/db/src/schema/flows/`
- `packages/db/src/adapters/flows/drizzle-flow-store.ts`
- `packages/db/src/adapters/flows/drizzle-flow-runtime-store.ts`
- the current Drizzle baseline under `packages/db/drizzle/`

Composition/runtime:

- `apps/astrologer-api/src/modules/flows/`
- `apps/workers/src/flows/flow-runtime.outbox-relay.ts`
- Booking outbox producer/relay paths discovered by `rg -n
"booking.*confirmed|flow.runtime" apps packages`

Astrologer UI:

- `apps/astrologer-web/src/pages/flows/`
- `apps/astrologer-web/src/features/flows/`
- Dashboard/Inbox projections that consume flow context

Future owning surfaces:

- client requests: `apps/public-api`, `apps/client-web`, Clients/BirthData
  domain/API/DB paths;
- chart request/result: Charts domain, DB, `apps/chart-worker`;
- AI request/result: `packages/ai`, owning API/use cases and worker contour;
- messaging: existing Messaging domain/API/worker/provider contour;
- products/orders/payments, AstroCalendar and content only in their accepted
  later milestones.

### Terms

- **Flow:** stable astrologer-owned definition identity.
- **Draft revision:** mutable optimistic-concurrency document plus presentation.
- **FlowVersion:** immutable executable graph/policy/semantics snapshot.
- **Activation epoch:** version and effective interval used for event-time
  enrollment.
- **Run:** one subject occurrence executing one pinned version.
- **Token:** current durable execution position; v2 has one token per run.
- **Attempt:** one fenced evaluation of one token/node.
- **Wait/signal:** durable suspension and correlated owning-module/timer input.
- **Effect:** externally observable owning-module command and reconciled result.
- **FlowWorkItem:** human work required to continue a run.
- **FlowApproval:** checksum-bound authorization of an immutable candidate.
- **Path preview:** pure graph explanation; never a claim of runtime execution.
- **Runtime-spine fixture:** internal booking/data/work-item proof named
  `Контроль подготовки`; it is not the first complete product outcome.

### Sources of truth

- Product: current user instruction, the production-module design spec,
  `docs/product/` and accepted domain contracts.
- Architecture: ADR 0011, `docs/architecture/`, `docs/api/`, security/data docs
  and current code.
- Visual: exact mapped Flows states in `ElevenHouseDesign/` and the reference
  browser route, not prototype business behavior.
- Implemented state: current code/schema/tests plus real DB/network/browser
  evidence.
- Procedure: `docs/development/agent-workflow.md`, testing strategy, commands,
  runbooks and repo skills.

### Shared-main and owned paths

Before each behavior group run:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
git diff -- <every target path>
```

The branch must remain `main`. Reread complete targets immediately before
patching. Existing unowned edits include `.env.example`, Clients/BirthPlace,
AstroCalendar, `package.json`, `packages/db/package.json`, `pnpm-lock.yaml`,
design inventory and untracked QA artifacts. Do not stage, rewrite or format
them. Later milestones that need an intersecting path must first re-audit its
combined current state and preserve compatible intent.

Owned paths are assigned per milestone below. A subagent may write only an
explicit disjoint subset. The orchestrator reviews every uploaded diff and
runs verification independently.

### Authority boundaries

- This task has authority to edit and commit Flows-owned repository paths in
  small reviewed commits. Never combine foreign staged changes.
- Do not push, deploy, mutate production, purchase services or change external
  accounts without a new direct instruction.
- Do not start, stop, restart or kill frontend/API/workers/Docker/PostgreSQL/
  Redis. Read-only `lsof`, `ps`, `curl` and DB-target validation are allowed.
- Schema implementation requires the repository's baseline regeneration and a
  confirmed local `db:reset`. If the required local DB lifecycle/destructive
  authority is absent, code/schema can proceed only to the point where DB reset
  and integration acceptance are explicitly reported blocked.

---

## Interfaces and Dependencies

### Definition contract

`flow-graph.v2` is a strict discriminated union. Every node contains stable
`id`, exact `kind`, config schema version and executor contract version. Unknown
fields fail parsing. Presentation is stored separately.

```ts
type FlowGraphV2 = {
  schemaVersion: "flow-graph.v2";
  nodes: FlowNodeV2[];
  edges: FlowEdgeV2[];
};

type FlowEdgeV2 = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle:
    | "next"
    | "true"
    | "false"
    | "success"
    | "error"
    | "timeout"
    | "approved"
    | "rejected";
};
```

Initial V2 nodes use strict config and handle contracts:

| Kind                   | Strict config                                        | Required source handles                             |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `booking_confirmed`    | non-empty unique `productIds`                        | `next`                                              |
| `manual_client`        | empty object                                         | `next`                                              |
| `birth_data_available` | purpose `service_preparation`                        | `true`, `false`                                     |
| `astrologer_work_item` | task kind, title, optional instructions and priority | `success`                                           |
| `astrologer_approval`  | approval kind/title and optional expiry              | `approved`, `rejected`; `timeout` iff expiry exists |
| `completed`            | stable `goalKey`                                     | none                                                |
| `suppressed`           | stable `reasonCode`                                  | none                                                |
| `failed`               | stable `errorCode`                                   | none                                                |

Every node also pins `configSchemaVersion: 1` and
`executorContractVersion: 1`. Presentation positions, viewport, collapsed and
selection state live in `flow-presentation.v1`, never in the executable graph
or compiler hash. `repeat_until`, back-edges, arbitrary outcome handles and
branch reconvergence are unavailable in this schema version.

The request contract enforces hard structural safety caps of 200 nodes and 400
edges. The compiler separately accepts validated caller policy limits at or
below those caps, so plan/tenant policy can be stricter without changing graph
semantics or weakening the transport boundary.

The compiler returns a normalized graph, validation issues and capability
manifest. Publish persists the exact result. Activation revalidates referenced
mutable resources and current executor/capability availability. The manifest
is a requirement declaration, not proof that an executor is deployed.

### Definition use cases

Domain ports expose owner-scoped compare-and-swap operations. Exact names may
follow current repository naming, but behavior and parameters are mandatory:

```ts
updateDraft({ ownerUserId, flowId, expectedRevision, graph, presentation });
publishFlow({ ownerUserId, flowId, expectedRevision, idempotency });
activateFlow({
  ownerUserId,
  flowId,
  versionId,
  expectedActiveVersionId,
  expectedRevision,
  idempotency
});
pauseEnrollment({ ownerUserId, flowId, expectedRevision, idempotency });
stopActiveRuns({ ownerUserId, flowId, policy, idempotency });
```

Mutation idempotency is scoped to API surface, actor, owner, route, resource and
key, with canonical request hash and exact response replay. Same key/different
content is a typed `409`.

### Enrollment contract

Normalized events use strict per-kind schemas and producer registration:

```ts
type NormalizedFlowEvent = {
  ownerUserId: string;
  source: RegisteredFlowEventSource;
  sourceEventId: string;
  eventKind: RegisteredFlowEventKind;
  subjectType: FlowSubjectType;
  subjectId: string;
  occurrenceKey: string;
  occurredAtUtc: string;
  payloadSchemaVersion: number;
  allowlistedPayload: unknown;
  classification: FlowDataClassification;
  redactionVersion: number;
  retentionPolicyId: string;
  dedupeKey: string;
};
```

The producer identity and owning aggregate derive authority. Caller-supplied
owner data cannot grant access. Enrollment selects activation epoch by
`occurredAtUtc`, deduplicates against stable flow/trigger/policy occurrence and
pins one immutable version.

### Runtime store and interpreter

The DB adapter owns transaction and locking details. Domain owns pure decisions
and typed ports. Apps compose them.

```ts
type Claim = {
  tokenId: string;
  runId: string;
  flowVersionId: string;
  nodeId: string;
  leaseOwner: string;
  fencingToken: bigint;
  leaseExpiresAt: string;
};

type FinalizePredicate = Pick<Claim, "tokenId" | "leaseOwner" | "fencingToken">;

type InterpreterDecision =
  | { kind: "advance"; selectedHandle: FlowSourceHandle; trace: RedactedTrace }
  | { kind: "wait_timer"; dueAt: string; timeoutHandle?: FlowSourceHandle }
  | { kind: "wait_signal"; correlation: FlowSignalCorrelation }
  | { kind: "wait_work_item"; workItem: NewFlowWorkItem }
  | { kind: "wait_approval"; approval: NewFlowApproval }
  | { kind: "dispatch"; effect: PreparedFlowEffect }
  | { kind: "retry"; retryAt: string; error: TypedFlowError }
  | { kind: "fail"; error: TypedFlowError };
```

Claims are short DB transactions using database time and
`FOR UPDATE SKIP LOCKED`. Evaluation is bounded and occurs outside the claim
transaction. Finalize performs one-row CAS on claimed state, lease owner and
fence, then atomically appends attempt/trace and next token, wait, human object
or command/outbox intent. A zero-row finalize is a stale worker result and is
discarded observably.

### Node executors

Executor registry entries are typed and versioned:

```ts
type FlowNodeExecutor<C, R> = {
  kind: FlowNodeKind;
  contractVersion: number;
  capability: FlowCapabilityKey;
  evaluate(input: {
    nodeConfig: C;
    run: PinnedFlowRunContext;
    ports: ReadonlyFlowReadPorts;
  }): Promise<R>;
};
```

`evaluate` may perform bounded pure/authorized reads. It never calls an
external provider. External work returns a prepared owning-module command; the
DB transaction writes command/outbox intent, and the owning module executes it
idempotently and emits a result signal.

### Cross-module dependency direction

```text
frontend page -> validated contracts -> astrologer/public API module
API controller -> Flows domain use case -> Flows ports
packages/db adapter -> Flows ports + Drizzle schema
apps/workers composition -> interpreter + store + owning-module ports
Flows command -> owning module use case/outbox -> owning worker/provider
owning result event -> signal inbox -> waiting token
```

`packages/domain` never imports `packages/db`; packages never import apps;
Flows never writes another module's tables; controllers remain thin.

### API surfaces

Implement the exact definition/control, runtime/operations and client-facing
surfaces listed in section 16 of the design spec. All astrologer mutations use
cookie auth/CSRF and durable-state commands use idempotency. Client action
routes live in owning modules under `public-api`, never in astrologer Flows
controllers. Owner-scoped reads return no-leak not-found behavior.

---

## Plan of Work

Each milestone is a vertical, observable behavior group. Within a milestone,
repeat red -> confirm failure -> minimal production change -> green -> refactor
-> affected surface. Do not write all tests first or all implementation first.

### Milestone 0: Integrity Gate

**Observable outcome:** current unsupported runtime cannot activate, enroll or
create a manual run that appears executed. Existing definitions and history
remain readable, but v1 placeholder runs are labeled non-executable and excluded
from completion/conversion metrics. Simulation remains unavailable until the v2
interpreter can select one truthful path.

**Owned paths:**

- `packages/contracts/src/flows.ts` and test
- new `packages/domain/src/flows/flow-runtime-availability.ts` and test
- `packages/domain/src/flows/flow-runtime-use-cases.ts`
- `packages/domain/src/flows/flow-runtime-use-cases.test.ts`
- `packages/domain/src/flows/flow-use-cases.ts`
- `packages/domain/src/flows/flow-use-cases.test.ts`
- `packages/domain/src/flows/index.ts`
- `apps/astrologer-api/src/modules/flows/flows.service.ts`
- `apps/astrologer-api/src/modules/flows/flows.service.test.ts`
- `apps/astrologer-api/src/modules/flows/flows.e2e.test.ts`
- `apps/workers/src/flows/flow-runtime.outbox-relay.test.ts`
- only the affected Flows API/model/UI files under
  `apps/astrologer-web/src/features/flows/` and
  `apps/astrologer-web/src/pages/flows/`
- runtime-projection changes in
  `apps/astrologer-web/src/pages/dashboard/DashboardPage*`,
  `apps/astrologer-web/src/pages/inbox/InboxPage*` and
  `apps/astrologer-web/src/features/flows/model/inboxFlowContexts*`
- `.design-qa/flows/milestone-0/` browser evidence
- this plan's Progress/Discoveries sections

**Behavior sequence:**

1. Add failing domain tests proving traversal cannot create completed action,
   condition, approval or terminal step rows before execution.
2. Add a domain error with stable code
   `FLOW_RUNTIME_EXECUTION_UNAVAILABLE`. Before runtime-store writes, block v1
   activation, simulation, manual run and approval decision. Event dispatch
   returns `no_matching_flow` or terminal `execution_unavailable` with a
   matched-flow count; neither disposition creates a run/effect.
3. Map the domain error to typed HTTP `409`. Preserve create/edit/publish and
   read-only history. Existing active flows can still pause enrollment; legacy
   run cancellation is blocked until v2 has durable cancellation semantics.
4. Remove or isolate the precompletion planner from command paths. Do not add a
   feature flag that silently returns success.
5. Verify the outbox relay consumes `execution_unavailable`, logs only ids,
   matched-flow count and reason, and does not retain the event for retry or log
   payload content. A consumed outbox event is not a business execution result.
6. Update frontend state so activation, simulation, manual run and approval
   decisions are unavailable with the exact reason; keep list, edit, publish,
   pause and history usable. Render v1 placeholder completion as legacy
   non-execution and exclude it from success metrics.
7. Inventory active flows, pending approvals and v1 runtime rows before rollout.
   Server-backed availability prevents execution regardless of legacy status;
   any persisted status reconciliation remains a separate fail-closed,
   idempotent, audited operation and Slice 0 does not rewrite history silently.

**Acceptance:** focused tests observe typed error and absence of store writes;
the production UI cannot issue a runtime command as if supported; existing
placeholder history cannot appear as successful business execution; current
definition behavior stays green.

### Milestone 1: Graph V2 Definition Control Plane

**Observable outcome:** two astrologer tabs cannot overwrite each other; a
strict v2 graph validates and publishes immutably. A published version is
read-only and a new version does not switch active enrollment. Milestone 1 may
prepare epoch persistence and CAS contracts, but production activation remains
typed fail-closed until Milestone 2 supplies authoritative versioned executor
readiness; no unsupported command may create an epoch.

**Owned paths:**

- Flows contracts/tests;
- `packages/domain/src/flows/flow-validation*`, `flow-use-cases*`, templates and
  new compiler/capability-manifest files;
- `packages/db/src/schema/flows/flows.schema.ts`,
  `flow-versions.schema.ts`, values/index/tests;
- `packages/db/src/adapters/flows/drizzle-flow-store*`;
- Flows Nest module/controller/service/tests;
- Flows frontend API/model/builder/gallery files/tests;
- current DB baseline and snapshot only after shared-path re-audit;
- canonical architecture/API/product docs that become stale.

**Behavior sequence:** strict discriminated node schemas -> graph compiler and
handle matrix -> read-only validate surface -> optimistic draft revision ->
immutable publish snapshot -> activation epoch data/CAS contract without
opening execution -> pause/stop/archive -> template migration and
published-read-only UI -> conflict recovery -> Milestone 2 readiness-backed
activation enablement.

**Acceptance:** unknown config is rejected; every path terminates; v1 remains
readable/non-activatable; same revision has one winner; publish replay returns
the same version; activating v1/v2 with missing capability fails closed;
publishing v2 leaves the prior active epoch unchanged.

### Milestone 2: Durable Token Runtime and Recovery

**Observable outcome:** a supported internal graph advances one real token one
transition at a time, survives lost wake-ups/worker crashes and presents an
ordered pinned-version trace without precompleted future work.

**Owned paths:**

- new domain interpreter, transition, executor-registry, error and store-port
  files/tests under `packages/domain/src/flows/`;
- runtime contracts/tests;
- Flows runtime schema/adapter/integration tests;
- `apps/workers/src/flows/` executor/recovery composition and tests;
- Flows runtime API/controllers/tests;
- DB baseline/snapshot under the database runbook;
- observability/config files only after current-diff re-audit.

**Behavior sequence:** token/attempt/trace schema -> claim lease/fence -> pure
condition/terminal executors -> finalize CAS -> timer/signal inbox -> retry and
recovery sweeper -> cancellation/redrive -> effect state and owning-command
outbox boundary -> durable terminal/quarantine disposition for malformed or
aggregate-invalid outbox events -> run-detail projection.

**Acceptance:** real PostgreSQL tests cover concurrent claims, stale finalize,
transition+trace+outbox atomicity, early/duplicate signal, queue-wake loss,
lease recovery, cancellation races, unknown external outcomes and pinned
executor readiness. Permanent outbox failures are queryable, alerted and never
retried indefinitely. Fake query builders are supplementary only.

### Milestone 3: Booking Enrollment and Human Work

**Observable outcome:** one real confirmed booking enrolls one pinned run;
authorized birth-data condition chooses one branch; one reached work item waits
and resumes exactly once. Approvals have separate checksum-bound semantics.

**Owned paths:**

- Booking normalized-event producer inventory and transactional outbox paths;
- Flows subject resolver/enrollment/policy/domain/store/worker paths;
- separate work-item and approval contracts/schema/API/UI/tests;
- Dashboard and Inbox projections after their current diffs are re-audited;
- internal `Контроль подготовки` template and test fixture.

**Behavior sequence:** registered producer/schema -> owner-derived subject
resolver -> activation-epoch event-time matching -> occurrence dedupe ->
birth-data authorized read -> work-item wait/start/snooze/complete/expire/cancel
-> approval checksum/approve/reject/snooze/expire -> operational projections.

**Acceptance:** every booking confirmation path emits the same contract;
duplicate/late/out-of-order events obey explicit policy; owner/client mismatch
does not leak; work completion and approval decision atomically resume one
token; the fixture completes only through actual human-object transitions.

### Milestone 4: Studio, Operations and Simulation Parity

**Observable outcome:** desktop gallery/builder and mobile monitoring/human work
match the approved reference states while representing production lifecycle
honestly. Simulation explains exactly one selected path and invokes no effect.

**Owned paths:**

- Flows page/feature API, model, focused UI components and CSS/tests;
- stable reusable primitives in `packages/design-system` only when already
  proven reusable;
- Flows design-QA artifacts and approved design inventory mapping;
- flow-context projections used by Dashboard/Inbox.

**Behavior sequence:** gallery states -> template picker -> typed builder and
inspector -> validation/focus-to-node -> save/conflict/published lifecycle ->
path preview -> run detail/timeline -> work/approval surfaces -> responsive and
accessibility states.

**Acceptance:** component behavior plus real network-backed browser proof at
`1440x900`, `390x844`, `320x568`, RU/EN, 200% zoom, keyboard/VoiceOver,
reduced-motion and exact modal/overlay states. Evidence lives under
`.design-qa/flows/`; hidden overlays are absent from the accessibility tree.

### Milestone 5: Client Data, Durable Waits and Charts

**Observable outcome:** a missing-data branch creates an owner-branded client
action request, waits across reload, resumes from canonical consent/data
submission and then dispatches one canonical chart calculation whose real
result signal advances the run.

**Owned paths:**

- Flows wait executors, timer/signal runtime and tests;
- Clients/BirthData action-request contracts/domain/schema/API/events after
  preserving current BirthPlace work;
- `apps/public-api` and `apps/client-web` action-request surfaces/tests;
- Charts command/result port, owning use case/outbox/worker adapter/tests;
- flow template, runtime trace and frontend client-wait/chart states;
- DB baseline/snapshot and canonical docs.

**Behavior sequence:** typed `ClientActionRequest` -> relationship/purpose
authorization -> consent/input UI -> canonical owning-module mutation + event
-> signal-before-wait-safe resume -> duration/date/event waits with IANA
timezone/DST policy -> chart command intent -> chart-worker result -> trace.

**Acceptance:** revoked-before-read and revoked-before-submit fail closed;
client sees no graph internals; duplicate submission/signal/chart request does
not duplicate state; timer DST gap/overlap fixtures pass; chart mechanics never
run inside Flows/browser.

### Milestone 6: Reviewed AI and First Product E2E

**Observable outcome:** one confirmed consultation reaches
`consultation_prepared` only after real data readiness, real chart result,
minimized AI brief, approval of the exact checksum and completion of a
separate preparation work item.

**Owned paths:**

- typed AI preparation-brief command/result contracts and owning AI adapters;
- Flows AI executor, candidate/approval/work-item/goal semantics and tests;
- Flows API/worker/frontend artifact and trace surfaces;
- consultation-preparation built-in template;
- runtime/browser evidence artifacts and canonical docs.

**Behavior sequence:** minimized AI request -> durable result/failure signal ->
immutable candidate revision/checksum -> approve/edit/reject -> preparation
work item -> terminal goal -> run history/artifact projection.

**Acceptance:** no raw restricted data in prompt/trace; no silent AI fallback;
old approval cannot authorize edited payload; duplicate AI result cannot
advance twice; full E2E steps 1-10 and deterministic failure/race fixtures in
the design spec pass with persisted/network evidence.

### Milestone 7: Messaging-Safe Delivery

**Observable outcome:** a reviewed message/material can be manually sent only
when relationship, purpose consent, opt-out, quiet hours, frequency, provider
capability and plan limits pass at owning-module command acceptance; delivery
state and unknown outcomes are reconciled honestly.

**Owned paths:**

- Messaging/Notifications owning contracts/domain/adapters/workers already
  accepted by those modules;
- Flows draft/send executors and capability manifest;
- delivery attempt/result/reconciliation projections;
- approval/send UI, kill-switch config/operations and tests.

**Acceptance:** consent TOCTOU, provider rate limit, retry exhaustion,
unknown-after-dispatch, opt-out, quiet hours, frequency cap, kill switch and
manual replay are covered by integration/E2E. Queue acceptance never renders
as sent/delivered. `auto_send` remains disabled.

### Milestone 8: Accepted Reference Capability Expansion

**Observable outcome:** every `Implement` row in the design spec's capability
traceability table has a strict contract, owning producer/port, durable trace,
real adapter tests and browser acceptance; deferred/rejected rows cannot
publish or activate.

**Owned paths:** capability-specific Flows executors/templates plus the owning
module contracts/use cases/events for CRM segments, orders/payments requests,
AstroCalendar, content, additional calculations, audience jobs and analytics.

**Behavior sequence:** add one capability at a time in prerequisite order:
producer/owner contract -> executor manifest -> failure/consent/idempotency ->
template/UI -> integration/runtime/browser evidence. Segment/broadcast uses an
immutable audience snapshot and one run per client. Money state remains in
Orders/Payments/Finance. Conversion appears only with typed goals and a
documented attribution window.

**Acceptance:** capability matrix is reconciled row by row; no unavailable
palette item can activate; no guessed conversion/revenue metrics; canary and
kill-switch evidence precedes expansion. Parallel split/join requires a future
graph schema; arbitrary cycles remain prohibited.

---

## Concrete Steps

Run every command from `/Users/anton/Finext/ElevenHouse`.

### Per behavior group

1. Re-audit branch, status, index, complete target content and path diff.
2. Write the smallest behavioral test and run only that test. Record the
   expected failure and confirm it is caused by missing/wrong production
   behavior.
3. Apply the smallest production patch with `apply_patch`.
4. Re-run the focused test, then the affected package/surface.
5. Review complete diff for owner scope, idempotency, typed failure, silent
   fallback, stale assumptions and file focus.
6. Update this plan's Progress/Discoveries/Outcomes.
7. Stage exact owned paths, inspect cached name/status and diff, then commit one
   coherent verified behavior group. Do not commit if foreign staged paths are
   present.

### Targeted command families

```bash
pnpm test packages/contracts/src/flows.test.ts
pnpm test packages/domain/src/flows
pnpm test packages/db/src/schema/flows packages/db/src/adapters/flows
pnpm test apps/astrologer-api/src/modules/flows
pnpm test apps/workers/src/flows
pnpm test apps/astrologer-web/src/features/flows apps/astrologer-web/src/pages/flows
```

Use exact test files during red/green, then the directory command shown above.
After shared contract/domain changes:

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/domain build
```

After affected app work:

```bash
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/workers typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Use the actual package names verified from each `package.json`; do not guess a
filter if it changes.

### Database work

Before schema edits, follow
`docs/development/agent-runbooks/04-database-and-migrations.md`, inspect current
baseline/history and validate that the integration/reset target is the active
local ElevenHouse PostgreSQL. Regenerate the current baseline:

```bash
pnpm db:generate
```

`pnpm db:reset` is destructive and may run only after explicit authority and
local target verification. Integration tests use an existing local service:

```bash
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration <exact flow integration tests>
```

The guard must reject non-local targets. Production reconciliation is code and
test work only in this program unless deploy authority is separately granted.

### Broad gates

At the end of each milestone, run affected package builds/typechecks/tests and:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
```

At shared/cross-module completion run:

```bash
pnpm verify
```

A broad green gate does not substitute for real PostgreSQL, network/browser or
visual evidence.

### Browser evidence

Read-only check designated listeners first with `lsof`/`curl`. Use the exact
reference and production routes in the existing authenticated browser. Do not
start a missing service. For each approved state capture:

```text
.design-qa/flows/<milestone>/<state>/<viewport>/reference.png
.design-qa/flows/<milestone>/<state>/<viewport>/production.png
.design-qa/flows/<milestone>/<state>/<viewport>/measurements.md
.design-qa/flows/<milestone>/<state>/<viewport>/network.md
```

Inspect console, failed/duplicate network calls, DOM/computed geometry, focus,
accessibility tree and persisted reads after mutation. Runtime E2E uses real
network data and reload; component fixtures are not browser acceptance.

---

## Validation and Acceptance

### Program invariants

- No mutable draft executes; every run pins one immutable version and executor
  manifest.
- No future step is completed before its node transition actually succeeds.
- Exactly one condition branch advances; no canvas position/order semantics.
- Every durable mutation is owner scoped, revision/idempotency protected and
  replayable without duplicate effect.
- Worker lease expiry cannot let a stale worker finalize.
- Signal-before-wait, wait-before-signal, duplicates and out-of-order delivery
  are lossless and deterministic.
- External provider/owning-module acceptance is not business completion;
  outcome-unknown is reconciled before retry.
- Consent/relationship/capability is checked by Flows and atomically by the
  owning command receiver where authority can change.
- Work-item completion and approval decision are different transitions.
- No raw restricted data, credentials or full content bodies enter graph config
  or append-only audit trace.
- Published version, pause, stop-runs and kill-switch semantics are distinct.
- RU/EN content requirements fail activation rather than silently falling back.

### Evidence matrix

| Claim                   | Minimum proof                                                         |
| ----------------------- | --------------------------------------------------------------------- |
| strict graph/lifecycle  | contract + domain property tests + API conflict tests                 |
| token correctness       | real PostgreSQL concurrency/failpoint integration                     |
| worker recovery         | crash-window tests + persisted state inspection                       |
| owner/security boundary | API no-leak/CSRF/idempotency + cross-owner integration                |
| cross-module effect     | owning adapter/worker result + duplicate/reconciliation E2E           |
| frontend state          | component behavior + real network-backed browser reload               |
| design parity           | exact reference/production screenshots and computed measurements      |
| accessibility           | semantics/scan plus keyboard, focus and VoiceOver exercise            |
| program completion      | every design-spec `Implement` row + first product E2E + `pnpm verify` |

### First product E2E acceptance

Use the exact ten-step runtime scenario and deterministic race/failure fixtures
in sections 18 and 21 of the design spec. The terminal assertion is not merely
`run.status === completed`; it proves the selected path, pinned version,
authorized data decision, canonical chart result, minimized AI result,
approval checksum, work-item actor and `consultation_prepared` goal in ordered
persisted trace.

### Completion wording

Do not call Flows complete or production-ready while any design-spec
`Implement` row lacks its owning integration/evidence, while the first product
E2E is incomplete, or while required browser/DB acceptance is blocked. Report
implemented, verified, partial, deferred, blocked, skipped, residual risk and
unowned changes separately.

---

## Idempotence and Recovery

- All commands can be retried with the same idempotency key and canonical
  request hash; different content conflicts.
- Definition publish and activation use compare-and-swap and exact response
  replay.
- Source event ingestion and flow enrollment have distinct unique identities.
- Runtime transition finalize is fenced; sweeper recovery uses DB time and
  bounded batches.
- Effect command keys derive from run, step and semantic purpose; owning modules
  persist/replay result.
- Redrive keeps pinned version and lineage and does not repeat successful
  visible effects blindly.
- Schema reconciliation uses approved baseline hashes, advisory lock,
  transactional DDL where possible and resumable bounded backfill. Unknown
  history fails closed; production reset is prohibited.
- If a test fails after partial local fixture creation, rerun only its documented
  idempotent setup/cleanup. Never reset a DB, delete runtime history or clear a
  queue merely to obtain green.
- If an interrupted commit left owned files staged, inspect cached paths/diff
  before continuing. Never broad-reset or unstage another agent's index work.

## Artifacts and Notes

- Target-state design:
  `docs/superpowers/specs/2026-08-02-flows-production-module-design.md`
- Execution authority ADR:
  `docs/decisions/0011-flows-postgres-execution-authority.md`
- Reference routing analysis:
  `/Users/anton/Downloads/react-flow-routing-analysis-2026-08-02.md`
- Prior plans are implemented-state history, not current target truth:
  `docs/superpowers/plans/2026-07-26-flows-foundation.md`,
  `docs/superpowers/plans/2026-07-26-flows-persistence-api.md`,
  `docs/superpowers/plans/2026-07-28-flows-product-runtime.md`.
- Design evidence root: `.design-qa/flows/`.
- Record exact commit ids, test output summaries, DB target evidence and browser
  artifact paths here as milestones complete.
