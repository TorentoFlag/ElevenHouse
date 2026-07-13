# Numerology Calculations Design

Date: 2026-07-05
Status: superseded
Scope: ElevenHouse astrologer workspace, client cabinet visibility, shared calculation foundation

> This historical design is superseded by
> `docs/superpowers/specs/2026-07-14-pythagorean-ru-correction-design.md`.
> In particular, method/result versioning, configurable Pythagorean profiles and
> `calculation_versions` are not part of the current architecture.

## Goal

Build Numerology as a production calculation product, not as a one-off UI
calculator. The first production slice ships a complete Pythagorean method
because it is the only method currently described with enough formulas and
acceptance detail. The architecture must make Vedic, Kabbalistic, Author, and
future methods fast to add once their formulas, settings, and acceptance
fixtures are defined.

## Inputs Reviewed

- `ElevenHouseDesign/app/numerology.jsx`
- `ElevenHouseDesign/app/numerology-data.jsx`
- `ElevenHouseDesign/app/numerology-extra.jsx`
- Google Doc: "Техническое задание на разработку раздела Нумерология"
- `docs/architecture/design-reference-inventory.md`
- `docs/product/full-functional-scope.md`
- `docs/architecture/overview.md`
- `docs/api/api-boundaries.md`
- `docs/development/agent-runbooks/06-workers-and-events.md`
- Analog research: World Numerology / Decoz professional software, Astro-Seek
  calculators, Matrix Destiny style AI/report products
- Best practice references: NestJS feature modules, PostgreSQL `jsonb`,
  OWASP secure-by-design, OpenAI Structured Outputs

## Product Principles

1. A numerology result is a saved business object owned by an astrologer.
2. Manual participants never create CRM clients implicitly.
3. CRM-linked participants are linked by stable client ID, while calculation
   inputs remain a snapshot.
4. Saved results do not mutate when CRM data changes.
5. AI can draft interpretation text only from deterministic calculation output.
   AI never calculates numbers and never changes indicators.
6. Client cabinet visibility is an explicit publish action. Draft AI text is
   private until the astrologer approves or edits it.
7. Recalculation creates a new result version, preserving previous versions for
   audit, trust, and already-shared materials.

## Release Slice

### Included

- `/numerology` in `astrologer-web`.
- Individual Pythagorean calculation.
- Compatibility Pythagorean calculation for two participants.
- CRM participant source and manual participant source.
- Saved calculations and search/list foundation for "Мои расчеты".
- Pythagorean profile settings:
  - master number behavior: preserve all, reduce all, preserve selected;
  - name normalization: punctuation/space cleanup, case folding, Ё/Е and Й/И
    policy;
  - enable name-based numbers;
  - enable psychomatrix;
  - enable strength lines;
  - enable personal year, month, and day.
- Structured result display:
  - key numbers;
  - psychomatrix;
  - strength lines;
  - compatibility comparison;
  - zones of match, attention, and tension.
- AI draft generation after deterministic result exists.
- Save, reopen, edit inputs, recalculate as new version.
- Link to CRM client when at least one participant source is CRM.
- Publish approved interpretation/material to client cabinet.

### Deferred

- Vedic, Kabbalistic, and Author methods as active calculations.
- Method editor for astrologers.
- Marketplace/discovery behavior.
- Fully automated PDF layout generation if the shared artifact pipeline is not
  ready.
- Heavy chart/human-design style worker extraction unless measurements show
  numerology is too expensive for synchronous API use.

## Extension Model For Future Methods

The system must expose a method-profile contract rather than hardcoding
Pythagorean UI and logic into page components.

Each method profile defines:

- `methodCode`: `pythagorean`, `vedic`, `kabbalistic`, `author`, or future code.
- `methodVersion`: immutable semantic version used in result provenance.
- supported modes: individual, compatibility.
- required participant fields.
- optional participant fields.
- input normalization rules.
- letter table rules.
- reduction rules.
- master number rules.
- available indicators.
- enabled visual blocks.
- compatibility comparison rules.
- AI interpretation context schema.
- PDF/material block schema.
- fixtures required for release.

Adding a future method should mean:

1. Add a versioned method profile.
2. Add its deterministic calculation engine.
3. Add fixtures and acceptance tests.
4. Add UI block adapters for any new result block types.
5. Enable the method through entitlement/config once tests pass.

The UI may render generic result blocks, but formulas must live in domain code.
No production calculation may depend on `ElevenHouseDesign` helpers.

## Domain Architecture

### `Calculations`

Shared lifecycle module for every saved calculation module: Numerology, Chart
Engine, Destiny Matrix, Human Design, and future calculation products.

Responsibilities:

- create calculation record;
- store participants and input snapshots;
- store immutable result versions;
- list/search/filter "Мои расчеты";
- link saved calculation to CRM clients;
- publish or unpublish client-visible results;
- archive records;
- store interpretation versions;
- attach generated materials and PDFs;
- emit events for artifacts, notifications, and analytics.

### `Numerology`

Method-specific deterministic module.

Responsibilities:

- validate numerology input against method profile;
- normalize names;
- calculate Pythagorean indicators;
- compare compatibility results;
- produce structured result JSON;
- expose AI-safe interpretation context;
- own method fixtures and formula tests.

`Numerology` depends on `Calculations` for persistence/lifecycle. `Calculations`
does not depend on Pythagorean formulas.

## Persistence Model

Recommended tables:

- `calculation_records`
  - id, owner astrologer id, module, mode, method code, current method version,
    title, status, created/updated/calculated timestamps, source, result summary.
- `calculation_participants`
  - record id, role, source type, client id nullable, display name, birth date,
    optional birth time/place, input snapshot, manually overridden flag.
- `calculation_versions`
  - record id, version number, method version, settings snapshot, input snapshot,
    result snapshot, result checksum, created by, created at.
- `calculation_client_links`
  - record id, client id, visibility, linked at, published at, unpublished at.
- `calculation_interpretations`
  - record id, version id, source, status, text, model/prompt metadata for AI,
    approved by, approved at.
- `calculation_artifacts`
  - record id, version id, media asset id, artifact type, generation status.

Use columns for search, ownership, statuses, and relations. Use `jsonb` for
method-specific snapshots and result blocks because each method can have a
different structured output.

## API Boundaries

### `astrologer-api`

- `GET /calculations`
- `GET /calculations/:id`
- `POST /numerology/calculations`
- `POST /numerology/calculations/:id/recalculate`
- `POST /numerology/calculations/:id/ai-draft`
- `POST /calculations/:id/link-client`
- `POST /calculations/:id/publish`
- `POST /calculations/:id/archive`

All endpoints require authenticated astrologer context and ownership checks.

### `public-api`

Client cabinet may read only published calculation links for the current client.
It must never expose astrologer-private drafts, hidden versions, or unrelated
manual participants.

## Frontend Architecture

Recommended feature boundaries:

- `features/calculations`
  - shared list/search/filter API;
  - calculation status labels;
  - saved calculation picker;
  - publish/link/archive actions.
- `features/numerology`
  - method profile view models;
  - setup modal state;
  - participant form adapters;
  - result block adapters;
  - AI draft panel;
  - compatibility comparison view.
- `/pages/numerology`
  - page shell, routing, and composition only.

The page should follow the design reference visually, but production logic must
live in feature modules and shared domain/contracts.

## Pythagorean Formula Scope

The first release implements and tests:

- reduction with configurable master numbers;
- life path from all birth-date digits;
- birthday number from day of month;
- expression/destiny from all normalized name letters;
- soul number from vowels;
- personality number from consonants;
- personal year from day, month, and target year;
- personal month from personal year and month number;
- personal day from personal month and day;
- psychomatrix from birth-date digits plus four working numbers;
- strength lines over configured cells;
- pair number from participants' life path numbers;
- comparison of key numbers, matrix cells, and strength lines;
- zones of match, attention, and tension.

All formulas need deterministic tests with examples from the Google Doc and at
least several edge fixtures: master numbers, missing name, Ё/Й policies,
manual-only compatibility, same CRM client selected twice, future birth date,
and CRM data changed after save.

## AI Rules

- AI requests receive structured result JSON and approved context only.
- AI output is stored as draft interpretation.
- AI output is editable.
- Publishing requires astrologer confirmation.
- The prompt contract must state that numbers and indicators are immutable.
- Store prompt version, model id, and safety identifier for audit.

## UX Rules

- Empty state explains how to create a calculation without marketing copy.
- "Create new calculation" opens setup.
- Saved calculation selection opens saved result without recalculating.
- "Edit" opens the saved snapshot, not fresh CRM values.
- "Recalculate" creates a new version and makes it current after success.
- Link button is disabled for manual-only calculations with a clear tooltip.
- Publish button is disabled until a client link exists and interpretation is
  approved.
- Compatibility can link to one or two CRM clients depending on participant
  sources.

## Testing And Acceptance

Required before calling the feature production-ready:

- domain unit tests for every formula and validation branch;
- contract tests for numerology request/response schemas;
- DB adapter tests for record, participant, version, link, and visibility logic;
- API e2e tests for create, reopen, recalculate, link, publish, archive;
- frontend tests for setup modal, field validation, saved calculation opening,
  AI draft state, link/publish disabled states;
- browser E2E for individual creation, compatibility creation, manual-only,
  CRM-linked, edit/recalculate, and client-cabinet visibility;
- visual comparison against `ElevenHouseDesign` for the core screen layout.

## Open Decisions

1. Exact CRM client/birth-data module availability may affect whether the first
   UI can ship with CRM selector enabled immediately or behind the shared
   client data API.
2. PDF generation should integrate with the shared media/artifact contour. If
   that contour is not ready for generated PDFs, release can store approved
   interpretation first and add PDF artifact generation in the next slice.
3. Future method enablement should be admin/config driven only after method
   fixtures exist. Until then, hidden inactive profiles are acceptable; fake
   calculations are not.

## References

- NestJS modules: https://github.com/nestjs/docs.nestjs.com/blob/master/content/modules.md
- PostgreSQL JSON types: https://www.postgresql.org/docs/current/datatype-json.html
- OWASP Secure by Design: https://owasp.org/www-project-secure-by-design-framework/
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- World Numerology professional software: https://www.worldnumerology.com/numerology-software/online-numerology-software.html
- Astro-Seek calculator reference: https://numerology.astro-seek.com/name-numerology-online-calculator
