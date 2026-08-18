# AstroDiary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `elevenhouse-feature-delivery`,
> `elevenhouse-research` for every new technical boundary, `elevenhouse-design-parity`
> for visible work, and behavioral TDD for every production change. Work in the shared
> `main` checkout. Do not create a branch/worktree, stage, commit, push, or mutate remote
> state. Before changing an existing symbol, run GitNexus query/context/impact and report
> direct callers and risk. Before changing an API handler, run `api_impact`.

**Goal:** Deliver the complete production AstroDiary subscription contour approved in
`docs/superpowers/specs/2026-08-11-astro-diary-design.md`: recurring client subscription,
provider-neutral entitlement, bounded reflection cycles, attachments/voice, mood,
astrology context, editable GPT-5.5 drafts, PDF export, deletion, realtime,
notifications, and exact reference-parity web surfaces.

**Architecture:** Add four explicit bounded contexts: `ClientSubscriptions` owns the
immutable paid contract and lifecycle; `ClientEntitlements` projects provider-neutral
access; `AstroDiary` owns journals/cycles/timeline/obligations; and
`AstroDiaryContentDerivatives` owns transcription/extraction/retrieval. Finance remains
the only payment/provider authority, Media remains the object authority, and Charts/
BirthData remain the astrology authority. Apps compose domain ports with DB adapters.
Every async mutation is state plus IDs-only outbox in one transaction and every
consumer applies events idempotently.

**Tech Stack:** TypeScript, NestJS, React, TanStack Query, Zod, Drizzle ORM,
PostgreSQL 17 plus pgvector, Redis-backed workers, S3-compatible private storage,
OpenAI Responses API (`gpt-5.5`), transcription (`gpt-4o-transcribe`), embeddings
(`text-embedding-3-large`), Vitest, Testing Library, Playwright/browser/CDP evidence.

---

## Global Constraints

- Product truth is the approved design spec and latest user instructions.
- No migration/backfill/dual-read/backward-compatibility path: production data is empty.
  Existing committed migration lineage remains immutable; add forward migrations only.
- No JSON export, pause, streak, group/team/assistant journals, public links, Inbox
  fallback, crisis scanning, E2EE, or legal/permission/consent product flows.
- AI is available to the astrologer by default, never auto-publishes, never falls back
  to another model, and must not alter current AI prompts, profiles, defaults, routes,
  or request behavior.
- Do not reuse Messaging tables for Diary. Reuse only generic media, SSE, storage, and
  worker patterns where their ownership contracts fit.
- User-visible errors are typed and observable. No fake success, guessed shape,
  browser-only state, silent simplification, or hidden disabled behavior.
- Work sequentially across implementation tasks because the checkout is shared.
  Read-only research/review may run in parallel. Re-read target files and target diffs
  immediately before each patch.
- No commit authority was granted. All work remains unstaged and uncommitted.

## Purpose and Big Picture

After completion, an astrologer activates the fixed AstroDiary product template with a
price, billing cadence, cycles per paid period, response SLA, working schedule, and
timezone. A related client buys it through real checkout. Verified settlement creates
one paid period and its allowance exactly once. The client and astrologer then work in
one relationship-bound journal. Either side can open the approved cycle form, media and
voice are private and authorized through Diary bindings, astrology context is captured
as immutable source references, AI returns an editable astrologer-only draft, and only
an explicit publish creates client-visible content. Cancellation ends renewal without
pause; failed renewal, finance revocation, export, deletion, and open response
obligations have deterministic server-owned behavior.

## Progress

- [x] Product/reference/repository/web research completed and written design approved.
- [x] Current gaps established: subscription fulfillment unsupported, no client
      subscription/entitlement authority, no Diary route/domain/schema.
- [x] Task 1: freeze baseline behavior and add AstroDiary product configuration at the
      contracts/domain/API/frontend source level; browser computed-style acceptance is
      still part of Task 13.
- [x] Task 2: implement ClientSubscriptions and ClientEntitlements domain contracts.
- [x] Task 3: implement subscription/entitlement persistence and migration. Purchase-authority
      revision binding, exact creation replay, the intentional 0038/0039 split, full local reset,
      and ClientSubscription/Product/Mobile real-PostgreSQL gates are green.
- [ ] Task 4: implement purpose-bound finance activation and recurring billing.
- [ ] Task 5: expose subscription APIs and unlock AstroDiary orderability.
- [x] Task 6: implement AstroDiary contracts and domain rules, including complete atomic
      command write-sets and staged erasure decisions.
- [ ] Task 7: implement AstroDiary persistence, workers, and realtime. Source schema is
      in progress and intentionally not exported or migrated until 0039 is frozen.
- [ ] Task 8: integrate private media, voice, derivatives, and pgvector retrieval. Diary
      upload/read policy and media purposes exist; API/storage/derivative runtime remains.
- [ ] Task 9: implement astrology context and isolated AstroDiary AI. Prompt/generation
      contracts and GPT-5.5 provider enforcement exist; worker/persistence/API runtime remains.
- [ ] Task 10: implement notifications, PDF export, and cascade erasure.
- [ ] Task 11: implement astrologer web surface.
- [ ] Task 12: implement client web surface.
- [ ] Task 13: integration, security, runtime E2E, and measured visual parity.
- [ ] Task 14: update canonical docs, remove executed task artifacts, final verification.

## Surprises and Discoveries

- The existing `sub`/`subscriptionPeriod`/`journal` values are taxonomy only; client
  commerce filters subscriptions and fulfillment returns
  `client_subscription_fulfillment_unsupported`.
- `finance.economic_payment.capture_applied` exists but has no purpose-specific client
  subscription dispatcher. Generic capture must not directly activate a subscription.
- Existing saved-card and recurring tables are platform-tariff-specific. Their patterns
  are reusable, but their domain records cannot be reused for client subscriptions.
- Current local and production PostgreSQL images are plain `postgres:17`; pgvector is
  not available until the image/runtime lineage is deliberately changed and verified.
- Existing private messaging voice ingestion proves storage/playback patterns but not
  browser uploads or Diary authorization.
- GitNexus index is four commits behind current `main`; its call graph is advisory and
  every result must be confirmed against current source.
- Migration `0038_mobile_device_sessions` is intentionally isolated so mobile auth can be
  deployed independently. `0039_astro_diary` intentionally contains only Product,
  ClientSubscriptions and Media prerequisites; AstroDiary tables must use the next forward
  migration. The split is product/deployment authority from 2026-08-12, not a filename cue.
- The first split audit found snapshot drift: the 0038 snapshot already claimed Diary media
  purposes that only 0039 SQL installs. A disposable two-stage Drizzle generation proved the
  exact correction and the split migration characterization now enforces both boundaries.
- Subscription source requires an immutable creation `result_snapshot`; the regenerated 0039
  now contains the column and strict check. Fresh no-delta generation, full local reset and the
  complete no-bypass Product/ClientSubscription/Mobile PostgreSQL gates passed.
- Purchase/replay source subsequently froze and the existing `0039` was regenerated without
  changing the isolated `0038` boundary. Reset/migrate/seed and Product/Mobile gates passed.
  The full ClientSubscription PostgreSQL suite then exposed three source-level invariant defects:
  terminal heads retained paid-period pointers; slot release mixed business-event time with DB
  projection time; and historical period effects were revalidated through the current mutable
  grant. The fixes preserve immutable period/event history, use DB time only for slot projection
  metadata, and validate historical entitlement transitions from immutable effects. The final
  `0039` regeneration, reset and no-delta proof are complete; later work must not reopen 0039.

## Decision Log

- One current journal per client/astrologer relationship; a new epoch is possible only
  after the preceding subscription ended and prior journal lifecycle is terminal.
- Astrologer opening prompts reserve allowance; client response consumes it; decline,
  withdrawal, or expiry releases it. Client-opened cycles consume atomically on publish.
- Entitlement grants only `start_cycle`; operation-specific access policy permits an
  existing response obligation to survive paid-period end.
- Subscription configuration is copied into an immutable contract before payment.
  Renewal never reads mutable product configuration.
- Cancellation is scheduled period end plus revoke-before-end. Pause is absent.
- Mood is emoji-first in UI and stored as a typed numeric ordinal for trends.
- AI uses two source-bound attempts (draft then review/refine), literal `gpt-5.5`,
  allowlisted context, no auto-send, and no alternate-model fallback.
- Diary bodies and sensitive derived content never enter logs or outbox payloads.
- Whole-journal deletion is cascade erasure of bodies/media/derivatives/AI/export;
  author hide is a timeline tombstone and preserves dependent response structure.
- `0038_mobile_device_sessions` remains mobile/auth-only and `0039_astro_diary` remains the
  Product/ClientSubscriptions/Media prerequisite migration. They are never recombined;
  AstroDiary persistence is appended after them.
- Async `*_requested` events are delivered only to their owning worker. Realtime/SSE events
  are emitted from actual state-change projections with the required projection identity;
  a request event is never relabeled as a successful browser update.
- Purpose-bound capture dispatch is frozen and independently reviewed PASS at the domain
  boundary: `finance.client_order.capture_applied.v1` is IDs-only, rehydrates immutable
  initial/renewal authority, stores downstream IDs once, and applies through the subscription
  source-event UOW without re-emitting the capture input. DB persistence and worker composition
  remain mandatory Task 4 runtime work; callers cannot supply a trusted receipt.
- A terminal subscription does not silently attach a replacement purchase to its read-only
  journal. Renewal of the same subscription preserves its journal epoch; a later explicit new
  purchase for the same relationship is eligible only after the prior subscription ended and
  whole-journal erasure reached `erased`, then it creates a new journal ID and epoch. Checkout
  and activation must reject the replacement while a non-erased journal remains current.
- Canonical `*_requested` events are worker commands only. Browser/SSE projections for item
  edits/hides/erasure, context completion/failure, export terminal states, erasure completion and
  journal activation require separate IDs-only state-change events emitted atomically with the
  actual persisted state. AI likewise emits a body-free `ai_updated` fact only after the durable
  command reaches its authoritative current state; `ai_generation_requested` remains worker-only.
  A request event is never projected or notified as successful work.
- Generic `media_assets` does not own a Diary journal. The first AstroDiary migration therefore
  owns a pending/private media authority binding `mediaId` to exact journal and owner before any
  draft or published item exists. Upload intent creates the media row and binding atomically;
  completion, draft/item attachment and signed read rehydrate that same binding. Public API and
  astrologer API must share one storage adapter implementation rather than proxying between apps
  or duplicating S3 behavior.
- The S3 implementation is extracted into a leaf `packages/media-infrastructure` adapter while
  preserving the existing generic public-upload methods. AstroDiary uses a separate private PUT
  port, returns no public asset URL on completion, and issues a short-lived signed GET only after
  re-authorizing the current pair, item visibility and revocation state. The generic astrologer
  `MediaService` and its routes remain unchanged.
- The immutable verified capture receipt currently emits one unconsumed
  `finance.economic_payment.capture_applied` outbox row. The next forward finance change replaces
  that trigger output with the single IDs-only `finance.client_order.capture_applied.v1` event;
  it does not dual-emit. A finance-owned dispatch receipt and one transaction compose exact
  capture authority with the existing subscription source-event UOW. Booking/one-off orders are
  published as `not_client_subscription`; invalid evidence is quarantined, never activated.

## Context and Orientation

Primary current files and patterns:

- Product validation/contracts/domain: `packages/validation/src/products/index.ts`,
  `packages/contracts/src/products.ts`, `packages/domain/src/products/*`.
- System templates: `packages/db/scripts/product-template-seed-data/index.ts`.
- Client commerce: `packages/contracts/src/client-commerce.ts`,
  `apps/public-api/src/modules/client-commerce/*`.
- Fulfillment: `packages/domain/src/products/paid-product-fulfillment-registry.ts`.
- Finance canonical capture/outbox: `packages/domain/src/finance-core/*`,
  `packages/db/src/schema/finance/*`, `packages/db/src/adapters/finance/*`,
  `apps/payment-worker/src/webhooks/*`, `apps/payment-worker/src/provider-operations/*`.
- Platform recurring reference pattern: `packages/domain/src/platform-billing/*`,
  `packages/db/src/schema/platform-billing/tariff-authority.schema.ts`,
  `packages/db/src/adapters/platform-billing/*`.
- Media: `packages/validation/src/media/index.ts`, `packages/contracts/src/media.ts`,
  `packages/domain/src/media/*`, `packages/db/src/schema/media/*`, API media modules.
- AI: `packages/ai/src/generation/*`, `packages/ai/src/prompts/*`,
  `apps/workers/src/runtime-config.ts`, existing feature-specific AI composers.
- Realtime reference: `packages/db/src/schema/messaging/*realtime*`,
  `apps/astrologer-api/src/modules/messaging/*events*` and corresponding client model.
- Reference UI: `ElevenHouseDesign/app/journal.jsx` and `journal-data.jsx`.

## Target Interfaces

The implementation introduces these stable interfaces before adapters:

```ts
type AstroDiaryProductConfig = Readonly<{
  reflectionCyclesPerPeriod: number;
  responseSlaWorkingDays: number;
  clientResponseWindowCalendarDays: number;
  workingWeekdays: readonly (1 | 2 | 3 | 4 | 5 | 6 | 7)[];
  serviceTimezone: string;
}>;

type ClientSubscriptionContract = Readonly<{
  contractId: string;
  orderId: string;
  productId: string;
  astrologerUserId: string;
  clientUserId: string;
  relationshipId: string;
  priceMinor: bigint;
  currency: "RUB";
  cadence: "week" | "month" | "year";
  astroDiary: AstroDiaryProductConfig;
  canonicalDigest: `sha256:${string}`;
}>;

type AstroDiaryAccessOperation =
  | "read"
  | "start_cycle"
  | "continue_open_cycle"
  | "respond"
  | "close"
  | "edit"
  | "erase";
```

All public request/response types live in `packages/contracts`; lifecycle types and ports
live in `packages/domain`; persistence-only rows live in `packages/db`. API controllers
must accept no authoritative client, astrologer, allowance, due date, entitlement, or
astrology fact from the browser.

## Plan of Work

### Task 1: Baseline Characterization and Fixed Product Configuration

**Owned files:**

- Modify `packages/validation/src/products/index.ts` and its test.
- Modify `packages/contracts/src/products.ts` and its test.
- Modify `packages/domain/src/products/product-types.ts`, template types/use cases, and
  product use-case tests.
- Modify `packages/db/src/schema/products/products.schema.ts`,
  `packages/db/src/adapters/products/drizzle-products-store.ts`, and focused tests.
- Modify `packages/db/scripts/product-template-seed-data/index.ts` and seed tests.
- Modify product constructor feature model/components only after backend tests pass.
- Add baseline AI behavior characterization under existing prompt/runtime tests without
  changing production behavior.

**Behavioral steps:**

1. Add failing contract/domain tests for an AstroDiary-only configuration object with
   reflection cycles `1..366`, SLA working days `1..30`, client response window `1..90`
   calendar days, non-empty unique ISO weekdays, and required IANA timezone. Export the
   bounds as shared named constants so UI and DB tests do not duplicate literals.
2. Add failing product invariant tests: `journal` grant requires type/payment/execution/
   participant shape `async/once/async/solo`, exact `chat/audio/file` delivery formats,
   a configured paid access period, and empty client-data/method/modifier arrays; that
   shape requires complete AstroDiary config; non-Diary products reject AstroDiary config.
3. Add `astro_diary_paid_period` RU/EN system template and prove exact configurable
   defaults; do not overload `expert_subscription`.
4. Persist config as typed columns/JSON only where it remains queryable and constraint-
   enforced. Use server validation and DB checks; no display-string SLA authority.
5. Add a monotonic Product `revision`, expose it in responses, require
   `expectedRevision` for update/status mutations, enforce CAS in the store, and prove
   stale updates fail explicitly. AstroDiary checkout will bind this exact revision.
6. Add product editor fields and state tests; activation remains rejected until Task 5
   registers proven fulfillment readiness.
7. Freeze current AI runtime/model/prompt request snapshots and run them unchanged.

**Red/green commands:**

```bash
pnpm test packages/validation/src/products/index.test.ts packages/contracts/src/products.test.ts
pnpm test packages/domain/src/products
pnpm exec vitest run apps/astrologer-web/src/features/products --config vitest.config.ts
```

### Task 2: ClientSubscriptions and ClientEntitlements Domain

**Create:**

- `packages/contracts/src/client-subscriptions.ts` plus tests and barrel export.
- `packages/domain/src/client-subscriptions/client-subscription-types.ts`.
- `packages/domain/src/client-subscriptions/client-subscription-contract.ts`.
- `packages/domain/src/client-subscriptions/client-subscription-lifecycle.ts`.
- `packages/domain/src/client-subscriptions/client-subscription-allowance.ts`.
- `packages/domain/src/client-subscriptions/client-subscription-events.ts`.
- `packages/domain/src/client-subscriptions/ports/*.ts`, tests, and `index.ts`.
- `packages/domain/src/client-entitlements/client-entitlement-policy.ts`, ports, tests,
  and `index.ts`.

**Behavioral steps:**

1. Seal a canonical contract from order/product/relationship snapshots and the immutable
   initial `OrderEconomicsSnapshot`; reject any mismatch in actors, cadence, amount,
   currency, plan/version, commission/allocation, grants, or config. Renewal invoices copy
   these sealed economics and never recalculate them from a mutable tariff.
2. Model states `pending_initial_payment`, `active`, `cancel_at_period_end`, `ended`,
   `revoked`; no pause or `past_due` subscription state. Renewal attempt status is a
   separate finance projection and does not shorten a captured current period.
3. Implement idempotent initial capture, renewal capture, cancellation scheduling/revoke,
   retry exhaustion, period end, succeeded full-refund, and observed-chargeback
   transitions.
   Persist one immutable body-free renewal charge request on the subscription head so
   request versus cancellation is serialized through the same revision CAS. Renewal
   capture and failure evidence must bind that request and its intended period; finance
   remains the sole owner of payment-attempt state.
4. Implement calendar billing boundaries with `@js-temporal/polyfill`: original-anchor
   week/month/year arithmetic in the contract service timezone, end-of-month/leap-day
   constraint, later DST disambiguation, half-open UTC ranges, one contiguous future
   period, and re-anchoring only after a lapsed chain. Prove Jan-31, Feb-29, DST gap/fold,
   early renewal, duplicate renewal, and post-lapse retry cases.
5. Model period allowance as
   `available + reserved + consumed + released = total`, all nonnegative, with atomic
   reserve/consume/release commands. Period end moves only unreserved availability to
   `released`; an already-open cycle keeps its reservation and may consume it afterward.
6. Make entitlements read-only projections written only by subscription transition
   receipts. Include `astro_diary` capability, period bounds, source contract, and epoch.
7. Prove concurrent/duplicate command semantics at the domain-port boundary. Bind every
   command/creation/allowance idempotency hash and receipt to its expected aggregate or
   natural-slot CAS version; keep canonical source-event replay independent of local CAS.

**Red/green commands:**

```bash
pnpm test packages/contracts/src/client-subscriptions.test.ts
pnpm test packages/domain/src/client-subscriptions packages/domain/src/client-entitlements
pnpm --filter @elevenhouse/domain typecheck
```

### Task 3: Product, Subscription and Entitlement Persistence

**Create:**

- `packages/db/src/schema/client-subscriptions/client-subscriptions.schema.ts`.
- `packages/db/src/schema/client-subscriptions/client-entitlements.schema.ts`.
- `packages/db/src/schema/client-subscriptions/client-subscription-events.schema.ts`.
- `packages/db/src/schema/client-subscriptions/index.ts` and root export.
- `packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-uow.ts`.
- `packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-reader.ts`.
- `packages/db/src/adapters/client-subscriptions/drizzle-client-entitlement-reader.ts`.
- Focused schema/unit/integration tests.
- The next focused Drizzle migration and generated snapshot/journal entries.

**Modify first:**

- Generate the already-modeled Product `revision` and AstroDiary config columns/checks
  into this same next focused forward migration before adding subscription tables. The
  API must not query new Drizzle columns against lineage `0037` without SQL evidence.

**Behavioral steps:**

1. Add immutable contract, subscription head, periods, lifecycle events, allowance,
   entitlement grants, and event-application receipts.
2. Enforce one current subscription/journal epoch per relationship/product, immutable
   digest/snapshot, monotonic versions, non-overlapping period ranges with at most one
   contiguous future period, exact allowance arithmetic, and head/event consistency in
   PostgreSQL.
   The same migration must add a deferred cross-table constraint trigger proving
   `config present <=> journal is the sole access grant`, plus raw-SQL rejection tests;
   parent-column checks alone are insufficient because grants live in a child table.
3. Commit subscription state, entitlement projection, IDs-only outbox, and application
   receipt in one transaction with advisory/row locks and CAS.
4. Test duplicate capture, concurrent reserve, renewal/cancel race, finance-revocation/period-end
   race, and cross-owner foreign-key attempts against local PostgreSQL.
5. Generate the next migration; never edit older SQL or snapshots.

**Red/green commands:**

```bash
pnpm test packages/db/src/schema/client-subscriptions
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/client-subscriptions
pnpm db:generate
```

### Task 4: Purpose-Bound Finance and Recurring Billing

**Create/modify:**

- Add client-subscription purpose types/ports under `packages/domain/src/finance-core`.
- Add `packages/db/src/schema/finance/client-subscription-billing.schema.ts`.
- Add finance adapters for immutable contract binding, invoice/charge preparation,
  client-order capture dispatch, renewal terminal reconciliation, succeeded full-refund,
  and observed-chargeback revocation.
- Add `apps/payment-worker/src/client-subscriptions/*` processors/relays/composition.
- Extend existing provider dispatch only through its provider-neutral operation envelope.
- Add purpose-specific outbox schemas and deterministic relay routing.

**Behavioral steps:**

1. Bind checkout/order/economic payment intent to one immutable client-subscription
   contract before provider I/O.
2. Replace the booking-only coupling in paid-product fulfillment and risk hold release
   with discriminated fulfillment evidence. Preserve the existing booking branch;
   introduce subscription service-obligation terminal evidence and a
   `ClientSubscriptionRefundDecisionPort` rather than faking `booking_completed`.
3. Add provider credential purpose `client_subscription` without reusing tariff-specific
   consent/domain rows. Raw credential stays in the restricted vault.
4. Extend canonical online-sale capture to atomically emit exactly one
   `finance.client_order.capture_applied.v1`. Its only finance dispatcher rehydrates the
   order and immutable contract, then emits exactly one
   `client_subscription.capture_applied.v1`; never activate from the existing generic
   economic-payment event.
5. Implement invoice and charge commands with semantic idempotency per subscription/
   period/attempt. Ambiguous provider outcome enters `outcome_unknown` and reconciliation,
   never blind redispatch.
6. Implement renewal scheduler, terminal retry policy, customer-action state, capture,
   failure, succeeded cumulative full-refund, and ArcPay `payment.chargeback` evidence.
   Chargeback observation permanently revokes service writes; do not invent a won/lost
   or separate provider reversal state absent from the current provider contract.
7. Add a finance-owned deny-only read authority for canonical full-refund/chargeback
   observations. AstroDiary writes consult it synchronously so async entitlement
   projection lag cannot temporarily preserve writes after revocation.
8. Pin the reviewed ArcPay OpenAPI fixture/hash and regression-test saved-card recurring
   request fields, 72-hour idempotency semantics, timeout/outcome-unknown mapping,
   webhook deduplication, full-refund totals, and chargeback event shape.
9. Prove that mutable product edits cannot alter an existing invoice/renewal and that
   duplicate webhook/reconciliation cannot duplicate money or entitlement.

**Red/green commands:**

```bash
pnpm test packages/domain/src/finance-core
pnpm test apps/payment-worker/src/client-subscriptions apps/payment-worker/src/provider-operations
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/finance
pnpm --filter @elevenhouse/payment-worker typecheck
```

### Task 5: Paid-Period APIs and Orderability Gate

**Create/modify:**

- `apps/public-api/src/modules/client-subscriptions/*`.
- `apps/astrologer-api/src/modules/client-subscriptions/*`.
- Composition in each feature module/root module.
- Extend `packages/contracts/src/client-commerce.ts` and client-commerce service tests.
- Modify `packages/domain/src/products/paid-product-fulfillment-registry.ts` and tests.
- Extend client checkout/order contract binding and activation-readiness adapters.

**Behavioral steps:**

1. Add relationship-scoped offer/current subscription/period/allowance reads and
   checkout and paid-period reads with strict contracts, auth, CSRF, idempotency, and CAS.
2. Add astrologer owner read projection for configured products and subscriber status.
3. Register only `async.once.async.solo` with `journal`, a configured paid access period,
   and a complete AstroDiary config; dependency reader must prove finance capture, finance
   revocation, and entitlement authorities registered. It must also reject zero price and any
   non-canonical Diary delivery/client-data/method/modifier shape. Automatic renewal and
   generic recurring subscriptions remain unsupported.
4. Remove the client-commerce subscription filter only for the proven AstroDiary paid-period
   shape.
5. Add API e2e tests for related/unrelated/blocked pair, active/draft product,
   pending/failed/unknown payment, duplicate commands, and no cross-owner leakage.

**Red/green commands:**

```bash
pnpm test packages/domain/src/products/paid-product-fulfillment-registry.test.ts
pnpm test apps/public-api/src/modules/client-commerce apps/public-api/src/modules/client-subscriptions
pnpm test apps/astrologer-api/src/modules/client-subscriptions
pnpm --filter @elevenhouse/public-api typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
```

### Task 6: AstroDiary Contracts and Domain Rules

**Create:**

- `packages/contracts/src/astro-diary.ts` plus strict RU/EN-neutral schema tests.
- `packages/domain/src/astro-diary/astro-diary-types.ts`.
- `astro-diary-access-policy.ts`, `astro-diary-cycles.ts`,
  `astro-diary-timeline.ts`, `astro-diary-drafts.ts`, `astro-diary-sla.ts`,
  `astro-diary-mood.ts`, `astro-diary-erasure.ts`, ports, events, tests, and index.

**Behavioral steps:**

1. Model journals bound to relationship/epoch, cycle states, timeline item kinds,
   immutable revisions, author drafts with CAS, read cursors, and response obligations.
2. Implement client-opened atomic publish/consume and astrologer prompt reserve/
   accept/decline/withdraw/expire/consume paths; only one open cycle per journal.
3. Implement atomic close and reply-with-follow-up commands so partial visible states
   cannot be persisted.
4. Implement operation-specific access after period end: no new cycles, but bounded
   continuation for existing obligations; blocked/revoked relationship always fails.
5. Implement deterministic working-day SLA in service timezone using the published
   entry's local wall-clock time, including weekend and DST gap/fold golden cases;
   store UTC due instant plus timezone evidence.
6. Implement emoji mood values backed by typed ordinal and server-owned trend projection.
7. Implement author edit/hide/dependent-response matrix, correction revisions, explicit
   tombstones, and whole-journal erasure command semantics.

**Red/green commands:**

```bash
pnpm test packages/contracts/src/astro-diary.test.ts
pnpm test packages/domain/src/astro-diary
pnpm --filter @elevenhouse/domain typecheck
```

### Task 7: AstroDiary Persistence, APIs, Workers, and Realtime

**Create:**

- Schema files under `packages/db/src/schema/astro-diary/*` for journals, cycles,
  obligations, timeline/revisions, drafts, attachments, context snapshots, read cursors,
  realtime events, AI/export/erasure commands, and application receipts.
- Adapters under `packages/db/src/adapters/astro-diary/*`.
- `apps/public-api/src/modules/astro-diary/*`.
- `apps/astrologer-api/src/modules/astro-diary/*`.
- `apps/workers/src/astro-diary/*` for timers and canonical event applications.
- Focused migration additions, tests, runtime config, readiness, and shutdown wiring.

**Behavioral steps:**

1. Enforce one current non-erased journal per relationship, one open cycle, same-journal
   parent/attachment/context refs, author-role consistency, monotonic versions, and
   immutable published revisions in PostgreSQL.
2. Implement transactional command UoWs for every domain transition with IDs-only
   canonical events and deterministic idempotency receipts.
3. Add strict role-owned routes from the spec, cursor pagination, no body in URL/log,
   and SSE using durable DB cursor plus `Last-Event-ID` replay.
4. Add overdue/prompt-expiry/period-end workers with fenced claims, retry exhaustion,
   quarantine, readiness, and graceful shutdown.
5. Test client/astrologer/combined-role ownership, inactive/blocked pair, ended period,
   obligation continuation, CSRF/idempotency/CAS, SSE reconnect, and cross-journal refs.

**Red/green commands:**

```bash
pnpm test packages/db/src/schema/astro-diary packages/domain/src/astro-diary
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/astro-diary
pnpm test apps/public-api/src/modules/astro-diary apps/astrologer-api/src/modules/astro-diary
pnpm test apps/workers/src/astro-diary
```

### Task 8: Private Media, Voice, Derivatives, and Retrieval

**Create/modify:**

- Extend media validation/contracts with private browser purposes
  `astro_diary_attachment` and `astro_diary_voice` and exact 20 MB/MIME policies.
- Add Diary-authorized upload/complete/signed-read composition in both APIs.
- Create `packages/domain/src/astro-diary-content-derivatives/*`.
- Create schema/adapters under `packages/db/src/schema/astro-diary-content-derivatives/*`
  and `packages/db/src/adapters/astro-diary-content-derivatives/*`.
- Create worker handlers under `apps/workers/src/astro-diary-content-derivatives/*`.
- Change local/production PostgreSQL image lineage to
  `pgvector/pgvector:0.8.6-pg17-trixie@sha256:a74b9af952f5609c090120bf938b0c8bca56c33ed9fb05643fd9fceec52c4a08`;
  add `CREATE EXTENSION vector` in the next forward migration.

**Behavioral steps:**

1. Reuse generic Media upload/object lifecycle; Diary validates relationship, author,
   purpose, private visibility, ready status, same entry, and signed-read access.
2. Support image JPEG/PNG/WebP/AVIF, PDF, and OGG/MPEG/MP4 audio exactly; no generic file
   widening and no public URL.
3. Generate source-bound transcript, PDF text pages, image descriptions, and retrieval
   chunks. Never publish derivative content.
4. Preserve original media. Before AI use, transcode OGG/Opus to an OpenAI-supported
   audio format and convert AVIF to PNG/WebP as versioned source-bound derivatives.
   Persist converter/source/output checksums and surface typed conversion failures.
5. Run `gpt-4o-transcribe` only for supported derived/original voice input; extraction
   failures remain typed and retryable by policy, with no silent empty text.
6. Store explicit 3072-dimension `text-embedding-3-large` vectors plus PostgreSQL FTS,
   filter by same journal and visible/non-erased source, run exact cosine search, and
   fuse deterministic lexical/vector ranks with reciprocal-rank fusion. Do not add an
   approximate ANN index before a same-journal benchmark proves it necessary.
7. Extend DB readiness/lineage preflight and restore documentation to verify
   `pg_available_extensions.default_version`, installed `pg_extension.extversion`, and a
   bounded create/insert/cosine-query probe. `pg_isready` alone is insufficient.
8. Prove media deletion/redaction invalidates every derivative/chunk and prevents signed
   reads or AI retrieval after erasure.

**Red/green commands:**

```bash
pnpm test packages/validation/src/media packages/domain/src/media
pnpm test packages/domain/src/astro-diary-content-derivatives apps/workers/src/astro-diary-content-derivatives
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/astro-diary-content-derivatives
docker compose config
```

### Task 9: Astrology Context and Isolated AstroDiary AI

**Create/modify:**

- Create Diary context assembler ports/adapters using current BirthData/Charts reads.
- Add `packages/ai/src/prompts/astro-diary-question-draft.v1.ts` and test.
- Add `packages/ai/src/prompts/astro-diary-reply-draft.v1.ts` and test.
- Add review/refine prompt definitions and strict output schemas.
- Create `apps/workers/src/astro-diary-ai/*` and isolated runtime config/readiness.
- Add astrologer API AI command/read/publish-edited-draft routes.

**Behavioral steps:**

1. Capture immutable chart/birth/context source IDs, versions, checksums, event time, and
   projection digest; do not copy chart mechanics into Diary.
2. Assemble an explicit allowlist: current visible cycle, astrologer-selected prior
   visible items, selected same-journal retrieval chunks, approved chart context, and
   curated astrologer style exemplars. Exclude client drafts, erased/hidden sources,
   unrelated CRM or journal content, and raw media URLs.
3. Persist one command with two child attempts: draft generation then exactly one review/
   refine pass. Request literal `gpt-5.5`, `store:false`, strict schema, source manifest,
   prompt version, model family, usage, and output checksum.
4. Reject stale source/draft CAS and model provenance mismatch. AI never auto-publishes;
   explicit astrologer edit plus publish calls the ordinary timeline command.
5. Add frozen RU/EN eval fixtures and non-regression tests for every existing AI feature,
   runtime env namespace, profile, prompt version, and request shape.

**Red/green commands:**

```bash
pnpm test packages/ai/src/prompts packages/ai/src/generation
pnpm test apps/workers/src/astro-diary-ai apps/workers/src/runtime-config.test.ts
pnpm test apps/astrologer-api/src/modules/astro-diary
pnpm --filter @elevenhouse/workers typecheck
```

### Task 10: Notifications, PDF Export, and Cascade Erasure

**Create/modify:**

- Add generic notification contracts/domain/schema/API projection if still absent.
- Add Diary notification handlers and exact journal deep links in
  `apps/notification-worker`.
- Add `apps/workers/src/astro-diary-export/*` renderer/storage/cleanup.
- Add export/erasure DB adapters and API signed-download/status routes.

**Behavioral steps:**

1. Consume canonical Diary delivery records once and create privacy-safe notification
   title/body plus exact deep link; no Inbox fallback and no journal body in payload/log.
2. Generate client/astrologer-authorized RU/EN PDF from current visible journal state;
   include deterministic sections and no private AI/provider metadata.
3. Render to private media, checksum-bind the export, invalidate stale downloads after
   relevant revision, and authorize short-lived signed download.
4. Execute whole-journal erasure in dependency order: revoke read/publish, redact body
   revisions, delete private media, redact derivatives/vectors/AI source/output/export,
   retain only minimum structural/audit tombstones defined by the spec.
5. Prove idempotent retries, partial worker crash recovery, source redaction, and no
   rehydration from an erased source.

**Red/green commands:**

```bash
pnpm test apps/notification-worker/src apps/workers/src/astro-diary-export
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/astro-diary
pdfinfo <fixture.pdf>
pdftotext <fixture.pdf> -
```

### Task 11: Astrologer Web Surface

**Create/modify:**

- Add `/journal` route and navigation mapping in `apps/astrologer-web`.
- Create `apps/astrologer-web/src/features/astro-diary/api/*` and `model/*`.
- Create focused components under `apps/astrologer-web/src/pages/journal/*`, one
  non-trivial component per file.
- Use stable design-system primitives only where already appropriate.

**Behavioral steps:**

1. Build journal list/search/filter, selected client header, subscription/allowance,
   timeline, date separators, mood, due/overdue/read states, and responsive navigation.
2. Build human-authored draft/reply/prompt composer, attachment/voice controls, context
   panel, AI draft request/edit/publish, correction/hide/delete, export, and cancellation
   states from validated server data.
3. Cover loading, empty, active, exhausted, ended, blocked, media processing/failure,
   AI pending/refused/stale/failure, export pending/failure, and retry states.
4. Do not derive allowance, due date, cycle state, or astrology facts in React.
5. Match exact reference visual language while replacing prototype-only behavior with
   approved production commands.

**Red/green commands:**

```bash
pnpm exec vitest run apps/astrologer-web/src/features/astro-diary apps/astrologer-web/src/pages/journal --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

### Task 12: Client Web Surface

**Create/modify:**

- Add relationship-scoped client route
  `/me/astrologers/:astrologerUserId/journal` and cabinet entry.
- Create `apps/client-web/src/features/astro-diary/api/*` and `model/*`.
- Create focused components under `apps/client-web/src/pages/astro-diary/*`.

**Behavioral steps:**

1. Build offer/checkout/subscription status, current allowance, timeline, mood composer,
   prompt accept/decline, own draft/edit/hide/erasure, media/voice, context, PDF export,
   cancellation schedule/revoke, renewal-failure recovery, and ended read-only states.
2. Scope every read/mutation to the authenticated selected relationship; never add
   discovery, other astrologers, public links, or provider-specific payment state.
3. Cover all loading/empty/error/retry/disabled states and responsive reference layouts.
4. Keep server-owned projections authoritative and invalidate/refetch after mutations.

**Red/green commands:**

```bash
pnpm exec vitest run apps/client-web/src/features/astro-diary apps/client-web/src/pages/astro-diary --config vitest.config.ts
pnpm --filter @elevenhouse/client-web typecheck
pnpm --filter @elevenhouse/client-web build
```

### Task 13: Cross-Layer, Runtime, Security, and Visual Acceptance

1. Run all focused suites, then package typechecks/builds and `pnpm verify`.
2. Confirm local ElevenHouse DB/container/port read-only, then run the authorized local
   `pnpm db:reset` against that exact target and re-run integration suites.
3. Seed two roles plus combined-role and unrelated/blocked fixtures. Run real network-
   backed purchase -> capture -> activation -> both initiator cycle paths -> media/voice
   -> context -> AI edit/publish -> renewal/cancel/failure/finance revocation ->
   export/deletion.
4. Validate CSRF/idempotency/CAS, duplicated webhooks/events, worker restart/recovery,
   SSE cursor replay, no cross-owner access, no sensitive log/outbox content, console,
   network, accessibility, keyboard/focus, RU/EN, and timezone behavior.
5. Capture exact reference and production screenshots at desktop/tablet/mobile. Measure
   DOM/computed dimensions, spacing, typography, colors, borders, radii, shadows,
   overflow, z-index and interactive states. Iterate until equivalent states match;
   record any approved accessibility-only deviation.
6. A live OpenAI canary remains skipped unless local credentials exist and the user
   separately authorizes external spend; provider-mocked/integration evidence must not be
   called live provider E2E.

### Task 14: Canonical Documentation and Finalization

1. Update `docs/product/full-functional-scope.md`, `docs/product/roadmap.md`,
   `docs/architecture/backend-modules.md`, media/AI architecture docs,
   `docs/api/api-boundaries.md`, design inventory/surface files, operations/config docs,
   and accepted ADRs required by the final architecture.
2. Regenerate current implementation and route inventories.
3. Run docs gates and GitNexus `detect_changes(scope: "all")`; inspect all affected
   processes and high-risk symbols.
4. Remove this executed plan and the task design spec only after all durable decisions
   have moved into canonical docs, per documentation-maintenance runbook.
5. Leave all owned work unstaged/uncommitted unless the user separately grants commit
   authority.

## Concrete Execution Order

Run Tasks 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14.
The only allowed parallelism is read-only research/review or tests over disjoint files.
Do not start Task 5 before recurring terminal evidence exists; do not start visible
Diary UI before the real API/persistence surface exists; do not claim completion before
Task 13 browser and computed-style evidence.

## Validation and Acceptance

The authoritative acceptance matrix is the design spec Definition of Done. Each checked
task must record:

- failing test and why it failed before production code;
- exact files owned and current shared-tree status;
- targeted green commands;
- affected dependency-surface commands;
- GitNexus callers/processes/risk for changed existing symbols;
- skipped or blocked evidence with factual reason;
- reviewer findings and fixes;
- no unrelated changes staged or overwritten.

Repository completion gates:

```bash
git diff --check
pnpm docs:check:test
pnpm docs:check
pnpm verify
```

Runtime/design completion additionally requires browser artifacts, not only component
tests. Generated PDF requires `pdfinfo`, `pdftotext`, and rendered-page visual checks.
Async contours require real local PostgreSQL/outbox/worker recovery evidence.

## Idempotence and Recovery

- Every externally retried command has a stable semantic idempotency key and a persisted
  application/command receipt. For a CAS command the canonical request hash includes the
  expected aggregate/slot version; reusing the same key with another version is an
  idempotency conflict, not a replay of an older result. Source-event identity remains
  independent of a local CAS retry version.
- Provider `outcome_unknown` is reconciled by provider operation identity; never
  redispatched blindly.
- Subscription capture/finance revocation, period creation, allowance reserve/consume/release,
  timeline publish, derivative creation, AI draft, notification, export, and erasure are
  each exactly-once effects under at-least-once delivery.
- Local DB reset is safe only after resolving the exact local Docker target; the task has
  standing local-development authority but no remote/production reset authority.
- Worker crash after state commit but before publish is recovered from durable outbox;
  crash after provider I/O but before commit enters reconciliation.
- Erasure is resumable and source-bound. A failed child redaction prevents the command
  from reporting complete.

## Artifacts and Evidence Locations

- Design/reference screenshots: `.artifacts/astro-diary/reference/`.
- Production screenshots: `.artifacts/astro-diary/production/`.
- Computed-style/DOM measurements: `.artifacts/astro-diary/metrics/`.
- Runtime/network/console evidence: `.artifacts/astro-diary/runtime/`.
- PDF fixtures/renders: `.artifacts/astro-diary/pdf/`.
- Agent execution ledger: `.superpowers/sdd/2026-08-11-astro-diary-implementation/`.

Artifacts containing journal text, birth details, raw media URLs, provider secrets, or AI
prompt bodies must remain local, redacted, and git-ignored.

## Outcomes and Retrospective

Populate only after verification. The final report must strictly separate implemented,
verified, partial, intentionally deferred, blocked, skipped checks/residual risk, and
unowned changes. Do not use “готово” or “production-ready” until every requested scope
item and mandatory browser/design gate is proved.
