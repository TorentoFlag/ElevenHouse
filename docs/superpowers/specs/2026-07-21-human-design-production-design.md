# Human Design Production Design

Date: 2026-07-21
Status: draft for user review
Scope: authenticated astrologer Human Design workspace, authoritative
calculation method, CRM client linking, bodygraph visualization, interpretation
workspace, presentation, transits, compatibility, AI draft support, PDF export
and client delivery boundaries.

> This document is an implementation design artifact. After implementation,
> durable decisions must also be reflected in canonical product, architecture,
> API, testing and design-inventory documents.

## 1. Purpose

Build the Human Design surface as a professional calculation and consultation
preparation tool inside the astrologer's CRM workspace. The module lets an
astrologer select existing CRM clients, calculate accurate Human Design
bodygraphs, explore graph mechanics, prepare session materials and eventually
deliver approved artifacts to the client through explicit product workflows.

The module is not a public Human Design calculator, discovery surface,
marketplace feature, standalone lead-capture funnel or generic website embed.
It follows ElevenHouse's closed direct-link SaaS model: client data appears only
inside relationships that already exist.

## 2. Canonical Sources And Precedence

For this feature, sources are applied in this order:

1. User decisions in the Human Design planning discussion.
2. This approved design, after user review.
3. Current ElevenHouse product and architecture documents.
4. Current production calculation, chart-engine, AI, media and PDF contours.
5. `ElevenHouseDesign/app/hd.jsx`, `hd-data.jsx`, `hd-graph.jsx`,
   `hd-modes.jsx` and `screenshots/02-hd.png` for visual/product evidence.
6. External Human Design APIs and libraries as benchmark/reference evidence,
   not as production runtime authority.

`ElevenHouseDesign` defines visual language and desired workflow states. Its
demo calculation, browser globals, local storage, fixed transit data and fake
AI/PDF/client delivery are explicitly not production business logic.

## 3. Product Position

Human Design is part of the astrology/calculation value layer for astrologers.
It should feel like a precise expert cockpit: clear client context, large
bodygraph, inspectable mechanics, safe explanations, and fast session-prep
actions.

The end-state instrument includes:

- individual bodygraph calculation;
- core chart properties: type, strategy, authority, profile, definition,
  signature, not-self theme and incarnation cross;
- 26 planetary activations split into Personality and Design;
- centers, gates and channels with defined/open state;
- detailed element inspection for centers, gates, channels and properties;
- compatibility/connection analysis for two existing CRM clients;
- transit overlay and daily transit context;
- full-screen presentation mode for live sessions;
- AI-assisted draft interpretation and session brief, never arithmetic;
- private PDF export;
- explicit client-visible delivery only after publication/materials/consent
  boundaries are available.

## 4. Locked Product Decisions

### 4.1 Participants And Data Input

- Individual calculation requires exactly one existing owner-scoped CRM client.
- Compatibility calculation requires exactly two distinct owner-scoped CRM
  clients.
- First production method does not support anonymous public users, marketplace
  visitors or unrelated clients.
- Manual participants are not part of the first implementation path. They
  require separate product approval that defines how non-CRM data is stored,
  consented and deleted.
- Birth data must include birth date, known birth time, IANA timezone and
  coordinates/place data before calculation can run.
- `birthTimePrecision = unknown` blocks calculation.
- `birthTimePrecision = approximate` may calculate, but the result must carry a
  visible precision warning.
- Changing CRM birth data never mutates saved Human Design results implicitly.
  Existing results become stale and require explicit recalculation.

### 4.2 Calculation Authority

- The frontend never calculates Human Design values.
- The server is the only Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- ElevenHouse owns the Human Design domain engine and typed result contract.
- Planetary longitudes come from an ephemeris/provider boundary, not handwritten
  astrology math.
- The Design side is calculated from the exact 88-degree solar arc before
  birth, not from a simple 88-calendar-day approximation.

### 4.3 Preview, Linking And Persistence

- Preview is authenticated, read-only and creates no calculation rows,
  participant links, interpretations, reports or artifacts.
- The astrologer explicitly saves/links a result to the selected CRM client or
  clients.
- Persisted records use `calculation_records.module = human_design`.
- Repeating the same method, mode, participant snapshot, input settings and
  result fingerprint reuses the existing calculation rather than duplicating
  it.
- `Привязан` appears only after a persisted linked record is returned.
- Archived results cannot be recalculated, published or exported.

### 4.4 End-State Modes

- `Личная карта`: one client, full individual bodygraph.
- `Партнёрский разбор`: two client bodygraphs plus connection dynamics.
- `Транзиты`: current or selected-moment planetary overlay against a saved
  individual bodygraph.
- `Презентация`: full-screen bodygraph and key properties for live session use.
- `PDF`: private generated document from the current checksum-bound result and
  approved report content where required.
- `Клиенту`: explicit client delivery/publishing action. It must remain
  disabled or absent until client-visible materials, publication rules and
  consent/access controls exist.

These modes are part of the complete product target. They may be implemented in
separate iterations, but they are not removed from scope.

### 4.5 AI, Interpretation And Safety

- Deterministic calculation and interpretation are separate.
- AI never calculates gates, lines, centers, channels, type, profile,
  authority, variables, transits or compatibility mechanics.
- AI receives minimized, validated deterministic result context, locale,
  report intent and explicitly selected astrologer notes when that notes
  contour exists.
- AI output is an editable draft requiring expert review.
- AI prompts and generated text must not diagnose disease, prescribe treatment,
  predict death, or provide legal/financial/medical advice.
- Public/frontend responses expose safe text and status only; provider model,
  prompt version and internal metadata stay backend-only.

### 4.6 Privacy And Consent

- Human Design uses sensitive birth data. No external provider receives names,
  CRM notes, phone numbers, messages or unrelated profile data.
- If an external API is used for benchmarking, use consent-safe test fixtures
  or synthetic data unless the user explicitly authorizes real data.
- Client-visible delivery requires explicit product rules for publication,
  ownership, consent, revocation and access logs.
- Private PDF artifacts use short-lived owner-scoped URLs and never expose
  storage keys or source fingerprints.

## 5. Visual Reference Findings

Reference files:

- `ElevenHouseDesign/app/hd.jsx`
- `ElevenHouseDesign/app/hd-data.jsx`
- `ElevenHouseDesign/app/hd-graph.jsx`
- `ElevenHouseDesign/app/hd-modes.jsx`
- `ElevenHouseDesign/screenshots/02-hd.png`

The reference surface contains:

- top toolbar with module title, client picker and actions;
- large central bodygraph with defined/open centers and colored channels;
- side panel with selected property interpretation and center list;
- left rail / cards for type, strategy, authority, profile and definition;
- Personality and Design activation columns;
- transit toggle and transit-completion list;
- partner toggle with two bodygraphs and relationship dynamics;
- full-screen presentation overlay;
- PDF export modal;
- mobile layout with picker, action row, bodygraph, property cards, activation
  accordion, AI panel, center list and bottom sheet detail.

Production should preserve this visual language, but use app-owned React
composition, shared contracts and backend-calculated results.

## 6. Research

Question: should ElevenHouse use a third-party Human Design library/API or build
its own Human Design engine?

Decision affected: calculation authority, provider boundary, privacy,
licensing, data contract, testing and rollout sequencing.

Accessed: 2026-07-21.

### Sources

- https://bodygraph.com/human-design-api/ - Bodygraph's API overview and
  commercial/practitioner product framing.
- https://bodygraph.com/docs/ - Bodygraph endpoint examples and response shape
  for HD data, relationship data and timezone lookup.
- https://humandesignhub.app/en/human-design-api - HumanDesignHub feature
  coverage: full bodygraph, transits, composite, group analysis, AI and React
  components.
- https://roxyapi.com/products/human-design-api - RoxyAPI feature coverage and
  methodological claims for 88-degree solar arc, activations, centers,
  channels, variables, transit and connection endpoints.
- https://docs.humandesignapi.nl/ - Human Design API documentation shape:
  birth date/time/location input and structured type/profile/channels/centers
  output.
- https://github.com/CReizner/SharpAstrology.HumanDesign - open-source .NET
  Human Design package, supported features and SwissEph dependency notes.
- https://github.com/jdempcy/hdkit - open-source HD toolkit with bodygraph and
  planetary-position goals.
- https://github.com/Unforced-Dev/natalengine - JavaScript package claiming
  Human Design and Gene Keys output.
- https://pypi.org/project/kerykeion/ - Kerykeion version, capabilities,
  Python requirement and AGPL/commercial hosted API warning.
- https://www.astro.com/swisseph/swephprg.htm - Swiss Ephemeris dual license:
  AGPL or Professional License.

### Findings

- Sourced fact: Bodygraph API returns structured chart data such as type,
  strategy, authority, profile, centers, gates, channels and chart images. It
  is marketed for practitioner/business platforms and white-label use.
- Sourced fact: Bodygraph docs expose HD data and relationship endpoints and
  include `DesignDateUtc`, `Personality`, `Design`, gates, channels, centers
  and variables in sample responses.
- Sourced fact: HumanDesignHub markets full bodygraph calculation, transit
  analysis, composite/compatibility, group Penta, AI-powered analysis and
  React components.
- Sourced fact: RoxyAPI describes a full bodygraph endpoint with type,
  strategy, authority, profile, definition, incarnation cross, 9 centers, 36
  channels and 26 activations. It explicitly warns that the Design side should
  be solved on the 88-degree solar arc rather than approximated as 88 days.
- Sourced fact: RoxyAPI describes connection chart dynamics:
  electromagnetic, dominance, compromise and companionship.
- Sourced fact: RoxyAPI describes variables as a fine-grained layer where
  color, tone and base can change near narrow boundaries, so birth-time
  precision matters.
- Sourced fact: SharpAstrology.HumanDesign can calculate common bodygraph
  output including type, profile, incarnation cross, split definition, channel
  and gate activations, authority, variables, transits and composite charts.
- Sourced fact: SharpAstrology.HumanDesign itself is MIT, but its optional
  SwissEph package is AGPL-3.0 and the documentation warns about SwissEph dual
  licensing.
- Sourced fact: Kerykeion 5.12.9 is current on PyPI as of 2026-05-25 and
  provides high-precision astrology calculations, but its metadata/license
  framing includes GPLv3/AGPL-3.0 and recommends hosted API for closed-source
  commercial SaaS.
- Sourced fact: Swiss Ephemeris is dual-licensed under AGPL or Swiss Ephemeris
  Professional License, and public services must choose a license model before
  activation.
- Repository evidence: ElevenHouse already has a private `apps/chart-engine`
  Python/FastAPI runtime with Kerykeion 5.12.x, returning canonical chart JSON
  and not provider SVG or raw models.
- Repository evidence: `calculation_records` already supports
  `module = human_design`, while dedicated Human Design contracts/domain/API/UI
  are missing.
- Repository evidence: ADR 0008 provides a generic private calculation PDF
  lifecycle that Human Design can reuse once a renderer exists.
- Inference: using a third-party HD API as runtime would create privacy,
  availability, pricing and vendor-lock risks in the domain's core calculation
  authority.
- Inference: using SharpAstrology directly would add .NET runtime complexity
  and does not avoid Swiss Ephemeris licensing questions.
- Inference: implementing ephemeris math from scratch is unnecessary and high
  risk. Implementing the Human Design mapping/derivation layer ourselves is
  tractable, testable and strategically better.

### Options

#### A. Own Human Design engine over existing ephemeris provider - selected

Extend the internal chart-engine/provider boundary to return planetary
longitudes for arbitrary moments. Build Human Design mapping and derivation in
TypeScript domain code.

Benefits:

- keeps Human Design rules owned by ElevenHouse;
- avoids vendor lock-in for the product's core differentiation;
- reuses existing `Calculations`, chart-engine, worker, AI and PDF contours;
- supports strict fixtures, checksums and reproducible results;
- keeps frontend free of arithmetic.

Risks:

- requires careful method-passport work and fixture validation;
- still needs a production licensing decision for the ephemeris provider if
  Kerykeion/Swiss Ephemeris remains in use;
- requires an 88-degree solar-arc solver, not a rough date subtraction.

#### B. External Human Design API as production runtime - rejected for default

Call Bodygraph, RoxyAPI, HumanDesignHub or similar provider from backend and
store their returned output.

Benefits:

- faster first visible result;
- broad endpoint coverage, including compatibility/transits in some providers;
- useful response models for benchmarking.

Risks:

- sends sensitive birth data to a vendor;
- needs DPA/privacy/legal review, rate-limit handling and vendor outage
  behavior;
- locks ElevenHouse domain contracts to provider semantics;
- makes long-term correctness and result drift harder to audit.

Acceptable use: bounded benchmark and fixture generation with synthetic or
approved test data.

#### C. Import an open-source Human Design library directly - rejected for
production default

Use SharpAstrology.HumanDesign, hdkit, natalengine or a similar library as the
runtime engine.

Benefits:

- some Human Design derivations already exist;
- useful codebase to inspect for rule coverage and edge cases;
- may accelerate fixture comparison.

Risks:

- ecosystem mismatch for ElevenHouse's TypeScript/Nest/Python split;
- mixed maturity and maintenance levels;
- transitive ephemeris licensing risk remains;
- imported result semantics may not match our contracts.

Acceptable use: reference reading, non-production fixture comparison and
algorithm sanity checks.

#### D. Handwrite all astronomy and Human Design - rejected

Implement ephemerides, time conversion and Human Design rules from scratch.

Benefits:

- maximum ownership.

Risks:

- highest correctness risk;
- unnecessary effort;
- likely worse than established ephemeris providers;
- hard to verify across historical timezone and DST cases.

## 7. Recommendation

Build ElevenHouse's own Human Design domain engine on top of an ephemeris
provider boundary.

The runtime shape should be:

```text
CRM birth data
  -> normalize birth instant, timezone, coordinates
  -> chart-engine planetary positions at birth
  -> solve exact Design moment by 88-degree solar arc
  -> chart-engine planetary positions at Design moment
  -> map longitudes to gates, lines and later color/tone/base
  -> derive channels, centers, type, authority, profile and definition
  -> return typed Human Design result + checksum
```

External APIs and open-source libraries become benchmark inputs, not runtime
authority.

## 8. Proposed Domain Contract

### 8.1 Method Code

Use one initial method code:

```text
human_design_classic
```

The method passport must lock:

- tropical zodiac;
- gate wheel ordering and offset;
- active celestial bodies;
- Earth as Sun longitude + 180 degrees;
- lunar node mode, initially true node unless fixtures prove another mode is
  required for the chosen canonical reference;
- Design side exact 88-degree solar arc;
- supported depth: gate/line first, variables later after precision policy.

### 8.2 Result Shape

The first full result should contain:

- `schemaVersion: "human-design-result.v1"`;
- `methodCode: "human_design_classic"`;
- `engineRevision`;
- `inputSnapshot`;
- `calculationWarnings`;
- `personalityActivations`;
- `designActivations`;
- `definedGates`;
- `definedChannels`;
- `centers`;
- `type`;
- `strategy`;
- `authority`;
- `profile`;
- `definition`;
- `incarnationCross`;
- `bodygraphGeometryVersion`;
- `benchmarkMetadata` for internal test fixtures only, not public response.

Variables (`color`, `tone`, `base`, arrows/PHS/Rave Psychology) should be part
of the end-state model but activated only after fixture confidence and
birth-time precision policy are confirmed.

### 8.3 Compatibility Result

Compatibility should derive from two saved or previewed individual results:

- both individual summaries;
- combined centers;
- combined definition;
- channel dynamics:
  - electromagnetic;
  - dominance;
  - compromise;
  - companionship;
  - individual-only contributions;
- concise factual summary for right panel and PDF/report context.

Compatibility must not create a public relationship object or client discovery
path.

### 8.4 Transit Result

Transit overlay should use one selected instant:

- transiting activations at the selected instant;
- no Design side for transit;
- channels completed by transit against the natal chart;
- temporarily defined centers;
- factual summary and warnings.

Daily/current transits resolve using server clock and explicit timezone rules.

## 9. Architecture

### 9.1 Backend And Domain

```text
apps/astrologer-web
  -> packages/contracts/src/human-design.ts
  -> apps/astrologer-api/src/modules/human-design
       -> packages/domain/src/human-design
       -> packages/domain/src/calculations
       -> packages/domain/src/clients
       -> chart-engine positions provider
       -> packages/domain/src/calculations/pdf
       -> Ai module for drafts

apps/chart-worker or human-design worker slice
  -> private apps/chart-engine positions endpoint
```

`packages/domain/src/human-design` owns all Human Design derivations and method
registry. `apps/chart-engine` owns provider-backed planetary positions only.

### 9.2 API Routes

Initial/complete route set:

```text
POST /human-design/preview
POST /human-design/calculations
POST /human-design/calculations/:calculationId/recalculate
GET  /human-design/calculations/:calculationId/transits?instant=...
POST /human-design/compatibility/preview
POST /human-design/calculations/:calculationId/ai-draft
GET  /human-design/calculations/:calculationId/report/pdf?locale=ru|en
POST /human-design/calculations/:calculationId/report/pdf
GET  /human-design/calculations/:calculationId/report/pdf/:jobId/download
```

Preview/transit GET reads are authenticated and side-effect free. State-changing
routes require CSRF and checksum guards where applicable.

### 9.3 Storage

Reuse generic `calculation_records`:

- `module = human_design`;
- `mode = individual | compatibility`;
- `method_code = human_design_classic`;
- `input_data` contains normalized, owner-scoped snapshots;
- `result_data` contains typed Human Design result;
- `result_summary` contains compact list/state fields for menus;
- `result_checksum` guards notes, AI drafts, PDF and publication.

No new calculation-version history is introduced.

### 9.4 Frontend

Add `/human-design` in `astrologer-web`.

Frontend decomposition:

- route/controller: API orchestration and URL state;
- feature API: validated contract calls;
- feature model: selection, stale state, action availability, detail selection;
- components:
  - `HumanDesignBodygraph`;
  - `HumanDesignActivationColumn`;
  - `HumanDesignRail`;
  - `HumanDesignDetailPanel`;
  - `HumanDesignCompatibilityPanel`;
  - `HumanDesignTransitPanel`;
  - `HumanDesignPresentation`;
  - mobile sheet/accordion variants.

The bodygraph SVG uses canonical geometry derived from the visual reference,
but receives only typed result data.

## 10. Implementation Slices

These slices are sequencing, not scope removal.

### Slice 1: Method Passport And Benchmark Harness

- Write method passport.
- Define gate wheel, center/channel catalog and type/authority derivation
  rules.
- Create synthetic fixture set and benchmark script against selected external
  APIs or checked public examples.
- Decide node mode and boundary precision policy.

Acceptance: fixtures establish expected outputs for type, authority, profile,
centers, gates and channels.

### Slice 2: Planetary Positions Provider

- Add a provider endpoint or internal client for arbitrary-moment planetary
  longitudes.
- Add exact Design moment solver for 88-degree solar arc.
- Add tests around timezone, DST ambiguity and boundary cases.

Acceptance: birth and design moments produce reproducible positions with
provider metadata.

### Slice 3: Individual Human Design Engine

- Implement gates/lines mapping.
- Implement activations, channels, centers, type, authority, profile,
  definition and incarnation cross.
- Add typed contracts and domain tests.

Acceptance: domain golden fixtures pass without frontend arithmetic.

### Slice 4: API Persistence And CRM Linking

- Add `human-design` module in `astrologer-api`.
- Implement preview, persist, list integration, recalculate and stale behavior.
- Reuse `Calculations` for links/checksums.

Acceptance: owner-scoped API e2e covers preview no-write, persist link,
idempotent replay, auth, CSRF and stale recalculation.

### Slice 5: Production UI Bodygraph Workspace

- Implement `/human-design` visual surface from reference.
- Cover no-client, missing data, calculating, failed, calculated, stale,
  linked and archived states.
- Include desktop and mobile responsive states.

Acceptance: component tests, runtime E2E and design-parity screenshots.

### Slice 6: Compatibility And Transits

- Implement compatibility preview from two CRM clients.
- Implement transit overlay for selected/current instant.
- Keep all reads side-effect free unless explicitly saving a compatibility
  calculation.

Acceptance: relationship dynamics and transit-completed channels are
deterministic and tested.

### Slice 7: AI Draft, Report And PDF

- Add minimized AI context builder.
- Add editable AI draft/report flow.
- Add private PDF renderer through ADR 0008 lifecycle.

Acceptance: checksum guards prevent stale AI/PDF; generated PDFs render and
contain no private metadata.

### Slice 8: Client Delivery

- Enable `Клиенту` only after client-visible materials/publication and consent
  rules exist.
- Publish only approved, current-checksum artifacts.

Acceptance: client access is owner/relationship scoped, revocable and audited.

## 11. Testing And Verification Strategy

- Domain tests for every derivation and boundary case.
- Fixture comparison tests against approved benchmark outputs.
- Contract tests for request/result schemas.
- API e2e for auth, owner scope, CSRF, preview no-write, persist, recalculate
  and safe errors.
- DB integration for uniqueness, checksum replacement, link consistency and
  artifact invalidation.
- Worker/provider integration for ephemeris positions and retry/failure paths.
- Frontend tests for state model, action availability, rendering, keyboard
  navigation and mobile sheets.
- Runtime E2E in authenticated `astrologer-web`.
- Design parity against exact Human Design reference desktop and mobile states.
- PDF verification with `pdfinfo`, `pdftotext`, rendered page screenshots and
  stale-download rejection.

## 12. Risks And Required Decisions

### Licensing

Kerykeion and Swiss Ephemeris licensing must be resolved before production
activation if the internal chart-engine continues to use that stack. Options:

1. confirm legal compatibility for the deployed architecture;
2. purchase/use Swiss Ephemeris Professional License where required;
3. use a hosted ephemeris/astrology provider with explicit commercial terms and
   DPA.

This is a material production decision and cannot be hidden inside
implementation.

### Method Authority

Human Design has multiple calculators and potential small disagreements near
boundaries. ElevenHouse needs one accepted method passport. External mismatch
is treated as evidence to investigate, not as runtime branching.

Current fixture confidence, accessed 2026-07-22:

| Source | Fixture | Fields Checked | Result | Notes |
| --- | --- | --- | --- | --- |
| BodyGraph documented example + `human-design-py` MIT reference | `1980-01-01T00:00:00Z` raw longitudes | gate/line mapping, channels, centers, type, authority code, profile, definition, incarnation cross | passed with caveat | BodyGraph static gate fields had internal longitude/gate inconsistencies, so only raw longitudes were promoted; gate-wheel expectations follow the reference implementation. |
| HumanDesignAPI live public trial | `1990-09-05 21:17 Amsterdam` | type, profile, external authority label, definition, centers, channel and all 26 activations | passed | External `Sounding Board` authority maps to ElevenHouse `mental` authority code. Source does not expose raw longitudes, so fixture stores local chart-engine resolved longitudes for the same birth data. |
| Internal reference boundary case | `reference-gate-line-boundaries-41-19-transition` | exact gate 41 start, just before line 2, exact line 2 boundary, just before gate 19 and exact gate 19 start; channels, centers, type, authority, profile, definition and all 26 activations | passed | Locks the v1 start-inclusive/end-exclusive boundary policy for gate and line transitions. This is a method boundary regression fixture, not an external calculator endorsement. |

The method passport can now treat gate/line boundary policy as explicitly
covered for v1. Commercial activation still depends on the broader production
requirements in this document, including licensing, privacy, consent,
authenticated browser evidence and client-delivery boundaries.

### Advanced Variables

Variables, color, tone and base are more sensitive to birth-time and ephemeris
precision. They belong to the end-state, but should not be marketed or rendered
as authoritative until fixture confidence is high.

### Client Delivery

Client delivery touches consent, materials, publication and access controls. It
must not be simulated with a toast or local state.

## 13. User Decisions

Current decisions:

- Build our own Human Design engine.
- Do not use external Human Design APIs as production runtime by default.
- Use external APIs/libraries for research, benchmark and fixture comparison.
- Reuse the existing ephemeris/chart-engine foundation instead of writing
  astronomy ourselves.
- Keep the complete tool scope; implementation sequencing must not remove
  transits, compatibility, AI, PDF, presentation or client delivery from the
  target product.

Future decisions needed:

- production licensing/commercial-provider path for ephemeris;
- canonical Human Design method passport after fixture comparison;
- whether manual non-CRM participants are ever allowed;
- when client-visible delivery is permitted by product/consent rules.
