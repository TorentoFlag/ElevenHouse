import { request as httpRequest } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE,
  cancelFlowRunResponseSchema,
  flowDefinitionDetailV2Schema,
  flowDefinitionSummaryV2Schema,
  flowDefinitionV2Schema,
  flowResponseSchema,
  listFlowApprovalsResponseSchema,
  listFlowDefinitionTemplatesV2ResponseSchema,
  listFlowDefinitionsV2ResponseSchema,
  listFlowRunsResponseSchema,
  migrateFlowDefinitionV2ResponseSchema,
  publishFlowDefinitionCompatibleResponseSchema,
  validateFlowDefinitionResponseSchema,
  validateFlowDefinitionResponseV2Schema,
  type FlowApproval,
  type FlowDefinitionDetailV2,
  type FlowDefinitionCommandRejectionResponse,
  type FlowDefinitionSummaryV2,
  type FlowDefinitionV2,
  type FlowGraph,
  type FlowGraphV2,
  type FlowPresentationV1,
  type FlowRuntimeEvent,
  type FlowRunResponse,
  type FlowStepRunResponse
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  FlowDefinitionControlRecord,
  FlowDefinitionControlStore,
  FlowDefinitionPublishedVersionRecord,
  FlowDefinitionQueryStore,
  FlowRecord,
  FlowRunCancellationStore,
  FlowRuntimeStore,
  FlowStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
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
import {
  FLOW_DEFINITION_CONTROL_STORE,
  FLOW_DEFINITION_QUERY_STORE,
  FLOW_PUBLICATION_ROLLOUT_POLICY,
  FLOW_RUN_CANCELLATION_STORE,
  FLOW_RUNTIME_STORE,
  FLOW_STORE
} from "./flows.tokens";

const now = new Date("2026-07-27T06:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientUserId = "42fd8c6f-1178-4657-a4b5-4f5cd8568743";
const runtimeFlowId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c111";
const runtimeVersionId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c112";
const foreignFlowId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c119";
const foreignOwnerUserId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c120";
const activationFlowId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c121";
const migratableFlowId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c122";
const createdFlowId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c123";
const createdVersionId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c124";
const activationVersionId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c125";
const legacyApprovalId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c113";
const legacyRunId = "12d75c8b-d7b9-4f3d-b6fd-42d0c333c114";
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
  let definitionControlStore: FlowDefinitionControlStore;
  let definitionQueryStore: FlowDefinitionQueryStore;
  let cancellationStore: FlowRunCancellationStore;
  let runtimeStore: FlowRuntimeStore;

  beforeEach(async () => {
    flowStore = createFlowStore();
    const definitionStores = createFlowDefinitionStores();
    definitionControlStore = definitionStores.controlStore;
    definitionQueryStore = definitionStores.queryStore;
    cancellationStore = createRunCancellationStore();
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
      .overrideProvider(FLOW_DEFINITION_CONTROL_STORE)
      .useValue(definitionControlStore)
      .overrideProvider(FLOW_DEFINITION_QUERY_STORE)
      .useValue(definitionQueryStore)
      .overrideProvider(FLOW_PUBLICATION_ROLLOUT_POLICY)
      .useValue({ phase: "manifest_v2" })
      .overrideProvider(FLOW_RUNTIME_STORE)
      .useValue(runtimeStore)
      .overrideProvider(FLOW_RUN_CANCELLATION_STORE)
      .useValue(cancellationStore)
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
    const authenticatedResponse = await getJson("/flow-templates?locale=en");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(authenticatedResponse.status).toBe(200);
    listFlowDefinitionTemplatesV2ResponseSchema.parse(authenticatedResponse.body);
    expect(authenticatedResponse.body).toMatchObject({
      schemaVersion: "flow-definition-template-catalog.v2",
      locale: "en"
    });
    expect(authenticatedResponse.body.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "session-prep",
          availability: "legacy_read_only"
        })
      ])
    );
    expect(
      (authenticatedResponse.body.templates as Array<Record<string, unknown>>).every(
        (template) => !("graph" in template)
      )
    ).toBe(true);
  });

  it("creates, reads, updates, publishes and versions V2 definitions with route protection", async () => {
    const missingCsrf = await postJson("/flows", validCreateBody(), {
      cookie: sessionCookieHeader(),
      "idempotency-key": "flow-create-missing-csrf"
    });
    const missingIdempotency = await postJson("/flows", validCreateBody(), csrfHeaders());
    const createResponse = await postJson(
      "/flows",
      validCreateBody(),
      idempotencyHeaders("flow-create-http-1")
    );
    const flowId = String(createResponse.body.id);
    const listResponse = await getJson("/flows?state=draft&runtimeStatus=draft&limit=10&offset=0");
    const getResponse = await getJson(`/flows/${flowId}`);
    const updateResponse = await patchJson(
      `/flows/${flowId}/draft`,
      {
        expectedRevision: 1,
        name: "После покупки",
        graph: validGraphV2(),
        presentation: validPresentationV1()
      },
      idempotencyHeaders("flow-update-http-1")
    );
    const invalidUpdateResponse = await patchJson(
      `/flows/${flowId}/draft`,
      {},
      idempotencyHeaders("flow-update-http-invalid")
    );
    const publishResponse = await postJson(
      `/flows/${flowId}/publish`,
      { expectedRevision: 2 },
      idempotencyHeaders("flow-publish-http-1")
    );
    const nextDraftResponse = await postJson(
      `/flows/${flowId}/next-draft`,
      {
        expectedRevision: 3,
        baseVersionId: (publishResponse.body.version as Record<string, unknown>).id
      },
      idempotencyHeaders("flow-next-draft-http-1")
    );
    const missingActivateCsrf = await postJson(
      `/flows/${activationFlowId}/activate`,
      {},
      {
        cookie: sessionCookieHeader()
      }
    );
    const activateResponse = await postJson(
      `/flows/${activationFlowId}/activate`,
      {},
      csrfHeaders()
    );
    const pauseResponse = await postJson(`/flows/${runtimeFlowId}/pause`, {}, csrfHeaders());

    expect(missingCsrf.status).toBe(403);
    expect(missingIdempotency.status).toBe(400);
    expect(createResponse.status).toBe(201);
    flowDefinitionV2Schema.parse(createResponse.body);
    expect(createResponse.body).toMatchObject({
      id: createdFlowId,
      ownerUserId,
      name: "Welcome flow",
      state: "draft",
      revision: 1,
      origin: { type: "blank" }
    });
    expect(listResponse.status).toBe(200);
    listFlowDefinitionsV2ResponseSchema.parse(listResponse.body);
    expect(listResponse.body.flows).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdFlowId })])
    );
    expect(getResponse.status).toBe(200);
    flowDefinitionDetailV2Schema.parse(getResponse.body);
    expect(getResponse.body).toMatchObject({ id: createdFlowId, migrationRequired: false });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: flowId,
      name: "После покупки",
      revision: 2
    });
    expect(invalidUpdateResponse.status).toBe(400);
    expect(publishResponse.status).toBe(200);
    publishFlowDefinitionCompatibleResponseSchema.parse(publishResponse.body);
    expect(publishResponse.body).toMatchObject({
      flow: {
        id: flowId,
        state: "versioned",
        revision: 3,
        latestPublishedVersion: 1
      },
      version: {
        schemaVersion: "flow-published-version.v2",
        flowId,
        version: 1,
        sourceRevision: 2,
        status: "published"
      }
    });
    expect(publishResponse.contentType).toContain("application/json");
    expect(publishResponse.vary).toBe("Accept");
    expect(nextDraftResponse.status).toBe(200);
    flowDefinitionV2Schema.parse(nextDraftResponse.body);
    expect(nextDraftResponse.body).toMatchObject({
      id: flowId,
      state: "draft",
      revision: 4,
      draftBaseVersionId: createdVersionId
    });
    expect(missingActivateCsrf.status).toBe(403);
    expect(activateResponse.status).toBe(409);
    expect(activateResponse.body).toMatchObject({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" });
    expect(pauseResponse.status).toBe(200);
    flowResponseSchema.parse(pauseResponse.body);
    expect(pauseResponse.body).toMatchObject({ id: runtimeFlowId, status: "paused" });
    expect(flowStore.createDraft).not.toHaveBeenCalled();
    expect(flowStore.listByOwner).not.toHaveBeenCalled();
    expect(flowStore.updateDraft).not.toHaveBeenCalled();
    expect(flowStore.publishDraft).not.toHaveBeenCalled();
  });

  it("migrates an owner-scoped legacy definition explicitly and exposes migration evidence", async () => {
    const missingIdempotency = await postJson(
      `/flows/${migratableFlowId}/migrations/v2`,
      validMigrationBody(),
      csrfHeaders()
    );
    const migrationResponse = await postJson(
      `/flows/${migratableFlowId}/migrations/v2`,
      validMigrationBody(),
      idempotencyHeaders("flow-migrate-http-1")
    );
    const detailResponse = await getJson(`/flows/${migratableFlowId}`);

    expect(missingIdempotency.status).toBe(400);
    expect(migrationResponse.status).toBe(200);
    migrateFlowDefinitionV2ResponseSchema.parse(migrationResponse.body);
    expect(migrationResponse.body).toMatchObject({
      flow: {
        id: migratableFlowId,
        state: "draft",
        revision: 2,
        origin: { type: "migration", sourceGraphSchemaVersion: "flow-graph.v1" }
      },
      migration: {
        sourceRevision: 1,
        sourceGraphSchemaVersion: "flow-graph.v1",
        targetGraphSchemaVersion: "flow-graph.v2"
      }
    });
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      id: migratableFlowId,
      graphSchemaVersion: "flow-graph.v2",
      migrationRequired: false
    });
  });

  it("validates owner-scoped definitions without writes or activation claims", async () => {
    const v2Graph = validGraphV2();
    const missingCsrf = await postJson(
      `/flows/${runtimeFlowId}/validate`,
      { graph: v2Graph },
      { cookie: sessionCookieHeader() }
    );
    const validV2 = await postJson(
      `/flows/${runtimeFlowId}/validate`,
      { graph: v2Graph },
      {
        ...csrfHeaders(),
        accept: `${FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE}, application/json;q=0.9`
      }
    );
    const invalidV2 = await postJson(
      `/flows/${runtimeFlowId}/validate`,
      { graph: { ...v2Graph, edges: [] } },
      csrfHeaders()
    );
    const legacyV1 = await postJson(
      `/flows/${runtimeFlowId}/validate`,
      { graph: validGraph() },
      csrfHeaders()
    );
    const malformed = await postJson(
      `/flows/${runtimeFlowId}/validate`,
      { graph: { ...v2Graph, unexpected: true } },
      csrfHeaders()
    );
    const foreign = await postJson(
      `/flows/${foreignFlowId}/validate`,
      { graph: v2Graph },
      csrfHeaders()
    );
    const malformedForeign = await postJson(
      `/flows/${foreignFlowId}/validate`,
      { graph: { unexpected: true } },
      csrfHeaders()
    );
    const unknown = await postJson(
      "/flows/12d75c8b-d7b9-4f3d-b6fd-42d0c333c129/validate",
      { graph: v2Graph },
      csrfHeaders()
    );

    expect(missingCsrf.status).toBe(403);
    expect(validV2.status).toBe(200);
    validateFlowDefinitionResponseV2Schema.parse(validV2.body);
    expect(validV2.body).toMatchObject({
      graphSchemaVersion: "flow-graph.v2",
      schemaVersion: "flow-definition-validation.v2",
      publishable: true,
      activatable: false,
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"]
    });
    expect(validV2.contentType).toContain(FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE);
    expect(validV2.vary).toBe("Accept");
    expect(invalidV2.status).toBe(200);
    validateFlowDefinitionResponseSchema.parse(invalidV2.body);
    expect(invalidV2.body).toMatchObject({
      publishable: false,
      schemaVersion: "flow-definition-validation.v1",
      activatable: false,
      activationBlockers: expect.arrayContaining([
        "FLOW_GRAPH_NOT_PUBLISHABLE",
        "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
      ])
    });
    expect(invalidV2.contentType).toContain("application/json");
    expect(invalidV2.vary).toBe("Accept");
    expect(legacyV1.status).toBe(200);
    validateFlowDefinitionResponseSchema.parse(legacyV1.body);
    expect(legacyV1.body).toMatchObject({
      graphSchemaVersion: "flow-graph.v1",
      publishable: false,
      issues: [expect.objectContaining({ code: "migration_required" })]
    });
    expect(malformed.status).toBe(400);
    expect(foreign.status).toBe(404);
    expect(malformedForeign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(flowStore.createDraft).not.toHaveBeenCalled();
    expect(flowStore.updateDraft).not.toHaveBeenCalled();
    expect(flowStore.publishDraft).not.toHaveBeenCalled();
    expect(flowStore.transitionStatus).not.toHaveBeenCalled();
    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
  });

  it("blocks runtime mutations with conflict while preserving CSRF and empty reads", async () => {
    const missingSimulateCsrf = await postJson(`/flows/${runtimeFlowId}/simulate`, runtimeBody(), {
      cookie: sessionCookieHeader()
    });
    const simulateResponse = await postJson(
      `/flows/${runtimeFlowId}/simulate`,
      runtimeBody(),
      csrfHeaders()
    );
    const runsBeforeManualResponse = await getJson(`/flows/${runtimeFlowId}/runs`);
    const missingManualCsrf = await postJson(`/flows/${runtimeFlowId}/manual-runs`, runtimeBody(), {
      cookie: sessionCookieHeader()
    });
    const manualRunResponse = await postJson(
      `/flows/${runtimeFlowId}/manual-runs`,
      runtimeBody(),
      csrfHeaders()
    );
    const runsResponse = await getJson(`/flows/${runtimeFlowId}/runs`);
    const approvalsResponse = await getJson("/flow-approvals?status=pending");
    const missingDecisionCsrf = await postJson(
      `/flow-approvals/${legacyApprovalId}/decision`,
      { decision: "approved" },
      { cookie: sessionCookieHeader() }
    );
    const decisionResponse = await postJson(
      `/flow-approvals/${legacyApprovalId}/decision`,
      { decision: "approved" },
      csrfHeaders()
    );
    const missingCancelCsrf = await postJson(
      `/flow-runs/${legacyRunId}/cancel`,
      {},
      {
        cookie: sessionCookieHeader(),
        "idempotency-key": "flow-cancel-missing-csrf"
      }
    );
    const missingCancelIdempotency = await postJson(
      `/flow-runs/${legacyRunId}/cancel`,
      {},
      csrfHeaders()
    );
    const duplicateCancelIdempotency = await postJsonWithDuplicateIdempotency(
      `/flow-runs/${legacyRunId}/cancel`,
      {},
      ["flow-cancel-http-duplicate-1", "flow-cancel-http-duplicate-2"]
    );
    const invalidCancelBody = await postJson(
      `/flow-runs/${legacyRunId}/cancel`,
      { reason: "not-part-of-cancel-v1" },
      idempotencyHeaders("flow-cancel-http-body-1")
    );
    const cancelResponse = await postJson(
      `/flow-runs/${legacyRunId}/cancel`,
      {},
      idempotencyHeaders("flow-cancel-http-1")
    );

    expect(missingSimulateCsrf.status).toBe(403);
    expect(simulateResponse.status).toBe(409);
    expect(simulateResponse.body).toMatchObject({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" });
    expect(runsBeforeManualResponse.status).toBe(200);
    expect(runsBeforeManualResponse.body).toMatchObject({ total: 0 });
    expect(missingManualCsrf.status).toBe(403);
    expect(manualRunResponse.status).toBe(409);
    expect(manualRunResponse.body).toMatchObject({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" });
    expect(runsResponse.status).toBe(200);
    listFlowRunsResponseSchema.parse(runsResponse.body);
    expect(runsResponse.body).toMatchObject({ total: 0 });
    expect(approvalsResponse.status).toBe(200);
    listFlowApprovalsResponseSchema.parse(approvalsResponse.body);
    expect(approvalsResponse.body.approvals).toHaveLength(0);
    expect(missingDecisionCsrf.status).toBe(403);
    expect(decisionResponse.status).toBe(409);
    expect(decisionResponse.body).toMatchObject({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" });
    expect(missingCancelCsrf.status).toBe(403);
    expect(missingCancelIdempotency.status).toBe(400);
    expect(duplicateCancelIdempotency.status).toBe(400);
    expect(invalidCancelBody.status).toBe(400);
    expect(invalidCancelBody.body).toMatchObject({ code: "FLOW_INVALID_REQUEST" });
    expect(cancelResponse.status).toBe(200);
    cancelFlowRunResponseSchema.parse(cancelResponse.body);
    expect(cancelResponse.body).toMatchObject({
      run: { id: legacyRunId, ownerUserId, status: "canceled" }
    });
    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
    expect(runtimeStore.decideApproval).not.toHaveBeenCalled();
    expect(runtimeStore.cancelRun).not.toHaveBeenCalled();
    expect(cancellationStore.executeCancel).toHaveBeenCalledWith({
      command: expect.objectContaining({
        actorUserId: ownerUserId,
        ownerUserId,
        resourceId: legacyRunId,
        scope: "flows.runtime.cancel.v1",
        idempotencyKey: "flow-cancel-http-1"
      })
    });
    expect(cancellationStore.executeCancel).toHaveBeenCalledTimes(1);
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

  async function postJsonWithDuplicateIdempotency(
    path: string,
    body: unknown,
    idempotencyKeys: readonly [string, string]
  ): Promise<HttpJsonResponse> {
    const payload = JSON.stringify(body);
    const target = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        target,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            cookie: authenticatedCookieHeader(),
            origin: "http://localhost:3000",
            [csrfHeaderName]: currentCsrfToken,
            "idempotency-key": [...idempotencyKeys]
          }
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
              contentType: firstHeaderValue(response.headers["content-type"]),
              vary: firstHeaderValue(response.headers.vary)
            });
          });
        }
      );
      request.on("error", reject);
      request.end(payload);
    });
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly contentType: string | null;
  readonly vary: string | null;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    contentType: response.headers.get("content-type"),
    vary: response.headers.get("vary")
  };
}

function firstHeaderValue(value: string | readonly string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.[0] ?? null;
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

function idempotencyHeaders(key: string): Record<string, string> {
  return { ...csrfHeaders(), "idempotency-key": key };
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

function createFlowDefinitionStores(): {
  readonly controlStore: FlowDefinitionControlStore;
  readonly queryStore: FlowDefinitionQueryStore;
} {
  const definitions: FlowDefinitionControlRecord[] = [
    legacyVersionedDefinition(runtimeFlowId, "Runtime flow", runtimeVersionId),
    legacyVersionedDefinition(activationFlowId, "Activation flow", activationVersionId),
    {
      id: migratableFlowId,
      ownerUserId,
      name: "Legacy manual draft",
      origin: null,
      state: "draft",
      approvalMode: "manual_approve",
      revision: 1,
      draftBaseVersionId: null,
      draftGraph: migratableGraph(),
      draftPresentation: null,
      latestPublishedVersionId: null,
      latestPublishedVersion: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: null
    },
    {
      id: foreignFlowId,
      ownerUserId: foreignOwnerUserId,
      name: "Foreign flow",
      origin: null,
      state: "draft",
      approvalMode: "manual_approve",
      revision: 1,
      draftBaseVersionId: null,
      draftGraph: validGraph(),
      draftPresentation: null,
      latestPublishedVersionId: null,
      latestPublishedVersion: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: null
    }
  ];
  const publishedVersions: FlowDefinitionPublishedVersionRecord[] = [
    legacyPublishedVersion(runtimeFlowId, runtimeVersionId),
    legacyPublishedVersion(activationFlowId, activationVersionId)
  ];
  const runtimeStatuses = new Map<string, FlowDefinitionSummaryV2["runtimeStatus"]>([
    [runtimeFlowId, "active"],
    [activationFlowId, "published"],
    [migratableFlowId, "draft"],
    [foreignFlowId, "draft"]
  ]);

  const findOwnedDefinition = (ownerId: string, flowId: string) =>
    definitions.find(
      (definition) => definition.ownerUserId === ownerId && definition.id === flowId
    ) ?? null;
  const replaceDefinition = (definition: FlowDefinitionV2) => {
    const index = definitions.findIndex((candidate) => candidate.id === definition.id);
    if (index === -1) raise("Expected V2 definition to exist before replacement");
    definitions[index] = toControlRecord(definition);
  };
  const findLatestVersion = (definition: FlowDefinitionControlRecord) =>
    definition.latestPublishedVersionId
      ? (publishedVersions.find(
          (version) =>
            version.flowId === definition.id && version.id === definition.latestPublishedVersionId
        ) ?? null)
      : null;

  const controlStore: FlowDefinitionControlStore = {
    executeCreate: vi.fn(async ({ command, prepare }) => {
      const prepared = prepare();
      if (prepared.kind === "rejected") return rejectedCommand(prepared.response);
      const flow = flowDefinitionV2Schema.parse({
        schemaVersion: "flow-definition.v2",
        id: createdFlowId,
        ownerUserId: command.ownerUserId,
        name: prepared.value.name,
        origin: prepared.value.origin,
        state: "draft",
        approvalMode: prepared.value.approvalMode,
        revision: 1,
        draftBaseVersionId: null,
        draftGraph: prepared.value.graph,
        draftPresentation: prepared.value.presentation,
        latestPublishedVersionId: null,
        latestPublishedVersion: null,
        createdAt: command.now,
        updatedAt: command.now,
        publishedAt: null
      });
      definitions.unshift(toControlRecord(flow));
      runtimeStatuses.set(flow.id, "draft");
      return succeededCommand(201, flow);
    }),
    executeDraftUpdate: vi.fn(async ({ command, prepare }) => {
      const current = findOwnedDefinition(command.ownerUserId, command.resourceId);
      if (!current) return flowDefinitionNotFoundCommand();
      const prepared = prepare(current);
      if (prepared.kind === "rejected") return rejectedCommand(prepared.response);
      replaceDefinition(prepared.value);
      return succeededCommand(200, prepared.value);
    }),
    executePublish: vi.fn(async ({ command, prepare, responseVersion, assertCreatedResponse }) => {
      const current = findOwnedDefinition(command.ownerUserId, command.resourceId);
      if (!current) return flowDefinitionNotFoundCommand();
      const prepared = prepare(current);
      if (prepared.kind === "rejected") return rejectedCommand(prepared.response);
      if (!current.origin) raise("V2 publication requires a persisted origin");

      const versionRecord = {
        id: createdVersionId,
        flowId: current.id,
        version: (current.latestPublishedVersion ?? 0) + 1,
        sourceRevision: prepared.value.sourceRevision,
        status: "published",
        approvalMode: prepared.value.approvalMode,
        graph: prepared.value.graph,
        presentation: prepared.value.presentation,
        capabilityManifest: prepared.value.capabilityManifest,
        publishedAt: command.now
      };
      const version =
        responseVersion === "current_v3"
          ? {
              schemaVersion: "flow-published-version.v3" as const,
              ...versionRecord
            }
          : {
              schemaVersion: "flow-published-version.v2" as const,
              ...versionRecord,
              capabilityManifest: prepared.value.legacyCapabilityManifest
            };
      const flow = flowDefinitionV2Schema.parse({
        schemaVersion: "flow-definition.v2",
        ...current,
        origin: current.origin,
        state: "versioned",
        revision: current.revision + 1,
        draftBaseVersionId: null,
        draftGraph: version.graph,
        draftPresentation: version.presentation,
        latestPublishedVersionId: version.id,
        latestPublishedVersion: version.version,
        updatedAt: command.now,
        publishedAt: command.now
      });
      const response = publishFlowDefinitionCompatibleResponseSchema.parse({ flow, version });
      assertCreatedResponse(response);
      const { status: _status, ...persistedVersion } = versionRecord;
      void _status;
      publishedVersions.push(persistedVersion);
      replaceDefinition(flow);
      runtimeStatuses.set(flow.id, "published");
      return succeededCommand(200, response);
    }),
    executeCreateNextDraft: vi.fn(async ({ command, prepare }) => {
      const current = findOwnedDefinition(command.ownerUserId, command.resourceId);
      if (!current) return flowDefinitionNotFoundCommand();
      const prepared = prepare(current, findLatestVersion(current));
      if (prepared.kind === "rejected") return rejectedCommand(prepared.response);
      replaceDefinition(prepared.value);
      return succeededCommand(200, prepared.value);
    }),
    executeMigration: vi.fn(async ({ command, prepare }) => {
      const current = findOwnedDefinition(command.ownerUserId, command.resourceId);
      if (!current) return flowDefinitionNotFoundCommand();
      const prepared = prepare(current, findLatestVersion(current));
      if (prepared.kind === "rejected") return rejectedCommand(prepared.response);
      replaceDefinition(prepared.value.flow);
      return succeededCommand(200, prepared.value);
    })
  };

  const queryStore: FlowDefinitionQueryStore = {
    listByOwner: vi.fn(async ({ ownerUserId: ownerId, query }) => {
      const filtered = definitions
        .filter((definition) => definition.ownerUserId === ownerId)
        .filter((definition) => query.state === "all" || definition.state === query.state)
        .filter(
          (definition) =>
            query.runtimeStatus === "all" ||
            runtimeStatuses.get(definition.id) === query.runtimeStatus
        )
        .sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
        );
      return {
        flows: filtered
          .slice(query.offset, query.offset + query.limit)
          .map((definition) => toDefinitionSummary(definition, runtimeStatuses)),
        total: filtered.length
      };
    }),
    getByOwner: vi.fn(async ({ ownerUserId: ownerId, flowId }) => {
      const definition = findOwnedDefinition(ownerId, flowId);
      return definition ? toDefinitionDetail(definition, runtimeStatuses) : null;
    })
  };

  return { controlStore, queryStore };
}

function legacyVersionedDefinition(
  id: string,
  name: string,
  publishedVersionId: string
): FlowDefinitionControlRecord {
  return {
    id,
    ownerUserId,
    name,
    origin: null,
    state: "versioned",
    approvalMode: "manual_approve",
    revision: 1,
    draftBaseVersionId: null,
    draftGraph: validGraph(),
    draftPresentation: null,
    latestPublishedVersionId: publishedVersionId,
    latestPublishedVersion: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    publishedAt: now.toISOString()
  };
}

function legacyPublishedVersion(flowId: string, id: string): FlowDefinitionPublishedVersionRecord {
  return {
    id,
    flowId,
    version: 1,
    sourceRevision: null,
    approvalMode: "manual_approve",
    graph: validGraph(),
    presentation: null,
    capabilityManifest: null,
    publishedAt: now.toISOString()
  };
}

function toControlRecord(definition: FlowDefinitionV2): FlowDefinitionControlRecord {
  const { schemaVersion, ...record } = definition;
  void schemaVersion;
  return record;
}

function toDefinitionSummary(
  definition: FlowDefinitionControlRecord,
  runtimeStatuses: ReadonlyMap<string, FlowDefinitionSummaryV2["runtimeStatus"]>
): FlowDefinitionSummaryV2 {
  const { draftGraph, draftPresentation: _draftPresentation, ...common } = definition;
  void _draftPresentation;
  return flowDefinitionSummaryV2Schema.parse({
    schemaVersion: "flow-definition-summary.v2",
    ...common,
    runtimeStatus: runtimeStatuses.get(definition.id) ?? "draft",
    graphSchemaVersion: draftGraph.schemaVersion,
    migrationRequired: draftGraph.schemaVersion === "flow-graph.v1"
  });
}

function toDefinitionDetail(
  definition: FlowDefinitionControlRecord,
  runtimeStatuses: ReadonlyMap<string, FlowDefinitionSummaryV2["runtimeStatus"]>
): FlowDefinitionDetailV2 {
  return flowDefinitionDetailV2Schema.parse({
    schemaVersion: "flow-definition-detail.v2",
    ...definition,
    runtimeStatus: runtimeStatuses.get(definition.id) ?? "draft",
    graphSchemaVersion: definition.draftGraph.schemaVersion,
    migrationRequired: definition.draftGraph.schemaVersion === "flow-graph.v1"
  });
}

function succeededCommand<T>(statusCode: 200 | 201, body: T) {
  return {
    kind: "created" as const,
    outcome: {
      kind: "succeeded" as const,
      response: { statusCode, body }
    }
  };
}

function rejectedCommand(response: FlowDefinitionCommandRejectionResponse) {
  return { kind: "created" as const, outcome: { kind: "rejected" as const, response } };
}

function flowDefinitionNotFoundCommand() {
  return rejectedCommand({
    statusCode: 404,
    body: { code: "FLOW_DEFINITION_NOT_FOUND" }
  });
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
  const foreignFlow = toFlow(foreignFlowId, {
    ownerUserId: foreignOwnerUserId,
    name: "Foreign flow",
    approvalMode: "manual_approve",
    draftGraph: validGraph(),
    now: now.toISOString()
  });
  const activationFlow: FlowRecord = {
    ...toFlow(activationFlowId, {
      ownerUserId,
      name: "Activation flow",
      approvalMode: "manual_approve",
      draftGraph: validGraph(),
      now: now.toISOString()
    }),
    status: "published",
    publishedVersionId: activationVersionId,
    publishedVersion: 1,
    publishedAt: now.toISOString()
  };
  const flows: FlowRecord[] = [runtimeFlow, activationFlow, foreignFlow];
  const versions: Array<Awaited<ReturnType<FlowStore["findPublishedVersionByFlowId"]>>> = [
    {
      id: runtimeVersionId,
      flowId: runtimeFlowId,
      version: 1,
      status: "published" as const,
      approvalMode: "manual_approve" as const,
      graph: validGraph(),
      publishedAt: now.toISOString()
    },
    {
      id: activationVersionId,
      flowId: activationFlowId,
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
      async (input) => versions.find((version) => version?.flowId === input.flowId) ?? null
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

function createRunCancellationStore(): FlowRunCancellationStore {
  return {
    executeCancel: vi.fn(async () => ({
      kind: "created" as const,
      outcome: {
        kind: "succeeded" as const,
        response: {
          statusCode: 200 as const,
          body: {
            run: {
              id: legacyRunId,
              flowId: runtimeFlowId,
              flowVersionId: runtimeVersionId,
              ownerUserId,
              sourceEventId: "legacy-run-cancel",
              status: "canceled" as const,
              snapshot: {
                schemaVersion: "flow-run-snapshot.v1" as const,
                flowVersionId: runtimeVersionId,
                sourceEventId: "legacy-run-cancel",
                subjectType: "client" as const,
                subjectId: clientUserId,
                occurredAt: now.toISOString(),
                timeZone: "Europe/Moscow",
                consent: {},
                channels: {},
                payload: {}
              },
              currentNodeId: "completed",
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
              completedAt: now.toISOString()
            }
          }
        }
      }
    }))
  };
}

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
          completedAt:
            step.status === "completed" || step.status === "failed_terminal" ? input.run.now : null
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
    createSuppression: vi.fn(async () =>
      raise("Suppressions are created through createRunForEventDedupe")
    ),
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

function stripRuntimeEventId(run: StoredRun | null): FlowRunResponse | null {
  if (!run) return null;
  return toRunResponse(run);
}

function toRunResponse(run: StoredRun): FlowRunResponse {
  const { runtimeEventId, ...response } = run;
  void runtimeEventId;
  return response;
}

function stripOwnerUserId(approval: StoredApproval): FlowApproval {
  const { ownerUserId, ...response } = approval;
  void ownerUserId;
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

function validCreateBody() {
  return {
    schemaVersion: "flow-definition-create.v2",
    name: "Welcome flow",
    locale: "ru",
    source: { type: "blank" }
  };
}

function validMigrationBody() {
  return {
    schemaVersion: "flow-definition-migrate.v2",
    expectedRevision: 1,
    targetGraphSchemaVersion: "flow-graph.v2"
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

function migratableGraph(): FlowGraph {
  return {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "manual",
        category: "trigger",
        kind: "manual",
        title: "Клиент выбран вручную",
        position: { x: 80, y: 120 },
        config: {}
      }
    ],
    edges: []
  };
}

function validGraphV2(): FlowGraphV2 {
  return {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Клиент выбран вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "completed",
        kind: "completed",
        displayTitle: "Подготовка завершена",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { goalKey: "consultation_prepared" }
      }
    ],
    edges: [
      {
        id: "manual-to-completed",
        sourceNodeId: "manual",
        targetNodeId: "completed",
        sourceHandle: "next"
      }
    ]
  };
}

function validPresentationV1(): FlowPresentationV1 {
  return {
    schemaVersion: "flow-presentation.v1",
    nodes: [
      { nodeId: "manual", position: { x: 80, y: 120 } },
      { nodeId: "completed", position: { x: 400, y: 120 } }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function raise(message: string): never {
  throw new Error(message);
}
