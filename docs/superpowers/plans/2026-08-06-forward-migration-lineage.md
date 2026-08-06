# Forward Migration Lineage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse shared-main policy forbids worktrees, branches, staging, and commits without direct authority.

**Goal:** Replace the mutable single Drizzle baseline with a validated append-only multi-migration lineage, prove that it creates the same application catalog, then reset the confirmed local and dev databases only after the proof passes.

**Architecture:** A candidate-lineage builder owns the initial cutover and validates a phase manifest. A catalog-equivalence integration suite applies the preserved current `0000` and the candidate lineage to independent empty PostgreSQL databases. Post-cutover preflight accepts only the full ordered lineage and migration runs under one advisory lock.

**Tech Stack:** TypeScript 6, Drizzle Kit 0.31.10, pg 8.21, PostgreSQL 17, Vitest, pnpm, Docker Compose.

## Global Constraints

- Stay in shared `main`: no worktree, branch, stash, checkout, rebase, broad staging or commit.
- Existing dirty Finance, Flows and migration artifacts are unowned concurrent work; reread each path and scoped diff immediately before edits.
- The only confirmed local destructive target is `localhost:5432/elevenhouse` as user `elevenhouse`; repeat host/container/port/database preflight before reset.
- Dev reset is authorized only after local catalog equivalence is green and remote container/database identity is independently inspected.
- Never use `drizzle-kit push`, `--ignore-conflicts`, automatic baseline consolidation or textual SQL equality as evidence.
- No production mutation, commit or push is authorized.
- Before changing a function/class/method, run GitNexus upstream impact; report and stop on HIGH or CRITICAL risk.

## Current State

- Current `0000` has 271 tables, 607 foreign keys, 536 indexes and large managed integrity blocks.
- Current scripts assume exactly one `0000`; production preflight expects one ledger row.
- Local `elevenhouse` has 264 tables and an older ledger hash, so it is not the reference schema.
- The pre-cutover source artifacts become read-only reference input for the equivalence suite; they never remain a deployable lineage.

## Target Phase Order

| Phase | Scope | Dependencies |
| --- | --- | --- |
| 0000 | extensions and identity | none |
| 0001 | audit log, outbox, products, media, platform billing | identity |
| 0002 | clients, profile, verification, dictionary, calculations, matrix | identity, media |
| 0003 | scheduling and booking integrity | identity, products |
| 0004 | Flows definitions/runtime | identity, clients, audit/outbox prerequisites |
| 0005 | Flows signals, work items and integrity | 0004, scheduling |
| 0006 | messaging and AI usage | identity, media |
| 0007 | Finance foundation | identity, clients, products, scheduling, outbox, platform billing |
| 0008 | Finance payments, wallet, ledger, refunds, payouts, bank and settlement | 0007 |
| 0009 | Finance integrity and remaining cross-module objects | 0008 |

Splitting a phase is allowed only to satisfy an observed FK/function/trigger dependency. Phases must not be merged across Flows/Finance ownership merely to reduce file count.

## Files

- Create `packages/db/scripts/migration-lineage.ts` and test: pure lineage manifest, artifact hashes and journal/snapshot validation.
- Create `packages/db/scripts/migration-lineage-spike.integration.ts`: staged-schema generation spike with a real cross-module FK.
- Create `packages/db/scripts/rebuild-forward-migration-lineage.ts` and test: fail-closed candidate builder.
- Create `packages/db/scripts/migration-catalog-manifest.ts` and test: stable PostgreSQL catalog manifest/digest.
- Create `packages/db/src/forward-migration-lineage.integration.ts`: reference-versus-candidate database proof.
- Modify `packages/db/drizzle/**`, `packages/db/package.json`, all `augment-*-baseline.ts`, `consolidate-prelaunch-baseline.*`, `production-baseline-plan.ts`, `production-baseline-preflight.*`, `fresh-baseline-migration.integration.ts` and preflight integration tests.
- Modify deployment files only if tests prove the current migrator cannot hold the same advisory lock across preflight and migrate.
- Modify ADR 0006, ADR 0012, commands and DB runbook to retire mutable-baseline operation.

## Task 1: Capture reference and prove the generation mechanism

**Interfaces:**

```ts
export type MigrationArtifact = {
  index: number; tag: string; sqlPath: string; snapshotPath: string;
  snapshotId: string; previousSnapshotId: string; digest: string; journalWhen: string;
};
export type MigrationLineage = { artifacts: readonly MigrationArtifact[]; manifestDigest: string };
export function readLineage(directory: string): MigrationLineage;
export function assertLinearLineage(lineage: MigrationLineage): void;
```

- [ ] Re-read and hash current migration artifacts without modifying them.

  ```bash
  git diff -- packages/db/drizzle packages/db/package.json packages/db/scripts
  shasum -a 256 packages/db/drizzle/0000_sticky_rictor.sql packages/db/drizzle/meta/0000_snapshot.json packages/db/drizzle/meta/_journal.json
  ```

  Expected: record three reference hashes; never restore them over concurrent work.

- [ ] Write `migration-lineage.test.ts` first. Cover valid two-phase lineage, index gap, duplicate index, missing SQL, non-linear `prevId`, duplicate journal tag and changed artifact digest. Require stable `MIGRATION_LINEAGE_*` errors.

- [ ] Confirm it is red.

  ```bash
  pnpm exec vitest run packages/db/scripts/migration-lineage.test.ts
  ```

  Expected: failure from missing parser export.

- [ ] Implement parser/validator. Accept only regular files, contiguous indexes from zero, matching SQL/journal tags and coherent snapshot parents. Hash exact SQL bytes; never mutate a directory.

- [ ] Run test green.

  ```bash
  pnpm exec vitest run packages/db/scripts/migration-lineage.test.ts
  ```

- [ ] Write and run the generation spike. It creates private temporary schema entrypoints: phase A exports identity, phase B adds a table with FK to identity. It generates twice into private output, asserts a valid Drizzle lineage, migrates a random approved local test database and asserts the FK exists in `pg_constraint`.

  ```bash
  set -a; source .env; set +a
  INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/scripts/migration-lineage-spike.integration.ts
  ```

  Expected: valid snapshot chain and PostgreSQL FK. If it fails, do not touch active artifacts; build the deterministic snapshot-model fallback in Task 2.

## Task 2: Build a private candidate lineage

**Interfaces:**

```ts
export type PhasePlan = {
  index: number; name: string; schemaEntrypoint: string;
  integrityAugmenters: readonly string[]; expectedObjects: readonly string[];
};
export async function buildCandidateLineage(input: {
  sourceManifest: MigrationLineage; outputDir: string; phasePlan: readonly PhasePlan[];
}): Promise<MigrationLineage>;
```

- [ ] Write red tests in a private temporary directory. Assert changed source manifest fails before promotion, an augmenter cannot write a foreign phase, a phase cannot use a dependency outside its closure, and injected generator failure leaves the original directory byte-identical.

- [ ] Run red test.

  ```bash
  pnpm exec vitest run packages/db/scripts/rebuild-forward-migration-lineage.test.ts
  ```

- [ ] Implement the builder using the successful Task 1 mechanism. It generates all phase schema closures in a private directory, runs only explicit phase augmenters, validates full lineage and prints phase object manifests in dry-run. If Task 1 rejected staged generation, implement the catalog-model fallback that emits and validates each intermediate snapshot; do not hand-edit JSON.

- [ ] Change each `augment-*-baseline.ts` to require an explicit migration path and verify owned table/marker presence. Preserve integrity-SQL bodies byte-for-byte unless catalog equivalence exposes a necessary order fix.

- [ ] Run private-builder checks.

  ```bash
  pnpm exec vitest run packages/db/scripts/rebuild-forward-migration-lineage.test.ts
  pnpm --filter @elevenhouse/db exec tsx scripts/rebuild-forward-migration-lineage.ts --dry-run
  ```

  Expected: source digest and ordered candidate manifest, without writing active `packages/db/drizzle`.

## Task 3: Prove exact catalog equivalence

**Interfaces:**

```ts
export type CatalogManifest = { digest: string; extensions: unknown[]; types: unknown[]; relations: unknown[]; columns: unknown[]; constraints: unknown[]; indexes: unknown[]; routines: unknown[]; triggers: unknown[] };
export async function readApplicationCatalogManifest(client: Client): Promise<CatalogManifest>;
export function assertCatalogEquivalent(reference: CatalogManifest, candidate: CatalogManifest): void;
```

- [ ] Write red unit fixtures for ordering stability and semantic changes to a default, FK action, check predicate, partial-index predicate, routine body and trigger enablement.

- [ ] Implement deterministic readers over `pg_extension`, `pg_type`, `pg_class`, `pg_attribute`, `pg_attrdef`, `pg_constraint`, `pg_index`, `pg_proc` and `pg_trigger`; normalize definitions through `pg_get_*def`. Exclude system namespaces and the `drizzle` ledger.

- [ ] Run manifest tests green.

  ```bash
  pnpm exec vitest run packages/db/scripts/migration-catalog-manifest.test.ts
  ```

- [ ] Create `forward-migration-lineage.integration.ts`. It creates two random approved local databases. Reference applies an immutable temporary copy of current `0000`; candidate applies the private lineage. It requires equal catalog manifests, validates intentionally different ledger lengths, seeds candidate, reruns migrate and requires no ledger/catalog change. Cleanup drops only its random databases with `WITH (FORCE)`.

- [ ] Run equivalence proof.

  ```bash
  set -a; source .env; set +a
  INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/forward-migration-lineage.integration.ts
  ```

  Expected: identical catalog digest and candidate no-op migration.

## Task 4: Promote the validated lineage and harden operation

- [ ] Before modifying existing functions, run GitNexus upstream impact for `mergePrelaunchBaselineSql`, `assessProductionBaselinePreflight`, `isCurrentBaselineHistory` and all changed augmenter functions. Review direct callers/processes; stop on HIGH/CRITICAL.

- [ ] Write red tests: existing artifact rewrite rejected, consolidation command fails with a retired-tool error, preflight accepts exact ordered lineage only, and competing migrator cannot acquire its advisory lock.

- [ ] Re-read migration target diffs/hashes. Promote the private candidate only if its captured source manifest still matches. Use an exact allowlisted atomic replacement; never broad-delete `drizzle/`, hand-merge snapshot JSON or preserve `0000` as deployable input.

- [ ] Replace single-hash `currentBaseline` with ordered `ApprovedLineage`; preflight must reject missing, unknown, reordered or divergent ledger entries while retaining Flows reconciliation.

- [ ] Retire `consolidate-prelaunch-baseline` from public operation. It must fail closed after cutover instead of mutating an existing migration.

- [ ] Make `db:generate` validate the current committed lineage and append only a new migration. `db:migrate` remains the sole migrator. Add a transaction-level advisory lock at the db-migrator boundary that covers preflight and migration, never an API request runtime.

- [ ] Run focused checks.

  ```bash
  pnpm exec vitest run packages/db/scripts/migration-lineage.test.ts packages/db/scripts/rebuild-forward-migration-lineage.test.ts packages/db/scripts/consolidate-prelaunch-baseline.test.ts packages/db/scripts/production-baseline-preflight.test.ts
  set -a; source .env; set +a
  INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/fresh-baseline-migration.integration.ts packages/db/src/production-baseline-preflight.integration.ts packages/db/src/forward-migration-lineage.integration.ts
  ```

  Expected: only full lineage passes; malformed ledger and old one-baseline assumptions fail.

## Task 5: Local reset rehearsal

- [ ] Add a script that prints only parsed protocol, host, port, database and user for the configured target. Do not print credentials.

- [ ] Confirm the exact destructive target immediately before reset.

  ```bash
  docker compose ps postgres
  docker port "$(docker compose ps -q postgres)" 5432/tcp
  pnpm --filter @elevenhouse/db exec tsx scripts/print-local-database-target.ts
  ```

  Expected: active Docker PostgreSQL and `localhost:5432/elevenhouse` under user `elevenhouse`; otherwise stop.

- [ ] Re-run candidate equivalence proof, then execute the authorized reset.

  ```bash
  NODE_ENV=development pnpm db:reset
  pnpm db:migrate
  ```

  Expected: only local `public`/`drizzle` schemas are recreated, seed succeeds, and second migrate is no-op.

- [ ] Run catalog digest, focused DB tests, then repository gate.

  ```bash
  pnpm verify
  ```

## Task 6: Document and cut over dev server

- [ ] Update ADR 0006, ADR 0012, commands and DB runbook: pre-launch reset is consumed; normal evolution is append-only; mutable consolidation is retired; exact target preflight/equivalence is mandatory.

- [ ] Run documentation/deployment checks.

  ```bash
  pnpm docs:check:test
  pnpm docs:check
  pnpm exec vitest run packages/db/src/production-deploy-hardening.test.ts packages/db/src/prelaunch-production-reset-deploy.test.ts
  ```

- [ ] Inspect dev server read-only: exact SSH target, compose project, running PostgreSQL container/database/user, writer services, ledger and disposable-environment marking. Stop on any identity mismatch.

- [ ] Only after all local gates are green: create a timestamped safety backup, quiesce identified writers through existing deployment procedure, reset only the confirmed dev database, migrate, seed, and start/restart only via the established deploy path.

- [ ] Verify dev ledger sequence, catalog digest, readiness endpoints, focused authenticated API smoke, and no-op second migrate. Keep backup until these gates pass.

## Acceptance and Recovery

- Unit tests validate lineage metadata and immutable generation.
- Integration proves the reference and candidate catalogs are equal across tables, columns, types, defaults, constraints, indexes, functions, triggers and extensions.
- Local reset occurs only after equivalence proof; dev reset occurs only after local evidence.
- Candidate-build failure leaves active migrations untouched. A catalog mismatch blocks destructive reset. A reset retry requires fresh exact target preflight; no Docker prune, volume deletion or production operation is a recovery step.

## Progress

- [x] 2026-08-06 — Research: current baseline coupling, local drift, Drizzle metadata behavior, PostgreSQL locking and dependency graph inspected.
- [x] 2026-08-06 — User approved multi-migration cutover, local proof and subsequent dev-server reset.
- [x] 2026-08-06 — Task 1: captured current reference artifact hashes; parser unit tests and generated/custom staged-schema PostgreSQL spike are green.
- [ ] Task 2 — Candidate lineage builder.
- [ ] Task 3 — Catalog equivalence suite.
- [ ] Task 4 — Artifact/tooling cutover.
- [ ] Task 5 — Local reset rehearsal.
- [ ] Task 6 — Documentation and dev cutover.
