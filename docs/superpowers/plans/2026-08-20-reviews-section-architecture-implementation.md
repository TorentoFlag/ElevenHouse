# Reviews Section Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse shared-main policy overrides generic worktree/branch guidance: work in the existing checkout on `main`, do not create/switch branches or worktrees, and do not commit unless the user gives explicit commit authority.

**Goal:** Build the production Reviews contour: reviewable product evidence, versioned client reviews, moderated publication, moderated astrologer replies, disputes, case communication, AI reply drafts, rating projections, request-review delivery, Flow trigger and design-parity UI.

**Architecture:** Reviews is a first-party domain contour. UI never owns business state; all eligibility, moderation, anonymity projection, rating aggregation, Flow triggering and communication visibility are server-owned through shared contracts, domain use cases, DB adapters and app composition roots.

**Tech Stack:** TypeScript, NestJS, React/Vite, Drizzle/PostgreSQL, transactional outbox, existing AI runtime, existing notification worker patterns, shared `@elevenhouse/contracts`.

**Spec:** `docs/superpowers/specs/2026-08-20-reviews-section-product-spec.md`

**Consensus:** `docs/superpowers/specs/2026-08-20-reviews-section-debate-consensus.md`

## Global Constraints

- Reviews remain direct-link and relationship-scoped. No marketplace, search, catalog, recommendations or cross-promo.
- Client review eligibility requires authoritative received/delivered/completed evidence. Payment alone never opens reviews.
- Reviews cover all current product contours by implementing or connecting missing received-evidence prerequisites where needed.
- Standard review window is 14 days after received evidence. AstroCalendar window is the full active period plus 14 days after the period ends.
- AstroDiary paid-period reviews use the standard 14-day window from server-side activation/entitlement receipt unless a separate product decision changes period-based windows.
- Pack reviews default to one review per completed pack session; whole-pack reviews require a separate `pack_completed` receipt.
- Course reviews default to server-owned access grant receipt; completion-based reviews require a server-owned completion receipt.
- Gift reviews default to the recipient as review author.
- Partially-refunded/refunded/chargeback source states before first publication block new review submission; those reversals after publication do not change an already-published review.
- Client review edits and astrologer reply edits create pending moderated versions; old approved versions remain public until replacement approval.
- Public/astrologer anonymous label is `Секретный пользователь`; astrologer sees full service/product context but never real client identity fields.
- Opening a dispute immediately hides the review from public projection as an audited temporary hold.
- AI reply generation creates a draft only; it never submits, publishes or moderates.
- Moderator-client and moderator-astrologer communication is case-owned and party-separated.
- Flow event technical name is `review_first_published`; UI label is `Отзыв опубликован`; it fires once on first approved publication only.
- For every edited function/class/method, run GitNexus upstream impact before edits and report direct callers, affected processes and risk.
- For visible UI work, complete ElevenHouse design-parity capture before implementation and browser-backed comparison after implementation.
- Do not add fake success, mocks, browser-only review state, guessed DTOs, fallback readers, compatibility paths or unrelated cleanup.

## Research

Question: how to structure Reviews so eligibility, moderation, request-review, anonymity, disputes, AI drafts and public rating projections are reliable and compatible with ElevenHouse boundaries.

Accessed: 2026-08-20.

Repository evidence:

- `docs/api/api-boundaries.md` says `public-api` owns public/client-facing routes, `astrologer-api` owns authenticated astrologer workflows, and moderator/admin workflows belong only to `admin-api`.
- `docs/architecture/design-surfaces/astrologer.md` marks Reviews as `missing` and says visibility must follow moderation workflow.
- `docs/architecture/design-surfaces/client.md` marks full public profile and Reviews read model as incomplete.
- `docs/architecture/design-surfaces/admin.md` marks moderation queues as missing beyond admin foundation and requires reason, reviewer identity and audit.
- `packages/domain/src/products/paid-product-fulfillment-registry.ts` currently supports only `single.once.live.solo` and exact AstroDiary paid-period shape through booking-completed terminal evidence; other product shapes return unsupported codes.
- `packages/db/src/schema/scheduling/bookings.schema.ts` has authoritative booking states including `completed`, `cancelled`, `no_show`, `expired`.
- `packages/db/src/schema/finance/orders.schema.ts` ties orders to client, astrologer, product and optional booking, and stores order status; it is not by itself proof of receipt.
- `packages/domain/src/flows/flow-runtime-outbox.ts` currently has `review_received`; implementation must replace or migrate this to `review_first_published` semantics deliberately.
- `packages/db/src/schema/flows/flows-values.ts`, `packages/domain/src/flows/flow-graph-v2-compiler.ts`, `packages/domain/src/flows/flow-event-enrollment.ts` and Flow Builder frontend files also contain `review_received`; all must be handled by the controlled Flow trigger migration.
- `apps/client-web/src/pages/public-astrologer/PublicAstrologerPageView.tsx` is currently join-intent UI, not a full public profile/reviews page.
- `apps/admin-api/src/app.module.ts` imports finance/admin foundation modules but no general moderation module.

External sources:

- [16 CFR Part 465](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465): reviews must not materially misrepresent that the reviewer used or experienced the product/service; suppression based on rating/negative sentiment is risky unless withholding criteria are applied equally.
- [FTC Consumer Reviews Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers): incentives cannot require positive/negative sentiment; paying to change/remove truthful negative reviews can distort consumer opinion.
- [OWASP IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html): any user-supplied object id needs object-level authorization checks; Reviews has multiple high-risk ids: reviewable instance, review, version, reply, case, message, order, booking.
- [WAI ARIA Rating Radio Group Example](https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-rating/): rating input can use radio-group semantics, but APG examples are illustrative and require assistive-tech/browser testing before production use.
- [WAI ARIA Patterns](https://www.w3.org/WAI/ARIA/apg/patterns/): modal/dialog, radio group, tabs, toolbar and related widgets define expected keyboard/accessibility patterns for review forms, filters, modals and admin queues.
- [OpenAI business/API data-use policy](https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/): business/API inputs and outputs are not used for training by default unless the organization opts in; implementation still needs ElevenHouse input minimization and runtime/provider evidence.
- [OpenAI enterprise privacy](https://openai.com/enterprise-privacy/): business data is not used for model training by default; this supports the AI draft contour but does not replace consent/privacy review.

Recommendation:

- Use a `reviewable_instances` authority registry with per-product received evidence.
- Use immutable version rows and current-approved pointers for reviews and replies.
- Keep public/astrologer/admin projections as separate contract schemas to prevent identity leaks.
- Add review moderation case communication as a new case-owned contour; do not force it into current Messaging unless party-separated visibility is proven.
- Introduce `review_first_published` as the Flow trigger and migrate existing `review_received` scaffolding intentionally.

Rejected alternatives:

- Payment-only eligibility: rejected because payment does not prove product/service receipt.
- UI-first Reviews: rejected because it would force fake states before moderation, evidence and projections exist.
- Current Messaging as moderation case source of truth: rejected unless architecture proves party-separated visibility and no identity leaks.
- AI frontend prompt/provider route: rejected because provider, prompt, evidence and safety boundaries belong to backend.

## Architecture Slices

### Slice 0: Intake And Current Evidence Registry

**Purpose:** Establish exact product contours and received-evidence sources before feature code.

**Files to read/update:**

- Read: `docs/development/agent-runbooks/00-task-intake.md`
- Read: `docs/development/agent-workflow.md`
- Read: `packages/domain/src/products/paid-product-fulfillment-registry.ts`
- Read: `packages/db/src/schema/products/*`
- Read: `packages/db/src/schema/finance/orders.schema.ts`
- Read: `packages/db/src/schema/scheduling/bookings.schema.ts`
- Read: AstroCalendar/AstroDiary schemas, adapters and contracts found by source trace.
- Create: `docs/architecture/reviews-reviewable-instance-map.md`

**Steps:**

- [x] Refresh `git branch --show-current`, `git status --short`, staged diff and untracked files.
- [x] Trace each current product contour from product type/config to order/payment to received/delivered/completed evidence.
- [x] For each contour, record `reviewableInstanceKind`, source id, owner id, client id, astrologer id, product id, received timestamp, review-window anchor and negative states.
- [x] Use UTC half-open review windows: `[windowOpensAt, windowClosesAt)`. UI displays the same instants in the user's timezone.
- [x] Seed the map with current evidence: paid live solo booking uses booking lifecycle `completed`; exact AstroDiary paid-period uses period/entitlement activation evidence; AstroCalendar needs a client service-period authority before reviews; async/materials/instant/course/pack/group/gift/custom/free/manual booking need received/delivered lifecycle evidence before reviews.
- [x] Mark every unsupported contour as a prerequisite inside Reviews delivery, not as deferred scope.
- [x] Confirm current local migration lineage before assigning any new migration number.
- [x] Run no code edits until this map has been reviewed by the senior reviewer.

**Slice 0 output:** `docs/architecture/reviews-reviewable-instance-map.md`.

**Migration lineage note:** current `_journal.json` includes
`0066_client_order_capture_resource_policy`, while the corresponding SQL file is
untracked in the shared checkout. Any Reviews DB migration must re-check dirty
state and journal before selecting the next migration number.

**Acceptance:**

- A reviewer can point at an authoritative source for each reviewable instance.
- Payment-only review eligibility has no path in the map.
- Current blockers are explicit, owned and testable.

### Slice 1: Contracts And State Machines

**Purpose:** Define canonical request/response schemas and state machines before DB/API work.

**Progress 2026-08-20:** Initial Reviews contracts and controlled Flow trigger
migration are implemented:

- `packages/contracts/src/reviews.ts`
- `packages/contracts/src/reviews.test.ts`
- `packages/contracts/src/flows-v2.test.ts`
- `packages/domain/src/flows/flow-review-publication-trigger.test.ts`
- `apps/astrologer-web/src/features/flows/model/flowDisplay.test.ts`
- `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts`

Remaining Slice 1 work: complete client/astrologer/admin review projection
schemas, moderation case/message schemas and version response schemas before DB
and API slices.

**Likely files:**

- Create: `packages/contracts/src/reviews.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/flows-v2.ts`
- Modify: `apps/astrologer-web/src/features/flows/model/flowDisplay.ts`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts`
- Test: `packages/contracts/src/reviews.test.ts`
- Test: targeted Flow contract/display tests where existing patterns place them.

**Contracts to define:**

- `ReviewableInstanceKind`
- `ReviewableInstanceStatus`
- `ReviewWindowPolicy`
- `ReviewPublicIdentityMode = "named" | "secret_user"`
- `ReviewModerationStatus`
- `ReviewVisibilityStatus`
- `ReviewDisputeStatus`
- `ReviewModerationReasonCode`
- `ReviewVersionResponse`
- `ReviewReplyVersionResponse`
- `ReviewModerationCaseResponse`
- `ReviewCaseMessageResponse`
- Public/astrologer/admin/client projection schemas as separate shapes.

**Steps:**

- [ ] Run GitNexus impact before editing any existing Flow display/contract symbols.
- [ ] Write contract tests for rating bounds, text length, control characters, anonymity projection, version status transitions and `review_first_published` Flow node naming.
- [ ] Define schemas with strict objects and explicit enums.
- [ ] Add initial moderation reason taxonomy: `spam`, `abuse_or_hate`, `personal_data_exposure`, `off_topic`, `not_service_related`, `fraud_or_conflict`, `duplicate`, `legal_risk`, `other`.
- [ ] Replace or migrate `review_received` semantics deliberately; do not silently alias old and new triggers.
- [ ] Run focused contract tests.

**Acceptance:**

- No frontend can receive real identity fields in public/astrologer projections for `Секретный пользователь`.
- `review_first_published` cannot fire for edit/reply/dispute/restore schemas.
- Contracts encode state names that match product spec copy.

### Slice 2: DB Schema And Migration

**Purpose:** Persist reviewable instances, immutable versions, moderation cases, messages, audit links and aggregates.

**Likely files:**

- Create: `packages/db/src/schema/reviews/reviewable-instances.schema.ts`
- Create: `packages/db/src/schema/reviews/reviews.schema.ts`
- Create: `packages/db/src/schema/reviews/review-versions.schema.ts`
- Create: `packages/db/src/schema/reviews/review-replies.schema.ts`
- Create: `packages/db/src/schema/reviews/review-moderation-cases.schema.ts`
- Create: `packages/db/src/schema/reviews/review-moderation-decisions.schema.ts`
- Create: `packages/db/src/schema/reviews/review-case-messages.schema.ts`
- Create: `packages/db/src/schema/reviews/review-rating-aggregates.schema.ts`
- Create: `packages/db/src/schema/reviews/review-publication-events.schema.ts`
- Create: `packages/db/src/schema/reviews/review-ai-reply-drafts.schema.ts` if AI draft attempts need durable idempotent outcome records outside the generic AI usage recorder.
- Modify: `packages/db/src/schema/index.ts`
- Create: next focused Drizzle migration under `packages/db/drizzle/`
- Test: schema/adapters integration tests under `packages/db/src/adapters/reviews/`

**Schema direction:**

- `reviewable_instances`: source kind/id, client user, astrologer user, relationship, product/order/booking references, product snapshot, receivedAt, reviewWindowClosesAt, status, invalidation reason.
- `reviews`: stable review aggregate, reviewable instance id, currentApprovedVersionId, currentVisibility, dispute status, lifecycle revision.
- `review_versions`: immutable submitted content/rating/public identity mode, moderation status, submitted by, submittedAt, request hash/idempotency metadata.
- `review_reply_versions`: immutable reply text/version records with current-approved reply pointer.
- `review_moderation_cases`: review/reply/dispute/clarification case state, priority/SLA fields, actor ids.
- `review_moderation_decisions`: append-only decisions with reason code, prior/new state and audit metadata.
- `review_case_messages`: party-specific thread messages and internal notes.
- `review_rating_aggregates`: deterministic projection per astrologer/product if stored; must be reconcilable from approved non-hidden versions.
- `review_publication_events`: unique first-publication receipt per review; source of truth for exactly-once `review_first_published` Flow/event emission.
- `review_ai_reply_drafts`: optional idempotent draft attempts with safe input hash, state, draft text or provider failure evidence.

**Steps:**

- [ ] Run impact before modifying schema exports.
- [ ] Write failing schema/integration tests for uniqueness: one active review aggregate per reviewable instance; one pending version type per review/reply; no duplicate active dispute.
- [ ] Add constraints for rating 1-5, text length, status enums, product/order/booking relationship identity and positive review window.
- [ ] Store aggregate inputs as integers (`ratingSum`, `ratingCount`, `star1Count` ... `star5Count`) and derive display averages from those values to avoid floating-point drift.
- [ ] Add transaction tests for submit+case/outbox, approve+aggregate, dispute+hide+case, restore+aggregate.
- [ ] Add migration only after reading current `_journal.json` and confirming no unowned migration conflict.

**Acceptance:**

- Concurrent submissions cannot create duplicate active reviews.
- Public pointer and pending versions cannot diverge.
- Dispute hide and case creation are atomic.
- Aggregate can be recomputed and compared to stored values.

### Slice 3: Domain Use Cases

**Purpose:** Own business rules outside apps and DB.

**Likely files:**

- Create: `packages/domain/src/reviews/review-types.ts`
- Create: `packages/domain/src/reviews/review-errors.ts`
- Create: `packages/domain/src/reviews/review-use-cases.ts`
- Create: `packages/domain/src/reviews/review-moderation-use-cases.ts`
- Create: `packages/domain/src/reviews/review-reply-use-cases.ts`
- Create: `packages/domain/src/reviews/review-case-communication-use-cases.ts`
- Create: `packages/domain/src/reviews/review-events.ts`
- Create: `packages/domain/src/reviews/review-ai-policy.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/reviews/*.test.ts`

**Use cases:**

- `createReviewableInstance`
- `listClientReviewableInstances`
- `submitReviewVersion`
- `editReviewVersion`
- `approveReviewVersion`
- `rejectReviewVersion`
- `hideReview`
- `restoreReview`
- `openReviewDispute`
- `submitReviewReplyVersion`
- `approveReviewReplyVersion`
- `rejectReviewReplyVersion`
- `createReviewCaseMessage`
- `createReviewReplyDraftCommand`
- `createReviewFirstPublishedFlowEvent`

**Steps:**

- [ ] Write failing domain tests for every product decision in the spec.
- [ ] Implement use cases with ports; domain must not import `packages/db`.
- [ ] Require expected revision/CAS on review/reply moderation and dispute decisions.
- [ ] Model idempotency request hash conflicts explicitly.
- [ ] Ensure refund/chargeback after publication does not mutate published review state.
- [ ] Ensure moderation rules are viewpoint-neutral: low rating or negative sentiment cannot be a reason by itself to reject/hide.

**Acceptance:**

- Domain tests prove eligibility, windows, versions, reply moderation, disputes, anonymity projection, case communication visibility and Flow event cardinality.
- Every mutation returns a receipt suitable for API response/audit.

**Progress 2026-08-20:** Domain lifecycle core

- Added pure Reviews domain lifecycle functions for submit/edit planning, first approval publication, first-publication Flow event creation, dispute opening, case message visibility policy and public author projection.
- Added behavioral tests for review window half-open checks, old-version preservation during pending edit, one-time Flow event on first publication, dispute hide and case message visibility.
- Extended domain lifecycle with review rejection, moderated astrologer reply approval/rejection and dispute restore transitions that do not re-trigger Flow.
- Added AI reply draft policy that builds draft-only commands from public review/service context and excludes client identity, payment data, moderation notes and case messages.

### Slice 4: DB Adapters And Outbox

**Purpose:** Wire domain ports to PostgreSQL and transactional outbox.

**Likely files:**

- Create: `packages/db/src/adapters/reviews/drizzle-reviewable-instance-store.ts`
- Create: `packages/db/src/adapters/reviews/drizzle-review-command-store.ts`
- Create: `packages/db/src/adapters/reviews/drizzle-review-moderation-store.ts`
- Create: `packages/db/src/adapters/reviews/drizzle-review-case-message-store.ts`
- Create: `packages/db/src/adapters/reviews/drizzle-review-public-read-store.ts`
- Create: `packages/db/src/adapters/reviews/drizzle-review-aggregate-store.ts`
- Modify: `packages/db/src/schema/outbox/outbox-events.schema.ts`
- Modify: relevant outbox relay/worker claim code after source trace.
- Test: integration tests for adapters and outbox rows.

**Steps:**

- [ ] Run impact before editing outbox schema/relay symbols.
- [ ] Add outbox payload types for review notifications and `review_first_published` Flow enrollment.
- [ ] Implement transactions that write domain change + moderation/audit + aggregate + outbox as one unit.
- [ ] Add replay tests for idempotency keys and changed-body conflicts.
- [ ] Add row-lock or CAS behavior for concurrent moderation decisions.

**Acceptance:**

- A transaction cannot publish a review without aggregate/audit consistency.
- Worker retry cannot duplicate `review_first_published`.
- Public read-store cannot hydrate hidden/pending/rejected content.

**Progress 2026-08-20:** Review command store foundation

- Added a Drizzle review command store for client review submission/edit and moderator approval of review versions.
- Added review revision persistence for CAS-style update planning.
- Added a publication receipt table path in the command store so first approval emits one `review_first_published` receipt and approved edits do not emit another one.
- Added an integration test that exercises submit -> first approval -> edit pending -> edit approval against local PostgreSQL.
- Remaining Slice 4 scope: aggregate updates, audit rows, moderation case/message persistence, reply version commands, dispute transactions, notification/outbox writes and public/admin read stores.

### Slice 5: Public API

**Purpose:** Client-owned review eligibility, submission/edit/status and public direct-link reviews.

**Likely files:**

- Create: `apps/public-api/src/modules/reviews/reviews.controller.ts`
- Create: `apps/public-api/src/modules/reviews/reviews.service.ts`
- Create: `apps/public-api/src/modules/reviews/reviews.module.ts`
- Create: `apps/public-api/src/modules/reviews/reviews.tokens.ts`
- Modify: `apps/public-api/src/app.module.ts`
- Test: `apps/public-api/src/modules/reviews/reviews.e2e.test.ts`

**Routes to design:**

- `GET /me/reviewable-instances`
- `POST /reviews`
- `PUT /reviews/:reviewId`
- `GET /reviews/:reviewId`
- `GET /a/:handle/reviews`

Exact route names can change during contract planning, but ownership cannot.

**Steps:**

- [ ] Run impact before editing `AppModule`.
- [ ] Enforce client role and exact relationship/object ownership.
- [ ] Require CSRF and idempotency on state-changing routes.
- [ ] Return non-enumerating safe errors for foreign/missing instances.
- [ ] Public direct-link reads expose only approved non-hidden public projection.

**Acceptance:**

- Foreign client cannot review or read another client's reviewable instance.
- Payment-only and invalidated instances are rejected.
- Anonymous public response never includes real identity fields.

### Slice 6: Admin API Moderation And Case Communication

**Purpose:** Create the admin-owned moderation contour.

**Likely files:**

- Create: `apps/admin-api/src/modules/review-moderation/review-moderation.controller.ts`
- Create: `apps/admin-api/src/modules/review-moderation/review-moderation.service.ts`
- Create: `apps/admin-api/src/modules/review-moderation/review-moderation.module.ts`
- Create: `apps/admin-api/src/modules/review-moderation/review-moderation.tokens.ts`
- Modify: `apps/admin-api/src/app.module.ts`
- Test: `apps/admin-api/src/modules/review-moderation/review-moderation.e2e.test.ts`

**Routes to design:**

- `GET /admin/reviews/moderation/queue`
- `POST /admin/reviews/:reviewId/versions/:versionId/approve`
- `POST /admin/reviews/:reviewId/versions/:versionId/reject`
- `POST /admin/reviews/:reviewId/hide`
- `POST /admin/reviews/:reviewId/restore`
- `GET /admin/reviews/cases/:caseId`
- `POST /admin/reviews/cases/:caseId/messages`
- `POST /admin/reviews/cases/:caseId/internal-notes`
- `POST /admin/reviews/cases/:caseId/close`

**Steps:**

- [ ] Run impact before editing `admin-api` module composition.
- [ ] Require moderator/admin role checks through current admin auth pattern.
- [ ] Require CSRF, idempotency, reason codes and expected revision on decisions.
- [ ] Keep case messages party-scoped: client thread, astrologer thread, internal notes.
- [ ] Add audit timeline to admin response, not public/astrologer response.

**Acceptance:**

- Admin can see real anonymous author; astrologer/public cannot.
- Client/astrologer never see each other's case messages.
- Every decision has actor, reason, prior/new state and audit.

### Slice 7: Astrologer API And AI Draft

**Purpose:** Astrologer workspace data, reply submission/moderation entry, dispute, request-review and AI draft.

**Likely files:**

- Create: `apps/astrologer-api/src/modules/reviews/reviews.controller.ts`
- Create: `apps/astrologer-api/src/modules/reviews/reviews.service.ts`
- Create: `apps/astrologer-api/src/modules/reviews/reviews.module.ts`
- Create: `apps/astrologer-api/src/modules/reviews/reviews.tokens.ts`
- Create: `packages/ai/src/prompts/review-reply-draft.ts`
- Modify: `apps/astrologer-api/src/modules/ai/ai-usage-evidence-requirements.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`
- Test: `apps/astrologer-api/src/modules/reviews/reviews.e2e.test.ts`
- Test: prompt/output validation tests in `packages/ai`.

**Routes to design:**

- `GET /reviews`
- `GET /reviews/:reviewId`
- `POST /reviews/:reviewId/replies`
- `PUT /reviews/:reviewId/replies/:replyId`
- `POST /reviews/:reviewId/disputes`
- `POST /reviews/request-review`
- `POST /reviews/:reviewId/reply-draft`

**Steps:**

- [ ] Run impact before editing `AiGenerationService` dependents or app composition.
- [ ] Ensure astrologer projections use full product/service context but no anonymous real identity fields.
- [ ] Require idempotency and CSRF on reply, dispute, request-review and AI draft.
- [ ] AI draft input must exclude real client identity, payment data, moderation notes and case messages.
- [ ] Request-review must be sentiment-neutral and rate-limited.

**Acceptance:**

- Astrologer cannot publish a reply without moderation.
- AI draft cannot submit or publish anything.
- Dispute immediately hides public projection as a temporary hold and creates a case.

### Slice 8: Notifications And Flow Runtime

**Purpose:** Deliver review requests/moderation/case notifications and Flow trigger.

**Likely files:**

- Modify: `packages/domain/src/flows/flow-runtime-outbox.ts`
- Modify: `packages/domain/src/flows/flow-event-enrollment.ts`
- Modify: `packages/domain/src/flows/flow-graph-v2-compiler.ts`
- Modify: `packages/contracts/src/flows-v2.ts`
- Modify: `packages/db/src/schema/flows/flows-values.ts`
- Modify: `packages/db/src/schema/outbox/outbox-events.schema.ts`
- Modify: `apps/workers` Flow relay claim/imports after current trace.
- Modify: `apps/notification-worker` notification dispatch patterns after current trace.
- Test: Flow runtime/enrollment tests and notification-worker tests.

**Steps:**

- [ ] Run GitNexus impact before touching Flow compiler/runtime symbols.
- [ ] Add `review_first_published` trigger and UI labels.
- [ ] Audit existing persisted/published Flow definitions and seed SQL that mention `review_received`; decide whether to migrate, reject activation until updated, or add an explicit one-time conversion migration.
- [ ] Produce event only when first approved public version becomes public.
- [ ] Use `review_publication_events.id` or review id as the occurrence identity; enforce uniqueness so edits/restores/replies cannot duplicate.
- [ ] Add notification events for request-review, moderation decisions and case messages using outbox.

**Acceptance:**

- Exactly one Flow enrollment request per first approved public review.
- Replayed approval command does not duplicate Flow event.
- Pending submission does not trigger astrologer Flow.

### Slice 9: Frontend Client, Astrologer, Admin

**Purpose:** Implement user-visible workflows after backend contracts exist.

**Likely client files:**

- Create: `apps/client-web/src/features/reviews/api/*`
- Create: `apps/client-web/src/features/reviews/model/*`
- Create: `apps/client-web/src/features/reviews/ui/*`
- Modify: client cabinet pages/routes after current route trace.
- Modify: `apps/client-web/src/pages/public-astrologer/*`

**Likely astrologer files:**

- Create: `apps/astrologer-web/src/features/reviews/api/*`
- Create: `apps/astrologer-web/src/features/reviews/model/*`
- Create: `apps/astrologer-web/src/features/reviews/ui/*`
- Create: `apps/astrologer-web/src/pages/reviews/*`
- Modify: `apps/astrologer-web/src/router.contract.ts`
- Modify: `apps/astrologer-web/src/router.tsx`
- Modify: navigation drawer/mobile nav files.

**Likely admin files:**

- Create: `apps/admin-web/src/features/review-moderation/*`
- Modify: `apps/admin-web/src/App.tsx` or current admin router after trace.

**Steps:**

- [ ] Use `elevenhouse-design-parity` before UI work.
- [ ] Capture reference screenshots/metrics for `reviews.jsx`, `mobile-reviews.jsx`, public review section/modal, client review entry, admin moderation/disputes.
- [ ] Add frontend model tests for parsed contract data, projections, filters and status presentation.
- [ ] Implement loading/empty/success/error/retry/disabled states.
- [ ] Never compute eligibility, moderation status, rating aggregate or identity masking in React from raw private data.

**Acceptance:**

- UI reads server projections and cannot reveal hidden fields.
- Keyboard/focus/modal/rating semantics are tested.
- Browser comparison passes desktop and mobile reference states or records approved deviations.

### Slice 10: Verification And Release Gates

**Purpose:** Prove the full contour.

**Required checks:**

- `pnpm test packages/contracts/src/reviews.test.ts`
- `pnpm test packages/domain/src/reviews`
- DB integration tests for review adapters.
- API e2e tests for `public-api`, `astrologer-api`, `admin-api`.
- Frontend tests for `client-web`, `astrologer-web`, `admin-web`.
- Worker tests for outbox/notification/Flow paths.
- App typechecks for touched apps/packages.
- `pnpm verify`
- `git diff --check`
- Browser E2E for client submit -> admin approve -> public/astrologer readback.
- Browser E2E for edit, reply moderation, dispute hide/restore, AI draft and case messaging.
- Design parity screenshots/metrics for required states.

**Minimum runtime scenarios:**

- Anonymous review: client submits, moderator approves, public/astrologer show `Секретный пользователь`, admin shows real identity.
- Edit review: old version remains public while pending version is moderated.
- Reply: astrologer submits reply, public hides until moderator approval.
- Dispute: public hide immediate, aggregate excludes, moderator restore returns public review and aggregate.
- AI: draft generated, editable, never auto-submitted, reply still moderated.
- Case messages: moderator-client and moderator-astrologer messages remain separated.
- Flow: one `review_first_published` trigger on first approval only.

## Parallelization Plan

Can run in parallel after Slice 0 map:

- Designer captures state matrix and reference screenshots.
- Architect finalizes DB/domain/API state machines.
- Developer prepares contract/domain tests.
- QA prepares seed fixtures and E2E matrix.
- Senior reviews moderation/legal/privacy/idempotency state machines.

Must remain sequential:

- DB migration after schema design and current migration lineage check.
- API implementation after contracts/domain state machines.
- UI implementation after backend projections and design capture.
- Flow/notification integration after publication transaction exists.

## Known Blockers And Risks

- Public page full read model is missing; Reviews public UI depends on it or must build it as part of this work.
- General admin moderation surface is missing; Reviews likely establishes reusable moderation/case patterns.
- Current paid-product fulfillment registry does not cover all product shapes; missing received evidence is in scope and must be implemented per product contour.
- Current Flow scaffolding uses `review_received`; product decision requires `review_first_published`.
- Existing persisted Flow graph constraints, seed SQL and frontend display code mention `review_received`; migration must be explicit and source-audited.
- Current Messaging is astrologer/provider-thread oriented and must not become review-case source of truth without a separate visibility proof.
- AI prompt/provider/privacy policy must be reviewed before the route ships.
- GitNexus index has been observed stale in this rollout; use it for navigation only until refreshed, and verify direct source before edits.

## Handoff

After this architecture plan is accepted:

1. Run a final architect review against current source.
2. Split implementation into subagent-owned tasks with disjoint write sets.
3. Start with Slice 0 and stop before DB/API code if reviewable evidence for all current product contours is not mapped.
4. Keep every slice independently testable and reviewed before the next visible surface is claimed.
