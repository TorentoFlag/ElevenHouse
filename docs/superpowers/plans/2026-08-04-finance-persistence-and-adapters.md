# Finance Persistence and Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with independent review checkpoints.

**Goal:** Replace the legacy finance persistence contour with one authoritative PostgreSQL baseline and capability-specific Drizzle adapters that preserve the approved journal, wallet, payment, provider, refund, chargeback, settlement, bank-reconciliation and manual-payout invariants atomically.

**Architecture:** `packages/domain` owns pure decisions and narrow persistence ports. `packages/db` owns normalized PostgreSQL state, constraints, lock order, transaction boundaries, persistence-issued receipts and reconciliation readers. Provider and bank fetches occur outside database transactions; only verified immutable evidence is applied inside a capability-specific unit of work. Online commands load locked heads and relevant normalized rows, while append-only history remains an independent reconstruction and reconciliation source. There is no universal `FinanceUnitOfWork`, generic balance mutation, parallel `finance_v2` schema or compatibility fallback.

**Tech Stack:** TypeScript, Node.js 24, PostgreSQL 17, Drizzle ORM/Drizzle Kit, `pg`, Vitest, the existing transactional outbox and audit log, SHA-256 artifact binding, and the approved pure finance core under `packages/domain/src/finance-core`.

## Global Constraints

- The product contour is one ElevenHouse merchant account. ArcPay collects money for ElevenHouse; ArcPay sub-merchants and ArcPay astrologer payouts are out of scope.
- Astrologer payouts are manual bank/card/account transfers recorded by ElevenHouse. ArcPay merchant payouts to ElevenHouse are a separate settlement concept and must never be mapped to astrologer payout requests.
- The launch database starts with an exact zero financial position. Only reviewed bank cash-pool directory identity rows may be seeded. Do not seed a journal, wallet, provider balance, clearing position, payout exposure, liquidity snapshot, bank statement, opening balance or monetary control row.
- Zero launch does not defer real sale economics until merchant settlement: the first verified client/provider capture may post provider clearing, payable and commission immediately. Only the first `bank_cash` movement specifically requires real ArcPay merchant-settlement evidence plus the exact deduplicated bank statement fact.
- ArcPay merchant payout matching is full-row and one-to-one at launch: one ArcPay `payout_id`/wire/reference/net amount matches one bank statement credit. The payout statement, not the bank row alone, carries the included captures, refunds, fees and reserve movements. Manual astrologer payout execution likewise requires one request-specific transfer/reference and one exact bank debit. Unknown bank rows move in full to directional suspense; no partial row allocation is inferred.
- The current production database was declared pre-launch and disposable. Do not implement legacy finance migration, backfill, subscriber conversion or opening-balance reconstruction. The checked-in finance inventory remains diagnostic only.
- The one-time destructive production reset authorized by ADR 0012 remains a final deployment operation after this plan, all higher-layer finance work, fresh-database rehearsal and exact production target proof. This plan must not execute or embed a production reset command.
- Work in the existing checkout on `main`. Do not create a worktree/branch, stash, rebase, broad-stage, commit or push. Preserve concurrent staged, dirty and untracked work.
- Before each edit group, re-read the exact files named in that task and run a scoped `git diff --` against those same literal paths. Stop only for an incompatible semantic collision; never overwrite another agent's schema, migration or baseline work.
- No long-running process may be started, stopped or restarted by this plan without direct authority. Integration tests may use an already-running, positively identified local PostgreSQL service.
- Do not run `pnpm db:generate` until the shared schema and all baseline augmentation owners report a stable combined state. Do not run `pnpm db:reset` during implementation; the separately described local reset proof requires fresh explicit authority and exact local target preflight.
- Store money as integer minor units with explicit currency. Drizzle must return monetary and provider-`int64` values as decimal strings, never JavaScript `number`. Use `numeric(..., { mode: "string" })` or raw text decoding with database checks; do not use `bigint(..., { mode: "number" })` for money.
- Provider-account identity is the immutable triple `(series_id, provider_account_id, identity_version)`. Every provider fact, operation, webhook, settlement cursor and settlement entry binds that exact identity.
- Queue/outbox records carry stable IDs only. Canonical request/response, raw provider evidence and statement evidence live in immutable digest-bound artifacts. PAN, CVV, raw card data and encrypted-card payloads are never persisted. A saved-card token is a restricted credential; tokenization execution may persist only a sealed, expiring, one-time secret reference.
- Provider/webhook/settlement/bank artifacts may contain buyer or bank PII. Exact raw bytes live only in a private sealed blob/object-store boundary with envelope encryption, opaque object keys and no public/presigned client read path. PostgreSQL stores minimized semantic fields plus immutable digest, byte length, content type, storage version, encryption-key version and versioned retention class. Only least-privilege ingress/reconciliation services may read a raw artifact, every read/deletion is audited, and raw content is never returned by finance read models or written to logs.
- A provider or bank lease is an ownership optimization, not financial authority. If a lease participates in a write, its fencing token is checked by the same SQL statement. Lease time comes from PostgreSQL `clock_timestamp()`, not an application clock.
- Provider or bank I/O never occurs while financial row locks are held. Unknown provider/bank outcomes remain explicit non-terminal states and are reconciled before retry or economic mutation.
- Generic JSON may retain non-authoritative diagnostics, but no journal, allocation, balance, provider identity, idempotency, payout destination, bank match, settlement entry or audit decision may depend on an unvalidated JSON shape.
- Tests follow behavioral RED -> GREEN -> REFACTOR. A unit test that only observes a mock call is not acceptance evidence for a financial transaction boundary.

---

## Purpose and Big Picture

After this plan is complete, a fresh ElevenHouse database has exactly one finance model. A verified provider capture can be applied once, producing a sealed balanced journal transaction, exact payable lots, one wallet revision, economic payment state and outbox IDs in one PostgreSQL transaction. Refunds, chargebacks and manual payouts serialize against the same lots and bank exposures. Settlement pages and bank statements are restart-safe, lossless and deduplicated by natural provider/bank identities. An operator cannot manufacture cash or wallet availability by editing a projection, importing the same statement row twice or marking a payout paid without the required evidence.

The expected visible result of this plan alone is not a new UI. The observable result is an authoritative schema, tested adapter ports, reproducible baseline and reconciliation evidence that higher application/worker plans can safely compose.

## Progress

- [x] 2026-08-04 — Read the task-intake, finance feature-delivery, research, database, testing, verification and planning runbooks.
- [x] 2026-08-04 — Re-read the approved finance design, master plan, pure-core plan, ADR 0012, current finance schema/adapters, finance inventory and shared baseline tooling.
- [x] 2026-08-04 — Identified the current shared-main migration collision surface and the live legacy finance consumers.
- [x] 2026-08-04 — Froze the initial capability-specific persistence-port names with the pure-core cohesion owner.
- [x] 2026-08-04 — Re-read the live direct-module ports after review remediation; `pnpm exec vitest run packages/domain/src/finance-core/ports/finance-port-contracts.test.ts` passed 8/8.
- [ ] Task 0 — Reconfirm the pure-port/artifact contract and shared-main ownership ledger.
- [ ] Task 1 — Add exact storage primitives and immutable external-account/artifact identities.
- [ ] Task 2 — Add economic-payment, provider-operation and durable webhook-inbox persistence.
- [ ] Task 3 — Replace the legacy ledger with a sealed, balanced, immutable journal.
- [ ] Task 4 — Add normalized wallet heads, revisions, source lots and commit receipts.
- [ ] Task 5 — Implement payment/provider/capture/clearing capability-specific units of work.
- [ ] Task 6 — Add refunds, chargebacks, funding reservations and their atomic adapters.
- [ ] Task 7 — Add manual payout, beneficiary snapshot, allocation and bank-exposure persistence.
- [ ] Task 8 — Add cash-pool, liquidity snapshot, bank statement and bank-match persistence.
- [ ] Task 9 — Add ArcPay settlement cursor, lossless page, checkpoint, entry and matching persistence.
- [ ] Task 10 — Implement payout-wide definitive-no-transfer and bridge resolution atomically.
- [ ] Task 11 — Add reconstruction/reconciliation readers, outbox and finance audit bindings.
- [ ] Task 12 — Remove the legacy persistence truth and pass the atomic consumer cutover gate.
- [ ] Task 13 — Regenerate and inspect one combined shared baseline after the collision gate clears.
- [ ] Task 14 — Rehearse the exact-zero baseline on an explicitly authorized local target.
- [ ] Task 15 — Run affected-surface, concurrency, recovery, security and independent review gates.

## Surprises and Discoveries

- The current finance schema is materially smaller than the approved contour: it has generic reconciliation/provider-event JSON, aggregate wallet balances, nullable provider scope and JavaScript-number money modes, but no exact provider identity versions, sealed journal, source lots, settlement cursor/checkpoints, payout bridge inventory or bank cash-pool evidence graph.
- The pure finance core is intentionally richer than a hot request model. Its full history/snapshot functions are a reconstruction oracle, not permission for request-path adapters to hydrate and return all history.
- The existing finance adapters are actively imported by `public-api`, `astrologer-api`, `admin-api`, `payment-worker` and DB fixtures. Adding new tables beside them and regenerating the baseline would create two sources of truth. Final export/baseline generation therefore requires an atomic consumer cutover coordinated with the application plans.
- The migration SQL, Drizzle snapshot/journal, root schema exports, outbox schema, baseline plan/reconciler and several non-finance schemas are currently modified by concurrent work. Their observed hashes are evidence of collision, not stable preconditions. They must be re-read and re-hashed immediately before regeneration.
- ArcPay settlement fields are OpenAPI `int64` JSON numbers. Standard JavaScript number materialization is not admissible. Node 24 exposes `JSON.parse` reviver `context.source`, but native parsing alone does not reject duplicate object keys. The provider decoder requires a bounded contract spike before production selection.
- A page budget alone does not prevent pagination cycles such as A -> B -> A. The database needs a normalized unique checkpoint identity for `(cursor, window_generation, provider_page_cursor)`.
- A per-bridge payout transition cannot prove a definitive no-transfer outcome. The persistence boundary must acquire the complete payout/bridge/lot/exposure state in the canonical global order and close all bridges, exposure, lots, receipts and journals in one transaction.
- ArcPay `GET /settlement/payouts` exposes only aggregate payout fields. The official payout statement contains the exact included `payment_id`/`external_id` rows, but the documented Reports API has only transaction, balance and commission generation and no payout-statement endpoint. Therefore an individual payment cannot reach `bank_matched` from an aggregate payout plus bank row alone. Launch ingestion accepts a sealed ArcPay payout statement artifact through a controlled operator upload; an undocumented portal endpoint or a date-range reconstruction is not provider authority.
- The same ArcPay payout-list contract exposes `bank_payout_id` but not `bank_reference`; the official payout statement is the documented source of that bank reference. Aggregate confirmation therefore cannot precede statement sealing. The exact authority order is payout API batch -> sealed payout statement/header+lines -> aggregate merchant-payout confirmation -> bank statement match -> per-payment final clearing.

## Decision Log

- 2026-08-04 — Keep capability-specific units of work. A generic finance repository or transaction callback that exposes arbitrary stores is rejected because it cannot prove the exact lock set or commit receipt for a financial capability.
- 2026-08-04 — Use normalized current heads for request-path CAS and append-only history for reconstruction. Request-path ports do not accept or return full histories.
- 2026-08-04 — Persist exact artifact references and persistence-issued receipts. A pure canonical digest detects drift but does not prove a database commit.
- 2026-08-04 — Raw external evidence is sealed outside semantic tables. An encrypted private object plus immutable DB registry row is the evidence boundary; normalized finance rows retain only the minimum fields needed for correlation/accounting. Artifact retention/deletion follows a versioned legal/security policy and leaves an audited digest tombstone rather than silently erasing source identity.
- 2026-08-04 — `FinanceJournalLinkProofRef.kind` is `finance_allocation_link_proof`; the persistence contract also preserves `proofId`, numeric `version`, `proofDigest`, exact entry order and four business links. Do not map it to the former `finance_journal_link_proof` name.
- 2026-08-04 — Journal transactions may be unsealed only inside their creating PostgreSQL transaction. Deferred constraint triggers reject unsealed or per-currency-unbalanced transactions at commit; mutation/truncation guards make sealed transactions and entries immutable.
- 2026-08-04 — Exact monetary values use decimal strings across `pg`/Drizzle/domain boundaries. Provider `int64` fields additionally carry signed-64-bit range checks; internal aggregate balances use a wider integer `numeric(38,0)` envelope without floating point.
- 2026-08-04 — Settlement page checkpoint uniqueness uses a non-null canonical checkpoint identity digest plus the human-readable nullable provider cursor. The unique key is `(settlement_cursor_id, window_generation, checkpoint_identity)`, so the first page and A -> B -> A cycles are enforceable without nullable-unique ambiguity.
- 2026-08-04 — The bounded decoder spike selected Node `24.17.0` native `JSON.parse` reviver `context.source` plus the ECMA-404 AST from exact-pinned `@humanwhocodes/momoa@3.3.10` (Apache-2.0, npm integrity `sha512-KWiFQpSAqEIyrTXko3hFNLeQvSK8zXlJQzhhxsyVn58WFRYXST99b3Nqnu+ttOtjds2Pl2grUHGpe2NzhPynuQ==`). Momoa preserves every object member, so an explicit per-object key set rejects all duplicate keys before native materialization; native source text then converts canonical in-range integer lexemes directly to decimal strings. Exact-pinned `lossless-json@4.3.0` was rejected because its default duplicate handler accepts identical duplicate keys while rejecting only value-changing duplicates. Synthetic Node 24 measurements: a documented-size 100-entry/24,736-byte page averaged 0.709 ms across 200 parses, with 13.7 MB pre-GC allocation peak and 5 KB retained delta; a padded 418,311-byte page averaged 2.56 ms across 20 parses, with 5.8 MB pre-GC peak and 32 KB retained delta. The production decoder still rejects bytes above the resolved policy budget before parsing and catches parser/resource failures as typed quarantine; no handwritten parser is introduced.
- 2026-08-04 — The shared `outbox_events` table remains the sole transactional outbox. Finance event payloads contain only a stable operation/aggregate ID; the UoW operation ID is the outbox aggregate ID so existing `(event_type, aggregate_id)` uniqueness remains a deterministic replay key.
- 2026-08-04 — The shared audit log remains the actor/action envelope. A normalized one-to-one finance audit fact supplies request ID, permission, before/after digest, evidence fingerprint, currency/amount where applicable and redacted destination fingerprint; generic audit metadata is not authority.
- 2026-08-04 — Bank cash changes only from an imported, deduplicated bank statement fact for that exact cash pool. A liquidity snapshot authorizes a commitment but never posts cash.
- 2026-08-04 — Official ArcPay settlement documentation defines a merchant payout as one net bank transfer with a `payout_id`, wire ID, bank reference and downloadable statement listing the captures, refunds, fees and reserve movements included in that payout. Direct bank matching therefore binds the exact ArcPay payout aggregate to one full bank credit, never an individual captured payment. The launch manual-payout operating contract similarly requires one transfer/reference per payout request; an unclassified row is posted in full to suspense. Sources accessed 2026-08-04: `https://finext.gitbook.io/arc-pay/ru/operacionka/settlement`, `https://finext.gitbook.io/arc-pay/ru/operacionka/payouts`, `https://finext.gitbook.io/arc-pay/ru/api-reference/settlement`.
- 2026-08-04 — The persistence authority now reflects that granularity: `MerchantPayoutConfirmationCommitReceiptRef` is an aggregate ArcPay payout receipt and is the only direct merchant-credit match authority. A per-payment `SettlementPaymentMatchCommitReceiptRef` cannot authorize bank cash. Bank statement evidence separately carries decoder-issued `sourceStatementId` and `sourceRowId`; adapters may not derive those natural keys from an ElevenHouse entry ID.
- 2026-08-04 — Payment clearing advances through three different persistence authorities. Batch ingestion plus provider entry key proves `settlement_seen`; settlement-payment match proves `provider_matched`; a separately committed bank-cash-match receipt proves `bank_matched`. The two-transaction bank-match/clearing boundary is intentional and replay-safe so settlement evidence alone can never manufacture bank cash or final clearing.
- 2026-08-04 — Strengthened final payment clearing after re-reading the official ArcPay Reports, Settlement and Payouts contracts. `bank_matched` now requires both the aggregate `BankCashMatchCommitReceiptRef` and a nominal `MerchantPayoutPaymentInclusionCommitReceiptRef` issued from the exact sealed payout-statement line. The payout API batch first proves completed aggregate payout/wire/net/currency; the statement then adds the documented bank reference and exact included payment rows; only its nominal statement receipt may authorize aggregate confirmation. Each payment line rebinds provider payment ID, external ID, amount, fee and currency to the captured payment. Until ArcPay documents a payout-statement download API, the raw CSV/XLSX/PDF enters through an authenticated, audited admin upload and the same server-side decoder/artifact boundary; transaction reports, dates and payout arithmetic are not substitutes. Official sources accessed 2026-08-04: `https://finext.gitbook.io/arc-pay/ru/api-reference/reports`, `https://finext.gitbook.io/arc-pay/ru/api-reference/settlement`, `https://finext.gitbook.io/arc-pay/ru/operacionka/payouts`. Corroborating mature provider patterns: Stripe payout reconciliation and Adyen Settlement details report, both transaction-level batch authorities.
- 2026-08-04 — Verified capture carries the complete bounded `SealedWalletJournalMutationCommand` as an untrusted proposal and persists it only through a DB-internal transaction-scoped wallet writer. The capture UoW rebinds that proposal to the exact persisted provider result, capture fact and immutable order-economics/risk-policy/fulfillment owners. A separate capture-application receipt table owns the cross-module economic/provider/wallet commit tuple and replay boundary; no controller or standalone wallet adapter may treat a proposed graph as authority.
- 2026-08-04 — No legacy finance data is copied, reconciled or backfilled. Old Drizzle finance tables/adapters are removed during the atomic cutover before the new baseline is generated.
- 2026-08-04 — Baseline generation and local reset are different gates. `pnpm db:generate` is non-destructive but waits for shared schema stability; local `pnpm db:reset` is destructive and waits for separate exact-target authority. Production reset is not part of this plan.

## Outcomes and Retrospective

Complete this section during execution. Record the final schema catalog, adapter test evidence, generated baseline hash, exact local rehearsal target, zero-seed counts, unresolved enablement gates and any coordinated consumer work. Do not replace missing evidence with a completion claim.

---

## Context and Orientation

Read these sources before Task 0 and again if they change during implementation:

- Product/architecture truth: `docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`.
- Orchestration/staging truth: `docs/superpowers/plans/2026-08-03-finance-production-contour-master.md`.
- Pure-core behavior and reconstruction oracle: `docs/superpowers/plans/2026-08-03-finance-core-pure-domain.md` and `packages/domain/src/finance-core/**`.
- Pre-launch reset decision: `docs/decisions/0012-prelaunch-production-baseline-reset.md`.
- DB execution policy: `docs/development/agent-runbooks/04-database-and-migrations.md`, `docs/development/commands.md` and `docs/development/testing-strategy.md`.
- Current legacy schema: `packages/db/src/schema/finance/**`.
- Current legacy adapters: `packages/db/src/adapters/finance/**`.
- Shared outbox/audit: `packages/db/src/schema/outbox/**`, `packages/db/src/adapters/outbox/**`, `packages/db/src/schema/audit-log/**`.
- Baseline authority/collision surface: `packages/db/drizzle/**`, `packages/db/scripts/production-baseline-plan.ts`, `packages/db/scripts/reconcile-production-baseline.ts`, `packages/db/scripts/augment-*-baseline.ts`, `packages/db/src/schema/index.ts` and `packages/db/src/schema.test.ts`.
- Diagnostic-only old-data evidence: `packages/db/scripts/finance-inventory.ts` and `packages/db/src/adapters/finance/drizzle-financial-inventory-reader.ts`.
- ArcPay primary contract: `https://api.arcpay.space/openapi.json`; research snapshot on 2026-08-04 reported OpenAPI version `1.0.0` and SHA-256 `324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff`. Re-fetch and re-pin before implementing the transport decoder; do not silently accept a changed contract.
- ArcPay merchant payout semantics: `https://finext.gitbook.io/arc-pay/ru/operacionka/settlement`, `https://finext.gitbook.io/arc-pay/ru/operacionka/payouts` and `https://finext.gitbook.io/arc-pay/ru/api-reference/settlement` (accessed 2026-08-04). These sources establish aggregate net payout/wire/reference/statement semantics; they do not authorize direct bank-row-to-client-payment matching.

## Interfaces and Dependencies

### Pure-core ports owned by the cohesion agent

Do not edit `packages/domain/src/finance-core/ports/**` from this plan. Import and implement these exact capability contracts after their owner has made them green:

- `economic-payment-intent-creation-uow.ts` — `EconomicPaymentIntentCreationUnitOfWork`.
- `provider-operation-intent-creation-uow.ts` — `ProviderOperationIntentCreationUnitOfWork` and the outside-transaction `ProviderOperationIoPort`.
- `provider-operation-result-application-uow.ts` — `ProviderOperationResultApplicationUnitOfWork`.
- `verified-capture-application-uow.ts` — `VerifiedCaptureApplicationUnitOfWork`.
- `payment-clearing-advance-uow.ts` — `PaymentClearingAdvanceUnitOfWork`.
- `webhook-inbox-persistence-port.ts` — `WebhookIngressStorageUnitOfWork`, `WebhookInboxProcessingUnitOfWork` and the outside-transaction `WebhookCanonicalReadPort`.
- `wallet-journal-commit-port.ts` — `SealedWalletJournalCommitUnitOfWork`.
- `payout-definitive-no-transfer-uow.ts` — `PayoutDefinitiveNoTransferUnitOfWork`.
- `payout-request-uow.ts` — `PayoutRequestUnitOfWork`.
- `payout-review-approval-uow.ts` — `PayoutReviewApprovalUnitOfWork`.
- `payout-manual-execution-uow.ts` — `PayoutManualExecutionUnitOfWork`.
- `payout-paid-confirmation-uow.ts` — `PayoutPaidConfirmationUnitOfWork`.
- `payout-bank-return-application-uow.ts` — `PayoutBankReturnApplicationUnitOfWork` for a returned transfer after an already confirmed paid payout.
- `refund-approval-uow.ts` — `RefundApprovalUnitOfWork`.
- `refund-result-application-uow.ts` — `RefundResultApplicationUnitOfWork`.
- `chargeback-fact-application-uow.ts` — `ChargebackFactApplicationUnitOfWork`.
- `chargeback-resolution-uow.ts` — `ChargebackResolutionUnitOfWork`.
- `settlement-persistence-port.ts` — `SettlementCursorLeaseUnitOfWork`, `SettlementBatchIngestionUnitOfWork`, `SettlementPaymentMatchUnitOfWork` and the outside-transaction `SettlementProviderReadPort`.
- `settlement-persistence-port.ts` also owns `MerchantPayoutStatementIngestionUnitOfWork` and the nominal per-line `MerchantPayoutPaymentInclusionCommitReceiptRef`; the raw statement is decoded outside database locks and sealed atomically within the resolved row/byte budget.
- `bank-cash-pool-port.ts` — `CashPoolDirectoryBootstrapPort`, `BankLiquiditySnapshotAdoptionUnitOfWork`, `BankStatementIngestionUnitOfWork` and `BankCashMatchUnitOfWork`.
- `reconciliation-port.ts` — `FinanceOnlineReconciliationReadPort`, `FinanceFullHistoryReconstructionPort` and `FinanceReconciliationUnitOfWork`.
- `rate-budget-port.ts` — `DistributedArcPayRateBudgetPort`.
- `trusted-finance-evidence.ts` and `finance-port-types.ts` — branded exact evidence/artifact/receipt references shared by the preceding ports; no runtime evidence factory.

Cross-port authority is also exact: `ProviderOperationResultCommitReceipt` is the only provider-result input to `VerifiedCaptureApplicationUnitOfWork`; `VerifiedSettlementPageBundle` indivisibly binds decoded entries to the raw artifact/checkpoint; `SettlementBatchIngestionCommitReceiptRef`, `SettlementPaymentMatchCommitReceiptRef`, `MerchantPayoutPaymentInclusionCommitReceiptRef`, `BankStatementIngestionCommitReceiptRef`, `BankCashMatchCommitReceiptRef`, payout approval/paid receipt refs and `VerifiedWalletOperationCommitReceipt` are nominal, persisted one-to-one and never reconstructed from caller JSON. `PaymentClearingAdvanceUnitOfWork` uses a discriminated evidence chain: `settlement_seen` requires a batch-ingestion receipt plus its exact provider entry key, `provider_matched` requires a settlement-payment-match receipt, and `bank_matched` requires both the aggregate bank-cash-match receipt and the exact payout-statement payment-inclusion receipt. Neither authority alone can authorize `bank_matched`.

If any listed port is absent or its focused contract test is red, stop that adapter task and return the exact missing capability to the pure-core owner while unrelated schema tasks continue. A bank return after confirmed payment stays distinct from definitive pre-transfer/no-debit resolution; the former preserves immutable paid history and creates the evidence-linked reserved payable lot, while the latter belongs only to `PayoutDefinitiveNoTransferUnitOfWork`.

### Owned paths

Primary ownership for implementation:

- `packages/db/src/schema/finance/**`.
- `packages/db/src/adapters/finance/**`.
- `packages/db/scripts/finance-*.ts` and their tests.
- `packages/db/src/finance-*.integration.ts` created by this plan.

Shared paths, edit only after re-reading their live diff and coordinating the current owner:

- `packages/db/src/schema/index.ts`.
- `packages/db/src/adapters/index.ts`, `packages/db/src/index.ts` and `packages/db/package.json`.
- `packages/db/src/schema/outbox/outbox-events.schema.ts` and `packages/db/src/schema/audit-log/audit-log.schema.ts`.
- `packages/db/scripts/seed.ts`.
- `packages/db/scripts/production-baseline-plan.ts`, `packages/db/scripts/production-baseline-plan.test.ts` and `packages/db/scripts/reconcile-production-baseline.ts`.
- `packages/db/src/schema.test.ts`, `packages/db/src/production-baseline-reconciliation.integration.ts`, `packages/db/src/production-deploy-hardening.test.ts` and `packages/db/src/production-deploy-seed.test.ts`.
- `packages/db/drizzle/0000_sticky_rictor.sql`, `packages/db/drizzle/meta/0000_snapshot.json` and `packages/db/drizzle/meta/_journal.json`.

Read-only or separately coordinated consumers for the atomic cutover:

- `apps/public-api/src/modules/orders/**` and `apps/public-api/src/modules/payments/**`.
- `apps/astrologer-api/src/modules/finance/**`.
- `apps/admin-api/src/modules/finance-policies/**`.
- `apps/payment-worker/src/**`.
- `packages/db/src/dev-fixtures/admin-finance-browser-fixture.integration.ts`.

### Explicitly out of scope

- Tariff/version publication, entitlement enforcement and subscription billing application workflows.
- Fiscal configuration and receipt generation/provider API wiring.
- ArcPay HTTP client, webhook HTTP controller, workers, scheduling and UI beyond the parser contract gate described here.
- Automated astrologer payouts, sub-merchants, statutory GL mapping and legal/accounting policy values.
- Legacy-row conversion or any production destructive action.

---

## Target Persistence Model

Names below are authoritative plan names. If a concurrent schema owner has already introduced an equivalent normalized concept, reuse and strengthen it after review rather than creating a synonym.

| Family | Required tables / records | Non-negotiable database authority |
| --- | --- | --- |
| External identity/artifacts | `finance_provider_account_series`, `finance_provider_accounts`, `finance_artifacts`, `finance_artifact_access_events`, `finance_restricted_provider_credentials`, `finance_transient_secret_refs` | Exact immutable provider triple; append-only identity versions; encrypted private-blob ref + digest/byte-length/content-type agreement; versioned retention/deletion tombstone; least-privilege audited access; no raw card data; one-use/expiry state for sealed secret refs |
| Economic payments | `finance_economic_payment_intents`, `finance_economic_payment_sessions`, `finance_payment_transition_facts`, `finance_capture_facts`, `finance_payment_clearing_heads`, `finance_payment_clearing_history` | One intent per `(purpose, source_id)`; one capture; one active-or-unknown session; exact provider binding; expected-version CAS |
| Provider operations | `finance_provider_operation_source_heads`, `finance_provider_operations`, `finance_provider_operation_results`, `finance_provider_dispatch_artifacts`, `finance_arc_pay_rate_budgets` | Unique provider-scoped idempotency key; immutable canonical request digest; predecessor chain/CAS; unknown is non-terminal; queue carries operation ID only; distributed budget uses DB clock/CAS |
| Provider ingress | `finance_webhook_inbox`, `finance_webhook_processing_history`, `finance_provider_semantic_facts` | Raw-byte artifact before semantic effect; exact account + transport ID uniqueness; signature evidence; DB-clock claim/fence; semantic natural-key dedupe |
| Journal | `finance_accounts`, `finance_source_identities`, `finance_journal_transactions`, `finance_journal_entries`, `finance_allocation_link_proofs`, `finance_allocation_link_proof_entries`, `finance_persistence_commit_receipts` | Typed natural source uniqueness; explicit account scope; per-currency debit=credit; seal-at-commit; immutable sealed rows; strict proof mirror; no direct balance mutation |
| Wallet/lots | `finance_wallet_heads`, `finance_wallet_history`, `finance_payable_lots`, `finance_payable_lot_transitions`, `finance_payable_lot_operation_receipts`, `finance_wallet_commit_bindings` | Stable row lock and revision CAS; normalized lot lineage; no double consumption; one wallet revision per committed operation; rebuildable head |
| Refunds | `finance_refunds`, `finance_refund_cumulative_positions`, `finance_refund_allocations`, `finance_refund_funding_reservations`, `finance_refund_provider_facts` | Cumulative refund <= capture; delta-only posting; exact sale-lot consumption; funding coverage before dispatch; one provider result effect |
| Chargebacks | `finance_chargebacks`, `finance_chargeback_positions`, `finance_chargeback_allocations`, `finance_chargeback_recoveries`, `finance_chargeback_provider_facts` | Exact provider principal natural key; principal separate from fee; cumulative positions; source-lot uniqueness; won/lost/recovery evidence append-only |
| Manual payouts | `finance_payout_methods`, `finance_payout_method_versions`, `finance_payout_requests`, `finance_payout_allocations`, `finance_payout_approvals`, `finance_payout_evidence`, `finance_payout_bridge_reservations` | Manual destinations only; immutable request snapshot/amount; maker-checker evidence; unique bank reference; exact lot allocations; complete bridge inventory |
| Bank liquidity | `finance_bank_cash_pools`, `finance_bank_liquidity_heads`, `finance_bank_liquidity_snapshots`, `finance_bank_statement_imports`, `finance_bank_statement_rows`, `finance_bank_exposures`, `finance_bank_snapshot_exposure_coverage`, `finance_bank_matches`, `finance_bank_exceptions` | Non-overlapping statement source; statement-row natural key; one exposure per payout; pool/currency CAS; cash only from statement facts; no ambiguous inclusion |
| ArcPay settlement | `finance_settlement_cursors`, `finance_settlement_pages`, `finance_settlement_page_checkpoints`, `finance_settlement_entries`, `finance_merchant_payout_facts`, `finance_merchant_payout_statements`, `finance_merchant_payout_payment_inclusions`, `finance_settlement_matches`, `finance_settlement_exceptions` | Exact provider identity + stream cursor; DB clock lease/fence; unique A-B-A checkpoint; raw digest; lossless signed int64 strings; entry natural-key dedupe; aggregate payouts separate; sealed statement header plus immutable per-payment inclusion receipts |
| Audit/outbox/reconciliation | `outbox_events`, `audit_log_entries`, `finance_audit_facts`, reconciliation readers/checkpoints | Same-transaction IDs-only outbox; normalized redacted audit fact; heads independently rebuild from append-only history; mismatches fail closed |

### Common storage rules

- Use UTC `timestamptz` for instants. Provider-observed time and database-received/committed time are separate columns.
- Use explicit `currency` checks; launch postings are `RUB`, but no table may infer currency from an amount or account ID.
- Use positive amount columns and an explicit journal `side`; provider statement direction remains its own opaque field and is mapped only by a versioned correlation rule.
- `version`, wallet revision, mutation sequence and fencing tokens are monotonic integer values. Database rows compare-and-set exact expected values and return the database-issued next value.
- Every foreign key declares deletion behavior. Financial evidence, journal, lots, payouts, statements and matches use `RESTRICT`/`NO ACTION`; user deletion must not cascade financial history.
- Every natural external identity has a unique constraint that includes the exact external-account scope. A random UUID may be the surrogate primary key but is never the only dedupe key.
- Provider identity rows, artifacts, sealed journal rows, evidence, lot history, audit facts and statement rows reject `UPDATE`, `DELETE` and `TRUNCATE` through reviewed database functions/triggers in the generated baseline.
- Current heads are mutable only through versioned capability UoWs. Append-only history stores previous/next revision, operation/source identity and persistence receipt.

### Minimum constraint and index catalog

Use these logical keys even if a reviewed concurrent schema requires a different physical constraint name. Every FK from immutable financial history uses `ON DELETE RESTRICT`/`NO ACTION` unless the referenced row is a non-authoritative processing claim.

| Record | Required keys/checks | Required access index |
| --- | --- | --- |
| Provider account series/version | PK on surrogate ID; unique `series_id`; unique `(series_id, identity_version)`; unique `(series_id, provider_account_id, identity_version)`; `identity_version >= 1`; provider/environment/scope checks; immutable version trigger | Current series head `(series_id, active_identity_version)` and readiness lookup by exact binding |
| External artifact/access event | PK; class-specific provider/cash-pool scope FK; SHA-256 format; `byte_length >= 0`; non-empty content type; opaque private object key/version; envelope-key version; retention-policy version and state check; unique `(artifact_class, scoped_owner_id, sha256_digest)`; immutable evidence metadata; append-only access/deletion events | `(scoped_owner_id, artifact_class, received_at, id)`, retention due, access by actor/service/purpose/time |
| Restricted credential/transient secret | FK exact provider version and consent; unique provider credential natural ID; explicit lifecycle; one-use consumption check; expiry after creation | Active credential by customer/account; unconsumed secret by expiry, never by secret value |
| Economic intent/session/capture | Unique `(purpose, source_id)`; unique intent ID; partial unique one active-or-unknown session per intent; unique exact provider binding + provider payment ID; amount positive/currency explicit; capture amount/correlation checks | Intent by source; sessions by intent/state; provider payment lookup by exact account |
| Provider operation/source head | Unique source head; unique `(provider_account_id, operation_kind, idempotency_key)`; unique canonical request identity; predecessor FK/uniqueness; state/result-shape checks; expected version | Pending/unknown operations by status/deadline; source-chain `(source_kind, source_id, version)` |
| ArcPay rate budget | Unique exact provider account + budget class; non-negative capacity/tokens; monotonic version; DB-clock refill/not-before checks; atomic acquisition | Next-eligible budget by exact provider account and not-before time |
| Webhook inbox/semantic fact | Unique `(provider_account_id, transport_event_id)`; unique artifact FK; signature/state/lease shape checks; unique semantic natural key `(provider_account_id, fact_kind, provider_fact_id, fact_revision)` | Claim index `(status, available_at, received_at, id)`; stale lease; quarantine and unprocessed semantic facts |
| Journal source/transaction/entry | Unique `(source_kind, source_id, source_operation_key)` with exact provider/bank scope columns; one source -> one journal transaction; entry unique `(journal_transaction_id, entry_order)`; positive integer amount; one currency per transaction; deferred balance/seal and immutable triggers | Account history `(account_id, occurred_at, journal_transaction_id, entry_order)`; source lookup; unsealed rows for integrity diagnostics only |
| Allocation proof/commit receipt | One proof per journal transaction and source-transition receipt; proof entry unique by order and exact journal entry FK; unique receipt ID and persistence transaction boundary; digest formats | Lookup by operation/source, wallet revision and journal transaction |
| Wallet head/history/lot | Unique `(astrologer_user_id, currency)`; monotonic revision; lot unique source/component identity; parent/root FKs; amount bounds; transition unique `(lot_id, mutation_sequence)`; allocation/consumption edge globally unique | Spendable/blocked lots by wallet + bucket + source/lot ID; history by wallet revision; due hold/reserve release |
| Refund/chargeback | Unique aggregate source; unique provider fact under exact account; cumulative amount bounds; allocation component unique; funding reservation one-to-one with component; principal evidence separate from fee evidence | Open/unknown refund jobs; active chargeback by payment/order; unresolved position/suspense aging |
| Payout/method/allocation | Method version immutable; request version `>= 1`; one immutable destination snapshot; allocation unique `(payout_id, lot_id)` and globally exclusive consuming edge; partial unique non-null bank reference per cash pool; evidence/state shape checks | Requests by astrologer/state/time; review queue; processing-manual aging; bank reference lookup |
| Cash pool/liquidity/exposure | Unique non-overlapping active statement-source identity; unique `(bank_cash_pool_id, currency)` head; one exposure per payout; exposure state check; unique `(exposure_id, snapshot_id, statement_row_id)` coverage | Current snapshot/head; open exposures by pool/currency/state; stale snapshot and uncovered exposure |
| Statement import/row/match | Unique import digest/source checkpoint; unique `(bank_cash_pool_id, source_statement_id, source_row_id)`; signed canonical integer/check; immutable row; match amount positive and cumulative allocation <= absolute row amount | Unmatched rows by pool/currency/occurred time; import checkpoint; matches by target type/ID |
| Settlement cursor/page/entry | Unique exact provider binding + stream; non-negative/monotonic fence/version/window generation; checkpoint unique `(cursor_id, window_generation, checkpoint_identity)`; page artifact digest; entry unique `(provider_account_id, provider_entry_id)`; signed-64-bit checks | Claimable cursor by lease expiry; page sequence; unmatched entries by provider/type/reference/time; settlement exceptions |
| Audit/outbox | Finance audit one-to-one FK to shared audit envelope; digest/redaction checks; deterministic shared-outbox unique `(event_type, aggregate_id)` where `aggregate_id` is the finance operation ID; IDs-only payload contract | Audit by target/actor/request/time; pending/quarantined outbox using the shared relay indexes |

Cross-row predicates that cannot be expressed by a single `CHECK` are enforced by the named capability UoW plus a deferred constraint trigger or unique/coverage row. Do not replace a required cross-row invariant with an application pre-read followed by an unlocked write.

### Global financial lock order

All refund, chargeback and payout adapters acquire only relevant rows, but always in this order:

1. order, economic payment, refund and chargeback aggregate roots in fixed type/UUID order;
2. astrologer wallet heads in `(astrologer_user_id, currency)` order;
3. payable lots in `(source_kind, source_id, lot_id)` order;
4. active refund bridge reservations in `(payout_request_id, bridge_reservation_id)` order when relevant;
5. payout request roots in UUID order when the command can affect them;
6. bank liquidity heads in `(bank_cash_pool_id, currency)` order;
7. bank exposures in UUID order.

Immutable provider account/operation/inbox evidence is verified before this sequence without moving those rows ahead of the canonical financial locks. Journal source insertion/sealing follows the locked mutation. Use explicit `SELECT ... FOR UPDATE` in the seven-step order above. `SKIP LOCKED` is allowed only for inbox/outbox/scan claim ownership, never for choosing a balance, lot, payout allocation or exposure. Translate deadlock/serialization retry signals into the typed retry contract; do not partially retry inside a UoW.

---

## Plan of Work

Execution proceeds in five recoverable phases. First freeze upstream port/artifact contracts and the shared-main ownership ledger. Second build normalized schema primitives and capability UoWs behind direct-module tests without exporting a parallel runtime truth. Third complete refunds, chargebacks, manual payouts, bank cash and settlement, then prove reconstruction/outbox/audit. Fourth coordinate an atomic cutover of every legacy consumer and only then regenerate one combined shared baseline. Fifth, under separate explicit local-DB authority, rehearse the zero baseline and run independent concurrency, security and operations reviews. A failed phase leaves later destructive/export steps closed; it never enables a fallback path.

## Concrete Steps

### Task 0: Freeze ports, artifacts and the shared-main collision ledger

**Files:**

- Create: `packages/db/src/adapters/finance/finance-persistence-contract.test.ts`
- Read only: `packages/domain/src/finance-core/ports/**`
- Read only: `packages/domain/src/finance-core/wallet-operation-commit-binding-types.ts`
- Read only: `packages/domain/src/finance-core/postings/posting-types.ts`
- Update during execution: this plan's `Progress`, `Surprises and Discoveries` and `Decision Log`

**Steps:**

- [ ] Record `git branch --show-current`, `git status --short`, `git diff --cached --name-status`, `git diff --name-status`, the owners of shared files and SHA-256 for the three current migration artifacts. Treat these as a contemporaneous collision ledger, not expected constants.
- [ ] Re-read every target file and its scoped diff. Confirm no other agent owns the same finance schema/adapter path.
- [ ] RED: add a compile/runtime shape test importing every named UoW from the pure-core ports. Assert no port exposes a generic transaction callback, arbitrary repository bag, caller-supplied commit receipt or full-history request-path argument/result.
- [ ] RED: assert exact artifact contracts: IDs-only dispatch/outbox refs, immutable digest-bound evidence, `FinanceJournalLinkProofRef.kind === "finance_allocation_link_proof"`, exact proof/version/digest field names and a persistence-issued opaque commit receipt.
- [ ] RED: assert the provider dispatch contract is a closed immutable envelope whose canonical request digest is recomputed and bound by persistence. Saved-card charge contains only a restricted credential reference; tokenize execute contains only a sealed provider-expiring one-use secret reference; PAN, CVV, raw/encrypted card payloads, splits and sub-merchant fields are structurally impossible.
- [ ] RED: assert provider-result application returns a persistence-issued verified result/capture receipt but cannot mark an economic payment captured or write journal/wallet economics. `VerifiedCaptureApplicationUnitOfWork` must consume that receipt and bind exact provider triple, economic intent, conditionally required session, provider operation and canonical request digest.
- [ ] RED: assert settlement ingestion accepts one decoder-issued verified immutable page bundle binding provider triple, stream, window, page cursor, decoded-entry digest and exact raw-artifact digest. Independently caller-composable artifact and entry arrays are forbidden.
- [ ] Run the contract test before adapter work. Any mismatch is an upstream blocker, not a local DB-package shape to patch; this plan must not edit `ports/**`.
- [ ] Require the contract test plus `pnpm --filter @elevenhouse/domain typecheck` to remain green after every adapter batch.
- [ ] Search all legacy finance imports and attach the exact consumer list to this plan. Assign an owner/cutover stage for each before Task 12.

**Commands:**

```bash
git branch --show-current
git status --short
git diff --cached --name-status
git diff --name-status
shasum -a 256 packages/db/drizzle/0000_sticky_rictor.sql packages/db/drizzle/meta/0000_snapshot.json packages/db/drizzle/meta/_journal.json
rg -n "createDrizzle(CapturedSale|FinanceCommand|FinancePolicy|Ledger|Order|Payment|Payout|Reconciliation|TerminalPayment|PaymentReversal)" apps packages --glob '*.ts' --glob '*.tsx'
pnpm exec vitest run packages/domain/src/finance-core/ports/finance-port-contracts.test.ts
pnpm exec vitest run packages/db/src/adapters/finance/finance-persistence-contract.test.ts
pnpm --filter @elevenhouse/domain typecheck
```

**Acceptance:** Exact pure ports and artifact refs compile without a local duplicate interface; every shared collision and legacy consumer has an owner before schema mutation begins.

### Task 1: Add exact value codecs, immutable provider identity and artifact storage

**Files:**

- Modify: `packages/db/src/schema/finance/finance-values.ts`
- Create: `packages/db/src/schema/finance/provider-accounts.schema.ts`
- Create: `packages/db/src/schema/finance/finance-artifacts.schema.ts`
- Create: `packages/db/src/schema/finance/provider-credentials.schema.ts`
- Modify: `packages/db/src/schema/finance/index.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/finance-row-codecs.ts`
- Create: `packages/db/src/adapters/finance/finance-row-codecs.test.ts`
- Create: `packages/db/src/adapters/finance/finance-artifact-registry.ts`
- Create: `packages/db/src/adapters/finance/finance-artifact-registry.integration.ts`

**Steps:**

- [ ] RED: test decimal-string round trips for signed ArcPay min/max `int64`, internal `numeric(38,0)` money, revisions/fences and rejection of fractions, exponent notation, non-canonical zero, unsafe-number inputs and out-of-range provider values.
- [ ] RED: test provider-account uniqueness and immutability for `(series_id, provider_account_id, identity_version)`, including a new identity version rather than mutation.
- [ ] RED: test artifact digest/byte-length/content-type, exact provider/cash-pool binding, opaque private object key/version, envelope-key version, retention-policy version and immutable-update/delete/truncate behavior. PostgreSQL semantic/evidence rows must contain no plaintext raw payload column.
- [ ] RED: test least-privilege artifact access: only approved ingress/reconciliation service identities and explicit purposes can resolve a private object; every successful/denied read and authorized retention deletion writes append-only access audit. Finance APIs/read models/log serializers cannot expose object key, ciphertext, plaintext or reusable signed URL.
- [ ] RED: test versioned retention by artifact class and legal hold. Missing/unknown retention policy blocks purge; authorized expiry replaces availability with an audited tombstone that retains digest/length/source identity. Do not guess retention durations in code.
- [ ] RED: before sealed upload, the bounded decoder/DLP gate rejects PAN, CVV, raw/encrypted card fields and sub-merchant/split material. Persist only a redacted security incident reference for forbidden payloads, never the forbidden bytes.
- [ ] RED: test that credential tables cannot store PAN/CVV/raw/encrypted-card fields. A reusable saved-card record stores only provider/account scope, an encrypted or vault-backed restricted token handle, lifecycle/revocation and consent reference. A transient tokenization secret stores only a sealed reference, provider expiry and one-time consumption state.
- [ ] GREEN: implement focused Drizzle column helpers and exact row codecs that reject JavaScript numbers for monetary/provider integer columns.
- [ ] GREEN: add provider series/version tables and the encrypted private-artifact registry/access audit, with explicit unique indexes, FKs/checks and immutability trigger SQL exposed through the baseline augmentation mechanism chosen in Task 13. Blob upload/envelope encryption occurs before the DB reference transaction; deterministic artifact identity makes DB retry safe, and orphaned sealed uploads are removed only by an audited retention job.
- [ ] REFACTOR: keep Drizzle table definitions declarative; keep conversion/error mapping in `finance-row-codecs.ts`.

**Acceptance:** No external finance fact can be loaded without exact provider identity; no unsafe number or raw card payload crosses the DB adapter; encrypted private artifacts prove exact bytes/digest while semantic rows, read models and logs remain minimized.

### Task 2: Persist economic payments, provider operations and the durable webhook inbox

**Files:**

- Replace: `packages/db/src/schema/finance/orders.schema.ts`
- Replace: `packages/db/src/schema/finance/payments.schema.ts`
- Replace/remove after cutover: `packages/db/src/schema/finance/idempotency-commands.schema.ts`
- Create: `packages/db/src/schema/finance/provider-operations.schema.ts`
- Create: `packages/db/src/schema/finance/rate-budget.schema.ts`
- Create: `packages/db/src/schema/finance/webhook-inbox.schema.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-webhook-ingress-storage-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-webhook-ingress-storage-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-webhook-inbox-processing-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-webhook-inbox-processing-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-distributed-arc-pay-rate-budget.ts`
- Create: `packages/db/src/adapters/finance/drizzle-distributed-arc-pay-rate-budget.integration.ts`

**Steps:**

- [ ] RED: prove one economic intent per `(purpose, source_id)`, one provider-scoped capture, one active-or-unknown session per intent, exact provider binding and expected-version rejection.
- [ ] RED: prove provider operation idempotency uniqueness across exact provider identity + operation kind + idempotency key, predecessor-chain CAS, request-digest immutability and explicit `provider_unknown` state.
- [ ] RED: prove dispatch queues contain only the operation ID. Canonical dispatch bytes/digest live in an immutable artifact; a transient secret ref is one-use and cannot be replayed after provider expiry.
- [ ] RED: prove webhook transport dedupe by exact provider identity + transport event ID, semantic dedupe by provider natural source key, sealed private artifact registration before acknowledgement and no money effect from invalid signature/unknown semantics. Raw bytes never appear in inbox rows or logs.
- [ ] RED: with two database sessions, prove inbox claim/renew/complete checks a PostgreSQL-issued fencing token and rejects a stale worker. Claim and expiry SQL must use `clock_timestamp()` in the same statement.
- [ ] RED: implement the exact `DistributedArcPayRateBudgetPort` contract and compete multiple replicas against one exact provider-account budget. Atomic DB-clock acquisition cannot exceed the configured budget; a provider `429` update advances the shared not-before boundary, and another provider identity remains isolated.
- [ ] GREEN: implement normalized intent/session/transition/capture rows, source-chain heads, provider operation/result rows, inbox/history/semantic-fact rows and their indexes/checks/FKs.
- [ ] GREEN: implement inbox transaction methods with short claims. `SKIP LOCKED` may select pending inbox work, but semantic application occurs through the later capability UoW.
- [ ] REFACTOR: remove authoritative generic event JSON. Preserve only redacted diagnostics/artifact refs where an open provider string is intentionally opaque.

**Acceptance:** A duplicate transport or provider fact is a deterministic replay, an ambiguous result remains unknown, and no provider event can change economics before verified semantic application.

### Task 3: Replace the legacy ledger with a sealed, balanced, immutable journal

**Files:**

- Replace: `packages/db/src/schema/finance/ledger.schema.ts`
- Create: `packages/db/src/schema/finance/journal-integrity.sql.ts`
- Create: `packages/db/src/schema/finance/journal-integrity.test.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Create: `packages/db/src/adapters/finance/journal-row-mapper.ts`
- Create: `packages/db/src/adapters/finance/journal-row-mapper.test.ts`
- Create: `packages/db/src/adapters/finance/journal-transaction-writer.ts`
- Create: `packages/db/src/adapters/finance/journal-transaction-writer.integration.ts`

**Steps:**

- [ ] RED: schema tests require the approved operational account kinds, class/normal side/owner scope checks, exact provider-account/cash-pool/astrologer scope and reject a generic `platform_clearing` or `manual_adjustment` account.
- [ ] RED: integration tests attempt duplicate natural source identity, zero/negative entry amounts, cross-currency transactions, unbalanced commit, unsealed commit, post-seal update/delete and truncate. Every attempt must fail at the database boundary.
- [ ] RED: prove a correction can only be a typed reversal linked one-to-one to the original source transaction plus a typed replacement under separate source identity.
- [ ] RED: persist a strict allocation-link proof and then perturb entry order, account, side, amount or any of the four business links; mapping/DB checks must reject each mismatch.
- [ ] GREEN: implement `finance_source_identities` with unique typed natural source identity and one-to-one journal ownership. Internal sources use an explicit internal-scope check; provider and bank sources require their exact external scope.
- [ ] GREEN: implement a short-lived unsealed transaction writer: insert source/transaction, insert entries/proof rows, calculate debit/credit totals per currency, seal, issue persistence commit receipt, then allow PostgreSQL commit.
- [ ] GREEN: add deferred constraint triggers that reject every unsealed or per-currency-unbalanced journal at commit, plus mutation/truncation triggers for sealed transactions, entries, proofs and source identities.
- [ ] REFACTOR: domain builders produce proposed postings; only the trusted DB writer creates the opaque commit receipt and transaction-bound reference.

**Key SQL behavior:**

```sql
-- Conceptual invariant; use reviewed function/trigger names in the baseline.
SELECT currency,
       sum(CASE side WHEN 'debit' THEN amount_minor ELSE -amount_minor END)
FROM finance_journal_entries
WHERE journal_transaction_id = $1
GROUP BY currency
HAVING sum(CASE side WHEN 'debit' THEN amount_minor ELSE -amount_minor END) <> 0;
```

The deferred trigger fails if this returns any row or if `sealed_at` is null. It runs at commit, not as an application-only precheck.

**Acceptance:** PostgreSQL, independently of application validation, cannot commit an unbalanced/unsealed transaction or mutate sealed financial history.

### Task 4: Persist normalized wallet heads, revisions, source lots and commit receipts

**Files:**

- Create: `packages/db/src/schema/finance/wallet.schema.ts`
- Modify: `packages/db/src/schema/finance/ledger.schema.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/wallet-row-mapper.ts`
- Create: `packages/db/src/adapters/finance/wallet-row-mapper.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-sealed-wallet-journal-commit-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-sealed-wallet-journal-commit-uow.integration.ts`

**Steps:**

- [ ] RED: prove unique wallet head `(astrologer_user_id, currency)`, exact revision CAS and one revision increment per successful operation under 32 competing transactions.
- [ ] RED: prove source-lot original amount is immutable; remaining amount cannot be negative/exceed original; lineage cannot cycle; one allocation edge cannot be consumed by two refund/chargeback/payout operations.
- [ ] RED: prove current bucket totals equal the sum of active normalized lots and match the linked sealed journal/operation receipt. A caller-supplied snapshot digest or fake commit receipt must not authorize mutation.
- [ ] RED: prove the first real sale root lot cannot be persisted from the compressed receipt alone. The commit command must carry a separately strict-rehydrated O(k) touched-lot transition, and persistence must compare its identities, lineage and amounts with the receipt before retaining exact capture, economics, risk-policy and fulfillment provenance. Full lifetime wallet state remains forbidden on the online path.
- [ ] RED: prove returned payable requires the exact source-transition receipt and journal allocation-link proof.
- [ ] GREEN: implement wallet heads for bounded online reads, append-only wallet history, normalized lots/transitions/operation receipts and commit binding rows.
- [ ] GREEN: implement one internal commit helper used only inside capability UoWs. It locks wallet then lots in global order, applies exact expected revisions, writes journal and lot transitions, updates the head, writes history/binding and issues one persistence receipt atomically.
- [ ] GREEN: bind every root lot to exact capture, order-economics, risk-policy and paid-product-fulfillment owner keys plus canonical digests; child lots inherit those immutable values from their locked parent.
- [ ] GREEN: preserve the intentional version domains: the empty source-lot state is version `1`, so the first payable sale is lot-state `1 -> 2` while the newly materialized wallet is operation revision `0 -> 1`; thereafter `lot_state_version = wallet_revision + 1`. A first wallet row is legal only for a payable `sale_capture` with at least one root lot.
- [ ] REFACTOR: keep full-history hydration only in reconciliation readers. Do not expose it from request-path UoWs.

**Acceptance:** Concurrent wallet operations serialize without double consumption; current heads are fast but independently reconstructible; no digest alone is transaction authority.

### Task 5: Implement payment/provider/capture/clearing units of work

**Files:**

- Create: `packages/db/src/adapters/finance/drizzle-economic-payment-intent-creation-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-economic-payment-intent-creation-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-provider-operation-intent-creation-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-provider-operation-intent-creation-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-provider-operation-result-application-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-provider-operation-result-application-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-verified-capture-application-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-verified-capture-application-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payment-clearing-advance-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payment-clearing-advance-uow.integration.ts`

**Steps:**

- [ ] RED: each adapter must `satisfies` its exact domain port; no local interface or generic `transact(callback)` is allowed.
- [ ] RED: two concurrent intent creations for the same economic source yield one success and one typed replay/conflict without duplicate rows.
- [ ] RED: caller source-set prechecks and `expectedSourceUniquenessVersion` are advisory conflict detection only. PostgreSQL unique `(purpose, source_id)` is authority; a replay returns the existing receipt only after every immutable intent field matches exactly.
- [ ] RED: provider-operation creation locks provider binding and source-chain head, applies expected version, writes the pending operation/artifact and IDs-only outbox event in one transaction.
- [ ] RED: provider-operation source preserves exact `{ economicIntentId, economicSessionId, providerAccount }` correlation. Session is required for checkout, card setup and saved-card charge and nullable only for refund/void; schema checks and row codecs enforce that matrix.
- [ ] RED: provider-result application binds verified evidence to exact provider account/operation/request digest and issues a persistence verified-result receipt. It cannot set captured state or write capture/journal/wallet rows. Ambiguous transport errors cannot produce a definitive receipt or economics.
- [ ] RED: verified capture application accepts only that persistence-issued receipt, rechecks provider triple + economic intent + conditional session + operation + request digest, then writes captured state, journal, payable source lots, wallet revision, link proof, commit receipt and outbox atomically. Inject a failure after every write boundary and prove rollback leaves zero partial economics.
- [ ] RED: duplicate and out-of-order capture facts cannot over-capture or emit a second outbox event. A later contradictory provider fact is quarantined, not overwritten.
- [ ] RED: clearing advance accepts only the exact discriminated and monotonic evidence chain `unmatched -> settlement_seen -> provider_matched -> bank_matched`: `settlement_seen` loads `SettlementBatchIngestionCommitReceiptRef` and the bound `ProviderSettlementEntryKey`; `provider_matched` loads `SettlementPaymentMatchCommitReceiptRef`; `bank_matched` loads both `BankCashMatchCommitReceiptRef` and `MerchantPayoutPaymentInclusionCommitReceiptRef`. In the same transaction, revalidate provider-account triple, economic payment, captured provider payment ID, external source ID, amount/currency, aggregate payout identity, bank match target, predecessor clearing state/version and both nominal receipts. Reject skipped states, substituted receipt kinds, independently supplied identifiers, a payment line from another payout and any one-authority attempt to reach `bank_matched`.
- [ ] GREEN: implement adapters with explicit SQL transaction scope, stable lock order, typed unique/CAS error translation and persistence-issued result receipts.
- [ ] REFACTOR: factor only mechanical row decoding/error classification. Keep capability lock sets and transactions visible in each adapter.

**Acceptance:** Payment creation, provider intent/result, capture economics and clearing are individually idempotent. Only the verified-capture UoW may cross from a persisted provider result into captured state and economics, and that crossing is one atomic transaction without a generic repository bag.

### Task 6: Add refunds, chargebacks and funding-reservation persistence

**Files:**

- Create: `packages/db/src/schema/finance/refunds.schema.ts`
- Create: `packages/db/src/schema/finance/chargebacks.schema.ts`
- Remove after cutover: `packages/db/src/schema/finance/payment-reversal-case-reviews.schema.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-refund-approval-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-refund-approval-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-refund-result-application-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-refund-result-application-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-chargeback-fact-application-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-chargeback-fact-application-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-chargeback-resolution-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-chargeback-resolution-uow.integration.ts`

**Steps:**

- [ ] Contract gate: re-run the exact live `refund-approval-uow.ts`, `refund-result-application-uow.ts`, `chargeback-fact-application-uow.ts` and `chargeback-resolution-uow.ts` contract tests. Implement those direct imports only; do not create local DTOs.
- [ ] RED: cumulative refund target cannot exceed capture and each partial refund persists only the deterministic delta allocation. Concurrent partial refunds serialize on the root/lot locks.
- [ ] RED: refund approval consumes exact still-payable lots into refund-pending, records already-paid/in-flight/platform components and funding reservations, then writes a provider operation/outbox only when the whole delta is covered.
- [ ] RED: definitive success/failure consumes/releases each reservation exactly once; unknown remains processing. A late duplicate provider fact is a replay.
- [ ] RED: chargeback principal opens from exact provider evidence independently of provider fee. Fee rows require separate immutable evidence and post to platform expense.
- [ ] RED: chargeback freeze/position/allocation races against payout creation/processing and refund approval. Only one global-lock-order result may commit; no source lot is consumed twice.
- [ ] RED: won/lost/recovery history is cumulative and append-only. Previously paid principal is not retroactively removed from a historical payout.
- [ ] GREEN: implement normalized aggregate heads, position history, source allocations, funding reservations, provider facts and capability adapters using the wallet/journal commit helper.
- [ ] REFACTOR: keep unsupported bridge-to-paid collection/loss-recovery policies fail-closed; do not reuse generic correction or chargeback recovery sources.

**Acceptance:** Partial refunds are rounding-stable to 100%, chargeback principal and fee remain separate, and payout/refund/chargeback races cannot double-use payable.

### Task 7: Add manual payout, immutable beneficiary snapshot and bank exposure persistence

**Files:**

- Replace: `packages/db/src/schema/finance/payouts.schema.ts`
- Create: `packages/db/src/schema/finance/bank-liquidity.schema.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-request-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-request-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-review-approval-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-review-approval-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-manual-execution-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-manual-execution-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-paid-confirmation-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-paid-confirmation-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-bank-return-application-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-bank-return-application-uow.integration.ts`

**Steps:**

- [ ] Contract gate: re-run the exact live payout port contracts listed under Interfaces and Dependencies. Keep request, review/approval, start-manual-processing, paid-confirmation, post-paid bank return and definitive no-transfer transactions separate.
- [ ] RED: payout methods accept only approved manual destination kinds and version immutable details. Sensitive values are encrypted/vault-backed; request snapshots retain redacted display and fingerprint, not mutable live fields.
- [ ] RED: changing destination/version invalidates prior approval. One actor cannot satisfy maker and checker fields for the same request.
- [ ] RED: request creation locks wallet/lots, fixes the immutable amount and exact allocations, moves them to payout-pending and increments one wallet revision.
- [ ] RED: approval requires a current eligible cash-pool liquidity snapshot, creates exactly one exposure per payout and CAS-advances the pool/currency liquidity head. Missing/stale/ambiguous bank evidence fails before state change.
- [ ] RED: `processing_manual` records executor/start evidence but no paid journal. `paid` requires unique bank reference, bank time and immutable proof artifact, consumes exact payout lots, posts outbound clearing and advances exposure atomically.
- [ ] RED: `PayoutBankReturnApplicationUnitOfWork` accepts only a returned-credit statement/bank-match receipt for an already confirmed paid payout. It preserves immutable paid history, advances the exact exposure, posts the bank return and creates a new evidence-linked reserved payable lot atomically. It cannot represent a pre-transfer/no-debit outcome.
- [ ] RED: a contradictory paid/no-transfer fact is quarantined; it cannot post both outcomes or pay twice.
- [ ] GREEN: implement normalized methods/versions/request head/history/allocations/approvals/evidence/bridge rows and exact capability adapters.
- [ ] REFACTOR: remove `arc_pay_provider` from astrologer payout method values. ArcPay merchant payout facts belong only to settlement tables.

**Acceptance:** Manual payout money cannot change from request through payment, bank evidence is mandatory, approval is invalidated by destination mutation and ArcPay is not an astrologer payout rail.

### Task 8: Add cash pools, liquidity snapshots, statement rows and bank matching

**Files:**

- Create: `packages/db/src/schema/finance/bank-cash.schema.ts`
- Modify: `packages/db/src/schema/finance/bank-liquidity.schema.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-bank-statement-ingestion-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-bank-statement-ingestion-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-bank-cash-match-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-bank-cash-match-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-bank-liquidity-snapshot-adoption-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-bank-liquidity-snapshot-adoption-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-cash-pool-directory-bootstrap.ts`
- Create: `packages/db/src/adapters/finance/drizzle-cash-pool-directory-bootstrap.integration.ts`

**Steps:**

- [ ] RED: cash-pool directory requires one exact bank account/statement source and currency; overlapping active source identity is rejected. No directory row contains a balance.
- [ ] RED: `CashPoolDirectoryBootstrapPort` can ensure only the reviewed reference row and returns `monetaryInitialization = reference_only_zero` with no journal transaction. It cannot accept or derive an amount.
- [ ] RED: liquidity snapshots require `balance_basis = unrestricted_available`, `as_of`, expiry, immutable evidence/checkpoint and exact pool/currency. A bare operator number remains ineligible evidence.
- [ ] RED: `BankLiquiditySnapshotAdoptionUnitOfWork` locks the pool/currency head, re-evaluates all open exposures and coverage, applies expected revision and adopts only a verified eligible snapshot atomically.
- [ ] RED: one payout exposure per payout, valid state transitions and unique exposure/snapshot/statement coverage edges. Ambiguous inclusion blocks approval.
- [ ] RED: statement import hashes exact source bytes into the encrypted private artifact boundary, deduplicates import and rows by pool + source statement ID + source row ID, preserves only minimized signed amount/direction/reference fields losslessly and rejects mutation/raw-payload read-model exposure.
- [ ] RED: bank cash match locks the pool/currency head and loads the exact statement-ingestion receipt plus the discriminated match authority. For merchant settlement it loads `MerchantPayoutConfirmationCommitReceiptRef`; for manual payout it loads the paid-confirmation receipt; for suspense it loads the versioned classification rule. It posts cash once, advances only its bank coverage/exposure state and writes the nominal `BankCashMatchCommitReceiptRef` plus outbox atomically; it does not mutate the economic payment clearing projection in this transaction.
- [ ] RED: every launch direct match consumes the complete signed statement row. A merchant credit must equal one ArcPay payout's exact net amount/currency and bind its `payout_id`, wire ID and bank reference; it must not target a captured payment. A manual debit must equal one payout request's immutable paid amount/currency and unique transfer reference. Unknown rows are classified in full to directional suspense; partial or remainder allocation is rejected rather than guessed.
- [ ] RED: after a merchant-settlement cash match commits, `PaymentClearingAdvanceUnitOfWork` separately consumes its persisted `BankCashMatchCommitReceiptRef` together with the exact sealed payout-statement `MerchantPayoutPaymentInclusionCommitReceiptRef` to advance `provider_matched -> bank_matched`. A crash between those commits leaves recoverable evidence and a still-`provider_matched` clearing head; retry may advance the head once but must never post bank cash again.
- [ ] RED: duplicate row replay produces no second journal; unknown debit/credit goes to typed suspense. Later reclassification moves suspense without changing bank cash twice.
- [ ] RED: compete payout approval, newer snapshot adoption and statement match across database sessions; prove CAS/lock order prevents double-counted liquidity.
- [ ] GREEN: implement bank directories, heads, snapshots, imports/rows, exposures, coverage, matches/exceptions and the two exact domain UoWs.
- [ ] REFACTOR: provider settlement and bank statement imports share artifact primitives only; they do not share cursor, natural identity or semantic match tables.

**Acceptance:** A statement fact is the only authority that changes `bank_cash`; snapshots/exposures cannot manufacture cash or double-subtract an already reflected debit. Merchant clearing reaches `bank_matched` only by replay-safe consumption of the already persisted bank-cash-match receipt, never from settlement evidence alone.

### Task 9: Add restart-safe, lossless ArcPay settlement persistence

**Files:**

- Replace: `packages/db/src/schema/finance/reconciliation.schema.ts`
- Create: `packages/db/src/schema/finance/settlement.schema.ts`
- Modify: `packages/db/src/schema/finance/relations.schema.ts`
- Modify: `packages/db/src/schema/finance/finance.schema.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-settlement-batch-ingestion-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-settlement-batch-ingestion-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-settlement-payment-match-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-settlement-payment-match-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-merchant-payout-confirmation-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-merchant-payout-confirmation-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-merchant-payout-statement-ingestion-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-merchant-payout-statement-ingestion-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/arc-pay-payout-statement-decoder-contract.test.ts`
- Create: `packages/db/src/adapters/finance/drizzle-settlement-cursor-lease-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-settlement-cursor-lease-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/arc-pay-settlement-decoder-contract.test.ts`
- Dependency, separately owned provider package/file: the ArcPay raw-response decoder selected by the bounded spike

**Steps:**

- [ ] RED: cursor uniqueness is exact provider triple + stream. Claim/renew/release uses PostgreSQL `clock_timestamp()`, monotonic fencing token and expected-version CAS; a stale worker cannot checkpoint.
- [ ] RED: page checkpoint unique key is `(settlement_cursor_id, window_generation, checkpoint_identity)`. Canonical checkpoint identity includes the nullable provider page cursor, so first-page duplicate and A -> B -> A cycle both fail deterministically.
- [ ] RED: crash after raw page storage, after entry insert and before cursor advance. Retry must resume without loss/duplication and commit page entries + checkpoint + next cursor atomically.
- [ ] RED: a separately sealed ArcPay payout statement consumes the exact completed payout batch receipt, rebinds payout/wire/net/currency to the batch page's aggregate row, adds the documented bank reference, and persists every bounded documented payment line (`payment_id`, `external_id`, amount, fee) with line ordinal/digest. Duplicate payment lines, cross-payout substitution, truncated/over-budget files, header mismatches and mutation fail closed. The database issues one nominal statement receipt plus one nominal inclusion receipt per exact line; no inferred date/range/arithmetic match may create either.
- [ ] RED: `MerchantPayoutConfirmationUnitOfWork` consumes only that nominal statement-ingestion receipt, exact cash pool, expected provider-position revision and resolved operation envelope. It creates one persistence-issued `MerchantPayoutConfirmationCommitReceiptRef` bound to provider identity, `payout_id`, bank payout/wire ID, statement bank reference, net amount/currency and target cash pool. The same transaction posts `arc_to_bank_clearing -> arc_provider_clearing`; it does not post `bank_cash`. A payout API row or per-payment receipt alone is structurally inadmissible as bank-credit authority.
- [ ] RED: entry uniqueness is exact provider identity + provider `entry_id`. Preserve every documented required/optional field as canonical string/null, including signed min/max int64 values and opaque unknown strings. Do not invent `payout_status` on a ledger entry.
- [ ] RED: merchant payout history uses its own table/model and cannot FK/map to astrologer payout requests.
- [ ] RED decoder contract: hash exact raw bytes before parse and seal them through the encrypted private artifact boundary; reject over configured byte budget before parse; reject UTF-8/JSON errors, duplicate object keys, unsafe materialized numbers, forbidden card fields, non-canonical/out-of-range `int64` and raw digest mismatch. No raw payload enters normalized settlement rows/logs.
- [x] Run the bounded Node 24 decoder spike. Selected native `JSON.parse` source text plus `@humanwhocodes/momoa@3.3.10`; rejected `lossless-json@4.3.0` because identical duplicate keys are accepted. Package integrity and bounded measurements are recorded in the Decision Log.
- [ ] GREEN: implement normalized cursor/window/lease/page/checkpoint/entry/merchant-payout/match/exception schema and the two exact UoWs. Provider fetch/decoding remains outside transaction; ingestion accepts only a decoder-issued verified immutable page bundle whose provider triple, stream, window, page cursor and decoded-entry digest are bound to the exact raw artifact digest. The UoW recomputes/rechecks those bindings before persistence; it never accepts an independently composable artifact ref plus entry array.
- [ ] GREEN: payment match accepts only a versioned sandbox-proven correlation rule and exact evidence. Unknown entry combinations create an exception without economic effect.
- [ ] REFACTOR: keep online cursor/head reads bounded; retain immutable page/entry history for reconciliation.

**Acceptance:** Worker restart, duplicate pages, pagination cycles, stale leases and values beyond `2^53` cannot lose precision or duplicate economics; duplicate JSON keys fail closed.

### Task 10: Implement payout-wide definitive-no-transfer and bridge resolution

**Files:**

- Modify: `packages/db/src/schema/finance/payouts.schema.ts`
- Modify: `packages/db/src/schema/finance/refunds.schema.ts`
- Modify: `packages/db/src/schema/finance/bank-liquidity.schema.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-definitive-no-transfer-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-definitive-no-transfer-uow.integration.ts`

**Steps:**

- [ ] RED: construct a payout with multiple active refund bridges and an unaffected remainder. A per-bridge or partial input must be rejected; the UoW loads the complete active bridge inventory itself.
- [ ] RED: definitive-no-transfer authority is an immutable digest-bound verified bank artifact scoped to exact payout request, cash pool, exposure, amount/currency and observed outcome. A string reference, operator assertion or evidence for another pool/exposure cannot release funds.
- [ ] RED: read immutable allocation IDs without authority, then lock aggregate roots, wallet, all source lots, all active bridges, payout request, liquidity head and exposure in the exact global order. Re-check every expected version/inventory after locking. A concurrent refund/chargeback/paid confirmation cannot cross the definitive-no-transfer transition.
- [ ] RED: definitive no-transfer closes every active bridge, consumes/reclassifies affected payout-pending lots, releases only the true unbridged remainder to recorded sources, closes the bank exposure, increments one wallet/liquidity revision and commits exact receipts/journals/outbox together.
- [ ] RED: inject a failure between each write and prove full rollback. Replaying the same evidence returns the existing persistence receipt; contradictory later paid evidence quarantines.
- [ ] GREEN: implement `PayoutDefinitiveNoTransferUnitOfWork` directly against normalized rows. Do not call a pure per-bridge transition in separate transactions.
- [ ] REFACTOR: keep the complete-inventory query and coverage assertion visible/auditable; do not hide it in a generic repository helper.

**Acceptance:** A payout cannot release money early or strand a bridge because the transaction proves and resolves the entire active bridge inventory.

### Task 11: Add reconstruction, outbox and normalized finance audit bindings

**Files:**

- Create: `packages/db/src/schema/finance/audit.schema.ts`
- Modify only with owner coordination if needed: `packages/db/src/schema/outbox/outbox-events.schema.ts`
- Modify only with owner coordination if needed: `packages/db/src/schema/audit-log/audit-log.schema.ts`
- Create: `packages/db/src/adapters/finance/drizzle-finance-reconciliation-reader.ts`
- Create: `packages/db/src/adapters/finance/drizzle-finance-reconciliation-reader.integration.ts`
- Create: `packages/db/src/adapters/finance/drizzle-finance-reconciliation-uow.ts`
- Create: `packages/db/src/adapters/finance/drizzle-finance-reconciliation-uow.integration.ts`
- Create: `packages/db/src/adapters/finance/finance-outbox-writer.ts`
- Create: `packages/db/src/adapters/finance/finance-outbox-writer.test.ts`
- Create: `packages/db/src/adapters/finance/finance-audit-writer.ts`
- Create: `packages/db/src/adapters/finance/finance-audit-writer.integration.ts`

**Steps:**

- [ ] RED: rebuild wallet, clearing and bank-liquidity heads independently from append-only journal/lot/payment/statement/exposure history and compare every currency/revision/source identity.
- [ ] RED: corrupt a head in an isolated integration transaction and prove reconciliation reports a typed mismatch; it must not silently repair during an online request.
- [ ] RED: each mutating UoW writes exactly one deterministic IDs-only outbox record in the same transaction. Rollback removes both business rows and outbox; replay finds the original event.
- [ ] RED: finance audit fact is one-to-one with shared audit envelope and stores actor, permission, request ID, action/target, before/after digest, evidence fingerprint and typed monetary fields where applicable. It stores only redacted destination fingerprint, never full sensitive destination.
- [ ] GREEN: implement read-only reconstruction queries/checkpoints and focused outbox/audit writers called inside capability UoWs.
- [ ] GREEN: add indexes for reconciliation lag, unmatched provider/bank facts, aged suspense, unknown operations, stale inbox/settlement leases and open payout exposures.
- [ ] REFACTOR: keep online heads and reconciliation history in distinct APIs. Reconciliation may scan history in bounded pages; request paths may not.

**Acceptance:** Current state has an independent audit/rebuild proof, and every committed financial mutation has same-transaction outbox and normalized audit evidence where an actor is involved.

### Task 12: Remove legacy finance truth and complete the atomic consumer cutover gate

**Files:**

- Delete after replacements are green: legacy schema files superseded in Tasks 1-11
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-captured-sale-unit-of-work.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-finance-command-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-ledger-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-order-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-payment-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-payment-reversal-case-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-payment-reversal-unit-of-work.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-payout-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-reconciliation-store.ts`
- Delete after replacements are green: `packages/db/src/adapters/finance/drizzle-terminal-payment-unit-of-work.ts`
- Modify: `packages/db/src/schema/finance/index.ts`
- Modify: `packages/db/src/adapters/finance/index.ts`
- Modify with owner coordination: all exact app/worker/fixture consumer paths identified in Task 0

**Steps:**

- [ ] Require the orchestrator to assign and complete each application consumer cutover against the new domain ports. Persistence implementation must not disguise the old store interfaces as compatibility wrappers.
- [ ] RED: add an architecture test that rejects legacy table names/exports, old adapter exports, `finance_v2` names, duplicate wallet/ledger/reconciliation truth and old commission override authority.
- [ ] Remove superseded schema/adapters/tests only after all consumers have an approved replacement in the same shared-main state.
- [ ] Update root/module barrels minimally. Do not wildcard-export internal row helpers or trusted receipt constructors.
- [ ] Run `rg` for every deleted symbol/table and inspect each remaining match as a deliberate doc/history reference or failure.
- [ ] Run package/app typechecks before baseline generation. If a consumer remains, Task 13 is blocked; do not restore a legacy fallback merely to turn typecheck green.

**Commands:**

```bash
rg -n "createDrizzle(CapturedSale|FinanceCommand|Ledger|Order|Payment|Payout|Reconciliation|TerminalPayment|PaymentReversal)|wallet_balance_read_models|reconciliation_records|payment_provider_events" apps packages --glob '*.ts' --glob '*.tsx'
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/public-api typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/admin-api typecheck
pnpm --filter @elevenhouse/payment-worker typecheck
```

If a package filter name differs, read that package's current `package.json` and use its real name; do not guess a replacement command.

**Acceptance:** One finance schema and one set of domain-port adapters remain; all compile-time consumers have crossed over; no compatibility/parallel truth remains before baseline generation.

### Task 13: Safely regenerate one combined shared baseline

**Files:**

- Modify only now: `packages/db/src/schema/index.ts`
- Modify only now if required: `packages/db/src/adapters/index.ts`, `packages/db/src/index.ts`
- Create with owner coordination: `packages/db/scripts/augment-finance-baseline.ts`
- Create with owner coordination: `packages/db/scripts/augment-finance-baseline.test.ts`
- Create with owner coordination: `packages/db/scripts/regenerate-current-baseline.ts`
- Create with owner coordination: `packages/db/scripts/regenerate-current-baseline.test.ts`
- Modify with owner coordination: `packages/db/package.json`
- Modify with owners: `packages/db/scripts/production-baseline-plan.ts`
- Modify with owners: `packages/db/scripts/production-baseline-plan.test.ts`
- Modify with owners: `packages/db/scripts/reconcile-production-baseline.ts`
- Modify generated: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify generated: `packages/db/drizzle/meta/0000_snapshot.json`
- Modify generated: `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/db/src/schema.test.ts`
- Create: `packages/db/src/finance-baseline-integrity.integration.ts`

**Precondition:** Every schema/baseline owner has reported a stable combined state, Task 12 is green and no unreviewed path overlap remains.

**Steps:**

- [ ] Capture fresh branch/status/cached diff/scoped diffs and SHA-256 for migration artifacts. Compare with Task 0 only to identify intervening work; never restore the old hashes.
- [ ] Re-read all current schema exports and all `db:generate` augmentation scripts. Run their focused tests before generation.
- [ ] Implement and test `regenerate-current-baseline.ts` as the only single-baseline preparation boundary. It resolves an exact allowlist of the current SQL, snapshot and journal files; requires regular files (not symlinks/reparse points); prints their hashes/count in dry-run; requires the caller to echo the resulting manifest digest for apply; copies exact current bytes to a fresh private temporary directory; removes only those three allowlisted generated files; invokes `drizzle-kit generate --config drizzle.config.ts --name sticky_rictor` and then the ordered scheduling, Flows, consent/AI, chart-job and Finance augmenters; verifies exactly one `0000_sticky_rictor` SQL/snapshot/journal result; and restores the exact backup on any generation/augmentation/verification failure. It never deletes `packages/db/drizzle`, `meta`, `.gitkeep`, an unlisted migration or a directory.
- [ ] Replace the `@elevenhouse/db` `db:generate` script with `tsx scripts/regenerate-current-baseline.ts`; do not leave a second public raw generator chain that can append `0001` or bypass the manifest guard. The wrapper must refuse if the live manifest changes between dry-run and apply, which protects concurrent edits.
- [ ] Add finance schema exports only after legacy removal. Add reviewed finance immutability/deferred-balance/coverage trigger SQL through `augment-finance-baseline.ts`, place that deterministic augmenter last in the wrapper's explicit ordered list, and test idempotent insertion/duplicate-definition rejection. Do not hand-edit generated SQL after the final generation command.
- [ ] Run `pnpm db:generate` once against the stabilized combined schema. Do not create an incremental `ALTER` migration.
- [ ] Inspect generated SQL/snapshot/journal diff. Prove it contains current Flows, consent/AI, chart-job, scheduling and every other concurrent shared schema change as well as finance.
- [ ] RED/GREEN baseline tests assert every finance table, FK, check, unique/partial unique index, deferred trigger, immutability trigger and IDs-only outbox/audit binding exists in SQL/snapshot.
- [ ] Assert removed legacy tables do not exist in generated SQL. There is no migration/backfill/opening-balance DDL.
- [ ] Update baseline hash/created-at and approved reconciliation metadata only through the current shared baseline protocol and its owners. Unknown production history must still fail closed; ADR 0012 production reset remains separate.
- [ ] Run generator a second time only as a determinism check after recording the first diff; require no semantic diff. If it changes artifacts again, stop and fix nondeterminism.

**Commands:**

```bash
set -euo pipefail
git status --short
git diff --cached --name-status
git diff -- packages/db/src/schema packages/db/scripts packages/db/drizzle
shasum -a 256 packages/db/drizzle/0000_sticky_rictor.sql packages/db/drizzle/meta/0000_snapshot.json packages/db/drizzle/meta/_journal.json
pnpm exec vitest run packages/db/scripts/augment-scheduling-baseline.test.ts packages/db/scripts/augment-flows-baseline.test.ts packages/db/scripts/augment-consent-ai-baseline.test.ts packages/db/scripts/augment-chart-jobs-baseline.test.ts packages/db/scripts/augment-finance-baseline.test.ts packages/db/scripts/regenerate-current-baseline.test.ts packages/db/scripts/production-baseline-plan.test.ts
finance_baseline_manifest="$(pnpm --filter @elevenhouse/db exec tsx scripts/regenerate-current-baseline.ts --dry-run --print-manifest-digest)"
test -n "${finance_baseline_manifest:?missing baseline manifest digest}"
FINANCE_EXPECTED_BASELINE_MANIFEST_DIGEST="${finance_baseline_manifest:?}" pnpm db:generate
git diff -- packages/db/drizzle packages/db/scripts/production-baseline-plan.ts packages/db/scripts/reconcile-production-baseline.ts
pnpm exec vitest run packages/db/src/schema.test.ts packages/db/src/schema/finance/finance.schema.test.ts packages/db/src/schema/finance/journal-integrity.test.ts
```

**Acceptance:** A single deterministic baseline represents the entire stabilized shared schema; finance legacy truth and opening/backfill logic are absent; all finance invariants are visible in SQL and snapshot.

### Task 14: Rehearse exact-zero baseline on an explicitly authorized local target

This task is intentionally not executable during initial implementation. It requires a new explicit authorization for destructive local DB work and an already-running local ElevenHouse PostgreSQL container. Production is categorically excluded.

**Files:**

- Modify with owner coordination: `packages/db/scripts/reset.ts`
- Create with owner coordination: `packages/db/scripts/reset.test.ts`
- Create: `packages/db/scripts/finance-zero-baseline-verification.ts`
- Create: `packages/db/scripts/finance-zero-baseline-verification.test.ts`
- Modify with owner coordination: `packages/db/scripts/seed.ts`
- Create: `packages/db/scripts/finance-cash-pool-seed-data.ts`
- Create: `packages/db/scripts/finance-cash-pool-seed-data.test.ts`
- Modify: `packages/db/src/production-deploy-seed.test.ts`
- Modify: `packages/db/src/production-baseline-reconciliation.integration.ts`
- Modify: `packages/db/src/finance-baseline-integrity.integration.ts`

**Steps before any reset:**

- [ ] Obtain explicit user/operations authority for destructive local reset.
- [ ] Inspect `docker compose ps postgres`, resolve exactly one container, inspect its image/project/service labels and published `5432/tcp` port, and verify it is not a symlinked/remote context or production host.
- [ ] Require `NODE_ENV != production`, local host, approved user `elevenhouse`, exact database `elevenhouse` or a separately approved disposable `elevenhouse_test`, explicit observed port, exact compose working-directory label, service label, image and container ID. Extend `reset.ts` and `reset.test.ts` so every expected identity is mandatory and rechecked immediately before connecting; the script fails before DDL if any value is absent/mismatched.
- [ ] Do not run the legacy finance inventory or inspect historical finance rows as a reset gate. Prove the selected target only from exact PostgreSQL/Docker identity, then rely on the user's explicit pre-launch/disposable-data authority; no old balance or row count is imported, reconciled or used to create an opening position.
- [ ] Run reset/migrate/seed only against the exact observed local URL. Stop on the first failure; never retry with a broader target.

**Zero-seed contract:**

- [ ] `finance-cash-pool-seed-data.ts` is typed so entries can contain only reviewed directory identity and non-monetary routing/fingerprint fields. It has no amount, balance, snapshot, journal, wallet or opening-control field. If operations has not supplied an approved cash-pool identity, the reviewed array is empty.
- [ ] `seed.ts` may upsert those exact directory rows. It must not create finance accounts, journal transactions/entries, wallet heads/lots, payments, provider operations, refunds, chargebacks, payout requests, exposures, settlement rows, bank statements, liquidity snapshots or matches.
- [ ] Verification asserts zero rows in every monetary/operational finance table and zero journal trial balance after seed. Cash-pool directory count must equal the reviewed seed array exactly.
- [ ] First real `bank_cash` movement remains impossible without a deduplicated statement row and journal source identity.

**Validated command shape after authority:**

```bash
set -euo pipefail
finance_repo_root="$(pwd -P)"
test "${finance_repo_root:?}" = "/Users/anton/Finext/ElevenHouse"
finance_docker_context="$(docker context show)"
test -n "${finance_docker_context:?missing Docker context}"
finance_docker_host="$(docker context inspect "${finance_docker_context:?}" --format '{{ .Endpoints.docker.Host }}')"
case "${finance_docker_host:?}" in (unix://*) ;; (*) exit 1;; esac
finance_container_count="$(docker compose ps -q postgres | sed '/^$/d' | wc -l | tr -d ' ')"
test "${finance_container_count:?}" = "1"
finance_container_id="$(docker compose ps -q postgres)"
test -n "${finance_container_id:?missing ElevenHouse postgres container id}"
test "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$finance_container_id")" = "postgres"
test "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$finance_container_id")" = "${finance_repo_root:?}"
test "$(docker inspect --format '{{.Config.Image}}' "$finance_container_id")" = "postgres:17-alpine"
docker port "$finance_container_id" 5432/tcp
finance_port_line="$(docker compose port postgres 5432)"
finance_port="${finance_port_line##*:}"
case "$finance_port" in (*[!0-9]*|'') exit 1;; esac
finance_database_url="postgresql://elevenhouse:elevenhouse@127.0.0.1:${finance_port:?}/elevenhouse"
ELEVENHOUSE_EXPECTED_LOCAL_POSTGRES_CONTAINER_ID="${finance_container_id:?}" ELEVENHOUSE_EXPECTED_LOCAL_POSTGRES_PORT="${finance_port:?}" ELEVENHOUSE_EXPECTED_LOCAL_DATABASE_NAME="elevenhouse" NODE_ENV=development DATABASE_URL="${finance_database_url:?}" pnpm db:reset
NODE_ENV=development DATABASE_URL="${finance_database_url:?}" INTEGRATION_DATABASE_URL="${finance_database_url:?}" pnpm exec tsx packages/db/scripts/finance-zero-baseline-verification.ts
NODE_ENV=development DATABASE_URL="${finance_database_url:?}" INTEGRATION_DATABASE_URL="${finance_database_url:?}" pnpm test:integration packages/db/src/finance-baseline-integrity.integration.ts packages/db/src/production-baseline-reconciliation.integration.ts
```

Run this only after visually confirming the resolved container ID/labels/port and the script's exact target report. The destructive command and all producing validations remain in the same foreground shell with `set -euo pipefail`.

**Acceptance:** Fresh install and repeated seed are deterministic; the trial balance and every monetary finance table are exactly zero; only the reviewed cash-pool directory identity may exist. No production reset has occurred.

### Task 15: Run affected-surface, concurrency, recovery and independent review gates

**Files:**

- All owned and coordinated files above
- Update: this plan's `Progress`, `Surprises and Discoveries`, `Decision Log`, `Outcomes and Retrospective`

**Steps:**

- [ ] Run every focused schema/unit test, then every finance DB integration test on the exact authorized local target.
- [ ] Run concurrency suites for duplicate captures, partial refunds, chargeback-vs-payout, payout approval-vs-bank match, wallet CAS, stale leases/fences and settlement page cycles.
- [ ] Run fault-injection/recovery suites for failure after each write boundary, worker restart, duplicate/out-of-order provider facts and unknown-result reconciliation.
- [ ] Run security suites for artifact size/digest, duplicate JSON keys, unsafe int64, credential/raw-card exclusion, immutable evidence, audit redaction and exact provider/cash-pool scoping.
- [ ] Run reconstruction and trial-balance checks independently from online heads.
- [ ] Run DB package build/typecheck, affected app/worker typechecks, root lint for touched files and repository tests for the affected dependency surface.
- [ ] Request independent schema/ledger, concurrency/idempotency, security/provider and operations/baseline reviews. Resolve every P0/P1 before closure.
- [ ] Inspect `git diff --check`, scoped diff, shared staged diff and status. Report unrelated changes without staging/committing them.

**Commands:**

```bash
pnpm exec vitest run packages/db/src/schema/finance packages/db/src/adapters/finance packages/db/scripts/finance-cash-pool-seed-data.test.ts packages/db/scripts/finance-zero-baseline-verification.test.ts
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/finance packages/db/src/finance-baseline-integrity.integration.ts
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/db build
pnpm exec eslint packages/db/src/schema/finance packages/db/src/adapters/finance packages/db/scripts/finance-*.ts
pnpm typecheck
pnpm test
git diff --check
git diff --stat -- packages/db docs/superpowers/plans/2026-08-04-finance-persistence-and-adapters.md
git diff -- packages/db docs/superpowers/plans/2026-08-04-finance-persistence-and-adapters.md
git diff --cached --name-status
git status --short
```

Do not claim full repository green if unrelated concurrent work prevents a command from completing. Record exact command, exit code and whether the failure is owned, pre-existing or externally blocked.

**Acceptance:** All persistence invariants have current command evidence, independent reconstruction agrees with online heads, concurrency/fault tests show one economic effect, reviewers report no open P0/P1 and the generated baseline remains one combined shared truth.

---

## Validation and Acceptance Matrix

| Claim | Required evidence |
| --- | --- |
| Exact provider identity | Unique/FK/immutability integration tests across account identity versions and cross-account collision attempts |
| Idempotent provider operations | Concurrent same-key tests, source-chain CAS, unknown-result replay and IDs-only outbox inspection |
| Durable webhook ingress | Raw-byte artifact/digest, signature quarantine, transport + semantic dedupe, crash checkpoint and stale-fence tests |
| Balanced immutable journal | Deferred unbalanced/unsealed commit failures, seal mutation/delete/truncate failures and strict proof mirror tests |
| Correct wallet availability | Wallet/lot concurrency, no-double-consumption, exact revision, rebuild and journal-link receipt tests |
| Correct refunds/chargebacks | Cumulative/delta allocation, principal-vs-fee separation, payout race and rollback tests |
| Safe manual payouts | Immutable destination snapshot, maker-checker, liquidity/exposure, required paid evidence, no-transfer contradiction tests |
| Bank cash authority | Statement natural-key dedupe, suspense/reclassification, snapshot inclusion, cash-only-from-statement tests and crash/retry proof between bank-cash-match receipt commit and the separate `bank_matched` clearing advance |
| Restart-safe settlement | DB-clock lease/fence, A-B-A checkpoint uniqueness, raw digest, lossless int64, duplicate-key rejection and crash resume tests |
| Online/history separation | Request-path contract tests plus independent append-only reconstruction comparison |
| Zero launch | Fresh authorized local install, repeated seed, zero monetary row counts/trial balance and exact cash-pool directory count |
| One shared baseline | Generated SQL/snapshot checks, no legacy/parallel tables, shared augmentation tests and deterministic re-generation diff |

## Idempotence and Recovery

- Schema work is recoverable before Task 13 because migration artifacts are untouched. Re-run focused tests after every edit group.
- If a unique/CAS test fails, rollback the transaction and re-run the whole capability decision against freshly locked rows. Never continue from a partially mutated in-memory aggregate.
- If provider I/O is ambiguous, retain `provider_unknown`; canonical read/webhook/settlement evidence resolves it. Do not create a replacement operation until the domain's retention/replacement authority permits it.
- If settlement fetch succeeds but checkpoint commit fails, retry the same planned page. Exact raw digest, entry natural keys and checkpoint uniqueness make replay safe.
- If bank statement ingestion fails, retry the same immutable import artifact. Row natural keys make replay safe; no partial match is inferred.
- If bank cash matching commits but clearing advance fails, retain and replay the nominal bank-cash-match receipt together with the exact sealed payout-statement payment-inclusion receipt through `PaymentClearingAdvanceUnitOfWork`. Never re-run cash posting or infer payout membership as a substitute for the failed projection advance.
- If baseline generation collides with concurrent work, stop, retain the new finance source files, re-read the shared combined state and regenerate only after owner coordination. Do not hand-merge generated snapshot JSON or restore prior hashes.
- If an authorized local reset fails, stop immediately. Do not retry with a stronger command, different shell, broader schema target or guessed URL. Inspect the exact failure and obtain new authority if the target or recovery action changes.
- Production reset/recovery is governed by ADR 0012 and a separate deployment runbook. This plan provides no authority to execute it.

## Artifacts and Notes

During execution, retain or link these evidence artifacts without secrets:

- shared-main ownership/collision ledger and before/after migration hashes;
- ArcPay OpenAPI URL/version/hash and selected lossless-decoder spike report;
- generated schema catalog of tables, constraints, indexes, triggers and FKs;
- concurrency/fault-injection test report with exact commands and local target identity;
- zero-baseline verification output and reviewed cash-pool seed identity list/fingerprints;
- reconstruction/trial-balance report;
- independent review findings and resolutions;
- final scoped diff/status report distinguishing owned from unrelated changes.

Never attach raw card data, reusable credential tokens, full payout destinations, provider secrets, database credentials or unredacted webhook/bank artifacts to tests, logs, plan notes or review reports.
