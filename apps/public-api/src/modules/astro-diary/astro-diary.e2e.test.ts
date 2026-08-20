import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type {
  AstroDiaryCommandExecution,
  AstroDiaryCommandUnitOfWork,
  AstroDiaryJournalReader,
  AstroDiaryMediaAuthorizationContext,
  AstroDiaryMediaUploadStore,
  ObjectStoragePort
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { PublicCsrfTokenService } from "../security/csrf/public-csrf-token.service";
import { IdempotencyGuard } from "../security/idempotency/idempotency.guard";
import { SystemClock } from "../../common/system-clock.js";
import { ClientAstroDiaryController } from "./astro-diary.controller";
import { ClientAstroDiaryService } from "./astro-diary.service";

const clientUserId = "00000000-0000-4000-8000-000000000001";
const foreignClientUserId = "00000000-0000-4000-8000-000000000002";
const astrologerUserId = "00000000-0000-4000-8000-000000000003";
const journalId = "00000000-0000-4000-8000-000000000004";
const relationshipId = "00000000-0000-4000-8000-000000000005";
const journalEpochId = "00000000-0000-4000-8000-000000000006";
const subscriptionId = "00000000-0000-4000-8000-000000000007";
const periodId = "00000000-0000-4000-8000-000000000008";
const draftId = "00000000-0000-4000-8000-000000000009";
const eventId = "00000000-0000-4000-8000-000000000010";
const astrologerDraftId = "00000000-0000-4000-8000-000000000011";
const astrologerPendingMediaId = "00000000-0000-4000-8000-000000000012";
const clientAttachmentId = "00000000-0000-4000-8000-000000000013";

describe("client AstroDiary HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let commandUnitOfWork: ReplayCommandUnitOfWork;
  let readerState: { ended: boolean };

  beforeEach(async () => {
    commandUnitOfWork = new ReplayCommandUnitOfWork();
    readerState = { ended: false };
    const service = new ClientAstroDiaryService(
      createReader(readerState),
      commandUnitOfWork,
      {
        now: () => new Date("2026-08-18T10:00:00.000Z")
      },
      createMediaStore(),
      createObjectStorage()
    );
    const builder = Test.createTestingModule({
      controllers: [ClientAstroDiaryController],
      providers: [
        { provide: ClientAstroDiaryService, useValue: service },
        { provide: Reflector, useValue: new Reflector() },
        { provide: ConfigService, useValue: { getOrThrow: () => "public_session" } },
        { provide: PublicCsrfTokenService, useValue: { assertValidRequest: () => undefined } },
        { provide: SystemClock, useValue: { now: () => new Date("2026-08-18T10:00:00Z") } },
        CsrfGuard,
        IdempotencyGuard
      ]
    });
    builder.overrideGuard(PublicSessionAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) {
        const request = context.switchToHttp().getRequest();
        const role = String((request.headers as Record<string, string>)["x-test-role"] ?? "");
        request.currentCustomerAccount = {
          account: {
            id: role === "foreign-client" ? foreignClientUserId : clientUserId,
            status: "active",
            roles: role === "client" || role === "foreign-client" ? ["client"] : []
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

  it("returns only client-owned journals and conceals a foreign journal as 404", async () => {
    const list = await request("/astro-diary/journals", { role: "client" });
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, journals: [{ journal: { id: journalId } }] });

    const foreign = await request(`/astro-diary/journals/${journalId}`, {
      role: "foreign-client"
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "astro_diary_not_found" });
  });

  it("rejects role crossover and authority fields in a client draft request", async () => {
    const roleCrossover = await request("/astro-diary/journals", { role: "astrologer" });
    expect(roleCrossover.status).toBe(403);
    expect(roleCrossover.body).toMatchObject({ code: "client_role_required" });

    const invalid = await request(`/astro-diary/journals/${journalId}/client-entry/drafts`, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-entry-001",
      body: {
        expectedJournalVersion: 1,
        body: "Сегодня спокойно",
        attachmentIds: [],
        moodId: "calm",
        actorUserId: clientUserId
      }
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: "invalid_request" });
  });

  it("hydrates only the current client's unpublished entry draft", async () => {
    const own = await request(`/astro-diary/journals/${journalId}/client-entry/draft`, {
      role: "client"
    });
    expect(own.status).toBe(200);
    expect(own.body).toEqual({
      draft: {
        draftId,
        version: 1,
        body: "Сегодня спокойно",
        moodId: "calm",
        attachmentIds: [clientAttachmentId]
      }
    });

    const foreign = await request(`/astro-diary/journals/${journalId}/client-entry/draft`, {
      role: "foreign-client"
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "astro_diary_not_found" });
  });

  it("creates a client private media upload intent under the journal authority", async () => {
    const response = await request(`/astro-diary/journals/${journalId}/media/upload-intents`, {
      role: "client",
      method: "POST",
      body: {
        purpose: "astro_diary_attachment",
        fileName: "дневник.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024
      }
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "uploading",
      upload: { method: "PUT", headers: { "content-type": "application/pdf" } }
    });
  });

  it("completes a client private media upload without exposing a public URL", async () => {
    const response = await request(
      `/astro-diary/journals/${journalId}/media/${clientAttachmentId}/complete`,
      {
        role: "client",
        method: "POST",
        body: {
          checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      }
    );

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      mediaId: clientAttachmentId,
      status: "ready",
      purpose: "astro_diary_attachment",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      width: null,
      height: null
    });
  });

  it("returns the same allocated draft on network replay and conflicts on changed intent", async () => {
    const payload = {
      expectedJournalVersion: 1,
      body: "Сегодня спокойно",
      attachmentIds: [],
      moodId: "calm"
    };
    const first = await request(`/astro-diary/journals/${journalId}/client-entry/drafts`, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-entry-001",
      body: payload
    });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ outcome: "applied", draftId, version: 1 });
    expect(first.idempotencyKey).toBe("client-entry-001");

    const replay = await request(`/astro-diary/journals/${journalId}/client-entry/drafts`, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-entry-001",
      body: payload
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({ outcome: "replayed", draftId, version: 1 });

    const conflict = await request(`/astro-diary/journals/${journalId}/client-entry/drafts`, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-entry-001",
      body: { ...payload, body: "Другое содержание" }
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: "idempotency_conflict" });
  });

  it("enforces Idempotency-Key and maps stale and read-only command outcomes", async () => {
    const path = `/astro-diary/journals/${journalId}/client-entry/drafts`;
    const body = {
      expectedJournalVersion: 1,
      body: "Сегодня спокойно",
      attachmentIds: [],
      moodId: "calm"
    };
    const missingKey = await request(path, { role: "client", method: "POST", body });
    expect(missingKey.status).toBe(400);

    const missingCsrf = await request(path, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-csrf-001",
      cookieSession: true,
      body
    });
    expect(missingCsrf.status).toBe(401);

    commandUnitOfWork.forceVersionConflict = true;
    const stale = await request(path, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-stale-001",
      body
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "stale_version", aggregate: "journal" });

    commandUnitOfWork.forceRejectionCode = "paid_access_ended";
    const readOnly = await request(path, {
      role: "client",
      method: "POST",
      idempotencyKey: "client-ended-001",
      body
    });
    expect(readOnly.status).toBe(403);
    expect(readOnly.body).toMatchObject({ code: "paid_access_ended" });
  });

  it("publishes with server-read allowance authority and no client-generated command IDs", async () => {
    const published = await request(
      `/astro-diary/journals/${journalId}/client-entry/drafts/${draftId}/publish`,
      {
        role: "client",
        method: "POST",
        idempotencyKey: "client-publish-001",
        body: { expectedJournalVersion: 1, expectedDraftVersion: 1 }
      }
    );
    expect(published.status).toBe(201);
    expect(published.body).toEqual({ outcome: "applied", eventIds: [eventId] });
    expect(commandUnitOfWork.inputs.at(-1)?.preconditions).toEqual(
      expect.arrayContaining([{ aggregate: "allowance", id: periodId, expectedVersion: 1 }])
    );
    expect(commandUnitOfWork.inputs.at(-1)?.envelope).toMatchObject({
      actorUserId: clientUserId,
      actorRole: "client",
      request: { draftId }
    });

    readerState.ended = true;
    const replay = await request(
      `/astro-diary/journals/${journalId}/client-entry/drafts/${draftId}/publish`,
      {
        role: "client",
        method: "POST",
        idempotencyKey: "client-publish-001",
        body: { expectedJournalVersion: 1, expectedDraftVersion: 1 }
      }
    );
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({ outcome: "replayed", eventIds: [eventId] });
  });

  it("conceals astrologer-private draft and pending-media identities from client updates", async () => {
    const body = {
      expectedJournalVersion: 1,
      expectedDraftVersion: 73,
      body: "Чужой черновик не должен раскрывать свою версию",
      attachmentIds: [],
      moodId: "calm"
    };
    const foreignDraft = await request(
      `/astro-diary/journals/${journalId}/client-entry/drafts/${astrologerDraftId}`,
      {
        role: "client",
        method: "PUT",
        idempotencyKey: "client-foreign-draft-001",
        body
      }
    );
    expect(foreignDraft.status).toBe(404);
    expect(foreignDraft.body).toMatchObject({ code: "astro_diary_not_found" });

    const foreignPendingMedia = await request(
      `/astro-diary/journals/${journalId}/client-entry/drafts/${draftId}`,
      {
        role: "client",
        method: "PUT",
        idempotencyKey: "client-foreign-media-001",
        body: {
          ...body,
          expectedDraftVersion: 1,
          attachmentIds: [astrologerPendingMediaId]
        }
      }
    );
    expect(foreignPendingMedia.status).toBe(404);
    expect(foreignPendingMedia.body).toEqual(foreignDraft.body);
  });

  async function request(
    path: string,
    options: {
      role: "client" | "foreign-client" | "astrologer";
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
  forceVersionConflict = false;
  forceRejectionCode: string | null = null;
  private readonly receipts = new Map<
    string,
    { requestHash: string; result: Extract<AstroDiaryCommandExecution, { outcome: "applied" }> }
  >();

  async execute(input: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0]) {
    this.inputs.push(input);
    if (this.forceVersionConflict) {
      this.forceVersionConflict = false;
      return {
        outcome: "version_conflict" as const,
        aggregate: "journal" as const,
        id: input.journalId,
        expectedVersion: 1,
        currentVersion: 2
      };
    }
    if (this.forceRejectionCode) {
      const code = this.forceRejectionCode;
      this.forceRejectionCode = null;
      return {
        outcome: "rejected" as const,
        code,
        receipt: {
          journalId: input.journalId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          preconditions: input.preconditions,
          result: { outcome: "rejected" as const, code }
        }
      };
    }
    const key = `${input.journalId}:${input.idempotencyKey}`;
    const receipt = this.receipts.get(key);
    if (receipt) {
      return receipt.requestHash === input.requestHash
        ? ({ outcome: "replayed", result: receipt.result.response } as const)
        : ({ outcome: "idempotency_conflict" } as const);
    }
    const privateScope = input.privateResourceScope;
    if (
      privateScope?.draftIds.includes(astrologerDraftId) ||
      privateScope?.mediaIds.includes(astrologerPendingMediaId)
    ) {
      return { outcome: "not_found" as const };
    }
    const stable = input.resourceAllocation
      ? {
          outcome: "applied" as const,
          eventIds: [],
          resource: { type: "draft" as const, draftId, version: 1 }
        }
      : { outcome: "applied" as const, eventIds: [eventId], resource: null };
    const result = {
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
    this.receipts.set(key, { requestHash: input.requestHash, result });
    return result;
  }
}

function createReader(state: { ended: boolean }): AstroDiaryJournalReader {
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
      allowance: { periodId, total: 2, available: 2, reserved: 0, consumed: 0, released: 0 }
    },
    unreadCount: 0,
    visibleMaxCursor: 0
  };
  return {
    listAstrologerJournals: async () => ({ journals: [], total: 0 }),
    getJournalTimeline: async () => null,
    listParticipantJournals: async ({ participantUserId }) =>
      participantUserId === clientUserId
        ? { journals: [summary], total: 1 }
        : { journals: [], total: 0 },
    getParticipantJournalSummary: async ({ participantUserId }) =>
      participantUserId === clientUserId ? summary : null,
    getParticipantJournalTimeline: async () => ({
      items: [],
      nextCursor: null,
      visibleMaxCursor: 0,
      hasMore: false
    }),
    getParticipantAstrologerReplyDraft: async () => null,
    getParticipantClientEntryDraft: async ({ participantUserId }) =>
      participantUserId === clientUserId
        ? {
            draft: {
              draftId,
              version: 1,
              body: "Сегодня спокойно",
              moodId: "calm",
              attachmentIds: [clientAttachmentId]
            }
          }
        : null,
    getPaidCoreCommandContext: async ({ participantUserId }) =>
      participantUserId === clientUserId
        ? {
            journalVersion: 1,
            activePeriod: state.ended ? null : { id: periodId, allowanceVersion: 1 },
            latestPeriod: { id: periodId, allowanceVersion: 1 },
            currentCycle: null,
            currentObligation: null,
            latestCycle: null,
            latestObligation: null
          }
        : null
  } as AstroDiaryJournalReader;
}

function createMediaStore(): AstroDiaryMediaUploadStore & {
  getAuthorizationContext(input: {
    readonly journalId: string;
    readonly actorUserId: string;
  }): Promise<AstroDiaryMediaAuthorizationContext | null>;
} {
  return {
    getAuthorizationContext: async ({ journalId: requestedJournalId, actorUserId }) =>
      requestedJournalId === journalId
        ? {
            actorUserId,
            relationship: {
              id: relationshipId,
              clientUserId,
              astrologerUserId,
              state: "active"
            },
            journal: {
              id: journalId,
              relationshipId,
              clientUserId,
              astrologerUserId,
              state: "active"
            }
          }
        : null,
    createPendingUpload: async () => undefined,
    findPendingUpload: async ({ mediaId }) =>
      mediaId === clientAttachmentId
        ? {
            asset: {
              id: clientAttachmentId,
              ownerUserId: clientUserId,
              purpose: "astro_diary_attachment",
              status: "uploading",
              visibility: "private",
              storageBucket: "private-diary",
              storageKey: "astro-diary/client/file.pdf",
              originalFileName: "file.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
              checksumSha256: null,
              width: null,
              height: null,
              altText: null,
              failureReason: null,
              variants: [],
              createdAt: "2026-08-18T10:00:00.000Z",
              updatedAt: "2026-08-18T10:00:00.000Z"
            },
            media: {
              id: clientAttachmentId,
              ownerUserId: clientUserId,
              journalId,
              purpose: "astro_diary_attachment",
              visibility: "private",
              status: "uploading",
              boundItemId: null,
              accessRevoked: false
            }
          }
        : null,
    markReady: async ({ checksumSha256, width, height, now }) => ({
      id: clientAttachmentId,
      ownerUserId: clientUserId,
      purpose: "astro_diary_attachment",
      status: "ready",
      visibility: "private",
      storageBucket: "private-diary",
      storageKey: "astro-diary/client/file.pdf",
      originalFileName: "file.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      checksumSha256,
      width,
      height,
      altText: null,
      failureReason: null,
      variants: [],
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: now
    }),
    markFailed: async () => undefined
  };
}

function createObjectStorage(): ObjectStoragePort {
  return {
    createPresignedUpload: async (input) => ({
      bucket: "private-diary",
      method: "PUT",
      url: `https://storage.example/${input.storageKey}`,
      headers: { "content-type": input.mimeType },
      expiresAt: "2026-08-18T10:15:00.000Z"
    }),
    readUploadedObjectMetadata: async () => ({
      sizeBytes: 1024,
      mimeType: "application/pdf",
      checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      width: null,
      height: null
    })
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
