# 0012. One-Time Pre-Launch Production Baseline Reset

Date: 2026-08-03

## Status

Accepted by explicit product and operations authority for the initial Finance
rollout only.

## Context

The current ElevenHouse production PostgreSQL database is pre-launch and
disposable. It contains no real users, payments, accounting records or legally
significant data. Existing finance-shaped rows do not need to be preserved,
converted, reconciled or represented as an opening balance.

At the same time, shared `main` contains concurrent schema work outside Finance.
The rollout must include that work and must not regenerate a finance-only or
stale baseline over it.

## Decision

The new combined PostgreSQL baseline becomes the only application-data source
of truth. Legacy finance-data migration, subscriber conversion, backward-
compatible data conversion and opening-balance reconstruction are out of scope.

After the full requested contour is implemented and verified, operations may
perform one destructive reset/recreate of exactly the ElevenHouse production
PostgreSQL database. The reset is authorized only when all of these gates pass:

1. the generated baseline includes every then-current shared-main schema change;
2. a fresh empty-database rehearsal and affected repository gates pass;
3. the exact production host, database name and container are independently
   inspected and match the approved ElevenHouse target;
4. the reset command validates that exact identity before destructive work;
5. only reviewed system seed data is inserted;
6. deploy and real network-backed E2E follow the reset.

A backup may be taken only as insurance against an environment-selection error.
It is not a source for inventory, reconciliation or migrated rows.

The reset authorization does not authorize reverting, overwriting or omitting
other agents' shared-main schema work. It also does not weaken ledger,
idempotency, audit, provider-reconciliation, bank-evidence or security
requirements for newly created data.

## Consequences

- The former `blocked_authoritative_inventory` gate is removed.
- Target finance schema and adapters may proceed without legacy compatibility
  columns or conversion paths.
- The initial baseline must be tested as a complete fresh installation rather
  than as a predecessor-data migration.
- The launch trial balance is exactly zero. A cash-pool/account directory row
  may be seeded, but no wallet, bank, clearing, payable, opening-control or other
  monetary balance row/journal is seeded. The first monetary journal follows a
  real confirmed economic or bank fact: a provider-confirmed capture may post
  provider clearing and payable before merchant settlement, while the first
  `bank_cash` movement requires the real ArcPay merchant-settlement flow and
  exact deduplicated bank-statement evidence.
- After the one-time reset, ordinary production evolution is forward-only and
  fail-closed. This ADR does not authorize later implicit resets.
- For this one rollout, this decision supersedes reset-prohibition language in
  older plans and ADR 0011 only to the extent necessary to install the complete
  shared baseline. It does not change the PostgreSQL authority or safety model
  of Flows.
