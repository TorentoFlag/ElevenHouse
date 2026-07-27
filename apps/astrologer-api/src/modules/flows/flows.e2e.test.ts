import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  flowResponseSchema,
  listFlowTemplatesResponseSchema,
  listFlowsResponseSchema,
  publishFlowResponseSchema,
  type FlowGraph
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  FlowRecord,
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
import { FLOW_STORE } from "./flows.tokens";

const now = new Date("2026-07-27T06:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
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

  beforeEach(async () => {
    flowStore = createFlowStore();
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
  const flows: FlowRecord[] = [];
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
    })
  };
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
