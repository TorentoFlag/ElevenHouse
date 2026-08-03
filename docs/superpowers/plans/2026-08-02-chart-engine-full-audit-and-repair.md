# Chart Engine Full Audit and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse shared-main
> policy overrides generic worktree guidance: use the existing checkout on
> `main`, preserve concurrent work and stage exact owned paths only.

**Goal:** Repair and prove the complete ElevenHouse Chart Engine so every
implemented mode is strict, numerically auditable, concurrency-safe,
identity-safe, recoverable, localized and verified through the deployed
production surface.

**Architecture:** Shared Zod/domain contracts define civil-time, method-version
and canonical-output truth. A pinned, process-serialized Python provider returns
provenance-rich results; PostgreSQL owns durable jobs, leases, fencing and
calculation replacement; BullMQ transports identifiers only. The frontend
renders authoritative participants and independent state machines through the
existing app-owned route and exact ElevenHouse visual language.

**Tech Stack:** TypeScript 6, Zod, NestJS 11, Drizzle/PostgreSQL 17,
BullMQ/Redis 8, React 19, TanStack Query 5, Vite 8, Python 3.12, FastAPI,
Pydantic 2, Kerykeion 5.12.9, PySwissEph 2.10.3.2, Vitest, pytest, Docker and
real Chrome/browser evidence.

## Global Constraints

- The normative design is
  `docs/superpowers/specs/2026-08-02-chart-engine-full-audit-and-repair-design.md`.
- Work in `/Users/anton/Finext/ElevenHouse` on `main`; do not create a branch or
  worktree and do not use checkout, switch, stash, rebase or cherry-pick.
- The user explicitly authorized local service/Docker lifecycle, commit, push,
  production chart testing and creation/deletion of namespaced test data.
- Preserve all unowned dirty/untracked work and the shared index. Re-read each
  target plus `git diff -- <path>` immediately before editing. Stage exact owned
  paths only.
- No production fallback, mock success, guessed provider response, silently
  substituted coordinate, partial chart or browser-only business authority.
- New behavioral code follows strict red -> observed expected failure -> minimal
  green -> refactor. Critical acceptance uses the real provider, PostgreSQL,
  Redis, HTTP pipeline and browser; a mock-only test cannot close a claim.
- All nine UI modes are in scope: natal, child chart, transit, synastry,
  composite, solar return, progression, horary and astrocartography. Persisted
  provider methods remain the existing eight-method union because child chart
  intentionally uses natal mathematics.
- Birth/event dates are real calendar dates, times are `00:00` through `23:59`,
  timezones are IANA identifiers, coordinates are finite, and zero latitude or
  longitude is valid.
- Ambiguous local time requires `first` or `second`; nonexistent local time is
  rejected. Placidus/Kerykeion input with `abs(latitude) > 66` is rejected with
  `unsupported_latitude_for_house_system`; no latitude or house-system fallback
  is allowed.
- Pin `kerykeion==5.12.9` and `pyswisseph==2.10.3.2`. Persist and fingerprint
  actual provider/backend provenance; never hard-code Swiss Ephemeris when the
  returned flags identify Moshier.
- New calculations use `chart-request.v2`/`chart-result.v2` and carry exact
  method/provider provenance. Existing `chart-result.v1` payloads remain
  parseable as legacy read-only records, but are excluded from reuse, AI, PDF,
  linking/publication and current-result claims until an explicit recalculation
  produces v2. Never synthesize provenance for historical v1 data.
- Secondary progression v2 uses one symbolic day per `365.24219` life days,
  preserves a fractional UTC `symbolicInstant`, and rejects target dates before
  birth. Solar return must be within `0.0001` degrees of the natal Sun.
- One provider operation may run at a time in each Python process. Throughput is
  increased with processes/replicas only after deterministic stress evidence.
- PostgreSQL is job authority. Completion/failure requires the current worker
  identity plus lease generation; BullMQ stalled or duplicate delivery cannot
  overwrite a newer/terminal state.
- UI copy for the chart-owned surface ships in both `ru` and `en`. Mobile
  operated controls are at least 44 CSS pixels; disabled reasons are not exposed
  only through `title`.
- Do not package Swiss Ephemeris data files or claim commercial entitlement
  without recorded license authority. Missing license evidence is a deployment
  blocker, not permission to change runtime silently.
- Production database reset is forbidden. Local reset is allowed only after the
  exact local ElevenHouse DB/port is proven according to
  `docs/development/commands.md`.

---

## Purpose / Big Picture

An astrologer can select the correct CRM client(s), resolve valid birth data,
run any approved chart mode, reload while its durable job is processing, and
receive the same canonical result after duplicate delivery or worker recovery.
Saved calculations keep the right participants; recalculation replaces the
specified result and invalidates stale AI/PDF/publication artifacts atomically.

The screen exposes honest and independent client, calculation, Dictionary, AI,
PDF and linking states. Russian and English desktop/mobile views retain the
reference visual language, and astrocartography uses real geographical
boundaries plus a non-visual line list. The pushed revision is accepted only
after observed deployment and namespaced production smoke with residue cleanup.

This is one vertical plan rather than three subsystem plans because the
method-version, civil-time, participant and lease interfaces are load-bearing
across every deployable. Each task is nevertheless an independently testable
and separately reviewed deliverable.

## Progress

- [x] 2026-08-02: read project intake, architecture, product, API, testing,
      database, browser and Git runbooks plus applicable ElevenHouse/Superpowers
      skills.
- [x] 2026-08-02: completed parallel engine/contracts, backend/data/worker and
      frontend/product/design audits without editing implementation files.
- [x] 2026-08-02: reproduced DST, progression, polar, ephemeris-provenance,
      recalculation, lease/fencing, participant and frontend state defects.
- [x] 2026-08-02: user approved the four-section vertical repair design; design
      spec self-reviewed and committed as `6e9ab39`.
- [x] 2026-08-02: implementation plan self-review separated legacy v1 reads
      from reproducible v2 capabilities, added execution-profile/place-reference
      prerequisites, removed conditional file placeholders and passed Prettier,
      `docs:check:test`, `docs:check` and diff-check gates.
- [x] 2026-08-03: independent plan QC confirmed all five prior Critical/
      Important findings closed: consent authority, actual-execution
      fingerprinting, executable v1-to-v2 production reconciliation, complete
      shared-main DB-generator ownership and self-contained runtime commands.
      No new Critical/Important inconsistency was found.
- [x] 2026-08-02: fresh baseline rerun passed 18 Python tests and 250 focused
      Vitest tests; astrologer-web typecheck reproduced only the known stale
      Nominatim fixture failure.
- [x] 2026-08-03: merged the two remote chart-linking commits into shared
      `main` as `dabc511` after exact blob verification. Post-merge runtime had
      web `5174` and astrologer API `3002` listening, `/health` returned `ok`,
      PostgreSQL/Redis/MinIO were healthy and `3012`/`8012` were closed. Fresh
      baseline passed 18/18 Python and 22-file/250-test Vitest checks; web
      typecheck retained only the recorded Nominatim-to-Geoapify fixture red.
- [x] 2026-08-03: Task 2 shipped in `aefe835`, `22f6027` and `29f06c3` after
      two review/fix rounds. Fresh verification passed 5 files/57 tests,
      contracts typecheck/build and domain build. Domain full typecheck remains
      externally blocked only by the unowned Flow mock mismatch at
      `flow-definition-control-plane.test.ts:360` and is carried to the next
      shared/repository gate.
- [x] 2026-08-03: Task 3 shipped in `a85d811`, `d6fd291` and `51f22f5` after
      two review/fix rounds. Clean provider and Docker evidence proved actual
      Moshier flags, strict v2 HTTP, bounded process-cancelled readiness, real
      artifact-derived Swiss provenance, recomputable natal/solar fingerprints
      and cleanup. Fresh verification passed 82/82 pytest, compileall, exact
      dependency versions, diff check and no task container/listener residue.
- [x] Task 1: synchronize shared main and capture executable baseline.
- [x] Task 2: strict contracts, method versions and civil-time domain.
- [x] Task 3: strict Python ingress, DST, provider runtime and readiness.
- [ ] Task 4: numerical method repair and golden fixtures.
- [ ] Task 5: abortable chart-engine client and failure taxonomy.
- [ ] Task 6: durable job schema, participants, retry authority and fencing.
- [ ] Task 7: target recalculation, archival and artifact lifecycle.
- [ ] Task 8: client-granted chart-AI consent and durable usage evidence.
- [ ] Task 9: worker lease heartbeat, cancellation and DB-derived retries.
- [ ] Task 10: production reconciliation, observability and safe smoke cleanup.
- [ ] Task 11: frontend URL, identity, birth-draft and capability models.
- [ ] Task 12: controller recovery and independent async state machines.
- [ ] Task 13: focused UI, RU/EN, mobile/a11y and real map.
- [ ] Task 14: local network-backed E2E and visual acceptance matrix.
- [ ] Task 15: affected/repository gates and whole-change code review.
- [ ] Task 16: safe Git synchronization, push, deployment and production
      acceptance/cleanup.

Update this section after each clean task review, including partial or blocked
acceptance and the exact commit range.

## Surprises & Discoveries

- The legacy automated baseline is deceptively green: 3,076 repository unit
  tests, 16 targeted DB integration tests, 18 Python tests and 177 focused
  frontend tests passed while adversarial probes reproduced release-blocking
  behavior.
- Current Kerykeion 5.12.9 ignores ElevenHouse `dstOccurrence` because the
  adapter omits `is_dst`; both sides of a fold and a spring gap reach HTTP 500.
- A sync readiness endpoint is not bounded merely because an HTTP caller has a
  timeout. Task 3 now holds the provider lock while a spawned sentinel process
  runs under one total deadline and terminates/joins timed-out children before
  returning a typed readiness failure.
- Kerykeion silently clamps high latitude to `+/-66`; ElevenHouse currently
  returns the original coordinate and no warning.
- Requests using `FLG_SWIEPH` can return `FLG_MOSEPH` when planetary data files
  are absent; current metadata always says `swiss-ephemeris`.
- Progression currently advances by completed integer birthdays, so dates
  within the same year produce identical results and pre-birth dates become
  natal success.
- The shared checkout initially had remote chart-linking commits represented as
  local modifications while `main` was behind `origin/main`; they must become
  baseline history before owned frontend edits are staged.
- Git's merge preflight rejected those four tracked paths even though every
  worktree blob matched `origin/main`. After re-verifying the only remote diff,
  the merge used temporary `skip-worktree` flags on exactly those four paths;
  the flags were removed immediately and every post-merge worktree blob was
  checked against `HEAD` before continuing.
- The active design reference contains desktop `EngineView`; its prototype
  `MobileEngine` branch is disabled. The approved mobile contract therefore
  combines the app-shell mobile navigation reference with the exact desktop
  engine visual language and the accessibility/product decisions in the design
  spec. This deviation must be recorded in browser evidence.
- There is no implemented consent bounded context for external chart AI. The
  approved design requires a current client-granted purpose/provider/policy-
  version consent before every external generation; data minimization is
  additional protection, not a consent substitute. Existing records receive no
  synthetic backfill. Manual CRM clients without an auth identity cannot grant
  consent and therefore remain fail-closed until a separate secure account-
  claim/merge workflow is approved.
- Chart AI currently sends an unnecessary result checksum to OpenAI, and the AI
  module wires a no-op usage recorder. Both violate the approved privacy/
  operational evidence contract and are included in the consent repair.
- The persisted result schema is currently only `chart-result.v1`. Making v2
  provenance fields globally required would either break historical reads or
  fabricate facts. The rollout therefore needs an explicit legacy-read/current-
  capability split and a recalculation-required state.
- The first Task 2 review proved that additive v2 strictness can still break
  legacy reads when v1 and v2 reuse nested schemas. Frozen v1 civil-time,
  render, astrocartography and synastry shapes are now separate; every future
  v2 refinement must preserve that boundary explicitly.
- After the baseline fetch, `main` is six commits ahead/two behind with a clean
  shared index. Ports 3002/3012/8012 are closed; web 5174 is listening;
  PostgreSQL/Redis/MinIO are healthy on documented local ports.
- Concurrent Flows work currently owns dirty baseline migration, snapshot and
  journal files. Chart schema generation must not overwrite or commit those
  changes; Task 6 can generate only after their current intent is preserved in
  shared history or exact ownership is otherwise cleanly separable.

Append dated discoveries with command, log, schema or browser evidence as the
work changes later tasks.

## Decision Log

- **2026-08-02, user:** use full vertical repair, not temporary mode disablement,
  module-only patches or a speculative provider rewrite.
- **2026-08-02, calculation:** unsupported polar Placidus calculations fail
  closed; no coordinate/house fallback.
- **2026-08-02, progression:** v2 maps elapsed life days continuously using a
  `365.24219`-day tropical year and stores the fractional UTC symbolic instant.
  Rationale: a target date must change fast points continuously and the method
  must be explicit/auditable.
- **2026-08-02, runtime:** exact dependencies are Kerykeion 5.12.9 and
  PySwissEph 2.10.3.2; each process serializes provider work.
- **2026-08-02, compatibility:** `chart-result.v1` remains a truthful legacy
  read model only. Every new provider response is `chart-result.v2`; reusable or
  externally consumable results must pass the v2 reproducibility guard.
- **2026-08-03, AI data boundary:** external chart AI requires a purpose-specific
  immutable client consent record for each client/astrologer relationship and
  every persisted calculation participant. The astrologer cannot self-attest.
  The provider context is still minimized and excludes checksum/identity/raw
  inputs. Production generation additionally requires recorded processor/
  cross-border legal authority; absent authority keeps the feature disabled.
- **2026-08-02, async:** PostgreSQL lease generation is the fencing token;
  BullMQ is transport and uses DB-stored `maxAttempts`.
- **2026-08-02, recalculation:** same-ID replacement uses expected checksum and
  invalidates AI, publication and PDF/artifacts atomically.
- **2026-08-02, relationships:** synastry/composite persist ordered subject and
  partner participants with calculation mode `compatibility`.
- **2026-08-02, frontend:** result/link authorization is based on saved
  calculation participants, never selected-client fallback.
- **2026-08-02, map:** use committed Natural Earth 1:110m land boundaries
  (public-domain dataset) with the existing equirectangular projection; no tile
  provider or decorative continent ellipses.
- **2026-08-02, execution:** user already selected a team/orchestrator workflow;
  execute with subagent-driven development without another execution-choice
  prompt.

## Outcomes & Retrospective

No implementation outcome is claimed yet. At completion, replace this paragraph
with shipped behavior, exact verification, production revision, cleanup proof,
unresolved blockers and lessons. Passing tests without required runtime/browser
evidence remain partial.

## Context and Orientation

The request path is:

```text
astrologer-web /chart-engine
  -> astrologer-api /charts/*/jobs (session + CSRF + CRM hydration)
  -> PostgreSQL chart_calculation_jobs + outbox event {jobId}
  -> chart-worker / BullMQ
  -> private chart-engine /v1/*
  -> canonical result validation
  -> calculation_records + participants + job terminal state
  -> owner-scoped API poll/result + generic saved-calculation metadata
```

Primary current paths:

- contracts: `packages/contracts/src/charts.ts`;
- civil-time readiness/domain ports: `packages/domain/src/charts/`;
- provider client: `packages/chart-engine-client/src/chart-engine-client.ts`;
- Python runtime: `apps/chart-engine/src/chart_engine/`;
- API composition: `apps/astrologer-api/src/modules/charts/`;
- worker: `apps/chart-worker/src/`;
- DB job adapter/schema: `packages/db/src/adapters/charts/` and
  `packages/db/src/schema/calculations/`;
- generic replacement/artifacts: `packages/db/src/adapters/calculations/` and
  calculation schemas;
- production reconciliation: `packages/db/scripts/reconcile-production-baseline.ts`;
- frontend: `apps/astrologer-web/src/features/charts/` and
  `apps/astrologer-web/src/pages/chart-engine/`;
- exact visual evidence: `ElevenHouseDesign/app/engine*.jsx`, `wheel.jsx`,
  `styles.css` and inventory row
  `docs/architecture/design-reference-inventory.md:199`.

`chart method` is the provider/persisted mathematical method. `UI mode` is the
product presentation; `child_chart` maps to `natal` mathematics. `lease
generation` is a monotonically increasing token issued by PostgreSQL for each
claim. `civil-time occurrence` chooses one of two instants during a timezone
fold.

## Interfaces and Dependencies

Task 2 owns these shared values and types:

```ts
export const chartMethodVersions = {
  natal: "chart.natal.kerykeion-5.12.v2",
  astrocartography: "chart.astrocartography.swisseph.v2",
  transit: "chart.transit.kerykeion-5.12.v2",
  synastry: "chart.synastry.kerykeion-5.12.v2",
  composite: "chart.composite.kerykeion-5.12.v2",
  solar_return: "chart.solar-return.kerykeion-5.12.v2",
  progression: "chart.progression.secondary-tropical-year.v2",
  horary: "chart.horary.kerykeion-5.12.v2"
} as const;

export type ChartExecutionProfile = {
  readonly provider: "kerykeion";
  readonly kerykeionVersion: "5.12.9";
  readonly pyswissephVersion: "2.10.3.2";
  readonly expectedEphemeris: "swiss-ephemeris" | "moshier";
  readonly expectedEphemerisFlags: readonly string[];
  readonly expectedEphemerisDataRevision: string | null;
};

export type ChartCivilTimeResolution =
  | { readonly kind: "resolved"; readonly instant: string; readonly occurrence: null }
  | { readonly kind: "ambiguous"; readonly firstInstant: string; readonly secondInstant: string }
  | { readonly kind: "nonexistent" };

export function inspectChartCivilTime(input: {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
}): ChartCivilTimeResolution;

export function resolveChartCivilTime(input: {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
  readonly dstOccurrence: "first" | "second" | null;
}): { readonly instant: string; readonly dstOccurrence: "first" | "second" | null };
```

Provider metadata and progression basis become:

```ts
type ChartProviderMetadata = {
  name: "kerykeion";
  version: string;
  ephemeris: "swiss-ephemeris" | "moshier";
  pyswissephVersion: string;
  ephemerisFlags: readonly string[];
  ephemerisDataRevision: string | null;
};

type ChartProgressionCalculationBasis = {
  symbolicInstant: string;
  elapsedLifeDays: number;
  elapsedYears: number;
  yearLengthDays: 365.24219;
  dayForYearRatio: 1;
};

type ReproducibleChartResult = {
  schemaVersion: "chart-result.v2";
  methodVersion: (typeof chartMethodVersions)[ChartCalculationMethod];
  provider: ChartProviderMetadata;
  reproducibilityFingerprint: `sha256:${string}`;
  calculationBasis?: ChartProgressionCalculationBasis;
  // Existing method-specific canonical fields follow.
};

// chartResultSchema is a discriminated union of the historical v1 read shape
// and strict v2. This guard is the only route into reuse/AI/PDF/link/publish.
export function isReproducibleChartResult(value: unknown): value is ReproducibleChartResult;
```

Each internal `chart-request.v2` carries its method version and
`ChartExecutionProfile`; both participate in the canonical request/dedup
fingerprint. The API gets the profile from a production-required chart-specific
config provider. The worker compares it with `/ready` before provider work.
After calculation, the engine computes a separate reproducibility fingerprint
over the method version, normalized settings/basis and actual returned provider
versions, backend, sorted Swiss flags and data revision. The worker recomputes
and verifies it; DB completion persists it atomically. Reuse, AI, PDF,
link/publish and current-result capabilities require a valid v2 post-execution
fingerprint whose actual profile matches the configured request profile.

Task 6 owns the durable job interfaces used by Tasks 7 and 8:

```ts
export type ChartCalculationParticipant = {
  readonly role: "subject" | "partner";
  readonly clientId: string;
};

export type ChartJobLease = {
  readonly lockedBy: string;
  readonly leaseGeneration: number;
  readonly lockedUntil: string;
};

export type ChartJobForProcessing = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly method: ChartCalculationMethod;
  readonly status: "processing";
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
  readonly participants: readonly ChartCalculationParticipant[];
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly targetCalculationId: string | null;
  readonly expectedSourceChecksum: string | null;
  readonly lease: ChartJobLease;
};
```

`ChartJobProcessingStore.claimForProcessing` accepts
`{jobId, workerId, now, leaseMs}`. `extendLease`, `complete` and `fail` require
`workerId + leaseGeneration`; terminal writes are compare-and-set.

Task 11 owns pure frontend models; Task 12 consumes them:

```ts
export type ChartEngineUrlState = {
  mode: ChartEngineMode;
  clientId: string | null;
  partnerClientId: string | null;
  jobId: string | null;
  calculationId: string | null;
  transitDate: string | null;
  transitTime: string | null;
  solarReturnYear: number | null;
  progressionTargetDate: string | null;
  horaryPlaceProvider: "geoapify" | null;
  horaryPlaceId: string | null;
};

export type ChartCalculationIdentityState =
  | { readonly kind: "pending" }
  | {
      readonly kind: "ready";
      readonly subjectClientId: string;
      readonly partnerClientId: string | null;
    }
  | { readonly kind: "client_mismatch" }
  | { readonly kind: "partner_mismatch" }
  | { readonly kind: "unavailable" };
```

## Planned File Structure

Focused new files:

```text
packages/domain/src/charts/chart-civil-time.ts
packages/domain/src/charts/chart-civil-time.test.ts
packages/domain/src/charts/chart-recalculation.ts
packages/domain/src/charts/chart-recalculation.test.ts
apps/chart-engine/src/chart_engine/civil_time.py
apps/chart-engine/src/chart_engine/provider_runtime.py
apps/chart-engine/src/chart_engine/canonical_validation.py
apps/chart-engine/tests/test_request_validation.py
apps/chart-engine/tests/test_civil_time.py
apps/chart-engine/tests/test_provider_runtime.py
apps/chart-engine/tests/test_output_invariants.py
apps/chart-engine/tests/test_numeric_fixtures.py
packages/db/src/adapters/charts/chart-calculation-job-row.ts
packages/db/src/adapters/charts/chart-calculation-replacement.ts
apps/astrologer-api/src/modules/charts/chart-execution-profile.provider.ts
apps/astrologer-api/src/modules/charts/chart-execution-profile.provider.test.ts
packages/contracts/src/client-data-consents.ts
packages/domain/src/clients/client-consent-policy.ts
packages/domain/src/clients/client-consent-use-cases.ts
packages/db/src/schema/clients/client-data-consents.schema.ts
packages/db/src/schema/ai/ai-usage-records.schema.ts
apps/public-api/src/modules/client-consents/client-consents.module.ts
apps/client-web/src/pages/me/ClientDataConsentSection.tsx
apps/astrologer-web/src/features/charts/model/chartEngineUrlState.ts
apps/astrologer-web/src/features/charts/model/chartEngineUrlState.test.ts
apps/astrologer-web/src/features/charts/model/chartCalculationIdentity.ts
apps/astrologer-web/src/features/charts/model/chartCalculationIdentity.test.ts
apps/astrologer-web/src/features/charts/model/chartBirthDataDraft.ts
apps/astrologer-web/src/features/charts/model/chartBirthDataDraft.test.ts
apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.ts
apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.test.ts
apps/astrologer-web/src/features/charts/components/ChartEngineHeader.tsx
apps/astrologer-web/src/features/charts/components/ChartEngineHeader.test.tsx
apps/astrologer-web/src/features/charts/components/ChartEngineActionBar.tsx
apps/astrologer-web/src/features/charts/components/ChartEngineActionBar.test.tsx
apps/astrologer-web/src/features/charts/components/ChartBirthDataEditor.tsx
apps/astrologer-web/src/features/charts/components/ChartBirthDataEditor.test.tsx
apps/astrologer-web/src/features/charts/components/ChartEngineWorkspace.tsx
apps/astrologer-web/src/features/charts/components/ChartEngineWorkspace.test.tsx
apps/astrologer-web/src/features/charts/components/AstrocartographyLineList.tsx
apps/astrologer-web/src/features/charts/components/AstrocartographyLineList.test.tsx
apps/astrologer-web/src/features/charts/assets/ne_110m_land.geojson
apps/astrologer-web/src/features/charts/assets/README.md
```

The large `ChartEnginePage.tsx`, controller and stylesheet are reduced by moving
stable responsibilities above. Do not split unrelated existing wheel/table
logic merely to reduce line counts.

## Plan of Work

The dependency order is strict:

```text
shared-main sync
  -> contracts/civil time/method versions
  -> Python runtime + numeric methods
  -> HTTP failure contract
  -> durable DB job + replacement
  -> client consent + durable AI usage
  -> worker lease/retry behavior
  -> frontend pure models + controller
  -> visible UI/i18n/a11y/map
  -> local E2E/visual matrix
  -> repository review -> push/deploy -> production acceptance
```

### Task 1: Synchronize Shared Main and Capture the Runtime Baseline

**Files:**

- Update through Git merge only: current branch history.
- Record discoveries/progress: this plan.

**Interfaces:**

- Produces: a `main` baseline containing the two current `origin/main` chart
  linking commits without staging their existing worktree representation.
- Produces: confirmed local listeners and dependency endpoints.

- [x] **Step 1: Verify the shared index and remote-equivalent chart paths**

Run:

```bash
git fetch origin
git branch --show-current
git diff --cached --name-status
git diff --quiet origin/main -- \
  apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx \
  apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx \
  apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts \
  apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
```

Expected: branch is `main`, cached diff is empty, and the four paths are
byte-equivalent to `origin/main`. If any differs, do not merge or stage it;
record the exact path as a shared semantic conflict.

- [x] **Step 2: Merge remote history without rebase/stash**

Run: `git merge --no-edit origin/main`

Expected: merge succeeds and preserves all unrelated dirty files. Confirm with
`git status --short --branch` and `git diff --cached --name-status`.

- [x] **Step 3: Capture read-only runtime state**

Run:

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
lsof -nP -iTCP:3012 -sTCP:LISTEN
lsof -nP -iTCP:8012 -sTCP:LISTEN
curl -fsS http://localhost:3002/health
docker compose ps postgres redis minio
```

Expected: record actual listeners; do not infer health from an old process.

- [x] **Step 4: Record baseline tests and current known failures**

Run:

```bash
(cd apps/chart-engine && .venv/bin/python -m pytest)
pnpm test packages/contracts/src/charts.test.ts \
  packages/chart-engine-client/src/chart-engine-client.test.ts \
  packages/domain/src/charts \
  apps/astrologer-api/src/modules/charts \
  apps/chart-worker/src/chart-jobs.processor.test.ts \
  apps/chart-worker/src/chart-jobs.queue.test.ts \
  apps/chart-worker/src/chart-jobs.outbox-relay.test.ts \
  apps/chart-worker/src/chart-worker-runtime.test.ts \
  apps/chart-worker/src/readiness.test.ts \
  apps/astrologer-web/src/features/charts \
  apps/astrologer-web/src/pages/chart-engine
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: record exact counts. The known Geoapify/Nominatim fixture mismatch is
the only accepted baseline red and remains red until Task 12 updates that chart
fixture against the already-accepted shared contract; any other failure is a
new discovery that must be diagnosed before implementation advances.

- [x] **Step 5: Update and commit plan progress if the merge did not already create a commit**

Use `apply_patch` for the plan update, stage this plan only, run
`git diff --check -- <plan>` and commit `docs: record chart engine execution baseline`.

### Task 2: Strict Contracts, Method Versions and Civil-Time Domain

**Files:**

- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/charts/chart-civil-time.ts`
- Create: `packages/domain/src/charts/chart-civil-time.test.ts`
- Create: `packages/domain/src/charts/chart-execution-profile.ts`
- Create: `packages/domain/src/charts/chart-execution-profile.test.ts`
- Modify: `packages/domain/src/charts/chart-birth-data-readiness.ts`
- Modify: `packages/domain/src/charts/chart-birth-data-readiness.test.ts`
- Modify: `packages/domain/src/charts/chart-errors.ts`
- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/domain/src/charts/index.ts`
- Modify: `packages/domain/src/clients/client-use-cases.ts`
- Modify: `packages/domain/src/clients/client-use-cases.test.ts`

**Interfaces:**

- Produces: `chartMethodVersions`, provider metadata and progression-basis
  shapes defined above.
- Produces: strict production/local parsing for `ChartExecutionProfile`; a
  production process has no backend default and fails config validation when
  expected ephemeris is absent.
- Produces: `inspectChartCivilTime` and `resolveChartCivilTime`.
- Consumes: `Temporal` from existing `@js-temporal/polyfill@0.5.1`.

- [x] **Step 1: Write strict failing contract tests**

Add literal cases that reject `2026-02-31`, `24:00`, `Not/AZone`, unknown
fields, duplicate point IDs/houses, self-aspects, duplicate normalized pairs,
unknown point references and invalid distribution keys/totals. Add a case that
requires `methodVersion` plus full provider provenance and a progression basis
with `symbolicInstant`, `elapsedLifeDays`, `elapsedYears`,
`yearLengthDays: 365.24219` and `dayForYearRatio: 1`.

Add explicit compatibility cases: a historical `chart-result.v1` payload still
parses through the legacy read union, but fails
`isReproducibleChartResult`; a complete v2 payload passes; no transform adds
method/provider fields to v1. New provider request schemas use
`chart-request.v2` and require the matching method version. Add fixed canonical
vectors proving request/dedup and post-execution reproducibility fingerprints
are distinct, key ordering is normalized, and any actual backend/flag/data
revision change alters the latter.

- [x] **Step 2: Run RED contracts**

Run: `pnpm test packages/contracts/src/charts.test.ts`

Expected: FAIL because lexical dates/times and relationally invalid results are
currently accepted and provenance/methodVersion are missing.

- [x] **Step 3: Write civil-time/readiness failing tests**

Use literal Europe/Berlin cases:

```ts
expect(
  inspectChartCivilTime({
    date: "2024-10-27",
    time: "02:30",
    timeZone: "Europe/Berlin"
  })
).toEqual({
  kind: "ambiguous",
  firstInstant: "2024-10-27T00:30:00Z",
  secondInstant: "2024-10-27T01:30:00Z"
});

expect(
  inspectChartCivilTime({
    date: "2024-03-31",
    time: "02:30",
    timeZone: "Europe/Berlin"
  })
).toEqual({ kind: "nonexistent" });
```

Also assert readiness requires an occurrence for the fold, resolves distinct
instants for first/second, rejects invalid calendar/time/timezone, normalizes an
irrelevant occurrence to `null`, and preserves zero coordinates.

Add execution-profile tests that require exact pinned versions, reject an
unknown backend/data revision, require `CHART_ENGINE_EXPECTED_EPHEMERIS` in
production, and permit the verified local Moshier profile only outside
production.

- [x] **Step 4: Run RED domain tests**

Run:

```bash
pnpm test packages/domain/src/charts/chart-civil-time.test.ts \
  packages/domain/src/charts/chart-execution-profile.test.ts \
  packages/domain/src/charts/chart-birth-data-readiness.test.ts \
  packages/domain/src/clients/client-use-cases.test.ts
```

Expected: FAIL because the resolver and strict readiness behavior do not exist.

- [x] **Step 5: Implement the minimal shared behavior**

Reuse the two-disambiguation candidate algorithm from
`availability/slot-projection.ts`:

```ts
const candidates = [
  Temporal.ZonedDateTime.from(fields, { disambiguation: "earlier" }),
  Temporal.ZonedDateTime.from(fields, { disambiguation: "later" })
];
```

Keep only candidates whose local plain datetime equals the requested value,
deduplicate/sort their instants, return nonexistent/one/two candidates, and
resolve the requested occurrence. Add Zod refinements for syntax and
cross-reference invariants; do not compute expectations with the same helper
used by tests.

- [x] **Step 6: Run GREEN and package gates**

Run:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test packages/domain/src/charts/chart-civil-time.test.ts \
  packages/domain/src/charts/chart-execution-profile.test.ts \
  packages/domain/src/charts/chart-birth-data-readiness.test.ts \
  packages/domain/src/clients/client-use-cases.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/domain build
```

Expected: all commands exit zero with no warnings.

- [x] **Step 7: Commit exact paths**

Commit subject: `fix: enforce canonical chart inputs and outputs`.

### Task 3: Strict Python Ingress, DST, Provider Runtime and Readiness

**Files:**

- Modify: `apps/chart-engine/pyproject.toml`
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/settings.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Create: `apps/chart-engine/src/chart_engine/civil_time.py`
- Create: `apps/chart-engine/src/chart_engine/provider_runtime.py`
- Create: `apps/chart-engine/src/chart_engine/canonical_validation.py`
- Create: `apps/chart-engine/tests/test_request_validation.py`
- Create: `apps/chart-engine/tests/test_civil_time.py`
- Create: `apps/chart-engine/tests/test_provider_runtime.py`
- Create: `apps/chart-engine/tests/provider_runtime_spike.py`
- Create: `apps/chart-engine/tests/test_output_invariants.py`
- Modify: `apps/chart-engine/tests/test_health.py`
- Modify: `apps/chart-engine/README.md`
- Modify: `deployment/docker/chart-engine.Dockerfile`
- Modify: `deployment/compose/compose.production.yml`

**Interfaces:**

- Consumes: Task 2 request/result contract and exact method-version strings.
- Produces: strict FastAPI 422 input behavior and readiness payload parsed by
  Task 5.

```py
class ProviderRuntime:
    def metadata(self) -> ProviderMetadata: ...
    def ready(self) -> ProviderMetadata: ...
    def calculate(self, operation: Callable[[], T]) -> T: ...
```

- [x] **Step 1: Run and record the clean provider spike**

Run this as one foreground shell so creation, validation and cleanup share the
same checked value:

```bash
set -euo pipefail
chart_spike_root="${TMPDIR:-/tmp}"
chart_spike_dir="$(mktemp -d "${chart_spike_root%/}/elevenhouse-chart-spike.XXXXXX")"
test -n "${chart_spike_dir:?}"
test -d "${chart_spike_dir:?}"
test ! -L "${chart_spike_dir:?}"
case "${chart_spike_dir:?}" in
  "${chart_spike_root%/}"/elevenhouse-chart-spike.*) ;;
  *) exit 91 ;;
esac
apps/chart-engine/.venv/bin/python -m venv "${chart_spike_dir:?}/venv"
"${chart_spike_dir:?}/venv/bin/python" -m pip install \
  'kerykeion==5.12.9' 'pyswisseph==2.10.3.2'
"${chart_spike_dir:?}/venv/bin/python" apps/chart-engine/tests/provider_runtime_spike.py
rm -rf -- "${chart_spike_dir:?}"
```

Create `apps/chart-engine/tests/provider_runtime_spike.py` first with literal
assertions/prints for `importlib.metadata.version("kerykeion")`,
`importlib.metadata.version("pyswisseph")`, `swe.version`, the returned flags
from a fixed `swe.calc_ut(2451545.0, swe.SUN, swe.FLG_SWIEPH | swe.FLG_SPEED)`,
and fixed Berlin-fold subjects built with `is_dst=True` and `is_dst=False`.
Commit the spike as a deterministic provider audit test. Do not download or
package `.se1` files without license authority.

- [x] **Step 2: Write RED request/civil-time tests**

Assert unknown top-level/nested fields, invalid dates/times/zones, NaN/infinite
coordinates, identical pair IDs, pre-birth progression/solar requests and
`abs(latitude) > 66` produce typed 422. Assert first/second Berlin fold requests
return distinct valid results and spring gap returns 422 rather than 500.

- [x] **Step 3: Write RED runtime/readiness/output tests**

Assert provider operations cannot overlap inside a process, readiness executes
a sentinel, reports exact versions/backend/flags/capabilities, fails on expected
version drift, every calculation route accepts only `chart-request.v2`, every
result is `chart-result.v2` with a verified actual-metadata reproducibility
fingerprint, and canonical validation rejects duplicate/self/unknown-reference
payloads before HTTP 200.

- [x] **Step 4: Run RED Python suite**

Run:

```bash
cd apps/chart-engine
.venv/bin/python -m pytest tests/test_request_validation.py \
  tests/test_civil_time.py tests/test_provider_runtime.py \
  tests/test_output_invariants.py tests/test_health.py -q
```

Expected: failures name current permissive schemas, ignored occurrence,
unconditional readiness, hard-coded backend and missing serialization.

- [x] **Step 5: Implement strict models and provider runtime**

Use a shared Pydantic base with `ConfigDict(extra="forbid")`, real `date`/time
parsing, `zoneinfo.ZoneInfo`, finite-number constraints and model validators.
Map `first -> is_dst=True`, `second -> is_dst=False`, exact -> `None` in
`_create_subject`. `ProviderRuntime.calculate` owns one `threading.Lock`; every
route, positions and AstroCalendar calculation enter through it.

Detect backend from returned Swiss flags:

```py
backend = "moshier" if flags & swe.FLG_MOSEPH else "swiss-ephemeris"
```

Pin the two provider packages exactly. Return readiness only after a bounded
sentinel validates versions, backend and a minimal canonical natal result.
`CHART_ENGINE_EXPECTED_EPHEMERIS` is required in production; the optional data
revision is required when the expected backend uses packaged Swiss data. Pass
the same required values to chart-engine, astrologer-api and chart-worker in
production Compose so all three compare one deployment profile.

- [x] **Step 6: Run GREEN provider suite and image build**

Run:

```bash
cd apps/chart-engine && .venv/bin/python -m pytest -q
docker build -f deployment/docker/chart-engine.Dockerfile -t elevenhouse-chart-engine:test .
```

Return to the repository root, then run the image with one fixed task-owned
name. Abort if the port or name is already occupied:

```bash
test -z "$(lsof -nP -iTCP:8012 -sTCP:LISTEN)"
test -z "$(docker ps -aq --filter 'name=^/elevenhouse-chart-engine-acceptance-20260803$')"
docker run --detach --rm \
  --name elevenhouse-chart-engine-acceptance-20260803 \
  --publish 127.0.0.1:8012:8012 \
  --env CHART_ENGINE_EXPECTED_EPHEMERIS=moshier \
  --env CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS=moshier,speed \
  elevenhouse-chart-engine:test
chart_engine_container_id="$(docker inspect --format '{{.Id}}' \
  elevenhouse-chart-engine-acceptance-20260803)"
test -n "${chart_engine_container_id:?}"
curl --fail --silent --show-error --retry 20 --retry-delay 1 \
  http://127.0.0.1:8012/ready
docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' \
  "${chart_engine_container_id:?}"
docker stop --time 30 "${chart_engine_container_id:?}"
test -z "$(docker ps -aq --filter "id=${chart_engine_container_id:?}")"
```

Parse the readiness response with the strict shared schema and require the exact
pinned versions/backend/flags/capabilities. Stop only the inspected ID; if stop
fails, do not retry with removal or a broader target.

- [x] **Step 7: Commit exact paths**

Commit subject: `fix: harden chart provider runtime`.

### Task 4: Numerical Method Repair and Golden Fixtures

**Files:**

- Modify: `apps/chart-engine/src/chart_engine/canonical_validation.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/tests/test_progression_contract.py`
- Modify: `apps/chart-engine/tests/test_solar_return_contract.py`
- Modify: `apps/chart-engine/tests/test_transit_contract.py`
- Modify: `apps/chart-engine/tests/test_synastry_contract.py`
- Modify: `apps/chart-engine/tests/test_composite_contract.py`
- Modify: `apps/chart-engine/tests/test_horary_contract.py`
- Modify: `apps/chart-engine/tests/test_astrocartography_contract.py`
- Modify: `apps/chart-engine/tests/test_output_invariants.py`
- Create: `apps/chart-engine/tests/test_numeric_fixtures.py`
- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/domain/src/charts/chart-execution-profile.ts`
- Modify: `packages/domain/src/charts/chart-execution-profile.test.ts`
- Modify result summaries: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`

**Interfaces:**

- Produces: progression basis and tolerances from Global Constraints.
- Preserves: existing canonical method union and layer naming.

- [x] **Step 1: Write RED progression/solar tests**

Use one birth snapshot and target dates `2026-07-15`, `2026-07-23` and
`2026-12-31`; assert distinct Moon/fast-point longitude and increasing
`symbolicInstant`. Assert target before birth fails. Assert solar year before
birth fails, zero coordinates succeed, and angular difference between natal
and return Sun is `<= 0.0001` degrees.

- [x] **Step 2: Write RED all-mode numeric/invariant fixtures**

Add literal expected values/tolerances for northern/southern hemispheres, normal
and DST-fold births, transit layers, ordered relationship IDs, composite
participant preservation, horary independence and complete astrocartography
line types. Record fixture provenance beside each literal.

- [x] **Step 3: Run RED numeric tests**

Run: `cd apps/chart-engine && .venv/bin/python -m pytest tests/test_progression_contract.py tests/test_solar_return_contract.py tests/test_numeric_fixtures.py -q`

Expected: current integer progression, pre-birth coercion and zero-coordinate
return behavior fail.

- [x] **Step 4: Implement continuous progression**

Calculate:

```py
elapsed_life_days = (target_date - birth_date).days
elapsed_years = elapsed_life_days / 365.24219
symbolic_instant = birth_instant + timedelta(days=elapsed_years)
```

Create the progressed subject with Kerykeion's UTC-ISO factory so fractional
time is not truncated. Persist all progression-basis fields exactly.

- [x] **Step 5: Implement deterministic solar-return solver**

Use Swiss primitives to bracket/bisect the signed Sun-longitude difference,
then build the return subject at the resolved UTC instant. Use the same path for
all coordinates, including zero; do not epsilon-shift coordinates. Reject a
result outside `0.0001` degrees before serialization.

- [x] **Step 6: Run GREEN all-mode provider/contract tests**

Run:

```bash
cd apps/chart-engine && .venv/bin/python -m pytest -q
pnpm test packages/contracts/src/charts.test.ts
```

Expected: all nine UI modes' underlying provider methods pass with stable
literal fixtures.

- [x] **Step 7: Commit exact paths**

Commit subject: `fix: correct chart calculation methods`.

Completion evidence: commits `6148781`, `c41a7c2` and `8234ad0`; independent
review approved after the astrocartography job-snapshot binding fix. Fresh final
checks: 105 Python tests, 54 focused contract/domain tests, 14 real-PostgreSQL
integration tests, exact ESLint, compileall, domain build and DB typecheck.

### Task 5: Abortable Chart-Engine Client and Failure Taxonomy

**Files:**

- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/domain/src/charts/chart-execution-profile.ts`
- Modify: `packages/domain/src/charts/chart-execution-profile.test.ts`
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/settings.py`
- Modify: `apps/chart-engine/src/chart_engine/provider_runtime.py`
- Modify: `apps/chart-engine/tests/test_provider_runtime.py`
- Modify: `apps/chart-engine/tests/test_request_validation.py`
- Modify: `apps/chart-engine/tests/test_health.py`
- Modify: `apps/chart-engine/tests/test_output_invariants.py`
- Modify: `apps/chart-engine/README.md`
- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`
- Modify: `packages/chart-engine-client/src/index.ts`

**Interfaces:**

```ts
export type ChartEngineRequestOptions = {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export class ChartEngineTransientError extends Error {}
export class ChartEngineConfigurationError extends Error {}
export class ChartEngineCancelledError extends Error {}
export class ChartEnginePermanentError extends Error {}
```

Every calculation method, AstroCalendar, positions and `checkReady()` accept
optional `ChartEngineRequestOptions`. `checkReady()` returns a shared strict
`chartEngineReadinessResponseSchema` value rather than discarding the body.
The only canonical provider-flag vocabulary is the actual Swiss API flag name
set: Moshier is `FLG_MOSEPH + FLG_SPEED`; packaged Swiss data is
`FLG_SWIEPH + FLG_SPEED`. The separate `ephemeris` field remains
`moshier | swiss-ephemeris`, and Swiss artifact revisions are SHA-256 digests.

- [ ] **Step 1: Write RED provider-vocabulary and readiness-contract tests**

Add shared TypeScript and Python vectors for exact backend-appropriate flag
sets, order-insensitive comparison/canonical hashing, unsupported/missing flag
rejection, SHA-256 Swiss revision validation and the complete unique capability
set. Prove the current semantic Python flag tokens and incomplete TypeScript
expected flags disagree.

- [ ] **Step 2: Write RED real-HTTP client tests**

Use a test-owned `node:http` listener on `127.0.0.1:0` and native `fetch`, not
an injected fetch mock. Test every endpoint's method/path/body and signal,
caller abort, internal timeout, dropped connection, 4xx permanent input,
invalid JSON/valid JSON with invalid schema as permanent contract, eligible
5xx/network as transient, readiness mismatch as configuration and v2 response
parsing for all eight chart methods. Read at most 2,048 response characters for
diagnosis, but never expose or persist an arbitrary raw provider body; prove an
echoed secret is absent from the thrown error.

- [ ] **Step 3: Run RED**

Run:

```bash
cd apps/chart-engine && .venv/bin/python -m pytest \
  tests/test_provider_runtime.py tests/test_health.py tests/test_output_invariants.py -q
cd ../..
pnpm test packages/contracts/src/charts.test.ts \
  packages/domain/src/charts/chart-execution-profile.test.ts \
  packages/chart-engine-client/src/chart-engine-client.test.ts
```

Expected: failures show provider-vocabulary drift, no shared readiness parser,
stale v1 client fixtures, no abort/timeout and generic errors.

- [ ] **Step 4: Normalize the shared provider/readiness contract**

Translate returned Swiss bit masks to canonical `FLG_*` names in Python,
compare normalized sets, make both execution-profile schemas require the exact
backend-specific set, and use a SHA-256 schema for packaged-data revision.
Export one strict readiness response schema/type from contracts and parse the
same literal vectors in Python and TypeScript. A pre-existing result with a
different v2 flag vocabulary is non-reproducible and must not have its digest
rewritten in place.

- [ ] **Step 5: Implement one shared request helper**

Combine caller signal with an internal `AbortController`, clear its timer in
`finally`, remove abort listeners, bound response reading, and classify before
parsing the endpoint schema. Remove the unused public `fetchFn` mock seam. Wrap
local request-schema failures as permanent; make successful malformed payloads
permanent; make calculation 5xx/network failures transient; and make readiness
HTTP/profile/schema mismatch configuration errors. Do not duplicate fetch/error
logic per method and do not treat legacy v1 chart output as v2 success.

- [ ] **Step 6: Run GREEN and package gates**

Run:

```bash
cd apps/chart-engine && .venv/bin/python -m pytest -q
cd ../..
pnpm test packages/contracts/src/charts.test.ts \
  packages/domain/src/charts/chart-execution-profile.test.ts \
  packages/chart-engine-client/src/chart-engine-client.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/contracts build
pnpm --filter @elevenhouse/domain build
pnpm --filter @elevenhouse/chart-engine-client typecheck
pnpm --filter @elevenhouse/chart-engine-client build
```

- [ ] **Step 7: Commit exact paths**

Commit subject: `fix: bound chart provider requests`.

### Task 6: Durable Job Schema, Participants, Retry Authority and Fencing

**Files:**

- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/domain/src/charts/chart-use-cases.ts`
- Modify: `packages/domain/src/charts/chart-use-cases.test.ts`
- Modify: `packages/db/src/schema/calculations/chart-calculation-jobs.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`
- Create: `packages/db/src/adapters/charts/chart-calculation-job-row.ts`
- Create: `apps/astrologer-api/src/modules/charts/chart-execution-profile.provider.ts`
- Create: `apps/astrologer-api/src/modules/charts/chart-execution-profile.provider.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.module.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Regenerate: `packages/db/drizzle/0000_sticky_rictor.sql`
- Regenerate matching baseline metadata under `packages/db/drizzle/meta/`

**Interfaces:**

- Produces: participant/lease/job interfaces defined above.
- Adds columns: `participant_snapshot jsonb not null`,
  `target_calculation_id uuid null`, `expected_source_checksum text null`,
  `method_version text not null`, `execution_profile jsonb not null`,
  `lease_generation integer not null default 0`,
  `result_reproducibility_fingerprint text null`.
- Changes `schema_version` default to `chart-result.v2` while allowing both
  `chart-result.v1` and `chart-result.v2`; v1 rows are never selected for
  succeeded-result reuse. Existing queued/processing v1 jobs are terminally
  failed by reconciliation with `legacy_job_requires_requeue`, not silently
  upgraded under a different fingerprint.

- [ ] **Step 1: Write RED domain and schema tests**

Assert every job creation receives ordered participants, maxAttempts, the exact
immutable method version and execution profile used to build its fingerprint; a
replacement requires both target ID and expected checksum; schema checks reject
invalid participant JSON, negative generation and invalid checksum. Assert new
jobs carry `chart-result.v2`, legacy succeeded v1 jobs are readable but not
reusable, and an active v1 job is not processed as v2. Assert API-created
fingerprints change when the method version or expected backend/data revision
changes, result completion rejects a missing/mismatched post-execution
fingerprint, and production config rejects a missing expected ephemeris value.

- [ ] **Step 2: Write RED real-PostgreSQL race tests**

Add cases for one parallel claim, expired reclaim with higher generation, old
generation completion rejection, late failure after success, separate
started/finished times, DB maxAttempts, archived non-reuse and two ordered
relationship participants with `mode="compatibility"`.

- [ ] **Step 3: Run RED against verified local DB**

Run `docker compose ps postgres` and
`docker compose port postgres 5432`; require the healthy ElevenHouse container
to map exactly to local port 5432 as observed in Task 1. Then run with the
explicit approved local target:

```bash
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
```

Expected: the current status-only updates and one-participant completion fail.

- [ ] **Step 4: Implement schema and atomic lease SQL**

Claim only when:

```sql
status = 'queued'
OR (status = 'processing' AND locked_until < :now)
```

and `attempts < max_attempts`. Set `locked_by`, increment
`lease_generation`, set `locked_until`, and set
`started_at = coalesce(started_at, :now)`. Extend/complete/fail predicate on
job, processing state, worker, generation and unexpired lease.

- [ ] **Step 5: Implement active-result reuse and participants**

Join succeeded jobs to `calculation_records.status <> 'archived'`. Initial
individual results get one subject; synastry/composite get subject+partner and
compatibility mode. Replacement jobs never reuse an old succeeded job.
Inject the chart execution profile into every API-created v2 snapshot before
request fingerprinting and persist that exact method version/profile on the
job; never reconstruct a queued job's authority from the later process
environment. On completion, recompute the result reproducibility
fingerprint from canonical actual metadata and compare it with the result field;
persist it on the job and calculation payload in the same transaction. A
succeeded result is reusable only when its request fingerprint, v2
method/profile and post-execution fingerprint all validate; legacy v1 is
read-only.

- [ ] **Step 6: Regenerate baseline and reset only verified local DB**

Inventory every generator input/output before running it:

```bash
git status --short -- \
  packages/db/package.json \
  packages/db/drizzle.config.ts \
  packages/db/src/schema \
  packages/db/scripts/augment-scheduling-baseline.ts \
  packages/db/drizzle \
  pnpm-lock.yaml
git diff --name-status -- \
  packages/db/package.json \
  packages/db/drizzle.config.ts \
  packages/db/src/schema \
  packages/db/scripts/augment-scheduling-baseline.ts \
  packages/db/drizzle \
  pnpm-lock.yaml
```

Compare that inventory with the task's exact owned chart paths. Every unowned
schema/config/script/dependency change, including the currently observed Flows
work, must already be preserved in accepted shared history before generation;
clean output files alone are insufficient because Drizzle reads the entire
schema graph. Run `pnpm db:generate`, then compare the complete before/after
inventory and generated SQL/snapshot/journal against the owned schema delta.
Abort if an output includes unaccounted foreign semantics or any unowned input
remains dirty.

Only after that, rerun `docker compose ps postgres` and
`docker compose port postgres 5432`; require healthy status and local port 5432,
then run the reset with no inherited URL ambiguity:

```bash
DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm db:reset
```

`assertDevelopmentDatabaseUrl` inside reset independently rejects a non-local
host, unapproved DB name/user or production mode. Abort before reset if the
container/port differs from this exact URL.

- [ ] **Step 7: Run GREEN domain/schema/integration gates**

Run:

```bash
pnpm test packages/domain/src/charts/chart-use-cases.test.ts \
  packages/db/src/schema/calculations/calculations.schema.test.ts \
  apps/astrologer-api/src/modules/charts/chart-execution-profile.provider.test.ts \
  apps/astrologer-api/src/modules/charts/charts.service.test.ts
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
```

- [ ] **Step 8: Commit exact paths**

Commit subject: `fix: fence durable chart jobs`.

### Task 7: Target Recalculation, Archival and Artifact Lifecycle

**Files:**

- Create: `packages/domain/src/charts/chart-recalculation.ts`
- Create: `packages/domain/src/charts/chart-recalculation.test.ts`
- Modify: `packages/domain/src/charts/index.ts`
- Create: `packages/db/src/adapters/charts/chart-calculation-replacement.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/chart-ai-context.ts`
- Modify: `apps/astrologer-api/src/modules/charts/chart-ai-context.test.ts`
- Modify: `apps/astrologer-api/src/config/runtime-config.ts`
- Modify: `apps/astrologer-api/src/config/runtime-config.test.ts`
- Modify: `.env.example`
- Modify: `deployment/compose/compose.production.yml`
- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts-pdf.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts-pdf.service.test.ts`

**Interfaces:**

```ts
export const chartRecalculateRequestSchema = z
  .object({
    expectedResultChecksum: sha256DigestSchema,
    settings: chartSettingsSchema.optional()
  })
  .strict();
```

Recalculation derives method, event snapshot and ordered participants from the
owner-scoped stored calculation, hydrates current CRM birth data, and creates a
replacement job carrying target ID/checksum.

- [ ] **Step 1: Write RED domain/API tests**

Assert recalculation targets the requested non-archived chart, preserves its
method (including pair/event methods), rejects stale checksum/foreign owner/
malformed persisted input, and never calls the generic natal creator. Assert a
legacy v1 target is visible with a recalculation-required capability, cannot be
reused/linked/published/sent to AI/rendered to PDF, and explicit recalculation
replaces it with v2 without fabricating old provenance.

- [ ] **Step 2: Write RED replacement integration tests**

Assert one completion replaces the exact calculation ID, rejects checksum
conflict, deletes interpretations, resets publication/link visibility, deletes
PDF job/artifact rows and emits private-object cleanup. Assert archived GET/AI/
PDF/reuse fail before external cost or storage work.

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm test packages/domain/src/charts/chart-recalculation.test.ts \
  apps/astrologer-api/src/modules/charts/charts.service.test.ts \
  apps/astrologer-api/src/modules/charts/charts-pdf.service.test.ts \
  apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
```

Expected: current `recalculate` ignores its ID and lifecycle artifacts remain
live.

- [ ] **Step 4: Implement the shared replacement transaction**

Extract the proven generic calculation replacement semantics into
`chart-calculation-replacement.ts`; require target/checksum/participant identity
inside one DB transaction, then update the job terminal state with its lease
fence. Object deletion stays an explicit post-commit/outbox effect.

- [ ] **Step 5: Implement owner-scoped API reconstruction**

Parse the persisted mode-specific snapshots, rehydrate current CRM subject(s),
stamp Task 2 method version and fingerprint, and call the replacement command.
Return typed 404/409/400 responses without provider or DB details.

- [ ] **Step 6: Prepare the fail-closed AI/privacy boundary**

Add/extend `chart-ai-context.test.ts` and `charts.service.test.ts` to inspect the
actual generation input and prove it contains only locale, method/settings,
canonical point/house/aspect/distribution/warning codes and bounded dictionary
grounding. Remove checksum from the prompt contract. Assert absence of names,
user/client/calculation IDs, checksum, birth date/time/timezone/place/
coordinates, CRM fields, raw input snapshot and provider payload. Verify
current/non-archived/v2/checksum state before any Dictionary/provider work and
return typed `CHART_AI_CONSENT_REQUIRED` until Task 8 supplies the real
client-granted consent port; do not leave an externally callable unconsented
intermediate state.

- [ ] **Step 7: Run GREEN and commit**

Repeat the Step 3 commands, then run:

```bash
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-api build
```

Commit subject: `fix: replace chart calculations atomically`.

### Task 8: Client-Granted Chart-AI Consent and Durable Usage Evidence

**Files:**

- Create: `packages/contracts/src/client-data-consents.ts`
- Create: `packages/contracts/src/client-data-consents.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/clients/client-consent-types.ts`
- Create: `packages/domain/src/clients/client-consent-policy.ts`
- Create: `packages/domain/src/clients/client-consent-policy.test.ts`
- Create: `packages/domain/src/clients/client-consent-errors.ts`
- Create: `packages/domain/src/clients/client-consent-store.ts`
- Create: `packages/domain/src/clients/client-consent-use-cases.ts`
- Create: `packages/domain/src/clients/client-consent-use-cases.test.ts`
- Modify: `packages/domain/src/clients/index.ts`
- Create: `packages/domain/src/ai/ai-usage-store.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/db/src/schema/clients/client-data-consents.schema.ts`
- Modify: `packages/db/src/schema/clients/client-values.ts`
- Modify: `packages/db/src/schema/clients/index.ts`
- Modify: `packages/db/src/schema/clients/relations.schema.ts`
- Create: `packages/db/src/schema/ai/ai-usage-records.schema.ts`
- Create: `packages/db/src/schema/ai/ai-usage-records.schema.test.ts`
- Create: `packages/db/src/schema/ai/index.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/adapters/clients/drizzle-client-consent-store.ts`
- Create: `packages/db/src/adapters/clients/drizzle-client-consent-store.integration.ts`
- Modify: `packages/db/src/adapters/clients/index.ts`
- Create: `packages/db/src/adapters/ai/drizzle-ai-usage-store.ts`
- Create: `packages/db/src/adapters/ai/drizzle-ai-usage-store.integration.ts`
- Create: `packages/db/src/adapters/ai/index.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.tokens.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.service.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.service.test.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.controller.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.controller.test.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.e2e.test.ts`
- Create: `apps/public-api/src/modules/client-consents/client-consents.module.ts`
- Modify: `apps/public-api/src/app.module.ts`
- Create: `apps/client-web/src/features/client-profile/api/clientDataConsentApi.ts`
- Create: `apps/client-web/src/features/client-profile/api/clientDataConsentApi.test.ts`
- Create: `apps/client-web/src/features/client-profile/model/clientDataConsentModel.ts`
- Create: `apps/client-web/src/features/client-profile/model/clientDataConsentModel.test.ts`
- Create: `apps/client-web/src/pages/me/ClientDataConsentSection.tsx`
- Create: `apps/client-web/src/pages/me/ClientDataConsentSection.test.tsx`
- Modify: `apps/client-web/src/pages/me/MePage.tsx`
- Modify: `apps/client-web/src/pages/me/MePageView.tsx`
- Modify: `apps/client-web/src/pages/me/MePageView.test.tsx`
- Modify: `apps/client-web/src/pages/me/MePage.module.css`
- Modify: `apps/client-web/src/common/i18n/clientCopy.ts`
- Modify: `apps/client-web/src/common/i18n/clientCopy.test.ts`
- Modify: `packages/ai/src/prompts/chart-interpretation-draft.v1.ts`
- Modify: `packages/ai/src/prompts/chart-interpretation-draft.v1.test.ts`
- Modify: `apps/astrologer-api/src/modules/ai/ai-usage-recorder.ts`
- Create: `apps/astrologer-api/src/modules/ai/drizzle-ai-usage-recorder.ts`
- Create: `apps/astrologer-api/src/modules/ai/drizzle-ai-usage-recorder.test.ts`
- Modify: `apps/astrologer-api/src/modules/ai/ai-generation.service.ts`
- Modify: `apps/astrologer-api/src/modules/ai/ai-generation.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/ai/ai.module.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.tokens.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.module.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/chart-http-errors.ts`
- Modify: `apps/astrologer-api/src/modules/charts/chart-ai-context.ts`
- Modify: `apps/astrologer-api/src/modules/charts/chart-ai-context.test.ts`
- Modify: `apps/landing/src/pages/privacy/privacyPolicyContent.ts`
- Modify: `apps/landing/src/pages/privacy/PrivacyPolicyPage.tsx`
- Modify: `apps/landing/src/pages/personal-data-processing/personalDataProcessingPolicyContent.ts`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/backend-modules.md`

**Interfaces:**

```ts
export const clientDataConsentPurpose = "external_chart_ai_interpretation" as const;

export const currentChartAiConsentPolicy = {
  purpose: clientDataConsentPurpose,
  policyVersion: "chart-ai-external-processing.v1",
  processorCode: "openai"
} as const;

export type ClientDataConsentState = "missing" | "granted" | "revoked" | "stale";

export type CurrentClientDataConsent = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly purpose: typeof clientDataConsentPurpose;
  readonly policyVersion: typeof currentChartAiConsentPolicy.policyVersion;
  readonly processorCode: typeof currentChartAiConsentPolicy.processorCode;
  readonly noticeLocale: "ru" | "en";
  readonly noticeSha256: `sha256:${string}`;
  readonly grantedAt: string;
};
```

The canonical RU/EN notice names the provider and data sent (calculated
positions, houses, aspects, settings, warnings and bounded Dictionary excerpts),
explicitly excludes identity, contacts, birth data, coordinates, CRM data,
calculation ID and checksum, and explains withdrawal. Its full canonical object
is SHA-256 hashed. Consent is per client+astrologer+purpose; provider/policy/
notice change makes it stale. Re-consent creates a new immutable row. No legacy
row is backfilled or inferred.

Public API:

```text
GET    /me/consents?locale=ru|en
PUT    /me/consents/:astrologerUserId/chart-ai
DELETE /me/consents/:consentId
```

Grant accepts only `{accepted:true, policyVersion, noticeSha256, locale}` and
derives client identity, purpose and processor server-side. Mutations require a
client session plus CSRF. A current active relationship is locked and verified;
the astrologer cannot grant on the client's behalf.

- [ ] **Step 1: Record the legal/processor release gate from primary sources**

Using current official Kyrgyz legal sources and OpenAI's official data-
processing terms, record direct URLs/access date and distinguish code facts from
legal inference. Verify the repository's required processor contract,
cross-border basis, incident/subprocessor terms and risk assessment against
actual organizational evidence. Do not set or document a production authority
version unless that evidence exists. Add chart-specific production config:
`ASTROLOGER_CHART_AI_ENABLED` and
`ASTROLOGER_CHART_AI_PROCESSING_AUTHORITY_VERSION`; production startup rejects
enabled-without-authority. Missing authority produces typed
`CHART_AI_PROCESSING_AUTHORITY_UNAVAILABLE` and keeps external chart AI off.

- [ ] **Step 2: Write RED contract/domain policy and authorization tests**

Assert strict grant/list/revoke schemas, canonical RU/EN notice hashes, false/
unknown/stale inputs, unrelated/inactive relationships, missing/revoked/stale/
wrong-provider consent and the requirement that every persisted chart
participant has a current consent. Assert no browser boolean can satisfy the
use case. Run:

```bash
pnpm test packages/contracts/src/client-data-consents.test.ts \
  packages/domain/src/clients/client-consent-policy.test.ts \
  packages/domain/src/clients/client-consent-use-cases.test.ts
```

Expected: the consent contract/store/use cases do not exist.

- [ ] **Step 3: Write RED PostgreSQL concurrency/history/audit tests**

Against verified local PostgreSQL, assert two concurrent grants yield one
current immutable row, revoke is owner-scoped/idempotent, re-grant creates a new
row, relationship deactivation makes consent unusable, tenant isolation holds,
grant/revoke audit entries commit atomically, and no backfill creates consent.
Add AI-usage integration cases for successful/failed calls, token/duration safe
fields, consent-record IDs and absence of prompt/chart payload. Require
`docker compose ps postgres` healthy and
`docker compose port postgres 5432` equal to local 5432, then run:

```bash
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/adapters/clients/drizzle-client-consent-store.integration.ts \
  packages/db/src/adapters/ai/drizzle-ai-usage-store.integration.ts
```

- [ ] **Step 4: Implement consent schema, stores and public API**

Create `client_data_consents` with relationship FKs, one-current partial unique
index, checksum/timestamp/revocation consistency checks and immutable history.
Grant locks the relationship row `FOR UPDATE`, verifies `active`, compares the
exact policy/hash and writes `client.consent.granted` audit in one transaction.
Revoke locks the owned consent and writes `client.consent.revoked`; a repeated
revoke is a no-op returning current history. Compose the Nest feature module;
controllers remain thin and return one safe public state.

- [ ] **Step 5: Implement the client-owned RU/EN grant/revoke surface**

On `/me`, render one independent consent card per already-related astrologer,
with no preselected checkbox or global grant. Cover missing/granted/revoked/
stale/loading/error/retry, explicit grant and revoke, keyboard/focus and mobile
44px controls using the existing client cabinet visual language. An auth-less
manual CRM client gets no fabricated route; the astrologer UI explains that AI
is unavailable until the client securely claims the account and grants consent.

- [ ] **Step 6: Replace no-op usage and enforce consent-before-cost**

Make `AiUsageRecorderPort.record` awaited and durable through PostgreSQL.
Persist feature/prompt/provider/model/status/safe error/tokens/duration/owner
safety ID and consent record IDs, never prompts or chart payload. A recorder
failure is observable and cannot be reported as successful generation.

In `ChartsService.createAiDraft`, enforce this order: owner-scoped current
non-archived reproducible v2 calculation -> checksum -> authoritative persisted
participants -> active relationships/current consents -> processing-authority
config -> Dictionary -> minimized prompt -> provider -> conditional checksum
save -> durable usage/audit. Remove `resultChecksum` from the OpenAI prompt.
Missing/revoked/stale consent returns `403 CHART_AI_CONSENT_REQUIRED` before
Dictionary/rate-limit/provider work.

- [ ] **Step 7: Regenerate/reset the verified local baseline and run GREEN**

Apply the complete DB generator-input ownership preflight from Task 6, generate
one current baseline containing chart plus consent/AI schema, inspect the exact
combined diff, validate the local Docker URL, reset only that DB and rerun the
consent/usage/chart API integrations. Then run:

```bash
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm db:reset
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/adapters/clients/drizzle-client-consent-store.integration.ts \
  packages/db/src/adapters/ai/drizzle-ai-usage-store.integration.ts \
  packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/public-api typecheck
pnpm --filter @elevenhouse/client-web typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/public-api build
pnpm --filter @elevenhouse/client-web build
pnpm --filter @elevenhouse/astrologer-api build
pnpm docs:check:test
pnpm docs:check
```

- [ ] **Step 8: Commit exact paths**

Commit subject: `feat: require client consent for chart AI`.

### Task 9: Worker Lease Heartbeat, Cancellation and DB-Derived Retries

**Files:**

- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.queue.ts`
- Modify: `apps/chart-worker/src/chart-jobs.queue.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.outbox-relay.ts`
- Modify: `apps/chart-worker/src/chart-jobs.outbox-relay.test.ts`
- Modify: `apps/chart-worker/src/chart-worker-runtime.ts`
- Modify: `apps/chart-worker/src/chart-worker-runtime.test.ts`
- Modify: `apps/chart-worker/src/runtime-config.ts`
- Create: `apps/chart-worker/src/runtime-config.test.ts`
- Modify: `apps/chart-worker/src/readiness.ts`
- Modify: `apps/chart-worker/src/readiness.test.ts`
- Modify: `apps/chart-worker/src/main.ts`

**Interfaces:**

- Consumes: Task 5 error classes and Task 6 lease store.
- Produces: worker execution that never writes after lease loss.
- Consumes the exact persisted `methodVersion + executionProfile`; it never
  resolves a replacement profile from current worker environment.

- [ ] **Step 1: Write RED processor tests**

Assert the processor module loads without invoking `.pick()` on a refined Zod
schema. Assert all eight methods reconstruct strict v2 requests from dedicated
job-snapshot schemas plus the persisted method version/profile, and a readiness
profile mismatch fails before the calculation HTTP request. Assert timeout is
recorded once, permanent input/contract/config errors do not retry, transient
failures stop at claim `maxAttempts`, heartbeat loss aborts the provider
request, and old execution cannot complete/fail newer state.

- [ ] **Step 2: Write RED queue/relay/readiness tests**

Assert relay reads `{maxAttempts}` from PostgreSQL before `queue.add`, BullMQ
options use that exact value, runtime config no longer supplies a competing
attempt count, and readiness rejects missing/mismatched provider metadata or a
job execution profile that differs from the real engine readiness profile.

- [ ] **Step 3: Run RED worker tests**

Run:

```bash
pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts \
  apps/chart-worker/src/chart-jobs.queue.test.ts \
  apps/chart-worker/src/chart-jobs.outbox-relay.test.ts \
  apps/chart-worker/src/chart-worker-runtime.test.ts \
  apps/chart-worker/src/runtime-config.test.ts \
  apps/chart-worker/src/readiness.test.ts
```

Expected: current `finalAttempt`, queue config and status-only readiness fail the
new behavior.

- [ ] **Step 4: Implement heartbeat/cancellation loop**

Generate a stable process worker ID plus per-claim lease generation. Start an
`AbortController`, extend at less than half the lease duration, abort on timeout,
shutdown or failed extension, and pass its signal to the client. Only the
current fence may complete/fail. Export/compose dedicated unrefined
job-snapshot schemas in contracts; never call `.pick()` on a refined public
request schema.

- [ ] **Step 5: Make DB attempts the only retry source**

Add `getQueueDispatch(jobId)` to the store, remove `CHART_WORKER_ATTEMPTS`, and
construct BullMQ job options from persisted maxAttempts plus existing backoff/
jitter. A permanent failure writes one terminal failure; a transient failure
returns/throws only while another durable attempt remains.

- [ ] **Step 6: Run GREEN worker/package gates and commit**

Repeat the Step 3 command, then run:

```bash
pnpm --filter @elevenhouse/chart-worker typecheck
pnpm --filter @elevenhouse/chart-worker build
curl -fsS http://127.0.0.1:8012/ready
```

The curl must return the exact Task 3 provider fingerprint; start the documented
8012 service only after listener inspection under the user's process authority.
Commit subject: `fix: make chart worker execution lease safe`.

### Task 10: Production Reconciliation, Observability and Safe Smoke Cleanup

**Files:**

- Modify: `packages/db/scripts/reconcile-production-baseline.ts`
- Modify: `packages/db/src/production-baseline-reconciliation.integration.ts`
- Modify: `apps/astrologer-api/scripts/chart-engine-smoke.mjs`
- Create: `apps/astrologer-api/scripts/chart-engine-smoke.test.mjs`
- Modify chart metrics/logging in: `apps/chart-worker/src/chart-worker-runtime.ts`
- Modify chart-engine readiness/logging in: `apps/chart-engine/src/chart_engine/provider_runtime.py`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/deployment-topology.md`
- Modify: `docs/development/commands.md`

**Interfaces:**

- Production reconciler validates normalized `pg_get_constraintdef` for method,
  status, checksum and lease constraints.
- Production reconciler creates/verifies `client_data_consents` and
  `ai_usage_records` from the actual pre-feature baseline without granting any
  consent or inventing usage history.
- Smoke script exposes one `finally` cleanup path and a residue assertion.

- [ ] **Step 1: Write RED legacy reconciliation test**

Create the previous six-method check, run reconciliation, assert all eight
methods insert, unknown method rejects, inspect exact `pg_get_constraintdef`,
then rerun and assert idempotent no-op. Add a legacy active v1 job fixture and
assert reconciliation changes it to `failed` with
`legacy_job_requires_requeue`, leaves succeeded v1 calculations untouched for
read-only history, changes the default to v2, and admits new v2 jobs. The fixture
must use the actual pre-v2 table shape with none of the new participant/target/
lease/reproducibility columns. Include successful individual and relationship
backfills plus an ambiguous relationship row that aborts the whole transaction
without partial DDL. The same legacy fixture has no consent/AI-usage tables;
assert reconciliation creates their exact columns/FKs/checks/indexes with zero
rows, then reruns as a no-op.

- [ ] **Step 2: Write RED smoke cleanup test**

Execute the smoke lifecycle against isolated local tables for both success and
injected intermediate failure; assert no namespaced user/session/relationship/
birth/consent/job/calculation/AI interpretation/AI usage/PDF/link/audit rows
remain.

- [ ] **Step 3: Run RED integration/tests**

Run:

```bash
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/production-baseline-reconciliation.integration.ts
node --test apps/astrologer-api/scripts/chart-engine-smoke.test.mjs
```

Expected: legacy constraint stays stale and current smoke leaves rows.

- [ ] **Step 4: Implement reconciliation and cleanup**

Within the existing advisory-lock transaction, add new chart-job columns as
nullable/idempotent first. Backfill `participant_snapshot` from ordered
`calculation_participants` for completed rows, otherwise from validated
mode-specific `input_snapshot` identifiers plus `client_id`; abort on a pair
row whose two distinct authoritative participants cannot be proved. Set active
v1 jobs to failed with `legacy_job_requires_requeue`, set v2 defaults, then
enforce participant NOT NULL/default, lease/checksum/reproducibility checks,
target FK/indexes and exact method/status/schema constraints. Query
`information_schema.columns`, `pg_get_constraintdef` and index definitions as
postconditions before commit; rerun must be a no-op. Never fabricate a
reproducibility fingerprint for succeeded v1 history.

Create/verify consent and AI-usage tables in the same fail-closed plan, with no
consent or usage backfill. Verify relationship/user FKs, the one-current-
consent partial index, immutable-history/revocation checks and no-payload usage
fields before commit.

In smoke, collect created IDs as they are returned and delete in FK-safe order
from `finally`; cleanup failure makes the command nonzero.

- [ ] **Step 5: Add safe metrics/log evidence**

Record method, duration, result, retry, reuse, lease-expiry/fence rejection,
queue age and provider backend/version using safe codes/IDs only. Never log birth
snapshots, coordinates, question text, prompt or chart payload.

- [ ] **Step 6: Run GREEN, docs checks and commit**

Repeat the Step 3 commands, then run:

```bash
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/chart-worker typecheck
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Commit subject: `fix: reconcile and observe chart operations`.

### Task 11: Frontend URL, Identity, Birth-Draft and Capability Models

**Files:**

- Modify: `packages/contracts/src/clients.ts`
- Modify: `packages/contracts/src/clients.test.ts`
- Modify: `apps/astrologer-api/src/modules/clients/birth-place-search.provider.ts`
- Modify: `apps/astrologer-api/src/modules/clients/geoapify-birth-place-search.provider.ts`
- Modify: `apps/astrologer-api/src/modules/clients/geoapify-birth-place-search.provider.test.ts`
- Modify: `apps/astrologer-api/src/modules/clients/redis-birth-place-search.provider.ts`
- Modify: `apps/astrologer-api/src/modules/clients/redis-birth-place-search.provider.test.ts`
- Modify: `apps/astrologer-api/src/modules/clients/clients.service.ts`
- Modify: `apps/astrologer-api/src/modules/clients/clients.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/clients/clients.controller.ts`
- Modify: `apps/astrologer-web/src/features/clients/api/clientsApi.ts`
- Modify: `apps/astrologer-web/src/features/clients/api/clientsApi.test.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineUrlState.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineUrlState.test.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartCalculationIdentity.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartCalculationIdentity.test.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartBirthDataDraft.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartBirthDataDraft.test.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`

**Interfaces:**

- Produces: pure URL/identity/draft/capability types defined above.
- Consumes: server/domain civil-time status; React components do no timezone
  math.
- Adds an authenticated, strict provider-reference read:
  `GET /clients/birth-places/geoapify/:providerPlaceId`, returning one
  `ClientBirthPlaceCandidate`. The API accepts no caller-provided provider URL,
  coordinates or timezone; Geoapify resolves the opaque ID and the Redis wrapper
  may cache that validated response.

- [ ] **Step 1: Write RED place-reference contract/API tests**

Assert an exact Geoapify place ID resolves to the validated label, IANA zone and
coordinates; missing/malformed/provider-error responses are typed and do not
leak provider bodies; cache keys include provider+ID; unauthenticated calls fail.
Assert the web client parses the shared response schema. Run:

```bash
pnpm test packages/contracts/src/clients.test.ts \
  apps/astrologer-api/src/modules/clients/geoapify-birth-place-search.provider.test.ts \
  apps/astrologer-api/src/modules/clients/redis-birth-place-search.provider.test.ts \
  apps/astrologer-api/src/modules/clients/clients.service.test.ts \
  apps/astrologer-web/src/features/clients/api/clientsApi.test.ts
```

Expected: the current search-only port cannot resolve an opaque reference.

- [ ] **Step 2: Implement and verify place-reference resolution**

Use Geoapify's documented place-details endpoint with the existing configured
base URL/key, a bounded abort timeout and the same strict candidate mapping as
autocomplete. Encode the path/query ID; never accept an absolute URL. Extend the
existing Redis adapter without a success fallback. Repeat Step 1, then run:

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

- [ ] **Step 3: Write RED URL tests**

Assert active `jobId` and every mode survive parse/serialize; safe transit date/
time, solar year, progression date and Geoapify place reference persist; birth
data, coordinates, timezone and horary question never appear; subject/mode
changes clear incompatible job/calculation/partner fields.

- [ ] **Step 4: Write RED identity/draft/capability tests**

Assert result is withheld until generic saved calculation participants load;
subject/partner mismatches are typed; drafts reinitialize A -> B and cannot save
A into B; civil changes clear occurrence; child disables adult natal AI; pair
approximate warning names the affected participant(s). Assert a legacy v1
result exposes only `view_legacy` and `recalculate`; it cannot enable AI, PDF,
linking or publication.

- [ ] **Step 5: Run RED pure tests**

Run:

```bash
pnpm test \
  apps/astrologer-web/src/features/charts/model/chartEngineUrlState.test.ts \
  apps/astrologer-web/src/features/charts/model/chartCalculationIdentity.test.ts \
  apps/astrologer-web/src/features/charts/model/chartBirthDataDraft.test.ts \
  apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.test.ts \
  apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts
```

Expected: the four new modules do not exist and current state has no legacy
capability distinction.

- [ ] **Step 6: Implement minimal pure models**

Use literal allowlists for URL fields and participant roles. `toBirthDataUpsertRequest`
requires the draft's `clientId` to equal the submit subject. Capabilities accept
both active UI mode and provider result; they never infer child capability from
`result.method` alone.

- [ ] **Step 7: Run GREEN, typecheck and commit**

Repeat the Step 1 command, then run:

```bash
pnpm test \
  apps/astrologer-web/src/features/charts/model/chartEngineUrlState.test.ts \
  apps/astrologer-web/src/features/charts/model/chartCalculationIdentity.test.ts \
  apps/astrologer-web/src/features/charts/model/chartBirthDataDraft.test.ts \
  apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.test.ts \
  apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Commit subject: `fix: model chart identity and recovery state`.

### Task 12: Controller Recovery and Independent Async State Machines

**Files:**

- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`

**Interfaces:**

- Consumes: Task 11 models and existing `GET /calculations/:id` authoritative
  participants.
- Produces: separate calculation, result, Dictionary, AI, PDF and link status/
  retry props for Task 13 components.

- [ ] **Step 1: Write RED recovery/identity tests**

Assert a transit/synastry/composite/solar/progression/horary/astrocartography job
reload resumes polling by URL job ID, terminal success restores result/mode, and
mismatched participants withhold result/linking and offer safe navigation.

- [ ] **Step 2: Write RED independent-error tests**

Assert polling error exits calculating and exposes poll retry; result/client
query failures do not look idle; PDF and link failures stay local and have local
retry; saved-calculation loading/error never permits selected-client fallback.

- [ ] **Step 3: Run RED controller/API tests**

Run:

```bash
pnpm test apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts \
  apps/astrologer-web/src/features/charts/api/chartsApi.test.ts
```

Expected: current URL drops job/modes and the controller collapses errors.

- [ ] **Step 4: Refactor orchestration around pure models**

Remove local URL helpers, drive query enablement from identity state, keep each
mutation/query error in its owning state and clear only compatible state on
mode/client change. An in-flight job needs only non-sensitive job ID/mode in URL;
its authoritative input remains server-side.

- [ ] **Step 5: Run GREEN, package typecheck/build and commit**

Update the chart-owned Geoapify fixture to the accepted shared contract while
preserving the unowned provider migration. Repeat the Step 3 command, then run:

```bash
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Commit subject: `fix: recover chart jobs and isolate actions`.

### Task 13: Focused UI, RU/EN, Mobile/A11y and Real Map

**Files:**

- Create the five focused components and five exact test files listed in
  Planned File Structure.
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.module.css`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartAiPanel.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartAiPanel.test.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/AstrocartographyMap.tsx`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts`
- Create: Natural Earth asset/readme listed above.

**Interfaces:**

- `ChartEnginePage` remains composition; each focused component receives typed
  copy and its own state/action props.
- Natural Earth land boundaries use the existing equirectangular coordinate
  projection and have public-domain attribution in the asset README.

- [ ] **Step 1: Capture pre-edit reference metrics**

Using the required browser skill, capture exact desktop reference and current
production/local state at `1440x900` plus approved mobile `390x844`. Record rail
width, wheel size, toolbar height/gaps, mode menu, focus/disabled/open states and
document overflow. Do not treat historical `.design-qa` artifacts as fresh.

- [ ] **Step 2: Write RED component/i18n/a11y tests**

Assert both locales cover every chart-owned state; mode controls expose current
state and Arrow/Escape focus behavior; disabled actions use `aria-describedby`;
mobile operated controls have 44px CSS targets; child mode has no AI request;
line list contains every map line; component switch A -> B resets editor.

- [ ] **Step 3: Run RED focused UI tests**

Run:

```bash
pnpm test \
  apps/astrologer-web/src/features/charts/components/ChartEngineHeader.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartEngineActionBar.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartBirthDataEditor.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartEngineWorkspace.test.tsx \
  apps/astrologer-web/src/features/charts/components/AstrocartographyLineList.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartAiPanel.test.tsx \
  apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
```

Expected: current monolith, Russian literals, title-only reasons, decorative map
and missing focus behavior fail.

- [ ] **Step 4: Implement focused components and typed copy**

Move existing behavior without redesign into header, action bar, birth editor
and workspace. Add `chartEngine: ChartEngineCopy` with complete ru/en values.
Use the approved independent states/retries; do not add fallback copy.

- [ ] **Step 5: Replace decorative map base**

Download/verify Natural Earth 1:110m land GeoJSON from the official source,
commit the bounded asset and public-domain provenance, render polygons through
the existing projection, and render the complete ordered line list for keyboard/
screen reader use. Split every astrocartography polyline at antimeridian jumps
before SVG rendering so a correct `+180/-180` crossing cannot draw a false
world-spanning chord. Add a deterministic renderer test for both crossing
directions. No live tile/network dependency is introduced.

- [ ] **Step 6: Implement mobile/reference/a11y CSS**

Use app-shell drawer navigation, wheel/result before optional rail, compact
actions, no document overflow, visible focus and 44px controls. Preserve exact
desktop typography/color/border/radius/shadow/icon metrics unless the approved
accessibility rule requires a documented deviation.

- [ ] **Step 7: Run GREEN frontend gates and commit**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartAiPanel.test.tsx \
  apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
git diff --check
```

Commit subject: `fix: complete chart engine product states`.

### Task 14: Local Network-Backed E2E and Visual Acceptance Matrix

**Files:**

- Modify: this plan's Progress/Discoveries/Outcomes.
- Create ignored evidence under a new
  `.design-qa/chart-engine-full-acceptance-2026-08-02/` directory.
- No production file is planned here; the durable API/DB smoke automation is
  owned by Task 10 and is reused unchanged.

**Interfaces:**

- Consumes: complete local service contour and namespaced smoke cleanup.
- Produces: API/DB/network/browser evidence for all nine modes and states.

- [ ] **Step 1: Prove dependencies and start only missing owned services**

Inspect listeners first. If absent, start exact documented commands in tracked
PTY sessions:

```bash
PYTHONPATH=apps/chart-engine/src apps/chart-engine/.venv/bin/python -m uvicorn \
  chart_engine.main:app --host 127.0.0.1 --port 8012
pnpm --filter @elevenhouse/chart-worker dev
pnpm --filter @elevenhouse/astrologer-api dev
pnpm --filter @elevenhouse/astrologer-web dev
pnpm --filter @elevenhouse/public-api dev
pnpm --filter @elevenhouse/client-web dev
```

Inspect exact ports 8012/3012/3002/5174/3001/5173 first. Do not start a second
listener on an occupied port. Record PID/session, health and readiness; stop
only processes this task started.

- [ ] **Step 2: Run real pipeline race/recovery scenarios**

With namespaced local clients, prove identifier-only outbox, DB-derived retry,
two-worker claim race, stale completion/failure no-op, archive non-reuse and
same-ID replacement invalidation. Query DB before/after and clean in `finally`.

- [ ] **Step 3: Run all-mode network acceptance**

Submit natal/child, transit, synastry, composite, solar return, progression,
horary and astrocartography through API/UI. Include DST first/second/gap, zero
coordinates, southern hemisphere, polar rejection, approximate partner and URL
reload during processing. For chart AI, prove missing consent returns 403 before
Dictionary/rate limit/provider and leaves durable usage count unchanged; grant
from the real client `/me` session, generate through real OpenAI only when the
processing-authority/key gate is satisfied, verify one durable usage row, revoke
from the client session and prove the next attempt is again 403 with unchanged
usage count. An auth-less manual CRM client remains fail-closed.

- [ ] **Step 4: Run browser state/design matrix**

At ru/en and desktop/mobile, inspect loading/empty/success/validation/error/
disabled/retry, keyboard focus, map/list, AI child prohibition, consent missing/
granted/revoked/stale cards in client `/me`, the astrologer consent-required
message, Dictionary, PDF and linking. Capture console, failed network,
screenshots and computed metrics against the fresh reference/current cabinet
visual language.

- [ ] **Step 5: Clean local data and stop owned processes**

Run residue queries including consent, audit and AI-usage rows. Stop only
recorded PIDs/sessions; if shutdown or cleanup fails, stop and report exact
locked process/rows rather than using a stronger or broader command.

- [ ] **Step 6: Update plan evidence and commit only tracked documentation/test automation**

Commit subject: `test: prove chart engine local acceptance` if tracked evidence
or automation changed; otherwise record evidence in the later implementation
commit's plan update.

### Task 15: Affected/Repository Gates and Whole-Change Code Review

**Files:**

- No production file is pre-authorized by this task. Add an exact path to this
  plan before each review-discovered fix and require its reproducing red test.
- Update: this plan.

- [ ] **Step 1: Run complete affected gates**

Run:

```bash
(cd apps/chart-engine && .venv/bin/python -m pytest -q)
pnpm test packages/contracts/src/charts.test.ts \
  packages/contracts/src/client-data-consents.test.ts \
  packages/domain/src/charts \
  packages/domain/src/clients/client-consent-policy.test.ts \
  packages/domain/src/clients/client-consent-use-cases.test.ts \
  packages/chart-engine-client/src \
  packages/db/src/schema/calculations \
  packages/db/src/schema/ai \
  apps/astrologer-api/src/modules/charts \
  apps/astrologer-api/src/modules/ai \
  apps/public-api/src/modules/client-consents \
  apps/chart-worker/src \
  apps/client-web/src/features/client-profile \
  apps/client-web/src/pages/me \
  apps/astrologer-web/src/features/charts \
  apps/astrologer-web/src/pages/chart-engine
docker compose ps postgres
test "$(docker compose port postgres 5432)" = "0.0.0.0:5432"
INTEGRATION_DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse" \
  pnpm test:integration \
  packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts \
  packages/db/src/adapters/clients/drizzle-client-consent-store.integration.ts \
  packages/db/src/adapters/ai/drizzle-ai-usage-store.integration.ts \
  packages/db/src/production-baseline-reconciliation.integration.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/chart-engine-client typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/chart-worker typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/public-api typecheck
pnpm --filter @elevenhouse/client-web typecheck
pnpm --filter @elevenhouse/landing typecheck
pnpm --filter @elevenhouse/contracts build
pnpm --filter @elevenhouse/domain build
pnpm --filter @elevenhouse/chart-engine-client build
pnpm --filter @elevenhouse/db build
pnpm --filter @elevenhouse/astrologer-api build
pnpm --filter @elevenhouse/chart-worker build
pnpm --filter @elevenhouse/astrologer-web build
pnpm --filter @elevenhouse/public-api build
pnpm --filter @elevenhouse/client-web build
pnpm --filter @elevenhouse/landing build
pnpm lint
```

- [ ] **Step 2: Run repository and documentation gates**

Run:

```bash
pnpm verify
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Record exact exit codes/counts; do not extrapolate from targeted green.

- [ ] **Step 3: Run independent whole-change review**

Use the SDD review package from the implementation start base through HEAD and
the most capable reviewer. It must review spec coverage, numerical correctness,
lease/transaction semantics, security/privacy, test behavior, shared-main
ownership and browser evidence.

- [ ] **Step 4: Execute one reviewed fix wave if needed**

Dispatch one implementer with the complete Critical/Important list, require red/
green covering tests, then one scoped re-review. Park only non-load-bearing
minor findings with explicit rulings in the SDD ledger.

- [ ] **Step 5: Verify cached diff and logical commits**

Ensure index is empty after commits and every task commit contains only owned
paths. Update plan outcomes with exact residual risks.

### Task 16: Safe Git Synchronization, Push, Deployment and Production Acceptance

**Files/authority:**

- Git remote `origin/main`, existing deployment workflow and production
  `astrologer.elevenhouse.ai`.
- Namespaced production test rows/objects only.

- [ ] **Step 1: Refresh remote and integrate compatible new history**

Run `git fetch origin`, inspect ahead/behind and path overlaps. If remote moved,
merge `origin/main` without rebase/stash, preserve compatible work and rerun all
affected/repository gates after the merge.

- [ ] **Step 2: Pre-push verification gate**

Run fresh commands proving every push claim, inspect `git diff --cached`, task
commit list and unowned status. Do not push if any required gate is red or a
combined commit contains unowned changes. Before treating the finalized v2
provider vocabulary as deployable, run a read-only production inventory of
existing chart-result.v2 rows and fingerprints. If any row uses an earlier
external v2 vocabulary/profile, stop and add a versioned migration/recalculation
path; never silently reinterpret or rewrite its digest.

- [ ] **Step 3: Push main and observe deployment**

Run `git push origin main`. Observe the actual CI/deploy revision through the
repository's deployment mechanism; push success alone is not deployment
evidence. Verify public health/readiness/logs without exposing secrets.

- [ ] **Step 4: Run namespaced production acceptance**

Create isolated astrologer/client data, execute all nine UI modes plus
Dictionary, consent missing/grant/revoke, legally/configurationally supported
real AI, PDF and linking, test ru/en desktop/mobile, URL reload, console/network
and expected error states. Never publish/link test data to a real client. If
processor/cross-border authority is absent, prove the typed production block and
report external AI acceptance blocked rather than enabling it.

- [ ] **Step 5: Clean production data and prove residue zero**

Delete only enumerated namespaced records/objects in FK-safe order, including
consent, audit and AI-usage evidence. Query every owned table/key prefix
afterward. Cleanup failure is a blocker; do not broaden the delete.

- [ ] **Step 6: Iterate on any production defect**

For each defect: reproduce, add a red regression test, implement minimal fix,
run targeted + affected + repository gates, review, commit, push, observe the
new revision and retest production. Continue until clean or a genuine external
blocker remains.

- [ ] **Step 7: Final report**

Report implemented, verified commands/evidence, partial, intentionally deferred,
blocked, skipped, residual risk and observed unowned changes separately. Include
license/consent authority status and never claim production-ready without all
applicable evidence.

## Concrete Steps

All shell commands run from `/Users/anton/Finext/ElevenHouse` unless a task
explicitly enters `apps/chart-engine`. Use `.venv/bin/python`, not the system
Python. Use `rg`/`rg --files` for search and `apply_patch` for manual edits.

Before every edit group:

```bash
git branch --show-current
git diff --cached --name-status
git diff -- <each-target-path>
```

After every group:

```bash
git diff --check -- <owned-paths>
git diff --stat -- <owned-paths>
git status --short
```

The implementer report must record the exact RED command/failure, GREEN command/
counts, changed files, commit and self-review. The controller generates a review
package and does not advance past an open Critical/Important finding.

## Validation and Acceptance

Automated acceptance requires:

- strict TS/Python input and output contracts;
- real-provider numerical fixtures and mixed-method concurrency stress;
- real PostgreSQL lease/fencing/replacement/reconciliation integration;
- real client-granted consent, revoke/history/audit and durable AI-usage
  integration;
- real Redis/BullMQ outbox and retry behavior;
- API auth/CSRF/owner/participant checks;
- frontend pure state, rendered component, typecheck and production build;
- repository gate.

Runtime acceptance requires:

- local engine/worker/astrologer API+web/public API+client web network path;
- all-mode success plus validation/error/retry/reload matrix;
- exact desktop metrics and approved mobile/a11y behavior;
- clean console/network except deliberate error scenarios;
- observed production revision and equivalent smoke;
- zero test-data residue.

## Idempotence and Recovery

- Contract/provider calculations are deterministic for the same versioned
  request and never mutate provider input.
- Job creation/reuse, outbox publication, lease claim/extension, terminal writes
  and recalculation replacement are idempotent under duplicate invocation.
- Schema reconciliation is transactional and rerunnable; production reset is
  never a recovery action.
- Local services are started only on their documented ports after listener
  inspection and stopped only by recorded session/PID.
- Test setup records every created identifier immediately; `finally` cleanup is
  safe after partial setup and verifies residue.
- Git recovery trusts task commits plus the plan-specific SDD ledger. Never use
  reset/stash/rebase to hide concurrent work.

## Artifacts and Notes

- Design spec: `docs/superpowers/specs/2026-08-02-chart-engine-full-audit-and-repair-design.md`.
- Living plan: this file.
- SDD ledger/work packages: the git-ignored directory printed by
  `superpowers:subagent-driven-development/scripts/sdd-workspace` for this plan.
- Fresh UI/runtime evidence: `.design-qa/chart-engine-full-acceptance-2026-08-02/`.
- Historical `.design-qa/chart-engine-*` directories are context only, never
  fresh acceptance proof.
- Update Progress, Discoveries, Decision Log and Outcomes after each verified
  task group and before the final report.
