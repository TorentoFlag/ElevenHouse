# Refund Authority Issuer — Execution Plan

## Purpose / Big Picture

Deliver the missing authoritative route between a client dispute and a terminal
company-merchant refund. A client may submit a dispute for only their own paid
order. An internal operator records a review decision. A distinct, step-up
authorized `admin-api` command resolves the exact order/payment/economics,
locks the wallet and affected funding sources, persists the immutable refund
approval package and outbox intent, then returns `approved` — not “money
returned”. The payment worker dispatches ArcPay only after commit. It posts the
refund ledger and wallet consequence only when a canonical provider
success/failure fact is verified.

This implements ADR 0013. ElevenHouse remains the sole ArcPay merchant; no
submerchant, split, astrologer-initiated provider refund or automatic payout is
introduced.

## Current Evidence and Gap

- `finance_refund_cases`, `RefundApprovalUnitOfWork`,
  `RefundResultApplicationUnitOfWork`, durable provider-operation outbox, and
  `RefundDispatcher` exist.
- The dispatcher correctly treats an ArcPay POST acknowledgement as ambiguous
  evidence. It does not post money.
- The client refund candidate and the deliberately non-monetary admin review
  queue now exist. No route issues a trusted approval package, and no canonical
  worker processor creates the terminal package/calls
  `applyVerifiedRefundResult`.
- Existing `payment_reversal_case` and `recordPaymentReversalProviderWebhook`
  are legacy inbound projections. They cannot become a second writer for the
  `finance_refund_cases` aggregate.
- Current shared baseline/migration files are heavily modified in shared main.
  Before schema generation, re-read their combined current content and preserve
  every Flow and Finance change. The user authorized an exact-target local reset
  after regeneration; never use that authorization for a non-local database.

## Sources and Research

Question: Which component may authorize a refund and when can it alter the
internal ledger?

Accessed: 2026-08-05.

- `docs/decisions/0013-refund-initiation-and-decision-ownership.md` — accepted
  ownership and state boundaries.
- `docs/decisions/0014-hosted-checkout-capture-authority.md` — provider
  canonical-read and verified-webhook authority model.
- ArcPay OpenAPI `https://api.arcpay.space/openapi.json`, SHA-256
  `324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff`
  (repository-recorded access 2026-08-05) — refund endpoint and canonical
  payment/refund facts.
- 2026-08-05 refresh: [ArcPay Refunds API](https://finext.gitbook.io/arc-pay/ru/api-reference/refunds.md)
  confirms `POST /v1/payments/{id}/refunds` only for CAPTURED/SETTLED payments,
  integer minor-unit partial amounts, a distinct UUID `Idempotency-Key` per
  refund and a 72-hour provider replay window. [payment.refunded](https://finext.gitbook.io/arc-pay/ru/vebkhuki/catalog/payment-refunded.md)
  is terminal per refund, while the parent payment exposes cumulative
  `refunded_amount`. This confirms that an acknowledged POST cannot post the
  ElevenHouse ledger and that terminal processing must bind the individual
  refund ID to the canonical cumulative payment fact.
- PostgreSQL transaction and explicit-locking documentation, linked in the
  finance design — locks/CAS and no provider I/O inside a transaction.

Repository fact: existing UoWs enforce persisted allocation/funding snapshots,
wallet revision, cumulative position version and provider-result replay.

Inference: the missing issuer must be a server-side composition of those
existing primitives, with data rehydrated under the global lock order. A
controller cannot construct or cast a `VerifiedRefundApprovalAuthority`.

Rejected alternatives:

1. Direct astrologer “refund” action: violates ADR 0013 and separation of
   duties.
2. Controller-side ArcPay request: no durable outbox/recovery boundary.
3. Recalculate refund allocation at webhook time: a payout or another partial
   refund can change the live graph, making a second valid-looking reversal.
4. Use legacy reversal projection as the new writer: duplicates financial
   authority and cannot prove the v2 source-lot allocation.

## Target State and Ownership

```text
client-web/public-api                         admin-web/admin-api
submit dispute candidate                      review candidate / step-up decision
          |                                             |
          v                                             v
finance_refund_candidates                refund decision issuer
                                                  |
                     exact locked rows + immutable allocation/funding package
                                                  v
                    finance_refund_cases = approved + provider-operation outbox
                                                  |
                                                  v
payment-worker -> ArcPay POST refund -> ambiguous response evidence
                                                  |
                              canonical webhook/read success or failure
                                                  v
                  RefundResultApplicationUnitOfWork -> journal/wallet/result receipt
```

### New durable candidate data

Add a candidate aggregate separate from `finance_refund_cases`; a candidate
does not have a monetary amount and cannot be represented safely by the latter
table’s required cumulative refund fields.

- `finance_refund_candidates`: immutable client/order identity, bounded client
  statement, state (`submitted`, `under_review`, `rejected`, `resolved`),
  optimistic version and timestamps.
- `finance_refund_candidate_reviews`: append-only operator review/rejection
  evidence; the successful monetary decision points at both candidate and
  review. A candidate has one open review path; replay uses command
  idempotency, not an upsert that overwrites an audit fact.

Do not claim evidence upload exists until a client-upload artifact contract is
implemented. The existing finance artifact registry accepts provider/bank
evidence only, so it is not a safe place to smuggle client files. Initial client
submission may contain a bounded text statement; the response explicitly says
the case is awaiting review, not that a refund is pending at ArcPay.

### Routes and authorization

- `POST /client/orders/:orderId/disputes` in `public-api`: client session,
  CSRF, idempotency; locks only the caller’s order and creates a candidate.
- `GET /client/orders/:orderId/disputes`: caller-owned timeline/read state.
- `GET /admin/finance/refund-candidates`: internal list/read only.
- `PUT /admin/finance/refund-candidates/:id/review`: CSRF, candidate expected
  version, operator audit; supports review/rejection, but it never calls ArcPay.
- `POST /admin/finance/refund-candidates/:id/refund-decisions`: granular
  permission and transaction-bound WebAuthn step-up. It accepts a bounded
  amount and reason/evidence references, then delegates to the issuer. Its
  response is an `approved`/`blocked_payout_outcome` decision state, never a
  fabricated provider success.

All mutations require a distinct idempotency key; ownership failures return no
cross-client financial record.

### Issuer and terminal interfaces

1. Add a domain port for a trusted `RefundDecisionIssuer`. Its only public
   input is candidate ID, expected candidate/refund versions, reviewed exact
   amount, authenticated operator/step-up evidence and server-resolved resource
   policies. It returns a durable receipt, not a branded authority to callers.
2. The Drizzle issuer locks in the approved global order: order/payment/refund
   roots → wallet → affected lots → payout allocations → bank rows if relevant.
   It verifies captured provider identity, immutable tariff/economics snapshot,
   current cumulative position and exact prior allocation/funding positions.
3. It constructs the approval authority, allocation, funding reservation,
   receipt-bound wallet mutation and provider dispatch artifact from those
   locked rows. It calls `RefundApprovalUnitOfWork` inside the same outer
   transaction or extracts the common transactional primitive so there is one
   transaction boundary.
4. Terminal worker processing reads the persisted allocation/funding authority
   by reference, creates a verified refund provider outcome from canonical
   ArcPay fact plus sealed artifact, derives the terminal posting, then invokes
   `RefundResultApplicationUnitOfWork`. It never reuses the legacy projector.
5. Provider unknown remains visible and reconciled. No new refund attempt is
   created until canonical evidence resolves the previous operation.

### Explicit fail-closed rules

- Any candidate/order not captured by the authoritative client-order path is
  ineligible.
- Currency other than RUB, amount <= 0, amount above captured cumulative
  remainder, missing fiscal/refund capability, missing step-up, stale expected
  versions, missing exact source lots, unapproved recovery, or missing provider
  readiness rejects before provider I/O.
- Already paid/in-flight payout components follow the approved bridge/recovery
  policy only. Until that legal/accounting policy exists, the decision is
  `blocked_payout_outcome`; it cannot silently debit a future astrologer balance
  or declare a platform loss.
- Acquirer and chargeback fees stay ElevenHouse expense unless an approved
  contract explicitly changes that. They do not alter the tariff commission
  snapshot.

## Plan of Work

1. Write red domain/contract tests for client ownership, duplicate active
   candidate handling, review version conflict and no-money candidate creation.
2. Add candidate schema/adapter/constraints, regenerate the combined baseline,
   exact-target reset local `elevenhouse`, and PostgreSQL integration tests for
   idempotency, ownership and concurrent candidate creation.
3. Add public-client candidate module and admin review module with CSRF,
   idempotency and durable audit. Verify authenticated HTTP against an isolated
   local database.
4. Build the issuer over the existing v2 allocation/funding primitives with
   a full approval integration fixture. Prove no provider outbox is visible on
   a failed transaction and no payout/refund race consumes a source twice.
5. Add canonical refund-result worker processor and real provider-inbox tests
   for success, failure, duplicate and out-of-order facts.
6. Add client/admin UI only after exact finance/dispute reference states are
   authored in `ElevenHouseDesign`; then run design-parity and browser E2E.
7. Run targeted tests → package checks → integration suite → `pnpm verify`.
   Run ArcPay sandbox E2E only after isolated sandbox credentials, webhook
   endpoint, fiscal profile and artifact storage/KMS configuration are supplied.

## Validation and Recovery

- Test partial refunds cumulatively so the final full refund reverses exactly
  the original commission/payable allocation.
- Test duplicate webhooks/outbox dispatches and crash checkpoints as one result
  receipt and one terminal journal effect.
- Test `provider_unknown`, stale approvals, concurrent payout/refund locks and
  failure rollback.
- Record only synthetic fixture data in local browser runs; reset the isolated
  test database after acceptance. Main local finance balances remain zero.

## Progress

- [x] 2026-08-05: current component boundary, runtime defect and missing issuer
  traced; ADR 0013 and provider/outbox semantics reconfirmed.
- [x] 2026-08-05: candidate aggregate schema was added to the consolidated
  pre-launch baseline and applied through a verified local reset. PostgreSQL
  guards reject cross-client order linkage and review-history mutation; a
  temporary isolated DB proves candidate create/replay/open-case uniqueness.
  `public-api` has CSRF/idempotency/client-role protected submit and read routes
  with network-backed Nest E2E proof. `admin-api` has auditable list/claim/reject
  review routes with internal-session, CSRF and idempotency protection. Review
  routes cannot approve or dispatch a refund.
- [ ] Trusted decision issuer and approval integration.
- [~] 2026-08-05: terminal result UoW now has an isolated PostgreSQL integration
  fixture proving stale CAS rejection, first application, provider-result replay,
  a single receipt and failed funding transition. Its production canonical worker
  processor remains unwired.
- [ ] Provider sandbox, full browser and visual acceptance.
