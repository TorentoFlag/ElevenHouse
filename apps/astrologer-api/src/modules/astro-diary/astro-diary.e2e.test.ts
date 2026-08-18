import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type {
  AstroDiaryCommandStableResult,
  AstroDiaryCommandUnitOfWork,
  AstroDiaryJournalReader
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SystemClock } from "../clock/system-clock.service";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { AstroDiaryController } from "./astro-diary.controller";
import { AstroDiaryService } from "./astro-diary.service";
import { ASTRO_DIARY_COMMAND_UNIT_OF_WORK, ASTRO_DIARY_JOURNAL_READER } from "./astro-diary.tokens";

const astrologerUserId = "10000000-0000-4000-8000-000000000001";
const foreignAstrologerUserId = "10000000-0000-4000-8000-000000000002";
const clientUserId = "10000000-0000-4000-8000-000000000003";
const journalId = "10000000-0000-4000-8000-000000000004";
const relationshipId = "10000000-0000-4000-8000-000000000005";
const journalEpochId = "10000000-0000-4000-8000-000000000006";
const subscriptionId = "10000000-0000-4000-8000-000000000007";
const periodId = "10000000-0000-4000-8000-000000000008";
const cycleId = "10000000-0000-4000-8000-000000000009";
const obligationId = "10000000-0000-4000-8000-000000000010";
const draftId = "10000000-0000-4000-8000-000000000011";
const eventId = "10000000-0000-4000-8000-000000000012";
const laterCycleId = "10000000-0000-4000-8000-000000000013";
const laterObligationId = "10000000-0000-4000-8000-000000000014";
const clientDraftId = "10000000-0000-4000-8000-000000000015";
const clientPendingMediaId = "10000000-0000-4000-8000-000000000016";

describe("astrologer AstroDiary module wiring", () => {
  it("resolves the service through Nest dependency injection", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AstroDiaryService,
        { provide: ASTRO_DIARY_JOURNAL_READER, useValue: createReader({ ended: false, laterCycle: false }) },
        { provide: ASTRO_DIARY_COMMAND_UNIT_OF_WORK, useValue: new ReplayCommandUnitOfWork() },
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-18T10:00:00.000Z") } }
      ]
    }).compile();

    expect(moduleRef.get(AstroDiaryService)).toBeInstanceOf(AstroDiaryService);
    await moduleRef.close();
  });
});

describe("astrologer AstroDiary HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let commandUnitOfWork: ReplayCommandUnitOfWork;
  let readerState: { ended: boolean; laterCycle: boolean };

  beforeEach(async () => {
    commandUnitOfWork = new ReplayCommandUnitOfWork();
    readerState = { ended: false, laterCycle: false };
    const service = new AstroDiaryService(createReader(readerState), commandUnitOfWork, {
      now: () => new Date("2026-08-18T10:00:00.000Z")
    });
    const builder = Test.createTestingModule({
      controllers: [AstroDiaryController],
      providers: [
        { provide: AstroDiaryService, useValue: service },
        { provide: Reflector, useValue: new Reflector() },
        { provide: ConfigService, useValue: { getOrThrow: () => "astrologer_session" } },
        { provide: AstrologerCsrfTokenService, useValue: { assertValidRequest: () => undefined } },
        CsrfGuard,
        IdempotencyGuard
      ]
    });
    builder.overrideGuard(AstrologerSessionAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
        const request = context.switchToHttp().getRequest();
        const role = String((request.headers as Record<string, string>)["x-test-role"] ?? "");
        request.currentAstrologerAccount = {
          account: {
            id: role === "foreign-astrologer" ? foreignAstrologerUserId : astrologerUserId,
            status: "active",
            roles: role === "astrologer" || role === "foreign-astrologer" ? ["astrologer"] : []
          }
        };
        if ((request.headers as Record<string, string>)["x-test-mobile"] !== "0") {
          request.currentMobileSessionId = "test-mobile-session";
        }
        return true;
      }
    });
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("conceals foreign journal detail and rejects client role crossover", async () => {
    const foreign = await request(`/astro-diary/journals/${journalId}`, {
      role: "foreign-astrologer"
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "astro_diary_not_found" });

    const crossover = await request("/astro-diary/journals", { role: "client" });
    expect(crossover.status).toBe(403);
    expect(crossover.body).toMatchObject({ code: "astrologer_role_required" });
  });

  it("hydrates only the current astrologer's reply draft", async () => {
    const own = await request(`/astro-diary/journals/${journalId}/astrologer-reply/draft`, {
      role: "astrologer"
    });
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ draft: { draftId, version: 1, body: "Ответ" } });

    const foreign = await request(`/astro-diary/journals/${journalId}/astrologer-reply/draft`, {
      role: "foreign-astrologer"
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "astro_diary_not_found" });
  });

  it("creates and replays a closing-reply draft without accepting actor or cycle authority", async () => {
    const invalid = await request(`/astro-diary/journals/${journalId}/astrologer-reply/drafts`, {
      role: "astrologer",
      method: "POST",
      idempotencyKey: "astrologer-reply-001",
      body: {
        expectedJournalVersion: 1,
        body: "Ответ",
        attachmentIds: [],
        cycleId,
        actorUserId: astrologerUserId
      }
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: "invalid_request" });

    const missingCsrf = await request(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts`,
      {
        role: "astrologer",
        method: "POST",
        idempotencyKey: "astrologer-csrf-001",
        cookieSession: true,
        body: { expectedJournalVersion: 1, body: "Ответ", attachmentIds: [] }
      }
    );
    expect(missingCsrf.status).toBe(401);

    const body = { expectedJournalVersion: 1, body: "Ответ", attachmentIds: [] };
    const first = await request(`/astro-diary/journals/${journalId}/astrologer-reply/drafts`, {
      role: "astrologer",
      method: "POST",
      idempotencyKey: "astrologer-reply-001",
      body
    });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ outcome: "applied", draftId, version: 1 });
    expect(first.idempotencyKey).toBe("astrologer-reply-001");

    readerState.laterCycle = true;
    const replay = await request(`/astro-diary/journals/${journalId}/astrologer-reply/drafts`, {
      role: "astrologer",
      method: "POST",
      idempotencyKey: "astrologer-reply-001",
      body
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({ outcome: "replayed", draftId, version: 1 });

    const changedIntent = await request(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts`,
      {
        role: "astrologer",
        method: "POST",
        idempotencyKey: "astrologer-reply-001",
        body: { ...body, body: "Другой ответ" }
      }
    );
    expect(changedIntent.status).toBe(409);
    expect(changedIntent.body).toMatchObject({ code: "idempotency_conflict" });
  });

  it("publishes against server-read cycle and obligation authority and returns replay truthfully", async () => {
    const path = `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${draftId}/publish`;
    const body = { expectedJournalVersion: 1, expectedDraftVersion: 1 };
    const first = await request(path, {
      role: "astrologer",
      method: "POST",
      idempotencyKey: "astrologer-publish-001",
      body
    });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ outcome: "applied", eventIds: [eventId] });
    expect(commandUnitOfWork.inputs.at(-1)?.preconditions).toEqual(
      expect.arrayContaining([
        { aggregate: "cycle", id: cycleId, expectedVersion: 3 },
        { aggregate: "obligation", id: obligationId, expectedVersion: 2 }
      ])
    );

    readerState.laterCycle = true;
    const replay = await request(path, {
      role: "astrologer",
      method: "POST",
      idempotencyKey: "astrologer-publish-001",
      body
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({ outcome: "replayed", eventIds: [eventId] });
    expect(replay.idempotencyKey).toBe("astrologer-publish-001");

    const changedIntent = await request(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${clientDraftId}/publish`,
      {
        role: "astrologer",
        method: "POST",
        idempotencyKey: "astrologer-publish-001",
        body
      }
    );
    expect(changedIntent.status).toBe(409);
    expect(changedIntent.body).toMatchObject({ code: "idempotency_conflict" });
  });

  it("conceals client-private draft and pending-media identities from astrologer updates", async () => {
    const body = {
      expectedJournalVersion: 1,
      expectedDraftVersion: 73,
      body: "Чужой черновик не должен раскрывать свою версию",
      attachmentIds: []
    };
    const foreignDraft = await request(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${clientDraftId}`,
      {
        role: "astrologer",
        method: "PUT",
        idempotencyKey: "astrologer-foreign-draft-001",
        body
      }
    );
    expect(foreignDraft.status).toBe(404);
    expect(foreignDraft.body).toMatchObject({ code: "astro_diary_not_found" });

    const foreignPendingMedia = await request(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${draftId}`,
      {
        role: "astrologer",
        method: "PUT",
        idempotencyKey: "astrologer-foreign-media-001",
        body: {
          ...body,
          expectedDraftVersion: 1,
          attachmentIds: [clientPendingMediaId]
        }
      }
    );
    expect(foreignPendingMedia.status).toBe(404);
    expect(foreignPendingMedia.body).toEqual(foreignDraft.body);
  });

  async function request(
    path: string,
    options: {
      role: "astrologer" | "foreign-astrologer" | "client";
      method?: string;
      idempotencyKey?: string;
      cookieSession?: boolean;
      body?: unknown;
    }
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-test-role": options.role,
        "x-test-mobile": options.cookieSession ? "0" : "1",
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    return {
      status: response.status,
      body: await response.json(),
      idempotencyKey: response.headers.get("idempotency-key")
    };
  }
});

class ReplayCommandUnitOfWork implements AstroDiaryCommandUnitOfWork {
  readonly inputs: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0][] = [];
  private readonly receipts = new Map<
    string,
    { requestHash: string; result: AstroDiaryCommandStableResult }
  >();

  async execute(input: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0]) {
    this.inputs.push(input);
    const key = `${input.journalId}:${input.idempotencyKey}`;
    const prior = this.receipts.get(key);
    if (prior) {
      return prior.requestHash === input.requestHash
        ? ({ outcome: "replayed", result: prior.result } as const)
        : ({ outcome: "idempotency_conflict" } as const);
    }
    const privateScope = input.privateResourceScope;
    if (
      privateScope?.draftIds.includes(clientDraftId) ||
      privateScope?.mediaIds.includes(clientPendingMediaId)
    ) {
      return { outcome: "not_found" as const };
    }
    const stable =
      input.resourceAllocation?.type === "draft"
        ? {
            outcome: "applied" as const,
            eventIds: [],
            resource: { type: "draft" as const, draftId, version: 1 }
          }
        : { outcome: "applied" as const, eventIds: [eventId], resource: null };
    this.receipts.set(key, { requestHash: input.requestHash, result: stable });
    return {
      outcome: "applied" as const,
      response: stable,
      writeSet: emptyWriteSet(),
      receipt: {
        journalId: input.journalId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        preconditions: input.preconditions,
        result: stable
      }
    };
  }
}

function createReader(state: { ended: boolean; laterCycle: boolean }): AstroDiaryJournalReader {
  const summary = {
    journal: {
      id: journalId,
      relationshipId,
      journalEpochId,
      astrologerUserId,
      clientUserId,
      state: "active" as const,
      version: 1,
      createdAt: "2026-08-18T09:00:00.000Z"
    },
    currentCycle: null,
    currentObligation: null,
    access: {
      mode: "active" as const,
      subscriptionId,
      subscriptionState: "active" as const,
      currentPeriod: {
        id: periodId,
        sequence: 1,
        startsAt: "2026-08-18T00:00:00.000Z",
        endsAt: "2026-09-18T00:00:00.000Z"
      },
      allowance: { periodId, total: 2, available: 1, reserved: 0, consumed: 1, released: 0 }
    },
    unreadCount: 1,
    visibleMaxCursor: 1
  };
  return {
    listAstrologerJournals: async () => ({ journals: [summary], total: 1 }),
    getJournalTimeline: async () => ({
      items: [],
      nextCursor: null,
      visibleMaxCursor: 0,
      hasMore: false
    }),
    listParticipantJournals: async ({ participantUserId }) =>
      participantUserId === astrologerUserId
        ? { journals: [summary], total: 1 }
        : { journals: [], total: 0 },
    getParticipantJournalSummary: async ({ participantUserId }) =>
      participantUserId === astrologerUserId ? summary : null,
    getParticipantJournalTimeline: async ({ participantUserId }) =>
      participantUserId === astrologerUserId
        ? { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false }
        : null,
    getParticipantAstrologerReplyDraft: async ({ participantUserId }) =>
      participantUserId === astrologerUserId
        ? { draft: { draftId, version: 1, body: "Ответ" } }
        : null,
    getParticipantClientEntryDraft: async () => null,
    getPaidCoreCommandContext: async ({ participantUserId }) =>
      participantUserId === astrologerUserId
        ? {
            journalVersion: 1,
            activePeriod: state.ended ? null : { id: periodId, allowanceVersion: 2 },
            latestPeriod: { id: periodId, allowanceVersion: 2 },
            currentCycle: state.ended
              ? null
              : { id: state.laterCycle ? laterCycleId : cycleId, version: 3 },
            currentObligation: state.ended
              ? null
              : { id: state.laterCycle ? laterObligationId : obligationId, version: 2 },
            latestCycle: { id: cycleId, version: 3 },
            latestObligation: { id: obligationId, version: 2 }
          }
        : null
  };
}

function emptyWriteSet() {
  return {
    journals: [],
    cycles: [],
    drafts: [],
    obligations: [],
    allowances: [],
    timelineItems: [],
    mediaBindings: [],
    mediaReleases: [],
    mediaAccessRevocations: [],
    journalMediaAccessRevocations: [],
    itemReadAccessRevocations: [],
    contextSnapshots: [],
    contextInvalidations: [],
    derivativeCommands: [],
    erasureCommands: [],
    subscriptionTransitions: [],
    cascadeCommands: [],
    cascadeTargets: [],
    erasureFacts: [],
    readCursors: [],
    events: []
  };
}
