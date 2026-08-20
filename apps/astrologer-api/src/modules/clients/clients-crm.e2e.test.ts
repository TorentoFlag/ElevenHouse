import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ClientCrmReadStore } from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SystemClock } from "../clock/system-clock.service";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import type { ClientBirthPlaceSearchProvider } from "./birth-place-search.provider";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";

const astrologerUserId = "10000000-0000-4000-8000-000000000001";
const foreignAstrologerUserId = "10000000-0000-4000-8000-000000000002";
const clientUserId = "10000000-0000-4000-8000-000000000003";
const unrelatedClientUserId = "10000000-0000-4000-8000-000000000004";
const archivedClientUserId = "10000000-0000-4000-8000-000000000005";
const blockedClientUserId = "10000000-0000-4000-8000-000000000006";

describe("Clients CRM HTTP API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let crmStore: ClientCrmReadStore;

  beforeEach(async () => {
    crmStore = createCrmReadStore();
    const service = new ClientsService(
      {} as never,
      { now: () => new Date("2026-08-20T10:00:00.000Z") } as SystemClock,
      birthPlaceSearchProvider(),
      crmStore
    );
    const builder = Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: service },
        { provide: Reflector, useValue: new Reflector() },
        { provide: ConfigService, useValue: { getOrThrow: () => "astrologer_session" } },
        { provide: AstrologerCsrfTokenService, useValue: { assertValidRequest: () => undefined } },
        CsrfGuard
      ]
    });
    builder.overrideGuard(AstrologerSessionAuthGuard).useValue({
      canActivate(context: {
        switchToHttp(): { getRequest(): AstrologerSessionRequest & { headers: Record<string, string> } };
      }) {
        const request = context.switchToHttp().getRequest();
        const role = request.headers["x-test-role"];
        if (role === "missing") return true;
        request.currentAstrologerAccount = {
          account: {
            id: role === "foreign" ? foreignAstrologerUserId : astrologerUserId,
            status: "active",
            roles: ["astrologer"]
          }
        };
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

  it("registers the CRM list before the client id parameter route and derives its owner from session", async () => {
    const response = await request("/clients/crm?limit=1", { role: "astrologer" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [crmListItem()], nextCursor: null });
    expect(crmStore.listAstrologerClientCrmPage).toHaveBeenCalledWith({
      astrologerUserId,
      query: {
        query: "",
        cursor: null,
        limit: 1,
        lifecycle: undefined,
        source: undefined,
        sort: "last_linked_at_desc"
      }
    });
  });

  it("rejects missing session authority and maps a tampered list cursor to 400", async () => {
    const unauthenticated = await request("/clients/crm", { role: "missing" });
    expect(unauthenticated.status).toBe(401);

    const tampered = await request("/clients/crm?cursor=tampered", { role: "astrologer" });
    expect(tampered.status).toBe(400);
  });

  it("conceals unrelated, archived, and blocked CRM details", async () => {
    for (const value of [unrelatedClientUserId, archivedClientUserId, blockedClientUserId]) {
      const response = await request(`/clients/crm/${value}`, { role: "astrologer" });
      expect(response.status).toBe(404);
    }
  });

  it("returns a strict CRM detail without Messaging fields", async () => {
    const response = await request(`/clients/crm/${clientUserId}`, { role: "astrologer" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ client: crmDetail() });
    expect(JSON.stringify(response.body)).not.toMatch(
      /messageBody|providerPayload|preview|composer/i
    );
  });

  it("returns only the redacted CRM activity page", async () => {
    const response = await request(`/clients/crm/${clientUserId}/activity`, { role: "astrologer" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          id: "clients:relationship:10000000-0000-4000-8000-000000000007",
          kind: "relationship_created",
          occurredAt: "2026-08-20T10:00:00.000Z",
          metadata: { source: "direct_link" }
        }
      ],
      nextCursor: null
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /messageBody|providerPayload|preview|composer/i
    );
  });

  it("rejects CRM activity pagination until an activity reader exists", async () => {
    const cursor = await request(`/clients/crm/${clientUserId}/activity?cursor=tampered`, {
      role: "astrologer"
    });
    expect(cursor.status).toBe(400);

    const limit = await request(`/clients/crm/${clientUserId}/activity?limit=1`, {
      role: "astrologer"
    });
    expect(limit.status).toBe(400);
  });

  it("maps a CRM persistence conflict to an observable 409", async () => {
    const response = await request(`/clients/crm/${foreignAstrologerUserId}`, { role: "astrologer" });
    expect(response.status).toBe(409);
  });

  it("keeps the birth-place literal route out of the client id parameter route", async () => {
    const response = await request("/clients/birth-places?query=Moscow", { role: "astrologer" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ candidates: [] });
  });

  async function request(path: string, input: { readonly role: string }) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { "x-test-role": input.role } });
    return { status: response.status, body: await response.json() };
  }
});

function createCrmReadStore(): ClientCrmReadStore {
  return {
    listAstrologerClientCrmPage: vi.fn().mockImplementation(({ query }) => {
      if (query.cursor === "tampered") return Promise.resolve({ kind: "invalid_command" });
      return Promise.resolve({ kind: "found", page: { items: [crmListItem()], nextCursor: null } });
    }),
    getAstrologerClientCrmDetail: vi.fn().mockImplementation(({ clientUserId: requestedClientUserId }) => {
      if (requestedClientUserId === unrelatedClientUserId) return Promise.resolve({ kind: "not_related" });
      if (requestedClientUserId === archivedClientUserId || requestedClientUserId === blockedClientUserId) {
        return Promise.resolve({ kind: "blocked_or_archived" });
      }
      if (requestedClientUserId === foreignAstrologerUserId) return Promise.resolve({ kind: "conflict" });
      return Promise.resolve({ kind: "found", detail: crmDetail() });
    })
  };
}

function birthPlaceSearchProvider(): ClientBirthPlaceSearchProvider {
  return {
    search: vi.fn().mockResolvedValue({ candidates: [] }),
    resolveReference: vi.fn()
  };
}

function crmDetail() {
  return {
    clientUserId,
    displayName: "Client",
    relationship: {
      id: "10000000-0000-4000-8000-000000000007",
      status: "active" as const,
      source: "direct_link" as const,
      firstLinkedAt: "2026-08-20T10:00:00.000Z",
      lastLinkedAt: "2026-08-20T10:00:00.000Z"
    },
    lifecycle: {
      status: "new" as const,
      mode: "automatic" as const,
      revision: 1,
      lastActivityAt: "2026-08-20T10:00:00.000Z"
    },
    birthData: null,
    relatedBirthProfiles: [],
    readiness: { birthData: "missing" as const, relatedProfiles: "ready" as const },
    activity: {
      items: [
        {
          id: "clients:relationship:10000000-0000-4000-8000-000000000007",
          kind: "relationship_created" as const,
          occurredAt: "2026-08-20T10:00:00.000Z",
          metadata: { source: "direct_link" as const }
        }
      ],
      nextCursor: null
    }
  };
}

function crmListItem() {
  const { birthData, relatedBirthProfiles, activity, ...item } = crmDetail();
  void birthData;
  void relatedBirthProfiles;
  void activity;
  return item;
}
