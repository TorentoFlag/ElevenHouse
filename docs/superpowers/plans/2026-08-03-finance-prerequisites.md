# Finance Evidence and Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish exhaustive tariff capability truth, fail-closed launch readiness, supported paid-product fulfillment, read-only financial inventory, and the transaction-authorization boundary required before any new ElevenHouse finance charge or sensitive admin action can be enabled.

**Architecture:** Keep prerequisite decisions as deterministic domain registries and ports. The DB layer may read the legacy finance state but does not change schema in this plan. Identity exposes a provider-neutral finance authorization ceremony; cryptographic WebAuthn verification remains behind an adapter and no sensitive finance command is marked enabled until that adapter, credential persistence, and runtime config are wired and tested.

**Tech Stack:** TypeScript, Vitest, Zod/shared contracts, existing `pg`/Drizzle runtime for read-only inventory, WebAuthn Level 3 contract semantics.

**Parent plan:** `docs/superpowers/plans/2026-08-03-finance-production-contour-master.md`.

**Approved design:** `docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`, especially sections 5.4–5.6, 9.2, 16, 18–20.

## Global Constraints

- Apply every constraint from the parent plan.
- This plan owns no schema or generated migration file. Do not edit `packages/db/src/schema/**`, `packages/db/drizzle/**`, production baseline reconciliation, or `packages/db/package.json`.
- Do not change current feature routes, charge ArcPay, publish a tariff, activate a paid product, enable sensitive admin commands, or pretend the new prerequisite registry itself is enforcement.
- Keep current seed plan commercial values as historical prototype input. Tests must demonstrate why each seed is non-publishable; do not silently repair prices, commissions, or feature promises.
- The capability manifest is one checked-in exhaustive record keyed by the shared contract enum. Do not add a second feature-code list in domain code.
- `availability=live` describes whether the underlying product contour exists. `enforcement=unwired|ready` separately describes whether every listed server/worker operation is gated. A feature is publishable only when both are suitable.
- Empty surface arrays are allowed only with an explicit `unavailableReason`; they must not be filled with imaginary routes/jobs.
- `enforcement` is derived from bidirectional surface declarations, not toggled by hand. It can become `ready` only when every audited surface is declared by exactly one owning module and every declaration resolves to a manifest entry.
- Readiness issues are data with stable machine codes and evidence/version references. An absent requirement is an error, not a default.
- Readiness evidence is loaded through a trusted versioned store port. API callers supply only operation context; they never submit approval/evidence records as command input.
- The financial inventory adapter is read-only and uses one repeatable-read, read-only transaction. It emits facts and discrepancies; it never inserts a balancing row or updates a projection.
- WebAuthn challenge lifetime is at most 300 seconds, user verification is `required`, and the challenge record binds actor, session, action kind, aggregate ID, expected version, canonical payload hash, RP ID, origin, issue/expiry, and single-use state.
- No new third-party WebAuthn package is added in this plan. The task establishes the port and invariant tests; a later Identity adapter task selects and pins the implementation after a focused official-doc/library compatibility review.

---

## Purpose / Big Picture

After this plan, an admin publication use case can ask one deterministic validator whether a tariff is honest, finance entrypoints can ask one readiness resolver whether their external prerequisites exist, order activation can ask one fulfillment registry whether payable release/refund semantics exist, migration operators can produce a read-only inventory with explicit discrepancies, and sensitive finance use cases can require a transaction-bound authorization proof without inventing local OTP semantics.

This plan deliberately does not make payments available. It constructs the gates that later stages must satisfy.

## Context and Existing Code

- Shared feature codes: `packages/contracts/src/platform-billing.ts` exports `platformPlanFeatureCodeValues` and `PlatformPlanFeatureCode`.
- Domain currently duplicates the union in `packages/domain/src/platform-billing/platform-billing-types.ts`.
- Seed plans in `packages/domain/src/platform-billing/platform-plan-seed-data.ts` are active display data and advertise partial/absent capabilities.
- Platform billing currently exposes only `getPlatformBillingOverview`; there is no publish command, resolver, guard, or quota counter.
- Product shape is defined by `packages/domain/src/products/product-types.ts`; current order creation accepts any active non-free product.
- There is no WebAuthn/passkey implementation in current code.
- Existing finance DB tables are sufficient for a legacy inventory but lack target provider-account/cash-pool/source-lot scope; the inventory must label those facts unscoped instead of inventing IDs.

## Interfaces Introduced by This Plan

```ts
type CapabilityAvailability = "live" | "partial" | "absent";
type CapabilityEnforcement = "unwired" | "ready";
type CapabilityExpiryFallback = "read_only" | "unavailable";

type PlatformCapabilityManifestEntry = {
  code: PlatformPlanFeatureCode;
  owner: string;
  availability: CapabilityAvailability;
  enforcement: CapabilityEnforcement;
  expiryFallback: CapabilityExpiryFallback;
  navigationEntries: readonly CapabilitySurfaceRef[];
  frontendRoutes: readonly CapabilitySurfaceRef[];
  readOperations: readonly CapabilitySurfaceRef[];
  mutationOperations: readonly CapabilitySurfaceRef[];
  workerJobs: readonly CapabilitySurfaceRef[];
  requiredCapabilities: readonly PlatformPlanFeatureCode[];
  usageCounter: CapabilityUsageCounterSemantics | null;
  unresolvedOperationMappings: readonly CapabilitySurfaceRef[];
  unavailableReason: string | null;
};

type PlatformPlanPublicationIssue = {
  code: PlatformPlanPublicationIssueCode;
  path: readonly (string | number)[];
  message: string;
};

type FinanceReadinessDecision = {
  ready: boolean;
  missing: readonly FinanceReadinessRequirementCode[];
  evidence: readonly FinanceReadinessEvidenceRef[];
};

type PaidProductFulfillmentDecision =
  | {
      supported: true;
      registryKey: string;
      registryRevision: number;
      holdAnchor: "booking_completed";
      terminalEvidence: PaidProductTerminalEvidence;
      cancellationAllocator: PaidProductCancellationAllocatorRef;
    }
  | { supported: false; code: PaidProductFulfillmentIssueCode };

type FinanceTransactionAuthorizationProof = {
  authorizationId: string;
  actorUserId: string;
  sessionId: string;
  actionKind: FinanceSensitiveActionKind;
  aggregateId: string;
  expectedVersion: number;
  payloadHash: `sha256:${string}`;
  verifiedAt: string;
  expiresAt: string;
  status: "active" | "consumed";
};
```

## Task 1: Exhaustive capability manifest

**Files:**

- Create `packages/domain/src/platform-billing/platform-capability-manifest.test.ts`.
- Create `packages/domain/src/platform-billing/platform-capability-manifest.ts`.
- Modify `packages/domain/src/platform-billing/platform-billing-types.ts` to import/re-export the shared `PlatformPlanFeatureCode` type instead of declaring a duplicate union.
- Modify `packages/domain/src/platform-billing/index.ts` to export the manifest.

- [x] RED: write tests that compare `Object.keys(platformCapabilityManifest)` exactly to `platformPlanFeatureCodeValues`, reject any entry whose `entry.code` differs from its key, and assert the exact audited classifications:
  - live: `engine`, `natal`, `synastry`, `forecast`, `solar`, `matrix`, `numerology`, `hd`, `horar`, `astrocal`, `products`, `refs`;
  - partial: `pdf`, `child`, `calendar`, `crm`, `funnels`, `ai`, `inbox`;
  - absent: `vedic`, `page`, `group`, `aicontent`, `triggers`, `content`, `autopost`, `journal`, `video`, `recordings`, `analytics`, `team`, `whitelabel`, `api`, `priority`.

- [x] RED: assert exact literal, reviewed arrays for every code's navigation entries, frontend routes, read operations, mutation operations, worker jobs, expiry fallback, prerequisites, unresolved mappings and usage-counter semantics. Every surface ref contains a stable ID, owning module, current source path and current route/command/job identifier.
- [x] RED: classify operations by semantic effect rather than HTTP verb. Provider-backed or newly derived work such as Human Design transits and Matrix projection remains a mutation/generation even when the current controller uses `GET`, so expiry `read_only` can never authorize it accidentally.
- [x] RED: model shared physical surfaces once with an explicit capability-selection contract. Generic Calculations operations resolve the owning feature from trusted persisted module/method data (and list operations filter every row); shared PDF/AI operations require the shared capability plus the exact resource owner. A physical route must not be duplicated across feature entries or assigned to a convenient but false owner.
- [x] RED: maintain an exact reviewed exclusion/foundation registry for adjacent surfaces that must not be tariff-gated. It includes shared Clients/BirthData foundations, `/settings`, `/finance`, auth/security/verification, payment/webhook/reconciliation processing, inbound messaging/OAuth/media ingestion, retention/cleanup, hold release and fulfillment of already-paid obligations. Every candidate controller/job surface is therefore either protected once or excluded with a stable reason.
- [x] RED: build an independent audited protected-surface fixture from the current router/controllers/domain command exports/worker processors. Prove bidirectionally that every audited physical surface ID appears exactly once across the feature-owned and shared-surface registries, every feature reference resolves to that registry, every registered surface appears in the fixture, every referenced source path exists, and there are no duplicate stable IDs or unexplained physical route/job collisions. Global unresolved surfaces remain unassigned and separately exact. Import router/worker declarations where they are exported and inspect Nest controller metadata for route/method registration; do not use a source-text grep as the behavioral proof. `enforcement` remains derived as `unwired` because no owning module declares a real guard in this task.
- [x] RED: assert that partial/absent entries have a non-empty `unavailableReason`; `engine` is a prerequisite of chart method keys; `pdf` and `ai` require at least one applicable owning-module capability and never grant it; `astrocartography`, `composite`, and the child-purpose command are explicit unresolved operation mappings that keep publication blocked.
- [x] Run `pnpm test packages/domain/src/platform-billing/platform-capability-manifest.test.ts` and record the expected module-not-found failure.
- [x] GREEN: implement the `satisfies Record<PlatformPlanFeatureCode, PlatformCapabilityManifestEntry>` manifest from the approved audit. Use only exact current navigation/routes/commands/jobs found in the repository, attach quota reserve/commit/release/lock semantics where applicable, and represent absent surfaces as empty arrays plus reason.
- [x] Remove the domain-owned feature union and import/re-export the shared contract type so contract enum and domain manifest cannot drift independently.
- [x] Run the targeted test until green, then run:

  ```bash
  pnpm test packages/contracts/src/platform-billing.test.ts packages/domain/src/platform-billing/platform-capability-manifest.test.ts packages/domain/src/platform-billing/platform-billing-use-cases.test.ts
  pnpm --filter @elevenhouse/domain typecheck
  ```

Observable acceptance: all 34 codes have one honest entry, every audited protected surface is mapped exactly once in both directions, unresolved command mappings are explicit, and no code can become publishable through a hand-edited readiness flag.

## Task 2: Deterministic tariff publication validator

**Files:**

- Create `packages/domain/src/platform-billing/platform-plan-publication.test.ts`.
- Create `packages/domain/src/platform-billing/platform-plan-publication.ts`.
- Modify `packages/domain/src/platform-billing/index.ts`.

- [x] RED: define tests for `collectPlatformPlanPublicationIssues(candidate)` with literal expected issue codes and paths. Cover:
  - duplicate capability;
  - partial or absent capability;
  - live but unwired enforcement;
  - missing prerequisite;
  - shared `pdf`/`ai` without an entitled owning module;
  - `seatsLimit > 1` or unlimited seats while `team` is absent;
  - a finite bookings/AI/automation limit without its capability;
  - a finite bookings/AI/automation limit while the corresponding atomic counter is unavailable;
  - `null` as unlimited without manufacturing a usage counter;
  - deterministic issue order independent of input feature order;
  - the complete ordered literal issue set for each current seed plan, including every partial/absent feature, unwired surface, missing/mismatched quota capability, and unresolved `astrocartography`, `composite`, or child-purpose mapping; none returns publishable.

- [x] Run the targeted test and record the expected missing-export failure.
- [x] GREEN: implement a pure collector plus `assertPlatformPlanPublishable` that throws `PlatformPlanPublicationValidationError` containing the complete stable issue list. Do not stop on the first error.
- [x] Model quota readiness as an explicit checked-in map: `seats` is `structural_only` with maximum 1 until Team exists; bookings, AI requests, and automations are `counter_unavailable` in current code. A later counter task supplies owning-module counter declarations; readiness is derived from exact declaration coverage, not changed as an isolated boolean.
- [x] Run:

  ```bash
  pnpm test packages/domain/src/platform-billing/platform-plan-publication.test.ts packages/domain/src/platform-billing/platform-capability-manifest.test.ts packages/domain/src/platform-billing/platform-billing-use-cases.test.ts
  pnpm --filter @elevenhouse/domain typecheck
  pnpm --filter @elevenhouse/domain build
  ```

Observable acceptance: tariff publication has one fail-closed domain decision and current prototype seeds cannot be commercially published.

## Task 3: Versioned finance readiness matrix

**Files:**

- Create `packages/contracts/src/finance-operations.test.ts`.
- Create `packages/contracts/src/finance-operations.ts`.
- Modify `packages/contracts/src/index.ts`.
- Create `packages/domain/src/finance-readiness/finance-readiness.test.ts`.
- Create `packages/domain/src/finance-readiness/finance-readiness.ts`.
- Create `packages/domain/src/finance-readiness/index.ts`.
- Modify `packages/domain/src/index.ts`.

- [x] RED: define and test one shared `FinanceOperationKind` enum used by readiness and finance authorization. It contains exactly `tariff_publish`, `fiscal_policy_publish`, `risk_policy_publish`, `client_checkout_prepare`, `platform_card_setup_prepare`, `platform_invoice_charge`, `platform_renewal_schedule`, `refund_execute`, `chargeback_principal_allocate`, `payout_destination_reveal`, `payout_destination_change`, `payout_approve`, `payout_start_processing`, `payout_confirm_paid`, `bank_snapshot_attest`, `bank_statement_match`, and `ledger_correction`.
- [x] RED: test the exact production readiness requirement codes from approved design section 20:

  `legal_accounting_client_purchase`, `legal_accounting_platform_subscription`, `commercial_tariff`, `capability_enforcement`, `billing_operations_policy`, `risk_policy`, `product_fulfillment`, `refund_chargeback_principal_policy`, `arc_pay_environment`, `finance_step_up`, `payout_recipient_policy`, `bank_liquidity_policy`.

- [x] Keep `runtime_authority` as the repository/execution permission gate in the parent plan, not as caller-supplied or persisted production readiness evidence.
- [x] RED: assert the exact literal required-evidence set for every operation, with no unclassified enum member:
  - `tariff_publish`: `commercial_tariff`, `capability_enforcement`, `finance_step_up`;
  - `fiscal_policy_publish`: `finance_step_up` plus exactly the legal/accounting profile matching the command's immutable transaction category (`client_purchase` or `platform_subscription`); test both contexts;
  - `risk_policy_publish`: `finance_step_up`;
  - `client_checkout_prepare`: `legal_accounting_client_purchase`, `risk_policy`, `product_fulfillment`, `arc_pay_environment`;
  - `platform_card_setup_prepare`: `arc_pay_environment`;
  - `platform_invoice_charge`: `legal_accounting_platform_subscription`, `commercial_tariff`, `arc_pay_environment`;
  - `platform_renewal_schedule`: the platform-invoice set plus `billing_operations_policy`;
  - `refund_execute`: `legal_accounting_client_purchase`, `refund_chargeback_principal_policy`, `arc_pay_environment`, `finance_step_up`;
  - `chargeback_principal_allocate`: `refund_chargeback_principal_policy`, `finance_step_up`;
  - `payout_destination_reveal` and `payout_destination_change`: `payout_recipient_policy`, `finance_step_up`;
  - `payout_approve`, `payout_start_processing`, and `payout_confirm_paid`: `payout_recipient_policy`, `bank_liquidity_policy`, `finance_step_up`;
  - `bank_snapshot_attest` and `bank_statement_match`: `bank_liquidity_policy`, `finance_step_up`;
  - `ledger_correction`: `finance_step_up` plus exactly the legal/accounting profile of the source transaction being reversed/replaced; test both category contexts.

- [x] RED: prove absent, expired, wrong-environment, or wrong-transaction-category evidence returns every missing requirement in stable order; valid versioned evidence returns `ready: true`; `assertFinanceOperationReady` throws `FinanceOperationNotReadyError` with no secret/evidence contents.
- [x] Run the test and record the missing-module failure.
- [x] GREEN: implement immutable evidence refs containing only requirement code, version/id, environment/category scope, status, effective/expiry instants, and safe digest. `resolveFinanceOperationReadiness` receives a trusted `FinanceReadinessEvidenceReader` and operation context, loads evidence itself, and never accepts evidence records from the API command payload. Do not embed legal values, secrets, bank data, or provider credentials.
- [x] Use a supplied `now` instant; do not call the clock internally. Validate ISO instants and reject duplicate evidence for the same requirement/scope as an integrity error rather than selecting one silently.
- [x] Run:

  ```bash
  pnpm test packages/contracts/src/finance-operations.test.ts packages/domain/src/finance-readiness/finance-readiness.test.ts
  pnpm --filter @elevenhouse/contracts typecheck
  pnpm --filter @elevenhouse/domain typecheck
  ```

Observable acceptance: every future high-risk finance operation can fail before external I/O for a complete typed list of missing approvals/evidence.

## Task 4: Paid-product fulfillment registry

**Files:**

- Create `packages/domain/src/products/paid-product-fulfillment-registry.test.ts`.
- Create `packages/domain/src/products/paid-product-fulfillment-registry.ts`.
- Modify `packages/domain/src/products/index.ts`.

- [x] RED: test the only currently approved paid shape: `type=single`, `paymentModel=once`, `executionMode=live`, `participantMode=solo`, which resolves to a versioned registry entry containing `registryRevision`, authoritative terminal evidence `{ owner: "booking", status: "completed", contractVersion }`, and a cancellation/refund allocator reference `{ owner: "booking", port: "BookingCancellationRefundDecisionPort", policyVersion }`.
- [x] RED: require a trusted `PaidProductFulfillmentDependencyReader` to confirm that the referenced booking terminal contract and exact cancellation/refund policy version are registered. Missing or superseded dependencies return `fulfillment_dependency_unavailable`; callers cannot supply a fabricated policy object.
- [x] RED: test that free products bypass the paid registry, while pack, subscription, group/gift, async, instant, mini, course, custom, and unknown combinations return stable unsupported codes. Do not treat labels, elapsed time, delivery format, or frontend route as fulfillment evidence.
- [x] Run the targeted test and record the missing-export failure.
- [x] GREEN: implement immutable registry data plus `resolvePaidProductFulfillment` using the dependency reader. The returned supported decision includes the exact registry revision, terminal-evidence contract and cancellation/refund allocator identity. It does not mutate product status and is not yet wired into order creation in this plan.
- [x] Run:

  ```bash
  pnpm test packages/domain/src/products/paid-product-fulfillment-registry.test.ts packages/domain/src/products/product-use-cases.test.ts
  pnpm --filter @elevenhouse/domain typecheck
  ```

Observable acceptance: later product publication/order creation has an explicit release/refund authority and cannot infer it from prototype metadata.

## Task 5: Read-only legacy financial inventory and discrepancy report

**Files:**

- Create `packages/domain/src/finance-inventory/finance-inventory.test.ts`.
- Create `packages/domain/src/finance-inventory/finance-inventory.ts`.
- Create `packages/domain/src/finance-inventory/index.ts`.
- Modify `packages/domain/src/index.ts`.
- Create `packages/db/src/adapters/finance/drizzle-financial-inventory-reader.test.ts`.
- Create `packages/db/src/adapters/finance/drizzle-financial-inventory-reader.ts`.
- Modify `packages/db/src/adapters/finance/index.ts`.
- Create `packages/db/scripts/finance-inventory.ts` without adding or changing a package script.

- [x] RED domain tests with hand-derived literal fixtures for every approved pre-migration dataset: plans/subscriptions/invoices; authorized/captured orders and payment attempts; refunds; chargeback provider events/reversal cases; ledger accounts/transactions/entries; wallet projections and source lots; open payouts; settlement entries/cursors; bank cash snapshots/statements/exposures; ArcPay provider-account and bank-cash-pool scope. Legacy tables that do not have a target concept must emit an explicit `absent_in_legacy_schema` or `legacy_unscoped` fact rather than disappear. Test balanced and unbalanced journals per currency, wallet-liability/source-lot mismatch, provider/bank control mismatch, paid/current subscriber IDs, and stable JSON output.
- [x] RED adapter tests against a recording `Queryable` that assert the reader starts `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, reads the current legacy tables without `INSERT|UPDATE|DELETE|ALTER|CREATE|DROP`, commits on success, and rolls back on failure. Assert observable returned facts rather than source-text presence.
- [x] Run both tests and record the expected missing-module failures.
- [x] GREEN domain: implement `buildFinancialInventoryReport(snapshot)` with explicit `passed | blocked` reconciliation status and a candidate opening trial balance. Any non-zero journal imbalance, wallet/source-lot mismatch, provider/bank control mismatch, missing required dataset, unknown provider/bank scope, or monetary discrepancy is reported; no balancing adjustment is generated.
- [x] GREEN adapter: query current existing columns only and label facts lacking target `arc_provider_account_id`/`bank_cash_pool_id` as `legacy_unscoped`. Keep SQL parameterized and return integers/strings without floating-point conversion.
- [x] GREEN CLI: load `DATABASE_URL`, reject non-PostgreSQL or missing URL, print a safe target summary to stderr, require `--confirm-read-only-target=<database-name>` before connecting, set transaction/session to read-only, emit JSON to stdout, and set non-zero exit status when the report is blocked. It must not print credentials.
- [x] Run unit/static verification only:

  ```bash
  pnpm test packages/domain/src/finance-inventory/finance-inventory.test.ts packages/db/src/adapters/finance/drizzle-financial-inventory-reader.test.ts
  pnpm --filter @elevenhouse/domain typecheck
  pnpm --filter @elevenhouse/db typecheck
  ```

- [ ] After code review, revalidate the exact current migration target and access authority. Run the CLI there only when authorized, store the redacted report artifact outside source control, and review its subscriber IDs, opening trial balance, control totals, absent/unscoped facts and discrepancies. Local zero rows never prove production zero rows.
- [x] If the authoritative run cannot be performed, mark Stage 1 `partial` and the parent Stage 2 target-schema gate `blocked_authoritative_inventory`; do not mark this task or Stage 1 fully complete merely because unit/static tests pass.

Local evidence note: the reviewed CLI was run read-only against the confirmed
Compose target `localhost:5432/elevenhouse` and stored outside source control.
It found no subscriptions, paid invoices, orders, payment attempts, refunds,
chargebacks, journal/wallet rows, payouts or settlements, and an empty opening
trial balance. The report remains blocked on seven absent target datasets, 18
unscoped facts and four unavailable provider controls. This does not prove a
deployed production database is empty; the two authoritative-production gates
above therefore remain unchecked.

Observable acceptance: a migration operator has a deterministic, non-mutating report covering every spec-listed dataset, and the authoritative run either proves a reviewed zero-unexplained-delta opening state or leaves the target-schema gate explicitly blocked.

## Task 6: Transaction-bound finance authorization boundary

**Files:**

- Create `packages/contracts/src/finance-authorization.test.ts`.
- Create `packages/contracts/src/finance-authorization.ts`.
- Modify `packages/contracts/src/index.ts`.
- Create `packages/domain/src/finance-authorization/finance-authorization.test.ts`.
- Create `packages/domain/src/finance-authorization/finance-authorization.ts`.
- Create `packages/domain/src/finance-authorization/index.ts`.
- Modify `packages/domain/src/index.ts`.

- [x] RED contract tests for strict request/response schemas. Sensitive action kinds reuse the single `FinanceOperationKind` enum from Task 3 and are exactly `tariff_publish`, `fiscal_policy_publish`, `risk_policy_publish`, `refund_execute`, `chargeback_principal_allocate`, `payout_destination_reveal`, `payout_destination_change`, `payout_approve`, `payout_start_processing`, `payout_confirm_paid`, `bank_snapshot_attest`, `bank_statement_match`, and `ledger_correction`.
- [x] RED domain tests for canonical command-payload hashing, exactly 32 injected cryptographically secure random challenge bytes, five-minute-or-less expiry, actor/session/action/aggregate/version/hash binding, `userVerification: "required"`, RP ID/origin binding, challenge single-use, grant single-use, stale expected-version rejection, expired challenge/grant rejection, credential-owner mismatch, recovery-session rejection, and atomic signature-counter advancement or clone quarantine.
- [x] Pin canonical payload bytes: recursively accept only `null`, booleans, strings, finite safe integers, arrays, and plain string-keyed objects; sort object keys by Unicode code point; encode the resulting whitespace-free JSON as UTF-8; reject `undefined`, floats, unsafe integers, `bigint`, dates, class instances, cycles, and non-finite numbers; compute `sha256:<lowercase hex>` over those bytes. Tests use hand-derived literals and prove reordered object keys hash identically while array order remains significant.
- [x] Define ports `FinanceAuthorizationStore`, `FinanceWebAuthnCredentialStore`, `FinanceWebAuthnAssertionVerifier`, `FinanceAuthorizationRandomSource`, and `FinanceAuthorizationClock`. The authorization store persists/atomically consumes both challenges and grants. The credential store atomically advances the signature counter or marks the credential quarantined on a compare-and-set conflict/regression. The verifier receives the expected challenge, allowed origin, RP ID and `requireUserVerification: true`, and returns verified credential ID, UV result and counter; domain code never parses WebAuthn binary structures itself.
- [x] Run tests and record missing-module failures.
- [x] GREEN: implement `beginFinanceAuthorization`, `verifyFinanceAuthorizationAndIssueGrant`, and `consumeFinanceAuthorizationGrant`. Persist the challenge before returning options. Verification atomically consumes the challenge, advances/quarantines the credential counter, and persists one active grant bound to the exact command. The sensitive finance command must consume that grant by compare-and-set inside the same application transaction as its state mutation; a consumed/expired/mismatched grant fails. Return only an opaque grant ID and safe expiry to the browser; never return credential material.
- [x] Do not wire admin controllers or mark `finance_step_up` readiness satisfied. That requires a real WebAuthn adapter, credential enrollment/persistence, runtime RP config, API security tests, and browser ceremony in a later Identity child plan.
- [x] Run:

  ```bash
  pnpm test packages/contracts/src/finance-authorization.test.ts packages/domain/src/finance-authorization/finance-authorization.test.ts
  pnpm --filter @elevenhouse/contracts typecheck
  pnpm --filter @elevenhouse/domain typecheck
  pnpm --filter @elevenhouse/contracts build
  pnpm --filter @elevenhouse/domain build
  ```

Observable acceptance: sensitive finance use cases have a strict transaction-specific, persisted, single-use grant contract and atomic credential-counter boundary while runtime readiness truthfully remains blocked until real WebAuthn infrastructure is connected.

## Task 7: Stage verification, documentation, and review

**Files:**

- Modify this plan's `Progress`, `Surprises & Discoveries`, and `Outcomes & Retrospective`.
- Modify parent plan progress.
- Modify canonical docs only if implemented architecture/current-state statements changed; do not mark enforcement, publication, inventory execution, or WebAuthn runtime ready when only foundations exist.

- [x] Run fresh targeted tests from Tasks 1–6.
- [x] Run affected package gates:

  ```bash
  pnpm --filter @elevenhouse/contracts typecheck
  pnpm --filter @elevenhouse/domain typecheck
  pnpm --filter @elevenhouse/db typecheck
  pnpm --filter @elevenhouse/contracts build
  pnpm --filter @elevenhouse/domain build
  pnpm --filter @elevenhouse/db build
  ```

- [x] Run repository/docs gates:

  ```bash
  pnpm verify
  pnpm docs:check:test
  pnpm docs:check
  git diff --check
  ```

- [x] Generate an owned-path review package, dispatch final stage review, run one fix wave if required, and record any residual load-bearing blocker.
- [x] Refresh branch/status/cached diff and list every unowned change left untouched.

## Validation and Acceptance

This stage is complete only when:

- the bidirectional manifest and validator prove every audited surface accounted for and every current seed plan's complete ordered issue set;
- readiness failures are typed and complete;
- unsupported paid product shapes and missing terminal/refund policy versions fail closed;
- inventory code is demonstrably read-only and discrepancy preserving, and its authoritative current-target report has been reviewed with zero unexplained delta;
- finance authorization challenge and grant are transaction-bound and independently single-use at the domain boundary;
- no production tariff publication, charge, sensitive admin command, DB mutation, or fake readiness was enabled;
- all fresh automated gates pass or exact unrelated/blocking failures are recorded.

If the authoritative inventory run is unavailable, this plan may be reported
`partial` after its code gates pass, but Stage 1 and every target-schema write
remain blocked. Runtime/browser acceptance is not required for these non-visible
domain foundations. A later controller/UI plan must prove the real WebAuthn
ceremony and visible locks before claiming those surfaces.

## Idempotence and Recovery

- Manifest and registry functions are immutable deterministic data.
- Validators collect issues without side effects and produce stable ordering.
- Inventory runs in a repeatable-read read-only transaction and may be rerun safely; reports carry generation instant and target identity digest, not credentials.
- Authorization challenges and resulting grants are separate unique records, each expires in at most five minutes and is consumed once by compare-and-set. Verification or command retry after uncertain persistence reads authoritative state and never creates or consumes a second grant silently.
- SDD task progress is recorded in this plan's dedicated scratch ledger. With no commit authority, each completion line records exact owned-file hashes and review verdict.

## Progress

- [x] 2026-08-03 — Current capability, finance, DB collision, and runtime evidence audited.
- [x] Task 1 — Exhaustive capability manifest; final independent review PASS.
- [x] Task 2 — Tariff publication validator; independent re-review PASS.
- [x] Task 3 — Finance readiness matrix; independent re-review PASS.
- [x] Task 4 — Paid-product fulfillment registry; independent review PASS.
- [ ] Task 5 — Inventory code/review and local read-only report complete; authoritative-production inventory remains blocked. See `task-5-inventory-report.md`.
- [x] Task 6 — Finance authorization boundary; 50/50 focused tests and independent final security review PASS. Runtime `finance_step_up` remains blocked by design.
- [x] Task 7 — Full permitted-stage verification and independent review complete; Stage 1 remains partial on the authoritative-production inventory gate.

## Surprises & Discoveries

- 2026-08-03 — `PlatformPlanFeatureCode` is duplicated between contracts and domain; removing that drift is part of Task 1.
- 2026-08-03 — No current WebAuthn/passkey code exists. This plan therefore establishes the provider-neutral transaction boundary but intentionally does not claim cryptographic runtime readiness.
- 2026-08-03 — Legacy finance records lack immutable provider-account and bank-cash-pool scope. Inventory must expose that gap rather than synthesize target identities.
- 2026-08-03 — Independent review found that implemented inventory tooling is not migration evidence; the authoritative current-target run and reviewed opening trial balance are now a hard target-schema gate.
- 2026-08-03 — The local read-only inventory found zero subscriptions and zero finance economics, but expected target concepts/scopes/provider controls are absent. Local evidence cannot stand in for a deployed production inventory, so Stage 1 stays partial and schema enablement remains blocked.
- 2026-08-03 — Final review proved three aggregate-only blind spots: closed or mixed authorization/capture states, duplicate selected attempts, and amount/currency swaps that net to the same aggregate. Exact per-order cardinality and linked-source economics checks now preserve and block all three.
- 2026-08-03 — A trusted readiness adapter can accidentally return extra fields even when its declared TypeScript shape is safe. Successful readiness decisions now explicitly project the nine allowed evidence fields rather than spreading adapter rows.

## Decision Log

- 2026-08-03, Codex — Treat capability existence and entitlement enforcement as separate manifest dimensions; this prevents a real-but-unguarded module from becoming sellable.
- 2026-08-03, Codex — Permit only the exact approved live single-session paid shape in the first fulfillment registry; all other current product shapes remain draft-only for paid sale.
- 2026-08-03, Codex — Keep WebAuthn cryptography behind a port in this plan and leave readiness blocked until a pinned real adapter and credential enrollment contour are implemented.
- 2026-08-03, Codex — Make both WebAuthn challenge and issued authorization grant persisted single-use records; a sensitive command consumes the grant atomically with its own mutation.

## Outcomes & Retrospective

Tasks 1–4 and 6 are reviewed complete. Task 5 code and local execution are
reviewed, but authoritative-production evidence is unavailable; Stage 1 is
therefore correctly **partial** with `blocked_authoritative_inventory` still in
force. Task 7 recorded a final independent PASS with no blocker/high/medium in
the owned code, 261/261 affected tests, 203/203 root-targeted tests, passing
contracts/domain-build/DB/frontend-build/lint/docs/diff gates, and only
unrelated chart/Geoapify fixture diagnostics preventing the repository-wide
typecheck/verify gate. No tariff publication, charge, schema write, runtime
step-up readiness or entitlement enforcement was enabled.

## Artifacts and Notes

- Parent: `docs/superpowers/plans/2026-08-03-finance-production-contour-master.md`
- Spec: `docs/superpowers/specs/2026-08-02-finance-production-contour-design.md`
- SDD workspace: resolve with the Superpowers `scripts/sdd-workspace` helper for this exact plan file.
- Final verification report: `.superpowers/sdd/2026-08-03-finance-prerequisites/task-7-stage-report.md`.
