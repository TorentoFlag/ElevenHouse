# Arc Pay Settlement Ledger Ingestion Plan

> **For agentic workers:** execute with behavioral TDD. Keep this plan current while working.

## Purpose / Big Picture

ElevenHouse needs automatic provider-side settlement evidence ingestion so hold
release does not depend only on webhooks or manual admin input. The observable
outcome is a `payment-worker` loop that reads Arc Pay `/v1/settlement/ledger`,
compares payment rows with ElevenHouse payment attempts, writes idempotent
`reconciliation_records`, and leaves unresolved discrepancies visible in the
admin finance reconciliation queue.

## Progress

- [x] 2026-07-27: Current repository state inspected on shared `main`; unrelated messaging/media work is present and out of scope.
- [x] 2026-07-27: Arc Pay settlement, reports, settlement schedule and reconciliation docs refreshed.
- [x] Add domain use-case and store port for settlement-ledger reconciliation.
- [x] Add Drizzle support for lookup by provider payment id inside reconciliation store.
- [x] Add Arc Pay settlement ledger client and worker processor.
- [x] Wire optional interval into `payment-worker` runtime config/main.
- [x] Run targeted domain/db/worker/config verification and affected package typechecks/builds.
- [x] 2026-07-27: `@elevenhouse/db typecheck` has an unrelated messaging test blocker: `messagingThreadIdentities` is not defined in `drizzle-messaging-store.test.ts`.

## Research

Question:
Which Arc Pay surface should ElevenHouse use first for production reconciliation ingestion?

Decision affected:
Payment-worker provider adapter, reconciliation domain contract, retry/idempotency
behavior and operations visibility.

Accessed: 2026-07-27

### Sources

- [Arc Pay settlement API](https://finext.gitbook.io/arc-pay/ru/api-reference/settlement.md) - official REST `GET /settlement/ledger` with cursor pagination, integer minor units and merchant settlement fields.
- [Arc Pay reports API](https://finext.gitbook.io/arc-pay/ru/api-reference/reports.md) - official async report-job API for transaction/balance/commission reports.
- [Arc Pay settlement schedule](https://finext.gitbook.io/arc-pay/ru/operacionka/settlement.md) - official T+1 merchant-local settlement explanation and pending/available/reserved states.
- [Arc Pay daily reconciliation](https://finext.gitbook.io/arc-pay/ru/operacionka/reconciliation.md) - official discrepancy types, manual review workflow, and payout pause semantics.

### Findings

- Sourced fact: Arc Pay exposes settlement ledger read endpoints requiring a secret key with `settlement.read`; entries include `entry_id`, amount, currency, direction, reference type/id, settlement status and bank identifiers.
- Sourced fact: Arc Pay report generation is asynchronous: create job, poll job, then download via URL.
- Sourced fact: Arc Pay reconciliation treats non-zero discrepancies as operator-visible and can pause payout until review.
- Repository evidence: `reconciliation_records` already stores provider/environment/payment/payout/settlement identifiers and `matched/exception/ignored` states.
- Repository evidence: hold release already gates settlement-required orders on matched reconciliation and no unresolved exception.
- Inference: Pulling `/settlement/ledger` is the safest first ingestion because it avoids CSV/XLSX parser ambiguity and can write one idempotent reconciliation record per provider ledger entry.

### Options

1. Settlement ledger pull, recommended: simple cursor pagination, direct JSON parsing, stable idempotency per provider ledger entry; does not provide full export artifact history.
2. Async report jobs: better finance export alignment, but adds job lifecycle, download URL handling, file parsing and truncation handling before basic reconciliation works.
3. Webhook-only: already partially implemented, but leaves missed webhooks and delayed settlement evidence unhandled.

### Recommendation

Implement settlement ledger pull now. Keep async reports for a later ops/reporting slice. The worker should re-read an overlap window, dedupe by provider ledger identifiers, and write exceptions instead of mutating orders/wallets directly.

### Rejected Alternatives

- Auto-adjust ElevenHouse ledger from amount mismatches: rejected for this slice because user/operator review is required before money corrections.
- Treat unknown provider ledger rows as successful payments: rejected because missing local payment is a financial exception, not fulfillment evidence.
- Enable payout execution through Arc Pay: rejected because user explicitly set manual admin payouts until Arc Pay payout terminal support is ready.

### User Decisions

None for this slice. The implementation follows the approved architecture: Arc Pay as pay-in/acquiring provider, ElevenHouse ledger as business balance, manual payout execution for now.

## Context and Orientation

Relevant current files:

- `packages/domain/src/reconciliation/*` - reconciliation port and use-cases.
- `packages/db/src/adapters/finance/drizzle-reconciliation-store.ts` - persistence adapter.
- `apps/payment-worker/src/arc-pay/*` - Arc Pay provider readers/parsers.
- `apps/payment-worker/src/main.ts` and `runtime-config.ts` - worker composition/config.
- `apps/admin-web` and `apps/admin-api` already show and resolve open exceptions.

## Interfaces and Dependencies

- `packages/domain` defines provider-neutral settlement ledger entry types and reconciliation use-case. It does not import `packages/db`.
- `packages/db` implements the domain store port using Drizzle.
- `apps/payment-worker` owns Arc Pay HTTP calls and periodic scheduling.
- No controller or frontend owns reconciliation arithmetic.

## Plan of Work

1. Domain red/green: matched row, amount mismatch row, missing local row, non-payment row skip, replay counts.
2. DB red/green: reconciliation store can find attempts by provider payment id and dedupe settlement-ledger records.
3. Arc Pay client red/green: calls `/v1/settlement/ledger` with bearer auth, cursor pagination params and strict payload validation.
4. Worker processor red/green: fetches all pages for a bounded window, hands normalized rows to domain use-case, reports counts.
5. Runtime config/main red/green: production has required secret, reconciliation interval/window/page limit are normalized, interval only starts when enabled and credentials exist.

## Concrete Steps

Run from `/Users/anton/Finext/ElevenHouse`:

```bash
pnpm exec vitest run packages/domain/src/reconciliation/reconciliation-use-cases.test.ts
pnpm exec vitest run apps/payment-worker/src/arc-pay/arc-pay-settlement-ledger-client.test.ts apps/payment-worker/src/reconciliation/settlement-ledger.processor.test.ts apps/payment-worker/src/runtime-config.test.ts
set -a && source .env && set +a && INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/finance/drizzle-reconciliation-store.integration.ts
pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/domain build
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/payment-worker typecheck && pnpm --filter @elevenhouse/payment-worker build
```

## Validation and Acceptance

- Domain tests prove matching, exception creation and skip semantics.
- DB integration proves lookup/dedupe against real PostgreSQL.
- Worker tests prove Arc Pay HTTP shape, pagination, fail-closed parse and processor retry surface.
- Typecheck/build prove package boundaries.
- Runtime E2E is not required for this non-visible worker slice; admin UI already has browser evidence from the previous slice.

## Idempotence and Recovery

- The worker reuses an overlap time window; duplicate rows replay existing reconciliation records.
- Provider HTTP failures fail the tick and are retried by the next interval.
- Unknown or mismatched rows create exceptions and never mark order fulfillment.
- Missing API secret disables local/development polling; production still requires Arc Pay credentials.

## Artifacts and Notes

- Official Arc Pay docs were accessed on 2026-07-27.
- Existing unrelated messaging/media changes must remain out of staging/commit.
