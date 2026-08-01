import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  flowResponseSchema,
  listFlowApprovalsResponseSchema,
  listFlowTemplatesResponseSchema,
  listFlowsResponseSchema,
  listFlowRunsResponseSchema,
  manualFlowRunResponseSchema,
  publishFlowResponseSchema,
  simulateFlowRunResponseSchema,
  type FlowApproval,
  type FlowGraph,
  type FlowRuntimeEvent,
  type FlowRunResponse,
  type FlowStepRunResponse
} from "@elevenhouse/contracts";
import type {
  AstrologerClientList,
  AstrologerClientListItem,
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientJoinIntent,
  ClientStore,
  FlowRecord,
  FlowRuntimeStore,
  FlowStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
import { BIRTH_PLACE_SEARCH_PROVIDER, CLIENT_STORE } from "../clients/clients.tokens";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../identity/auth/identity-auth.tokens";
import { IdentityModule } from "../identity/identity.module";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { FlowsModule } from "./flows.module";
import { FLOW_RUNTIME_STORE, FLOW_STORE } from "./flows.tokens";

const now = new Date("2026-07-27T06:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientUserId = "42fd8c6f-1178-4657-a4b5-4f5cd8568743";
const runtimeFlowId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c111";
const runtimeVersionId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c112";
let currentCsrfToken = "";
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("flows HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let flowStore: FlowStore;
  let runtimeStore: FlowRuntimeStore;

  beforeEach(async () => {
    flowStore = createFlowStore();
    runtimeStore = createRuntimeStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth unit of work call")
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected auth session revocation unit of work call")
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected astrologer registration unit of work call")
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, FlowsModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: defaultPasswordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(astrologerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => now)
      })
      .overrideProvider(FLOW_STORE)
      .useValue(flowStore)
      .overrideProvider(FLOW_RUNTIME_STORE)
      .useValue(runtimeStore)
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .overrideProvider(BIRTH_PLACE_SEARCH_PROVIDER)
      .useValue({
        search: vi.fn(async () => ({ candidates: [] }))
      })
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-08-03T06:00:00.000Z",
      now
    });
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("requires authentication for flow templates and returns the built-in catalog", async () => {
    const unauthenticatedResponse = await fetch(`${baseUrl}/flow-templates`);
    const authenticatedResponse = await getJson("/flow-templates");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(authenticatedResponse.status).toBe(200);
    listFlowTemplatesResponseSchema.parse(authenticatedResponse.body);
    expect(authenticatedResponse.body.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "session-prep",
          graph: expect.objectContaining({ schemaVersion: "flow-graph.v1" })
        })
      ])
    );
  });

  it("creates, lists, updates and publishes flows with CSRF protection", async () => {
    const missingCsrf = await postJson("/flows", validCreateBody(), {
      cookie: sessionCookieHeader()
    });
    const createResponse = await postJson("/flows", validCreateBody(), csrfHeaders());
    const flowId = String(createResponse.body.id);
    const listResponse = await getJson("/flows?status=draft&limit=10&offset=0");
    const updateResponse = await patchJson(
      `/flows/${flowId}/draft`,
      { name: "После покупки" },
      csrfHeaders()
    );
    const invalidUpdateResponse = await patchJson(`/flows/${flowId}/draft`, {}, csrfHeaders());
    const publishResponse = await postJson(`/flows/${flowId}/publish`, {}, csrfHeaders());
    const missingActivateCsrf = await postJson(`/flows/${flowId}/activate`, {}, {
      cookie: sessionCookieHeader()
    });
    const activateResponse = await postJson(`/flows/${flowId}/activate`, {}, csrfHeaders());
    const pauseResponse = await postJson(`/flows/${flowId}/pause`, {}, csrfHeaders());

    expect(missingCsrf.status).toBe(403);
    expect(createResponse.status).toBe(201);
    flowResponseSchema.parse(createResponse.body);
    expect(createResponse.body).toMatchObject({
      ownerUserId,
      name: "Welcome flow",
      status: "draft"
    });
    expect(listResponse.status).toBe(200);
    listFlowsResponseSchema.parse(listResponse.body);
    expect(listResponse.body).toMatchObject({ total: 1 });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({ id: flowId, name: "После покупки" });
    expect(invalidUpdateResponse.status).toBe(400);
    expect(publishResponse.status).toBe(200);
    publishFlowResponseSchema.parse(publishResponse.body);
    expect(publishResponse.body).toMatchObject({
      flow: {
        id: flowId,
        status: "published",
        publishedVersion: 1
      },
      version: {
        flowId,
        version: 1,
        status: "published"
      }
    });
    expect(missingActivateCsrf.status).toBe(403);
    expect(activateResponse.status).toBe(200);
    flowResponseSchema.parse(activateResponse.body);
    expect(activateResponse.body).toMatchObject({ id: flowId, status: "active" });
    expect(pauseResponse.status).toBe(200);
    flowResponseSchema.parse(pauseResponse.body);
    expect(pauseResponse.body).toMatchObject({ id: flowId, status: "paused" });
  });

  it("simulates and starts runtime runs with CSRF protection", async () => {
    const missingSimulateCsrf = await postJson(
      `/flows/${runtimeFlowId}/simulate`,
      runtimeBody(),
      { cookie: sessionCookieHeader() }
    );
    const simulateResponse = await postJson(
      `/flows/${runtimeFlowId}/simulate`,
      runtimeBody(),
      csrfHeaders()
    );
    const runsBeforeManualResponse = await getJson(`/flows/${runtimeFlowId}/runs`);
    const missingManualCsrf = await postJson(
      `/flows/${runtimeFlowId}/manual-runs`,
      runtimeBody(),
      { cookie: sessionCookieHeader() }
    );
    const manualRunResponse = await postJson(
      `/flows/${runtimeFlowId}/manual-runs`,
      runtimeBody(),
      csrfHeaders()
    );
    const runsResponse = await getJson(`/flows/${runtimeFlowId}/runs`);
    const approvalsResponse = await getJson("/flow-approvals?status=pending");
    const approvalItems = approvalsResponse.body.approvals as Array<{ readonly id: string }> | undefined;
    const missingDecisionCsrf = await postJson(
      `/flow-approvals/${String(approvalItems?.[0]?.id)}/decision`,
      { decision: "approved" },
      { cookie: sessionCookieHeader() }
    );

    expect(missingSimulateCsrf.status).toBe(403);
    expect(simulateResponse.status).toBe(200);
    simulateFlowRunResponseSchema.parse(simulateResponse.body);
    expect(simulateResponse.body).toMatchObject({
      flowId: runtimeFlowId,
      plannedSteps: [
        { nodeId: "lead-created", status: "planned" },
        { nodeId: "draft-reply", status: "approval_required" }
      ]
    });
    expect(runsBeforeManualResponse.status).toBe(200);
    expect(runsBeforeManualResponse.body).toMatchObject({ total: 0 });
    expect(missingManualCsrf.status).toBe(403);
    expect(manualRunResponse.status).toBe(201);
    manualFlowRunResponseSchema.parse(manualRunResponse.body);
    expect(manualRunResponse.body).toMatchObject({
      status: "created",
      run: { flowId: runtimeFlowId, status: "approval_required" }
    });
    expect(runsResponse.status).toBe(200);
    listFlowRunsResponseSchema.parse(runsResponse.body);
    expect(runsResponse.body).toMatchObject({ total: 1 });
    expect(approvalsResponse.status).toBe(200);
    listFlowApprovalsResponseSchema.parse(approvalsResponse.body);
    expect(approvalsResponse.body.approvals).toHaveLength(1);
    expect(missingDecisionCsrf.status).toBe(403);
  });

  async function getJson(path: string): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        cookie: sessionCookieHeader()
      }
    });

    return readJsonResponse(response);
  }

  async function postJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
  }

  async function patchJson(
    path: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function authenticatedCookieHeader(): string {
  return `${sessionCookieHeader()}; ${csrfCookieName}=${currentCsrfToken}`;
}

function csrfHeaders(): Record<string, string> {
  return {
    cookie: authenticatedCookieHeader(),
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);

  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) => {
      if (candidateTokenHash !== tokenHash) return null;

      return {
        session: {
          id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
          userId: ownerUserId,
          tokenHash,
          status: "active" as const,
          createdAt: now.toISOString(),
          expiresAt: "2026-08-03T06:00:00.000Z"
        },
        user: {
          id: ownerUserId,
          status: "active" as const,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        },
        roleAssignments: [
          {
            id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
            userId: ownerUserId,
            role: "astrologer" as const,
            assignedAt: now.toISOString()
          }
        ]
      };
    })
  };
}

function createFlowStore(): FlowStore {
  const runtimeFlow: FlowRecord = {
    ...toFlow(runtimeFlowId, {
      ownerUserId,
      name: "Runtime flow",
      approvalMode: "manual_approve",
      draftGraph: validGraph(),
      now: now.toISOString()
    }),
    status: "active",
    publishedVersionId: runtimeVersionId,
    publishedVersion: 1,
    publishedAt: now.toISOString()
  };
  const flows: FlowRecord[] = [runtimeFlow];
  const versions: Array<Awaited<ReturnType<FlowStore["findPublishedVersionByFlowId"]>>> = [
    {
      id: runtimeVersionId,
      flowId: runtimeFlowId,
      version: 1,
      status: "published" as const,
      approvalMode: "manual_approve" as const,
      graph: validGraph(),
      publishedAt: now.toISOString()
    }
  ];
  let versionCounter = 0;

  return {
    createDraft: vi.fn(async (input) => {
      const flow = toFlow(nextFlowId(flows.length), {
        ownerUserId: input.ownerUserId,
        name: input.name,
        approvalMode: input.approvalMode,
        draftGraph: input.graph,
        now: input.now
      });
      flows.unshift(flow);
      return flow;
    }),
    listByOwner: vi.fn(async (query) => {
      const owned = flows.filter((flow) => flow.ownerUserId === query.ownerUserId);
      const filtered =
        query.status === "all" ? owned : owned.filter((flow) => flow.status === query.status);

      return {
        flows: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length
      };
    }),
    findByOwnerAndId: vi.fn(
      async (input) =>
        flows.find((flow) => flow.ownerUserId === input.ownerUserId && flow.id === input.flowId) ??
        null
    ),
    findPublishedVersionByFlowId: vi.fn(
      async (input) =>
        versions.find((version) => version?.flowId === input.flowId) ?? null
    ),
    listActiveByTriggerKind: vi.fn(async (input) =>
      flows.filter((flow) => {
        if (flow.ownerUserId !== input.ownerUserId || flow.status !== "active") return false;
        const version = versions.find((item) => item?.id === flow.publishedVersionId);
        const trigger = version?.graph.nodes.find((node) => node.category === "trigger");
        return trigger?.kind === input.triggerKind;
      })
    ),
    updateDraft: vi.fn(async (input) => {
      const index = flows.findIndex(
        (flow) =>
          flow.ownerUserId === input.ownerUserId &&
          flow.id === input.flowId &&
          flow.status === "draft"
      );
      if (index === -1) return null;

      const current = flows[index] ?? raise("Expected flow index to resolve");
      const next: FlowRecord = {
        ...current,
        name: input.patch.name ?? current.name,
        approvalMode: input.patch.approvalMode ?? current.approvalMode,
        draftGraph: input.patch.graph ?? current.draftGraph,
        updatedAt: input.now
      };
      flows[index] = next;
      return next;
    }),
    publishDraft: vi.fn(async (input) => {
      const index = flows.findIndex(
        (flow) =>
          flow.ownerUserId === input.ownerUserId &&
          flow.id === input.flowId &&
          flow.status === "draft"
      );
      if (index === -1) return null;

      const current = flows[index] ?? raise("Expected flow index to resolve");
      versionCounter += 1;
      const version = {
        id: "66666666-6666-4666-8666-666666666666",
        flowId: current.id,
        version: versionCounter,
        status: "published" as const,
        approvalMode: current.approvalMode,
        graph: current.draftGraph,
        publishedAt: input.now
      };
      versions.push(version);
      const published: FlowRecord = {
        ...current,
        status: "published",
        publishedVersionId: version.id,
        publishedVersion: version.version,
        publishedAt: input.now,
        updatedAt: input.now
      };
      flows[index] = published;
      return { flow: published, version };
    }),
    transitionStatus: vi.fn(async (input) => {
      const index = flows.findIndex(
        (flow) =>
          flow.ownerUserId === input.ownerUserId &&
          flow.id === input.flowId &&
          input.fromStatuses.includes(flow.status)
      );
      if (index === -1) return null;

      const current = flows[index] ?? raise("Expected flow index to resolve");
      const next: FlowRecord = {
        ...current,
        status: input.toStatus,
        updatedAt: input.now
      };
      flows[index] = next;
      return next;
    })
  };
}

type StoredRun = FlowRunResponse & {
  readonly runtimeEventId: string;
};

type StoredApproval = FlowApproval & {
  readonly ownerUserId: string;
};

function createRuntimeStore(): FlowRuntimeStore {
  const events: FlowRuntimeEvent[] = [];
  const runs: StoredRun[] = [];
  const approvals: StoredApproval[] = [];

  return {
    createEvent: vi.fn(async (input) => {
      const existing = events.find(
        (event) => event.ownerUserId === input.ownerUserId && event.dedupeKey === input.dedupeKey
      );
      if (existing) return existing;

      const event: FlowRuntimeEvent = {
        id: "aa000000-0000-4000-8000-000000000001",
        ownerUserId: input.ownerUserId,
        source: input.source,
        sourceEventId: input.sourceEventId,
        dedupeKey: input.dedupeKey,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
        payload: input.payload
      };
      events.push(event);
      return event;
    }),
    findEventByDedupeKey: vi.fn(async (input) => {
      return (
        events.find(
          (event) => event.ownerUserId === input.ownerUserId && event.dedupeKey === input.dedupeKey
        ) ?? null
      );
    }),
    findRunByEventAndFlow: vi.fn(async (input) => {
      return stripRuntimeEventId(
        runs.find(
          (run) =>
            run.ownerUserId === input.ownerUserId &&
            run.flowId === input.flowId &&
            run.runtimeEventId === input.runtimeEventId
        ) ?? null
      );
    }),
    findRunById: vi.fn(async (input) => {
      return stripRuntimeEventId(
        runs.find((run) => run.ownerUserId === input.ownerUserId && run.id === input.runId) ?? null
      );
    }),
    cancelRun: vi.fn(async (input) => {
      const index = runs.findIndex(
        (run) => run.ownerUserId === input.ownerUserId && run.id === input.runId
      );
      if (index === -1) return null;

      const current = runs[index] ?? raise("Expected run index to resolve");
      const canceled: StoredRun = {
        ...current,
        status: "canceled",
        currentNodeId: null,
        updatedAt: input.now,
        completedAt: input.now
      };
      runs[index] = canceled;
      return stripRuntimeEventId(canceled);
    }),
    createRun: vi.fn(async () => raise("Use createRunForEventDedupe in HTTP runtime tests")),
    createRunForEventDedupe: vi.fn(
      async (input: Parameters<FlowRuntimeStore["createRunForEventDedupe"]>[0]) => {
      let event = events.find(
        (candidate) =>
          candidate.ownerUserId === input.event.ownerUserId &&
          candidate.dedupeKey === input.event.dedupeKey
      );
      if (!event) {
        event = {
          id: "aa000000-0000-4000-8000-000000000001",
          ownerUserId: input.event.ownerUserId,
          source: input.event.source,
          sourceEventId: input.event.sourceEventId,
          dedupeKey: input.event.dedupeKey,
          subjectType: input.event.subjectType,
          subjectId: input.event.subjectId,
          occurredAt: input.event.occurredAt,
          payload: input.event.payload
        };
        events.push(event);
      }

      const existing = runs.find(
        (run) =>
          run.ownerUserId === input.event.ownerUserId &&
          run.flowId === input.run.flowId &&
          run.runtimeEventId === event.id
      );
      if (existing) {
        return {
          status: "duplicate" as const,
          event,
          run: toRunResponse(existing),
          stepRuns: [],
          approvals: []
        };
      }

      const run: StoredRun = {
        id: "aa000000-0000-4000-8000-000000000002",
        ownerUserId: input.event.ownerUserId,
        flowId: input.run.flowId,
        flowVersionId: input.run.flowVersionId,
        runtimeEventId: event.id,
        sourceEventId: event.sourceEventId,
        status: input.run.status,
        snapshot: input.run.snapshot,
        currentNodeId: input.run.currentNodeId,
        createdAt: input.run.now,
        updatedAt: input.run.now,
        completedAt: input.run.status === "suppressed" ? input.run.now : null
      };
      runs.push(run);
      const stepRuns: FlowStepRunResponse[] = input.run.stepRuns.map((step, index) => ({
        id: `aa000000-0000-4000-8000-00000000000${index + 3}`,
        flowRunId: run.id,
        nodeId: step.nodeId,
        status: step.status,
        inputSnapshot: step.inputSnapshot,
        outputSnapshot: step.outputSnapshot,
        errorCode: step.errorCode,
        errorMessage: step.errorMessage,
        createdAt: input.run.now,
        updatedAt: input.run.now,
        completedAt: step.status === "completed" || step.status === "failed_terminal" ? input.run.now : null
      }));
      const createdApprovals: StoredApproval[] = input.run.approvals.map((approval, index) => ({
        id: `bb000000-0000-4000-8000-00000000000${index + 1}`,
        ownerUserId: input.event.ownerUserId,
        flowRunId: run.id,
        stepRunId: stepRuns.find((step) => step.nodeId === approval.stepNodeId)?.id ?? null,
        status: "pending",
        kind: approval.kind,
        title: approval.title,
        preview: approval.preview,
        createdAt: input.run.now,
        decidedAt: null
      }));
      approvals.push(...createdApprovals);

      return {
        status: "created" as const,
        event,
        run: toRunResponse(run),
        stepRuns,
        approvals: createdApprovals.map(stripOwnerUserId)
      };
      }
    ),
    createSuppression: vi.fn(async () => raise("Suppressions are created through createRunForEventDedupe")),
    findSuppressionByRun: vi.fn(async () => null),
    createDeliveryAttempt: vi.fn(async () => undefined),
    listRuns: vi.fn(async (input: Parameters<FlowRuntimeStore["listRuns"]>[0]) => {
      const filtered = runs.filter(
        (run) =>
          run.ownerUserId === input.ownerUserId &&
          (!input.flowId || run.flowId === input.flowId) &&
          (input.status === "all" || run.status === input.status)
      );
      return {
        runs: filtered.slice(input.offset, input.offset + input.limit).map(toRunResponse),
        total: filtered.length
      };
    }),
    listApprovals: vi.fn(async (input: Parameters<FlowRuntimeStore["listApprovals"]>[0]) => {
      const filtered = approvals.filter(
        (approval) =>
          approval.ownerUserId === input.ownerUserId &&
          (input.status === "all" || approval.status === input.status)
      );
      return {
        approvals: filtered.slice(input.offset, input.offset + input.limit).map(stripOwnerUserId),
        total: filtered.length
      };
    }),
    decideApproval: vi.fn(async (input) => {
      const index = approvals.findIndex(
        (approval) =>
          approval.ownerUserId === input.ownerUserId &&
          approval.id === input.approvalId &&
          approval.status === "pending"
      );
      if (index === -1) return null;

      const current = approvals[index] ?? raise("Expected approval index to resolve");
      const decided: StoredApproval = {
        ...current,
        status: input.decision,
        decidedAt: input.now
      };
      approvals[index] = decided;
      return stripOwnerUserId(decided);
    })
  };
}

function createClientStore(): ClientStore {
  const client: AstrologerClientListItem = {
    clientUserId,
    displayName: "Марина Краснова",
    relationshipStatus: "active",
    firstLinkedAt: now.toISOString(),
    lastLinkedAt: now.toISOString(),
    birthData: null
  };

  return {
    createJoinIntent: vi.fn(async (): Promise<ClientJoinIntent> => raise("Unexpected join intent call")),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(
      async (): Promise<ClientAstrologerRelationship> => raise("Unexpected ensure relationship call")
    ),
    upsertClientProfile: vi.fn(async (): Promise<void> => undefined),
    upsertClientBirthData: vi.fn(
      async (): Promise<ClientBirthData> => raise("Unexpected upsert birth data call")
    ),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(
      async (): Promise<ClientBirthData> => raise("Unexpected create birth data call")
    ),
    updateClientBirthDataProfile: vi.fn(
      async (): Promise<ClientBirthData | null> => raise("Unexpected update birth data call")
    ),
    listAstrologerClients: vi.fn(async (): Promise<AstrologerClientList> => ({ clients: [client], total: 1 })),
    getAstrologerClient: vi.fn(async (input) =>
      input.astrologerUserId === ownerUserId && input.clientUserId === client.clientUserId ? client : null
    )
  };
}

function stripRuntimeEventId(run: StoredRun | null): FlowRunResponse | null {
  if (!run) return null;
  return toRunResponse(run);
}

function toRunResponse(run: StoredRun): FlowRunResponse {
  const { runtimeEventId: _runtimeEventId, ...response } = run;
  return response;
}

function stripOwnerUserId(approval: StoredApproval): FlowApproval {
  const { ownerUserId: _ownerUserId, ...response } = approval;
  return response;
}

function toFlow(
  id: string,
  input: {
    readonly ownerUserId: string;
    readonly name: string;
    readonly approvalMode: FlowRecord["approvalMode"];
    readonly draftGraph: FlowGraph;
    readonly now: string;
  }
): FlowRecord {
  return {
    id,
    ownerUserId: input.ownerUserId,
    name: input.name,
    status: "draft",
    approvalMode: input.approvalMode,
    draftGraph: input.draftGraph,
    publishedVersionId: null,
    publishedVersion: null,
    createdAt: input.now,
    updatedAt: input.now,
    publishedAt: null
  };
}

function nextFlowId(index: number): string {
  return index === 0
    ? "463f34bb-38ec-4cb4-b105-2ed6de91e3cb"
    : "a47d6537-720b-47e4-a1ef-ed7ba82bb2f0";
}

function validCreateBody(): { readonly name: string; readonly graph: FlowGraph } {
  return {
    name: "Welcome flow",
    graph: validGraph()
  };
}

function runtimeBody() {
  return {
    source: "manual",
    subjectType: "client",
    subjectId: clientUserId,
    occurredAt: now.toISOString(),
    timeZone: "Europe/Moscow",
    payload: {}
  };
}

function validGraph(): FlowGraph {
  return {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "lead-created",
        category: "trigger",
        kind: "lead_created",
        title: "Новый лид",
        config: {}
      },
      {
        id: "draft-reply",
        category: "ai",
        kind: "reply_draft",
        approvalMode: "manual_approve",
        title: "Черновик ответа",
        config: {}
      }
    ],
    edges: [{ id: "edge-1", fromNodeId: "lead-created", toNodeId: "draft-reply" }]
  };
}

function raise(message: string): never {
  throw new Error(message);
}
