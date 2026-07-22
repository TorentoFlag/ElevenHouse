# Human Design Fixture And Responsive QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working individual Human Design slice into a trusted v1 by
adding approved method fixtures, regression tests and authenticated responsive
QA evidence.

**Architecture:** ElevenHouse remains the Human Design mechanics authority in
`packages/domain/src/human-design`, using `apps/chart-engine` only for
ephemeris positions. External calculators and APIs are benchmark sources, not
runtime dependencies. Approved external outputs are copied into static fixtures
with provenance and compared by tests against our deterministic domain result.

**Tech Stack:** TypeScript, Vitest, Python/FastAPI chart-engine, Chrome
DevTools/Computer Use for rendered QA, static Markdown/JSON evidence.

## Global Constraints

- Keep `human_design_classic` as the only enabled v1 method.
- Do not add a third-party Human Design API as production runtime.
- Do not call external APIs in CI or runtime tests.
- Do not store real personal names in fixtures; use synthetic labels and exact
  birth inputs.
- Treat type, profile, authority, definition, centers, channels and all 26
  activations as categorical fixture fields with no tolerance.
- Treat planetary longitudes as diagnostic evidence only; Human Design
  categories are the product acceptance surface.
- Browser-supplied birth data remains invalid for production `/human-design`.
- Work in shared `main` and stage exact Human Design paths only.

---

## Research

Question:
Which external sources should define Human Design benchmark fixtures for
ElevenHouse v1, and how should those fixtures enter tests without making a
third-party provider a runtime dependency?

Decision affected:
Human Design method-confidence gate before declaring `human_design_classic`
product-complete.

Accessed: 2026-07-22

### Sources

- `docs/superpowers/specs/2026-07-21-human-design-production-design.md` -
  repository truth: use external APIs/libraries for research, benchmark and
  fixture comparison; keep our own engine.
- `docs/superpowers/plans/2026-07-22-human-design-resolved-input-provider.md` -
  repository evidence: local browser E2E now works for CRM preview, persist,
  saved-list reopen and recalculate.
- https://roxyapi.com/products/human-design-api - RoxyAPI product docs describe
  full bodygraph, type, strategy, authority, profile, definition, incarnation
  cross, centers, channels and all activations from one birth moment.
- https://roxyapi.com/methodology - RoxyAPI methodology docs describe external
  ephemeris verification against NASA JPL Horizons and public benchmark
  material for raw planetary positions.
- https://humandesignapi.nl/ - HumanDesignAPI product docs describe paid JSON
  endpoints for basic/full Human Design chart data, including energy types,
  profiles, gates, channels, centers, strategy, authority, incarnation cross,
  definition and activations.
- https://api.humandesignapi.nl/v2/sample/visual-trial - HumanDesignAPI public
  trial endpoint returned live full JSON for a synthetic Amsterdam fixture when
  called with the product origin.
- https://roxyapi.com/tools/human-design/bodygraph - bounded browser spike:
  public generator exposes date/time/city inputs, but automated extraction is
  blocked by Cloudflare Turnstile in Chrome DevTools.

### Findings

- Repository evidence: ElevenHouse already resolves personality/design
  longitudes from chart-engine and builds deterministic individual mechanics
  server-side.
- Repository evidence: the production spec requires fixture comparison tests
  before method authority is complete.
- Sourced fact: RoxyAPI exposes the same product fields ElevenHouse needs for
  v1 individual QA: type, strategy, authority, profile, definition, centers,
  channels and all 26 activations.
- Sourced fact: HumanDesignAPI returns REST JSON and offers simple/basic/full
  chart data, but there is no free tier and API access requires a key.
- Sourced fact: HumanDesignAPI public trial returned type, profile, strategy,
  authority, definition, centers, channels and all 26 activations for
  `1990-09-05 21:17 Amsterdam`.
- Sourced fact: RoxyAPI public docs include a free bodygraph generator, but the
  browser spike hit Turnstile human verification, so Codex cannot reliably
  automate extraction from that UI.
- Repository evidence: running the same Amsterdam birth data through local
  chart-engine and `packages/domain/src/human-design` matched the HumanDesignAPI
  public trial on type, profile, definition, centers, channels and all 26
  activations. The external label `Sounding Board` maps to our `mental`
  authority code.
- Inference: CI should compare against checked-in approved fixture outputs, not
  live external APIs. Live external calls belong to a manual fixture-refresh
  runbook or a keyed local-only script.

### Options

1. Live external API calls in tests. This detects upstream disagreement quickly
   but creates flakey CI, leaks birth data externally, requires secrets and
   makes vendor availability part of local verification.
2. Static approved fixture JSON. This makes tests deterministic, keeps CI
   private and lets us review every external mismatch deliberately. Fixture
   refresh is manual/keyed and never blocks ordinary test runs.
3. Only local self-consistency tests. This is already mostly implemented but
   cannot catch a wrong method passport or category derivation.

### Recommendation

Use option 2. Add static approved fixtures with source provenance, generate our
current result for each fixture through the existing provider/domain path, and
assert exact categorical equality for the v1 fields. Keep a manual
fixture-refresh note for RoxyAPI/HumanDesignAPI outputs when a key or manual
browser result is available.

### Rejected alternatives

- Live external API dependency: rejected for privacy, stability and operations
  reasons.
- Treating the Roxy free tool as automatable: rejected because the 2026-07-22
  Chrome DevTools spike encountered Cloudflare Turnstile.
- Using local outputs as "trusted" fixtures: rejected because that only tests
  determinism, not external method confidence.

### User decisions

none

## Progress

- [x] 2026-07-22: Local individual Human Design E2E completed for Maria/Rome
  after chart-engine restart.
- [x] 2026-07-22: External source research completed for fixture strategy.
- [x] 2026-07-22: Roxy public-tool extraction spike attempted and blocked by
  Turnstile.
- [x] 2026-07-22: Authenticated mobile QA found Human Design page right-edge
  overflow; fixed mobile gutters and verified `scrollWidth = clientWidth` in
  Chrome DevTools.
- [x] 2026-07-22: Added a typed static fixture and comparison test using
  BodyGraph documented raw longitudes plus the MIT `human-design-py` gate-wheel
  reference.
- [x] 2026-07-22: BodyGraph static response gate fields were checked and not
  promoted as a full gold output because several longitude-to-gate fields are
  internally inconsistent with the published reference wheel.
- [x] 2026-07-22: Added HumanDesignAPI live public trial fixture for Amsterdam
  1990-09-05 21:17, including external authority label `Sounding Board`.
- [x] 2026-07-22: Added local PostgreSQL integration test that persists approved
  fixtures as `human_design` calculation records and compares hydrated
  `result_data`/summary/checksum with the deterministic domain result.
- [x] 2026-07-22: Added a third approved reference boundary fixture for gate 41
  to gate 19 and line 1 to line 2 transition behavior.
- [x] 2026-07-22: Re-ran authenticated Chrome DevTools browser flow against
  chart-engine on `localhost:8012`: preview `200`, persist `201`, saved-list
  refresh `200`, recalculate `200`, clean console and desktop/mobile
  `scrollWidth = clientWidth`.
- [x] Capture file-based authenticated desktop and mobile production screenshots
  after the screenshot workspace issue is resolved or another approved browser
  surface is used.
- [x] Add a third source or boundary-case fixture before marking the full method
  passport as final.

## Context and Orientation

Current working Human Design contour:

```text
apps/astrologer-web `/human-design`
  -> packages/contracts/src/human-design.ts
  -> apps/astrologer-api/src/modules/human-design
  -> packages/chart-engine-client
  -> apps/chart-engine `/v1/positions`
  -> packages/domain/src/human-design
  -> calculation_records / participants / client links
```

Current local fixture candidate:

```json
{
  "label": "fixture-rome-1990-07-15-1030",
  "input": {
    "birthDate": "1990-07-15",
    "birthTime": "10:30",
    "timezone": "Europe/Rome",
    "latitude": 41.9028,
    "longitude": 12.4964,
    "birthTimePrecision": "exact"
  },
  "currentElevenHouseObserved": {
    "type": "projector",
    "profile": "2/5",
    "authority": "emotional",
    "definition": "split",
    "channels": ["31-7", "30-41"],
    "checksumPrefix": "10bbb2f53839"
  },
  "externalApproval": "pending"
}
```

## Interfaces and Dependencies

Produces:

- `packages/domain/src/human-design/fixtures/approved-fixtures.ts`
- `packages/domain/src/human-design/fixture-comparison.test.ts`
- Optional manual artifact under `.design-qa/human-design-method-fixtures/`

Consumes:

- `resolveHumanDesignResolvedInput(input)`
- `ChartEngineHttpClient.calculatePlanetaryPositions(payload)`
- `buildHumanDesignIndividualBaseResult(input)`
- Approved external fixture outputs from RoxyAPI, HumanDesignAPI or another
  explicitly accepted calculator.

## Plan of Work

### Task 1: Approved Fixture Format

**Files:**

- Create: `packages/domain/src/human-design/fixtures/approved-fixtures.ts`
- Create: `packages/domain/src/human-design/fixture-comparison.test.ts`
- Modify: `docs/superpowers/plans/2026-07-22-human-design-fixture-and-responsive-qa.md`

**Interfaces:**

- Consumes: static fixture rows with `input`, `expected`, `source`.
- Produces: a fixture comparison test that fails when a required external
  field is missing or when our result disagrees with approved categorical
  output.

- [x] **Step 1: Create one approved typed fixture row**

Use the public BodyGraph example raw longitudes for
`1980-01-01T00:00:00Z` and the MIT `human-design-py` gate-wheel reference for
expected gate/line/channel mechanics.

- [x] **Step 2: Add a fixture comparison test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/fixture-comparison.test.ts
```

Expected: failure before the fixture exists; pass only after provenance and
expected mechanics are present.

- [x] **Step 3: Compare and reject inconsistent static external fields**

Do not copy BodyGraph gate fields blindly: the static example reports several
gate/line values that do not follow the same longitudes. Keep the raw longitudes
as fixture input and record the external mismatch in evidence.

- [x] **Step 4: Make the fixture comparison pass**

Run the same Vitest command. Expected: pass only if our type, authority,
profile, definition, centers, channels and 26 activations match the approved
typed fixture.

### Task 2: Method Confidence Matrix

**Files:**

- Modify: `docs/superpowers/specs/2026-07-21-human-design-production-design.md`
- Modify: `docs/superpowers/plans/2026-07-22-human-design-fixture-and-responsive-qa.md`

**Interfaces:**

- Consumes: fixture comparison results.
- Produces: a documented method-confidence matrix: passed, mismatch,
  unresolved and out-of-scope fields.

- [x] **Step 1: Add fixture matrix rows**

Track at least:

```text
source | fixture | birth input | node mode | fields checked | result | notes
```

- [x] **Step 2: Mark method authority**

Do not mark `human_design_classic` product-complete until all required rows are
`passed` or mismatches are explained by an approved method difference.

### Task 3: Authenticated Responsive QA

**Files:**

- Create or update: `.design-qa/human-design-method-fixtures/evidence.md`
- Modify only if needed: `apps/astrologer-web/src/pages/human-design/*`
- Modify only if needed: `apps/astrologer-web/src/features/human-design/*`

**Interfaces:**

- Consumes: authenticated `/human-design` route and a CRM client with ready
  birth data.
- Produces: desktop and mobile evidence for selected-client success, saved
  list, reopen, recalculation, empty, loading and provider-error states.

- [x] **Step 1: Capture desktop and mobile screenshots**

Use Chrome DevTools, Computer Use or another approved browser surface. If file
write is blocked again, record that blocker and switch to the approved surface
before claiming visual acceptance.

- [x] **Step 2: Compare against reference**

Use `ElevenHouseDesign/app/hd.jsx`, `hd-data.jsx`, `hd-graph.jsx` and
`hd-modes.jsx` only for visual state evidence. Production data and mechanics
remain server-owned.

- [x] **Step 3: Fix visible regressions with tests**

Add focused component/model tests only for changed behavior. Do not alter
business state to match prototype demo data.

## Validation and Acceptance

- `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/fixture-comparison.test.ts`
- `set -a && source .env && set +a && INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-human-design-approved-fixtures.integration.ts`
- Existing Human Design targeted suite remains green.
- Authenticated browser network shows preview `200`, persist `201` and
  recalculate `200` for the selected fixture.
- Browser console has no application errors.
- Desktop and mobile screenshots are stored or the exact browser-surface
  blocker is documented.
- `git diff --check`
- `pnpm docs:check:test`
- `pnpm docs:check`

## Idempotence and Recovery

Static fixtures are additive. If an external source later changes, add a new
fixture revision instead of rewriting old provenance silently. If RoxyAPI or
HumanDesignAPI live access is unavailable, use the checked-in reviewed fixture
and record the external refresh blocker separately.

## Artifacts and Notes

- `.design-qa/human-design-method-fixtures/evidence.md` records the local E2E,
  responsive overflow fix, external fixture extraction blocker and static-source
  mismatch analysis.

The method-confidence matrix now includes two external-source fixtures and one
internal reference boundary fixture. Authenticated runtime/browser acceptance is
covered by Chrome DevTools network/DOM evidence and file-based desktop/mobile
PNG artifacts captured through macOS `screencapture` because Chrome DevTools
MCP rejects `.design-qa/...` file writes under its configured workspace roots.
