# Real Flow Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-backed product-purchase, first-inbound-message, and client-lifecycle-change starts to V2 Flows, plus the fixed audited client lifecycle that produces the third event.

**Architecture:** The Clients module owns a new relationship-scoped lifecycle projection and append-only transition history; it never repurposes the existing access relationship status. Finance, Messaging, Bookings, and Clients atomically record strictly allowlisted source events into the existing durable Flow dispatch outbox. The worker validates each source envelope, lets every active epoch evaluate it, and persists idempotent runs pinned to that epoch/version.

**Tech Stack:** TypeScript, NestJS, React, Zod contracts, Drizzle ORM, PostgreSQL, Vitest, existing Flow runtime outbox worker.

## Global Constraints

- Keep `client_astrologer_relationships.status` as the access/authorization enum `active | archived | blocked`.
- Client lifecycle is relationship-scoped and limited to `new | active | waiting_for_client | in_service | inactive`.
- All source events must have server-derived subject, provenance, occurrence time, immutable source ID, allowlisted payload, and idempotency key; never pass message content through Flow events.
- A Flow event must be evaluated against every active effective activation epoch, must never enroll retrospectively, and duplicate delivery must not create another run.
- Start policies are `once_per_client`, `each_occurrence`, and `after_previous_terminal`; they are configured on the start node and persisted with the enrollment decision.
- Preserve current booking/manual semantics and pinned-version behavior. New work is forward-only: add a focused Drizzle migration and never alter an existing migration, journal, or snapshot.
- No external writes, no commit, and no modifications to unrelated dirty paths.

---

### Task 1: Define the client lifecycle and normalized Flow-event contracts

**Files:**
- Modify: `packages/domain/src/clients/client-types.ts`
- Modify: `packages/domain/src/clients/client-store.ts`
- Modify: `packages/domain/src/clients/index.ts`
- Modify: `packages/contracts/src/flows-v2.ts`
- Modify: `packages/domain/src/flows/flow-runtime-outbox.ts`
- Modify: `packages/domain/src/flows/index.ts`
- Test: `packages/domain/src/clients/client-lifecycle.test.ts`
- Test: `packages/contracts/src/flows-v2.test.ts`
- Test: `packages/domain/src/flows/flow-runtime-outbox.test.ts`

**Interfaces:**
- Produces `ClientLifecycleStatus`, `ClientLifecycleMode`, `ClientLifecycleTransition`, and a `ClientLifecycleStore` port with atomic transition and inactivity-selection operations.
- Produces the discriminated `FlowRuntimeEnrollmentRequestedPayloadV1` union for `booking_confirmed`, `product_purchased`, `first_inbound_message`, and `client_lifecycle_changed`.
- Extends a V2 start node with `enrollmentPolicy: "once_per_client" | "each_occurrence" | "after_previous_terminal"` and strict filter shapes.

- [ ] **Step 1: Write the failing domain and contract tests**

```ts
expect(resolveClientLifecycleTransition({
  current: { status: "new", mode: "automatic" },
  cause: { kind: "captured_order", occurredAt: "2026-08-13T10:00:00.000Z" }
})).toMatchObject({ status: "active", mode: "automatic" });

expect(flowGraphV2Schema.safeParse(productPurchaseGraph("each_occurrence")).success).toBe(true);
expect(flowGraphV2Schema.safeParse({ ...productPurchaseGraph(), nodes: [] }).success).toBe(false);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test packages/domain/src/clients/client-lifecycle.test.ts packages/contracts/src/flows-v2.test.ts packages/domain/src/flows/flow-runtime-outbox.test.ts`

Expected: tests fail because lifecycle symbols and the three trigger schemas do not yet exist.

- [ ] **Step 3: Add minimal public types, transition resolver, and Zod schemas**

```ts
export const clientLifecycleStatusValues = ["new", "active", "waiting_for_client", "in_service", "inactive"] as const;
export type ClientLifecycleStatus = (typeof clientLifecycleStatusValues)[number];

export function resolveClientLifecycleTransition(input: ClientLifecycleTransitionInput): ClientLifecycleTransitionDecision {
  if (input.current.mode === "manual_override" && input.cause.kind !== "return_to_automatic") {
    return { disposition: "record_candidate", status: input.current.status };
  }
  const target = lifecycleTargetByCause[input.cause.kind] ?? input.current.status;
  return { disposition: target === input.current.status ? "no_change" : "applied", status: target };
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm test packages/domain/src/clients/client-lifecycle.test.ts packages/contracts/src/flows-v2.test.ts packages/domain/src/flows/flow-runtime-outbox.test.ts`

Expected: PASS; invalid duplicate filters, unrecognized policies, and a manual override receiving an automatic event are rejected or recorded as candidates.

### Task 2: Persist lifecycle projection/history and durable Flow source-event intents

**Files:**
- Create: `packages/db/src/schema/clients/client-lifecycle.schema.ts`
- Modify: `packages/db/src/schema/clients/index.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/adapters/clients/drizzle-client-lifecycle-store.ts`
- Create: `packages/db/src/adapters/clients/drizzle-client-lifecycle-store.integration.ts`
- Modify: `packages/db/src/schema/flows/flows-values.ts`
- Modify: `packages/db/src/schema/flows/flows.schema.ts`
- Modify: `packages/db/src/adapters/flows/drizzle-flow-runtime-dispatch-outbox-store.ts`
- Test: `packages/db/src/adapters/clients/drizzle-client-lifecycle-store.integration.ts`
- Test: `packages/db/src/adapters/flows/drizzle-flow-runtime-dispatch-outbox-store.integration.ts`
- Create: next focused generated migration under `packages/db/drizzle/`

**Interfaces:**
- Consumes Task 1 lifecycle and source-event types.
- Produces database-backed atomic lifecycle projections/history and Flow outbox event types that share the existing claim/publish/quarantine protocol.

- [ ] **Step 1: Write failing PostgreSQL integration tests**

```ts
const first = await store.applyTransition({ relationshipId, cause: capturedOrderCause });
const replay = await store.applyTransition({ relationshipId, cause: capturedOrderCause });
expect(first).toMatchObject({ applied: true, afterStatus: "active" });
expect(replay).toMatchObject({ replayed: true, afterStatus: "active" });
expect(await readHistory(relationshipId)).toHaveLength(1);
```

- [ ] **Step 2: Run the integration tests and verify RED**

Run: `pnpm test packages/db/src/adapters/clients/drizzle-client-lifecycle-store.integration.ts packages/db/src/adapters/flows/drizzle-flow-runtime-dispatch-outbox-store.integration.ts`

Expected: FAIL because lifecycle tables and the new source-event values are absent.

- [ ] **Step 3: Add schema, transaction adapter, and migration**

```ts
export const clientLifecycleStates = pgTable("client_lifecycle_states", {
  relationshipId: uuid("relationship_id").primaryKey().references(() => clientAstrologerRelationships.id),
  status: text("status").notNull(),
  mode: text("mode").notNull().default("automatic"),
  revision: integer("revision").notNull().default(1),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull()
});
```

Add an immutable history row keyed by `(relationship_id, source_event_id)`, source/actor metadata, before/after statuses, disposition, and timestamp. Insert the source outbox event in the same transaction as the authoritative transition; use unique identity constraints and `onConflictDoNothing` only for an exact replay.

- [ ] **Step 4: Generate and inspect the forward migration**

Run: `pnpm db:generate && git diff --check -- packages/db/drizzle packages/db/src/schema`

Expected: one new forward migration plus matching journal/meta artifacts; no existing migration changes.

- [ ] **Step 5: Run integration tests and verify GREEN**

Run: `pnpm test packages/db/src/adapters/clients/drizzle-client-lifecycle-store.integration.ts packages/db/src/adapters/flows/drizzle-flow-runtime-dispatch-outbox-store.integration.ts`

Expected: PASS for atomic application, replay, manual override candidate recording, and outbox identity uniqueness.

### Task 3: Make relationships, captured orders, messages, and bookings emit authoritative lifecycle/source events

**Files:**
- Modify: `packages/db/src/adapters/clients/drizzle-client-store.ts`
- Modify: `packages/db/src/adapters/finance/drizzle-online-sale-capture-canonical-webhook-uow.ts`
- Modify: `packages/db/src/adapters/messaging/drizzle-messaging-store.ts`
- Modify: `packages/domain/src/messaging/messaging-use-cases.ts`
- Modify: `packages/db/src/adapters/flows/drizzle-flow-booking-lifecycle-store.ts`
- Test: `packages/db/src/adapters/clients/drizzle-client-store.integration.ts`
- Test: `packages/db/src/adapters/finance/drizzle-online-sale-capture-canonical-webhook-uow.test.ts`
- Test: `packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts`
- Test: `packages/db/src/adapters/flows/drizzle-flow-booking-lifecycle-store.integration.ts`

**Interfaces:**
- Consumes Task 2 transactional adapter through an explicit Clients lifecycle source port.
- Produces: relationship creation → `new`; first captured client order → `active` plus `product_purchased`; first relationship-linked inbound message → `active` plus `first_inbound_message`; booking started → `in_service`; completed booking → `active`.

- [ ] **Step 1: Write source-boundary RED tests**

```ts
expect(await captureOrder(twiceSameWebhook)).toMatchObject({ replayed: true });
expect(await listFlowOutbox("product_purchased")).toHaveLength(1);
expect(await recordInboundMessage(secondMessage)).toMatchObject({ message: expect.anything() });
expect(await listFlowOutbox("first_inbound_message")).toHaveLength(1);
```

- [ ] **Step 2: Run source-boundary tests and verify RED**

Run: `pnpm test packages/db/src/adapters/clients/drizzle-client-store.integration.ts packages/db/src/adapters/finance/drizzle-online-sale-capture-canonical-webhook-uow.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts packages/db/src/adapters/flows/drizzle-flow-booking-lifecycle-store.integration.ts`

Expected: FAIL because source modules do not create the lifecycle/history/outbox intents.

- [ ] **Step 3: Wire source-derived intents in existing transactions**

```ts
await lifecycleSources.apply({
  relationshipId,
  cause: { kind: "inbound_message", sourceEventId: `message:${message.id}:received`, occurredAt: message.receivedAt },
  flowEvent: { eventKind: "first_inbound_message", subjectId: clientUserId, payload: { relationshipId, messageId: message.id } }
});
```

Only attach message start intent when the message is inbound, durably stored, linked to one active client relationship, and no earlier eligible inbound message exists for that relationship. Finance uses only a captured client order with an owner/client/product relationship. Booking lifecycle source IDs must be canonical lifecycle IDs, never request IDs.

- [ ] **Step 4: Run source-boundary tests and verify GREEN**

Run: `pnpm test packages/db/src/adapters/clients/drizzle-client-store.integration.ts packages/db/src/adapters/finance/drizzle-online-sale-capture-canonical-webhook-uow.test.ts packages/db/src/adapters/messaging/drizzle-messaging-store.test.ts packages/db/src/adapters/flows/drizzle-flow-booking-lifecycle-store.integration.ts`

Expected: PASS for first-only inbound semantics, captured-only purchase, atomic lifecycle transition, and replay safety.

### Task 4: Generalize Flow admission for the three new starts and policies

**Files:**
- Create: `packages/domain/src/flows/flow-event-enrollment.ts`
- Create: `packages/domain/src/flows/flow-event-enrollment.test.ts`
- Modify: `packages/domain/src/flows/flow-booking-enrollment.ts`
- Modify: `packages/domain/src/flows/flow-manual-client-enrollment.ts`
- Modify: `packages/domain/src/flows/flow-enrollment-control.ts`
- Modify: `packages/db/src/adapters/flows/drizzle-flow-booking-enrollment-store.ts`
- Modify: `packages/db/src/adapters/flows/drizzle-flow-booking-enrollment-store.integration.ts`
- Modify: `apps/workers/src/flows/flow-runtime.outbox-relay.ts`
- Modify: `apps/workers/src/flows/flow-runtime.outbox-relay.test.ts`
- Modify: `apps/workers/src/main.ts`

**Interfaces:**
- Consumes the durable event union and active activation epochs.
- Produces idempotent admissions with the persisted policy key, exact filters, effective-time check, and independent matching for every active Flow.

- [ ] **Step 1: Write RED tests for matching and repeat policies**

```ts
expect(planFlowEventEnrollment({ event: productPurchaseEvent(productId), candidate })).toMatchObject({ status: "matched" });
expect(planFlowEventEnrollment({ event: productPurchaseEvent(otherProductId), candidate })).toEqual({ status: "not_matched", reason: "product_filter" });
expect(await enroll({ event, policy: "once_per_client" })).toMatchObject({ status: "suppressed", reason: "client_already_enrolled" });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test packages/domain/src/flows/flow-event-enrollment.test.ts packages/domain/src/flows/flow-enrollment-control.test.ts packages/db/src/adapters/flows/drizzle-flow-booking-enrollment-store.integration.ts apps/workers/src/flows/flow-runtime.outbox-relay.test.ts`

Expected: FAIL because the dispatcher accepts only booking enrollment intents and only `once_per_occurrence` exists.

- [ ] **Step 3: Implement the generic event planner and DB admission predicates**

```ts
type FlowEnrollmentPolicyKey = "once_per_client" | "each_occurrence" | "after_previous_terminal";

function matchesLifecycleChange(config: LifecycleChangeConfig, payload: LifecycleChangePayload): boolean {
  return (config.fromStatus === null || config.fromStatus === payload.fromStatus) &&
    (config.toStatus === null || config.toStatus === payload.toStatus);
}
```

Use a unique source-event receipt for transport replay, a per-flow/client receipt for `once_per_client`, and a locked terminal-run check for `after_previous_terminal`. Preserve existing booking/manual receipt keys by adapting them through the shared planner instead of changing their historical identity.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm test packages/domain/src/flows/flow-event-enrollment.test.ts packages/domain/src/flows/flow-enrollment-control.test.ts packages/db/src/adapters/flows/drizzle-flow-booking-enrollment-store.integration.ts apps/workers/src/flows/flow-runtime.outbox-relay.test.ts`

Expected: PASS for filters, every-occurrence multi-flow enrollment, once-per-client suppression, previous-terminal gate, no retroactive activation, and redacted invalid-payload quarantine.

### Task 5: Expose lifecycle audit/override and configure the three starts in the astrologer product

**Files:**
- Modify: `packages/contracts/src/clients.ts`
- Modify: `apps/astrologer-api/src/modules/clients/clients.controller.ts`
- Modify: `apps/astrologer-api/src/modules/clients/clients.service.ts`
- Modify: `apps/astrologer-api/src/modules/clients/clients.module.ts`
- Test: `apps/astrologer-api/src/modules/clients/clients.service.test.ts`
- Test: `apps/astrologer-api/src/modules/clients/clients.e2e.test.ts`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx`
- Modify: `apps/astrologer-web/src/features/flows/model/flowDraftEditor.ts`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx`
- Create: `apps/astrologer-web/src/features/clients/model/clientLifecyclePresentation.ts`
- Create: `apps/astrologer-web/src/features/clients/model/clientLifecyclePresentation.test.ts`

**Interfaces:**
- Produces owner-scoped GET lifecycle history, POST manual status override, and POST return-to-automatic endpoints with CSRF/idempotency/audit middleware.
- Produces editor controls for product list, first inbound message, lifecycle from/to filters, and policy selection; no automatic product/channel preselection.

- [ ] **Step 1: Write API and editor RED tests**

```ts
await expect(service.overrideLifecycle({ clientUserId, status: "inactive", idempotencyKey })).resolves.toMatchObject({ mode: "manual_override" });
expect(renderInspector(lifecycleGraph()).getByLabelText("From status")).toBeVisible();
expect(renderInspector(productGraph()).getByText("Once per client")).toBeVisible();
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test apps/astrologer-api/src/modules/clients/clients.service.test.ts apps/astrologer-api/src/modules/clients/clients.e2e.test.ts apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx apps/astrologer-web/src/features/clients/model/clientLifecyclePresentation.test.ts`

Expected: FAIL because lifecycle API/controls are missing.

- [ ] **Step 3: Implement thin API composition and focused UI components**

```ts
@Post(":clientUserId/lifecycle/override")
override(@Param("clientUserId") clientUserId: string, @Body() body: OverrideClientLifecycleInput) {
  return this.clientsService.overrideLifecycle({ actor: this.actor(), clientUserId, ...body });
}
```

The service resolves owner relationship before calling Clients domain. The editor generates only valid trigger configuration and preserves draft validation errors. Follow exact Flows reference visual measurements; keep derived UI logic in feature model files.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm test apps/astrologer-api/src/modules/clients/clients.service.test.ts apps/astrologer-api/src/modules/clients/clients.e2e.test.ts apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx apps/astrologer-web/src/features/clients/model/clientLifecyclePresentation.test.ts`

Expected: PASS for owner isolation, replay-safe override/return-auto, and all valid start configuration states.

### Task 6: Add the inactive-client scheduler, verify the affected surface, and record evidence

**Files:**
- Create: `packages/domain/src/clients/client-lifecycle-inactivity.ts`
- Create: `packages/domain/src/clients/client-lifecycle-inactivity.test.ts`
- Create: `packages/db/src/adapters/clients/drizzle-client-lifecycle-inactivity-store.ts`
- Create: `packages/db/src/adapters/clients/drizzle-client-lifecycle-inactivity-store.integration.ts`
- Modify: `apps/workers/src/main.ts`
- Modify: `apps/workers/src/runtime-config.ts`
- Modify: `apps/workers/src/runtime-config.test.ts`
- Create: `apps/workers/src/clients/client-lifecycle-inactivity-worker.ts`
- Create: `apps/workers/src/clients/client-lifecycle-inactivity-worker.test.ts`
- Modify: `docs/api/api-boundaries.md`

**Interfaces:**
- Selects only automatic lifecycle records with DB-clock activity older than 90 days and emits one idempotent `inactive` transition per relationship.

- [ ] **Step 1: Write RED scheduler tests**

```ts
expect(selectInactiveCandidates({ now: "2026-08-13T00:00:00.000Z", lastActivityAt: "2026-05-15T00:00:00.000Z" })).toBe(true);
expect(selectInactiveCandidates({ now: "2026-08-13T00:00:00.000Z", lastActivityAt: "2026-05-16T00:00:00.000Z" })).toBe(false);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test packages/domain/src/clients/client-lifecycle-inactivity.test.ts packages/db/src/adapters/clients/drizzle-client-lifecycle-inactivity-store.integration.ts apps/workers/src/clients/client-lifecycle-inactivity-worker.test.ts apps/workers/src/runtime-config.test.ts`

Expected: FAIL because no scheduler or runtime configuration exists.

- [ ] **Step 3: Implement DB-clock batch claiming and worker registration**

```ts
await store.claimInactiveCandidates({ inactivityDays: 90, batchSize, claimFence });
```

Use locked SKIP LOCKED-style batch claiming, retry-safe receipts, bounded batch/interval config, and structured counters. The worker applies the normal Clients transition port so lifecycle history and Flow events remain atomic and identical to event-driven transitions.

- [ ] **Step 4: Run focused and affected-surface verification**

Run: `pnpm test packages/domain/src/clients/client-lifecycle*.test.ts packages/contracts/src/flows-v2.test.ts packages/domain/src/flows/flow-*.test.ts packages/db/src/adapters/clients/drizzle-client-*.integration.ts packages/db/src/adapters/flows/drizzle-flow-booking-enrollment-store.integration.ts apps/astrologer-api/src/modules/clients/clients*.test.ts apps/workers/src/clients/client-lifecycle-inactivity-worker.test.ts apps/workers/src/flows/flow-runtime.outbox-relay.test.ts`

Expected: PASS.

- [ ] **Step 5: Run repository gates and browser acceptance where services are available**

Run: `pnpm --filter @elevenhouse/contracts typecheck && pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/db typecheck && pnpm --filter @elevenhouse/astrologer-api typecheck && pnpm --filter @elevenhouse/workers typecheck && pnpm --filter @elevenhouse/astrologer-web typecheck && git diff --check`

Then run the authenticated browser scenario: create each start, validate/save/publish, create a source event after activation, confirm one run per chosen policy, and capture reference/production screenshots. Record unavailable services/authentication as blockers rather than substituting mocks.

## Plan Self-Review

- Spec coverage: Tasks 1–2 create fixed lifecycle and durable audit; Task 3 covers every agreed automatic source; Task 4 implements all checklist repeat policies and multi-flow/no-retro/dedupe semantics; Task 5 exposes required configuration and controlled manual override; Task 6 covers 90-day inactivity and end-to-end evidence.
- Intentional exclusions: the remaining eight product start types, generic conditions/actions, waits, AI generation, archive/delete/list search, and historic backfill stay outside this first slice.
- Type consistency: all producers publish the Task 1 discriminated event union; Task 4 alone decides enrollment, and Task 2 alone persists lifecycle source receipts/history.
- Placeholder scan: no unresolved implementation markers remain.
