import type { INestApplication } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  flowWorkItemMutationResponseSchema,
  listFlowWorkItemsResponseSchema,
  type FlowWorkItem,
  type FlowWorkItemQueueEntry,
  type ListFlowWorkItemsQuery,
  type ListFlowWorkItemsResponse
} from "@elevenhouse/contracts";
import {
  FlowRuntimeCommandBusyError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  type AuthSessionAuthenticationStore,
  type FlowWorkItemCommand,
  type FlowWorkItemCommandRejectionResponse,
  type FlowWorkItemCommandResult,
  type FlowWorkItemStore,
  type MobileSessionAuthenticationStore
} from "@elevenhouse/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ClockModule } from "../clock/clock.module";
import { SystemClock } from "../clock/system-clock.service";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { MOBILE_SESSION_AUTHENTICATION_STORE } from "../identity/mobile/mobile-session.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { SecurityModule } from "../security/security.module";
import { FlowWorkItemsController } from "./flow-work-items.controller";
import { FlowWorkItemsService } from "./flow-work-items.service";
import { FLOW_WORK_ITEM_STORE } from "./flows.tokens";

const now = new Date("2026-08-05T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "flow-work-item-session-token";
const secondSessionToken = "flow-work-item-second-session-token";
const ownerUserId = "10000000-0000-4000-8000-000000000001";
const secondOwnerUserId = "20000000-0000-4000-8000-000000000001";
const workItemId = "10000000-0000-4000-8000-000000000002";
const secondWorkItemId = "20000000-0000-4000-8000-000000000002";
const passwordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3_600 },
  requestCodeIp: { limit: 30, windowSeconds: 3_600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3_600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

const mutationCases = [
  {
    name: "start",
    path: `/flow-work-items/${workItemId}/start`,
    body: { expectedRevision: 1, expectedBookingLifecycleRevision: 1 },
    idempotencyKey: "flow-work-item-start-http-1",
    routeTemplate: "/flow-work-items/:workItemId/start",
    scope: "flows.work-items.start.v1",
    requestSchemaVersion: "flow-work-item-start-request.v1",
    responseWorkItem: workItem({ status: "in_progress", revision: 2 })
  },
  {
    name: "snooze",
    path: `/flow-work-items/${workItemId}/snooze`,
    body: {
      expectedRevision: 1,
      expectedBookingLifecycleRevision: 1,
      snoozedUntil: "2026-08-06T12:00:00.000Z"
    },
    idempotencyKey: "flow-work-item-snooze-http-1",
    routeTemplate: "/flow-work-items/:workItemId/snooze",
    scope: "flows.work-items.snooze.v1",
    requestSchemaVersion: "flow-work-item-snooze-request.v1",
    responseWorkItem: workItem({
      status: "snoozed",
      revision: 2,
      snoozedUntil: "2026-08-06T12:00:00.000Z"
    })
  },
  {
    name: "complete",
    path: `/flow-work-items/${workItemId}/complete`,
    body: {
      expectedRevision: 1,
      expectedBookingLifecycleRevision: 1,
      resultSummary: "Consultation brief is ready"
    },
    idempotencyKey: "flow-work-item-complete-http-1",
    routeTemplate: "/flow-work-items/:workItemId/complete",
    scope: "flows.work-items.complete.v1",
    requestSchemaVersion: "flow-work-item-complete-request.v1",
    responseWorkItem: workItem({
      status: "completed",
      revision: 2,
      resultSummary: "Consultation brief is ready"
    })
  }
] as const;

describe("flow work item HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let csrfToken: string;
  const store = new InMemoryFlowWorkItemStore();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ClockModule, ConfigModule, SecurityModule],
      controllers: [FlowWorkItemsController],
      providers: [
        AstrologerSessionAuthGuard,
        IdentityCurrentSessionService,
        FlowWorkItemsService,
        { provide: AUTH_SESSION_AUTHENTICATION_STORE, useValue: createAuthStore() },
        { provide: MOBILE_SESSION_AUTHENTICATION_STORE, useValue: createMobileAuthStore() },
        { provide: FLOW_WORK_ITEM_STORE, useValue: store }
      ]
    })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits
        })
      )
      .overrideProvider(SystemClock)
      .useValue({ now: () => now })
      .compile();

    csrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: () => undefined },
      sessionToken,
      sessionExpiresAt: "2026-08-12T10:00:00.000Z",
      now
    });
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    store.reset();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("requires authentication before exposing queue or command state", async () => {
    const list = await send("GET", "/flow-work-items?status=active");
    const start = await send(
      "POST",
      `/flow-work-items/${workItemId}/start`,
      { expectedRevision: 1 },
      { "idempotency-key": "flow-work-item-unauthenticated" }
    );

    expect(list.status).toBe(401);
    expect(start.status).toBe(401);
    expect(JSON.stringify([list.body, start.body])).not.toContain(workItemId);
    expect(JSON.stringify([list.body, start.body])).not.toContain("Prepare consultation");
    expect(store.listInputs).toHaveLength(0);
    expect(store.persistedCommands).toHaveLength(0);
  });

  it("returns no-store queue projections scoped to the authenticated owner", async () => {
    const primary = await send(
      "GET",
      "/flow-work-items?status=pending&limit=10&offset=0",
      undefined,
      auth()
    );
    const secondary = await send(
      "GET",
      "/flow-work-items?status=pending&limit=10&offset=0",
      undefined,
      auth(secondSessionToken)
    );

    expect(primary.status).toBe(200);
    expect(secondary.status).toBe(200);
    listFlowWorkItemsResponseSchema.parse(primary.body);
    listFlowWorkItemsResponseSchema.parse(secondary.body);
    expect(primary.cacheControl).toBe("no-store");
    expect(secondary.cacheControl).toBe("no-store");
    expect(primary.body).toMatchObject({
      total: 1,
      items: [{ workItem: { id: workItemId, assigneeUserId: ownerUserId } }]
    });
    expect(secondary.body).toMatchObject({
      total: 1,
      items: [{ workItem: { id: secondWorkItemId, assigneeUserId: secondOwnerUserId } }]
    });
    expect(JSON.stringify(primary.body)).not.toContain(secondWorkItemId);
    expect(store.listInputs).toEqual([
      { ownerUserId, query: { status: "pending", limit: 10, offset: 0 } },
      {
        ownerUserId: secondOwnerUserId,
        query: { status: "pending", limit: 10, offset: 0 }
      }
    ]);
  });

  it("rejects an invalid queue query before reaching storage", async () => {
    const response = await send(
      "GET",
      "/flow-work-items?status=unknown&unexpected=true",
      undefined,
      auth()
    );

    expect(response).toMatchObject({
      status: 400,
      body: { code: "FLOW_INVALID_REQUEST" }
    });
    expect(store.listInputs).toHaveLength(0);
  });

  it.each(mutationCases)("enforces CSRF for $name", async ({ path, body, idempotencyKey }) => {
    const response = await send("POST", path, body, {
      ...auth(),
      "idempotency-key": idempotencyKey
    });

    expect(response.status).toBe(403);
    expect(store.persistedCommands).toHaveLength(0);
  });

  it.each(mutationCases)(
    "requires one valid Idempotency-Key header for $name",
    async ({ path, body }) => {
      const missing = await send("POST", path, body, csrfAuth());
      const malformed = await send("POST", path, body, {
        ...csrfAuth(),
        "idempotency-key": "short"
      });

      expect(missing.status).toBe(400);
      expect(malformed.status).toBe(400);
      expect(store.persistedCommands).toHaveLength(0);
    }
  );

  it.each(mutationCases)(
    "persists the exact owner-scoped $name command identity and returns its result",
    async ({
      path,
      body,
      idempotencyKey,
      routeTemplate,
      scope,
      requestSchemaVersion,
      responseWorkItem
    }) => {
      store.respondWith(succeeded(responseWorkItem));

      const response = await send("POST", path, body, idempotencyHeaders(idempotencyKey));

      expect(response.status).toBe(200);
      flowWorkItemMutationResponseSchema.parse(response.body);
      expect(response.body).toEqual({ workItem: responseWorkItem });
      expect(store.persistedCommands).toHaveLength(1);
      expect(store.persistedCommands[0]).toMatchObject({
        apiSurface: "astrologer-api",
        actorUserId: ownerUserId,
        ownerUserId,
        resourceId: workItemId,
        routeTemplate,
        scope,
        idempotencyKey,
        request: { schemaVersion: requestSchemaVersion, body }
      });
      expect(store.persistedCommands[0]?.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  );

  it("maps an owner-scoped missing work item to a safe 404", async () => {
    store.respondWith(rejected({ statusCode: 404, body: { code: "FLOW_WORK_ITEM_NOT_FOUND" } }));

    const response = await send(
      "POST",
      `/flow-work-items/${secondWorkItemId}/start`,
      { expectedRevision: 1 },
      idempotencyHeaders("flow-work-item-hidden-http-1")
    );

    expect(response).toEqual({
      status: 404,
      body: { code: "FLOW_WORK_ITEM_NOT_FOUND" },
      cacheControl: null
    });
    expect(JSON.stringify(response.body)).not.toContain(secondOwnerUserId);
    expect(store.persistedCommands[0]).toMatchObject({
      actorUserId: ownerUserId,
      ownerUserId,
      resourceId: secondWorkItemId
    });
  });

  it.each([
    {
      name: "revision conflict",
      rejection: {
        statusCode: 409 as const,
        body: { code: "FLOW_WORK_ITEM_REVISION_CONFLICT" as const, currentRevision: 2 }
      }
    },
    {
      name: "invalid transition",
      rejection: {
        statusCode: 409 as const,
        body: {
          code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED" as const,
          status: "completed"
        }
      }
    },
    {
      name: "Booking lifecycle projection lag",
      rejection: {
        statusCode: 409 as const,
        body: {
          code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING" as const,
          bookingId: "40000000-0000-4000-8000-000000000002",
          appliedRevision: 1,
          aggregateRevision: 2
        }
      }
    },
    {
      name: "changed Booking lifecycle context",
      rejection: {
        statusCode: 409 as const,
        body: {
          code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED" as const,
          currentBookingLifecycleRevision: 2
        }
      }
    }
  ])("maps a persisted $name to 409", async ({ rejection }) => {
    store.respondWith(rejected(rejection));

    const response = await send(
      "POST",
      `/flow-work-items/${workItemId}/start`,
      { expectedRevision: 1 },
      idempotencyHeaders("flow-work-item-conflict-http-1")
    );

    expect(response).toMatchObject({ status: 409, body: rejection.body });
    expect(store.persistedCommands).toHaveLength(1);
  });

  it.each([
    {
      name: "start",
      path: `/flow-work-items/${workItemId}/start`,
      body: { expectedRevision: 0 }
    },
    {
      name: "snooze",
      path: `/flow-work-items/${workItemId}/snooze`,
      body: { expectedRevision: 1, snoozedUntil: "not-an-instant" }
    },
    {
      name: "complete",
      path: `/flow-work-items/${workItemId}/complete`,
      body: { expectedRevision: 1, forged: true }
    }
  ])("rejects an invalid $name body before persisting a command", async ({ path, body }) => {
    const response = await send(
      "POST",
      path,
      body,
      idempotencyHeaders("flow-work-item-invalid-http-1")
    );

    expect(response).toMatchObject({
      status: 400,
      body: { code: "FLOW_INVALID_REQUEST" }
    });
    expect(store.persistedCommands).toHaveLength(0);
  });

  it.each([
    [new FlowRuntimeIdempotencyConflictError(), "FLOW_IDEMPOTENCY_KEY_REUSED"],
    [new FlowRuntimeIdempotencyExpiredError(), "FLOW_IDEMPOTENCY_KEY_EXPIRED"]
  ] as const)("maps an idempotency authority failure to 409", async (error, code) => {
    store.failWith(error);

    const response = await send(
      "POST",
      `/flow-work-items/${workItemId}/start`,
      { expectedRevision: 1 },
      idempotencyHeaders("flow-work-item-idempotency-http-1")
    );

    expect(response).toMatchObject({ status: 409, body: { code } });
    expect(store.persistedCommands).toHaveLength(1);
  });

  it("maps unavailable runtime authority to a stable 409", async () => {
    store.respondWith(
      rejected({
        statusCode: 409,
        body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" }
      })
    );

    const response = await send(
      "POST",
      `/flow-work-items/${workItemId}/complete`,
      { expectedRevision: 1 },
      idempotencyHeaders("flow-work-item-runtime-http-1")
    );

    expect(response).toMatchObject({
      status: 409,
      body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" }
    });
  });

  it("maps busy command authority to service unavailable", async () => {
    store.failWith(new FlowRuntimeCommandBusyError());

    const response = await send(
      "POST",
      `/flow-work-items/${workItemId}/start`,
      { expectedRevision: 1 },
      idempotencyHeaders("flow-work-item-busy-http-1")
    );

    expect(response).toMatchObject({
      status: 503,
      body: { code: "FLOW_RUNTIME_COMMAND_BUSY" }
    });
    expect(store.persistedCommands).toHaveLength(1);
  });

  async function send(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
      cacheControl: response.headers.get("cache-control")
    };
  }

  function csrfAuth(): Record<string, string> {
    return {
      cookie: `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${csrfToken}`,
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken
    };
  }

  function idempotencyHeaders(key: string): Record<string, string> {
    return { ...csrfAuth(), "idempotency-key": key };
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly cacheControl: string | null;
};

type OwnedQueueEntry = {
  readonly ownerUserId: string;
  readonly entry: FlowWorkItemQueueEntry;
};

class InMemoryFlowWorkItemStore implements FlowWorkItemStore {
  readonly listInputs: Array<{
    readonly ownerUserId: string;
    readonly query: ListFlowWorkItemsQuery;
  }> = [];
  readonly persistedCommands: FlowWorkItemCommand[] = [];
  private entries: OwnedQueueEntry[] = [];
  private nextExecution: FlowWorkItemCommandResult | Error = succeeded(workItem());

  reset(): void {
    this.listInputs.length = 0;
    this.persistedCommands.length = 0;
    this.entries = [
      { ownerUserId, entry: queueEntry(workItem()) },
      {
        ownerUserId: secondOwnerUserId,
        entry: queueEntry(
          workItem({
            id: secondWorkItemId,
            assigneeUserId: secondOwnerUserId,
            status: "pending",
            revision: 1
          })
        )
      }
    ];
    this.nextExecution = succeeded(workItem());
  }

  respondWith(result: FlowWorkItemCommandResult): void {
    this.nextExecution = result;
  }

  failWith(error: Error): void {
    this.nextExecution = error;
  }

  readonly list: FlowWorkItemStore["list"] = async ({ ownerUserId: ownerId, query }) => {
    this.listInputs.push({ ownerUserId: ownerId, query });
    const matching = this.entries
      .filter(({ ownerUserId: entryOwnerId }) => entryOwnerId === ownerId)
      .filter(({ entry }) => matchesStatus(entry.workItem, query.status));

    return {
      items: matching.slice(query.offset, query.offset + query.limit).map(({ entry }) => entry),
      total: matching.length,
      asOf: now.toISOString()
    } satisfies ListFlowWorkItemsResponse;
  };

  readonly execute: FlowWorkItemStore["execute"] = async ({ command }) => {
    this.persistedCommands.push(command);
    if (this.nextExecution instanceof Error) throw this.nextExecution;
    return this.nextExecution;
  };
}

function auth(token = sessionToken): Record<string, string> {
  return { cookie: `${sessionCookieName}=${token}` };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const sessions = new Map([
    [hashSessionToken(sessionToken), { token: sessionToken, userId: ownerUserId }],
    [hashSessionToken(secondSessionToken), { token: secondSessionToken, userId: secondOwnerUserId }]
  ]);

  return {
    findByTokenHash: async (candidateTokenHash) => {
      const candidate = sessions.get(candidateTokenHash);
      if (!candidate) return null;

      return {
        session: {
          id:
            candidate.token === sessionToken
              ? "30000000-0000-4000-8000-000000000001"
              : "30000000-0000-4000-8000-000000000002",
          userId: candidate.userId,
          tokenHash: candidateTokenHash,
          status: "active" as const,
          createdAt: now.toISOString(),
          expiresAt: "2026-08-12T10:00:00.000Z"
        },
        user: {
          id: candidate.userId,
          status: "active" as const,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        },
        roleAssignments: [
          {
            id:
              candidate.token === sessionToken
                ? "30000000-0000-4000-8000-000000000003"
                : "30000000-0000-4000-8000-000000000004",
            userId: candidate.userId,
            role: "astrologer" as const,
            assignedAt: now.toISOString()
          }
        ]
      };
    }
  };
}

function createMobileAuthStore(): MobileSessionAuthenticationStore {
  return {
    findByAccessTokenHash: async () => null
  };
}

function matchesStatus(item: FlowWorkItem, status: ListFlowWorkItemsQuery["status"]): boolean {
  if (status === "active") {
    return item.status === "pending" || item.status === "in_progress" || item.status === "snoozed";
  }
  return item.status === status;
}

function succeeded(item: FlowWorkItem): FlowWorkItemCommandResult {
  return {
    kind: "created",
    outcome: {
      kind: "succeeded",
      response: { statusCode: 200, body: { workItem: item } }
    }
  };
}

function rejected(response: FlowWorkItemCommandRejectionResponse): FlowWorkItemCommandResult {
  return { kind: "created", outcome: { kind: "rejected", response } };
}

function queueEntry(item: FlowWorkItem): FlowWorkItemQueueEntry {
  return {
    workItem: item,
    context: {
      status: "available",
      subjectType: "booking",
      completionRequirements: { resultSummary: "optional" },
      flow: {
        id: "40000000-0000-4000-8000-000000000001",
        currentName: "Consultation preparation"
      },
      booking: {
        id: "40000000-0000-4000-8000-000000000002",
        lifecycleRevision: 1,
        state: "confirmed",
        currentStartAt: "2026-08-06T12:00:00.000Z",
        currentEndAt: "2026-08-06T13:00:00.000Z",
        timeZoneSnapshot: "Europe/Moscow"
      },
      client: {
        userId: "40000000-0000-4000-8000-000000000003",
        currentDisplayName: "Alice Vega"
      },
      product: {
        id: "40000000-0000-4000-8000-000000000004",
        titleSnapshot: "Natal consultation"
      }
    }
  };
}

function workItem(
  overrides: Partial<FlowWorkItem> & Pick<FlowWorkItem, "status" | "revision"> = {
    status: "pending",
    revision: 1
  }
): FlowWorkItem {
  const statusEvidence =
    overrides.status === "in_progress"
      ? { startedAt: "2026-08-05T10:01:00.000Z" }
      : overrides.status === "snoozed"
        ? { snoozedUntil: overrides.snoozedUntil ?? "2026-08-06T12:00:00.000Z" }
        : overrides.status === "completed"
          ? {
              startedAt: "2026-08-05T10:01:00.000Z",
              completedAt: "2026-08-05T10:05:00.000Z",
              completedByUserId: overrides.assigneeUserId ?? ownerUserId
            }
          : {};

  return {
    id: workItemId,
    flowRunId: "10000000-0000-4000-8000-000000000003",
    flowVersionId: "10000000-0000-4000-8000-000000000004",
    nodeId: "prepare-consultation",
    taskKind: "consultation_preparation",
    title: "Prepare consultation",
    instructions: null,
    assigneeUserId: ownerUserId,
    priority: "normal",
    dueAt: "2026-08-06T11:00:00.000Z",
    availableAt: now.toISOString(),
    snoozedUntil: null,
    resultSummary: null,
    createdAt: now.toISOString(),
    updatedAt: overrides.status === "pending" ? now.toISOString() : "2026-08-05T10:05:00.000Z",
    startedAt: null,
    completedAt: null,
    completedByUserId: null,
    expiredAt: null,
    canceledAt: null,
    ...overrides,
    ...statusEvidence
  };
}
