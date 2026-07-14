# Pythagorean RU Calculation Correction Design

Date: 2026-07-14
Status: implemented; remaining product-completion phases are tracked in
`2026-07-14-numerology-production-completion-design.md`
Scope: agent documentation hardening, Numerology deterministic calculation logic,
contracts, calculation lifecycle integration, persistence consistency, and the
existing `/numerology` production surface

> Production-completion scope discovered by the post-implementation audit is
> defined in `2026-07-14-numerology-production-completion-design.md`. That
> document extends the visible result, period, lifecycle, AI, presentation, and
> PDF scope without changing the single-engine/no-version-history decisions in
> this design.

> This document is an implementation design artifact, not a permanent source of
> truth. After implementation, durable decisions must be reflected in the
> relevant architecture docs, ADRs, runbooks, and design inventory. The current
> code and accepted ADRs remain authoritative.

## 1. Purpose

Correct the current Pythagorean calculation implementation against the
ElevenHouse Google Doc tab **“Пифагорейская методика”**, remove invalid old
calculation data, and restructure the Numerology domain so another deterministic
method such as Vedic numerology can be added without rewriting the common
calculation lifecycle.

This change does not redesign the Numerology screen. `ElevenHouseDesign` remains
the source of truth for visible layout, terminology, and interactions.

## 2. Canonical Sources And Precedence

For this work, sources are applied in this order:

1. The user's decisions in the current implementation discussion.
2. The Google Doc tab **“Пифагорейская методика”** for formulas and method rules.
3. This approved correction design for technical boundaries and data flow.
4. Accepted ElevenHouse ADRs and architecture boundaries.
5. `ElevenHouseDesign` and the design inventory for visible UI and UX.
6. Existing implementation, where it does not conflict with the sources above.

External calculators are research and cross-check material only. Decoz-style
component reduction is not the ElevenHouse Pythagorean RU formula and must not
replace the continuous sums defined by the internal method document.

The 2026-07-05 Numerology design remains useful for linking, publication, and AI
boundaries. Its calculation history/version model, setup-modal recommendation,
original incorrect Pythagorean behavior, and readiness claims are superseded by
this document.

## 3. Non-Goals

- No visual redesign of `/numerology`.
- No setup modal, inline configuration screen, drawer, or new settings page.
- No generic formula DSL.
- No implementation of Vedic, Kabbalistic, or Author methods in this change.
- No frontend arithmetic fallback.
- No preservation or compatibility adapter for invalid existing Pythagorean results.
- No implicit creation or modification of CRM clients from manual participants.
- No AI participation in deterministic calculations.

## 4. Preliminary Agent Documentation Hardening

Before the calculation change, make one isolated documentation commit that
adapts the useful patterns found in `../Locker` without copying Locker-specific
business or repository rules.

### 4.1 Root `AGENTS.md`

The root file currently occupies about 25.5 KiB, close to Codex's default
combined project-instruction limit. Compress duplicated procedural detail while
retaining the mandatory ElevenHouse invariants:

- production, not prototype or MVP;
- product surface and API boundaries;
- packages must not depend on apps;
- domain must not depend on DB;
- Nest feature-module rules;
- design-reference rules;
- dirty-worktree and parallel-work safety;
- local-process restrictions;
- DB migration/reset policy;
- skill and runbook routing;
- evidence and completion requirements.

Do not add nested `AGENTS.md` files. There is no proven subtree-specific rule set
that justifies them yet. Do not add repo-level Codex model, permission, or MCP
configuration; those settings are not needed to implement this feature and may
be environment-specific.

### 4.2 Canonical Commands

Add `docs/development/commands.md` as the canonical command matrix. It must
distinguish:

- commands that exist and are runnable now;
- targeted commands by layer;
- commands that require already-running infrastructure;
- destructive or process-managing commands that require explicit authority;
- illustrative/planned commands that must not be presented as runnable.

### 4.3 Testing Strategy

Add `docs/development/testing-strategy.md` with an evidence ladder:

1. contract and pure-domain tests;
2. adapter/integration tests;
3. API tests;
4. frontend model/component tests;
5. browser flow verification;
6. full repository verification when shared layers changed.

The document must define the red-green-refactor expectation, fresh evidence
before completion claims, and explicit reporting of skipped checks.

### 4.4 Source Of Truth And Runbooks

Strengthen `docs/README.md`, task intake, verification, and documentation
maintenance runbooks with:

- an explicit source-of-truth order;
- document ownership by concern;
- a compact intake output: outcome, scope, excluded scope, canonical sources,
  owned paths, invariants/risks, verification, and external authority;
- stop conditions for process management, destructive operations, conflicting
  changes, and missing production prerequisites.

## 5. Architecture Boundaries

### 5.1 Shared `Calculations` Domain

`Calculations` owns the method-independent lifecycle:

- calculation records and participant identities;
- one current saved input and deterministic result per record;
- result checksums;
- linking, publication, interpretations, artifacts, and archival;
- ownership and status invariants.

It must not know Pythagorean formulas, Cyrillic tables, matrix lines, or
compatibility thresholds. It does not retain old calculation results or older
executable engines.

### 5.2 `Numerology` Domain

`Numerology` owns deterministic method execution. Introduce a small typed method
registry and executable engine boundary. The boundary is generic only over the
lifecycle contract; method internals remain explicitly typed.

Conceptually:

```ts
interface NumerologyMethodEngine<Request, Result> {
  readonly profile: NumerologyMethodProfile;
  calculate(request: Request): Result;
}
```

The registry resolves the current engine by stable `methodCode`. It rejects an
unknown or inactive method. It does not interpret a formula DSL.

### 5.3 Pythagorean RU Package Boundary

Keep focused files under the Numerology domain for:

- executable profile and capabilities;
- number reduction;
- Russian name normalization and letter values;
- core numbers;
- period numbers;
- psychomatrix;
- strength lines;
- compatibility comparison and aggregation;
- golden fixtures.

The public method code remains `pythagorean`. There is one active executable
implementation named `Pythagorean RU`. Do not introduce method versions, a
version registry, compatibility branches, or retained implementations of the
incorrect formulas. The current code is replaced in place.

Adding Vedic later means registering a new typed engine, profile, request/result
schemas, fixtures, and any genuinely unique result adapters. It must not require
changes to calculation ownership, saved-result persistence, links, publication,
interpretations, or artifacts.

### 5.4 API And Frontend

`NumerologyModule` remains the Nest feature-module composition root. Controllers
remain thin. The service validates shared contracts, resolves the method engine,
builds the current saved calculation data, and calls shared calculation use cases.

The frontend renders the typed saved or preview result returned by the server. It
must not calculate personal
years, months, compatibility relations, matrix levels, or fallback values.

## 6. Current Pythagorean RU Executable Profile

The profile is code, not an astrologer account setting and not a new UI. It
contains all method constants required to reproduce a result:

- `methodCode: "pythagorean"`;
- supported modes;
- Russian letter table and vowels;
- canonical master-number policy;
- name-normalization rules;
- indicator dependencies;
- psychomatrix working-number rule;
- line definitions and line-strength levels;
- compatibility comparison keys, thresholds, relation labels, and aggregation;
- deterministic explanation templates.

There is exactly one canonical profile. A future approved formula correction
replaces the profile and its fixtures in place; it does not retain dead engines
or expose algorithm version selection.

## 7. Canonical Calculation Rules

### 7.1 Reduction

- Repeatedly sum decimal digits until a root number is reached.
- Scalar indicators preserve master numbers `11`, `22`, and `33`.
- Psychomatrix second and fourth working numbers always use full reduction,
  without preserving master numbers.
- Negative input is never passed into the digit reducer.

### 7.2 Date-Based Core Numbers

- Life path: sum all digits of `DDMMYYYY` continuously, then reduce.
- Birthday: reduce the numeric day of month.
- Birth date must be a real non-future ISO date.
- Birth time and place are not inputs to this method.

### 7.3 Name-Based Numbers

- Expression: sum all supported normalized name letters continuously, then
  reduce.
- Soul: sum vowels continuously, then reduce.
- Personality: sum consonants continuously, then reduce.
- The Russian 33-letter alphabet uses the profile's repeating 1-9 table.
- `Ё` and `Й` are separate by default, matching the internal method document.
- Spaces, hyphens, and apostrophes are separators and do not contribute values.
- Digits, emoji, Latin letters, and unsupported symbols are rejected rather
  than silently discarded.
- A calculation name is method input and is distinct from the participant's CRM
  display label. The saved calculation records the supplied calculation name and its
  source.
- A calculation name is required because the canonical Pythagorean portrait
  always includes expression, soul, and personality numbers.
- The normalized name must contain at least one supported vowel and consonant.

The current UI supplies the CRM client's full display name as the calculation
name because it has no separate birth-name interaction in the approved design.
The contract and saved input keep the concepts distinct so a future explicitly
designed name-source flow will not require a domain rewrite.

### 7.4 Period Numbers

- Personal year: birth-day digits + birth-month digits + target-year digits,
  then scalar reduction.
- Personal month: personal-year value + numeric target month, then scalar
  reduction.
- Personal day: personal-month value + target-day digits, then scalar reduction.
- Future target periods are valid.
- Year, month, and day requests are modeled independently. A lower-level period
  may calculate prerequisites internally, but the result exposes only requested
  indicators.
- The target period is included in every returned item; labels never read the
  current browser clock.

The existing visible `Год` control sends a `current_year` period intent. The
backend resolves the year from `SystemClock` in the astrologer's persisted IANA
timezone, then passes an explicit target year to the engine and returns that
target in every period result. It does not alter method rules and React does not
read the browser clock. Support for an arbitrary explicit target year/day exists
in the domain and API contract without adding UI that is absent from the design.

### 7.5 Psychomatrix

Use birth-date digits plus four working numbers. Zeros do not populate matrix
cells.

1. First: sum all birth-date digits.
2. Second: fully reduce the first number.
3. Third: absolute difference between the first number and twice the first
   digit of the numeric birth day.
4. Fourth: fully reduce the third number.

For a single-digit birth day, use that digit, not the leading ISO zero. This
makes `07.01.2000` produce working numbers `10, 1, 4, 4` and prevents the current
negative-number failure.

### 7.6 Strength Lines

Profile lines:

- goal: `147`;
- family: `258`;
- stability: `369`;
- self-esteem: `123`;
- material: `456`;
- talent: `789`;
- spirituality: `159`;
- temperament: `357`.

Every line result contains its stable snake_case code, cells, numeric value,
level, label, and deterministic explanation.

Level scale:

- `0`: absent;
- `1`: weak;
- `2`: moderate;
- `3`: expressed;
- `4+`: strong.

Frontend adapters must preserve the domain code `self_esteem`; no camelCase
lookup may silently drop this line.

## 8. Compatibility

Compatibility is a deterministic result block, not a frontend interpretation.

### 8.1 Inputs And Symmetry

- Exactly two different participants are required.
- CRM participants must belong to the current astrologer.
- A CRM client cannot occupy both roles.
- Pair lookup is order-independent for the same two CRM client IDs.
- The stored subject/partner roles remain explicit for presentation, but reversed
  selection must not create an accidental duplicate logical pair.

### 8.2 Pair Number

Reduce the sum of the two life-path values using the scalar master-number policy.

### 8.3 Comparison Blocks

Core key-number comparison covers only:

- life path;
- birthday;
- expression;
- soul;
- personality.

Period numbers do not participate in the core compatibility block.

Matrix comparison covers digits `1` through `9`. Strength-line comparison covers
all eight profile lines. The canonical compatibility result always contains all
three comparison blocks.

Every comparison contains:

- stable block and item code;
- both values/counts;
- absolute numeric difference;
- relation;
- deterministic explanation.

Thresholds:

| Comparison | match | close | different | tension |
| --- | --- | --- | --- | --- |
| Core number | `0` | `1` | `2..3` | `4+` |
| Matrix/line count | `0` | `1` | `2` | `3+` |

### 8.4 Zones And Conclusion

Return relation zones that reference comparisons from all canonical blocks:

- matches;
- close/points of support;
- differences/points of attention;
- tensions.

Return counts per block and total counts. The overall conclusion is profile-
driven and transparent:

- no conclusion is returned when there are no comparisons;
- `harmonious` when `match + close` is greater than `different + tension`;
- `attention` when `tension` is greater than or equal to `match + close`;
- otherwise `mixed`.

The result includes the rule inputs and explanation, so the conclusion is
auditable and not a hidden score.

## 9. Typed Contracts And Saved Calculation Data

Use shared Zod discriminated contracts. Pythagorean request and result types are
explicit. A future Vedic request/result becomes a new union member rather than a
bag of optional fields.

Creation/preview input contains:

- mode;
- method code;
- participant identities and display labels;
- method calculation name when required;
- birth date;
- requested period output;
- title where persistence requires it.

For a CRM participant, the browser sends only stable participant role/source and
client ID. The backend checks that the relationship belongs to the current
astrologer and hydrates the current display label, calculation name, birth date,
and `crm_display_name` name source from CRM data. These values are never trusted
from the browser. A manual API participant carries its own display label,
calculation name, `manual_entry` name source, and birth date, but the current
approved UI does not expose manual entry and manual input never creates a CRM
client implicitly.

The API accepts no method settings. The frontend does not send letter tables,
master-number modes, normalization policies, thresholds, line definitions, or
block switches. The only optional calculation input is the requested period.

Stored input data includes the exact participants, calculation names, and
requested periods. Stored result data includes the method code and all rendered
values, labels, levels, relations, explanations, zones, and conclusion.

Saved JSON parsing must be method-specific on reads. Invalid persisted JSON is an
explicit integrity error, not a silent empty result.

## 10. Existing UI And Data Flow

### 10.1 Visual Contract

Preserve the current/reference visible structure:

- existing toolbar;
- client picker;
- `Год` and `Совместимость` controls;
- presentation, link, and PDF actions;
- key-number rail;
- central matrix/lines or compatibility workspace;
- right interpretation panel.

No new modal, inline form, settings drawer, or settings page is introduced.

### 10.2 Server Calculation Flow

The screen needs deterministic results before a calculation is linked. Add a
non-persisting Numerology preview operation. Changing client, year mode, or
compatibility participants requests a preview and renders the returned typed
result. Preview performs ownership and input validation but writes no
calculation records.

`Привязать` remains the explicit visible persistence action:

- if the current result is only a preview, the frontend resubmits only canonical
  input; the backend reruns the engine, saves its own result, and links the CRM
  participant(s) atomically;
- if the same current calculation already exists, link it without recalculation;
- display `Привязана` only when the current saved calculation has the required
  client link(s).

The API never accepts deterministic result values from the frontend as data to
persist.

Selecting a client must not create a DB record. Selecting a saved calculation
opens its stored result without calling the engine.

### 10.3 Recalculation

Recalculation is an existing lifecycle/API capability, not a new visible settings
surface in this change.

- It may update method input values and requested result blocks.
- It must preserve the record's logical participant identities and roles.
- It cannot replace a record's CRM participants with other client IDs.
- Participant metadata, current input, result, checksum, and
  request fingerprint are replaced atomically.
- If the new exact key belongs to another calculation record, reject the
  recalculation as a conflict and leave both records unchanged; do not merge
  identities or links implicitly.
- No previous input or result is retained.
- Existing interpretations and generated artifacts are invalidated and removed
  because they refer to the replaced result.
- Published client visibility is revoked back to linked/private state until the
  new result receives a current approved interpretation.

### 10.4 Frontend Purity

Remove all frontend calculations and time-based fallbacks:

- no injected current personal year;
- no client-side month reduction;
- no `new Date().getFullYear()` result labels;
- no line-level classification;
- no compatibility relation, zone, or conclusion derivation.

Frontend model code may only map validated result values to the existing view.

## 11. Persistence Consistency

Remove algorithm-version metadata from the shared calculation persistence and
contracts:

- `calculation_records.current_method_version`;
- the entire `calculation_versions` table;
- corresponding domain and API fields.

Move the one current calculation payload onto `calculation_records` using clear
current-data fields:

- input JSON;
- result JSON;
- result summary JSON;
- result checksum;
- canonical request fingerprint.

`calculation_participants` retains only participant identity, role, source,
optional CRM client reference, display label, and order. Remove its redundant
`birth_date`, `input_snapshot`, and permanently-false `manually_overridden`
fields. The method-specific participant input lives once in
`calculation_records` input JSON and is the authoritative saved input.

`calculation_interpretations` and `calculation_artifacts` reference the
calculation record directly rather than a removed result version. Recalculation
deletes stale interpretations/artifact relations and revokes published links in
the same transaction.

There is one active implementation and one current saved result for each
calculation record. No algorithm history or result history is retained.

This is a schema change. Follow the repository DB policy: rebuild the current
migration and perform a full local `db:reset`. The two required Numerology test
clients must be recreated after reset and related to the test astrologer before
browser verification.

Use JSON data for method-specific input/result and a dedicated indexed
request-fingerprint column for exact lookup and duplicate prevention. The
fingerprint includes method code, mode, participant identities,
calculation inputs, and requested periods. Compatibility
fingerprinting uses an order-independent CRM pair key while preserving display
roles in saved input data.

Exact existing-calculation selection uses owner, module, method, mode, and request
fingerprint. Matching only mode plus participant IDs is insufficient.

Creation is idempotent for that exact key. If the record already exists, return
its validated current result and idempotently ensure the requested CRM links
without rerunning or replacing the result. The DB adapter must also handle two
concurrent creates safely: the exact-key unique conflict resolves to the same
owner-scoped record, with one link per CRM client, rather than an error or a
duplicate.

The calculation store replacement operation must not allow top-level participants
and current saved input to disagree. Validate logical participant identity before
replacement and update allowed participant metadata on the existing participant
rows in the same DB transaction; do not delete and recreate participant identity
rows during recalculation.

## 12. Old Calculation Cleanup

Calculations produced by the current incorrect Pythagorean implementation are
not retained. The required local schema reset removes them together with the old
schema, so no legacy reader, compatibility adapter, cleanup service, or permanent
maintenance script is added.

Do not place deletion logic in application startup. If a non-local environment
with old Numerology rows must later be migrated instead of rebuilt, that is a
separate explicitly authorized operational data-cleanup action, not code in the
calculation engine.

## 13. Error Handling And Atomicity

- Contract errors retain field paths and produce the project's standard 400
  response.
- Unsupported method and persisted-result integrity failures use
  explicit error codes.
- Domain validation errors never become generic 500 responses.
- Preview is side-effect free.
- Create/link and recalculation replacement operations are transactional.
- No partial calculation record is saved when engine execution, saved-data
  validation, checksum generation, participant validation, or linking fails.
- AI receives only a validated deterministic stored result and cannot modify
  numeric results.

## 14. Golden Fixtures

### 14.1 Голубев Антон — 19.08.2000

- core: life `2`, birthday `1`, expression `6`, soul `6`, personality `9`;
- working numbers: `20, 2, 18, 9`;
- cells: `11`, `222`, empty `3`, empty `4`, empty `5`, empty `6`, empty `7`,
  `88`, `99`;
- lines: goal `2`, family `5`, stability `2`, self-esteem `5`, material `0`,
  talent `4`, spirituality `4`, temperament `0`.

### 14.2 Кошкина Яна Владимировна — 16.03.2002

- core: life `5`, birthday `7`, expression `7`, soul `9`, personality `7`;
- working numbers: `14, 5, 12, 3`;
- cells: `111`, `222`, `33`, `4`, `5`, `6`, empty `7`, empty `8`, empty `9`;
- lines: goal `4`, family `4`, stability `3`, self-esteem `8`, material `3`,
  talent `0`, spirituality `4`, temperament `3`.

### 14.3 Compatibility Fixture

- pair number: `7`;
- key relations: match `0`, close `1`, different `3`, tension `1`;
- matrix relations: match `2`, close `4`, different `3`, tension `0`;
- line relations: match `1`, close `2`, different `1`, tension `4`;
- total: match `3`, close `7`, different `7`, tension `5`;
- overall conclusion: `mixed` under the rule in section 8.4.

### 14.4 Edge Fixtures

Include at minimum:

- `07.01.2000` working numbers `10, 1, 4, 4`;
- `30.01.1000` working numbers `5, 5, 1, 1`; the third number is the
  unsigned magnitude of the raw subtraction, because a minus sign is not a
  psychomatrix digit;
- preservation of `11`, `22`, and `33` in scalar indicators;
- separate canonical handling of `Ё` and `Й`;
- whitespace, period, hyphen and Unicode dash variants, straight/curly
  apostrophes and quotes, and guillemets are ignored name separators; other
  unsupported symbols remain validation errors;
- missing name, vowel, or consonant;
- future personal year, month, and day;
- invalid/future birth date;
- reversed compatibility participant selection;
- same CRM client twice;
- persisted invalid result JSON;
- recalculation with changed client IDs rejected.

## 15. Verification Strategy

Use strict TDD for behavior changes.

1. Profile and pure-domain tests for every formula, threshold, normalization,
   explanation, zone, and conclusion.
2. Contract tests for required calculation names, future forecast periods,
   discriminated request/result types, and saved-result validation.
3. Calculation lifecycle tests for participant invariants and current-result
   replacement.
4. DB integration tests for atomic create/link, in-place recalculation,
   invalidation of interpretations/artifacts/publication, and order-independent
   pair matching.
5. API service/e2e tests for preview, persist/link, reopen without recalculation,
   recalculation, ownership, and error mapping.
6. Frontend model/component tests proving no arithmetic fallback and complete
   rendering, including `self_esteem` and compatibility zones.
7. Browser verification through the already-authorized Chrome tab using Computer
   Use, without starting or stopping local processes:
   - Golubev individual portrait;
   - current-year view;
   - Koshkina compatibility;
   - link persistence;
   - reopen saved result;
   - no record creation on client selection.
8. Targeted typecheck/build followed by repository `pnpm verify` because shared
   domain, contracts, API, DB adapter, and frontend layers change.

If an already-required local service is not running, stop and report the exact
port/process blocker instead of starting it.

## 16. Acceptance Criteria

- Both golden individual fixtures and the compatibility fixture match exactly.
- Dates after 2000 do not fail psychomatrix calculation.
- Future forecast periods validate and calculate correctly.
- Existing visible `/numerology` design is unchanged.
- Selecting clients or toggling view modes creates no DB records.
- `Привязать` persists and links exactly one canonical calculation result.
- Reversed participant order does not create accidental duplicate pair records.
- Saved results reopen without recalculation or browser-clock mutation.
- Explicit recalculation replaces the current result and retains no old result
  history.
- Frontend contains no deterministic numerology arithmetic.
- Invalid old Numerology records and algorithm-version columns are gone; the two
  test CRM clients, birth data, and astrologer relationships are recreated after
  the required local reset.
- The typed registry can accept a future Vedic engine without changing the
  shared calculation lifecycle.
- All targeted and repository verification passes with fresh evidence.
