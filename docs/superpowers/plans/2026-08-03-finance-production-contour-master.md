# Finance Production Contour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved ElevenHouse single-merchant finance contour from governed tariffs and entitlements through ArcPay pay-ins, an append-only internal payable ledger, manual astrologer payouts, refunds, chargebacks, reconciliation, and truthful RU/EN product surfaces.

**Architecture:** Keep Finance as a strict bounded context inside the existing modular monolith, with `packages/domain` owning rules and ports, `packages/db` owning PostgreSQL constraints and adapters, the three APIs owning their role-specific commands, and `payment-worker` owning all secret-authenticated ArcPay I/O. Browser commands persist intents and outbox events; workers reconcile provider results; every money mutation is idempotent, source-linked, balanced, and auditable.

**Tech Stack:** TypeScript 6, NestJS, React/Vite, Zod shared contracts, Drizzle/PostgreSQL, Redis/BullMQ, Vitest, ArcPay HTTP APIs and Hosted Fields/Hosted Checkout, WebAuthn, private object storage.

**Status:** active.

**Approved design:** `docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`.

## Global Constraints

- Work only in the existing `/Users/anton/Finext/ElevenHouse` checkout on `main`.
- Do not create a branch/worktree, switch branches, stash, rebase, cherry-pick, broadly stage, commit, push, deploy, or mutate external systems without explicit authority.
- The checkout, filesystem, and index are shared. Before every cohesive edit group, reread complete target files and their current path-scoped diff. Preserve all compatible unowned work.
- The currently dirty Flow schema/baseline work is valid unowned work. Finance must not regenerate or overwrite the shared Drizzle baseline until that state is stable and the combined predecessor hash is re-read.
- Do not start, stop, restart, or kill apps, workers, Docker, PostgreSQL, Redis, or browser processes. Read-only listener/HTTP checks are allowed. A required unavailable runtime remains a blocked acceptance item.
- Do not run `db:reset`, integration fixtures that create/drop databases, or any destructive DB command without separately confirming the exact local ElevenHouse target and authority at the execution point.
- Follow behavioral TDD for every production behavior: write the smallest failing test, run and record the expected failure, implement the minimum, rerun green, then refactor while green.
- Never add fake provider success, mock production state, silent fallback, guessed provider DTOs, frontend-owned money arithmetic, or a second commission source.
- ArcPay is the only pay-in merchant rail. There are no submerchants, provider splits, or ArcPay astrologer payouts.
- Commission comes only from the exact immutable tariff version snapshotted on an order. Risk/hold/reserve policy cannot override it.
- All money uses integer minor units with explicit currency. RUB is the only enabled currency until a separate rollout.
- Every provider mutation and internal command has distinct persisted idempotency; unknown external outcomes remain unknown until authoritative evidence resolves them.
- Every journal transaction balances per currency, is append-only, has typed source identity, and is unique by economic operation.
- Admin finance commands live in `admin-api`, use granular permission, expected-version concurrency, step-up where specified, and durable audit.
- Frontend uses shared validated contracts and server-owned calculations. Entitlement locks are presentation plus server/worker enforcement, never browser-only authorization.
- Visible UI work must use `elevenhouse-design-parity`, exact mapped reference states, real network-backed data, RU/EN, required viewports, keyboard/accessibility evidence, console/network inspection, and documented deviations.
- External legal/accounting/provider/bank values remain typed fail-closed enablement gates. Implementation may model and enforce them; it must not invent them.
- Per-task subagents edit sequentially, never as parallel implementers. Each task gets an implementer report and an independent task review. Because commits are not authorized, review packages use owned-path before/after evidence and working-tree diffs rather than commit ranges.

---

## Purpose / Big Picture

An administrator can govern immutable tariffs and their sellable capabilities. An astrologer can consent to an ArcPay saved-card setup, buy and renew a platform tariff, see exact billing/receipt state, receive client-sale payables under that tariff commission, and request a manual payout. A linked client can pay for a supported one-time product through worker-prepared ArcPay Hosted Checkout and later see authoritative payment, receipt, dispute, and refund state. Internal finance operators can review payouts, disputes, chargebacks, settlement, bank liquidity, and reconciliation without conflating provider balance, internal liability, or bank cash.

No pay-in is enabled merely because UI or unit tests exist. Live charging requires the exact legal/accounting, ArcPay terminal, fiscal, WebAuthn, risk, product-fulfillment, and bank-liquidity gates listed in the approved design.

## Observable Definition of Done

- Admin tariff draft, validation, publication, scheduling, archival, immutable versions, audit, and server-complete reads exist.
- Astrologer platform-plan setup, initial charge, renewal, dunning, cancellation-at-period-end, credential replacement/revocation, invoices, and receipt states exist through worker-owned ArcPay operations.
- One central resolver enforces `allow | read_only | deny` across every manifest-listed frontend route, API read/mutation, public sale entry, and worker job; quotas are durable and atomic.
- Linked-client one-time order and worker-prepared Hosted Checkout have one active economic intent, authoritative capture, fulfillment, receipt, and unknown-result recovery semantics.
- Captures, fees, holds, reserves, releases, refunds, chargebacks, payouts, ArcPay merchant settlements, bank cash, and returns post the approved balanced source-linked matrix exactly once.
- Manual payout uses verified immutable destination snapshots, exact payable lots, wallet serialization, expected versions, maker-checker, bank liquidity exposures, paid evidence, statement matching, rejection, and return paths.
- Reconciliation can rebuild and compare wallet/ledger/provider/bank projections, quarantine unknown facts, and resume from durable cursors.
- Required RU/EN client, astrologer, and admin states pass automated, real browser, design-parity, accessibility, concurrency, load, restart, and recovery evidence, or are explicitly reported blocked by an external gate.

## Scope Boundary

### In scope

- All behavior listed as in scope in sections 3 and 19 of the approved design.
- Required corrections to existing finance foundations where they conflict with the approved model.
- Canonical product, architecture, API, operations, and design-inventory documentation updates after each implemented state changes.

### Intentionally out of scope

- ArcPay submerchants, connected accounts, splits, or astrologer provider balances.
- Automatic astrologer payouts, instant payouts, payout schedules, and provider payout-create operations.
- Recurring client subscriptions to an astrologer's content or services.
- Mid-period tariff switching/proration, multi-provider acquiring, currency conversion, lending, stored-value wallet semantics, and statutory general-ledger/tax reporting.

## Current Evidence Baseline

### 2026-08-05 refund execution boundary discovery

- **Research / decision affected (2026-08-05):** the accepted
  `0013-refund-initiation-and-decision-ownership` ADR fixes the ownership boundary:
  client and astrologer inputs create a candidate only; `admin-api` owns the monetary
  decision, and `payment-worker` applies economics only from a verified canonical provider
  outcome. Repository evidence shows that the current `RefundApprovalUnitOfWork`,
  `RefundResultApplicationUnitOfWork`, and ArcPay `POST /payments/{id}/refunds` dispatcher
  already preserve the required atomic/ambiguous-result boundary, but no production service
  currently issues their trusted approval and terminal execution packages. The implementation
  must add that issuer over locked authoritative rows; it must not route the new cases through
  `recordPaymentReversalProviderWebhook`, which is a legacy inbound projection. Official ArcPay
  source recorded below: OpenAPI checksum `324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff`,
  accessed 2026-08-05. Alternatives rejected: direct astrologer refund (violates separation of
  duties), admin controller-side ArcPay call (breaks durable outbox/idempotency), and recomputing
  terminal allocations from live wallet state (breaks partial-refund/payout race integrity).

- The original `RefundResultApplicationUnitOfWork` command contains a provider terminal receipt
  and expected revisions, but not the sealed terminal posting, payable-lot mutation, funding
  transition, cumulative-position decision, or terminal authority required to apply that receipt.
  An adapter therefore cannot safely perform a terminal refund by recomputing against the live
  wallet/payout graph. The contract must be extended before its implementation; the old reversal
  projector remains a legacy read/projection path and must not become a second authority.
- `RefundApprovalUnitOfWork` is now a composed PostgreSQL boundary: it rehydrates allocation
  evidence under server-resolved decoder limits, locks the exact prior cumulative/funding facts,
  persists the allocation/reservation history and worker outbox, and only then exposes the ArcPay
  dispatch. Refund provider-operation source chains are bound to the original order/economic
  payment; the refund’s separate ArcPay external ID retains refund idempotency.
- The current `createDrizzleVerifiedCaptureApplicationUnitOfWork` explicitly rejects
  `client_order` after a verified provider capture (`Client sales require the wallet graph and
  are deliberately still fail-closed here`). Its schema already declares the intended atomic
  `client_sale_captured` receipt graph (order-economics snapshot, capture fact, wallet root lot,
  journal, clearing head and IDs-only outbox), but no adapter path creates it. This is now the
  first implementation prerequisite: without it, no real client payment can credit an
  astrologer’s internal payable balance and all refund/payout work is unreachable.

- Intake timestamp: `2026-08-03 00:24:22 +0300`.
- Git: `main` at `6e9ab39d5c7fd48403f127bf67ef2ad121ae0a43`; local branch was ahead 6 and behind 2 relative to `origin/main` at intake.
- Index: no staged entries at intake.
- Design server: `localhost:8000/ElevenHouse.html` returned HTTP 200.
- Running listeners observed read-only: astrologer web `5174`, general worker readiness `3010`, PostgreSQL `5432`, Redis `6379`, object storage `9000`.
- Public API `3001`, astrologer API `3002`, admin API `3003`, client web `5173`, and admin web `5175` were not listening. Runtime E2E for those surfaces is currently blocked; this plan does not authorize starting them.
- Existing finance foundations are real but incomplete: direct synchronous public checkout, capture/reversal/hold ledger, manual payout request/status, admin finance-policy/reversal/reconciliation queues, and read-only platform billing catalog.
- The exact spec gaps are recorded in section 21 of the approved design and are treated as required corrections, not optional cleanup.

## Owned Paths and Shared-Checkout Collision Map

Initial owned artifacts:

- `docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`
- `docs/superpowers/plans/2026-08-03-finance-production-contour-master.md`
- child plans created under `docs/superpowers/plans/2026-08-03-finance-*.md`
- `.superpowers/sdd/2026-08-03-finance-production-contour-master/` scratch artifacts only after the SDD helper resolves that exact workspace.

Likely future owned production areas, always revalidated before editing:

- `packages/contracts/src/{platform-billing,orders,payments,wallet,payouts,finance-policies,reconciliation}.ts` plus focused new finance contract modules.
- `packages/domain/src/{platform-billing,orders,payments,wallet,payouts,finance-policies}/` plus focused entitlement, fiscal, settlement, bank-liquidity, and finance-security modules.
- `packages/db/src/schema/{platform-billing,finance}/`, their adapters, migration/reconciliation scripts, and exact tests.
- Finance modules under `apps/{public-api,astrologer-api,admin-api,payment-worker,notification-worker}/src`.
- Finance features/pages in `apps/{client-web,astrologer-web,admin-web}/src`.
- Relevant canonical docs and `.design-qa/finance-production/` evidence.

Known unowned dirty paths include Geoapify/client work, Chart Engine/AstroCalendar work, Flow v2/schema work, package metadata, generated Drizzle baseline files, and multiple design-QA directories. In particular, the current Flow work modifies the same baseline artifacts Finance will eventually need. Never overwrite or attribute those changes to Finance.

## Context and Orientation

### Existing path

```text
client POST /orders
  -> OrdersService
  -> createOrder
  -> FinancePolicyStore resolves commission + risk policy
  -> finance_orders snapshot

client POST /payments/checkout
  -> PaymentsService
  -> createPaymentCheckout
  -> public-api ArcPayCheckoutProvider HTTP call
  -> immediate checkout URL

ArcPay webhook
  -> payment-worker HTTP parser
  -> payment use case / terminal UoW
  -> order + booking + existing ledger effects

astrologer /finance
  -> astrologer-api finance module
  -> payout and ledger stores

admin finance page
  -> admin-api finance-policies module
  -> policy, payout, reversal, reconciliation stores
```

### Target path

```text
published tariff version
  -> effective subscription/base-version resolver
  -> order snapshots immutable commission and entitlement/risk/fiscal facts
  -> payment intent + outbox
  -> payment-worker prepares/calls ArcPay under provider rate budget
  -> durable signed webhook + canonical read
  -> atomic payment/order/fulfillment/ledger/outbox transaction
  -> hold/reserve/reconciliation workers
  -> exact payable lots
  -> verified manual payout request + bank exposure
  -> bank evidence + statement match
```

Definitions:

- **economic payment state**: whether a charge is captured/failed/etc.; never the same as settlement or bank evidence.
- **ArcPay provider account**: immutable provider/tenant/environment/terminal scope, not currency alone.
- **bank cash pool**: one non-overlapping bank account or approved native pool with its own statement source.
- **source lot**: exact remaining astrologer payable attributable to one sale/component and current liability bucket.
- **readiness gate**: typed required external evidence/configuration whose absence prevents provider I/O without fabricating a default.

## Interfaces and Dependencies

The child plans must converge on these contracts without creating parallel authorities:

```ts
type EntitlementDecision = "allow" | "read_only" | "deny";

type EntitlementResolver = {
  resolve(input: {
    astrologerUserId: string;
    capability: PlatformPlanFeatureCode;
    operation: EntitlementOperationKind;
    at: string;
  }): Promise<ResolvedEntitlement>;
};

type EffectiveTariffResolver = {
  resolveForOrder(input: { astrologerUserId: string; at: string }): Promise<EffectiveTariffVersion>;
};

type FinanceJournalPort = {
  post(input: BalancedJournalTransaction): Promise<PostedJournalTransaction>;
};

type ArcPayOperationPort = {
  prepareCheckout(intentId: string): Promise<ProviderOperationResult>;
  executeCardSetup(setupIntentId: string): Promise<ProviderOperationResult>;
  chargeSavedCard(attemptId: string): Promise<ProviderOperationResult>;
  refund(refundId: string): Promise<ProviderOperationResult>;
  readPayment(providerPaymentId: string): Promise<CanonicalProviderPayment>;
};
```

- `packages/domain` may depend on shared contracts/auth/validation, never `packages/db` or apps.
- DB adapters implement domain ports; APIs/workers compose them.
- Queue payloads contain identifiers only and workers reload authoritative money, entitlement, destination, and provider state.
- Provider calls occur only after a committed operation intent and never while a financial DB lock is held.

## Research

Question: which ArcPay, PostgreSQL, WebAuthn, fiscal, and payment-operation facts constrain implementation?

Decision affected: provider ownership, recurring billing, webhook persistence, idempotency, fiscal readiness, lock/CAS rules, and payout authorization.

Accessed: 2026-08-02. Direct official/primary links, sourced facts, inferences, rejected alternatives, and unresolved enablement evidence are preserved in section 22 of the approved design. Before coding any provider behavior absent from that pinned evidence, refresh only the exact official contract question and record the result in this plan's `Surprises & Discoveries` and `Decision Log`.

2026-08-04 fiscal checkout refresh — Question: can the legacy Hosted Checkout request
be made compliant merely by adding a fiscal snapshot? Official ArcPay OpenAPI
`https://api.arcpay.space/openapi.json` (accessed 2026-08-04) states that
`create-checkout-session-request` accepts `fiscal_items` and `customer_email`,
but it does **not** expose `merchant_inn`; unlike `charge-saved-card-request`,
which explicitly requires `merchant_inn` when `fiscal_items` are present.
Fact: an HPP request cannot independently prove its fiscal seller/KKT identity
from the request body. Repository evidence: the approved design requires both
an identity and an atomicity gate before a category uses embedded fiscalization.
Recommendation: do not retrofit the direct public HPP call with guessed fiscal
fields. Keep client charging disabled until worker preparation binds the exact
published profile to terminal identity evidence and captures sandbox atomicity
evidence. Rejected alternative: treating a profile INN persisted by ElevenHouse
as proof that ArcPay used that INN; that would be an unsupported inference.

2026-08-04 buyer-contact refresh — The same OpenAPI schema accepts
`customer_email` on Hosted Checkout and documents `customer_email` or
`customer_phone` as the fiscal buyer contact on saved-card charges. Repository
evidence: the approved fiscal profile requires `email_or_phone`, while the old
charge snapshot only recorded that rule, not the selected buyer contact.
Decision: an immutable fiscal charge snapshot now carries one validated email
or E.164 phone, and worker HPP serialization sends exactly that value. It stays
inside the sealed finance artifact and is excluded from logs/public responses.
This is not evidence that any terminal has passed the fiscal identity or
atomicity gates; it only removes a missing mandatory request field.

2026-08-04 checkout-session semantic audit — ArcPay `POST /checkout/sessions`
returns only a checkout-session `{id,url}`, not a provider payment identifier,
capture amount or capture status. The strict HPP dispatcher now persists a
worker-preparation receipt, opens the economic session, and records
`checkout_ready` separately from any payment/capture fact; it is deliberately
not a money-moving boundary. Rejected alternative: storing the HPP session ID
as a provider payment ID or letting a redirect prove capture; both would corrupt
the ledger correlation model.

2026-08-04 HPP capture-correlation audit — the [ArcPay checkout-session
contract](https://finext.gitbook.io/arc-pay/ru/api-reference/checkout-sessions.md)
returns only `{ id, url }`; ArcPay documents `payment.captured` as the fulfilment
signal and the Payments API as the canonical payment-read surface. The existing
legacy webhook path resolves `GET /payments/{id}.external_id` to a legacy
`payment_attempt` UUID, while the new HPP intent has no such row. Therefore it
cannot be reused to apply capture to the economic ledger. The checkout command
now derives `external_id` from the immutable ElevenHouse order ID (the economic
source), not a transient browser/dispatch ID; this also aligns later merchant
settlement evidence with the source identity. Remaining Stage 6 work is a
separate authenticated canonical-payment bridge: sealed raw payment evidence,
provider-account and source/session correlation, idempotent semantic payment
facts, and a capture application that consumes that authority. Until that bridge
exists and has sandbox evidence, enabling HPP dispatch for a money-moving
environment is not a launch condition.

2026-08-04 saved-card recurring interval refresh — Question: can ElevenHouse
derive ArcPay's `recurring_frequency_days` from the tariff labels `month` and
`year`? Official ArcPay [saved-card contract](https://api.arcpay.space/openapi.json)
(accessed 2026-08-04) requires an explicit `recurring_frequency_days` for a
saved-card request with `stored_credential_reason: recurring`; its documented
range is not represented by a calendar label. Repository evidence: tariff
versions are immutable commercial evidence and already carry the price selected
for each label. Decision: every paid monthly/yearly tariff version now carries
its own mandatory 1..366 provider interval, included in the canonical digest,
DB check and publication immutability guard. A zero-price cycle has no provider
interval. Inference: 31/365 used in automated fixtures are fixture data only;
production tariff publication must supply the approved values. Rejected
alternatives: silently choosing 30/365 (changes merchant terms without an
approved setting), or sending `unscheduled_cof` (contradicts the agreed tariff
subscription model).

2026-08-04 saved-card MIT terminal/idempotency refresh — Official ArcPay
[saved-card contract](https://finext.gitbook.io/arc-pay/ru/integracionnye-gaidy/saved-cards.md)
and [payment lifecycle](https://finext.gitbook.io/arc-pay/ru/koncepcii/payment-lifecycle.md)
(accessed 2026-08-04) confirm `POST /payments/saved-card` as the MIT surface,
with `card_token_id`, the original `customer_id`, and `recurring_frequency_days`
for recurring charges. ArcPay requires a UUID `Idempotency-Key`, retains it for
72 hours, and directs callers to preserve it during retries. `pending`,
`pending_3ds`, and `timeout` are non-terminal; `declined` and `failed` are
terminal; only `captured`/`settled` prove a money capture. Decision: the first
invoice worker derives a stable UUID key from its preparation aggregate and
must use a canonical `GET /payments/{id}` before a capture, ledger, or tariff
activation mutation. Rejected alternative: prefixed human-readable idempotency
keys or treating the POST response as capture authority.

## Plan of Work

The stages are dependency ordered. A child plan is written immediately before its stage from fresh current-code evidence, names exact files and red/green commands, and is linked in `Progress`. No child stage may expose a fake success while its entry gate is unmet.

### Stage 1 — Evidence and fail-closed prerequisites

- [x] Add the exhaustive checked-in capability manifest and publication-readiness validator; prove every feature code, surface, operation, fallback, prerequisite, and quota is accounted for.
- [x] Add a read-only financial inventory/trial-balance report over every legacy financial dataset, including paid/current subscriber evidence and unexplained-delta failure semantics.
- [x] 2026-08-03 product/operations override: the user declared the current
      ElevenHouse production database pre-launch and disposable, with no real
      users, payments or accounting/legal records. Existing rows, subscriber
      migration and opening-balance reconciliation are therefore intentionally
      out of scope; the checked-in inventory tooling remains diagnostic only.
- [x] Add typed legal/accounting, ArcPay terminal, billing-operations, risk, product-fulfillment, principal-allocation, bank-liquidity, and runtime-readiness gates.
- [x] Add transaction-bound WebAuthn finance step-up contracts and the Identity verification boundary before any sensitive admin mutation is enabled.
- [x] Add the paid-product fulfillment registry and fail closed unsupported product/execution combinations.

Exit evidence: exact bidirectional manifest coverage passes; every current seed tariff has its full deterministic non-publishable issue set; readiness absence returns typed errors before provider I/O; finance step-up challenge and resulting grant are both single-use; supported fulfillment shapes expose complete versioned terminal/refund authority. The former inventory/opening-balance gate is satisfied by the explicit disposable-production decision above, not by pretending an inventory was reconciled.

### Stage 2 — Finance core and one governed baseline

Entry gate: Stage 1 code prerequisites and the explicit disposable-production
decision above. Backward-compatible finance data migration, subscriber migration
and opening-balance reconciliation are not required. Target schema, adapters and
one combined baseline may proceed, but the authorized destructive production
reset remains a final rollout action after implementation, verification and exact
host/database/container proof.

- [ ] Remove commission authority from finance policy/risk overrides while retaining hold/reserve/settlement policy.
- [ ] Introduce immutable provider-account identity, economic payment intent/session uniqueness, provider-operation intents, durable webhook inbox/checkpoints, and separate clearing evidence.
- [ ] Introduce the target operational chart, normal-balance/ownership constraints, typed source uniqueness, source lots, balanced posting primitives, and projection rebuild.
- [ ] Introduce provider-account-scoped settlement cursors/deduplication and distributed ArcPay rate budget.
- [ ] After re-reading the stabilized shared schema work, regenerate one combined
      Drizzle baseline and prove it on a newly created empty PostgreSQL database.
      This pre-launch rollout does not create a legacy-finance predecessor
      transition: the authorized exact-target production reset installs the
      verified baseline and initializes its migration ledger as one operation.

Exit evidence: all target account postings balance; duplicate/late provider facts cannot duplicate economics; one order cannot have two active sessions/captures; webhook crash checkpoints resume; generated-baseline and fresh-database tests prove the complete shared schema and its invariants. The production reset remains unexecuted until the later exact-target rollout gate.

### Stage 3 — Immutable tariffs and entitlement enforcement

- [ ] Add stable plans plus immutable localized versions, draft/validate/publish/schedule/archive lifecycle and audit.
- [ ] Add the effective base/subscription version resolver and snapshot plan/version/commission on new orders.
- [ ] Add durable entitlement read models, revisioned cache invalidation, and atomic quota reserve/commit/release counters.
- [ ] Wire server and worker checks for every `Live` manifest operation; keep `Partial`/`Absent` unpublishable.
- [ ] Add admin tariff APIs and astrologer entitlement/billing reads without charging yet.

Exit evidence: tariff version is the only commission source; stale/missing version fails before payment; published versions are immutable; route/job manifest coverage has no orphan or unguarded operation; expiry preserves allowed reads/obligations and blocks new work.

### Stage 4 — Fiscal and ArcPay provider foundation

- [ ] Add versioned accounting/fiscal configuration, immutable charge/line snapshots, integer line/refund allocation, and receipt obligations.
- [ ] Add ArcPay server client, provider-account/environment binding, distributed budget, persisted mutation idempotency, canonical reads, and safe error taxonomy.
- [ ] Add raw-body webhook authentication, size/skew checks, durable lossless inbox, typed quarantine, and purpose-specific processing.
- [ ] Add pinned OpenAPI/fixture contract tests for documented event types, receipts, settlement open strings, token lifetime, 3DS actions, and refund semantics.

Exit evidence: missing required fiscal profile blocks before I/O; ambiguous provider result remains unknown; semantic mismatch is stored/quarantined without money effect; sandbox-dependent identity/atomicity gates remain disabled until real evidence is attached.

### Stage 5 — ElevenHouse tariff recurring billing

- [ ] Add saved-card consent, setup/tokenize/execute/3DS, restricted one-use transient artifact, canonical credential, replacement and revocation.
  - [x] 2026-08-04: persist immutable consent versions, served-disclosure digest, exact tariff/provider/customer binding, append-only grant/revocation lifecycle and CAS head; a saved-card charge UoW rejects a revoked or mismatched consent before it can create an operation intent.
  - [x] 2026-08-04: require the astrologer to select one fiscal receipt email or E.164 phone when accepting saved-card terms. The initiation UoW verifies that exact contact against the authenticated owner's already-verified identity before storing it only in immutable finance consent evidence; it is excluded from audit metadata and public responses. No profile-email fallback exists.
  - [x] 2026-08-04: the verified credential activation transaction now creates exactly one UUID charge-preparation request for the newly opened initial invoice and one matching IDs-only outbox event. The request retains the opaque invoice source ID and expected subscription revision; it prevents a future worker retry from treating a non-UUID invoice ID as an outbox aggregate or creating a second preparation request.
  - [ ] 2026-08-04: tariff invoices now carry a monotonic optimistic-lock revision, and each charge-preparation request pins both invoice and subscription revisions. The finance preparation UoW re-locks those facts plus the immutable tariff, active credential and granted consent, then atomically persists the payment intent/session, sealed dispatch artifact and outbox operation before moving the invoice to `payment_pending`. A prepared request records all three generated IDs for exact replay. It still requires an isolated PostgreSQL integration proof and worker composition before this item can be closed.
  - [ ] 2026-08-04: the first-charge worker now reads only a token-free pending aggregate, rehydrates tariff/fiscal policy, seals a deterministic request artifact, and uses deterministic UUID intent/session/operation IDs. Its ArcPay idempotency key is the same stable provider-operation UUID, conforming to the provider's 72-hour idempotency contract. It deliberately remains unwired until canonical terminal reconciliation handles capture, terminal decline and non-terminal pending/timeout states without a duplicate charge or premature entitlement.
  - [ ] 2026-08-04: a recovery reader now selects only `provider_unknown` tariff invoice operations whose immutable ambiguous result contains an ArcPay payment UUID. It returns no card token, vault locator or customer identity, and binds the exact current economic/provider revisions for canonical polling. Remaining: persist the first non-terminal response as that ambiguous result, then apply canonical captured/declined outcomes atomically.
  - [ ] 2026-08-04: the saved-card dispatcher resolves the vault credential only in the payment worker, seals the exact ArcPay POST response, and records it as an `ambiguous` provider result even if that response says `captured`. Therefore a raw POST cannot activate the tariff or post the ledger, and its payment UUID feeds the recovery reader instead of another MIT retry. Canonical capture/decline reconciliation and worker composition remain pending.
  - [x] 2026-08-04: a finance-owned credential-activation UOW locks the selected subscription, exact consent/head and credential/head together; only a granted consent plus the exact current active credential can create the first invoice. It replays the same verified activation without duplicating an invoice. The generic tariff store intentionally has no invoice-creation method.
  - [ ] Remaining: consent command/API, ArcPay setup browser/worker flow, credential activation/revocation I/O and trusted-credential resolver. Exact provider recurring-frequency values and production secret/object-store bindings remain external enablement decisions, not defaults.
- [ ] Add subscription/invoice/period/attempt aggregates with unique period and stable provider keys.
- [ ] Add worker schedulers for first charge, renewal, notices, dunning, unknown-result reconciliation, and customer-action handoff.
- [ ] Add astrologer API commands/reads and RU/EN Settings states using shared contracts.

Exit evidence: no subscription activates before canonical invoice capture; setup zero-capture cannot fulfill an invoice/order; duplicate schedulers cannot duplicate invoices/charges; paid-through access and cancel-at-period-end are correct; no recurring charge runs without approved operations policy and sandbox evidence.

### Stage 6 — Linked-client one-time checkout and availability

- [ ] Add required direct-link product/availability/slot reads and supported paid-product activation gates.
- [ ] Replace synchronous public ArcPay checkout with `checkout_requested -> checkout_ready | provider_session_unknown | failed` intent/outbox/worker protocol.
- [ ] Add authoritative order/payment/receipt return reads and client order history.
- [ ] Connect capture to explicit order/booking/fulfillment transitions and corrected hold/reserve release.

Exit evidence: one active economic intent/session; return URL never proves success; timeout never creates a blind second attempt; capture posts once; unsupported fulfillment remains unsellable; public flow never introduces discovery.

### Stage 7 — Disputes, refunds and chargebacks

- [ ] Add client dispute aggregate/evidence/timeline and policy-owned cancellation/no-show decision input.
- [ ] Add cumulative component and fiscal refund allocation, exact payable-lot reservation, funding gaps/bridge policy, unknown reconciliation, success/failure postings, and receipt evidence. The approval allocation is now durably persisted as a canonical, append-only `finance_refund_allocation_authorities` snapshot before a refund case may become approved; terminal work must rehydrate it rather than recompute from a later wallet/payout state. The worker-side ArcPay `POST /payments/{id}/refunds` transport adapter and explicit router are implemented; its accepted response remains ambiguous evidence until this aggregate and canonical terminal-result slice exist. When provider dispatch is enabled, verified refund/chargeback webhooks now enter sealed immutable storage and the durable finance inbox instead of the legacy ledger projector; a later canonical-result processor is still required to apply the aggregate/journal effect.
- [ ] Add authoritative chargeback case, principal suspense/allocation, payout race locks, fee expense, win/loss, recovery collection, and payout freeze.
- [ ] Add client/admin APIs, granular permissions, step-up, audit, notifications, and truthful UI states.

Exit evidence: partial refunds finish at exact full reversal; approval alone does not reverse economics; processing-manual payout gaps block without approved bridge; chargeback duplicates/races cannot consume a lot twice; won/lost postings satisfy `O/H/E/U`.

### Stage 8 — Manual payouts and bank cash

- [ ] Replace arbitrary/provider payout methods with verified versioned bank-card/bank-account destinations and immutable request snapshots.
- [ ] Add exact source-lot allocation, wallet row serialization, request expected versions, fixed global lock order, and terminal release/return behavior.
- [ ] Add cash-pool/account identity, checkpointed snapshots, statement rows, one exposure per payout, coverage edges, liquidity-row CAS, safety buffer, and bank reconciliation.
- [ ] Add maker-checker review/approve/initiate/paid/fail/reject/reveal commands with evidence and audit.
- [ ] Update astrologer/admin API and UI state matrices.

Exit evidence: concurrent requests/approvals cannot overspend payable or cash; unknown bank result stays `processing_manual`; paid requires reference/time/evidence; debit matching does not pay twice; pre-debit rejection and post-debit return post the exact approved matrix.

### Stage 9 — Product surfaces, operations, and enablement evidence

- [ ] Author and review missing admin reference states in `ElevenHouseDesign/`; capture exact existing reference states before production UI changes.
- [ ] Complete focused client, astrologer, and admin components/models/API wrappers with server-complete exports and all mapped states.
- [ ] Update canonical product/architecture/API/design inventory/operations docs to current implemented state.
- [ ] Run targeted, affected-package, repository, integration, concurrency/load/restart/recovery, real sandbox, runtime E2E, design-parity, RU/EN, and accessibility gates at the authority and environment available.
- [ ] Conduct per-task reviews and one whole-contour red-team review; fix all load-bearing findings.

Exit evidence: every completion claim maps to fresh evidence; absent service/credential/legal/bank authority is named as blocked rather than replaced with a narrower pass.

## Concrete Steps and Child Plans

1. Create and execute `docs/superpowers/plans/2026-08-03-finance-prerequisites.md` for Stage 1, starting with the capability manifest/publication validator because those files are currently clean and do not collide with the shared DB baseline.
2. At each stage boundary, refresh `git status --short`, the cached diff, target path diffs, current listeners, relevant ADR/docs, and upstream interfaces. Record discoveries here before writing the next child plan.
3. For every child plan, resolve an isolated SDD scratch workspace with the Superpowers helper, create a plan-identity ledger, generate one task brief per task, dispatch one implementer, collect its report, create an owned-path diff package, dispatch an independent reviewer, and complete the fix loop before the next task.
4. Do not use SDD's generic commit/worktree instructions: the repository's shared-main/no-commit policy is controlling. Track exact before/after file hashes and diffs in the ledger instead.
5. Before the first DB/schema task, verify that Flow's baseline work is stable, reread all shared migration files, and either produce one compatible combined baseline or report an exact semantic collision. Never regenerate from stale assumptions.
6. Before any destructive DB step, prove the exact host, database and container.
   The user has explicitly authorized reset/recreate of only the ElevenHouse
   production PostgreSQL database after the new baseline is implemented and
   verified. This authority does not cover another database and does not permit
   overwriting concurrent shared-main schema work.

## Validation and Acceptance

Targeted commands are specified in each child plan. Every stage expands through this ladder:

```bash
pnpm test <exact changed test files>
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/<affected-app> typecheck
pnpm --filter @elevenhouse/<affected-app> build
pnpm verify
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Integration tests run only against a verified existing local ElevenHouse PostgreSQL target and under their documented guards. Provider sandbox tests run only with authorized credentials/terminal and never claim live behavior from mocks. Browser acceptance uses already-running services unless the user separately authorizes lifecycle changes.

Required evidence categories:

- contracts/domain formulas and transitions;
- PostgreSQL uniqueness, row locks, CAS, rollback, projection rebuild, and races;
- API auth/permission/CSRF/idempotency/no-leak/step-up;
- ArcPay pinned contract and real sandbox behavior;
- worker duplicate/out-of-order/restart/unknown/dead-letter behavior;
- fresh-database baseline, trial balance, exact production-target recognition and
  reset/restore rehearsal against a disposable clone;
- real network-backed RU/EN E2E, responsive design parity, keyboard, screen reader, contrast, console and network;
- load, rate budget, queue contention, backup/restore, and reconciliation replay.

## Idempotence and Recovery

- Re-running a browser command with the same key returns the stored same-scope result or a typed request-hash conflict.
- Re-running a provider mutation reuses its persisted key only inside the proven ArcPay retention window; unresolved operations do not receive a new key.
- Replaying a webhook/inbox item resumes from its last committed checkpoint and cannot duplicate a semantic financial source.
- Re-running schedulers uses unique logical job keys and atomic claims.
- Rebuilding wallet/read models derives them from immutable journal/source facts and compares before replacing projections.
- Migration/baseline verification fails closed on invalid target identity or
  invariants. For this pre-launch rollout only, production reset/recreate is
  explicitly authorized after exact target proof; a safety backup may be taken
  solely against target-selection error and is not a migration source.
- A failed child task leaves its ledger/report/diff package in its plan-specific scratch workspace so another agent resumes the exact first incomplete task.

## Progress

- [x] 2026-08-02 — Completed repository/design/provider/product research.
- [x] 2026-08-02 — Approved single-merchant/internal-payable/manual-payout architecture in discussion.
- [x] 2026-08-02 — Wrote and red-teamed the 1,844-line umbrella design; final red-team verdict `PASS`.
- [x] 2026-08-03 — User approved implementation with `делай`.
- [x] 2026-08-03 — Re-ran shared-main intake and read required feature/backend/DB/security/worker/TDD/SDD runbooks.
- [x] 2026-08-03 — Confirmed current runtime listeners and the active Flow/Drizzle baseline collision.
- [x] Stage 1 — prerequisite code PASS; former authoritative-inventory gate
      explicitly waived by the disposable-production product decision.
- [~] 2026-08-05 — The shared current source now includes the implemented
      tariff/subscription, entitlement, company-merchant pay-in, ledger,
      reversal/chargeback, reconciliation and manual-payout contours. Focused
      domain/API/DB/worker/UI checks and repository-wide unit, typecheck, lint,
      documentation and build gates have passed. Final acceptance remains
      pending the external ArcPay sandbox and authenticated browser surfaces.
- [x] 2026-08-05 — Isolated PostgreSQL/Nest HTTP acceptance exercised the
      actual admin session, CSRF and idempotency boundaries: tariff draft,
      idempotent create replay and publication; plus manual payout
      `requested -> under_review -> approved -> processing_manual -> paid` with
      a bank transfer reference. The acceptance fixture now uses the immutable
      tariff commission snapshot instead of the removed finance-policy fee
      field, and a Nest DI regression test covers the idempotency guard.
- [x] 2026-08-05 — `admin-web?section=tariffs` now uses the audited tariff
      API for list/create/update/publish, with CSRF and a fresh command
      idempotency key; it treats published versions as immutable and clones a
      next version instead. Automated UI/API tests, admin-web typecheck and
      production build pass; live browser/design comparison remains blocked.
- [ ] Stage 2 — Pure-domain finance core audit remediation in progress; governed
      schema/adapters/baseline are now authorized to proceed next.
- [ ] Stage 3 — Immutable tariffs and entitlement enforcement.
- [ ] Stage 4 — Fiscal and ArcPay provider foundation.
- [ ] Stage 5 — Platform recurring billing.
- [ ] Stage 6 — Client checkout and availability.
- [ ] Stage 7 — Disputes, refunds, and chargebacks.
- [ ] Stage 8 — Manual payouts and bank cash.
- [ ] Stage 9 — Product UI, operations, and enablement evidence.

## Surprises & Discoveries

- 2026-08-05 — Quota publication research (repository evidence only; no new
  architecture decision): `bookingCounter` and `aiCounter` are explicitly
  `unwired`/`publicationBlocker: true`, so finite `bookingsLimit` or
  `aiRequestsLimit` cannot be published. `automationCounter` is already wired
  to the Flow activation transaction through a locked owner quota row and
  durable active-allocation authority. The tariff UI therefore permits
  configuring draft terms but relies on the authoritative publish boundary;
  it does not pretend an unimplemented counter is enforced. Evidence:
  `packages/domain/src/platform-billing/platform-capability-manifest-registry.ts`,
  `packages/domain/src/platform-billing/platform-plan-publication.ts`, and
  `packages/db/src/adapters/flows/drizzle-flow-enrollment-control-store.ts`.

- 2026-08-05 — ArcPay's current official onboarding documentation corrects the
  earlier assumption that a sandbox account can be self-registered: there is no
  self-service merchant registration. ArcPay sales/risk provision the tenant;
  sandbox `sk_test_…`/`pk_test_…` keys and webhook secrets are then created in
  that merchant portal. Therefore real sandbox E2E is an external onboarding
  dependency, not a repository permission or a value ElevenHouse may invent.
  Source: [ArcPay — Getting an account](https://finext.gitbook.io/arc-pay/ru/onbording/getting-account.md),
  accessed 2026-08-05. The existing fail-closed readiness gate remains the
  selected implementation; rejected alternative: fabricate credentials or
  represent mocked provider output as an end-to-end result.

- 2026-08-05 — ArcPay's current saved-card contract requires a UUID
  `Idempotency-Key` for every `POST /payments/saved-card` mutation (the same
  UUID requirement applies to checkout and refund mutations). The adapter had
  accepted any non-empty printable string, so it could issue a request ArcPay
  rejects. It now rejects non-UUID values before network I/O. The production
  tariff-invoice preparer already supplies its stable deterministic UUID v5
  provider-operation ID, preserving the same key across outbox redelivery.
  Source: [ArcPay — Saved cards](https://finext.gitbook.io/arc-pay/integration-guides/saved-cards.md),
  accessed 2026-08-05.

- 2026-08-05 — Local public-api acceptance exposed a prerequisite identity
  boundary defect: PostgreSQL duplicate-identity `23505` errors are wrapped by
  Drizzle under `cause`, while the registration adapter only inspected the
  outer error. A duplicate passwordless registration therefore produced HTTP
  500 instead of its declared 409 conflict. The adapter now follows the bounded
  error-cause chain, with a regression test for the real wrapped shape and a
  rebuilt public-api network check returning `409 Customer account identity
  already exists`. This is independent of finance rules, but it is required
  before a client can safely reach the purchase flow.

- 2026-08-05 — Read-only inspection of the running local `elevenhouse-postgres-1`
  confirmed the intended zero start after the pre-launch reset: `users`, roles,
  tariff versions/subscriptions, provider accounts, fiscal profiles, readiness
  evidence, economic payment intents, journal transactions, wallet heads,
  payable lots and cash pools are all empty. The existing astrologer API and
  web listener can therefore prove only unauthenticated behavior; authenticated
  finance browser acceptance requires a deliberately provisioned local test
  fixture, while real provider acceptance additionally requires the externally
  provisioned ArcPay sandbox tenant.

- 2026-08-04 — The saved-card setup consent was sufficient to prove tariff, disclosure,
  provider customer and recurring-charge acceptance, but did not retain the mandatory fiscal
  buyer contact that ArcPay needs for later merchant-initiated charges. Requiring the contact
  only at charge time would either leave a background renewal without a receipt destination or
  tempt a silent profile-email fallback. The chosen owner-selected verified contact is therefore
  immutable consent-scoped finance evidence. It is not copied into telemetry, audit metadata or
  public setup/status responses; the later sealed provider request snapshots the exact contact
  sent for each receipt.

- 2026-08-04 — ArcPay OpenAPI refresh for saved-card 3DS Method: the browser loads
  the provider `three_ds.submit` form in a hidden iframe, then sends only a local
  success/unsupported/unknown indication to ElevenHouse. `POST
  /payments/{id}/complete-3ds-method` is a secret-key backend call and requires
  the persisted `three_ds_server_trans_id` plus the original browser fingerprint.
  A subsequent Challenge is a browser handoff; its completion is resolved only
  through webhook/canonical `GET /payments/{id}`, never through browser-supplied
  success. Source: ArcPay OpenAPI `https://api.arcpay.space/openapi.json`,
  accessed 2026-08-04, paths `/payments/{id}/complete-3ds-method` and
  `/payments/{id}/execute`.

- 2026-08-05 — ArcPay OpenAPI refresh for refunds: the documented server is
  `https://api.arcpay.space/v1`; `POST /payments/{id}/refunds` accepts an
  integer-minor `amount` and optional 255-character `reason`, requires a UUID
  `Idempotency-Key`, and returns `pending`, `succeeded` or `failed`. Its
  idempotency scope is `(tenant_id, key)` for 72 hours and a changed body with
  the same key conflicts. The worker keeps this response as sealed ambiguous
  evidence: neither `201` nor response `succeeded` can mutate the ledger until
  the dedicated canonical/webhook refund-result unit of work is present. `GET
  /payments/{id}` additionally exposes the payment-level `refunded_amount` and
  an immutable `operations[]` summary (`operation_type=refund`,
  `operation_ref_id`, delta `amount`, status). The canonical refund reader
  requires the exact operation reference, delta and expected cumulative amount;
  `in_flight`/`unknown` remain non-terminal observations. This reader is
  implemented, but still cannot mutate the ledger without the result UoW.
  Source: ArcPay OpenAPI `https://api.arcpay.space/openapi.json`, accessed
  2026-08-05, SHA-256
  `324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff`.

- 2026-08-05 — A refund terminal result cannot safely reconstruct allocation
  from current payable lots: an intervening payout, a second partial refund or
  a bridge outcome can make that recomputation both different and internally
  balanced. The baseline therefore persists the exact 41-field
  `refund_posting_allocation_authority` payload with its canonical digest (the
  hash excludes its self-referential digest field), requires that snapshot
  before a refund case can leave `requested`, and protects both snapshot and
  case reference from mutation. The domain decoder still validates the full
  nested contract before persistence; PostgreSQL independently verifies the
  owner tuple, canonical digest and top-level closed shape. This is a storage
  prerequisite only: it does not itself authorize a provider refund or post a
  terminal ledger reversal.

- 2026-08-05 — Review of the declared refund ports found a critical execution
  gap: `ApproveRefundCommand` currently carries only references to the approved
  allocation, while the transaction must also receive the exact receipt-bound
  wallet/journal mutation and the sealed ArcPay dispatch artifact. A DB adapter
  cannot safely invent either input from current lots. Before the approval UoW
  is wired, the trusted refund-decision issuer must therefore produce one
  immutable execution package containing the allocation snapshot, approval
  posting/lot mutation, allocation links and provider-dispatch command. The
  terminal UoW will rehydrate that package by reference and may never recalculate
  an allocation. This is a contract correction, not permission to dispatch a
  refund from an admin request alone.

- 2026-08-05 — The original DB schema had no persisted refund cumulative
  position despite the approval and terminal port contracts carrying an expected
  position version. `finance_refund_cumulative_positions` is now an append-only,
  canonicalized version history scoped to the exact ArcPay provider identity and
  payment. Approval allocation binding now requires the exact persisted prior
  position. This makes the optimistic version a real database invariant and
  prevents a second partial refund from being authorised against a reconstructed
  or overwritten provider total.

- 2026-08-05 — The refund approval command also lacked the funding-reservation
  transition whose digest is stored in the refund case as `fundingCoverageDigest`.
  The execution proposal now carries that exact binding, alongside the approved
  allocation and prior cumulative position. The forthcoming approval UoW must
  persist its component reservations before creating the provider outbox record;
  it must not replace this proof with a new digest calculated from current lots.

- 2026-08-05 — The required persisted funding state is now explicit rather than
  implied by a case digest: `finance_refund_funding_positions` is canonical,
  append-only version history for every payable/payout/platform source and
  `finance_refund_funding_transition_authorities` is the immutable approved or
  terminal transition binding. PostgreSQL verifies their closed payload shapes,
  canonical hashes and allocation reference. A refund case cannot use a
  `fundingCoverageDigest` unless it names the matching persisted `approved`
  transition authority. This is still a prerequisite: the approval UoW must
  lock the current position versions, append their next versions and write the
  transition authority in the same transaction as the provider intent.

- 2026-08-05 — Repository-wide consumer tracing found no caller of the legacy
  astrologer `GET /platform-billing/me` path. It read the old
  `platform_plans`/`platform_subscriptions` projection while the production
  tariff source is now `/tariffs/*` and the versioned tariff authority. The
  legacy API module was removed rather than retained as a second subscription
  source of truth; legacy tables stay outside this change because the baseline
  still uses them for inventory/reconciliation evidence.

- 2026-08-05 — Current baseline webhook integration was reproduced against
  PostgreSQL and passed all four finance payment/reversal cases. A prior report
  of `platform_fee_bps` fixture drift was stale; no runtime or test workaround
  was added.

- 2026-08-05 — Finance-dispatch cutover now rejects a reversal acknowledgement
  unless the exact HMAC-verified raw payload has been immutably stored,
  registered with a `provider_webhook` retention policy and committed to the
  finance webhook inbox. It requires an explicit webhook signing-key version
  and separate webhook-retention policy at startup. This intentionally prevents
  the legacy reversal projector and the future aggregate result UoW from both
  posting a balance effect for the same provider event. Capture and other legacy
  payment transitions remain on their current projector until their equivalent
  finance aggregate processors are implemented.

- 2026-08-05 — Webhook ingress now also binds ArcPay's signed payload
  `tenant_id` to the active immutable provider-account identity selected for
  that receiving environment. HMAC validity and `sandbox`/`live` alone are not
  merchant correlation proof; a tenant mismatch is rejected before private
  object storage, artifact registration or inbox acknowledgement.

- 2026-08-03 — Existing finance code is not a blank slate: it has meaningful
  capture, ledger, payout, reversal and reconciliation behavior to audit and
  reuse where it satisfies the target invariants. Existing rows are not a
  migration source under the later disposable-production decision.
- 2026-08-03 — The active Flow work modifies all shared Drizzle baseline artifacts and production reconciliation. Finance schema regeneration before that work stabilizes would risk erasing or stale-patching valid work.
- 2026-08-03 — Current plan seeds advertise unavailable/partial capabilities and non-atomic limits as active plans. They must remain non-publishable until validation and enforcement exist.
- 2026-08-04 — Implemented the first Stage 3 authority seam in
  `platform_tariff_*`: canonical commercial digest, exact subscription/invoice
  snapshot FKs, draft CAS and PostgreSQL mutation guards. Focused domain,
  schema and isolated PostgreSQL tests are green; API, purchase/renewal and
  runtime capability guards remain unfinished.
- 2026-08-04 — PostgreSQL trigger research confirmed that a row-level `BEFORE
DELETE` trigger must return a non-null row (normally `OLD`) to permit the
  delete. The tariff guard now does so for drafts and rejects sealed history.
  Source: https://www.postgresql.org/docs/current/plpgsql-trigger.html
- 2026-08-03 — Only the design server and astrologer frontend are currently available among required browser surfaces; API-backed acceptance is blocked without separately authorized process lifecycle changes.
- 2026-08-03 — Final Stage 1 review found and closed source-level lifecycle, cardinality, order/payment economics and readiness-field projection gaps. The final owned-code verdict is PASS with no blocker/high/medium; production-authoritative inventory remains the sole Stage 1 entry-gate blocker.
- 2026-08-03 — While schema writes are blocked, Stage 2 can progress safely in an isolated `packages/domain/src/finance-core/**` pure-domain surface. Active commission authority, runtime stores, DB baseline and worker wiring must not change until their later gates are satisfied.
- 2026-08-03 — Task 5 load review proved that a full astrologer-lifetime
  source-lot/history object would be unbounded and can validate in quadratic
  time. It is retained only as a reference/rebuild oracle. The eventual online
  contour must persist normalized immutable lots/operations/edges and execute
  from bounded affected-row snapshots under a wallet-revision CAS and the
  approved stable lock order; reconciliation streams history by checkpoint.
- 2026-08-03 — Source-lot graph splits and journal economics are intentionally
  distinct: only approved economic deltas post. Structural remainder lots
  preserve lineage without adding artificial debit/credit turnover.
- 2026-08-03 — The approved refund matrix can create an astrologer recovery
  receivable but does not define its own later collection source/operation; the
  only approved `recovery_collected` event is chargeback-specific. Refund
  recovery cannot be enabled or silently netted until product/legal/accounting
  approves that missing contract. If a paid bridged payout later returns, its
  new reserved lot also requires either an exact refund-recovery collection or
  an exact reversal of the original `platform_refund_loss`; neither source
  vocabulary exists yet. Pure bridge builders may be completed, but the
  production bridge-to-paid policy stays fail-closed until both return
  resolutions are approved. Likewise, returned-payout and chargeback-win
  reserved lots remain in review until their explicit risk-release authority is
  specified.
- 2026-08-03 — Adversarial review proved that an operation-carried limit policy
  cannot constrain its own hostile payload and that a self-hashed allocation
  proof can drift from the journal while remaining internally balanced.
  Production decoding therefore needs an out-of-band configured resource
  envelope plus effective-policy resolution, and every journal-link proof must
  match the persisted transaction entry-for-entry.
- 2026-08-03 — The source-lot operation receipt matrix now separates immutable
  lineage from journal economics. The offline wallet reference oracle requires
  those strict receipts and correctly ignores same-bucket split remainders; both
  receipt and projection remain explicitly unverified until an atomic
  persistence receipt exists.
- 2026-08-03 — Task 6 audit found that bank/settlement foundations exist but the
  sale/revenue, hold/payout, refund and chargeback posting slices are absent.
  Their safe parallel implementation depends on first freezing bounded posting
  decoding, natural event identity, receipt/account/component matching and
  opaque authority boundaries.
- 2026-08-03 — The user declared current ElevenHouse production data
  pre-launch/disposable and explicitly removed preservation, subscriber-migration
  and opening-balance requirements. The safe rollout is a newly verified combined
  baseline followed by exact-target reset, minimal system seeds, deploy and real
  E2E; no current row becomes a compatibility constraint.
- 2026-08-04 — PostgreSQL documents that `DROP DATABASE` is irreversible,
  cannot target the currently connected database and cannot run inside a
  transaction. `FORCE` still fails when prepared transactions, active logical
  replication slots or subscriptions remain. The rollout therefore needs a
  maintenance-database connection, explicit preflight for
  `current_database()`, server address/port and prohibited catalog state, and a
  separate verified create/baseline step; it cannot pretend drop+create is one
  transactional rollback boundary.
- 2026-08-04 — A bank no-transfer result is authoritative for an entire payout.
  Production resolution therefore runs as one payout-wide transaction under
  the global lock order: it loads a trusted complete inventory of every active
  refund bridge reservation, closes each exact bridge against the same
  canonical outcome, releases only the unbridged remainder, closes the bank
  exposure and commits source-lot receipts and journals together. The pure
  per-bridge transition is only a lineage primitive; it cannot authorize an
  incomplete inventory or an early release by itself.
- 2026-08-04 — The isolated finance-core remediation has grown to 337 TypeScript
  files / 68,379 lines, including 214 non-test/fixture files / 36,394 lines.
  Passing behavioral tests alone is therefore not an architecture acceptance
  signal. Before this tree is exported or persisted, Stage 2 requires an
  independent cohesion/dependency/duplication audit and a focused consolidation
  pass that preserves the verified invariants.
- 2026-08-04 — Mature ledger guarantees converge on transaction-level
  debit=credit, immutable posted entries, stable external/idempotency identity,
  write atomicity and auditable account versions. ElevenHouse will not model
  provider-unknown money as a mutable pending journal: provider intents keep
  that uncertainty, while only confirmed economic facts produce one sealed,
  immutable journal transaction. Sources: [Modern Treasury ledger guarantees](https://docs.moderntreasury.com/ledgers/docs/ledgers-guarantees),
  [immutability design](https://www.moderntreasury.com/journal/enforcing-immutability-in-your-double-entry-ledger),
  and [TigerBeetle reliable submission](https://docs.tigerbeetle.com/coding/reliable-transaction-submission/).
- 2026-08-04 — ArcPay settlement monetary fields are documented as JSON
  `int64`. Production ingestion must retain and hash the exact raw page bytes and
  parse numeric tokens losslessly into bounded canonical decimal strings;
  standard JavaScript number decoding is not admissible financial evidence.
  Ledger rows use the ledger endpoint's actual shape, while merchant-payout
  status belongs to its separate endpoint/model. Cursor-cycle prevention is a
  normalized DB uniqueness invariant, not an unbounded in-memory history.
- 2026-08-04 — The repository and deploy images require Node 24; a bounded
  runtime spike on Node 24.17 proved that the Stage-4 `JSON.parse` reviver
  `context.source` retains the original int64 token even after the ordinary
  JavaScript value has rounded it. Native parsing still silently overwrites
  duplicate object keys. Before the settlement adapter is accepted, a contract
  spike must choose either native source-context plus an audited duplicate-key
  detector or exact-pinned `lossless-json`; both paths must fail on duplicates,
  preserve every numeric token and avoid a handwritten general JSON parser.
  Sources: [TC39 JSON parse with source](https://github.com/tc39/proposal-json-parse-with-source),
  [ECMAScript JSON.parse algorithm](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse),
  [`lossless-json`](https://github.com/josdejong/lossless-json).
- 2026-08-04 — Finance artifact `schemaVersion` is one numeric positive-integer
  vocabulary (`1` for the current format) and is persisted as an integer.
  Business aggregate `version`, wallet/ledger decimal `revision`, provider
  identity version and schema format version remain distinct named fields; code
  does not coerce between them. Existing mixed `"1"`/`1` pure-core artifacts
  must be normalized before the baseline schema and public facade freeze.

## Decision Log

- 2026-08-03, user — Approved the written single-merchant finance design and directed implementation.
- 2026-08-03, user — Declared the current production database disposable,
  removed the authoritative inventory/opening-balance gate, and authorized an
  exact-target destructive ElevenHouse production reset after the new combined
  baseline is implemented and verified.
- 2026-08-04, user — Declared the launch ElevenHouse bank account empty and
  required an exact zero financial start after reset. Only the cash-pool
  directory identity may be seeded; no opening balance/control transaction or
  external position exists. A provider-confirmed capture may create the first
  real provider-clearing/payable journal before merchant settlement; the first
  `bank_cash` movement requires the real ArcPay merchant-settlement flow and
  exact deduplicated bank-statement evidence.
- 2026-08-04, Codex — Implement the one-time reset as a bounded runbook/tool
  with exact expected host/port/database/container inputs and independent
  preflight evidence. Connect through a named maintenance database for the
  destructive edge, fail if target identity or prohibited PostgreSQL state
  differs, then create and install the already verified combined baseline.
  Official references: [DROP DATABASE](https://www.postgresql.org/docs/current/sql-dropdatabase.html),
  [dropdb](https://www.postgresql.org/docs/current/app-dropdb.html), and
  [session information functions](https://www.postgresql.org/docs/current/functions-info.html).
- 2026-08-04, Codex — Persist journal transactions through a short-lived
  unsealed write state inside one PostgreSQL transaction, add all entries, then
  seal after validating per-currency totals. Commit-time constraint triggers
  reject any unsealed or unbalanced transaction, and immutability triggers
  reject later mutation/deletion/truncation of sealed transactions and entries.
  Application validation remains defense in depth; the database is the final
  invariant boundary. PostgreSQL reference:
  [CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html).
- 2026-08-03, Codex — Use staged child plans and sequential implementer/reviewer loops so the large contour remains recoverable and independently verifiable.
- 2026-08-03, Codex — Start with manifest/readiness behavior that does not touch the contested DB baseline; this preserves forward progress without creating a parallel migration history.
- 2026-08-03, Codex — Repository shared-main and no-commit/no-worktree rules override generic Superpowers branch/commit mechanics; SDD quality gates are retained through ledgers, reports, and diff packages.
- 2026-08-03, Codex — Do not map the Stage 2 full-history source-lot oracle to
  one persisted hot-wallet aggregate. Require operation-scoped locked rows,
  normalized immutable history and one wallet revision for online mutations.
- 2026-08-03, Codex — The pinned ArcPay chargeback webhook does not expose a
  processing-fee amount. Record the principal delta immediately and record the
  fee only as a separate `provider_fee/confirmed` source when its own evidence
  exists; neither block principal nor guess a fee.
- 2026-08-03, Codex — PostgreSQL's documented stable snapshots do not replace
  cross-row locking, expected revisions or unique constraints. The later online
  adapter must acquire affected rows in the global order, atomically persist the
  wallet revision, lot operation, journal, link proof and checkpoint, enforce
  source identities in database uniqueness, and retry the whole transaction on
  serialization/deadlock conflicts. A caller-supplied digest alone is never
  mutation authority.
- 2026-08-03, Codex — The wallet consistency model must never promote a
  caller-created snapshot/checksum to authorization or proof of atomic commit.
  Online mutation requires three separately validated links: deterministic
  source-operation receipt, accounting allocation/journal-link proof and a
  persistence-issued commit receipt written atomically with the decimal-string
  wallet revision. Operation cardinality is controlled by an immutable
  versioned policy snapshot, not hard-coded guessed limits.
- 2026-08-03, Codex — The embedded operation limit policy is an integrity-bound
  claim, not decoder authority. Composition roots supply the independently
  resolved policy and decoder envelope; adapters reject oversized serialized
  input before parsing. Natural provider/statement IDs, not command UUIDs,
  anchor posting idempotency, while DB uniqueness and opaque maker-checker,
  exposure and commit receipts supply authority that pure hashes cannot.
- 2026-08-04, Codex — Paid tariff selection now creates only an exact published-
  tariff snapshot in `incomplete_setup`; it creates no invoice and makes no
  provider request. Only the trusted saved-card credential-activation workflow
  may advance it to `awaiting_initial_payment` and create the unique initial
  billing-period invoice. Only that invoice after `payment_pending` and verified
  capture may atomically activate the tariff. A zero-price tariff activates
  without an invoice or provider operation. PostgreSQL rejects a paid activation
  without a captured invoice for the exact subscription period.
- 2026-08-04, Codex — Current ArcPay documentation confirms the needed
  saved-card protocol: zero-amount `POST /cards/setup`, browser tokenization,
  server execute/3DS completion, then `POST /payments/saved-card` using only
  the confirmed `card_token_id`. The documented 72-hour provider idempotency
  window and non-terminal `timeout` status require persisted operation state,
  canonical reads and no fresh mutation key for an unresolved operation.
  Sources accessed 2026-08-04: [saved cards](https://finext.gitbook.io/arc-pay/ru/integracionnye-gaidy/saved-cards),
  [idempotency](https://finext.gitbook.io/arc-pay/ru/koncepcii/idempotency),
  [payment lifecycle](https://finext.gitbook.io/arc-pay/ru/koncepcii/payment-lifecycle),
  [webhooks](https://finext.gitbook.io/arc-pay/ru/vebkhuki/overview), and
  [settlement](https://finext.gitbook.io/arc-pay/ru/api-reference/settlement).
- 2026-08-04, Codex — A fresh inspection of the ArcPay OpenAPI checkout contract
  confirmed that `POST /checkout/sessions` yields only an HPP session `{id, url}`:
  it is neither a provider payment identifier nor a monetary capture result.
  ElevenHouse therefore persists an immutable DB-issued `economic_payment_session_open`
  receipt before its checkout operation is queued. The receipt only proves the internal
  compare-and-swap `created -> checkout_opened`; it deliberately contains no provider
  payment ID or capture amount. Provider operation result validation likewise excludes
  `checkout_session_create` from the capture-capable money matrix. A later verified
  webhook/canonical provider payment fact is still mandatory before a capture, ledger,
  order fulfillment or astrologer payable mutation. Repository evidence:
  `packages/db/src/schema/finance/economic-payments.schema.ts`,
  `packages/db/src/schema/finance/provider-operations.schema.ts`, and
  `apps/payment-worker/src/arc-pay/arc-pay-checkout-session-client.ts`.

## Outcomes & Retrospective

Stage 1 is deliberately partial rather than falsely complete. Capability and
publication gates, versioned readiness, supported fulfillment, transaction-bound
finance authorization, and deterministic read-only inventory are implemented
and independently reviewed with 261/261 affected tests. A fresh local report
found zero finance rows and zero opening balance, but also seven absent target
datasets, 18 unscoped facts and four unavailable provider controls. Because no
authoritative production target/access evidence was available, target schema,
migration and DB-adapter writes remain blocked. Runtime WebAuthn, entitlement
enforcement and every actual payment mutation also remain disabled as designed.

## Artifacts and Notes

- Approved design: `docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`
- Master plan: `docs/superpowers/plans/2026-08-03-finance-production-contour-master.md`
- Stage 1 child plan: `docs/superpowers/plans/2026-08-03-finance-prerequisites.md`
- Stage 2 pure-domain child plan: `docs/superpowers/plans/2026-08-03-finance-core-pure-domain.md`
- Design evidence root: `.design-qa/finance-production/`
- Per-plan SDD scratch artifacts: resolved by `scripts/sdd-workspace` under `.superpowers/sdd/`; never reuse another plan's ledger.
