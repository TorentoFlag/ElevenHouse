# Forward Migration Lineage Design

**Status:** approved design; implementation plan pending review

## Decision

Replace the mutable, regenerated single Drizzle baseline with a fresh, linear,
append-only migration lineage. The lineage is installed by destructive reset
only on explicitly identified disposable local and development databases. Once
the cutover is complete, every schema change is represented by a new immutable
migration; no migration is regenerated, consolidated, or rewritten.

This is a database-tooling and deployment decision. It does not alter product
scope, domain rules, application APIs, permissions, or persisted business
meaning.

## Evidence At Approval

- `packages/db/drizzle/0000_sticky_rictor.sql` is a 1.67 MB generated root
  migration with 271 tables, 607 foreign keys, 536 indexes and managed
  scheduling, Flows, client-profile, chart and Finance integrity objects.
- The generator script and six augmenters assume exactly one `0000` SQL file;
  `production-baseline-plan.ts` identifies one SQL hash and journal timestamp;
  the production preflight accepts one ledger entry only.
- The confirmed local target is `localhost:5432/elevenhouse`, PostgreSQL 17.10.
  Its ledger contains one older migration hash and its catalog has 264 public
  tables, while the current snapshot contains 271. The missing tables are
  `finance_online_wallet_chargeback_resolutions`,
  `finance_online_wallet_refund_case_allocations`,
  `finance_online_wallet_refund_case_transitions`,
  `finance_online_wallet_refund_cases`,
  `flow_birth_profile_recheck_receipts`, `flow_execution_signal_inbox`, and
  `flow_execution_signal_waits`.
- The current checked-out migration source, not the stale local catalog, is
  the reference behavior to preserve. The shared checkout is dirty in Finance,
  Flows and the existing migration artifacts; those changes are unowned and
  must be re-read immediately before the cutover snapshot is captured.

## Sources And Research

Accessed 2026-08-06.

- [Drizzle generate](https://orm.drizzle.team/docs/drizzle-kit-generate):
  generation compares the current schema snapshot to the latest migration
  snapshot and persists SQL plus snapshot metadata. Therefore splitting SQL
  without a coherent journal/snapshot lineage is invalid.
- [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate): the
  migrator reads SQL files, records applied migrations in
  `drizzle.__drizzle_migrations`, and applies only unapplied migrations.
- [Drizzle custom migrations](https://orm.drizzle.team/docs/kit-custom-migrations):
  custom SQL migrations are supported for DDL that cannot be expressed by the
  generator; ElevenHouse integrity functions/triggers use this boundary.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html):
  DDL can acquire restrictive table locks; deployment must serialize migration
  execution and quiesce writers before destructive reset or incompatible DDL.

## Architecture

### One ordered lineage, module-owned phases

The database retains one global migration order and one Drizzle ledger. It does
not use independent module ledgers or selectively apply module migrations.
Modules own the migration phases that introduce their tables and integrity SQL;
cross-module relationships are placed in a later phase after both owners exist.

The initial cutover target is a dependency-ordered sequence, expected to be
approximately ten migrations:

1. PostgreSQL extensions and identity foundation.
2. Audit log, outbox, products, media, platform billing and related base catalogue tables.
3. Clients, astrologer profile, verification, dictionary, matrix and
   calculation records.
4. Scheduling/booking and its exclusion/lifecycle integrity.
5. Flows definition and runtime tables.
6. Flows signals, work-items and integrity functions/triggers.
7. Messaging and AI usage records.
8. Finance foundation: provider identity, policy, credentials, artefacts and
   idempotency.
9. Finance payments, wallet, ledger, refunds, payouts, bank and settlement
   tables.
10. Finance integrity functions/triggers and remaining cross-module objects.

The exact phase boundary is derived from the current full schema dependency
graph during the implementation spike. A phase must create a dependency before
it creates a foreign key, trigger, function or index that refers to it.

### Generator and custom-integrity boundary

The implementation creates a deterministic migration-lineage builder. It is
the only command permitted to create initial-cutover artifacts. It must:

1. create the phase migration SQL and coherent Drizzle journal/snapshots;
2. run each phase's dedicated integrity augmenter on its own migration only;
3. reject an unexpected migration filename, journal gap, non-linear snapshot
   parent, duplicate managed integrity marker, or source manifest change while
   building;
4. leave the existing artifacts untouched until the candidate has passed all
   isolated validation; and
5. never use `drizzle-kit push` or `--ignore-conflicts`.

A bounded spike decides the internal generation mechanism before production
files are changed. Its success criterion is that a minimal pair of module
schema entrypoints with a real cross-module foreign key produces a valid,
linear Drizzle snapshot chain and applies on an empty PostgreSQL database. If
Drizzle cannot generate phase snapshots safely from staged schema entrypoints,
the builder must generate a complete current snapshot once and derive every
intermediate snapshot through a verified dependency-preserving catalog model;
it must not hand-edit JSON or claim equivalence from file text.

### Runtime and deploy behavior after cutover

`db:generate` becomes append-only and creates the next migration from the
latest committed snapshot. It must reject an attempted rewrite of an existing
SQL, journal or snapshot artifact. `db:migrate` remains the sole migrator.

Production/dev preflight changes from exact-single-baseline matching to a
fail-closed approved-lineage check: it verifies every committed migration hash
and timestamp in order, rejects unknown, missing, reordered or divergent
ledger rows, and runs existing Flows safety reconciliation. The deploy path
uses one transaction-level PostgreSQL advisory lock around ledger preflight and
migration execution. Writer quiescing and backup remain deployment concerns;
the application never migrates itself during request handling.

## Equivalence Contract

The candidate lineage is equivalent only when two newly created isolated local
databases have identical application catalog manifests:

- extensions and user-defined types;
- relations, columns, nullability, data types, collation, defaults and identity
  settings;
- primary/unique/check/exclusion/foreign-key constraints including validation,
  deferrability, actions and predicate/definition text;
- indexes including methods, keys, predicates and expressions;
- functions/procedures, trigger definitions and trigger enablement; and
- required schema ownership/search-path-sensitive definitions.

The reference database applies an immutable copy of the pre-cutover `0000`
source. The candidate applies the whole new sequence. `drizzle` ledger rows are
verified separately: the candidate must contain the expected ordered lineage,
not the single old hash. The stale local database is not an equivalence source.

The test also proves each sequence applies from zero, a second migrate is a
no-op, required seeds succeed, and relevant integration suites run against the
candidate database.

## Cutover Procedure

1. Freeze the exact source manifest only after all concurrent schema owners'
   shared-main changes are present and targeted schema/app tests are green.
2. Preserve a read-only reference copy of the existing `0000` artifacts for
   the equivalence test; do not retain it as a deployable lineage.
3. Build the candidate lineage and run the isolated catalog equivalence suite.
4. Inspect `git diff`, migration manifest, generated SQL and snapshot chain;
   run package and repository gates.
5. Confirm the exact local Docker PostgreSQL target and, under the user's
   authorization, reset only `localhost:5432/elevenhouse`, migrate and seed it.
6. Repeat the catalog manifest and affected integration checks against the
   reset local database.
7. Only after the local evidence report is green, inspect the development
   server's host, compose project, active PostgreSQL container, database name,
   writer services and data disposition. Take a safety backup, quiesce writers,
   reset the exact identified database, migrate, seed and run readiness/API
   smoke. Any identity mismatch aborts before deletion.

## Failure and Recovery Rules

- Candidate generation failure restores or leaves untouched the active
  migration directory; it never performs broad deletion of `drizzle/`.
- Catalog mismatch blocks local reset and dev-server access.
- A failed migration on a fresh disposable database is repaired by dropping
  only that exact disposable target and rerunning from the first migration.
- A failed dev reset restores from the pre-reset safety backup only after
  target identity is revalidated; no automatic rollback deploy is implied.
- Once a dev database has the new lineage, it must never receive the old
  baseline again.

## Non-Goals

- No migration of data from the current dev database; its data is explicitly
  disposable after the preflight gate.
- No reset or mutation of production under this task.
- No unrelated refactor of Finance, Flows, schema modules, API behavior or
  application deployment topology.
- No commit, push or production deploy without separate explicit authority.

## Acceptance

1. The repository contains a deterministic multi-migration Drizzle lineage;
   every artifact passes lineage validation.
2. The candidate catalog equals the pre-cutover baseline catalog under the
   full manifest contract.
3. A new local database migrates and seeds successfully; repeat migration is a
   no-op.
4. The confirmed local ElevenHouse development DB is reset, migrated and
   seeded only after the preceding checks pass.
5. The explicitly identified dev server is reset only after local proof and
   post-reset health/API smoke passes.
6. Future schema changes use append-only migration generation and cannot
   silently regenerate an already-applied migration.
