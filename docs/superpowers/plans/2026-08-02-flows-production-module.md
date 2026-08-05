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

## Superseding Birth-Data Decision (2026-08-05)

This section supersedes every earlier reference in this plan to multi-profile
birth data, per-booking grants, revocation, consent waits, external chart-AI
consent, or processing-authority versions.

- A client owns exactly one birth profile. It is not selectable, switchable or
  scoped to an individual booking.
- Privacy-policy publication and registration legal acceptance are explicitly
  out of scope for this delivery. This module records no consent, grant,
  revocation or legal-acceptance state.
- A client may create or correct the profile. An astrologer may do the same
  only through an active explicit client--astrologer relationship. Every write
  records source, actor, immutable history and an expected revision; the
  database enforces CAS.
- Flow runtime evaluates confirmed-booking eligibility and the required chart
  readiness of that one profile. Missing data creates a durable client action
  request or astrologer work item, then re-evaluates readiness after a profile
  update. It never waits for consent.
- Chart calculation uses the single profile only in a relationship-scoped
  client/booking/service context. The relationship grants access for work; it
  does not create a separate profile permission.
- AI usage keeps only its technical immutable provider/resource audit record.
  No client consent record, junction table, grant ledger or hidden authority
  version participates in chart generation.

**Removal gate:** the old source contour is removed before new runtime work.
The generated pre-launch baseline must be regenerated from the combined shared
schema and must not retain the removed consent tables or columns. No automatic
destructive migration is permitted for an already deployed database.

## V1 Full-Removal Decision (2026-08-05)

There are no real users, deployed historical flow definitions or historical
birth-data records to preserve. Therefore this delivery must not retain a V1
compatibility contour, read adapter, migration command, migration table,
negotiated response variant, legacy-pause route, UI migration panel or
baseline-reconciliation branch. The database baseline and every Flow API,
contract, domain use case, worker and web model accept V2 only.

The V2-only data contract is deliberate: `flow-graph.v1`,
`flow-run-snapshot.v1`, V1 capability manifests and migration-origin metadata
are invalid input. A missing profile follows the ordinary V2 work-item path;
it never reintroduces a consent, grant or legacy wait state.

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
- [x] 2026-08-03 15:08 MSK: Milestone 2-A now has a deliberately narrow
      terminal-token kernel. PostgreSQL owns one runnable/claimed/terminal token,
      independent attempt and fencing counters, DB-time leases, `SKIP LOCKED`
      claiming, fenced finalize, append-only attempts/events and expired-lease
      recovery. The pinned V2 graph and capability manifest authorize the only
      deployed pure executor, `completed:1:1`; unsupported executors remain
      unclaimable and activation/enrollment remain fail-closed. This is not the
      broader Milestone 2 traversal runtime or a canary-readiness claim.
- [x] 2026-08-03 15:08 MSK: production baseline reconciliation now distinguishes
      exact absent, six-table predecessor and nine-table current Flows runtime
      catalogs by PostgreSQL fingerprint. It creates a missing historical
      foundation losslessly, rejects partial/drifted state, upgrades the exact
      predecessor without fabricating tokens or trace, and records the current
      baseline only after verification. Focused PostgreSQL evidence now passes
      15/15 execution-store scenarios and 11/11 baseline-reconciliation scenarios;
      worker processor/recovery tests pass 9/9 and DB/workers typechecks pass.
- [x] 2026-08-03 15:39 MSK: independent runtime and migration review closed the
      M2-A correctness findings. Finalize rejects an expired lease before
      recovery and sources attempt audit identity from the locked PostgreSQL
      row; claim performs exact JSON pin filtering plus domain validation before
      leasing. Execution history rejects `UPDATE`, aggregate-independent
      `DELETE` and `TRUNCATE`; catalog fingerprints include trigger enabled state
      and exact predecessor histories cannot silently recreate missing runtime
      data. Reconciliation rollback and concurrent-process serialization now
      have real PostgreSQL fault-injection coverage.
- [x] 2026-08-03 16:29 MSK: the shared Chart V2 prerequisite is now reconciled
      without weakening either module. Exact historical V1 chart catalogs are
      upgraded transactionally; real V1 relationship results reconstruct the
      partner only from matching input/result snapshots, preserve the complete
      succeeded calculation and reject disagreement or duplicate participant
      identity before DDL. Exact-current and second-run evidence compares raw
      catalog, relation OID, rows with `xmin` and migration ledger. The combined
      PostgreSQL gate passes 32/32 scenarios: 15 execution-store and 17 baseline
      reconciliation tests.
- [x] 2026-08-03 17:18 MSK: Milestone 2-B adds a durable, idempotent cancellation
      control without opening execution. PostgreSQL owns command identity,
      canonical request hash and exact 24-hour status/body replay, including
      owner-indistinguishable missing-run and terminal conflicts. Cancellation
      serializes with finalize and recovery through token-first locking,
      invalidates the fence, records the persisted claimed attempt when one
      exists and appends one command-linked `run_canceled` trace. Runnable work
      does not receive a fabricated attempt; legacy, inconsistent and
      `waiting_external` work fails closed.
- [x] 2026-08-03 17:18 MSK: the authenticated, CSRF-protected
      `POST /flow-runs/:runId/cancel` API now remains available as an operational
      containment control while enrollment stays `definition_only`. It requires
      exactly one valid `Idempotency-Key` field line; distinct/raw Node HTTP
      headers prevent duplicate field lines from being accepted after framework
      normalization. Domain/API evidence and a real HTTP duplicate-header test
      pass; fresh aggregate affected-surface verification remains the next gate.
- [x] 2026-08-03 17:30 MSK: fresh cancellation affected-surface verification
      passes 10 unit/API/worker/schema files with 80 tests and 3 real PostgreSQL
      files with 47 integration scenarios. Focused ESLint and Prettier pass;
      domain, workers and astrologer-api typecheck/build plus DB build pass. The
      active local target was verified as `localhost:5432/elevenhouse`, then the
      current single baseline reset, migrated and seeded successfully.
- [x] 2026-08-03 17:50 MSK: independent cancellation review found four
      production-boundary concerns. Three reproduced as failures and are now
      closed by strict bodyless HTTP validation, succeeded-command provenance
      checks at both adapter and deferred DB-trigger layers, and transaction-
      local one-second lock/five-second statement budgets with retryable typed
      `503` and full rollback. The fourth concern was an ADR mismatch rather
      than an implementation defect: exact replay payload remains immutable for
      24 hours and is then purgeable, while the immutable command tombstone and
      command-linked redacted trace remain. A post-expiry retention test now
      makes that policy explicit.
- [x] 2026-08-03 19:04 MSK: scoped independent re-review returned `APPROVE`
      with no remaining Critical, Important or Minor findings. A final review
      gap was reproduced first: an enabled trigger could still call a drifted
      no-op provenance function. Current-baseline reconciliation now compares
      that function's exact canonical `pg_proc` body and a real PostgreSQL
      regression proves fail-closed behavior. Fresh aggregate evidence passes
      11 unit/API/worker/schema files with 95 tests and 3 PostgreSQL files with
      52 integration scenarios. Focused ESLint, Prettier and diff checks pass;
      contracts and DB typechecks plus contracts, DB, workers and API production
      builds pass.
- [x] 2026-08-03 20:24 MSK: Milestone 2-C1 closes the runtime-dispatch outbox
      loss window without treating queue acceptance as execution. Claims use a
      monotonic fence; exhausted deterministic work enters queryable quarantine
      with an allowlisted reason, while stale acknowledge/retry writes are
      rejected. The lossless production transition adds no business-row DML,
      locks before exact catalog fingerprinting and preserves existing `xmin`
      and `ctid`. Focused outbox evidence passes 12/12 PostgreSQL scenarios,
      including invalid predecessor rollback, exact no-op, drift rejection and
      concurrent reconciliation. A follow-up case-only drift regression keeps
      quoted status literals case-sensitive in the catalog identity; exact
      predecessor/current hashes are
      `526f772ea2685024db091b0b2b621ecd2c4ae97dcf7574a091e9caecf8934d42`
      and
      `46f10ace3c834dc6a6c56595f0ebddda9faf98748f0f89e2f13af15cb2ed1546`;
      relation persistence, RLS, forced RLS and access method are part of that
      identity rather than an implicit assumption.
- [x] 2026-08-03 20:24 MSK: Milestone 2-C2 adds durable poison and retry
      disposition to the deliberately narrow terminal executor without enabling
      scheduling. Executor decisions are runtime-validated before persistence;
      definition poison is terminally quarantined without a fabricated attempt,
      and a lost/uncertain success-finalize response is never reclassified as a
      node failure. Tokens pin `flow-execution-retry.v1` with three total
      attempts and capped equal-jitter DB-time backoff; unknown exceptions receive
      one defensive retry, explicit transient errors use the full budget and
      exhausted leases fail terminally. Recovery commits one token per short
      transaction, due retries are reclaimable and cancelable, and cancellation
      of a scheduled retry creates no additional attempt. Fresh evidence passes
      35 focused unit/schema tests and 40 execution/cancellation PostgreSQL
      scenarios after a verified local baseline reset and seed.
- [x] 2026-08-03 20:24 MSK: the execution-safety production transition is
      additive and lossless for the exact approved predecessor. Exact catalog
      fingerprints are
      `44c71eab17fca7a598255bcb9c7e1a7f9e158f881e0f746ec7a5ade27f476bd3`
      before and
      `4a601ef8e68f0e38538a7f624727c8a0afb499e40160e2eb4914659fd64ee65a`
      after; reconciliation locks all three execution-history relations, rejects
      partial drift and rejects legacy failed/retry rows whose reason cannot be
      inferred losslessly. The fingerprint includes relation durability/RLS and
      the exact body, owner, language, volatility, security and configuration of
      every referenced trigger function. SQL literals remain case-sensitive in
      the fingerprint, so a case-only change to a command-provenance predicate is
      rejected. Twelve real PostgreSQL scenarios cover no physical
      token/attempt/event rewrite, generated-baseline equality, body and
      case-only function drift, relation RLS/forced-RLS, rollback, exact no-op
      and concurrency. The generated baseline is
      `bf9787c8efeb873169dabb94ca99af08cdd073675494c03744659142ed73a319`
      at journal time `1785783440777`. It is the approved current production
      identity after every present Chart, Calculation Publication, Client
      Consent/AI and Flows transition gained an exact reconciliation path;
      `5831a6c30c9c33aa93058f1f119dd4697253b73d7b2743f7e20ec8d7f014ccc9`
      at `1785768455149` is its explicit Flow-safety predecessor.
- [x] 2026-08-03 21:13 MSK: independent architecture and QA/SRE review reopened
      M2-C2 on four correctness gaps, each reproduced with a failing PostgreSQL
      test before repair. Finalize now locks the exact token first and compares
      its deadline with a fresh post-lock `clock_timestamp()`; the frozen
      transaction start time can no longer authorize a worker that waited past
      its lease. Retry V1 is an immutable `3 / 1000 / 60000` tuple in domain,
      schema, production DDL and runtime validation. Counter/fence constraints
      reject zero-attempt claims and over-budget runnable/retry work, while
      malformed expired claims enter typed quarantine without a fabricated
      attempt. Failure reasons are disposition-specific and catalog equality now
      detects trigger-function replacement. Fresh evidence passes 21 Flow unit
      files / 161 tests and 5 PostgreSQL files / 63 scenarios after a verified
      local baseline generation, reset, migration and seed. A repeat independent
      review remains the final M2-C2 gate before traversal work starts.
- [x] 2026-08-03 21:38 MSK: the repeat-review blockers now have deterministic
      PostgreSQL regression coverage and fail-closed repairs. Failure-state
      constraints explicitly require non-null disposition and reason instead of
      relying on three-valued `CHECK` evaluation. Claim runtime validation also
      quarantines legacy claimable rows with incomplete failure metadata. Claimed
      timestamps must precede lease deadlines; recovery quarantines temporally
      corrupt expired claims without entering an attempt-insert retry loop.
      Cancellation reads `clock_timestamp()` only after the token and run locks,
      so token, run, attempt, event and command-outcome chronology cannot predate
      a claim written while cancellation was blocked. A forced lock-order test
      reproduces the old failure and verifies all persisted transition times.
      Fresh evidence at that checkpoint passed all 7 Flow PostgreSQL files / 87
      scenarios, DB typecheck/build, focused ESLint/Prettier/diff checks and 23
      Flow unit files / 179 tests. Production-baseline promotion remained open
      for the final reconciliation-history review recorded below.
- [x] 2026-08-03 22:08 MSK: pre-review production wiring and temporal hardening
      are in place. The main production reconciler applies
      and independently attests both Flows safety transitions for every accepted
      history. Claim leases start from a fresh post-validation database clock;
      future-dated claims, invalid `attempt_number > 3` histories and fences
      below their attempt are rejected or quarantined without fabricated work.
      Outbox identity now detects `UNLOGGED`, RLS, forced-RLS and access-method
      drift. Deterministic cancel/retry/recovery ordering tests cover both sides
      of each race. The full production-history reconciliation gate passes all
      22 real PostgreSQL scenarios.
- [x] 2026-08-03 22:41 MSK: independent architecture and QA/SRE repeat review
      found four additional release risks; all were reproduced before repair.
      Recovery now compares candidates with same-statement wall time and cannot
      expire a live claim committed after its transaction began. Run claims and
      poison quarantine share a fresh post-validation/post-lock clock with token
      and trace history. The broad runtime catalog now detects durability, RLS,
      forced-RLS, access-method, constraint-validation, index-validity and
      command-function owner/config drift. The checked-in baseline and journal
      are the approved current identity, with
      `5831a6c30c9c33aa93058f1f119dd4697253b73d7b2743f7e20ec8d7f014ccc9`
      classified as an exact
      predecessor. A real `reconciler -> drizzle migrator -> reconciler` test
      proves the migrator is a no-op after ledger promotion and existing Flow
      rows retain their `xmin`. The full production-history gate passes 27/27.
- [x] 2026-08-03 23:01 MSK: the final QA/SRE pass reproduced one remaining
      microsecond chronology risk. PostgreSQL could return a later
      `.390819` instant that JavaScript `Date` serialized as `.390000`, behind an
      earlier `.390814` write. A deterministic PostgreSQL regression now proves
      that transition clocks are rounded upward to the next representable
      millisecond, and execution plus cancellation share that fail-closed clock
      primitive. Execution passes 34/34, cancellation 25/25 and the selected
      seven-file PostgreSQL Flows surface passes 129/129; DB typecheck and scoped
      lint/format pass. Independent QA re-review approved the exact repair with
      no remaining Critical or Important finding.
- [x] 2026-08-03 23:13 MSK: product and architecture review selected the M2-D
      atomic-advance model. Enrollment consumes the trigger and creates the
      first token on its unique `next` target; trigger nodes do not fabricate
      worker attempts. One stable run token carries a monotonically increasing
      node activation sequence and run-wide fence, while its node-local attempt
      counter resets only after a successful advance. Finalize must resolve the
      target again from the persisted immutable graph. M2-D will prove this with
      a test-only non-trigger executor while activation, enrollment, polling and
      built-in condition execution remain disabled.
- [x] 2026-08-04 10:34 MSK: the pre-enrollment capability boundary is now
      versioned. New compilation emits `flow-capability-manifest.v2` with exactly
      one `triggerMatcher`; `nodeExecutors` contains only downstream executable
      nodes. Runtime parsing and published-version responses accept V1 and V2,
      while a deterministic compatibility projection preserves integrity checks
      and next-draft creation for immutable V1 versions. RED-to-green evidence
      passes 22 focused unit files / 193 tests plus contracts and domain
      typechecks. This does not enable activation, enrollment or trigger polling.
- [x] 2026-08-04 10:52 MSK: the execution boundary now enforces that enrollment
      triggers can never become worker tokens, attempt traces or transition
      targets, including historical V1 manifests that still contain their
      immutable trigger entry. Contracts and domain types narrow claims,
      registries, decisions and traces to executable node kinds; the interpreter
      rejects both a trigger token and an edge back into a trigger before executor
      lookup. Cancellation derives its trace kind from the validated pinned node.
      Drizzle source, atomic-upgrade DDL and reconciliation preflight apply the
      same executable-only allowlist and refuse historical trigger execution data
      without rewriting it. RED-to-green evidence passes 3 focused files / 61
      tests and a real isolated-PostgreSQL reconciliation rollback scenario. DB,
      API and worker typechecks report no Flow diagnostic; their remaining errors
      are concurrent Finance, Chart and Calculation work outside this contour.
- [x] 2026-08-04 11:23 MSK: independent QA findings on publication/runtime
      integrity are closed in source. Every claim now verifies the complete
      pinned graph against the exact V2 manifest or deterministic historical V1
      projection before executor lookup. A gated publication can persist V2,
      current validation responses expose only V2 after explicit phase and
      media-type opt-in, and
      `triggerMatcher.eventSchemaVersion` explicitly pins the normalized event
      contract. Persisted publication rows cross a typed fail-closed domain
      parser rather than JSON casts; Drizzle and transition DDL constrain exact
      manifest top-level keys plus all V2 matcher version fields. Fresh evidence
      passes 22 Flow unit/API/worker/schema files / 196 tests, 4 dependent
      frontend/DB files / 37 tests, contracts build, domain typecheck and domain
      build. DB typecheck has no Flow diagnostic; current failures are confined
      to concurrent Finance and platform-billing work. Generated-baseline and
      real PostgreSQL catalog acceptance remain pending below.
- [x] 2026-08-04 12:50 MSK: independent QA blockers on fresh/current deployment
      are closed. The checked-in baseline is an exact approved predecessor for
      additive reconciliation: production installs the graph/manifest boundary,
      executable-only trace constraints and completed-node invariant under the
      existing transaction and advisory lock, then proves exact current catalog
      identity; a second run is a no-op. PostgreSQL rejects marker-only V1/V2
      graphs and exact domain parsing audits every immutable predecessor row in
      bounded batches before constraint installation. Publication rollout now
      has explicit `legacy_v1` and `manifest_v2` phases, separates response from
      persistence versions, preserves exact replay across phase changes, and
      merges `Vary: Accept` with existing cache dimensions. Focused evidence is
      14 manifest-safety, 16 execution-safety, 47 execution-store, 25
      cancellation-store and 19 definition-store PostgreSQL tests, plus 91 API
      unit/config tests and 5 HTTP E2E tests. Full affected-surface and
      independent QA reruns remain pending.
- [x] 2026-08-04 13:38 MSK: the fresh/current deployment gate is independently
      accepted. The real deploy order is now reconciler -> migrator ->
      reconciler -> seeder; a negative PostgreSQL probe proved that late catalog
      drift rolls both Flow safety constraints back atomically. The
      already-current manifest path takes an `ACCESS EXCLUSIVE` lock and repeats
      the complete domain-readability audit instead of trusting SQL shape alone.
      Independent QA passed 48/48 targeted scenarios and accepted both original
      blockers; the broader Flow unit contour passes 31 files / 275 tests and
      eight real PostgreSQL suites pass 140/140.
- [x] 2026-08-04 20:08 MSK: activation/enrollment command authority is complete
      as a separate lifecycle from legacy `flows.status`. PostgreSQL serializes
      definition, enrollment, actor-subject, entitlement/quota and transactional
      runtime readiness; commands pin every CAS input, persist exact 24-hour
      replay plus durable tombstones, and create/close immutable activation
      epochs without accepting caller-provided readiness. The owner-scoped
      no-store enrollment read returns the exact active epoch or a deterministic
      inactive revision-zero projection. HTTP exposes strict idempotent
      `/activate` and `/pause-enrollment`; the historical `/pause` remains only
      as a same-lock legacy drain and refuses active enrollment authority. Fresh
      evidence passes 8 contract/domain/API files / 79 tests, 2 real PostgreSQL
      files / 26 tests, 10/10 independent capability-operation contracts and the
      exact Flow surface audit. Focused ESLint, Prettier and diff checks pass;
      contracts/domain builds pass. DB build is blocked only by three concurrent
      Finance diagnostics, and the global controller audit only by a concurrent
      Clients/Geoapify route. Negotiated V3 list/detail reads, activation review
      and frontend cutover remain open; runtime stays `definition_only`.
- [ ] 2026-08-04 21:03 MSK: negotiated V3 list/detail reads and the backend
      activation-review contour are implemented. Exact vendor media types now
      expose enrollment authority and isolate `legacy_active`; V2 remains the
      default representation. Activation review is a strict owner-scoped,
      no-store, read-only snapshot with complete activation CAS and explicit
      blockers, wired through contracts, domain, Drizzle, API and capability
      audit. Focused contract/domain/API tests and the 126-operation capability
      contract pass. Final PostgreSQL acceptance is pending only because the
      concurrent tariff schema added recurring-frequency columns after the
      local baseline was applied; the test reaches PostgreSQL and fails on the
      missing local column before Flow review executes. Frontend V3/CAS cutover
      remains the next implementation slice.
- [ ] 2026-08-05 04:58 MSK: the first durable human-work slice now reaches the
      production `/flows` source contour. Contracts, domain commands, PostgreSQL
      persistence, interpreter and worker wake lane distinguish a `FlowWorkItem`
      from approval and wait on `astrologer_work_item`; completion atomically
      resumes the pinned token and appends command-linked trace. Owner-scoped
      list/start/snooze/complete HTTP composition is paired with strict frontend
      adapters, stable command retry identity, revision-conflict refetch gates,
      profile-timezone presentation and DST-safe snooze controls. The queue is
      mounted independently of definition-list failure and automatic query retry
      is disabled so semantic `4xx` responses do not create duplicate noise.
      The Dashboard now projects the same authoritative queue with a bounded
      five-item read and no longer labels legacy approval previews as tasks.
      Fresh safe evidence passes 20 files / 183 tests, astrologer-web typecheck,
      production build and scoped lint; exact-file formatting is clean. The real
      Chrome session proves desktop and effective 500px responsive error states,
      no horizontal overflow and exactly one work-item request on both `/flows`
      and `/dashboard`. The running API is an older build that rejects V3 list
      and lacks work-item routes, so successful command/reload browser evidence
      and the final capability/DB aggregate gate remain this slice's open
      acceptance boundary; no process was restarted without authority.
- [ ] 2026-08-05 06:14 MSK: Booking lifecycle propagation is the active
      Milestone 3 slice after independent product, architecture and QA reviews.
      The confirmed-booking happy path is directionally correct, but release is
      blocked because Booking has no revisioned cancel/reschedule authority,
      the outbox cannot identify repeated reschedules, manual run cancellation
      has authenticated-owner provenance only, and work-item deadlines remain
      pinned to the original booking snapshot. The implementation sequence is
      now Booking-owned monotonic lifecycle revision plus immutable events,
      provider-neutral transactional outbox, system-provenance cancellation of
      non-terminal runs/work items, then accepted-reschedule subject state and
      provenance-backed deadline adjustment. A reschedule request changes no
      booking or Flow state before acceptance; completed work is never reopened
      or rewritten. Paid-booking cancellation remains fail-closed until Finance
      supplies exact refund authority. Research accessed 2026-08-05 confirms
      separate cancel/reschedule events, cancellation of old scheduled actions,
      activation-time task due dates and separate refund execution in Cal.com,
      Camunda and Stripe official documentation.
- [ ] 2026-08-05 08:02 MSK: the Booking-owned lifecycle foundation is now
      implemented through domain, strict contracts, PostgreSQL and the
      astrologer API. Manual confirmation, paid confirmation and owner
      cancellation advance `lifecycleRevision`, append one canonical immutable
      lifecycle event and enqueue an ids-only provider-neutral outbox intent in
      the same transaction. Owner cancellation is CSRF/idempotency protected,
      revision checked, owner isolated and fail-closed for paid bookings without
      refund authority. A clean local baseline reset/seed passed; focused domain,
      contract, API and seven real PostgreSQL scenarios passed. The reset removed
      the previously registered local auth account, and the already running API
      and worker still serve an older build, so browser success evidence remains
      open without process-lifecycle authority.
- [ ] 2026-08-05 08:02 MSK: Flow-side lifecycle consumption is now specified as
      a separate ordered projection, not an extension of authenticated runtime
      commands. A per-booking Flow lifecycle head plus immutable per-event receipt
      will serialize application by revision and preserve the original outcome.
      The consumer reads the canonical Booking lifecycle event by UUID, verifies
      its digest and transition chain, and uses system-event provenance for run
      and work-item cancellation. The historical enrollment snapshot stays
      immutable; accepted reschedule will update a separate mutable subject-state
      projection and active deadlines under the same event provenance.
- [x] 2026-08-05 09:27 MSK: the reschedule execution and operator-safety slice is
      implemented through the Booking aggregate, ordered Flow projection,
      execution claims/finalization, work-item queue and all three operator
      commands. The immutable enrollment snapshot remains audit evidence; an
      effective execution context overlays only a confirmed, contiguous Flow
      lifecycle head. Active schedule-bound obligations carry a structured
      deadline basis and are recalculated from the pinned node policy; completed
      work remains untouched. Queue reads and commands share one freshness gate:
      projection lag returns typed `context_pending`/`409`, inconsistent evidence
      fails closed, and a Booking command must match both work-item revision and
      lifecycle revision. The shared request contract keeps lifecycle revision
      optional only because non-Booking work items are valid; the PostgreSQL
      adapter rejects omission for a Booking-linked target. Fresh evidence passes
      8 contract, 7 domain, 11 projection, 44 API and 25 frontend assertions plus
      the focused real-PostgreSQL mixed-revision scenario; contracts/domain builds
      and API/web/DB typechecks pass. Full lifecycle integration, baseline gates
      and network-backed browser acceptance remain the next aggregate boundary.
- [x] 2026-08-04 14:58 MSK: worker lifecycle composition now runs bounded
      global expired-lease recovery in both `definition_only` and canary modes,
      while new claims remain tied to a runtime-owned, strict non-empty owner
      allowlist. Removing an owner from canary cannot strand an old claim:
      recovery fences it globally and any retry remains dormant until that owner
      is admitted again. Execution and recovery use independent no-overlap lanes,
      bounded batches, capped error backoff, sanitized deadline failures,
      operational readiness and a fatal 45-second drain deadline before database
      shutdown. Production config still rejects canary with
      `WORKERS_FLOW_EXECUTION_PERSISTED_CONTROL_REQUIRED`; therefore this group
      enables maintenance recovery, not production enrollment or claims.
      Fresh evidence passes 6 worker files / 41 tests and 2 PostgreSQL files /
      75 scenarios; workers typecheck/build, focused ESLint, formatting and diff
      checks pass. The broad DB typecheck is currently blocked only by concurrent
      Finance code missing `orderSnapshotVersion` in
      `drizzle-provider-operation-intent-creation-uow.ts`. `docs:check:test`
      passes 8/8; broad `docs:check` remains blocked by the concurrent
      `finance-infrastructure`, `platform-tariffs` and `fiscal-profiles` entries.
- [x] 2026-08-04 18:13 MSK: runtime-control v2 now owns every production claim.
      One PostgreSQL transaction locks current policy, validates the exact live
      worker session/readiness revision, intersects deployment ceiling, owner
      subjects, kill switches and pinned requirements, then claims with the
      policy-owned lease duration. Worker startup registers only `executor`,
      heartbeats without overlap, closes claims on readiness loss, persists
      drain before shutdown and runs bounded command/registration retention.
      Actor-subject resolution and command creation are one atomic transaction.
      Every controlled token and immutable attempt retain the exact policy
      revision/digest and worker session/registration digest that authorized the
      claim. Additive reconciliation upgrades the approved execution predecessor
      without rewriting existing rows and independently attests catalog
      `3b3b6db...`. Fresh evidence passes 8 worker files / 40 tests, the full
      execution store 50/50, execution migration 16/16, runtime-control commands
      9/9 and controlled claim 1/1 on real PostgreSQL. Domain and DB builds plus
      workers typecheck pass. Repository DB typecheck remains blocked only by
      concurrent Finance tests; the shared regenerated baseline is temporarily
      non-executable and its hash metadata is unsynchronized, so default-baseline
      acceptance is pending while predecessor acceptance is proven. Runtime
      remains `definition_only`, and no enrollment role is advertised.
- [x] 2026-08-03 20:24 MSK: current retry research (accessed 2026-08-03) confirms
      the chosen product boundary across AWS Step Functions, Google Cloud
      Workflows and Azure Functions: retryability is explicit, attempts are
      bounded, backoff is capped and exhaustion enters a catch/terminal path.
      ElevenHouse additionally pins the policy snapshot per token so a deploy
      cannot silently change an in-flight run.
- [ ] 2026-08-03 23:01 MSK: repository-wide typecheck remains externally
      blocked in the shared checkout. Domain currently fails in concurrent
      Finance refund evidence because three codec readers are not exported;
      workers fail in four concurrent CalculationRecord PDF fixtures where
      `interpretationMode` is missing or optional. DB typecheck passes.
      `docs:check:test` passes 8/8 and `docs:check` passes all 164 files. Focused
      Flows gates are green; these unrelated source/tests were not edited.
- [ ] 2026-08-03 16:29 MSK: a Flow-only commit remains unsafe even though the
      generated baseline now has an approved production identity. The artifact
      contains multiple concurrent, uncommitted source contours, including Chart
      V2, Clients, AI and Finance; staging it without every separately owned
      source path would make the commit internally inconsistent. Re-audit the
      shared index and ownership before exact-path staging.
- [ ] 2026-08-04 13:38 MSK: Milestone 1 network-backed browser acceptance is
      partial. Existing listeners on `astrologer-web:5174` and
      `astrologer-api:3002` are reachable, and the authenticated system Chrome
      session proves the production `/flows` empty state plus the honest
      available/disabled template catalog. Full exact reference comparison,
      responsive states, console/network capture and persisted mutation reload
      evidence remain open before the milestone checkbox can close.
- [x] Milestone 0: fail current unsupported runtime closed.
- [ ] Milestone 1: ship graph v2 definition control plane.
- [x] Milestone 2: ship durable token runtime and recovery foundation.
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
- 2026-08-03: approved histories before the original runtime-foundation baseline
  could be relabeled current without creating the six Flows runtime tables.
  Runtime reconciliation must therefore accept only an exact absent catalog or
  exact predecessor catalog, build the missing foundation transactionally and
  reject every partial shape.
- 2026-08-03: attempt number and fencing token are separate monotonic identities.
  Lease recovery consumes the old fence, appends that attempt as
  `lease_expired`, increments only the fence and leaves the token runnable for a
  new attempt number on the next claim.
- 2026-08-03: the historical Chart V1 completion adapter always stored
  relationship calculations as `individual` with one authoritative subject;
  the partner existed only in matching job-input and result snapshots. A
  V2-shaped migration fixture hid this production incompatibility. The
  reconciliation fixture now parses a contract-valid V1 payload, uses a
  canonical checksum and proves deep before/after preservation.
- 2026-08-03: repository-wide `@elevenhouse/domain` typecheck/build is currently
  blocked outside Flows by concurrent incomplete
  `packages/domain/src/finance-core/source-lots.ts` work. The focused Flows
  TypeScript compile, six-file unit gate, DB build, workers typecheck/build and
  focused ESLint pass; do not alter or absorb the finance contour.
- 2026-08-03: a fingerprint built only from `pg_trigger` proves trigger identity,
  definition and enabled state but not the referenced `pg_proc`. Execution safety
  now fingerprints each distinct trigger function's canonical body, owner,
  language, volatility, security mode and configuration together with table
  durability/RLS, so a no-op function replacement changes the exact catalog.
- 2026-08-04: applying the canary owner scope to expired-lease recovery would
  strand a claimed token as soon as an owner is removed from the allowlist.
  Canary scope is therefore claim authority only. Recovery is global maintenance
  authority, runs in `definition_only`, invalidates the old fence and leaves a
  scheduled retry dormant behind the claim gate.
- 2026-08-05: the canonical booking-confirmed transport currently carries only
  `bookingId`, while enrollment later reads the mutable Booking row. Cancellation
  before relay becomes `subject_ineligible`, but a future reschedule would mix
  the confirmation event time with new schedule data. Revisioned immutable
  lifecycle-event snapshots are required before reschedule can be truthful.
- 2026-08-05: outbox identity is currently unique by `(eventType, aggregateId)`.
  That is sufficient for one confirmation and one terminal cancellation, but it
  cannot represent two accepted reschedules of the same booking. Lifecycle
  event UUID plus aggregate revision must become transport identity; booking ID
  remains the subject identity.
- 2026-08-05: manual run cancellation already serializes token, run and active
  work-item state correctly, but its durable authority is an authenticated
  astrologer API command. A Booking consumer cannot reuse it with a fabricated
  actor. System lifecycle events need distinct immutable provenance while
  sharing the same token-first transition kernel.
- 2026-08-05: the queue joins mutable booking time to an immutable work-item
  `dueAt`. Without an applied booking revision and mutable subject state, a
  reschedule would show a new session time beside an old deadline and allow a
  stale completion command. This is a release blocker, not a display defect.
- 2026-08-05: checking lifecycle freshness only while projecting the queue is
  insufficient because a command can race a reschedule after the read. Read and
  command paths therefore use the same projection function; the command repeats
  it while lifecycle, run and work-item authority is locked and persists the
  typed rejection as the idempotent command outcome.
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
- **2026-08-05, human-work product boundary:** a `FlowWorkItem` is an obligation
  for the astrologer to perform work and can resume a run only through its own
  lifecycle. A `FlowApproval` authorizes exactly one immutable candidate/action
  revision and cannot stand in for a manual task. Existing legacy approvals stay
  read-only until candidate identity, revision, checksum and expiry are durable.
  Work-item list/start/snooze/complete are historical obligations of an accepted
  run, so tariff expiry must not strand them behind a direct capability guard;
  owner scope and persisted-run provenance remain mandatory.
- **2026-08-05, Booking lifecycle authority:** Booking owns a monotonic
  `lifecycleRevision` and immutable `confirmed`, `rescheduled` and `cancelled`
  lifecycle events with event UUID, before/after UTC schedule, actor/provenance
  and canonical digest. Aggregate mutation, reservation mutation, lifecycle
  event and provider-neutral outbox intent commit in one transaction. Flows
  consumes ordered events; it never writes Booking state or treats a Flow-owned
  command as the source of booking truth.
- **2026-08-05, cancellation semantics:** a booking-cancelled event cancels every
  non-terminal run and active `pending`, `in_progress` or `snoozed` work item for
  that booking through system-event provenance. Already completed work remains
  immutable; any later non-terminal continuation is stopped. Cancel-first makes
  stale completion fail, while complete-first preserves the completed item and
  allows cancellation to stop only subsequent work. Paid cancellation is
  rejected until an owning Finance refund authority is present and auditable.
- **2026-08-05, reschedule semantics:** proposing a new slot creates a request
  and changes no booking, reservation, run, work item or deadline. Acceptance
  preserves booking, occurrence, run and work-item identity, advances booking
  revision, updates a mutable Flow subject-state projection and recalculates an
  active work item's deadline from the pinned policy. Completed steps are not
  replayed or reopened. For snoozed work, the effective wake instant is the
  earlier of the user-selected snooze and the recalculated due instant, so a
  reschedule cannot hide newly urgent work. Client, product or commercial-term
  changes require cancellation plus a new booking rather than reschedule.
- **2026-08-05, lifecycle delivery ordering:** exact event replay is a no-op with
  the original outcome, conflicting identity is quarantined, a revision gap is
  deferred and alerted, and an older revision cannot regress subject state or
  revive canceled work. Queue reads and work-item commands use the same
  freshness projection and compare current, applied and expected revisions so
  stale operational state is typed and cannot complete silently. The public
  command field is optional for non-Booking work items, but omission or mismatch
  on a Booking-linked target is a `FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED`
  conflict; aggregate-ahead projection lag is a distinct
  `FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING` conflict.
- **2026-08-05, Flow lifecycle projection:** Flows persists one revision head per
  Booking and one immutable receipt per Booking lifecycle event. Receipt identity
  is lifecycle-event UUID plus its canonical digest; `(bookingId, revision)` is
  unique. Consumers serialize on the Booking projection, apply only the next
  contiguous revision, defer a gap, quarantine digest/identity/chain conflicts
  and return the stored outcome for exact replay. Booking cancellation provenance
  is the lifecycle event itself; it is never represented by a fabricated API
  actor or `flowRuntimeCommand`.
- **2026-08-05, immutable enrollment versus mutable subject state:**
  `flowRuns.snapshot` remains the enrollment-time audit record. Current Booking
  schedule and applied lifecycle revision live in a separate Flow-owned subject
  projection used by execution and queue commands. Reschedule can therefore
  recompute an active deadline without rewriting enrollment evidence or replaying
  completed nodes.
- **2026-08-03, lease authority:** lease validity is evaluated from a fresh
  PostgreSQL wall-clock instant after acquiring the token row lock. Rationale:
  `transaction_timestamp()` is fixed at transaction start and can authorize a
  finalize that waited behind another transaction until after expiry.
- **2026-08-03, retry policy:** `flow-execution-retry.v1` is exactly three total
  attempts with 1000 ms base, 60000 ms cap and bounded equal jitter; persisted
  numeric values are immutable compatibility data, not per-token tuning knobs.
  Rationale: in-flight behavior cannot change silently across deploys.
- **2026-08-03, atomic advance:** V2 keeps one stable token row per run. Each
  successful source-to-target transition increments `nodeActivationSequence`,
  resets the node-local attempt counter, preserves the run-wide fencing token
  and appends one attempt plus one `token_advanced` event. The persisted pinned
  graph, not worker input, owns edge/target resolution. Trigger matching belongs
  to enrollment and places the initial token after the trigger. Rationale:
  attempts must represent executable nodes, and a three-attempt retry budget
  must not become a three-step run budget.
- **2026-08-04, enrollment authority:** definition lifecycle, enrollment
  lifecycle and run lifecycle are separate authorities. Activation uses CAS on
  definition revision, monotonic enrollment revision and expected active
  version; pause uses enrollment revision, active version and exact open epoch,
  but deliberately does not depend on definition revision. Rationale: draft
  editing cannot create an ABA activation race or prevent an urgent pause.
- **2026-08-04, activation readiness:** only published V2 graphs with a V2
  capability manifest may enter a new epoch. A read-side activation review is
  explanatory evidence, not command authority; rollout, worker capability,
  resources, entitlement and quota are re-evaluated under the activation
  transaction. The public use case supplies a private one-shot preparation
  callback to the persistence port; neither a caller-provided attestation nor
  an exported planner can authorize activation. Exact replay does not repeat
  preparation. `definition_only` can never produce a ready decision.
- **2026-08-04, worker rollout:** environment configuration is a deployment
  ceiling, not enrollment or claim authority. Effective claim permission is the
  intersection of persisted policy, deployment ceiling, exact registration,
  live readiness lease, active subject mappings, kill switches and pinned
  requirements, evaluated in the token-lock transaction. Lease duration comes
  only from persisted policy. Recovery deliberately remains global so a policy
  change cannot strand an old claim. The current process registers only
  `executor`; production stays `definition_only` until activation/enrollment and
  quota authority are complete.
- **2026-08-04, claim audit identity:** every controlled claim pins policy
  revision/digest and worker session/registration digest. Token state retains
  the latest claim evidence and immutable attempts preserve each historical
  claim, including lease-expiry recovery after policy changes. Actor-subject
  mapping and runtime-control command creation commit atomically; raw user IDs
  remain only in erasable identity mappings.
- **2026-08-04, legacy activation drain:** historical `flows.status=active`
  cannot be assigned a fabricated activation epoch. `POST /flows/:flowId/pause`
  therefore remains temporarily as an owner-scoped safety drain that locks the
  same definition row as activation and refuses any active enrollment control.
  New enrollment pauses use only `/pause-enrollment`; the legacy route is not an
  alias and can be retired only after production inventory proves no legacy
  active definitions remain.
- **2026-08-02, UI:** desktop supports graph structure editing; mobile supports
  monitoring, approvals/work and typed node configuration, but not structural
  graph editing in v2.

## Outcomes & Retrospective

Milestone 0 is complete. The current production surface is an explicit
definition/control plane, not a false runtime:

- create, edit, publish, pause and owner-scoped history reads remain available;
- activation, simulation, manual execution and approval decisions fail with
  typed HTTP `409` before runtime mutation; Milestone 0 also blocked legacy run
  cancellation until the separate durable v2 control implemented in Milestone
  2-B;
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

Milestone 1 code delivery now includes strict graph compilation, owner-scoped
validation, optimistic V2 drafts, immutable publication, exact command replay,
explicit next-version drafts and fail-closed V1 migration. Its network-backed
browser acceptance remains open under the process-lifecycle blocker recorded
above, so the milestone checkbox stays open.

Milestone 2-A is a verified internal kernel, not an enabled runtime. It proves
one supported terminal transition, fenced persistence and lease recovery on
PostgreSQL. Activation, enrollment and scheduling remain closed until the
remaining Milestone 2 state machine, readiness and rollout controls exist.
Fresh focused evidence is 6 files / 30 unit tests and 2 files / 32 real
PostgreSQL integration tests, plus focused TypeScript compilation, DB build,
workers typecheck/build and ESLint. Repository-wide domain gates remain blocked
by the unrelated concurrent finance source recorded above; the generated
baseline commit remains blocked by the separately owned uncommitted Chart V2
source contour.

Milestone 2-B adds cancellation for eligible existing v2 terminal-token runs,
not a broader executable runtime. The API can contain runnable or claimed work
even while new enrollment remains closed. Exact replay, failure replay, owner
isolation, cancellation/finalize/recovery races, stale finalize, rollback,
immutability and baseline predecessor preservation have focused unit and real
PostgreSQL coverage. Immediate cancellation of `waiting_external` remains
intentionally unavailable until external-command reconciliation can report an
honest outcome. Fresh evidence is 95 focused unit/API/worker/schema tests and
52 real PostgreSQL integration scenarios, focused lint/format/diff checks,
contracts and DB typechecks, contracts/DB/workers/API production builds, an
independent `APPROVE` and a successful clean local baseline reset/seed.
Repository-wide domain/docs and browser gates remain separately blocked as
recorded in Progress.

Milestone 2-C1/C2 now adds a fenced runtime-dispatch outbox and durable
retry/poison disposition to that still-disabled kernel. PostgreSQL enforces the
exact retry snapshot, attempt budget, counter/fence relationships and
disposition-specific failure reasons. Claim, finalize, recovery, cancellation
and poison quarantine use transition-appropriate wall-clock authority; recovery
cannot confuse a claim committed after transaction start with an expired lease.
Exact reconciliation covers physical relation/index/constraint state,
trigger-function behavior, deploy ordering and token/attempt/event preservation.
This does not yet provide graph traversal, timers, signals, external effects,
readiness canary or browser acceptance. Independent repeat review findings are
closed; current aggregate counts are recorded in Progress after each fresh gate.

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

type FinalizePredicate = Pick<Claim, "tokenId" | "leaseOwner" | "fencingToken"> & {
  state: "claimed";
  leaseExpiresAfterDatabaseTime: true;
};

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
transaction. Finalize performs a locked one-row CAS on claimed state, lease
owner, database-time lease deadline and fence. PostgreSQL returns the persisted
claim time, attempt number, owner and fence used for append-only audit; the
worker cannot rewrite those fields. Finalize then atomically appends
attempt/trace and next token, wait, human object or command/outbox intent. A
zero-row finalize is a stale worker result and is discarded observably.

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

### Milestone 2-A terminal-token boundary

The first executable slice is `completed:1:1` only. It proves the authoritative
claim/evaluate/finalize and expired-lease recovery kernel without opening
activation, enrollment, timers, signals, approvals, effects, cancellation,
redrive or quarantine. Worker functions are composed and tested but are not
scheduled from `apps/workers/src/main.ts`; enabling polling before readiness,
drain, poison/quarantine disposition and rollout controls exist would be a
false canary.

### Milestone 2-B cancellation boundary

The first runtime control is durable cancellation of an existing v2
terminal-token run. It is independently callable while runtime availability is
`definition_only`, but it does not create runs, activate versions, enroll
events, schedule workers or imply canary readiness. The command authority uses
`(api surface, actor, owner, route, run, idempotency key)` plus a canonical
request hash and stores the exact status/body outcome for 24-hour replay.

Runnable, claimed and scheduled-retry tokens are immediately cancelable while
their run remains pending, running or retryable-failed. Token-first row locking
serializes cancellation with finalize and lease recovery; the first committed
transition owns the terminal result. Cancellation fences stale work, clears the
lease/retry disposition and appends one command-linked trace. A claimed
cancellation records the attempt identity from locked PostgreSQL state;
runnable and scheduled-retry cancellation creates no additional attempt.
`waiting_external`, legacy and inconsistent state fails closed until effect
reconciliation can distinguish provider outcome from orchestration intent.

### Milestone 2-D atomic-advance boundary

The next executable slice adds generic `advance` interpretation and one atomic
PostgreSQL source-to-target transition without enabling a new product runtime.
The executor returns only a typed source handle; the interpreter selects one
edge, and finalize independently resolves that edge from the persisted pinned
graph before changing state. The transaction records the source attempt,
increments node activation and run trace sequences, rewrites the stable token to
the target, resets its node-local retry counter and appends `token_advanced`.
The global fence is preserved.

Real PostgreSQL tests use a test-only deterministic non-trigger executor and a
token already positioned on a non-trigger node. No trigger executor is added to
the production registry. Activation, enrollment, worker polling, built-in
condition reads, timers, signals, human work, approvals, effects and simulation
remain unavailable. New published snapshots use
`flow-capability-manifest.v2`: its singular `triggerMatcher` pins the graph's
only trigger contract, while `nodeExecutors` excludes trigger kinds. Historical
V1 snapshots remain readable and executable under their exact immutable shape;
they are never rewritten in place. Their downstream executable nodes remain
eligible for the pinned historical runtime, but their trigger entry can neither
authorize a token nor appear in attempt/event traces or as an advance target.

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
- PostgreSQL 17 migration research, accessed 2026-08-03:
  [ALTER TABLE and validated constraints](https://www.postgresql.org/docs/17/sql-altertable.html),
  [explicit and advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html),
  [constraint catalog evidence](https://www.postgresql.org/docs/17/catalog-pg-constraint.html).
- Runtime-control research, accessed 2026-08-03:
  [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests),
  [Node.js HTTP message headers](https://nodejs.org/api/http.html#messageheaders),
  [RFC 9110 field-line combination](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.2),
  [AWS Step Functions StopExecution](https://docs.aws.amazon.com/step-functions/latest/apireference/API_StopExecution.html).
- Retry/disposition research, accessed 2026-08-03:
  [AWS Step Functions retry and catch](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html),
  [Google Cloud Workflows errors](https://docs.cloud.google.com/workflows/docs/reference/syntax/error-types),
  [Google Cloud Workflows retry steps](https://docs.cloud.google.com/workflows/docs/reference/syntax/retrying),
  [Azure Functions error handling and retries](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-error-pages).
- Enrollment/advance product research, accessed 2026-08-03:
  [HubSpot enrollment triggers](https://knowledge.hubspot.com/workflows/set-your-workflow-enrollment-triggers),
  [HubSpot workflow actions](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions).
- Matcher/target separation research, accessed 2026-08-04:
  [Amazon EventBridge event patterns](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html),
  [Amazon EventBridge targets](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html).
- M3 booking prerequisite found on 2026-08-04: manual booking confirmation
  already emits a Flows outbox event, while the paid-confirmation path does not
  yet prove the same normalized event contract. Enrollment cannot be accepted
  until every confirmation path emits one stable source identity and payload,
  with duplicate/conflicting delivery behavior covered by PostgreSQL tests.
- PostgreSQL lease-time research, accessed 2026-08-03:
  [current date/time semantics](https://www.postgresql.org/docs/current/functions-datetime.html),
  [row locking and `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE).
- Record exact commit ids, test output summaries, DB target evidence and browser
  artifact paths here as milestones complete.
