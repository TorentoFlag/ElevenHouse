import { describe, expect, it } from "vitest";

import {
  astrologerClientCrmDetailResponseSchema,
  astrologerClientCrmListQuerySchema,
  clientCrmActivityItemSchema,
  clientCrmActivityPageResponseSchema,
  clientCrmLifecycleSchema,
  clientCrmRelationshipSchema,
  clientLifecycleStatusSchema
} from "./clients";

const clientUserId = "018f7f0a-6d77-7f72-9b63-7e24c9901111";
const relationshipId = "018f7f0a-6d77-7f72-9b63-7e24c9902222";
const relatedProfileId = "018f7f0a-6d77-7f72-9b63-7e24c9903333";
const bookingId = "018f7f0a-6d77-7f72-9b63-7e24c9905555";
const sessionId = "018f7f0a-6d77-7f72-9b63-7e24c9906666";
const occurredAt = "2026-08-20T10:00:00.000Z";
const laterAt = "2026-08-21T10:00:00.000Z";

function activityItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "clients:lifecycle:018f7f0a-6d77-7f72-9b63-7e24c9904444",
    occurredAt,
    kind: "lifecycle_changed",
    metadata: {
      previousStatus: "new",
      status: "active",
      mode: "automatic"
    },
    ...overrides
  };
}

function relatedBirthProfile() {
  return {
    id: relatedProfileId,
    clientUserId,
    displayName: "Partner",
    relationshipLabel: "Partner",
    birthDate: "1990-01-01",
    birthTime: null,
    birthTimePrecision: "unknown",
    birthPlaceText: null,
    birthCountryCode: null,
    birthCity: null,
    birthRegion: null,
    birthTimezone: null,
    birthTimeDstOccurrence: null,
    birthLatitude: null,
    birthLongitude: null,
    source: "manual",
    revision: 1,
    lastEditedByUserId: clientUserId,
    lastEditedByRole: "astrologer",
    createdAt: occurredAt,
    updatedAt: occurredAt
  };
}

function detailResponse(overrides: Record<string, unknown> = {}) {
  return {
    client: {
      clientUserId,
      displayName: "Client",
      relationship: {
        id: relationshipId,
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
    }
  };
}

describe("Clients CRM contracts", () => {
  it("normalizes the fixed CRM list query and rejects offset pagination", () => {
    expect(
      astrologerClientCrmListQuerySchema.parse({
        query: "  Ada   Lovelace ",
        cursor: "opaque-server-token",
        limit: "25",
        lifecycle: "waiting_for_client",
        source: "booking",
        sort: "last_linked_at_desc"
      })
    ).toEqual({
      query: "Ada Lovelace",
      cursor: "opaque-server-token",
      limit: 25,
      lifecycle: "waiting_for_client",
      source: "booking",
      sort: "last_linked_at_desc"
    });
    expect(astrologerClientCrmListQuerySchema.safeParse({ offset: 0 }).success).toBe(false);
    expect(astrologerClientCrmListQuerySchema.safeParse({ sort: "name_asc" }).success).toBe(false);
    expect(astrologerClientCrmListQuerySchema.safeParse({ cursor: "x".repeat(513) }).success).toBe(false);
  });

  it("reuses lifecycle values without accepting lifecycle labels as relationship statuses", () => {
    for (const status of ["new", "active", "waiting_for_client", "in_service", "inactive"]) {
      expect(clientLifecycleStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(
      clientCrmLifecycleSchema.safeParse({
        status: "waiting_for_client",
        mode: "manual_override",
        revision: 1,
        lastActivityAt: occurredAt
      }).success
    ).toBe(true);
    expect(
      clientCrmRelationshipSchema.safeParse({
        id: relationshipId,
        status: "waiting_for_client",
        source: "direct_link",
        firstLinkedAt: occurredAt,
        lastLinkedAt: occurredAt
      }).success
    ).toBe(false);
  });

  it("rejects message content and external links in CRM activity", () => {
    expect(() =>
      clientCrmActivityItemSchema.parse(
        activityItem({
          metadata: {
            previousStatus: "new",
            status: "active",
            mode: "automatic",
            messageBody: "hello"
          }
        })
      )
    ).toThrow();
    expect(
      clientCrmActivityItemSchema.safeParse(activityItem({ href: "https://provider.example/thread/1" }))
        .success
    ).toBe(false);
    expect(clientCrmActivityItemSchema.safeParse(activityItem({ href: "//evil.example/thread/1" })).success).toBe(
      false
    );
    expect(clientCrmActivityItemSchema.safeParse(activityItem({ href: "/\\evil.example/thread/1" })).success).toBe(
      false
    );
    expect(clientCrmActivityItemSchema.parse(activityItem({ href: "/clients/" + clientUserId })).href).toBe(
      "/clients/" + clientUserId
    );
  });

  it("bounds CRM activity and exposes only server-provided Clients-owned readiness", () => {
    expect(
      clientCrmActivityPageResponseSchema.safeParse({
        items: Array.from({ length: 51 }, () => activityItem()),
        nextCursor: null
      }).success
    ).toBe(false);
    expect(astrologerClientCrmDetailResponseSchema.parse(detailResponse()).client.readiness).toEqual({
      birthData: "missing",
      relatedProfiles: "ready"
    });
    expect(
      astrologerClientCrmDetailResponseSchema.safeParse(
        detailResponse({
          calculations: "ready"
        })
      ).success
    ).toBe(false);
    expect(
      astrologerClientCrmDetailResponseSchema.safeParse(
        detailResponse({
          relatedBirthProfiles: Array.from({ length: 51 }, relatedBirthProfile)
        })
      ).success
    ).toBe(false);
  });

  it("accepts bounded service work summaries without messages or provider payloads", () => {
    const parsed = astrologerClientCrmDetailResponseSchema.parse(
      detailResponse({
        serviceWork: {
          status: "available",
          bookings: {
            upcomingTotal: 1,
            upcoming: [
              {
                id: bookingId,
                state: "confirmed",
                productTitle: "Natal consultation",
                startAt: laterAt,
                endAt: "2026-08-21T11:00:00.000Z",
                timeZone: "Europe/Moscow",
                href: `/calendar?bookingId=${bookingId}&startAt=${encodeURIComponent(laterAt)}`
              }
            ],
            recentTotal: 0,
            recent: []
          },
          sessions: {
            upcomingTotal: 1,
            upcoming: [
              {
                id: sessionId,
                bookingId,
                state: "scheduled",
                productTitle: "Natal consultation",
                scheduledStartAt: laterAt,
                scheduledEndAt: "2026-08-21T11:00:00.000Z",
                timeZone: "Europe/Moscow",
                href: `/sessions/${sessionId}`
              }
            ],
            recentTotal: 0,
            recent: []
          }
        }
      })
    );

    expect(parsed.client.serviceWork).toMatchObject({
      status: "available",
      bookings: { upcomingTotal: 1, recentTotal: 0 },
      sessions: { upcomingTotal: 1, recentTotal: 0 }
    });
    expect(JSON.stringify(parsed.client.serviceWork)).not.toMatch(
      /message|provider|room|participant|policySnapshot/i
    );

    expect(
      astrologerClientCrmDetailResponseSchema.safeParse(
        detailResponse({
          serviceWork: {
            status: "available",
            bookings: {
              upcomingTotal: 0,
              upcoming: Array.from({ length: 4 }, () => ({
                id: bookingId,
                state: "confirmed",
                productTitle: "Natal consultation",
                startAt: laterAt,
                endAt: "2026-08-21T11:00:00.000Z",
                timeZone: "Europe/Moscow",
                href: `/calendar?bookingId=${bookingId}&startAt=${encodeURIComponent(laterAt)}`
              })),
              recentTotal: 0,
              recent: []
            },
            sessions: {
              upcomingTotal: 0,
              upcoming: [],
              recentTotal: 0,
              recent: []
            }
          }
        })
      ).success
    ).toBe(false);
    expect(
      astrologerClientCrmDetailResponseSchema.safeParse(
        detailResponse({
          serviceWork: {
            status: "available",
            bookings: {
              upcomingTotal: 0,
              upcoming: [],
              recentTotal: 0,
              recent: []
            },
            sessions: {
              upcomingTotal: 1,
              upcoming: [
                {
                  id: sessionId,
                  bookingId,
                  state: "scheduled",
                  productTitle: "Natal consultation",
                  scheduledStartAt: laterAt,
                  scheduledEndAt: "2026-08-21T11:00:00.000Z",
                  timeZone: "Europe/Moscow",
                  href: `https://provider.example/sessions/${sessionId}`,
                  providerRoomName: "private-room",
                  lastMessage: "private message"
                }
              ],
              recentTotal: 0,
              recent: []
            }
          }
        })
      ).success
    ).toBe(false);
  });

  it("keeps source failures distinct from empty service work", () => {
    expect(
      astrologerClientCrmDetailResponseSchema.parse(
        detailResponse({
          serviceWork: {
            status: "unavailable",
            source: "sessions",
            code: "summary_unavailable",
            retryable: true
          }
        })
      ).client.serviceWork
    ).toEqual({
      status: "unavailable",
      source: "sessions",
      code: "summary_unavailable",
      retryable: true
    });
  });
});
