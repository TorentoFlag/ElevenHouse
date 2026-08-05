# Finance Core Pure-Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` task by task and
> `superpowers:test-driven-development` for every behavior change.

**Goal:** Build the isolated, deterministic finance-core model needed by Stage
2 without changing active order/payment behavior or writing target persistence
while the authoritative-inventory gate is blocked.

**Architecture:** New code lives only in
`packages/domain/src/finance-core/**`. It imports stable contracts/domain
primitives but is not exported from the package root, connected to a controller,
worker, store or adapter, or represented as migrated persistence. The model
separates immutable order economics, risk, economic payment, clearing,
provider-operation recovery, durable-inbox semantics, operational journal,
source lots, wallet projections, posting builders, settlement cursors and
distributed provider-budget ports. Runtime replacement happens only in later
gated plans.

**Tech Stack:** TypeScript 6, Vitest, current `Money`/`allocateBps` primitives,
Temporal where instant comparison is required, immutable pure functions and
typed ports.

**Parent:**
`docs/superpowers/plans/2026-08-03-finance-production-contour-master.md`.

**Approved design:**
`docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`,
especially sections 5, 6–7, 9, 12–13, 16 and 19–20.

## Entry Gate and Non-Goals

Stage 1 code has a final independent PASS, but the stage is partial because no
authoritative production inventory was available. Therefore this plan:

- MUST NOT edit `packages/db/src/schema/**`, `packages/db/drizzle/**`, any
  migration/baseline/reconciler, DB adapter, application, worker or root barrel;
- MUST NOT remove or reinterpret active `platformFeeBps`, risk-policy/order
  fields, payment states, ledger accounts or stores;
- MUST NOT publish a tariff, create a provider request, accept a webhook, post
  an active ledger transaction, mutate a wallet or claim runtime enforcement;
- MUST NOT add fallback accounting values, commercial percentages, provider
  IDs, fiscal fields, recovery policy or fake persistence;
- MAY compile and test isolated pure-domain files under
  `packages/domain/src/finance-core/**`;
- reports its outcome as **Stage 2 pure core partial**, never migrated or
  production-wired Stage 2.

The current implementation remains historical/runtime truth until a later
atomic cutover. In particular, commission authority cannot be removed from
finance policy before the Stage 3 effective tariff resolver and persistence are
ready in the same transition.

## Shared Invariants

- Initial enabled currency is exactly `RUB`; currency remains explicit.
- Every amount is a non-negative or positive safe integer as its operation
  requires. Aggregate journal arithmetic uses `BigInt` and never float.
- Every ID and opaque provider value is non-empty and bounded by the constructor
  owning it; no caller-supplied object is trusted merely because TypeScript says
  so.
- Instants are injected ISO instants; no pure function calls the system clock.
- Returned records and arrays are immutable snapshots. State changes return a
  new version and require expected version where concurrency matters.
- Typed failures are generic and safe; secrets, sealed payload refs and raw
  provider bodies are never included in error messages.
- Provider/bank I/O and process-local rate limiting do not exist in this plan.

## Task 1 — Risk and immutable order economics

**Files:**

- Create `packages/domain/src/finance-core/risk-policy.ts`.
- Create `packages/domain/src/finance-core/risk-policy.test.ts`.
- Create `packages/domain/src/finance-core/order-economics.ts`.
- Create `packages/domain/src/finance-core/order-economics.test.ts`.

- [ ] RED: a strict risk-snapshot constructor accepts only ID/version, effective
      risk tier, hold anchor/duration, reserve basis points/release delay,
      settlement-required and payout/risk controls named by the approved design.
      It rejects `platformFeeBps`, `commissionBps`, unknown keys, invalid ranges,
      malformed instants and unversioned input.
- [ ] RED: risk policy and commercial economics are different types; applying a
      later risk snapshot cannot alter an existing economic snapshot.
- [ ] RED: order economics requires order, astrologer, plan, immutable plan
      version, gross, commission, payable, commission bps and allocation revision.
      It proves one currency and `gross = commission + payable` with safe integers.
- [ ] RED: characterize the existing `allocateBps` half-up behavior at boundary
      values and expose it only as the explicit `bps_half_up_v1` revision. Do not
      introduce a second rounding algorithm or commercial percentage.
- [ ] RED: when `bps_half_up_v1` is selected, the supplied commission/payable
      must equal the characterized allocation; an unknown revision fails closed.
- [ ] RED: snapshots are frozen/versioned and cannot be patched after capture or
      by a risk-policy operation.
- [ ] GREEN minimally, then run:

  ```bash
  pnpm test packages/domain/src/finance-core/risk-policy.test.ts packages/domain/src/finance-core/order-economics.test.ts
  pnpm exec eslint packages/domain/src/finance-core/risk-policy.ts packages/domain/src/finance-core/risk-policy.test.ts packages/domain/src/finance-core/order-economics.ts packages/domain/src/finance-core/order-economics.test.ts
  ```

Acceptance: the target model has exactly one immutable tariff-version economic
snapshot and a commission-free risk snapshot, without changing the legacy
runtime authority.

## Task 2 — Provider account, economic payment and clearing

**Files:**

- Create `packages/domain/src/finance-core/provider-account.ts`.
- Create `packages/domain/src/finance-core/provider-account.test.ts`.
- Create `packages/domain/src/finance-core/provider-account-series.ts`.
- Create `packages/domain/src/finance-core/provider-account-series.test.ts`.
- Create `packages/domain/src/finance-core/economic-payment.ts`.
- Create `packages/domain/src/finance-core/economic-payment.test.ts`.

- [ ] RED: ArcPay account identity contains immutable provider, merchant tenant,
      `sandbox|live`, terminal scope and settlement scope. Currency is deliberately
      not part of identity; two accounts are never merged because currency matches.
- [ ] RED: provider-account replacement creates a new identity/version; changing
      any identity field in place fails.
- [ ] RED: replacement belongs to one stable series, binds the exact current
      provider-account predecessor and advances both identity and series by one;
      stale/foreign heads fail before a DB adapter can persist a fork.
- [ ] RED: purpose is exactly `client_order | platform_invoice |
platform_card_setup`; only setup may have zero amount.
- [ ] RED: economic states are the approved created/open/pending/3DS,
      authorized/captured/declined/failed/expired/voided and unknown-result states.
      Timeout/provider-unknown are non-terminal and never age into failure.
- [ ] RED: clearing states are a separate projection
      `unmatched -> settlement_seen -> provider_matched -> bank_matched`; clearing
      cannot capture or otherwise advance economic state.
- [ ] RED: exactly one logical economic intent exists per source, no second
      active or unknown checkout session is allowed, and definitive terminal
      evidence is required before a sequential replacement session.
- [ ] RED: the first canonical capture returns the unique capture effect; a
      replay returns replay; a distinct later provider capture returns a typed
      over-capture incident and no second economic effect.
- [ ] RED: setup/invoice/order purpose dispatch cannot create another purpose's
      effect, and amount/currency/provider-account correlation is mandatory.
- [ ] GREEN minimally and run both tests plus focused lint.

Acceptance: payment economics, provider session safety and clearing evidence are
separate, deterministic aggregates independent of the legacy payment store.

## Task 3 — Provider-operation intent and durable webhook boundary

**Files:**

- Create `packages/domain/src/finance-core/provider-operation-intent.ts`.
- Create `packages/domain/src/finance-core/provider-operation-intent.test.ts`.
- Create `packages/domain/src/finance-core/webhook-inbox.ts`.
- Create `packages/domain/src/finance-core/webhook-inbox.test.ts`.

- [ ] RED: a mutation intent is persisted conceptually before I/O and contains
      provider account, purpose, operation kind, source, canonical request digest,
      stable idempotency key, creation instant and explicit retention deadline.
- [ ] RED: operation kinds are exactly the currently approved mutation surfaces:
      checkout-session creation, card setup, saved-card charge, refund and void.
- [ ] RED: an ambiguous result remains `provider_unknown`, retains the same key
      and request digest, and rejects blind replacement. A definitive result needs
      canonical evidence; expiry of the retention window blocks mutation retry
      rather than inventing a new key.
- [ ] RED: webhook transport identity is provider + receiving environment +
      webhook ID. Stored metadata contains raw-body digest and opaque sealed-payload
      reference, not logged/raw body.
- [ ] RED: a bounded, validly signed but unknown event may be recorded then
      quarantined. Invalid signature/timestamp/malformed envelope is represented as
      pre-storage rejection. Tenant/environment/account/amount/currency mismatch
      creates no business effect.
- [ ] RED: checkpoint advance is monotonic and expected-version/CAS-bound;
      replay resumes after the last committed sequence. Checkpoint codes remain
      versioned opaque processor-owned values in this plan; do not invent a
      purpose-specific pipeline.
- [ ] RED: transport dedupe and semantic source dedupe are distinct, and setup
      or invoice messages cannot post a client-sale payable.
- [ ] GREEN minimally and run both tests plus focused lint.

Acceptance: the pure boundary can represent store-before-2xx, resume and
unknown-result recovery without pretending a DB inbox or worker already exists.

## Task 4 — Operational chart, source keys and balanced journal

**Files:**

- Create `packages/domain/src/finance-core/ledger-chart.ts`.
- Create `packages/domain/src/finance-core/ledger-chart.test.ts`.
- Create `packages/domain/src/finance-core/finance-source-key.ts`.
- Create `packages/domain/src/finance-core/finance-source-key.test.ts`.
- Create `packages/domain/src/finance-core/journal.ts`.
- Create `packages/domain/src/finance-core/journal.test.ts`.

- [ ] RED: the chart contains exactly the 22 launch accounts in approved design section
      9.1, with exact class, normal side and required owner scope. It excludes
      generic `platform_clearing`, `platform_revenue`, `payout_clearing`,
      `manual_adjustment` and any balancing account.
- [ ] RED: provider accounts, bank pools, astrologers, refund+payout bridges and
      platform-only accounts require exactly their approved scope; missing, extra
      or cross-owner scope fails.
- [ ] RED: typed source keys carry source kind, source ID and operation and have
      one deterministic collision-free serialization. Source vocabulary is derived
      literally from the approved posting rows; no generic manual source exists.
- [ ] RED: a journal transaction has at least two positive entries, one explicit
      currency, valid chart scopes and equal debit/credit totals computed with
      `BigInt`. Empty, zero, negative, unsafe, mixed-currency or unbalanced input
      fails with typed integrity errors.
- [ ] RED: reversal references the original transaction/source, swaps every
      side, preserves amount/scope/metadata links and never adds a balancing row.
- [ ] RED: projection by normal balance returns a typed abnormal-balance
      discrepancy rather than clamping or silently accepting it.
- [ ] GREEN minimally and run all three tests plus focused lint.

Acceptance: every later posting builder is forced through one explicit chart,
source and balancing authority.

## Task 5 — Source lots, availability and wallet comparison

**Depends on:** Tasks 1, 2 and 4.

**Files:**

- Create `packages/domain/src/finance-core/source-lots.ts`.
- Create `packages/domain/src/finance-core/source-lots.test.ts`.
- Create `packages/domain/src/finance-core/wallet-projection.ts`.
- Create `packages/domain/src/finance-core/wallet-projection.test.ts`.
- Create the bounded online contract in
  `packages/domain/src/finance-core/wallet-operation-projection-types.ts`,
  `wallet-operation-projection-codec.ts` and
  `wallet-operation-projection.ts`, with focused audit/integrity tests.

- [ ] RED: capture creates the exact pending payable lot linked to order,
      economic snapshot and unique capture source. Buckets are exactly pending,
      available, reserved, payout-pending and refund-pending.
- [ ] RED: deterministic selection uses `(becameAvailableAt, sourceId, lotId)`;
      splits and moves preserve total and immutable lineage. Re-consuming a lot,
      negative remainder, owner/currency mismatch or duplicate source fails.
- [ ] RED: payout selection and refund reservation operate on exact lots, never
      aggregate wallet buckets.
- [ ] RED: release uses the Stage 1 fulfillment registry's exact Booking
      `completed` evidence, snapshotted hold anchor/duration, settlement evidence
      when required, and absence of refund/chargeback/reconciliation/risk blocks.
      Age or capture time alone is insufficient.
- [ ] RED: reserve allocation is an explicit versioned result whose components
      sum to payable. Do not guess an unapproved reserve-rounding revision.
- [ ] RED: projection rebuilds five liability buckets plus recovery receivable
      from journal/source lots. Journal, lot and stored-wallet differences are typed
      discrepancies and are never auto-corrected.
- [ ] RED: an operation-scoped snapshot contains only the affected semantic
      economic edges, versioned authority references and previous/next wallet
      revisions. Its unverified commit-binding record binds the exact journal
      source, time, operation/history digests and stored wallet snapshots;
      mixed-time reads, skipped CAS revisions, missing/extra/duplicate edges and
      structural remainder turnover are typed discrepancies. Only the later
      persistence-issued receipt can prove an atomic commit.
- [ ] GREEN minimally and run both tests plus focused lint.

Acceptance: wallet availability is traceable to immutable sale lots and exact
fulfillment/risk evidence.

The full lifetime lot/history state built in this task is a deterministic
reference and reconciliation oracle, not an online persisted wallet aggregate.
Online persistence must use normalized immutable operation/edge rows and a
bounded operation snapshot containing one wallet revision plus only the locked
affected lots and required authority references. No request path may hydrate,
hash or rewrite an astrologer's unbounded lifetime history.

The pure wallet comparator distinguishes internal consistency from authority.
Its raw operation snapshot and commit-binding record are unverified values: a
SHA-256 digest detects drift but cannot prove that facts were written in one DB
transaction. Production mutation requires a deterministic source-transition
receipt, canonical Task 6 allocation/link proof and an opaque verified commit
receipt returned by the trusted persistence port from one stable transaction.
Until all three are present, the result remains `authorizationStatus:
unverified` and `atomicityStatus: unverified` even when arithmetic is internally
consistent. Wallet/mutation revisions are canonical unsigned decimal strings.
Per-operation array limits come only from an immutable versioned limit-policy
snapshot bound into the operation and binding record; no guessed production
limit is hidden in the codec. That embedded snapshot is still untrusted input
and cannot limit its own decoder. Every object-decoding entry point therefore
also requires an out-of-band resource envelope supplied by the composition
root and an out-of-band resolution of the exact policy ID/version/digest that
was effective at the operation time. The envelope bounds array cardinality and
decimal-string length before enumeration or `BigInt` conversion. HTTP/storage
adapters must enforce the configured byte limit before JSON parsing; the pure
object comparator must not pretend that it can recover that already-crossed
boundary.

## Task 6 — Posting-matrix builders

**Depends on:** Tasks 1, 4 and 5.

**Files:**

- Freeze shared boundaries in focused
  `postings/posting-codec.ts`, `posting-recipe.ts`,
  `journal-link-proof.ts`, `payable-lot-posting-link.ts`,
  `component-slot-resolution.ts` and `posting-event-identity.ts`, each with a
  focused test.
- Create focused sale/revenue builders for sale capture, platform invoices,
  provider fees and revenue recognition, with separate tests.
- Create focused hold/payout builders for liability moves, state-only events,
  paid/statement facts and payout returns, with separate tests.
- Create focused refund allocation, reservation, provider-outcome and bridge
  builders, with separate tests.
- Create focused chargeback principal, allocation, recovery and resolution
  builders, with separate tests; reuse the typed provider-fee boundary.
- Split bank statement evidence, suspense reclassification and
  merchant settlement into focused modules after the common contract freezes.

- [ ] RED: every approved section 9.1 matrix row has a literal RUB example and
      passes the Task 4 chart/source/balance validator.
- [ ] RED: sale capture credits `astrologer_pending` and
      `platform_commission_deferred`; tariff capture credits only subscription
      deferred. Provider fee is a separate platform expense and never reduces the
      astrologer payable.
- [ ] RED: earning moves deferred to matching revenue; hold/reserve and payout
      moves preserve exact lot links. Payout approval/initiation return typed
      `no_posting`; proven paid and bank statement match are distinct postings.
- [ ] RED: ArcPay merchant payout and corresponding bank credit are two distinct
      provider-account/bank-pool postings and cannot become astrologer payouts.
- [ ] RED: refund inputs prove `R = A + D + I + K`; approval only reserves, while
      provider success/failure produces the exact approved posting or lot return.
- [ ] RED: chargeback input proves `X = O + H + E` and `U = B - X`; fee expense
      uses a separate `provider_fee/confirmed` evidence source, loss/recovery
      accounts require an approved allocation, and win/loss never duplicates
      principal.
- [ ] RED: unknown bank debit/credit uses the exact suspense account and later
      matching reclassifies without moving cash twice.
- [ ] RED: every object decoder receives a trusted out-of-band cardinality and
      decimal-length envelope, rejects before enumeration/`BigInt` conversion,
      and documents the adapter byte cap as a pre-parse requirement.
- [ ] RED: receipt-linked recipes match strict receipt effects to exact scoped
      accounts, component-registry bindings and operation snapshots; zero-effect
      receipts, missing/extra/duplicate semantic edges and forged slot bindings
      are explicit cases.
- [ ] GREEN minimally; run all five tests and focused lint.

Posting builders accept already-authorized allocation decisions. They do not
choose whether principal becomes astrologer recovery or ElevenHouse loss.
They consume a bounded immutable payable-lot operation snapshot and post only
the economic delta from the approved matrix. A structural remainder lot proves
lineage but does not create artificial debit/credit turnover. Versioned refund
and chargeback allocation authorities plus a shared journal-link proof retain
exact component, original-sale, payable-lot and payout-allocation identities.
The proof is rehydrated independently and then compared entry-for-entry with
the journal transaction; a recomputed self-hash proves only internal drift
absence. Bank/provider source IDs are derived from the immutable statement or
provider fact rather than a caller-selected operation UUID. Bank correction,
clearing/exposure coverage and returned-payout lot creation remain fail-closed
unless their opaque persistence/source receipts bind exact actors, action,
payload, amount, scope, version, original journal and one-time consumption.

Acceptance: every approved economic event has one explicit balanced pure
posting recipe with no generic account or hidden adjustment.

## Task 7 — Settlement cursor and distributed ArcPay budget ports

**Files:**

- Create `packages/domain/src/finance-core/settlement-cursor.ts`.
- Create `packages/domain/src/finance-core/settlement-cursor.test.ts`.
- Create `packages/domain/src/finance-core/arc-pay-rate-budget.ts`.
- Create `packages/domain/src/finance-core/arc-pay-rate-budget.test.ts`.

- [ ] RED: cursor key is provider account + stream. Initial backfill start,
      overlap and page cursor are explicit; no hidden default exists.
- [ ] RED: high-water/page advancement requires expected version, never moves
      backward and resumes the same page after a crash before CAS.
- [ ] RED: provider entry identity is provider account + lossless entry ID;
      entry/reference/settlement/payout strings remain opaque and are not coerced to
      current enums.
- [ ] RED: the adapter hashes the exact raw response bytes and parses OpenAPI
      `int64` JSON number tokens losslessly into bounded canonical decimal
      strings. Standard `response.json()` / `JSON.parse()` output is not accepted
      as monetary evidence because values above `2^53` cannot be proven exact.
- [ ] RED: normalized page checkpoints have a DB-unique identity of cursor key +
      window generation + provider page cursor, so an `A -> B -> A` pagination
      cycle fails closed without storing an unbounded seen-cursor array.
- [ ] RED: rate-budget key is merchant tenant + environment; terminals under one
      tenant share a budget while sandbox/live do not.
- [ ] RED: the port returns `granted | retry_at`, accepts supplied Retry-After
      evidence and uses explicit validated 10 RPS/burst 20 configuration. It has no
      sleep, process-local limiter or provider I/O inside a domain transaction.
- [ ] GREEN minimally and run both tests plus focused lint.

Acceptance: restart-safe settlement and cross-replica ArcPay throttling have
testable ports without fake in-memory production behavior.

## Task 8 — Combined verification and independent review

- [ ] Run every `packages/domain/src/finance-core/**/*.test.ts` test.
- [ ] Run focused ESLint and Prettier for the new tree.
- [ ] Build `@elevenhouse/contracts`, then run domain typecheck/build
      sequentially so a contracts clean cannot race domain resolution.
- [ ] Confirm no new test file appears in `packages/domain/dist`.
- [ ] Run `pnpm lint`, `pnpm docs:check:test`, `pnpm docs:check` and
      `git diff --check`.
- [ ] Run `pnpm verify`; record exact unrelated blockers without modifying them.
- [ ] Dispatch independent architecture/accounting/security review, fix every
      blocker/high/medium finding through behavioral RED/GREEN, and repeat affected
      checks.
- [ ] Refresh branch, status and cached diff; list all unowned paths left
      untouched.
- [ ] Update this plan, parent Progress/Outcomes and the dedicated SDD report.

## Verification Contract

Completion of this child plan means only:

- the isolated pure core has an independently reviewed behavioral model;
- target invariants are executable before persistence design;
- no legacy runtime behavior or DB source of truth changed.

It does **not** mean Stage 2, payments, ledger migration, webhook durability,
rate limiting or finance persistence is production-ready. On 2026-08-03 the
user explicitly declared current production pre-launch/disposable and removed
the inventory/opening-balance preservation gate. Target schema work may proceed
after this pure-domain verification, while production reset remains a later
exact-target rollout action.

## Progress

- [x] 2026-08-03 — Stage 1 final review PASS; the former authoritative-production
      inventory gate was subsequently removed by explicit disposable-production
      product authority.
- [x] 2026-08-03 — Current commission/payment/ledger/webhook/settlement code and
      collision surfaces audited; pure-domain-only scope selected.
- [x] 2026-08-03 — Task 1 risk and immutable order economics passed 74/74
      behavioral tests and independent re-review after strict accessor/Proxy,
      data-descriptor and safe-error remediation.
- [x] 2026-08-03 — Task 2 provider account, economic payment and clearing
      passed 38/38 behavioral tests after adding the missing stable
      provider-account series/predecessor CAS prerequisite to the prior strict
      capture/evidence/session/descriptor remediation.
- [x] 2026-08-03 — Task 3 provider-operation intent and durable webhook
      boundary passed 119/119 behavioral tests and independent adversarial
      re-review after source-chain CAS, replacement-authority,
      purpose/source, semantic-fact and optional chargeback-source remediation.
- [x] 2026-08-03 — Task 4 chart, source keys and journal passed 42/42
      behavioral tests and independent review after descriptor/proxy,
      reversal/link and `__proto__` remediation; the 2026-08-04 zero-launch
      authority then removed the opening-control account/source/builder.
- [x] 2026-08-03 — Task 5 source lots, source-derived receipts, offline wallet
      oracle and bounded online comparison passed 234/234 affected behavioral
      tests and independent re-review after nested-Proxy fail-before-touch and
      mutable lookup-table remediation.
- [ ] Task 6 — Posting matrix.
- [x] 2026-08-04 — Task 7 settlement cursor/entry/lease and distributed rate
      budget passed 35/35 focused behavioral tests after exact
      provider-identity binding, lossless ledger shape, bounded page budget,
      DB-clock lease/fencing and explicit fetch-outside-transaction planning.
      Production adapters still owe raw-byte lossless JSON parsing and normalized
      checkpoint uniqueness.
- [ ] Task 8 — Verification and review.

## Decision Log

Research addendum, accessed 2026-08-03: the official
[IAS 32 summary](https://www.ifrs.org/issued-standards/list-of-standards/ias-32-financial-instruments-presentation/)
states that financial assets and liabilities are offset only with a legally
enforceable set-off right and net/simultaneous-settlement intent. As a product
pattern only, Stripe's different connected-account model records negative-
balance collection as an explicit balance transaction rather than an invisible
read-model subtraction
([official documentation](https://docs.stripe.com/connect/account-balances?locale=en-GB)).
Inference for ElevenHouse: do not silently net refund recovery against future
payable; require an approved source-linked product/legal/accounting operation.
This research does not introduce connected accounts or submerchants.

PostgreSQL implementation research, accessed 2026-08-03: official documentation
states that `SELECT ... FOR UPDATE` prevents conflicting writers/lockers until
the transaction ends and that applications taking multiple locks should use a
consistent order to avoid deadlocks
([explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)).
`REPEATABLE READ` supplies a stable snapshot but can require a whole-transaction
retry after a concurrent update and does not by itself enforce cross-row
business rules without appropriate locks
([transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)).
Uniqueness belongs in database constraints or, for conditional uniqueness, a
partial unique index
([constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)).
Inference for the later adapter: one pure snapshot/checkpoint digest is evidence
of identity, not concurrency authority. The wallet revision, affected operation
rows, journal, link proof and projection checkpoint must be written atomically;
locked rows follow the global order, expected revisions are checked, uniqueness
is database-enforced and retryable conflicts restart the whole command.

- 2026-08-03, Codex — Keep the entire child plan under a new isolated domain
  directory and do not export it from the package root while shared baseline
  and authoritative inventory gates are unresolved.
- 2026-08-03, Codex — Characterize the existing BigInt half-up basis-point
  allocator as `bps_half_up_v1`; do not invent another commission algorithm.
- 2026-08-03, Codex — Model persistence invariants as pure decisions/ports now,
  but never claim one-session, dedupe, CAS or rate limits are enforced until DB
  adapters and runtime wiring pass later gates.
- 2026-08-03, Codex — Pin Task 3 event semantics to the raw ArcPay OpenAPI v1.0.0
  fetched from `https://api.arcpay.space/openapi.json`, SHA-256
  `324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff`:
  correlate both environment and `livemode`, and model refund/chargeback facts
  with their event-specific amounts rather than the original payment gross.
- 2026-08-04, Codex — Reverified that same ArcPay OpenAPI hash plus the official
  saved-card, idempotency and PCI pages. Persistable worker dispatch is a closed
  endpoint-level command bound to one logical idempotency key and exact body;
  ArcPay retains mutation keys for 72 hours. Card setup and saved-card charges
  use `card_token_id`/`customer_id`; ElevenHouse never persists PAN or CVV and
  does not model an encrypted raw-card fallback. Although the provider schema
  exposes marketplace split fields, this product contour omits/rejects them
  because sub-merchants are explicitly out of scope.
- 2026-08-03, Codex — Treat the full `PayableLot` lifetime model as a bounded
  reference/rebuild oracle only. Later online commands require normalized rows,
  stable row locks, one wallet-revision CAS and operation-scoped snapshots;
  unbounded full-history hydration is not an acceptable production aggregate.
- 2026-08-03, Codex — Journal/source-lot comparison follows economic operation
  deltas, not mechanical graph rewrites: a split remainder stays in immutable
  lineage and does not manufacture ledger turnover.
- 2026-08-03, Codex — The approved matrix can create a refund recovery
  receivable but defines a collection event only for chargebacks. Refund
  recovery therefore remains fail-closed for production enablement until a
  separate product/legal/accounting source contract is approved; a chargeback
  key or generic correction must not be reused. A later bank return of a paid
  bridged payout also needs one of two exact source-linked resolutions: collect
  the returned reserved lot against the original refund recovery receivable, or
  reverse the exact original `platform_refund_loss` allocation. Since neither
  vocabulary exists, bridge-to-paid builders are model-only and the production
  bridge policy remains fail-closed until both return paths are approved.
- 2026-08-04, Codex — A definitive no-transfer outcome resolves the whole
  payout, not one caller-selected refund bridge. Per-bridge source-lot
  transitions may preserve exact lineage, but they are production-authoritative
  only inside one payout-wide unit of work that locks and proves the complete
  active bridge-reservation inventory, closes every exact bridge under one
  canonical outcome, releases only the true unbridged remainder, closes the
  bank exposure and commits all receipts/journals atomically. A partial
  inventory or an early remainder release fails closed.
- 2026-08-03, Codex — A hold-maturity authority may release only surviving
  descendants of the original hold reserve. Reserved lots created by a returned
  payout or chargeback win require the separately implied destination/risk
  review contract and remain fail-closed until that contract is specified.
- 2026-08-03, Codex — ArcPay's pinned `payment.chargeback` schema has no fee
  field. Post each principal delta immediately under its chargeback confirmation
  source; post a chargeback-processing fee separately under an immutable
  `provider_fee/confirmed` authority into `chargeback_fee_expense`. Never wait
  for or infer the fee inside the principal transaction.
- 2026-08-03, Codex — A refund/chargeback freeze blocks payout initiation, not
  an authoritative late bank fact for a request already in
  `processing_manual`. Proven paid still consumes the exact payout allocations
  and the dispute handles the resulting shortfall. A definitive no-transfer
  outcome followed by paid is instead a typed contradiction requiring explicit
  correction; both outcomes must never post.
- 2026-08-03, Codex — A self-hashed wallet snapshot or binding record is not
  economic or atomicity authority. The pure layer labels it unverified; only a
  source-derived operation receipt, canonical allocation/link proof and an
  opaque persistence receipt written with the wallet CAS can authorize the
  online mutation. Long-lived revisions are decimal strings, and operation
  cardinality limits are supplied by a versioned policy rather than constants
  invented in code.
- 2026-08-03, Codex — A limit policy carried inside an untrusted wallet
  snapshot cannot defend the decoder from that same snapshot. Require a
  separately supplied decoder envelope and resolved effective policy; enforce
  ingress bytes before parsing in the adapter and cardinality/decimal limits
  before enumeration or `BigInt` conversion in the pure boundary.
- 2026-08-03, Codex — A self-hashed journal link proof is not evidence that it
  describes the journal. Rehydration must be followed by exact indexed
  transaction equality, and immutable bank/provider fact IDs must participate
  in source identity. Maker-checker, exposure coverage and returned-lot
  authority come only from opaque trusted receipts; otherwise the posting path
  fails closed or remains explicitly unverified.
- 2026-08-03, Codex — The offline wallet oracle consumes strict, source-derived
  operation receipts one-to-one with reference history. Receipt state/version
  chains and history digests are compared explicitly; journal matching uses
  receipt economic effects, so a same-bucket structural remainder never becomes
  artificial turnover. The oracle remains `integrityStatus: unverified` because
  neither receipt digests nor a consistent projection prove transactional
  authority.
- 2026-08-03, Codex — Freeze the Task 6 common posting boundary before parallel
  accounting slices. It must provide an out-of-band decoder envelope, strict
  source-receipt rehydration, exact effect-to-account and component-slot
  resolution, natural event identity and separately opaque commit authority.
  Sale/revenue, hold/payout, refund and chargeback builders must not invent
  allocation DTOs while these contracts are unresolved.
- 2026-08-03, Codex — Wallet revisions and payable-lot reference-state versions
  are separate sequence namespaces. A posting may validly bind wallet revision
  `40 -> 41` to a receipt whose lot-state version is `7 -> 8`; exact receipt and
  lot-state digests connect the records without asserting false revision
  equality.
- 2026-08-03, Codex — Any public object boundary that delegates to an older
  validator first recursively copies nested source keys, journal entries,
  accounts, money and links through its own data-descriptor/Proxy-safe decoder.
  Rejecting a hostile value only after executing its trap is not fail-closed.

## Outcomes & Retrospective

Pending implementation. The final outcome must explicitly separate pure model
behavior from persistence/runtime work still blocked or deferred.

## Artifacts

- SDD workspace:
  `.superpowers/sdd/2026-08-03-finance-core-pure-domain/`.
- Stage 1 verification:
  `.superpowers/sdd/2026-08-03-finance-prerequisites/task-7-stage-report.md`.
- Task 5 verification:
  `.superpowers/sdd/2026-08-03-finance-core-pure-domain/task-5-report.md`.
