# Clients Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the astrologer `/clients` CRM section as a production, relationship-scoped workspace with list/search/filter, client detail, lifecycle/readiness, birth profiles, CRM activity and reference-parity desktop/mobile UI without embedded messaging; add cross-module summaries only after their source-owned readers exist.

**Architecture:** Evolve the existing `ClientsModule` and Clients domain into the server-owned CRM read/write boundary. `Clients` owns relationship-scoped CRM data, lifecycle display, birth-profile editing, private notes/tags and safe activity projection; adjacent modules provide summary/read ports and deep links while retaining their own state machines. React consumes shared contracts through app-owned page composition and TanStack Query; it never builds business projections from browser fanout or embeds Messaging content.

**Tech Stack:** TypeScript, NestJS, React, TanStack Query v5, Zod, Drizzle ORM 0.45, PostgreSQL 17, existing transactional outbox/lifecycle stores, Vitest/Testing Library, Browser/DevTools/Computer Use, GitNexus, ElevenHouseDesign reference CRM.

**Spec:** `docs/superpowers/specs/2026-08-20-clients-section-design.md` and `docs/superpowers/specs/2026-08-20-clients-section-designer-brief.md`

## Global Constraints

- Work in the existing shared `main` checkout. Do not create/switch branches or worktrees unless the user explicitly requests that Git operation.
- Preserve unrelated dirty work. Before every edit group, run `git status --short`, re-read target files and inspect `git diff -- <owned-path>`.
- Before modifying any existing function, class or method, run GitNexus upstream `impact` for that symbol and report direct callers, affected processes and risk. HIGH/CRITICAL requires warning before edit.
- The Clients section is relationship-scoped CRM only. No marketplace, platform-wide people search, discovery, recommendations or cross-promotion.
- Messaging remains owned by Inbox/Messaging. `/clients` may link to an existing thread but must not render message bodies, bubbles or a composer.
- Relationship access status and Clients lifecycle status are separate. Do not replace `active | archived | blocked` with lifecycle labels.
- Birth data writes require server validation, audit actor and CAS revision. Do not silently overwrite stale profile revisions.
- All writes require CSRF where applicable; create/override commands require idempotency; sensitive facts stay out of generic outbox/activity payloads.
- Frontend uses shared contracts only. Do not copy DTOs, calculate business readiness in React or fake missing backend state.
- UI must follow `ElevenHouseDesign` CRM visual language and the designer brief. Browser/component tests alone do not prove visual acceptance.
- Manual client creation is deferred from this implementation plan until identity/contact/non-enumeration rules are separately approved.
- First-run CRM contracts are read-only except existing birth-profile write
  routes already implemented in production. Do not add notes, tags or manual
  lifecycle override contracts until their write gate is approved.
- The first implementation must not show a working manual-add CTA unless the
  separate manual client creation decision is completed. Empty states may point
  to direct link, booking/order and lead-magnet paths only.

## Definition of Done

- Authenticated astrologer can open `/clients`, see only their active client relationships, search/filter stably and open a client detail view.
- Client detail shows relationship facts, lifecycle, server-provided birth profile readiness, related profiles and safe activity without embedded messaging.
- Birth data and related-profile edits use production APIs, CSRF, CAS and visible conflict handling.
- Cross-module summaries appear only after Task 8 source-owned readers and contracts are implemented; until then summary cards/sections are absent, not empty placeholders.
- Private notes/tags and lifecycle override are explicitly deferred to a later write gate; they are absent, not fake-disabled.
- API/DB tests prove relationship scope, archived/blocked denial, non-enumeration, redaction and stable pagination.
- Frontend tests prove list/detail/loading/empty/error/conflict/mobile states.
- Browser E2E and design-parity evidence cover desktop and mobile, console/network and computed style comparison.
- `detect_changes({scope: "compare", base_ref: "main"})`, `git diff --check` and affected verification gates are run before any commit authority is used.

---

## Current File Map

Existing contours to extend:

- `packages/contracts/src/clients.ts`: current list/detail/birth-profile contracts.
- `packages/domain/src/clients/**`: current relationship, birth data and lifecycle domain.
- `packages/db/src/schema/clients/**`: relationship, profile, birth data, related profiles and lifecycle schema.
- `packages/db/src/adapters/clients/**`: current relationship and lifecycle stores.
- `apps/astrologer-api/src/modules/clients/**`: current authenticated Clients controller/service/module.
- `apps/astrologer-web/src/features/clients/**`: current selector/API utilities used by calculations and booking.
- `apps/astrologer-web/src/router.contract.ts`, `router.tsx`, `common/i18n/astrologerCopy.ts`, `layouts/**`: route/nav shell.

New focused areas:

- `apps/astrologer-web/src/pages/clients/**`: app-owned Clients page composition.
- `apps/astrologer-web/src/features/clients/model/*Crm*`: query keys, presentation state, filters, conflict model.
- `apps/astrologer-web/src/features/clients/ui/**`: focused reusable Clients UI components.
- First-run CRM read adapter:
  `packages/db/src/adapters/clients/drizzle-client-crm-read-store.ts`.
- Later write-gate candidates, not first-run owned paths:
  `packages/db/src/schema/clients/client-crm-notes.schema.ts`,
  `packages/db/src/schema/clients/client-crm-tags.schema.ts`,
  `packages/db/src/adapters/clients/drizzle-client-crm-write-store.ts`.

## Task 1: Architecture and impact preflight

**Owned paths:** no production code edits; read-only GitNexus/docs evidence.

- [ ] Re-read `docs/superpowers/specs/2026-08-20-clients-section-design.md`, this plan, `docs/architecture/design-surfaces/astrologer.md`, `docs/decisions/0010-messaging-channel-architecture.md`, `docs/development/commands.md` and relevant runbooks.
- [ ] Run GitNexus queries/context for `ClientsController`, `ClientsService`, `ClientStore`, `listAstrologerClients`, `getAstrologerClient`, `writeClientBirthProfile`, `writeClientRelatedBirthProfile`, `AstrologerAppLayout`, `astrologerRouteContract` and `listAstrologerClients` frontend API usage.
- [ ] Before any symbol edit in later tasks, run upstream impact for the exact symbol and record direct callers, affected processes and risk in the task notes.
- [ ] Confirm shared checkout status and staged diff. If unrelated staged changes exist, do not commit combined work.
- [ ] Decide execution split: run backend/contracts tasks before UI tasks; run designer pass before final UI parity work.

## Task 2: Extend Clients contracts for read-only CRM list, detail and activity

**Owned paths:**
`packages/contracts/src/clients.ts`, new `packages/contracts/src/clients-crm.test.ts`, `packages/contracts/src/index.ts` only if exports require update.

**Interfaces produced:**

- `astrologerClientCrmListQuerySchema`
- `astrologerClientCrmListResponseSchema`
- `astrologerClientCrmDetailResponseSchema`
- `clientCrmActivityItemSchema`
- `clientCrmReadinessSchema`
- `clientCrmActivityPageResponseSchema`

- [ ] Write failing contract tests proving cursor query validation, activity redaction, lifecycle enum reuse, no message-body fields, relative-link validation, bounded collections and server-provided readiness.
- [ ] Define the CRM list cursor as an opaque server token over `lastLinkedAt`,
  relationship ID and normalized query/filter/sort identity. Do not expose
  offset as the new CRM contract and do not add a parallel `v1`/`v2` fallback.
- [ ] Define keyset order as `lastLinkedAt DESC, relationshipId DESC`, response
  shape as `{ items, nextCursor }`, maximum page size, malformed/tampered cursor
  errors, and filter/sort mismatch rejection. Start with one fixed sort unless
  a later product decision approves more.

```ts
import {
  astrologerClientCrmDetailResponseSchema,
  clientCrmActivityItemSchema
} from "./clients";

it("rejects embedded message bodies in Clients activity", () => {
  expect(() =>
    clientCrmActivityItemSchema.parse({
      id: "018f7f0a-6d77-7f72-9b63-7e24c9901111",
      occurredAt: "2026-08-20T10:00:00.000Z",
      kind: "messaging_thread_linked",
      metadata: {
        threadId: "018f7f0a-6d77-7f72-9b63-7e24c9902222",
        messageBody: "hello"
      }
    })
  ).toThrow();
});

it("parses a relationship-scoped CRM detail without correspondence", () => {
  expect(
    astrologerClientCrmDetailResponseSchema.parse({
      client: {
        clientUserId: "018f7f0a-6d77-7f72-9b63-7e24c9901111",
        displayName: "Client",
        relationship: {
          id: "018f7f0a-6d77-7f72-9b63-7e24c9902222",
          status: "active",
          source: "direct_link",
          firstLinkedAt: "2026-08-20T10:00:00.000Z",
          lastLinkedAt: "2026-08-20T10:00:00.000Z"
        },
        lifecycle: {
          status: "new",
          mode: "automatic",
          revision: 1,
          lastActivityAt: "2026-08-20T10:00:00.000Z"
        },
        birthData: null,
        relatedBirthProfiles: [],
        readiness: {
          birthData: "missing",
          relatedProfiles: "ready"
        },
        activity: {
          items: [],
          nextCursor: null
        }
      }
    })
  ).toBeTruthy();
});
```

- [ ] Run `pnpm test packages/contracts/src/clients-crm.test.ts`; expected RED because schemas do not exist.
- [ ] Implement schemas by extending existing fixed relationship, lifecycle and birth-profile enums; keep `.strict()` on every object.
- [ ] Keep current `astrologerClientListResponseSchema` available until all existing selectors are migrated or explicitly unchanged.
- [ ] Do not add note, tag, manual lifecycle override or manual client creation
  command schemas in this task.
- [ ] Do not include cross-module summaries in the first CRM detail contract.
  They are added by Task 8 after source-owned readers and authorization tests
  exist.
- [ ] Do not include calculation readiness, Messaging/InBox link summaries or
  other cross-module fields in the first CRM detail contract. Add each one only
  in Task 8 together with its source-owned reader, authorization tests and UI.
- [ ] Run `pnpm test packages/contracts/src/clients-crm.test.ts packages/contracts/src/messaging.test.ts`.

## Task 3: Add domain CRM read model and redacted activity policy

**Owned paths:**
`packages/domain/src/clients/client-crm.ts`, `packages/domain/src/clients/client-crm.test.ts`, `packages/domain/src/clients/client-store.ts`, `packages/domain/src/clients/index.ts`.

**Interfaces produced:**

- `ClientCrmReadStore`
- `ClientCrmDetail`
- `ClientCrmActivityItem`
- `listAstrologerClientCrmPage(input)`
- `getAstrologerClientCrmDetail(input)`
- `createClientCrmActivityItem(input)` from already-minimized source facts

- [ ] Write failing domain tests for relationship scope, blocked/archived denial, activity redaction, lifecycle reuse and stable activity ordering.
- [ ] Model Activity as a read projection assembled from owning source tables
  and redacted CRM-owned events. Do not introduce a generic free-form activity
  table that becomes a second owner of Orders, Bookings, Messaging,
  Calculations, AstroDiary or Flows state.
- [ ] Model activity items as strict `kind` plus typed safe metadata and optional
  relative `href`. Do not add a localized free-form `title` field to the domain
  contract.

```ts
import { createClientCrmActivityItem } from "./client-crm";

it("builds a safe Messaging-linked activity item without message content", () => {
  expect(
    createClientCrmActivityItem({
      id: "activity-1",
      kind: "messaging_thread_linked",
      occurredAt: "2026-08-20T10:00:00.000Z",
      source: { module: "messaging", threadId: "thread-1" }
    })
  ).toEqual({
    id: "activity-1",
    kind: "messaging_thread_linked",
    occurredAt: "2026-08-20T10:00:00.000Z",
    metadata: { threadId: "thread-1" },
    href: "/inbox?threadId=thread-1"
  });
});
```

- [ ] Run `pnpm test packages/domain/src/clients/client-crm.test.ts`; expected RED.
- [ ] Implement pure domain mappers and store port types. Do not import `packages/db`.
- [ ] Add typed failure results for `not_found`, `not_related`, `blocked_or_archived`, `conflict` and `invalid_command`.
- [ ] Add a cross-layer invariant test proving contract lifecycle values match
  current Clients domain lifecycle values and relationship status cannot accept
  lifecycle labels.
- [ ] Run `pnpm test packages/domain/src/clients/client-crm.test.ts packages/domain/src/clients/client-lifecycle.test.ts`.
- [ ] Run `pnpm --filter @elevenhouse/domain typecheck`.

## Task 4: Persist relationship-scoped CRM read model and indexes

**Owned paths:**
`packages/db/src/schema/clients/client-astrologer-relationships.schema.ts`, `packages/db/src/schema/clients/index.ts` only if export shape requires update, `packages/db/src/adapters/clients/drizzle-client-crm-read-store.ts`, `packages/db/src/adapters/clients/drizzle-client-crm-read-store.integration.ts`, generated migration under `packages/db/drizzle/`.

**Interfaces consumed:** `ClientCrmReadStore` from Task 3.

- [ ] Run GitNexus impact for `createDrizzleClientLifecycleStore`, `createDrizzleClientStore` and any adapter symbol selected for modification.
- [ ] Write failing integration tests proving:
  - active relationship can read CRM detail;
  - unrelated astrologer receives no detail;
  - archived/blocked relationship is not returned as active CRM detail;
  - CRM-owned lifecycle and birth-profile events can participate in activity ordering
    with `occurredAt desc, id desc`;
  - CRM list uses keyset order `lastLinkedAt DESC, relationshipId DESC` and fetches `limit + 1`.
- [ ] Add the focused relationship index needed for keyset CRM list reads:
  `(astrologer_user_id, status, last_linked_at, id)`.
- [ ] Implement `createDrizzleClientCrmReadStore(database, { cursorSecret })`
  with explicit active relationship checks, sealed cursor validation and no
  frontend-supplied ownership facts. Preserve existing `createDrizzleClientStore`
  signatures and offset behavior for selectors.
- [ ] Keep cross-module activity facts read-only. The Clients adapter may query
  source projections through explicit readers, but it must not duplicate
  external module state into a generic Clients event log.
- [ ] Run `pnpm db:generate` and inspect that only the next focused migration/meta artifacts were added.
- [ ] Run targeted integration tests with local DB:

```bash
set -a
source .env
set +a
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/clients/drizzle-client-crm-read-store.integration.ts
```

- [ ] Run `pnpm --filter @elevenhouse/db typecheck`.

## Task 5: Expose read-only CRM APIs in the existing Clients module

**Owned paths:**
`apps/astrologer-api/src/modules/clients/clients.controller.ts`, `clients.service.ts`, `clients.module.ts`, `clients.tokens.ts`, new/updated API tests under `apps/astrologer-api/src/modules/clients/**`.

**Routes produced:**

- `GET /clients/crm`
- `GET /clients/crm/:clientUserId`
- `GET /clients/crm/:clientUserId/activity`

- [ ] Run GitNexus impact for `ClientsController`, `ClientsService` and `ClientsModule`; report risk before editing.
- [ ] Write failing service/controller/API E2E tests for authentication, active relationship scope, non-enumerating 404 for unrelated/archived/blocked relationships, reserved route segments, malformed cursor errors and no Messaging body fields.
- [ ] The first-run activity route returns the authorized first activity page
  embedded in CRM detail. It must reject `cursor` and explicit `limit` until a
  dedicated activity-page reader exists; do not silently ignore pagination.
- [ ] Register literal routes such as `/clients/crm` and `/clients/birth-places`
  before parameter routes such as `/clients/:clientUserId` so Nest does not
  treat reserved path segments as client UUIDs.
- [ ] Implement service methods that parse shared contracts, derive `astrologerUserId` from session, map domain results to typed HTTP errors and never accept relationship ID from the browser.
- [ ] Keep existing `GET /clients`, `GET /clients/:clientUserId`, birth-place and birth-profile routes working for current consumers.
- [ ] Do not add note, tag, lifecycle override or manual creation write routes
  in this task.
- [ ] Regenerate route inventory:

```bash
node scripts/agent-docs/generate-route-inventory.mjs
```

- [ ] Run `pnpm test apps/astrologer-api/src/modules/clients/clients*.test.ts packages/contracts/src/clients-crm.test.ts`.
- [ ] Run `pnpm --filter @elevenhouse/astrologer-api typecheck`.

## Task 6: Add `/clients` route, query model and app-owned page

**Owned paths:**
`apps/astrologer-web/src/router.contract.ts`, `apps/astrologer-web/src/router.tsx`, `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`, `apps/astrologer-web/src/layouts/AstrologerMobileNavigation/AstrologerMobileNavigation.tsx`, `apps/astrologer-web/src/pages/clients/**`, `apps/astrologer-web/src/features/clients/api/clientsCrmApi.ts`, `apps/astrologer-web/src/features/clients/model/clientsCrmQueries.ts`, `apps/astrologer-web/src/features/clients/model/clientsCrmPresentation.ts`.

**Frontend interfaces produced:**

- `clientsCrmQueryKeys`
- `useClientsCrmListQuery`
- `useClientsCrmDetailQuery`
- `useClientsCrmActivityQuery` only if it reads the first activity page without
  cursor/limit. Do not implement infinite activity pagination until Task 8 adds
  a dedicated activity reader.
- `useUpdateClientBirthDataMutation`
- `useCreateClientRelatedBirthProfileMutation`
- `useUpdateClientRelatedBirthProfileMutation`
- `mapClientCrmReadinessToPresentation(readiness)`

- [ ] Run GitNexus impact for `astrologerRouteContract`, `astrologerRoutes`, `toNavigationDrawerItem` and `AstrologerMobileNavigation` before editing.
- [ ] Write failing tests for route presence, RU/EN nav item, query key stability, `keepPreviousData` list behavior and no `/clients` message-composer UI.
- [ ] Add both `/clients` and `/clients/:clientUserId` routes, or an equally
  explicit query-route contract, so desktop refresh restores selection and
  mobile Back can return to the list with query/filter context.
- [ ] Add `clients: "/clients"` to protected route contract and router.
- [ ] Add localized nav item `Клиенты` / `Clients`. Use the existing `clients` navigation id; if icon changes, use a real design-system icon rather than an ad hoc SVG.
- [ ] In the first implementation, do not render a manual-add button or modal.
  If the design reference has an add-client modal, keep that state in the
  designer handoff only until manual creation rules are approved.
- [ ] Implement API helpers using the new shared contracts and `application.http`.
- [ ] Implement TanStack Query hooks with query keys including search/filter/cursor and `placeholderData: keepPreviousData` for list pagination.
- [ ] Render readiness from the validated server field only. Frontend model code
  may map readiness values to labels/chips; it must not infer readiness from
  birth fields, orders or calculation data.
- [ ] Reuse existing production birth-data and related-profile API helpers for
  editors, including conflict states. Do not satisfy editor tests with local
  modal state.
- [ ] Run `pnpm test apps/astrologer-web/src/features/clients apps/astrologer-web/src/pages/clients`.

## Task 7: Build Clients desktop/mobile UI from the designer brief

**Owned paths:**
`apps/astrologer-web/src/pages/clients/ClientsPage.tsx`, `ClientsPageView.tsx`, `ClientsPage.module.css`, focused UI/model files under `apps/astrologer-web/src/features/clients/ui/**`, localized copy/tests.

- [ ] Complete the designer pass from `docs/superpowers/specs/2026-08-20-clients-section-designer-brief.md` before production UI edits. Capture reference desktop/mobile states outside the repository.
- [ ] Use Superdesign if the execution environment exposes it. If it is not
  available, record that blocker and continue only with the required
  `ElevenHouseDesign` reference capture/measurement workflow.
- [ ] Write failing component tests for list empty/loading/error/success, filtered empty, detail loading/success, Activity tab, no embedded chat, conflict state, mobile list-to-detail and focus restore after editor close.
- [ ] Implement page composition with one focused component per file:
  - `ClientsWorkspaceView`
  - `ClientsListPanel`
  - `ClientDetailPanel`
  - `ClientProfileHeader`
  - `ClientBirthDataSection`
  - `ClientRelatedProfilesSection`
  - `ClientActivityTimeline`
  - `ClientModuleSummaries` only after Task 8 summaries are complete.
- [ ] Use one chronological section: `Активность` / `Activity`. Do not ship a
  duplicate `История` timeline beside it.
- [ ] Preserve the reference CRM layout density and responsive behavior while replacing `Переписка` with `Активность`.
- [ ] Do not render "Open in Messages" in the first-run UI. Add it only in Task
  8 after the Messaging reader/contract provides an authorized relative Inbox
  href.
- [ ] Do not render manual add, notes/tags controls, manual lifecycle override
  controls or cross-module summary cards whose backing contracts are absent.
- [ ] Run:

```bash
pnpm test apps/astrologer-web/src/pages/clients apps/astrologer-web/src/features/clients
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

## Task 8: Cross-module summary ports and activity projection

**Owned paths:**
new/adjacent domain ports under `packages/domain/src/clients/client-crm.ts`, DB/API adapters under owning module boundaries, additive contract/API/frontend files from Tasks 2, 5 and 7, focused tests for Orders/Bookings/Calculations/AstroDiary/Flows summaries.

- [ ] For each summary, inspect owning module contracts and schema before writing code. Run GitNexus impact for every touched reader/adapter symbol.
- [ ] Implement read-only, relationship-authorized summary ports:
  - orders: recent orders and payment state;
  - bookings/sessions: upcoming and recent service work;
  - calculations: readiness and recent saved results;
  - AstroDiary: paid-period/journal relationship summary;
  - Flows: active enrollments and recent runs;
  - Messaging: linked-thread existence and Inbox href only.
- [ ] Add Messaging summary as `linkedThreadCount`, deterministic latest-thread
  identity and authorized relative Inbox href only. Do not add message bodies,
  previews, provider identifiers or fabricated linked-thread activity.
- [ ] Add calculation readiness only through the owning calculation/birth-data
  policies and server contract; React remains presentation-only.
- [ ] For each summary, define fixed maximum item counts, total/count semantics,
  safe state enums, relative deep-link shape, unavailable/error behavior and
  bounded sort order. A source failure must be observable; it must not become
  an empty successful summary.
- [ ] Extend the CRM detail contract, API response and UI only after the
  corresponding source reader and tests exist. Summary sections remain absent
  for any source not implemented in this task.
- [ ] Add tests proving summaries do not leak foreign client data and do not mutate owning module state.
- [ ] Add activity projection tests proving safe event categories and chronological ordering.
- [ ] Add browser/component tests for summary presence/absence, source error
  state and relative deep-link navigation.
- [ ] Run the affected module test set discovered during inspection, plus `pnpm --filter @elevenhouse/domain typecheck` and `pnpm --filter @elevenhouse/db typecheck`.

## Task 9: QA, reviewer gates and runtime/design acceptance

**Owned paths:** tests, generated docs, exact implementation paths only.

- [ ] Senior reviewer pass: inspect contracts/domain/API/DB/frontend diff for dependency direction, authorization, CSRF/idempotency/CAS, data redaction, missing states, fake fallbacks and unrelated churn.
- [ ] QA pass: run focused tests from Tasks 2-8, then broaden:

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm verify
```

- [ ] Start only required local services under existing local authority, confirm ports and DB target are local, then run authenticated browser E2E for `/clients` desktop and mobile.
- [ ] Verify loading, empty, success, filtered-empty, validation, conflict, error, disabled, retry, keyboard/focus and responsive states.
- [ ] Inspect Browser/DevTools console, network payloads and DOM/computed styles. Capture evidence outside the repository.
- [ ] Compare production UI against reference/designer measurements. Record any intentional deviations with product/accessibility rationale.
- [ ] Run GitNexus `detect_changes({scope: "compare", base_ref: "main"})`, `git diff --check`, `git status --short` and inspect staged paths.
- [ ] Commit only with explicit user authority and only exact owned paths. Do not include unrelated finance/config/doc changes already present in the shared checkout.

## Research

Question: what architecture should support a relationship-scoped CRM section that composes adjacent module facts without moving their state machines into React or Messaging?

Decision affected: API shape, pagination/cache behavior, module boundaries, transaction/audit rules and accessibility requirements.

Accessed: 2026-08-20.

### Sources

- TanStack Query paginated queries: https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries
- TanStack Query query keys and invalidation: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys and https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- NestJS modules/controllers/providers: https://docs.nestjs.com/modules, https://docs.nestjs.com/controllers, https://docs.nestjs.com/providers
- Drizzle transactions: https://orm.drizzle.team/docs/transactions
- OWASP Authorization, IDOR, CSRF and Logging: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html, https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- WAI APG tabs/dialog/table and WCAG 2.2: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/, https://www.w3.org/WAI/ARIA/apg/patterns/table/, https://www.w3.org/TR/WCAG22/

### Findings

- Repository evidence: `docs/architecture/design-surfaces/astrologer.md` maps `crm*.jsx` to future `/clients`; Clients owns CRM data while Messaging owns threads/messages.
- Repository evidence: existing Clients contracts/domain/API already cover active relationship-scoped list/detail, birth data, related profiles and lifecycle.
- Sourced fact: TanStack Query v5 supports using page/cursor identity in query keys and `placeholderData: keepPreviousData` to avoid success/pending flicker during pagination.
- Sourced fact: Nest feature modules group closely related controllers/providers and expose only their public providers through module imports/exports.
- Sourced fact: Drizzle supports transactional grouping, including nested savepoint behavior, so CRM writes that touch notes/tags/lifecycle can be persisted atomically.
- Sourced fact: OWASP recommends denying by default, validating permissions on every request and preventing IDOR by scoping object lookups to authorized ownership.
- Sourced fact: WAI APG defines keyboard/ARIA behavior for tabs and modal dialogs; static client lists should use native table/list semantics unless they are true interactive grids.

### Options

1. Extend existing `ClientsModule` and Clients domain with CRM read/write ports.
   Benefit: fits current ownership, relationship scope and Nest module boundary.
   Risk: detail projection can grow large; mitigate with focused ports and tests.
2. Build `/clients` as React fanout across Clients, Inbox, Orders, Bookings and
   Calculations. Benefit: faster first screen. Rejected because it moves
   authorization/composition into browser state and creates inconsistent
   loading/error behavior.
3. Create a separate CRM/search service now. Benefit: future scale isolation.
   Rejected as premature until actual search/read-model pressure is proven.

### Recommendation

Use Option 1. Evolve `ClientsModule` as the API boundary; keep domain ports in
`packages/domain/src/clients`, persistence in `packages/db`, and React as an
app-owned contract consumer. Add explicit cross-module read ports only where a
summary is approved, and keep Messaging as a link-only adjacent module.

### User decisions

- Confirm whether Tasks 4-5 notes/tags/manual lifecycle controls should ship in
  the first development run or be split after read-only Clients UI.
- Manual client creation remains outside this plan until identity/contact and
  duplicate/non-enumeration behavior are approved.
