import "reflect-metadata";

import { ForbiddenException, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ClientCrmPrivateProfileStore, ClientCrmReadStore } from "@elevenhouse/domain";
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
  let crmStore: ClientCrmReadStore & ClientCrmPrivateProfileStore;
  let bookingServiceWorkReader: {
    readonly listClientServiceWorkBookings: ReturnType<typeof vi.fn>;
  };
  let sessionServiceWorkReader: {
    readonly listClientServiceWorkSessions: ReturnType<typeof vi.fn>;
  };
  let financeServiceWorkReader: {
    readonly listClientServiceWorkFinance: ReturnType<typeof vi.fn>;
  };
  let csrfTokenService: {
    readonly assertValidRequest: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    crmStore = createCrmReadStore();
    bookingServiceWorkReader = {
      listClientServiceWorkBookings: vi.fn().mockResolvedValue({
        upcomingTotal: 1,
        upcoming: [
          {
            id: "10000000-0000-4000-8000-000000000020",
            state: "confirmed",
            productTitle: "Natal consultation",
            startAt: "2026-08-21T10:00:00.000Z",
            endAt: "2026-08-21T11:00:00.000Z",
            timeZone: "Europe/Moscow",
            href: "/calendar?bookingId=10000000-0000-4000-8000-000000000020&startAt=2026-08-21T10%3A00%3A00.000Z"
          }
        ],
        recentTotal: 0,
        recent: []
      })
    };
    sessionServiceWorkReader = {
      listClientServiceWorkSessions: vi.fn().mockResolvedValue({
        upcomingTotal: 0,
        upcoming: [],
        recentTotal: 1,
        recent: [
          {
            id: "10000000-0000-4000-8000-000000000021",
            bookingId: "10000000-0000-4000-8000-000000000020",
            state: "ended",
            productTitle: "Natal consultation",
            scheduledStartAt: "2026-08-19T10:00:00.000Z",
            scheduledEndAt: "2026-08-19T11:00:00.000Z",
            timeZone: "Europe/Moscow",
            href: "/sessions/10000000-0000-4000-8000-000000000021"
          }
        ]
      })
    };
    financeServiceWorkReader = {
      listClientServiceWorkFinance: vi.fn().mockResolvedValue({
        orders: {
          recentTotal: 1,
          recent: [
            {
              id: "10000000-0000-4000-8000-000000000022",
              status: "paid",
              productTitle: "Natal consultation",
              amountMinor: 12000,
              currency: "RUB",
              bookingId: "10000000-0000-4000-8000-000000000020",
              createdAt: "2026-08-20T09:00:00.000Z",
              updatedAt: "2026-08-20T09:05:00.000Z"
            }
          ]
        },
        payments: {
          recentTotal: 1,
          recent: [
            {
              id: "10000000-0000-4000-8000-000000000023",
              orderId: "10000000-0000-4000-8000-000000000022",
              status: "captured",
              amountMinor: 12000,
              currency: "RUB",
              createdAt: "2026-08-20T09:01:00.000Z",
              updatedAt: "2026-08-20T09:05:00.000Z"
            }
          ]
        }
      })
    };
    csrfTokenService = {
      assertValidRequest: vi.fn()
    };
    const service = new (ClientsService as new (...args: unknown[]) => ClientsService)(
      {} as never,
      { now: () => new Date("2026-08-20T10:00:00.000Z") } as SystemClock,
      birthPlaceSearchProvider(),
      crmStore,
      bookingServiceWorkReader,
      sessionServiceWorkReader,
      financeServiceWorkReader
    );
    const builder = Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: service },
        { provide: Reflector, useValue: new Reflector() },
        { provide: ConfigService, useValue: { getOrThrow: () => "astrologer_session" } },
        { provide: AstrologerCsrfTokenService, useValue: csrfTokenService },
        CsrfGuard
      ]
    });
    builder.overrideGuard(AstrologerSessionAuthGuard).useValue({
      canActivate(context: {
        switchToHttp(): {
          getRequest(): AstrologerSessionRequest & { headers: Record<string, string> };
        };
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
    expect(response.body).toEqual({ client: crmDetail({ serviceWork: serviceWorkSummary() }) });
    expect(bookingServiceWorkReader.listClientServiceWorkBookings).toHaveBeenCalledWith({
      ownerUserId: astrologerUserId,
      clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      limit: 3
    });
    expect(sessionServiceWorkReader.listClientServiceWorkSessions).toHaveBeenCalledWith({
      ownerUserId: astrologerUserId,
      clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      limit: 3
    });
    expect(financeServiceWorkReader.listClientServiceWorkFinance).toHaveBeenCalledWith({
      ownerUserId: astrologerUserId,
      clientUserId,
      now: "2026-08-20T10:00:00.000Z",
      limit: 3
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /messageBody|providerPayload|providerPaymentId|providerCheckoutId|policySnapshot|preview|composer/i
    );
  });

  it("updates astrologer-private CRM profile through the session-owned relationship", async () => {
    const response = await request(`/clients/crm/${clientUserId}/private-profile`, {
      role: "astrologer",
      method: "PUT",
      body: {
        note: "  Needs   birth time confirmation  ",
        tags: [" Natal ", "natal", "Follow-up"]
      }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      privateCrm: {
        note: "Needs birth time confirmation",
        tags: ["Natal", "Follow-up"],
        updatedAt: "2026-08-20T10:00:00.000Z"
      }
    });
    expect(crmStore.updateAstrologerClientCrmPrivateProfile).toHaveBeenCalledWith({
      astrologerUserId,
      clientUserId,
      profile: {
        note: "Needs birth time confirmation",
        tags: ["Natal", "Follow-up"]
      },
      now: "2026-08-20T10:00:00.000Z"
    });
    expect(JSON.stringify(response.body)).not.toMatch(/message|thread|composer/i);
  });

  it("requires session authority and CSRF for private CRM profile updates", async () => {
    const unauthenticated = await request(`/clients/crm/${clientUserId}/private-profile`, {
      role: "missing",
      method: "PUT",
      body: { note: null, tags: [] }
    });
    expect(unauthenticated.status).toBe(401);

    csrfTokenService.assertValidRequest.mockImplementationOnce(() => {
      throw new ForbiddenException("Invalid CSRF token");
    });

    const invalidCsrf = await request(`/clients/crm/${clientUserId}/private-profile`, {
      role: "astrologer",
      method: "PUT",
      body: { note: null, tags: [] }
    });
    expect(invalidCsrf.status).toBe(403);
    expect(crmStore.updateAstrologerClientCrmPrivateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ profile: { note: null, tags: [] } })
    );
  });

  it("rejects invalid private CRM profile update payloads before persistence", async () => {
    for (const body of [
      { note: "x".repeat(2001), tags: [] },
      { note: null, tags: ["x".repeat(65)] },
      {
        note: null,
        tags: Array.from({ length: 13 }, (_, index) => `tag-${index + 1}`)
      }
    ]) {
      const response = await request(`/clients/crm/${clientUserId}/private-profile`, {
        role: "astrologer",
        method: "PUT",
        body
      });
      expect(response.status).toBe(400);
    }
    expect(crmStore.updateAstrologerClientCrmPrivateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ note: "x".repeat(2001) })
      })
    );
  });

  it("conceals private CRM profile updates for unrelated, archived and blocked clients", async () => {
    for (const value of [unrelatedClientUserId, archivedClientUserId, blockedClientUserId]) {
      const response = await request(`/clients/crm/${value}/private-profile`, {
        role: "astrologer",
        method: "PUT",
        body: { note: null, tags: [] }
      });
      expect(response.status).toBe(404);
    }
  });

  it("keeps service-work source failures observable in the CRM detail response", async () => {
    bookingServiceWorkReader.listClientServiceWorkBookings.mockRejectedValueOnce(
      new Error("booking reader unavailable")
    );

    const response = await request(`/clients/crm/${clientUserId}`, { role: "astrologer" });

    expect(response.status).toBe(200);
    expect(response.body.client.serviceWork).toEqual({
      status: "unavailable",
      source: "bookings",
      code: "summary_unavailable",
      retryable: true
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /messageBody|providerPayload|providerRoom|composer/i
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
    const response = await request(`/clients/crm/${foreignAstrologerUserId}`, {
      role: "astrologer"
    });
    expect(response.status).toBe(409);
  });

  it("keeps the birth-place literal route out of the client id parameter route", async () => {
    const response = await request("/clients/birth-places?query=Moscow", { role: "astrologer" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ candidates: [] });
  });

  async function request(
    path: string,
    input: {
      readonly role: string;
      readonly method?: string;
      readonly csrfCookie?: boolean;
      readonly body?: unknown;
    }
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: input.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(input.method && input.method !== "GET" && input.csrfCookie !== false
          ? { cookie: "astrologer_session=test-session" }
          : {}),
        "x-test-role": input.role
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body)
    });
    return { status: response.status, body: await response.json() };
  }
});

function createCrmReadStore(): ClientCrmReadStore & ClientCrmPrivateProfileStore {
  return {
    listAstrologerClientCrmPage: vi.fn().mockImplementation(({ query }) => {
      if (query.cursor === "tampered") return Promise.resolve({ kind: "invalid_command" });
      return Promise.resolve({ kind: "found", page: { items: [crmListItem()], nextCursor: null } });
    }),
    getAstrologerClientCrmDetail: vi
      .fn()
      .mockImplementation(({ clientUserId: requestedClientUserId }) => {
        if (requestedClientUserId === unrelatedClientUserId)
          return Promise.resolve({ kind: "not_related" });
        if (
          requestedClientUserId === archivedClientUserId ||
          requestedClientUserId === blockedClientUserId
        ) {
          return Promise.resolve({ kind: "blocked_or_archived" });
        }
        if (requestedClientUserId === foreignAstrologerUserId)
          return Promise.resolve({ kind: "conflict" });
        return Promise.resolve({ kind: "found", detail: crmDetail() });
      }),
    updateAstrologerClientCrmPrivateProfile: vi
      .fn()
      .mockImplementation(({ clientUserId: requestedClientUserId, profile, now }) => {
        if (requestedClientUserId === unrelatedClientUserId)
          return Promise.resolve({ kind: "not_related" });
        if (
          requestedClientUserId === archivedClientUserId ||
          requestedClientUserId === blockedClientUserId
        ) {
          return Promise.resolve({ kind: "blocked_or_archived" });
        }
        return Promise.resolve({
          kind: "updated",
          profile: {
            note: profile.note,
            tags: profile.tags,
            updatedAt: now
          }
        });
      })
  };
}

function birthPlaceSearchProvider(): ClientBirthPlaceSearchProvider {
  return {
    search: vi.fn().mockResolvedValue({ candidates: [] }),
    resolveReference: vi.fn()
  };
}

function crmDetail(overrides: Record<string, unknown> = {}) {
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
    privateCrm: {
      note: null,
      tags: [],
      updatedAt: "2026-08-20T10:00:00.000Z"
    },
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
    },
    ...overrides
  };
}

function serviceWorkSummary() {
  return {
    status: "available",
    bookings: {
      upcomingTotal: 1,
      upcoming: [
        {
          id: "10000000-0000-4000-8000-000000000020",
          state: "confirmed",
          productTitle: "Natal consultation",
          startAt: "2026-08-21T10:00:00.000Z",
          endAt: "2026-08-21T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: "/calendar?bookingId=10000000-0000-4000-8000-000000000020&startAt=2026-08-21T10%3A00%3A00.000Z"
        }
      ],
      recentTotal: 0,
      recent: []
    },
    sessions: {
      upcomingTotal: 0,
      upcoming: [],
      recentTotal: 1,
      recent: [
        {
          id: "10000000-0000-4000-8000-000000000021",
          bookingId: "10000000-0000-4000-8000-000000000020",
          state: "ended",
          productTitle: "Natal consultation",
          scheduledStartAt: "2026-08-19T10:00:00.000Z",
          scheduledEndAt: "2026-08-19T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: "/sessions/10000000-0000-4000-8000-000000000021"
        }
      ]
    },
    orders: {
      recentTotal: 1,
      recent: [
        {
          id: "10000000-0000-4000-8000-000000000022",
          status: "paid",
          productTitle: "Natal consultation",
          amountMinor: 12000,
          currency: "RUB",
          bookingId: "10000000-0000-4000-8000-000000000020",
          createdAt: "2026-08-20T09:00:00.000Z",
          updatedAt: "2026-08-20T09:05:00.000Z"
        }
      ]
    },
    payments: {
      recentTotal: 1,
      recent: [
        {
          id: "10000000-0000-4000-8000-000000000023",
          orderId: "10000000-0000-4000-8000-000000000022",
          status: "captured",
          amountMinor: 12000,
          currency: "RUB",
          createdAt: "2026-08-20T09:01:00.000Z",
          updatedAt: "2026-08-20T09:05:00.000Z"
        }
      ]
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
