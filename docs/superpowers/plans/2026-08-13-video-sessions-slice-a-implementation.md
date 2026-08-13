# Video Sessions Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Shared-main
> policy and the user's no-delegation instruction rule out subagent-driven
> execution for this run. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a real authenticated one-to-one LiveKit video consultation
with pre-join device checks, screen share, durable text chat, reconnect and
responsive web UI for the booking's astrologer and client, without recording.

**Architecture:** A provider-neutral Sessions domain consumes Booking lifecycle
events and persists Session/chat state in PostgreSQL. Astrologer and public API
modules authorize their own role and issue short-lived credentials through a
shared LiveKit server adapter. Both web apps use a shared headless browser-room
adapter and a controlled design-system call surface while keeping routes, HTTP
queries and composition app-owned.

**Tech Stack:** TypeScript 6, NestJS, React 19/Vite 8, Zod-compatible
`@elevenhouse/validation`, Drizzle/PostgreSQL, BullMQ workers, SSE,
`livekit-server-sdk@2.17.0`, `livekit-client@2.21.0`, Vitest, Chrome DevTools.

## Global Constraints

- Work in the existing shared checkout on `main`; do not create a branch,
  worktree or stash.
- Re-read each target and its current diff immediately before editing. Preserve
  all unowned changes, especially the current Products/AI/Finance/Flows work and
  the in-progress Drizzle journal tail.
- Do not stage or commit. The user authorized implementation, not a Git commit.
- Run GitNexus `impact` before changing every existing function, class or method;
  report direct callers, affected processes and risk before the edit. Run
  `detect_changes(base_ref: "main")` before any later authorized commit.
- Recording, consent, egress, transcript, AI summary, attachments and client
  chart sharing are forbidden in Slice A.
- Only a confirmed `video` booking's astrologer and client may start a Session.
  An already-active Session remains reconnectable after separate Booking
  completion.
- Join opens at `serviceStartAt - 10 minutes`. An unstarted Session expires at
  `serviceEndAt + 30 minutes`. An active Session ends after both participants
  are absent for 15 minutes or the astrologer ends it.
- All server time is UTC. UI formats the booking's IANA timezone.
- Session end never completes, cancels or marks no-show on Booking.
- Cookie mutations use existing CSRF metadata. Native bearer auth follows ADR
  0007 and never bypasses authorization merely because an Authorization header
  exists.
- LiveKit credentials are backend-only and short-lived. No token is written to
  URLs, logs, analytics or persistent browser storage.
- Provider I/O stays outside DB transactions. Ambiguous provider outcomes are
  typed and reconciled; never report fake success.
- Chat text is durable ElevenHouse state. It is text-only, max 4,000 Unicode
  code points, immutable, ordered by server sequence and idempotent by actor
  operation ID.
- Visible work requires real two-role Runtime E2E, accessibility and measured
  reference comparison. Missing authorized LiveKit credentials block only the
  provider canary, not narrower verified layers.

---

## Purpose / Big Picture

The astrologer opens `/calendar`, selects a confirmed video booking and sees
`Войти в сессию` when the server join policy allows it. The client sees the same
consultation under `/me`. Each role enters its protected
`/sessions/:sessionId` route, previews devices, joins one room, can communicate
and recover from a network interruption, and can review the durable chat after
the astrologer ends the call. The header says `Без записи`; no recording control
exists.

## Context and Orientation

- Approved design:
  `docs/superpowers/specs/2026-08-13-video-sessions-slice-a-design.md`.
- Booking model:
  `packages/domain/src/bookings/booking-types.ts` and
  `packages/domain/src/bookings/booking-lifecycle-events.ts`.
- Booking persistence:
  `packages/db/src/schema/scheduling/bookings.schema.ts`.
- Existing astrologer entry:
  `apps/astrologer-web/src/pages/calendar/components/BookingDetailPanel.tsx`.
- Existing client placeholder:
  `apps/client-web/src/pages/me/MePageView.tsx`.
- Existing durable SSE pattern:
  `apps/astrologer-api/src/modules/messaging/realtime-event-stream.ts`.
- Exact visual reference:
  `ElevenHouseDesign/app/session-call.jsx`.

## Interfaces and Dependencies

The plan locks these public names so later tasks do not invent parallel types:

```ts
export type SessionState = "scheduled" | "active" | "ended" | "cancelled" | "expired";
export type SessionParticipantRole = "astrologer" | "client";
export type SessionEndReason = "astrologer_ended" | "participants_absent";

export type SessionActor = {
  readonly userId: string;
  readonly role: SessionParticipantRole;
};

export type MediaRoomProviderPort = {
  createJoinCredential(input: MediaRoomJoinInput): Promise<MediaRoomJoinCredential>;
  removeParticipant(input: MediaRoomParticipantCommand): Promise<MediaRoomCommandResult>;
  endRoom(input: MediaRoomEndCommand): Promise<MediaRoomCommandResult>;
  parseWebhook(input: MediaRoomWebhookInput): Promise<MediaRoomEvent>;
  readiness(): Promise<{ readonly ready: boolean; readonly code: string }>;
};

export type SessionCommandStore = {
  issueJoin(input: IssueSessionJoinInput): Promise<IssueSessionJoinDecision>;
  recordMessage(input: RecordSessionMessageInput): Promise<RecordSessionMessageResult>;
  recordLeave(input: RecordSessionLeaveInput): Promise<RecordSessionLeaveResult>;
  prepareEnd(input: PrepareSessionEndInput): Promise<PrepareSessionEndResult>;
  completeEnd(input: CompleteSessionEndInput): Promise<CompleteSessionEndResult>;
  markEndOutcomeUnknown(input: MarkSessionEndOutcomeUnknownInput): Promise<void>;
  applyProviderEvent(input: ApplySessionProviderEventInput): Promise<ApplyProviderEventResult>;
};

export type SessionReadStore = {
  getForActor(input: GetSessionForActorInput): Promise<SessionProjection | null>;
  listForActor(input: ListSessionsForActorInput): Promise<readonly SessionSummary[]>;
  listMessages(input: ListSessionMessagesInput): Promise<SessionMessagePage>;
  listRealtimeEvents(input: ListSessionRealtimeEventsInput): Promise<SessionRealtimeEventPage>;
};
```

Detailed input/result unions live in Task 1 and are exported from
`@elevenhouse/domain/sessions`; every adapter must implement those types rather
than copying them.

## Progress

- [x] 2026-08-11: exact reference flow inspected and measured.
- [x] 2026-08-11: repository and provider research completed.
- [x] 2026-08-13: Slice A, no-recording boundary and LiveKit Cloud direction
  approved.
- [x] 2026-08-13: design spec written and self-reviewed.
- [ ] Implementation tasks below.

## Surprises & Discoveries

- The prototype screen-share control is a no-op, chat is local state, recording
  is enabled without a production consent lifecycle, and its narrow layout is
  unusable. These are reference gaps, not implementation shortcuts.
- The shared checkout currently contains unrelated uncommitted schema/journal
  work. The Sessions migration tag must be resolved from the current journal
  immediately before generation rather than assumed in advance.
- Current client `/me` has a consultations navigation item but only an empty
  placeholder, so the client entry requires a real read model, not only a call
  route.

## Decision Log

- 2026-08-13, user: Slice A excludes recording/transcription/AI.
- 2026-08-13, user: proceed without routine approval questions.
- 2026-08-13, architecture: LiveKit Cloud first behind provider-neutral ports.
- 2026-08-13, architecture: durable chat uses HTTP/Postgres/SSE, not LiveKit data
  messages as authority.
- 2026-08-13, architecture: inline execution; no subagents and no commits.

---

### Task 1: Session Contracts and Domain Rules

**Files:**

- Create: `packages/contracts/src/sessions.ts`
- Create: `packages/contracts/src/sessions.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/sessions/session-types.ts`
- Create: `packages/domain/src/sessions/session-errors.ts`
- Create: `packages/domain/src/sessions/session-join-policy.ts`
- Create: `packages/domain/src/sessions/session-join-policy.test.ts`
- Create: `packages/domain/src/sessions/session-use-cases.ts`
- Create: `packages/domain/src/sessions/session-use-cases.test.ts`
- Create: `packages/domain/src/sessions/session-ports.ts`
- Create: `packages/domain/src/sessions/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: Booking state/delivery/schedule types and canonical JSON hashing.
- Produces: the interfaces in `Interfaces and Dependencies`, plus Zod schemas
  `SessionResponseSchema`, `SessionListResponseSchema`,
  `SessionJoinCredentialResponseSchema`, `SessionMessagePageSchema`,
  `SessionRealtimeEventSchema`, `SendSessionMessageBodySchema`,
  `EndSessionBodySchema` and `LeaveSessionBodySchema`.

- [ ] **Step 1: Write failing contract tests**

```ts
it("rejects recording and provider authority from a Session response", () => {
  expect(() => SessionResponseSchema.parse({ ...validSession, recording: true })).toThrow();
  expect(() => SessionResponseSchema.parse({ ...validSession, providerRoomName: "room" })).toThrow();
});

it("requires strict idempotent text commands", () => {
  expect(SendSessionMessageBodySchema.parse({ operationId, text: "Привет" })).toEqual({
    operationId,
    text: "Привет"
  });
  expect(() => SendSessionMessageBodySchema.parse({ operationId, text: "x".repeat(4001) })).toThrow();
});
```

- [ ] **Step 2: Run the contract test and confirm red**

Run:

```bash
pnpm test packages/contracts/src/sessions.test.ts
```

Expected: FAIL because `sessions.ts` and its exports do not exist.

- [ ] **Step 3: Implement strict versioned contract schemas**

```ts
export const sessionStateSchema = z.enum([
  "scheduled", "active", "ended", "cancelled", "expired"
]);

export const sendSessionMessageBodySchema = z.object({
  operationId: z.string().uuid(),
  text: z.string().trim().min(1).refine((value) => Array.from(value).length <= 4000)
}).strict();
```

Use only safe Session/booking snapshots in responses. Keep provider credential
fields isolated to the join response.

- [ ] **Step 4: Write failing join-policy and lifecycle tests**

```ts
it("opens exactly ten minutes before start", () => {
  expect(evaluateSessionJoinPolicy(fixture({ now: "2026-08-13T09:49:59Z" }))).toMatchObject({
    kind: "too_early", joinableAt: "2026-08-13T09:50:00.000Z"
  });
  expect(evaluateSessionJoinPolicy(fixture({ now: "2026-08-13T09:50:00Z" }))).toEqual({
    kind: "allowed"
  });
});

it("allows active reconnect after separate booking completion", () => {
  expect(evaluateSessionJoinPolicy(fixture({ sessionState: "active", bookingState: "completed" })))
    .toEqual({ kind: "allowed" });
});
```

- [ ] **Step 5: Run domain tests and confirm red**

Run:

```bash
pnpm test packages/domain/src/sessions/session-join-policy.test.ts \
  packages/domain/src/sessions/session-use-cases.test.ts
```

Expected: FAIL because Session domain functions do not exist.

- [ ] **Step 6: Implement domain types, errors and pure decisions**

```ts
export function evaluateSessionJoinPolicy(input: SessionJoinPolicyInput): SessionJoinPolicyDecision;
export function issueSessionJoin(input: IssueSessionJoinUseCaseInput): Promise<IssueSessionJoinResult>;
export function sendSessionMessage(input: SendSessionMessageUseCaseInput): Promise<SessionMessage>;
export function endSession(input: EndSessionUseCaseInput): Promise<EndSessionResult>;
export function applySessionProviderEvent(
  input: ApplySessionProviderEventUseCaseInput
): Promise<ApplyProviderEventResult>;
```

Use Temporal/Instant comparisons, explicit error classes and exhaustive unions.
Do not import DB or LiveKit.

- [ ] **Step 7: Run targeted green and typechecks**

Run:

```bash
pnpm test packages/contracts/src/sessions.test.ts \
  packages/domain/src/sessions/session-join-policy.test.ts \
  packages/domain/src/sessions/session-use-cases.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
```

Expected: all PASS.

### Task 2: Session Schema, Atomic Stores and Forward Migration

**Files:**

- Create: `packages/db/src/schema/sessions/session-values.ts`
- Create: `packages/db/src/schema/sessions/sessions.schema.ts`
- Create: `packages/db/src/schema/sessions/session-participants.schema.ts`
- Create: `packages/db/src/schema/sessions/session-messages.schema.ts`
- Create: `packages/db/src/schema/sessions/session-provider-events.schema.ts`
- Create: `packages/db/src/schema/sessions/session-realtime-events.schema.ts`
- Create: `packages/db/src/schema/sessions/relations.schema.ts`
- Create: `packages/db/src/schema/sessions/index.ts`
- Create: `packages/db/src/schema/sessions/sessions.schema.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/adapters/sessions/drizzle-session-command-store.ts`
- Create: `packages/db/src/adapters/sessions/drizzle-session-command-store.integration.ts`
- Create: `packages/db/src/adapters/sessions/drizzle-session-read-store.ts`
- Create: `packages/db/src/adapters/sessions/drizzle-session-read-store.integration.ts`
- Create: `packages/db/src/adapters/sessions/index.ts`
- Modify: `packages/db/src/adapters/index.ts`
- Generate: one next journal-ordered SQL migration and snapshot under
  `packages/db/drizzle/` after the current shared journal tail.

**Interfaces:**

- Consumes: Task 1 ports/types and existing Scheduling composite ownership keys.
- Produces: `createDrizzleSessionCommandStore(db)` and
  `createDrizzleSessionReadStore(db)`.

- [ ] **Step 1: Refresh the shared migration tail and target diffs**

Run:

```bash
git status --short packages/db/drizzle packages/db/src/schema packages/db/src/adapters
git diff -- packages/db/drizzle/meta/_journal.json packages/db/src/schema/index.ts \
  packages/db/src/adapters/index.ts
tail -60 packages/db/drizzle/meta/_journal.json
```

Expected: identify the actual current tail and preserve all unowned 0044-or-later
artifacts. Stop only for a semantic Sessions collision.

- [ ] **Step 2: Write failing schema and store tests**

```ts
it("enforces one Session and two distinct participant roles per booking", () => {
  expect(getTableConfig(sessions).uniqueConstraints.map((item) => item.name))
    .toContain("sessions_booking_unique");
  expect(getTableConfig(sessionParticipants).uniqueConstraints.map((item) => item.name))
    .toContain("session_participants_session_role_unique");
});

it("replays the same actor message operation without a duplicate", async () => {
  const first = await store.recordMessage(command);
  const replay = await store.recordMessage(command);
  expect(replay).toEqual({ ...first, replayed: true });
  expect(await countMessages(sessionId)).toBe(1);
});
```

- [ ] **Step 3: Run tests and confirm red**

Run:

```bash
pnpm test packages/db/src/schema/sessions/sessions.schema.test.ts \
  packages/db/src/adapters/sessions/drizzle-session-command-store.integration.ts \
  packages/db/src/adapters/sessions/drizzle-session-read-store.integration.ts
```

Expected: FAIL because the Session schema/stores do not exist.

- [ ] **Step 4: Implement schema and atomic adapters**

```ts
export const sessions = pgTable("sessions", { /* exact design columns */ }, (table) => [
  unique("sessions_booking_unique").on(table.bookingId),
  unique("sessions_id_owner_client_unique").on(table.id, table.ownerUserId, table.clientUserId),
  check("sessions_state_check", sql`${table.state} in ('scheduled','active','ended','cancelled','expired')`)
]);

export function createDrizzleSessionCommandStore(database: Database): SessionCommandStore;
export function createDrizzleSessionReadStore(database: Database): SessionReadStore;
```

Implement CAS lifecycle updates, composite FKs, two-participant creation,
operation request hashes, per-Session message sequence under lock, provider event
dedupe and message+realtime-event atomicity.

- [ ] **Step 5: Generate exactly one forward migration**

Run:

```bash
pnpm db:generate
git status --short packages/db/drizzle
git diff -- packages/db/drizzle/meta/_journal.json
```

Expected: one new SQL file and one snapshot after the actual current tail; no
previous SQL/snapshot rewrite. Inspect SQL for all tables/FKs/checks/indexes and
the insert-select backfill of confirmed video bookings plus both participants.

- [ ] **Step 6: Run schema/store verification**

Run:

```bash
pnpm test packages/db/src/schema/sessions/sessions.schema.test.ts \
  packages/db/src/adapters/sessions/drizzle-session-command-store.integration.ts \
  packages/db/src/adapters/sessions/drizzle-session-read-store.integration.ts
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/db build
```

Expected: all PASS.

### Task 3: Booking Projection and Session Maintenance Workers

**Files:**

- Create: `packages/domain/src/sessions/session-provisioning.ts`
- Create: `packages/domain/src/sessions/session-provisioning.test.ts`
- Create: `packages/db/src/adapters/sessions/drizzle-session-provisioning-store.ts`
- Create: `packages/db/src/adapters/sessions/drizzle-session-provisioning-store.integration.ts`
- Create: `apps/workers/src/sessions/session-booking-lifecycle.processor.ts`
- Create: `apps/workers/src/sessions/session-booking-lifecycle.processor.test.ts`
- Create: `apps/workers/src/sessions/session-maintenance.ts`
- Create: `apps/workers/src/sessions/session-maintenance.test.ts`
- Modify: `apps/workers/src/runtime-config.ts`
- Modify: `apps/workers/src/runtime-config.test.ts`
- Modify: `apps/workers/src/main.ts`
- Modify: `apps/workers/package.json`

**Interfaces:**

- Consumes: `BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED`, lifecycle events and
  Task 2 store.
- Produces: `processSessionBookingLifecycleEvent(...)` and
  `runSessionMaintenance(...)`.

- [ ] **Step 1: Run GitNexus impact on existing worker integration points**

Use GitNexus `impact` for `createWorkersRuntimeConfig` and the worker `main.ts`
startup/shutdown functions, then report direct callers, processes and risk
before editing.

- [ ] **Step 2: Write failing projection and maintenance tests**

```ts
it("creates one scheduled Session for replayed confirmed video events", async () => {
  await processSessionBookingLifecycleEvent(input);
  await processSessionBookingLifecycleEvent(input);
  expect(await store.listByBooking(bookingId)).toHaveLength(1);
});

it("expires only never-started Sessions thirty minutes after schedule end", async () => {
  expect(await runSessionMaintenance({ now: new Date("2026-08-13T11:30:00Z"), store }))
    .toMatchObject({ expired: [sessionId] });
});
```

- [ ] **Step 3: Run tests and confirm red**

Run:

```bash
pnpm test packages/domain/src/sessions/session-provisioning.test.ts \
  packages/db/src/adapters/sessions/drizzle-session-provisioning-store.integration.ts \
  apps/workers/src/sessions
```

Expected: FAIL because provisioning and maintenance do not exist.

- [ ] **Step 4: Implement idempotent projection and leases**

```ts
export async function processSessionBookingLifecycleEvent(
  input: SessionBookingLifecycleProcessingInput
): Promise<SessionBookingLifecycleProcessingResult>;

export async function runSessionMaintenance(input: {
  readonly store: SessionMaintenanceStore;
  readonly now: Date;
  readonly batchSize: number;
  readonly leaseOwner: string;
}): Promise<SessionMaintenanceResult>;
```

Use the existing outbox/worker claiming pattern. Handle confirmed, rescheduled
and cancelled; ignore completed. Use fenced leases and CAS for expiry and
participants-absent finalization.

- [ ] **Step 5: Wire runtime config and graceful shutdown**

Add explicit poll interval, batch size, lease duration and enabled flag. Ensure
worker readiness reflects a failed Session loop without hiding other worker
health.

- [ ] **Step 6: Run targeted worker verification**

Run:

```bash
pnpm test packages/domain/src/sessions/session-provisioning.test.ts \
  packages/db/src/adapters/sessions/drizzle-session-provisioning-store.integration.ts \
  apps/workers/src/sessions apps/workers/src/runtime-config.test.ts
pnpm --filter @elevenhouse/workers typecheck
pnpm --filter @elevenhouse/workers build
```

Expected: all PASS.

### Task 4: LiveKit Server Adapter and Runtime Configuration

**Files:**

- Create: `packages/session-infrastructure/package.json`
- Create: `packages/session-infrastructure/tsconfig.json`
- Create: `packages/session-infrastructure/tsconfig.build.json`
- Create: `packages/session-infrastructure/src/livekit-media-room-provider.ts`
- Create: `packages/session-infrastructure/src/livekit-media-room-provider.test.ts`
- Create: `packages/session-infrastructure/src/index.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/astrologer-api/package.json`
- Modify: `apps/public-api/package.json`
- Modify: `apps/astrologer-api/src/config/runtime-config.ts`
- Modify: `apps/astrologer-api/src/config/runtime-config.test.ts`
- Modify: `apps/public-api/src/config/runtime-config.ts`
- Modify: `apps/public-api/src/config/runtime-config.test.ts`

**Interfaces:**

- Consumes: `MediaRoomProviderPort` from Task 1.
- Produces: `LiveKitMediaRoomProvider` and strict `LiveKitProviderOptions`.

- [ ] **Step 1: Run GitNexus impact for both runtime-config factories**

Report direct callers/processes and risk before editing
`createAstrologerApiRuntimeConfig` and `createPublicApiRuntimeConfig`.

- [ ] **Step 2: Write failing adapter/config tests**

```ts
it("mints a five-minute room-scoped least-privilege token", async () => {
  const credential = await provider.createJoinCredential(joinInput);
  const claims = await decodeForTest(credential.participantToken);
  expect(claims.video).toEqual({ room: opaqueRoom, roomJoin: true, canPublish: true,
    canSubscribe: true, canPublishData: false });
  expect(claims.exp - claims.nbf).toBe(300);
});

it("rejects partial enabled configuration without echoing secrets", () => {
  expect(() => createPublicApiRuntimeConfig(envWithOnlyLiveKitKey)).toThrowError(
    /LiveKit configuration is incomplete/
  );
});
```

- [ ] **Step 3: Install exact dependencies and confirm red**

Run:

```bash
pnpm --filter @elevenhouse/session-infrastructure add livekit-server-sdk@2.17.0
pnpm test packages/session-infrastructure/src/livekit-media-room-provider.test.ts \
  apps/astrologer-api/src/config/runtime-config.test.ts \
  apps/public-api/src/config/runtime-config.test.ts
```

Expected: tests fail until adapter/config behavior is implemented.

- [ ] **Step 4: Implement adapter with injected clock/client seams**

```ts
export type LiveKitProviderOptions = {
  readonly serverUrl: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly roomPrefix: string;
  readonly joinTokenTtlSeconds: 300;
};

export class LiveKitMediaRoomProvider implements MediaRoomProviderPort {
  constructor(options: LiveKitProviderOptions, dependencies?: LiveKitDependencies);
}
```

Use official `AccessToken`, `RoomServiceClient` and `WebhookReceiver`. Map
provider errors to domain-safe unavailable/outcome-unknown errors. Never log the
token or config values.

- [ ] **Step 5: Run package/config verification**

Run:

```bash
pnpm test packages/session-infrastructure/src/livekit-media-room-provider.test.ts \
  apps/astrologer-api/src/config/runtime-config.test.ts \
  apps/public-api/src/config/runtime-config.test.ts
pnpm --filter @elevenhouse/session-infrastructure typecheck
pnpm --filter @elevenhouse/session-infrastructure build
```

Expected: all PASS.

### Task 5: Astrologer Sessions API and Provider Webhook

**Files:**

- Create: `apps/astrologer-api/src/modules/sessions/sessions.tokens.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions-http-errors.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions.service.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions.service.test.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions.controller.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions-events.controller.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions-webhook.controller.ts`
- Create: `apps/astrologer-api/src/modules/sessions/session-realtime-event-stream.ts`
- Create: `apps/astrologer-api/src/modules/sessions/session-realtime-event-stream.test.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions.e2e.test.ts`
- Create: `apps/astrologer-api/src/modules/sessions/sessions.module.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

**Interfaces:**

- Consumes: Tasks 1, 2 and 4.
- Produces: authenticated astrologer routes and the single LiveKit webhook
  ingress.

- [ ] **Step 1: Run GitNexus impact for `AppModule` and security decorators**

Report callers, affected process and risk before modifying root composition.

- [ ] **Step 2: Write failing service/e2e/security tests**

```ts
it("returns not found for an unrelated astrologer without leaking existence", async () => {
  await request(app).get(`/sessions/${sessionId}`).set(ownerCookie(otherOwner)).expect(404);
});

it("requires CSRF for end and rejects client role", async () => {
  await request(app).post(`/sessions/${sessionId}/end`).send({ operationId }).expect(403);
});

it("deduplicates a replayed signed LiveKit webhook", async () => {
  await postSignedWebhook(event).expect(204);
  await postSignedWebhook(event).expect(204);
  expect(await providerEventCount(event.id)).toBe(1);
});
```

- [ ] **Step 3: Run tests and confirm red**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/sessions
```

Expected: FAIL because Sessions module/routes do not exist.

- [ ] **Step 4: Implement thin controllers and service composition**

```ts
@Controller("sessions")
export class SessionsController {
  @Get() list(...): Promise<SessionListResponse>;
  @Get(":sessionId") get(...): Promise<SessionResponse>;
  @Post(":sessionId/join-credentials") @RequireCsrf() join(...): Promise<SessionJoinCredentialResponse>;
  @Post(":sessionId/messages") @RequireCsrf() message(...): Promise<SessionMessageResponse>;
  @Post(":sessionId/leave") @RequireCsrf() leave(...): Promise<SessionResponse>;
  @Post(":sessionId/end") @RequireCsrf() end(...): Promise<SessionResponse>;
}
```

Use the existing session auth actor; derive `role="astrologer"`. Parse every
body/response with shared schemas. Keep webhook provider parsing in the service,
not controller.

- [ ] **Step 5: Implement bounded authenticated SSE**

Reuse the proven poll/heartbeat structure but scope every read by Session and
actor. Parse `Last-Event-ID` as PostgreSQL int8 and close on authorization or
terminal retention failure.

- [ ] **Step 6: Run API verification**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/sessions
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-api build
```

Expected: all PASS.

### Task 6: Client Sessions API

**Files:**

- Create: `apps/public-api/src/modules/sessions/sessions.tokens.ts`
- Create: `apps/public-api/src/modules/sessions/sessions-http-errors.ts`
- Create: `apps/public-api/src/modules/sessions/sessions.service.ts`
- Create: `apps/public-api/src/modules/sessions/sessions.service.test.ts`
- Create: `apps/public-api/src/modules/sessions/sessions.controller.ts`
- Create: `apps/public-api/src/modules/sessions/sessions-events.controller.ts`
- Create: `apps/public-api/src/modules/sessions/session-realtime-event-stream.ts`
- Create: `apps/public-api/src/modules/sessions/session-realtime-event-stream.test.ts`
- Create: `apps/public-api/src/modules/sessions/sessions.e2e.test.ts`
- Create: `apps/public-api/src/modules/sessions/sessions.module.ts`
- Modify: `apps/public-api/src/app.module.ts`

**Interfaces:**

- Consumes: same contracts/stores/provider as Task 5.
- Produces: client-authorized list/read/join/message/leave/SSE routes; no client
  end-for-everyone route capability.

- [ ] **Step 1: Run GitNexus impact for public `AppModule` and client auth actor**

Report direct callers, affected process and risk.

- [ ] **Step 2: Write failing client boundary tests**

```ts
it("lists only Sessions whose booking client matches the account", async () => {
  const body = await request(app).get("/sessions").set(clientCookie).expect(200);
  expect(body.body.sessions.map((item: { id: string }) => item.id)).toEqual([ownSessionId]);
});

it("does not expose an end-for-everyone command to the client", async () => {
  await request(app).post(`/sessions/${sessionId}/end`).set(clientCookie).expect(404);
});
```

- [ ] **Step 3: Run tests and confirm red**

Run: `pnpm test apps/public-api/src/modules/sessions`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement client module with shared domain behavior**

Derive `role="client"`, scope reads to `clientUserId`, preserve not-found
privacy and expose no webhook or end-for-everyone route. Use the same strict
responses and CSRF/native bearer policy.

- [ ] **Step 5: Run API verification**

Run:

```bash
pnpm test apps/public-api/src/modules/sessions
pnpm --filter @elevenhouse/public-api typecheck
pnpm --filter @elevenhouse/public-api build
```

Expected: all PASS.

### Task 7: Shared Browser Room Adapter

**Files:**

- Create: `packages/session-web-client/package.json`
- Create: `packages/session-web-client/tsconfig.json`
- Create: `packages/session-web-client/tsconfig.build.json`
- Create: `packages/session-web-client/src/session-room-client.ts`
- Create: `packages/session-web-client/src/session-room-client.test.ts`
- Create: `packages/session-web-client/src/session-room-state.ts`
- Create: `packages/session-web-client/src/session-device-controller.ts`
- Create: `packages/session-web-client/src/session-device-controller.test.ts`
- Create: `packages/session-web-client/src/livekit-session-room-adapter.ts`
- Create: `packages/session-web-client/src/livekit-session-room-adapter.test.ts`
- Create: `packages/session-web-client/src/index.ts`
- Modify: `apps/astrologer-web/package.json`
- Modify: `apps/client-web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `SessionJoinCredentialResponse`.
- Produces: `SessionRoomClient`, `SessionRoomSnapshot` and
  `createLiveKitSessionRoomClient()`.

- [ ] **Step 1: Write failing state/device/adapter tests**

```ts
it("maps provider reconnect events to stable ElevenHouse state", async () => {
  provider.emit("reconnecting");
  expect(client.getSnapshot().connection).toBe("reconnecting");
  provider.emit("reconnected");
  expect(client.getSnapshot().connection).toBe("connected");
});

it("starts display capture only from the explicit command", async () => {
  expect(displayMedia).not.toHaveBeenCalled();
  await client.startScreenShare();
  expect(displayMedia).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Install exact browser dependency and confirm red**

Run:

```bash
pnpm --filter @elevenhouse/session-web-client add livekit-client@2.21.0
pnpm test packages/session-web-client/src
```

Expected: FAIL until the adapter is implemented.

- [ ] **Step 3: Implement the provider-neutral observable controller**

```ts
export type SessionRoomSnapshot = {
  readonly connection: "idle" | "connecting" | "waiting" | "connected" |
    "reconnecting" | "ended" | "failed";
  readonly local: SessionMediaParticipantSnapshot;
  readonly remote: SessionMediaParticipantSnapshot | null;
  readonly connectionQuality: "unknown" | "excellent" | "good" | "poor" | "lost";
  readonly devices: readonly SessionMediaDevice[];
  readonly screenShare: "unsupported" | "inactive" | "starting" | "active" | "failed";
  readonly error: SessionRoomSafeError | null;
};

export type SessionRoomClient = {
  getSnapshot(): SessionRoomSnapshot;
  subscribe(listener: () => void): () => void;
  prepareDevices(): Promise<void>;
  connect(credential: SessionJoinCredentialResponse): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  selectDevice(kind: MediaDeviceKind, deviceId: string): Promise<void>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
};
```

Centralize event cleanup, track attachment, permission error mapping and no
storage of credentials.

- [ ] **Step 4: Run package verification**

Run:

```bash
pnpm test packages/session-web-client/src
pnpm --filter @elevenhouse/session-web-client typecheck
pnpm --filter @elevenhouse/session-web-client build
```

Expected: all PASS.

### Task 8: Reusable Controlled Call Surface

**Files:**

- Create: `packages/design-system/src/components/SessionCallSurface/SessionCallSurface.tsx`
- Create: `packages/design-system/src/components/SessionCallSurface/SessionCallSurface.css`
- Create: `packages/design-system/src/components/SessionCallSurface/SessionCallSurface.test.tsx`
- Create: `packages/design-system/src/components/SessionCallSurface/types.ts`
- Create: `packages/design-system/src/components/SessionCallSurface/index.ts`
- Modify: `packages/design-system/src/components/index.ts`
- Modify: `packages/design-system/src/index.test.ts`

**Interfaces:**

- Consumes: controlled view props only; no HTTP, LiveKit, Booking or auth types.
- Produces: `SessionCallSurface`, `SessionPrejoinSurface`,
  `SessionChatPanel` and `SessionEndConfirmation`.

- [ ] **Step 1: Write failing semantic and state tests**

```tsx
it("renders no recording action and identifies the call as unrecorded", () => {
  const view = renderToStaticMarkup(<SessionCallSurface {...props} />);
  expect(view).toContain("Без записи");
  expect(view).not.toContain("Запись");
  expect(view).not.toContain("recording");
});

it("uses an accessible confirmation dialog for astrologer end", () => {
  const view = renderToStaticMarkup(<SessionEndConfirmation open {...dialogProps} />);
  expect(view).toContain('role="dialog"');
  expect(view).toContain('aria-modal="true"');
});
```

- [ ] **Step 2: Run tests and confirm red**

Run:

```bash
pnpm test packages/design-system/src/components/SessionCallSurface \
  packages/design-system/src/index.test.ts
```

Expected: FAIL because components/exports do not exist.

- [ ] **Step 3: Implement focused controlled components and responsive CSS**

```ts
export type SessionCallSurfaceProps = {
  readonly copy: SessionCallSurfaceCopy;
  readonly state: SessionCallSurfaceState;
  readonly localVideoRef: RefCallback<HTMLVideoElement>;
  readonly remoteVideoRef: RefCallback<HTMLVideoElement>;
  readonly controls: SessionCallControlState;
  readonly chat: SessionChatPanelProps;
  readonly onToggleMicrophone: () => void;
  readonly onToggleCamera: () => void;
  readonly onToggleScreenShare: () => void;
  readonly onLeave: () => void;
  readonly onRequestEnd: () => void;
};
```

Match the measured reference geometry/tokens at desktop. Implement mobile chat
as a focus-managed bottom sheet, 44px touch targets, visible focus, reduced
motion and no fixed 200px/300px squeezed columns. Surface the controlled
connection-quality warning without exposing provider-specific names.

- [ ] **Step 4: Run design-system verification**

Run:

```bash
pnpm test packages/design-system/src/components/SessionCallSurface \
  packages/design-system/src/index.test.ts
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
```

Expected: all PASS.

### Task 9: Astrologer Calendar Entry and Session Route

**Files:**

- Create: `apps/astrologer-web/src/features/sessions/api/sessionsApi.ts`
- Create: `apps/astrologer-web/src/features/sessions/api/sessionsApi.test.ts`
- Create: `apps/astrologer-web/src/features/sessions/model/sessionQueryOptions.ts`
- Create: `apps/astrologer-web/src/features/sessions/model/useSessionPageController.ts`
- Create: `apps/astrologer-web/src/features/sessions/model/useSessionPageController.test.ts`
- Create: `apps/astrologer-web/src/features/sessions/realtime/sessionRealtimeClient.ts`
- Create: `apps/astrologer-web/src/features/sessions/realtime/sessionRealtimeClient.test.ts`
- Create: `apps/astrologer-web/src/pages/session/SessionPage.tsx`
- Create: `apps/astrologer-web/src/pages/session/SessionPage.test.tsx`
- Create: `apps/astrologer-web/src/pages/session/SessionPageView.tsx`
- Create: `apps/astrologer-web/src/pages/session/SessionPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/calendar/components/BookingDetailPanel.tsx`
- Modify: `apps/astrologer-web/src/pages/calendar/components/BookingDetailPanel.test.tsx`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts`
- Modify: `apps/astrologer-web/src/router.contract.ts`
- Modify: `apps/astrologer-web/src/router.tsx`
- Modify: `apps/astrologer-web/src/router.test.tsx`

**Interfaces:**

- Consumes: Tasks 1, 7 and 8 plus existing app HTTP/React Query/auth.
- Produces: astrologer calendar join action and protected Session route.

- [ ] **Step 1: Run GitNexus impact before editing existing symbols**

Run impact for `BookingDetailPanel`, `astrologerRouteContract`, router creation
and `AstrologerCopy`. Report direct callers/processes and risk.

- [ ] **Step 2: Write failing API/controller/router/calendar tests**

```tsx
it("shows the enabled join action only for a joinable confirmed video Session", () => {
  const view = renderPanel({ session: joinableSession });
  expect(view).toContain("Войти в сессию");
  expect(view).toContain(`/sessions/${sessionId}`);
});

it("never renders recording controls", () => {
  expect(renderSessionPage(connectedState)).toContain("Без записи");
  expect(renderSessionPage(connectedState)).not.toContain("Начать запись");
});
```

- [ ] **Step 3: Run tests and confirm red**

Run:

```bash
pnpm test apps/astrologer-web/src/features/sessions \
  apps/astrologer-web/src/pages/session \
  apps/astrologer-web/src/pages/calendar/components/BookingDetailPanel.test.tsx \
  apps/astrologer-web/src/router.test.tsx
```

Expected: FAIL for missing Session feature/route/action.

- [ ] **Step 4: Implement API parsing, controller and route composition**

The controller fetches the safe Session projection, explicitly requests device
permission, requests join credentials only on Join, owns the room client
lifecycle, merges durable message/SSE state and sends operation-ID commands.
`SessionPageView` stays controlled and delegates visuals to Task 8.

- [ ] **Step 5: Add exact RU/EN state copy**

Cover early, preparing, prejoin, permission, waiting, connected, reconnecting,
participant-left, provider unavailable, terminal, message retry and end
confirmation. Do not add recording or attachment copy.

- [ ] **Step 6: Run astrologer frontend verification**

Run:

```bash
pnpm test apps/astrologer-web/src/features/sessions \
  apps/astrologer-web/src/pages/session \
  apps/astrologer-web/src/pages/calendar/components/BookingDetailPanel.test.tsx \
  apps/astrologer-web/src/router.test.tsx \
  apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all PASS.

### Task 10: Client Consultation List and Session Route

**Files:**

- Create: `apps/client-web/src/features/sessions/api/sessionsApi.ts`
- Create: `apps/client-web/src/features/sessions/api/sessionsApi.test.ts`
- Create: `apps/client-web/src/features/sessions/model/sessionQueryOptions.ts`
- Create: `apps/client-web/src/features/sessions/model/useSessionPageController.ts`
- Create: `apps/client-web/src/features/sessions/model/useSessionPageController.test.ts`
- Create: `apps/client-web/src/features/sessions/realtime/sessionRealtimeClient.ts`
- Create: `apps/client-web/src/features/sessions/realtime/sessionRealtimeClient.test.ts`
- Create: `apps/client-web/src/features/sessions/components/ClientSessionsSection.tsx`
- Create: `apps/client-web/src/features/sessions/components/ClientSessionsSection.test.tsx`
- Create: `apps/client-web/src/pages/session/SessionPage.tsx`
- Create: `apps/client-web/src/pages/session/SessionPage.test.tsx`
- Create: `apps/client-web/src/pages/session/SessionPageView.tsx`
- Create: `apps/client-web/src/pages/session/SessionPageView.test.tsx`
- Modify: `apps/client-web/src/pages/me/MePageView.tsx`
- Modify: `apps/client-web/src/pages/me/MePageView.test.tsx`
- Modify: `apps/client-web/src/common/i18n/clientCopy.ts`
- Modify: `apps/client-web/src/common/i18n/clientCopy.test.ts`
- Modify: `apps/client-web/src/router.contract.ts`
- Modify: `apps/client-web/src/router.tsx`
- Modify: `apps/client-web/src/router.test.tsx`

**Interfaces:**

- Consumes: Tasks 1, 7 and 8.
- Produces: client sessions list and protected call route without
  end-for-everyone control.

- [ ] **Step 1: Run GitNexus impact on client targets**

Run impact for `MePageView`, `clientRouteContract`, router creation and
`clientCopy`. Report direct callers/processes and risk.

- [ ] **Step 2: Write failing list/route/role tests**

```tsx
it("groups active, upcoming and recent consultations without discovery", () => {
  const view = renderSessionsSection(sessionList);
  expect(view).toContain("Сейчас");
  expect(view).toContain("Предстоящие");
  expect(view).not.toContain("Найти астролога");
});

it("client leave does not render an end-for-everyone action", () => {
  const view = renderClientSession(connectedState);
  expect(view).toContain("Выйти");
  expect(view).not.toContain("Завершить для всех");
});
```

- [ ] **Step 3: Run tests and confirm red**

Run:

```bash
pnpm test apps/client-web/src/features/sessions apps/client-web/src/pages/session \
  apps/client-web/src/pages/me/MePageView.test.tsx apps/client-web/src/router.test.tsx
```

Expected: FAIL for missing Session UI and real list.

- [ ] **Step 4: Implement validated list, route and controlled call composition**

Reuse the safe contract and headless room adapter, but keep client HTTP/auth and
route composition app-owned. Terminal Sessions open read-only chat. Do not expose
other astrologers or a provider room identifier.

- [ ] **Step 5: Run client frontend verification**

Run:

```bash
pnpm test apps/client-web/src/features/sessions apps/client-web/src/pages/session \
  apps/client-web/src/pages/me/MePageView.test.tsx apps/client-web/src/router.test.tsx \
  apps/client-web/src/common/i18n/clientCopy.test.ts
pnpm --filter @elevenhouse/client-web typecheck
pnpm --filter @elevenhouse/client-web build
```

Expected: all PASS.

### Task 11: Capability Docs, Local Integration and Full Acceptance

**Files:**

- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/api/route-inventory.md` through its generator
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/design-surfaces/astrologer.md`
- Modify: `docs/architecture/design-surfaces/client.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/architecture/media-storage.md` only to keep recording/media
  gaps explicit; do not claim media support.
- Modify: `packages/domain/src/platform-billing/platform-capability-manifest-registry.ts`
- Modify: its focused tests/fixtures so `video` reflects implemented capability
  while `recordings` remains absent.
- Modify: local runtime/deployment config examples only where required by the
  existing canonical deployment docs.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: current architecture truth, capability truth and acceptance evidence.

- [ ] **Step 1: Run GitNexus impact on capability registry and report risk**

Identify all tariff/publication consumers before changing `video` capability.
Recording capability must remain absent.

- [ ] **Step 2: Write failing capability and documentation tests**

```ts
it("reports video implemented while recordings remain absent", () => {
  expect(manifest.features.video.status).toBe("implemented");
  expect(manifest.features.recordings.status).toBe("absent");
});
```

Run generators/tests and confirm they fail against stale current docs.

- [ ] **Step 3: Update canonical docs and generated route inventory**

Record exact routes, ownership, provider-neutral boundary, security model,
current responsive surface and all deferred recording/media work. Do not copy
the task spec into canonical docs.

- [ ] **Step 4: Recheck exact local DB target and run full reset**

Follow `docs/development/commands.md` to prove localhost/container/database
identity, then run:

```bash
pnpm db:reset
```

Expected: every committed migration including Sessions applies to the disposable
local ElevenHouse DB and seed completes.

- [ ] **Step 5: Run affected-surface automated verification**

```bash
pnpm test packages/contracts/src/sessions.test.ts packages/domain/src/sessions \
  packages/db/src/schema/sessions packages/db/src/adapters/sessions \
  packages/session-infrastructure/src packages/session-web-client/src \
  apps/astrologer-api/src/modules/sessions apps/public-api/src/modules/sessions \
  apps/workers/src/sessions packages/design-system/src/components/SessionCallSurface \
  apps/astrologer-web/src/features/sessions apps/astrologer-web/src/pages/session \
  apps/client-web/src/features/sessions apps/client-web/src/pages/session
pnpm verify
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Expected: all PASS. If `pnpm verify` fails solely in a named unowned dirty path,
preserve it, run every owned package gate and report the exact residual blocker.

- [ ] **Step 6: Provision or obtain authorized LiveKit Cloud configuration**

This is the only expected external-authority gate. Do not create an external
account/project, mutate DNS/webhooks or disclose secrets without direct user
authority. Once authorized, configure the project URL, key, secret and signed
webhook target through the existing secret/deployment mechanism.

- [ ] **Step 7: Run real two-role Runtime E2E**

Use existing local-process authority and two authenticated browser roles. Follow
the 14-step scenario in the design spec, including real camera/microphone,
screen share, bidirectional chat, reload, network interruption, client leave,
astrologer end and Booking-state re-read. Inspect network, console, application
logs and safe DB projections.

- [ ] **Step 8: Run accessibility and exact visual comparison**

At matching desktop and mobile viewports, capture reference and production
artifacts outside the repository. Measure stage/chat/control geometry,
typography, colors, borders, radii, shadows, z-index and overflow. Exercise
keyboard/focus, dialog/sheet containment, visible focus, live status and touch
targets. Fix differences and repeat until accepted or externally blocked.

- [ ] **Step 9: Final full-diff and shared-main review**

```bash
git branch --show-current
git status --short
git diff --cached --name-status
git diff --check
```

Re-read the full owned diff for security, idempotency, provider ambiguity,
recording leakage, oversized components, stale docs and accidental unowned
changes. Run GitNexus `detect_changes(base_ref: "main")` for review evidence,
even though no commit is authorized.

## Validation and Acceptance

Acceptance is the union of Task 11 automated, integration, Runtime E2E,
accessibility and visual evidence. A green unit suite does not prove a real call.
If LiveKit credentials or browser devices are unavailable, report the provider
canary/visual state as blocked and do not call Slice A complete.

## Idempotence and Recovery

- Booking event replay cannot create a second Session.
- Message/end/leave operation replay returns the prior result; a changed request
  under the same operation ID fails.
- Provider webhook replay is a no-op after digest verification.
- Provider outcome unknown stays inspectable and is reconciled from webhooks or
  room state.
- Worker leases and CAS prevent duplicate expiry/end transitions.
- Migration is forward-only; local reset is allowed only after exact local
  target proof.
- Capability rollback disables new credentials but preserves read-only history.

## Artifacts and Notes

- Do not store screenshots, browser logs, PID files or mutable QA evidence in
  the repository.
- Record temporary artifact paths and exact runtime states in the final evidence
  report.
- Keep this plan's Progress, Surprises, Decision Log and Outcomes current during
  execution.

## Outcomes & Retrospective

Not started. On completion, record implemented behavior, fresh commands, real
provider/browser evidence, deferred Slice B/C work, blockers, residual risks and
unowned changes that were observed but not touched.
