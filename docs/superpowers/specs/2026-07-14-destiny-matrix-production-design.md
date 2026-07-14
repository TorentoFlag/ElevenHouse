# Destiny Matrix Production Design

Date: 2026-07-14
Status: approved product and architecture design; backend slices 1–4 implemented
Scope: authenticated astrologer Matrix workspace, deterministic Ladini 22
calculation, CRM client linking, expert notes, AI report draft, PDF generation,
and a non-functional future-chat affordance

Implementation status on 2026-07-14: the canonical engine, CRM-only
preview/link/recalculation, compatibility and read-only projection are ready.
Astrologer-private checksum-bound note CRUD and the revisioned RU/EN
interpretation catalog are also ready. AI report drafting, report persistence,
PDF generation, the disabled chat presentation and the production frontend
remain pending.

> This document is an implementation design artifact, not a permanent source
> of truth. After implementation, durable decisions must be reflected in the
> relevant architecture documents, API boundaries, design inventory, and code.

## 1. Purpose

Implement the Destiny Matrix surface as a focused professional calculation
module inside ElevenHouse. The module is not a consultation-management system,
public calculator, client-discovery surface, or replacement for CRM.

The production workflow is:

1. The astrologer selects one or two existing CRM clients.
2. The server calculates and returns a read-only preview.
3. The astrologer explicitly links the calculation to its participant client or
   clients. Linking is the only save action.
4. The astrologer explores the matrix, reads deterministic and curated
   interpretations, and writes expert-only notes.
5. The astrologer may generate and edit an AI-assisted report draft.
6. The current report can be rendered as a PDF. Sending to client chat remains
   an explicit disabled placeholder until Messaging exists.

## 2. Canonical Sources And Precedence

For this feature, sources are applied in this order:

1. The user's decisions in the Matrix product discussion.
2. This approved design for product and technical boundaries.
3. A reviewed Ladini 22 method passport and its golden fixtures.
4. Accepted ElevenHouse ADRs and canonical architecture documents.
5. `ElevenHouseDesign/ElevenHouse.html`, `app/matrix*.jsx`, and the selected
   option 1 composition for visible workflow and information architecture.
6. Existing production `Calculations`, `Numerology`, `Clients`, `Ai`, `Media`,
   security, and design-system patterns.
7. Competitor calculators only as parity checks, never as formula authority.

The official Ladini source describes one authorial formula based on 22 paths.
ElevenHouse therefore exposes one method and no school/method selector. A
third-party calculator mismatch is treated as evidence to investigate, not as a
second supported interpretation.

## 3. Product Position

Destiny Matrix is an expert tool inside the astrologer's authenticated CRM. It
reduces preparation and interpretation work while keeping the astrologer in
control of every client-linked artifact.

It is not:

- a public date-of-birth calculator;
- a guest or lead-magnet entry point;
- a consultation/session lifecycle;
- a public marketplace or discovery feature;
- a messaging implementation;
- an AI oracle or autonomous publishing agent;
- a medical, psychological, legal, or financial diagnostic tool.

## 4. Locked Product Rules

### 4.1 Participants

- An individual calculation requires exactly one existing CRM client.
- A compatibility calculation requires exactly two distinct existing CRM
  clients belonging to the signed-in astrologer.
- Manual participants, inline client creation, and inline birth-date editing are
  not supported.
- The client selector lists the astrologer's CRM clients. A client without a
  valid birth date remains visible but disabled with an explanation and a route
  back to CRM for correction.
- Compatibility calculations are linked atomically to both participants.
- Archived or blocked relationships cannot be selected for a new calculation.

### 4.2 Preview, Linking, And Saving

- Selecting valid participants requests a server preview.
- Preview is authenticated, read-only, CSRF-exempt, and creates no calculation,
  participant, link, note, interpretation, report, or artifact row.
- `Привязать расчёт` is the primary save action.
- A linked calculation is a saved calculation; there is no unlinked saved state
  for Matrix.
- Repeating the same method, mode, participant snapshot, and period request
  returns and links the exact existing calculation instead of duplicating it.
- The UI shows `Привязан` only after a persisted linked record is returned.
- Changing CRM birth data never mutates a saved result implicitly. The existing
  result is shown as out of date and requires explicit recalculation.

### 4.3 Modes

- `Личная`: individual Matrix for one CRM client.
- `Совместимость`: two individual matrices plus one deterministic composite.
- `Прогноз`: an annual projection over an individual Matrix. The current age
  cycle remains a separate result block. Forecast is not a third generic
  calculation mode and does not require widening
  `CalculationMode = individual | compatibility`.
- A year projection is calculated by the server for an explicit calendar year.
  The current year is resolved in the astrologer's timezone.
- Forecast and current-age context are read-only derived views. Switching a
  year never mutates the linked base calculation, invalidates notes, or creates
  another saved calculation.

### 4.4 Notes

- Notes are plain expert notes attached to one linked Matrix calculation.
- Notes are visible only to the owning astrologer.
- Notes are never automatically included in AI prompts or reports.
- Each note stores the calculation result checksum current when it was created
  or last deliberately rebound.
- Recalculation preserves notes and marks those bound to the previous checksum
  as stale. It does not delete or silently rewrite them.

### 4.5 Interpretation, AI, And Report

- Deterministic calculation and curated interpretations are separate.
- AI never calculates arcana, points, compatibility, age periods, or energy
  table values.
- AI receives a validated result, versioned interpretation content, an optional
  explicitly selected subset of notes, locale, and report intent.
- AI output is a structured editable draft, not an approved truth.
- The astrologer can regenerate, edit, or discard the report draft.
- A report draft is bound to the result checksum. Recalculation marks it stale
  until regenerated or explicitly reviewed against the new result.
- The module does not publish to a client cabinet and does not use the generic
  calculation publication route.
- `Отправить в чат` is disabled and labelled as future functionality. It makes
  no request and never shows fake success.

### 4.6 Terminology And Safety

- The visible module name is `Матрица судьбы`.
- The method label is `22 энергии`; attribution to the Ladini method must not
  imply certification or partnership that ElevenHouse does not have.
- The former `Карта здоровья` is named `Энергетическая карта`.
- Copy describes symbolic themes and reflection prompts. It must not diagnose
  disease, predict death, prescribe treatment, or claim clinical outcomes.
- AI prompts and response validation enforce the same boundary.
- Every generated report identifies AI-authored content as a draft requiring
  expert review.

## 5. Chosen Architecture

### 5.1 Considered Approaches

#### A. Matrix bounded context inside the existing modular monolith — selected

Add a typed `Matrix` domain and Nest feature module. Reuse `Calculations` for
owner-scoped lifecycle and client links, `Clients` for participant hydration,
`Ai` for provider-neutral generation, and `Media`/artifact infrastructure for
future PDF files.

Benefits:

- follows current repository dependency direction;
- reuses tested ownership, checksum, link, and recalculation behavior;
- keeps formulas pure and independently testable;
- avoids new deployment and network failure modes;
- retains a clear future extraction point.

#### B. Generic esoteric formula DSL — rejected

A generalized formula language for Numerology, Matrix, Human Design, and charts
would erase method-specific types, make formulas harder to review, and create an
abstraction before multiple compatible engines exist.

#### C. Dedicated Matrix service or chart worker — rejected for calculation

Ladini 22 arithmetic is small, deterministic, and request-safe. Moving it to a
worker would add queue latency and operational complexity without a workload
justification. PDF rendering uses the existing general worker contour, while
deterministic preview and persistence remain synchronous.

### 5.2 Dependency Direction

```text
astrologer-web
  -> shared Matrix contracts
  -> astrologer-api MatrixModule
       -> Matrix domain engine
       -> Calculations use cases/port
       -> Clients use cases/port
       -> Matrix notes/report store port
       -> provider-neutral Ai service

packages/db
  -> implements Calculations and Matrix persistence ports

packages/domain
  -X-> packages/db
```

### 5.3 Production Boundaries

- `packages/domain/src/matrix/` owns formulas, typed results, method registry,
  report context construction, and Matrix-specific use cases.
- `packages/contracts/src/matrix.ts` owns request/response schemas.
- `packages/db/src/schema/matrix/` owns notes and report-draft persistence.
- Existing `packages/db/src/schema/calculations/` continues to own calculation
  records, participants, client links, generic interpretations, and artifacts.
- `apps/astrologer-api/src/modules/matrix/` is the app composition root.
- `apps/astrologer-web` renders validated API results and contains no Matrix
  arithmetic.
- `chart-worker` is not involved in Matrix calculation.
- No `ConsultationWorkspace`, `Sessions`, `Messaging`, or client-web module is
  introduced by this feature.

## 6. Method Passport

### 6.1 Identity And Provenance

The initial engine identity is:

```text
methodCode: ladini_22
engineRevision: 1
supportedModes: individual, compatibility
supportedProjection: year
```

`engineRevision` is an internal reproducibility field, not a user-selectable
method version. It is included in saved `inputData`, `resultData`, the request
fingerprint, AI context, and report provenance. Derived forecast responses carry
the same revision without becoming part of the saved base result. A future
formula correction increments it and requires new golden fixtures. Old
executable branches are not kept in the runtime registry.

### 6.2 Reduction

`reduce22` accepts a positive integer. While the value is greater than `22`, it
replaces the value with the sum of its decimal digits. Zero, negative,
fractional, and non-finite inputs are rejected rather than converted to arcana 22.

### 6.3 Individual Base Points

For birth date `day.month.year`:

```text
A = reduce22(day)
B = reduce22(month)
C = reduce22(sumDigits(year))
D = reduce22(A + B + C)
E = reduce22(A + B + C + D)

tl = reduce22(A + B)
tr = reduce22(B + C)
br = reduce22(C + D)
bl = reduce22(D + A)

A1  = reduce22(A + E)
B1  = reduce22(B + E)
C1  = reduce22(C + E)
D1  = reduce22(D + E)
tl1 = reduce22(tl + E)
tr1 = reduce22(tr + E)
br1 = reduce22(br + E)
bl1 = reduce22(bl + E)
```

The initial visible labels preserve the approved design semantics:

```text
A   Характер
B   Детство · род
C   Карма рода
D   Зона комфорта
E   Портрет · Я
tl  Таланты
tr  Кармический хвост
br  Род · ресурс
bl  Отношения
```

The method-passport review must compare both arithmetic and labels against the
authoritative method material. If a source conflict changes a formula or the
meaning of a point, implementation stops before production code and the spec is
updated with the exact source and decision.

### 6.4 Purposes And Zones

```text
earth  = reduce22(A + C)
sky    = reduce22(B + D)
male   = reduce22(tl + br)
female = reduce22(tr + bl)

personalPurpose  = reduce22(earth + sky)
socialPurpose    = reduce22(male + female)
spiritualPurpose = reduce22(personalPurpose + socialPurpose)

moneyZone  = reduce22(E + br)
loveZone   = reduce22(E + bl)
energyZone = reduce22(E + B)
```

The UI periods remain `до 40`, `40–60`, and `60+`, subject to the same
method-passport parity check as point labels.

### 6.5 Energy Map

The initial seven rows use these physical/energy point pairs; the emotional
value is `reduce22(physical + energy)`:

```text
Сахасрара   B   B1
Аджна       tr  tr1
Вишудха     C   C1
Анахата     br  br1
Манипура    D   D1
Свадхистана bl  bl1
Муладхара   A   A1
```

The physical and energy totals reduce their respective column sums. The total
emotion value is `reduce22(totalPhysical + totalEnergy)`, matching the method
fixture `10 / 10 / 20` for `14.03.1990`; it is not a second reduction of the
seven already-reduced row emotion values. The output is a symbolic energy table
and never a health assessment.

### 6.6 Compatibility

- Calculate each participant independently with the same revision.
- For each base, corner, inner, purpose, and supporting point, calculate the
  composite as `reduce22(firstPoint + secondPoint)`.
- Recalculate composite zones and the energy map from composite points.
- Preserve both individual results in the typed response for explanation.
- The participant order is stable for UI presentation, while exact-request
  deduplication is order-independent.
- The persisted calculation is linked to both CRM clients in one transaction.

### 6.7 Year Forecast And Current Age Cycle

- The request contains an explicit Gregorian year or `current_year`.
- `current_year` is resolved using the astrologer's valid IANA timezone and the
  server clock.
- `personalYear = reduce22(day + month + sumDigits(selectedYear))`.
- `challenge = reduce22(personalYear + E)`.
- `resource = reduce22(personalYear + A)`.
- The current age is resolved independently from the selected forecast year,
  using the complete birth date, the server clock, and the astrologer's
  timezone. The prototype's month-only age calculation is not copied.
- The current active decade point follows the approved perimeter order
  `A, tl, B, tr, C, br, D, bl` for ages `0–79`.
- The perimeter cycle repeats every 80 years. Ages `80+` use `age % 80`, with
  explicit fixtures at the `79 -> 80` and `89 -> 90` boundaries.

## 7. Contracts And Result Shape

### 7.1 Participant Request

Matrix requests accept CRM identity only:

```ts
type MatrixParticipantRequest = {
  role: "subject" | "partner";
  source: "crm_client";
  clientId: string;
};
```

No display name or birth date is trusted from the request. The API hydrates the
current owner-scoped CRM record and creates the canonical calculation input.

### 7.2 Preview And Persistence Requests

```ts
type PreviewMatrixRequest = {
  methodCode: "ladini_22";
  mode: "individual" | "compatibility";
  participants: readonly MatrixParticipantRequest[];
  projection?:
    | { kind: "none" }
    | { kind: "current_year" }
    | { kind: "explicit_year"; year: number };
};

type PersistMatrixCalculationRequest = {
  methodCode: "ladini_22";
  mode: "individual" | "compatibility";
  participants: readonly MatrixParticipantRequest[];
};

type RecalculateMatrixCalculationRequest = Record<string, never>;
```

The server owns title construction, participant names, birth-date snapshots,
fingerprint, checksum, method revision, and links.

### 7.3 Result

The Matrix contract exposes discriminated individual and compatibility results.
It includes:

- method code and engine revision;
- mode and calculation timezone context;
- participant display snapshots without exposing unrelated CRM fields;
- complete point map;
- purposes and zones;
- energy map;
- saved base result for calculation responses;
- current age cycle and optional year forecast in preview/projection responses;
- composite plus both individuals for compatibility;
- interpretation catalog revision;
- result checksum for stale-content and report binding.

The frontend parses every response with the shared schema. It does not infer
missing points or substitute demo values.

## 8. API Surface

All routes belong to authenticated `astrologer-api`:

```text
POST   /matrix/preview
POST   /matrix/calculations
POST   /matrix/calculations/:calculationId/recalculate
GET    /matrix/calculations/:calculationId/projection?year=2026
GET    /matrix/calculations/:calculationId/notes
POST   /matrix/calculations/:calculationId/notes
PUT    /matrix/calculations/:calculationId/notes/:noteId
DELETE /matrix/calculations/:calculationId/notes/:noteId
GET    /matrix/calculations/:calculationId/report
POST   /matrix/calculations/:calculationId/report/ai-draft
PUT    /matrix/calculations/:calculationId/report
POST   /matrix/calculations/:calculationId/report/pdf
```

Existing generic routes remain responsible for listing, retrieving, and
archiving calculations. Matrix does not expose or call generic publication.

Security policy:

- preview and GET routes require an astrologer session but not CSRF;
- every POST, PUT, and DELETE mutation requires the existing CSRF route policy;
- every lookup includes `ownerUserId` and rejects cross-owner IDs;
- request bodies are strict shared schemas;
- report AI generation uses the existing rate limiter and safety identifier;
- chat placeholder has no route.

## 9. Persistence

### 9.1 Existing Calculation Storage

Reuse `calculation_records`, `calculation_participants`, and
`calculation_client_links` with:

```text
module = matrix
mode = individual | compatibility
method_code = ladini_22
status = linked after creation
```

`input_data` contains the canonical hydrated birth-date snapshot, method code,
and engine revision. `result_data` contains only the typed base Matrix result.
Current age cycles and year forecasts are derived on read and are not part of
the saved result checksum. `result_summary` contains small list/detail summary
fields.

The fingerprint includes:

- method code and engine revision;
- mode;
- order-independent participant identities and canonical birth dates.

The projection endpoint reads the owned saved birth-date snapshot and returns a
derived view for the requested year plus the current age cycle. It does not
write, change the calculation checksum, or invalidate notes, reports, links, or
artifacts. A report that deliberately includes a forecast stores the selected
year alongside its own report provenance.

### 9.2 Matrix Notes

Add `matrix_notes`:

```text
id
calculation_id
owner_user_id
text
result_checksum
created_at
updated_at
```

Constraints and indexes enforce non-empty bounded text, owned calculation
access, and efficient calculation timeline ordering. Notes are preserved on
recalculation.

### 9.3 Matrix Report Draft

Add one current `matrix_report_drafts` row per calculation:

```text
id
calculation_id unique
owner_user_id
source manual | ai
status draft | ready
locale ru | en
content_data jsonb
plain_text
result_checksum
model_id nullable
prompt_version nullable
created_at
updated_at
```

`content_data` follows a strict Matrix report schema. It is not arbitrary AI
JSON. Recalculation does not delete the draft; checksum comparison marks it
stale. A stale draft cannot produce a new PDF until reviewed, updated, or
regenerated.

### 9.4 Transactions

- Persisting a calculation and linking all participant clients is atomic.
- Compatibility never leaves a one-sided link after failure.
- Recalculation locks the owned mutable calculation row, replaces the current
  result, revokes existing generic artifacts, and leaves notes/report content
  inspectable as stale.
- Report upsert uses the expected result checksum to prevent saving against a
  result that changed concurrently.

## 10. Interpretation Catalog

The initial catalog is versioned, localized, and code-owned. It is not AI output
and is not copied from competitor pages.

Content is addressed by:

```text
catalogRevision
locale
arcana
contextCode
```

Each entry may contain:

- short title;
- constructive expression;
- shadow expression;
- expert reflection questions;
- practical non-clinical recommendations;
- concise summary suitable for the generated report.

Context codes distinguish the same arcana in portrait, talent, karmic,
relationship, money, lineage, purpose, energy, compatibility, and forecast
positions. A single generic arcana paragraph is insufficient for a professional
workspace.

English content must be authored/reviewed, not generated at runtime from the
Russian catalog.

## 11. AI Boundary

### 11.1 Inputs

The AI context contains only:

- typed Matrix result and checksum;
- selected catalog entries and revision;
- report locale and requested structure;
- client first name or neutral label when needed for readable copy;
- note excerpts explicitly selected by the astrologer.

It excludes full CRM records, email, phone, unrelated notes, raw database rows,
and birth data not required after calculation.

### 11.2 Outputs

The provider must return a strict structured report:

- overview;
- core portrait;
- strengths and talents;
- growth areas;
- money and realization;
- relationships;
- lineage themes;
- purposes;
- optional year projection;
- reflection questions;
- non-clinical practical steps.

The API validates structure and safety before persistence. A malformed provider
response fails explicitly and does not replace the current draft.

### 11.3 Human Control

- AI cannot create or alter a calculation.
- AI cannot link a client.
- AI cannot mark a report ready without an explicit astrologer action.
- AI cannot generate a PDF or send a message automatically.
- AI content is visibly identified as a draft.
- User-supplied notes are treated as untrusted content, not model instructions.

## 12. PDF And Future Chat

The report data model is implemented before PDF rendering. PDF generation uses
the current ready, non-stale report and the expected calculation checksum.

PDF is represented by the existing calculation artifact relationship and Media
asset metadata. Rendering runs as an asynchronous job in `apps/workers` and is
idempotent by calculation id, report revision, checksum, and locale.

Chat behavior in this scope is UI-only:

- render `Отправить в чат` disabled;
- explain that client chats are not yet available;
- make no network call;
- do not create a fake message record;
- do not show a success toast.

Messaging integration requires its own future design and implementation cycle.

## 13. Frontend Information Architecture

The selected option 1 structure is retained inside the existing ElevenHouse
shell and design system.

### 13.1 Header

- module title `Матрица судьбы`;
- CRM client selector; two selectors in compatibility mode;
- mode controls `Личная`, `Совместимость`, `Прогноз`;
- persistence state `Не привязана`, `Привязываем…`, `Привязана`, or
  `Требуется перерасчёт`;
- primary action `Привязать расчёт` when preview is not saved;
- `Сформировать отчёт`/`PDF` when a current linked result exists;
- disabled `Отправить в чат` future affordance;
- no `Начать консультацию` and no publication action.

### 13.2 Left Navigation

Group the professional reading order:

- Обзор;
- Личность;
- Таланты и реализация;
- Деньги;
- Отношения;
- Родовые линии;
- Предназначение;
- Энергетическая карта;
- Возрастные циклы.

The left rail navigates result sections; it does not own calculation logic.

### 13.3 Center Workspace

- responsive interactive matrix graph;
- selected point state;
- zoom/reset controls if required by measured reference behavior;
- `Как рассчитано` explaining the formula and provenance;
- tabs or sections for schema, cycles, compatibility, and energy map;
- visible loading, invalid-client, empty, stale, and API-error states.

### 13.4 Right Workbench

Use tabs:

- `Трактовка`;
- `Заметки`;
- `AI`;
- `Отчёт`.

There is no consultation-session state and no separate client-publication tab.

### 13.5 Frontend Architecture

- Page composition lives under `pages/destiny-matrix/`.
- API/query/mutation orchestration and derived view state live under focused
  `features/destiny-matrix/model/` files.
- Each non-trivial component lives in its own file.
- Reusable visual primitives are extracted to `packages/design-system` only
  when they are genuinely cross-feature.
- Colors, typography, radii, spacing, surfaces, focus states, and icons use the
  production ElevenHouse design tokens and icon set.
- Prototype globals, localStorage, mock clients, inline formula helpers, and
  one-file JSX architecture are not copied.

## 14. Error Handling

Expected feature errors include:

- invalid or unsupported method;
- client not found in the astrologer's active CRM relationships;
- missing or invalid birth date;
- duplicate participants in compatibility;
- invalid projection year;
- calculation not found or wrong module/method;
- archived calculation mutation;
- stale expected checksum;
- report draft bound to an old result;
- AI rate limit, provider failure, malformed output, or safety rejection;
- PDF already generating, failed, or stale.

Domain errors are explicit. The app service translates them to stable HTTP
errors without leaking database or provider internals. Retryable AI/PDF failures
preserve the previous valid draft/artifact state.

## 15. Security And Privacy

- Every object lookup is owner-scoped; UUIDs do not replace authorization.
- Compatibility verifies ownership of both CRM relationships.
- Responses expose only fields declared by shared schemas.
- Birth date is stored in the calculation input snapshot because it is required
  for reproducibility, but it is omitted from list summaries and logs.
- Logs, traces, and metrics never contain report text, note text, full prompts,
  birth dates, phone numbers, or email addresses.
- AI receives minimized data and no provider secrets reach the frontend.
- State-changing routes use the existing signed double-submit CSRF policy.
- Notes and report text have explicit size limits.
- AI and PDF endpoints are rate-limited and resource-bounded.

## 16. Observability

Emit structured, privacy-safe telemetry for:

- preview/create/recalculate latency and failure category;
- exact-result reuse versus new calculation;
- stale calculation detection;
- note and report mutation outcome;
- AI generation latency, model identifier, prompt version, token usage, and
  normalized failure category;
- PDF job state and duration;
- contract-integrity failures.

Use existing observability infrastructure. Correlation identifiers link API and
worker activity without logging sensitive payloads.

## 17. Test Strategy

Implementation follows the repository TDD contract.

### 17.1 Method Tests

- hand-calculated golden fixtures for `14.03.1990` and additional dates;
- dates containing day `22`, day above `22`, leap day, years with zeros, and
  years after 2000;
- invalid calendar dates and invalid reducer inputs;
- all point, purpose, zone, energy-map, compatibility, and year formulas;
- full-date age boundary before, on, and after birthday;
- explicit fixtures for the repeating age cycle at `79`, `80`, `89`, and `90`;
- deterministic output and checksum stability;
- order-independent compatibility fingerprint with stable display order.

The `14.03.1990` individual base fixture begins with:

```text
A=14 B=3 C=19 D=9 E=9
tl=17 tr=22 br=10 bl=5
A1=5 B1=12 C1=10 D1=18
tl1=8 tr1=4 br1=19 bl1=14
```

### 17.2 Contract Tests

- reject manual participants and caller-supplied birth data;
- enforce participant counts and distinct compatibility clients;
- parse every discriminated result mode;
- reject unknown fields and malformed structured report content;
- preserve RU/EN locale contracts.

### 17.3 Domain And Persistence Tests

- preview has no writes;
- creation links all participants atomically;
- exact create is idempotent;
- cross-owner clients/calculations are inaccessible;
- recalculation replaces current result and invalidates artifacts;
- notes survive and become stale;
- report survives and becomes stale;
- stale expected checksum prevents report overwrite/PDF generation;
- DB constraints and indexes exist in the regenerated baseline migration.

### 17.4 API Tests

- authenticated preview without CSRF succeeds;
- mutations without valid CSRF fail;
- clients with missing birth dates return a stable feature error;
- service hydrates CRM names and birth dates server-side;
- Matrix cannot call publication behavior;
- AI failures are controlled and previous drafts remain intact.

### 17.5 Frontend And Browser Tests

- only CRM clients are selectable;
- incomplete clients show the correct disabled state;
- selecting clients triggers preview without persistence;
- link action persists and displays server-backed state;
- changed CRM data produces stale/recalculate UI;
- notes and report staleness are visible;
- chat action is disabled and sends no request;
- no frontend Matrix arithmetic exists;
- browser flow is compared against the exact design reference and selected
  option 1 at the same viewport and state;
- keyboard navigation, focus, contrast, overflow, and responsive behavior are
  verified.

## 18. Implementation Sequence

The feature is decomposed into bounded delivery slices:

1. **Method passport and pure engine**
   - verify formulas/labels against the authoritative method source;
   - add typed contracts, method registry, pure calculations, and golden tests.

2. **Backend preview and linked persistence**
   - add Matrix Nest module;
   - hydrate CRM participants;
   - implement preview, atomic create/link, exact reuse, and recalculation;
   - add contract/domain/service/e2e tests.

3. **Compatibility and projection completeness**
   - complete composite, energy map, year, age, and result summaries.

4. **Notes and interpretation catalog**
   - add Matrix persistence schema/adapter;
   - add versioned RU/EN interpretation content;
   - implement note CRUD and stale-checksum behavior.

5. **AI report draft**
   - add structured report contract, prompt definition, provider integration,
     safety checks, persistence, and tests.

6. **Production frontend**
   - implement selected option 1 information architecture using production
     tokens/components and real API state;
   - verify reference parity and complete expert workflow in the browser.

7. **PDF generation and chat placeholder**
   - generate checksum-bound PDF artifacts through an idempotent worker job;
   - render the disabled future-chat action without backend behavior.

Each slice must pass its targeted evidence before the next slice builds on it.

## 19. Acceptance Criteria

The Matrix module is complete only when:

- one canonical Ladini 22 engine is reproducible from reviewed fixtures;
- the server is the sole arithmetic authority;
- only owner-scoped CRM clients can participate;
- preview never persists;
- link is the only save action and compatibility links both clients atomically;
- existing exact calculations are reused safely;
- changed birth data requires explicit recalculation;
- notes and reports preserve visible checksum provenance;
- AI output is structured, editable, minimized, rate-limited, and never
  auto-approved;
- a current ready report produces a downloadable checksum-bound PDF artifact;
- no publish or consultation-session behavior is exposed;
- chat is an honest disabled placeholder;
- the frontend matches the selected option 1 structure and ElevenHouse design
  system with live browser evidence;
- targeted tests, integration evidence where infrastructure is already running,
  and required broad repository verification pass;
- canonical architecture, API, and design inventory documents are synchronized
  with the final implementation.

## 20. Explicit Non-Goals

- Manual calculation participants.
- Inline CRM client creation or birth-data editing.
- Consultation/session management.
- Public or guest calculator.
- Client cabinet publication.
- Messaging or chat delivery.
- Multiple Matrix schools or method selection.
- Generic formula DSL.
- Frontend calculations or offline fallback.
- Medical interpretation of the energy map.
- Automatic AI actions, publication, or sending.

## 21. Research Basis

Architecture and safety decisions were checked against primary sources:

- NestJS feature-module encapsulation and provider boundaries:
  <https://docs.nestjs.com/v4/modules>
- Drizzle transaction behavior:
  <https://orm.drizzle.team/docs/transactions>
- PostgreSQL transaction isolation and row locking:
  <https://www.postgresql.org/docs/17/transaction-iso.html>
- OWASP object-level and property-level API authorization:
  <https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/>
  <https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/>
- OWASP LLM prompt-injection and sensitive-information risks:
  <https://genai.owasp.org/llm-top-10/?cat=253>
- NIST Generative AI risk-management profile:
  <https://www.nist.gov/itl/ai-risk-management-framework>
- European Commission data-minimization guidance:
  <https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/overview-principles/what-data-can-we-process-and-under-which-conditions_en>
- OpenTelemetry observability model:
  <https://opentelemetry.io/docs/>
- Official Ladini method authorship and 22-path description:
  <https://matricaladini.ru/%D0%BA%D0%B0%D0%BA-%D0%BF%D0%BE%D1%81%D1%82%D1%80%D0%BE%D0%B8%D1%82%D1%8C-%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D1%83-%D1%81%D1%83%D0%B4%D1%8C%D0%B1%D1%8B-%D1%81%D0%B0%D0%BC%D0%BE%D1%81%D1%82%D0%BE/>
