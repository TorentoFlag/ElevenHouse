# AstroDiary Paid Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AstroDiary a real independent one-time paid product: a confirmed payment atomically creates and activates the relationship-bound journal for the configured paid period; client and astrologer can use the first paid reflection-cycle workflow through authenticated production APIs and web surfaces.

**Architecture:** Finance remains the only payment authority. The existing internal ClientSubscriptions source-event transaction remains the paid-period transition owner and is extended through a narrow, transaction-scoped AstroDiary activation collaborator. It writes the paid-period transition, entitlement, one journal for its `journalEpochId`, an immutable activation receipt/event, and IDs-only outbox work in one PostgreSQL transaction. AstroDiary command adapters persist the existing domain write-set under journal/relationship/paid-period locks; APIs only authenticate, validate contracts, derive the actor, and invoke those ports. React apps consume shared contracts. The first visible design is composed in Superdesign from the approved reference visual language, then implemented app-owned.

**Tech Stack:** TypeScript, NestJS, React, TanStack Query, Zod, Drizzle ORM, PostgreSQL 17, existing transactional outbox, Vitest/Testing Library, browser DevTools/Computer Use, Superdesign.

**Spec:** `docs/superpowers/specs/2026-08-18-astro-diary-design.md`

## Global Constraints

- AstroDiary is an independently configured one-time paid product with a configured paid access period. Do not add a platform `Pro`/capability gate or hard-code commercial plan names.
- A successful confirmed capture creates a usable journal in the same transaction. A worker is never the activation gate.
- AstroDiary has no automatic renewal or saved-card charge. A later explicit purchase after terminal end opens a new paid epoch and new journal. Historical journals are read-only, not silently reused.
- Existing finance, paid-period, product, media, and Diary DB invariants are authority. Preserve receipt replay, locks, CAS, IDs-only outbox payloads, private media rules, and forward-only migration policy.
- No browser-owned authorization, no mock data, no client-supplied timestamps/cursors/allowance facts/generated IDs, and no hidden fallback on integrity failures.
- This plan delivers the paid interaction core. AI generation, voice/transcription, exports, cascade deletion, reminders, and SSE delivery are separately deployable follow-up contours; their schemas may be preserved but they are not exposed as fake-complete UI.
- UI work must begin with the `elevenhouse-design-parity` workflow and Superdesign; design prototype data/state is visual evidence only.
- Work in shared `main`; re-read paths and diffs before edits. Stage/commit only exact owned paths and only with explicit user authority.

## Definition of Done

- A Diary payment capture transaction either atomically persists paid-period activation + entitlement + exactly one active journal, or persists neither; replay does not duplicate the journal.
- Relationship, participant, epoch, and entitlement checks deny foreign, expired, revoked, and historical writes without leaking other users' data.
- Client can open/publish one entry and astrologer can publish the corresponding reply through production APIs; ASTRO Diary allowance/SLA/cycle effects are persisted atomically with their receipts and timeline changes.
- Astrologer and client have authenticated list/detail/timeline screens with loading, empty, access-denied, stale/CAS, and success states. Their visual structure is measured against the approved reference through Superdesign and real-browser evidence.
- Focused domain/DB/API/web tests, real local PostgreSQL integration, API network E2E, and desktop/mobile browser checks are green. Any later-slice functionality is visibly unavailable with truthful copy, not enabled as a no-op.

---

## Task 1: Freeze the paid-core boundary and characterize the current activation gap

**Owned paths:**
`packages/domain/src/client-subscriptions/**`, `packages/domain/src/astro-diary/**`, `packages/db/src/adapters/client-subscriptions/**`, `packages/db/src/schema/astro-diary/**`, existing relevant focused tests.

- [ ] Re-read `docs/superpowers/specs/2026-08-18-astro-diary-design.md`, current capture dispatch/canonical source-event flow, `astroDiaryJournals`, command authority, and current list reader. Run GitNexus query/context/impact for every existing symbol selected for change; report any HIGH/CRITICAL result before modifying it.
- [ ] Add a failing domain/DB integration characterization: a first applied capture for an AstroDiary contract has an entitlement but no journal; repeat same source event must replay without creating more state.
- [ ] Define a narrow transaction-scoped activation port/input whose only authority is the already locked paid-period head, immutable contract, applied source-event receipt, and transaction clock. Its result must be deterministic journal identity/epoch, activation receipt identity, and IDs-only event data.
- [ ] Decide and encode exact state mapping: initial applied capture creates an active journal; `ended`/`revoked` mark access/read-only through authoritative paid-period state; a fresh explicit purchase after terminal end creates a new journal. Do not expose an automatic renewal path.
- [ ] Verify focused domain and integration tests cover applied, replay, contract mismatch, epoch mismatch, revoked/ended, and concurrent double-capture behavior.

## Task 2: Persist atomic capture-to-journal activation

**Owned paths:**
`packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-uow.ts`, new/adjacent `packages/db/src/adapters/astro-diary/*activation*`, `packages/db/src/schema/astro-diary/{core,commands,integrity}.ts`, adapter/integration tests, and a new focused forward migration only if source schema changes.

- [ ] Before changing the source-event UoW, use GitNexus impact. Preserve the public standalone UoW behavior; expose an in-transaction composition entry point rather than nesting transactions.
- [ ] Implement the activation collaborator inside the source-event transaction after the subscription transition/entitlement projection has been established and before the application receipt/outbox commit.
- [ ] Persist one journal keyed by `(relationshipId, journalEpochId)` with exact client/astrologer identities obtained from locked relationship authority. Insert immutable activation evidence tied to source-event/evidence/transition identifiers; protect it with uniqueness and deferred graph checks.
- [ ] Ensure journal creation emits only body-free, typed IDs/outcome facts. No external job can observe active paid access without a committed journal.
- [ ] If Drizzle metadata changes, generate the next actual forward migration from the current lineage, append only required source-owned integrity SQL, run local `db:reset`, then prove `db:generate` has no delta. Never rewrite prior migrations.
- [ ] Add real PostgreSQL tests for commit/rollback, replay, concurrent duplicate capture, paid-period/relationship/epoch mismatch, and replacement paid epoch. Assert both table state and receipt/outbox state.

## Task 3: Complete the atomic command persistence boundary for the core cycle

**Owned paths:**
`packages/domain/src/astro-diary/{astro-diary-commands,astro-diary-drafts,astro-diary-timeline}.ts`, `packages/domain/src/astro-diary/ports/astro-diary-command-unit-of-work.ts`, `packages/db/src/adapters/astro-diary/{drizzle-astro-diary-command-authority,drizzle-astro-diary-command-uow}.ts`, `packages/db/src/schema/astro-diary/write-set-persistence.ts`, focused tests.

- [ ] Characterize with RED tests the two paid-core commands: client draft/create-and-publish entry, and astrologer draft/create-and-publish closing reply. Include command replay, stale version, foreign actor, inactive entitlement, exhausted allowance, and deadline failure.
- [ ] Reconcile the static write-set persistence ledger with the concrete transaction writers: paid-period effects, allowance command receipt/effects/facts, media-authority transitions, timeline revisions, response obligations, domain events, and outbox deliveries must all be written inside the same transaction.
- [ ] Keep server allocation of draft/item/cycle/obligation identities; bind semantic request hash to client intent only, so a legitimate retry replays rather than conflicts due to regenerated server IDs.
- [ ] Lock and validate in global physical order: idempotency receipt advisory lock, journal, subscription/entitlement/period allowance, cycles, drafts, timeline heads, obligations, read cursors, media authorities. Fail closed on any ownership/epoch/pair mismatch.
- [ ] Add PostgreSQL integration tests proving all-or-nothing persistence of each command and no duplicate cycle/allowance use under same-key retry and concurrent attempts.

## Task 4: Expose narrowly authenticated public and astrologer APIs

**Owned paths:**
`apps/astrologer-api/src/modules/astro-diary/**`, new `apps/public-api/src/modules/astro-diary/**`, app module imports/tokens, relevant contracts/API tests.

- [ ] Run GitNexus impact for existing controller/service/module symbols before extension. Keep controllers thin and bind dependencies in feature modules.
- [ ] Add role-specific routes backed by shared Zod schemas: journal list/detail/timeline, create/update/publish client entry, create/update/publish astrologer reply, and truthful command result/replay responses. Derive actor, relationship, command time, and server IDs from the authenticated session/UoW, never from request DTOs.
- [ ] Reuse the current reader for list/timeline and add only necessary reader methods for a journal summary/detail. Return 404 for foreign journal identities after authorization-safe lookup.
- [ ] Map typed port outcomes to consistent HTTP errors: validation, not found, forbidden, stale/CAS, idempotency conflict, allowance exhausted, and access ended. Preserve idempotency headers and response correlation.
- [ ] Add controller/service/integration tests for both client and astrologer sessions, role crossover, archive/read-only access, and network-level replay behavior.

## Task 5: Design the visible paid-core flow in Superdesign

**Owned design artifacts:** Superdesign project/canvas and linked implementation notes; production code remains app-owned.

- [ ] Use `elevenhouse-design-parity`: locate the exact reference states in `ElevenHouseDesign/app/journal.jsx` and `journal-data.jsx`, open the production routes with authenticated client and astrologer sessions, and capture reference measurements at desktop and mobile widths.
- [ ] Initialize/resume the Superdesign project for AstroDiary. Create flows for: astrologer journal list + selected detail; client personal journal; client draft/edit/publish; astrologer reply/publish; loading; no paid access; no journals; archived read-only; stale conflict; allowance exhausted; mobile list-to-detail.
- [ ] Preserve reference visual language (navigation, density, typography, cards, timeline, chips, composer, status hierarchy) while replacing reference-only `Pro` language with product-neutral paid-access copy.
- [ ] Review Superdesign output against actual contracts and operation states. Treat it as implementation-ready only when every visible control has a real API/action or a truthful unavailable state.

## Task 6: Build the astrologer web paid-core surface

**Owned paths:**
`apps/astrologer-web/src/pages/astro-diary/**`, `apps/astrologer-web/src/features/astro-diary/**`, localized copy/tests; only stable primitives may move to `packages/design-system`.

- [ ] Add RED component/model tests for list selection, timeline paging, opening a reply draft, publication, typed server errors, idempotent retry, archived/read-only state, and loading/empty state.
- [ ] Implement API hooks from shared contracts; invalidate/read the exact journal/timeline keys after confirmed mutation. Do not optimistically invent server cursor, version, or allowance state.
- [ ] Implement the measured Superdesign layout and responsive master-detail behavior. Maintain keyboard/focus semantics, error announcements, touch targets, and Russian/English copy.
- [ ] Run targeted web tests/typecheck, then real authenticated browser tests at desktop and mobile breakpoints. Capture screenshots and computed style measurements for reference comparison.

## Task 7: Build the client web paid-core surface

**Owned paths:** new `apps/client-web/src/features/astro-diary/**`, new `apps/client-web/src/pages/astro-diary/**`, router/navigation/i18n changes and tests.

- [ ] Add client routes and navigation only for users with an existing relationship; no discovery/catalog or cross-astrologer browsing.
- [ ] Implement journal list/detail and client entry draft/publish using the public API contract. The selected relationship/journal comes from server reads, not URL-provided ownership assertions.
- [ ] Implement desktop and mobile layout from the approved Superdesign client state, including disabled/read-only historical journal and truthful no-paid-access empty state.
- [ ] Add component tests plus authenticated browser E2E for creation/publish/replay/error and mobile list-to-detail.

## Task 8: Integration, security, visual acceptance, and scoped delivery

**Owned paths:** focused integration/E2E tests, docs evidence update, exact scoped commit paths.

- [ ] Run the affected dependency gates in order: contracts/domain/DB typechecks and builds; local PostgreSQL migration/reset; client-subscription + AstroDiary real-PG suites; public/astrologer API tests; client/astrologer web tests/typechecks.
- [ ] Perform a real browser network-backed journey: configure a Diary one-time paid product, purchase/capture locally, observe immediate journal creation, publish client entry, publish astrologer reply, confirm timeline/access/allowance state for both sessions, then verify read-only behavior after terminal state.
- [ ] Use DevTools to inspect console/network, response schemas, request idempotency, and non-leakage on a foreign journal. Run keyboard/focus and responsive checks at exact reference viewports.
- [ ] Compare production screenshots/computed measurements against Superdesign/reference. Record intentional deviations only when tied to an approved business/accessibility constraint.
- [ ] Run GitNexus `detect_changes(scope=compare, base_ref="main")`, `git diff --check`, and inspect staged paths. With explicit user authorization, create one or more exact scoped commits separating: (a) backend/persistence/API, (b) client/astrologer web plus design evidence. Never sweep unrelated shared work.

## Deferred Follow-up Plans

- **Engagement and delivery:** prompt accept/decline/expiry, scheduled reminders, SSE reconnect/outbox consumer and notification delivery.
- **Private media and content processing:** upload composition, voice/transcription, derivatives/extraction/retrieval and media E2E.
- **Assistive intelligence:** context worker, isolated GPT-5.5 draft/review persistence, provenance/audit, no auto-send.
- **Exports and erasure:** private PDF, exact cascade worker receipts, staged deletion and retention operations.
