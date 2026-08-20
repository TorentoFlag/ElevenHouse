import {
  clientLifecycleModeSchema,
  clientLifecycleStatusSchema,
  clientRelationshipStatusSchema
} from "@elevenhouse/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";

import { clientLifecycleModeValues, clientLifecycleStatusValues } from "./client-lifecycle";
import {
  createClientCrmActivityItem,
  getAstrologerClientCrmDetail,
  listAstrologerClientCrmPage,
  updateAstrologerClientCrmPrivateProfile,
  type ClientCrmDetail,
  type ClientCrmActivityItemInput,
  type ClientCrmPrivateProfileStore,
  type ClientCrmReadStore
} from "./client-crm";

const occurredAt = "2026-08-20T10:00:00.000Z";

function detail(overrides: Partial<ClientCrmDetail> = {}): ClientCrmDetail {
  return {
    clientUserId: "client-1",
    displayName: "Client",
    relationship: {
      id: "relationship-1",
      status: "active",
      source: "direct_link",
      firstLinkedAt: occurredAt,
      lastLinkedAt: occurredAt
    },
    lifecycle: {
      status: "new",
      mode: "automatic",
      revision: 1,
      lastActivityAt: occurredAt
    },
    birthData: null,
    relatedBirthProfiles: [],
    readiness: {
      birthData: "missing",
      relatedProfiles: "ready"
    },
    privateCrm: {
      note: null,
      tags: [],
      updatedAt: occurredAt
    },
    activity: {
      items: [],
      nextCursor: null
    },
    ...overrides
  };
}

function store(overrides: Partial<ClientCrmReadStore> = {}): ClientCrmReadStore {
  return {
    async listAstrologerClientCrmPage() {
      return { kind: "found", page: { items: [], nextCursor: null } };
    },
    async getAstrologerClientCrmDetail() {
      return { kind: "found", detail: detail() };
    },
    ...overrides
  };
}

function privateProfileStore(
  overrides: Partial<ClientCrmPrivateProfileStore> = {}
): ClientCrmPrivateProfileStore {
  return {
    async updateAstrologerClientCrmPrivateProfile() {
      return {
        kind: "updated",
        profile: {
          note: "Needs birth time confirmation",
          tags: ["Natal"],
          updatedAt: occurredAt
        }
      };
    },
    ...overrides
  };
}

describe("Clients CRM domain read model", () => {
  it("keeps the CRM list relationship-scoped", async () => {
    let receivedInput: unknown;
    const result = await listAstrologerClientCrmPage({
      store: store({
        async listAstrologerClientCrmPage(input) {
          receivedInput = input;
          return { kind: "found", page: { items: [], nextCursor: null } };
        }
      }),
      astrologerUserId: "astrologer-1",
      query: { query: "  Ada   Lovelace  ", limit: 20 }
    });

    expect(result).toEqual({ kind: "found", page: { items: [], nextCursor: null } });
    expect(receivedInput).toEqual({
      astrologerUserId: "astrologer-1",
      query: {
        query: "Ada Lovelace",
        cursor: null,
        limit: 20,
        lifecycle: undefined,
        source: undefined,
        sort: "last_linked_at_desc"
      }
    });
  });

  it("normalizes a blank CRM list query to the contract default", async () => {
    let receivedInput: unknown;
    await listAstrologerClientCrmPage({
      store: store({
        async listAstrologerClientCrmPage(input) {
          receivedInput = input;
          return { kind: "found", page: { items: [], nextCursor: null } };
        }
      }),
      astrologerUserId: "astrologer-1",
      query: { query: "   " }
    });

    expect(receivedInput).toMatchObject({ query: { query: "" } });
  });

  it("preserves relationship access denial results", async () => {
    for (const kind of ["not_related", "blocked_or_archived"] as const) {
      const result = await getAstrologerClientCrmDetail({
        store: store({
          async getAstrologerClientCrmDetail() {
            return { kind };
          }
        }),
        astrologerUserId: "astrologer-1",
        clientUserId: "client-1"
      });

      expect(result).toEqual({ kind });
    }
  });

  it("adds service work from source-owned booking and session readers", async () => {
    let financeReaderCalled = false;
    const result = await getAstrologerClientCrmDetail({
      store: store(),
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1",
      now: "2026-08-20T10:00:00.000Z",
      serviceWorkSources: {
        bookings: {
          async listClientServiceWorkBookings(input: unknown) {
            expect(input).toEqual({
              ownerUserId: "astrologer-1",
              clientUserId: "client-1",
              now: "2026-08-20T10:00:00.000Z",
              limit: 3
            });
            return {
              upcomingTotal: 1,
              upcoming: [
                {
                  id: "booking-1",
                  state: "confirmed",
                  productTitle: "Natal consultation",
                  startAt: "2026-08-21T10:00:00.000Z",
                  endAt: "2026-08-21T11:00:00.000Z",
                  timeZone: "Europe/Moscow",
                  href: "/calendar?bookingId=booking-1&startAt=2026-08-21T10%3A00%3A00.000Z"
                }
              ],
              recentTotal: 0,
              recent: []
            };
          }
        },
        sessions: {
          async listClientServiceWorkSessions(input: unknown) {
            expect(input).toEqual({
              ownerUserId: "astrologer-1",
              clientUserId: "client-1",
              now: "2026-08-20T10:00:00.000Z",
              limit: 3
            });
            return {
              upcomingTotal: 1,
              upcoming: [
                {
                  id: "session-1",
                  bookingId: "booking-1",
                  state: "scheduled",
                  productTitle: "Natal consultation",
                  scheduledStartAt: "2026-08-21T10:00:00.000Z",
                  scheduledEndAt: "2026-08-21T11:00:00.000Z",
                  timeZone: "Europe/Moscow",
                  href: "/sessions/session-1"
                }
              ],
              recentTotal: 0,
              recent: []
            };
          }
        },
        finance: {
          async listClientServiceWorkFinance(input: unknown) {
            financeReaderCalled = true;
            expect(input).toEqual({
              ownerUserId: "astrologer-1",
              clientUserId: "client-1",
              now: "2026-08-20T10:00:00.000Z",
              limit: 3
            });
            return {
              orders: {
                recentTotal: 1,
                recent: [
                  {
                    id: "order-1",
                    status: "paid",
                    productTitle: "Natal consultation",
                    amountMinor: 12_000,
                    currency: "RUB",
                    bookingId: "booking-1",
                    createdAt: "2026-08-20T09:00:00.000Z",
                    updatedAt: "2026-08-20T09:05:00.000Z"
                  }
                ]
              },
              payments: {
                recentTotal: 1,
                recent: [
                  {
                    id: "payment-1",
                    orderId: "order-1",
                    status: "captured",
                    amountMinor: 12_000,
                    currency: "RUB",
                    createdAt: "2026-08-20T09:01:00.000Z",
                    updatedAt: "2026-08-20T09:05:00.000Z"
                  }
                ]
              }
            };
          }
        }
      }
    } as unknown as Parameters<typeof getAstrologerClientCrmDetail>[0]);

    expect(financeReaderCalled).toBe(true);
    expect(result).toMatchObject({
      kind: "found",
      detail: {
        serviceWork: {
          status: "available",
          bookings: { upcomingTotal: 1, recentTotal: 0 },
          sessions: { upcomingTotal: 1, recentTotal: 0 },
          orders: { recentTotal: 1 },
          payments: { recentTotal: 1 }
        }
      }
    });
  });

  it("maps source reader failures to unavailable service work", async () => {
    const result = await getAstrologerClientCrmDetail({
      store: store(),
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1",
      now: "2026-08-20T10:00:00.000Z",
      serviceWorkSources: {
        bookings: {
          async listClientServiceWorkBookings() {
            return { kind: "unavailable", retryable: true };
          }
        },
        sessions: {
          async listClientServiceWorkSessions() {
            throw new Error("Should not read sessions after booking source failure");
          }
        }
      }
    } as unknown as Parameters<typeof getAstrologerClientCrmDetail>[0]);

    expect(result).toMatchObject({
      kind: "found",
      detail: {
        serviceWork: {
          status: "unavailable",
          source: "bookings",
          code: "summary_unavailable",
          retryable: true
        }
      }
    });
  });

  it("maps finance reader failures to unavailable service work without dropping booking and session isolation", async () => {
    const result = await getAstrologerClientCrmDetail({
      store: store(),
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1",
      now: "2026-08-20T10:00:00.000Z",
      serviceWorkSources: {
        bookings: {
          async listClientServiceWorkBookings() {
            return {
              upcomingTotal: 0,
              upcoming: [],
              recentTotal: 0,
              recent: []
            };
          }
        },
        sessions: {
          async listClientServiceWorkSessions() {
            return {
              upcomingTotal: 0,
              upcoming: [],
              recentTotal: 0,
              recent: []
            };
          }
        },
        finance: {
          async listClientServiceWorkFinance() {
            return { kind: "unavailable", retryable: false };
          }
        }
      }
    } as unknown as Parameters<typeof getAstrologerClientCrmDetail>[0]);

    expect(result).toMatchObject({
      kind: "found",
      detail: {
        serviceWork: {
          status: "unavailable",
          source: "finance",
          code: "summary_unavailable",
          retryable: false
        }
      }
    });
  });

  it("returns invalid_command without querying the read store", async () => {
    let called = false;
    const result = await getAstrologerClientCrmDetail({
      store: store({
        async getAstrologerClientCrmDetail() {
          called = true;
          return { kind: "not_found" };
        }
      }),
      astrologerUserId: " ",
      clientUserId: "client-1"
    });

    expect(result).toEqual({ kind: "invalid_command" });
    expect(called).toBe(false);
  });

  it("normalizes astrologer-private CRM profile updates before persistence", async () => {
    let receivedInput: unknown;
    const result = await updateAstrologerClientCrmPrivateProfile({
      store: privateProfileStore({
        async updateAstrologerClientCrmPrivateProfile(input) {
          receivedInput = input;
          return {
            kind: "updated",
            profile: {
              note: input.profile.note,
              tags: input.profile.tags,
              updatedAt: input.now
            }
          };
        }
      }),
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1",
      profile: {
        note: "  Needs   birth time confirmation  ",
        tags: [" Natal ", "natal", "", "Follow-up"]
      },
      now: "2026-08-20T10:00:00.000Z"
    });

    expect(result).toEqual({
      kind: "updated",
      profile: {
        note: "Needs birth time confirmation",
        tags: ["Natal", "Follow-up"],
        updatedAt: "2026-08-20T10:00:00.000Z"
      }
    });
    expect(receivedInput).toEqual({
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1",
      profile: {
        note: "Needs birth time confirmation",
        tags: ["Natal", "Follow-up"]
      },
      now: "2026-08-20T10:00:00.000Z"
    });
  });

  it("rejects invalid private CRM commands without querying the private store", async () => {
    let called = false;
    const result = await updateAstrologerClientCrmPrivateProfile({
      store: privateProfileStore({
        async updateAstrologerClientCrmPrivateProfile() {
          called = true;
          throw new Error("Should not be called");
        }
      }),
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1",
      profile: {
        note: null,
        tags: ["x".repeat(65)]
      },
      now: "2026-08-20T10:00:00.000Z"
    } as unknown as Parameters<typeof updateAstrologerClientCrmPrivateProfile>[0]);

    expect(result).toEqual({ kind: "invalid_command" });
    expect(called).toBe(false);
  });

  it("sorts activity by occurredAt descending and id descending", async () => {
    const result = await getAstrologerClientCrmDetail({
      store: store({
        async getAstrologerClientCrmDetail() {
          return {
            kind: "found",
            detail: detail({
              activity: {
                items: [
                  createClientCrmActivityItem({
                    id: "clients:birth-data:b",
                    kind: "birth_data_updated",
                    occurredAt: "2026-08-20T10:00:00.000+03:00",
                    source: { module: "clients", revision: 1 }
                  }),
                  createClientCrmActivityItem({
                    id: "clients:birth-data:c",
                    kind: "birth_data_updated",
                    occurredAt: "2026-08-20T08:00:00.000Z",
                    source: { module: "clients", revision: 1 }
                  }),
                  createClientCrmActivityItem({
                    id: "clients:birth-data:a",
                    kind: "birth_data_updated",
                    occurredAt,
                    source: { module: "clients", revision: 2 }
                  }),
                  createClientCrmActivityItem({
                    id: "clients:lifecycle:b",
                    kind: "lifecycle_changed",
                    occurredAt,
                    source: {
                      module: "clients",
                      previousStatus: "new",
                      status: "active",
                      mode: "automatic"
                    }
                  })
                ],
                nextCursor: null
              }
            })
          };
        }
      }),
      astrologerUserId: "astrologer-1",
      clientUserId: "client-1"
    });

    expect(result).toMatchObject({ kind: "found" });
    if (result.kind === "found") {
      expect(result.detail.activity.items.map((item) => item.id)).toEqual([
        "clients:lifecycle:b",
        "clients:birth-data:a",
        "clients:birth-data:c",
        "clients:birth-data:b"
      ]);
    }
  });

  it("maps already-minimized source facts without activity text or sensitive fields", () => {
    const activity = createClientCrmActivityItem({
      id: "clients:birth-data:1",
      kind: "birth_data_updated",
      occurredAt,
      source: { module: "clients", revision: 3 },
      href: "/clients/client-1"
    });

    expect(activity).toEqual({
      id: "clients:birth-data:1",
      kind: "birth_data_updated",
      occurredAt,
      metadata: { revision: 3 },
      href: "/clients/client-1"
    });
    expect(activity).not.toHaveProperty("title");
    expect(activity).not.toHaveProperty("source");
    expectTypeOf(activity).not.toHaveProperty("messageBody");
  });

  it("rejects non-Clients activity sources instead of redacting them after input", () => {
    expect(() =>
      createClientCrmActivityItem({
        id: "clients:birth-data:1",
        kind: "birth_data_updated",
        occurredAt,
        source: { module: "messaging", messageBody: "private" }
      } as unknown as ClientCrmActivityItemInput)
    ).toThrow("CRM activity source module is invalid");
  });

  it("shares lifecycle vocabulary with the CRM contract and keeps relationship statuses separate", () => {
    expect(clientLifecycleStatusSchema.options).toEqual(clientLifecycleStatusValues);
    expect(clientLifecycleModeSchema.options).toEqual(clientLifecycleModeValues);
    for (const lifecycleStatus of ["new", "waiting_for_client", "in_service", "inactive"]) {
      expect(clientRelationshipStatusSchema.safeParse(lifecycleStatus).success).toBe(false);
    }
  });
});
