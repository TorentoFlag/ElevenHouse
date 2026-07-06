import { describe, expect, it, vi } from "vitest";
import type { ClientStore } from "@elevenhouse/domain";
import { ClientProfileService } from "./client-profile.service";

const now = new Date("2026-07-06T10:00:00.000Z");

describe("ClientProfileService", () => {
  it("returns related astrologers and upserts birth data for the current client", async () => {
    const reader = {
      listRelatedAstrologers: vi.fn(async () => ({
        astrologers: [
          {
            astrologerUserId: "22222222-2222-4222-8222-222222222222",
            publicHandle: "alisa-vega",
            publicName: "Алиса Вега",
            relationshipStatus: "active" as const,
            firstLinkedAt: "2026-07-06T10:00:00.000Z",
            lastLinkedAt: "2026-07-06T10:00:00.000Z"
          }
        ]
      })),
      findBirthData: vi.fn(async () => null)
    };
    const store = {
      upsertClientBirthData: vi.fn(async (input) => ({
        id: "55555555-5555-4555-8555-555555555555",
        clientUserId: input.clientUserId,
        ...input.data,
        createdAt: input.now,
        updatedAt: input.now
      }))
    } satisfies Pick<ClientStore, "upsertClientBirthData">;
    const service = new ClientProfileService(reader, store, { now: () => now });

    await expect(
      service.listRelatedAstrologers("11111111-1111-4111-8111-111111111111")
    ).resolves.toMatchObject({
      astrologers: [{ publicHandle: "alisa-vega", publicName: "Алиса Вега" }]
    });
    await expect(
      service.upsertBirthData("11111111-1111-4111-8111-111111111111", {
        label: null,
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthLatitude: null,
        birthLongitude: null
      })
    ).resolves.toMatchObject({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      birthDate: "1990-03-14",
      birthTime: "08:25",
      source: "client_profile"
    });
  });
});
