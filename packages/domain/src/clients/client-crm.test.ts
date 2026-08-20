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
  type ClientCrmDetail,
  type ClientCrmActivityItemInput,
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
