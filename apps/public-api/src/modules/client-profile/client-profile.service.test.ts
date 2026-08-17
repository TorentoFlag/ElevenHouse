import { describe, expect, it, vi } from "vitest";
import type { ClientRelatedBirthProfileStore, ClientStore } from "@elevenhouse/domain";
import { ClientProfileService } from "./client-profile.service";

const now = new Date("2026-07-06T10:00:00.000Z");

describe("ClientProfileService", () => {
  it("writes the current client's single birth profile through CAS", async () => {
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
      findBirthData: vi.fn(async () => null),
      listRelatedBirthProfiles: vi.fn(async () => [])
    };
    const store = {
      writeClientBirthProfile: vi.fn(async (input) => ({
        kind: "written" as const,
        profile: {
          id: "55555555-5555-4555-8555-555555555555",
          clientUserId: input.clientUserId,
          ...input.data,
          revision: 1,
          lastEditedByUserId: input.actor.userId,
          lastEditedByRole: input.actor.role,
          createdAt: input.now,
          updatedAt: input.now
        }
      })),
      writeClientRelatedBirthProfile: vi.fn()
    } satisfies Pick<ClientStore, "writeClientBirthProfile"> &
      Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">;
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
        birthTimeDstOccurrence: null,
        birthLatitude: null,
        birthLongitude: null,
        expectedRevision: null
      })
    ).resolves.toMatchObject({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      birthDate: "1990-03-14",
      birthTime: "08:25",
      source: "client_profile",
      revision: 1,
      lastEditedByRole: "client"
    });
    expect(store.writeClientBirthProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: null,
        actor: { userId: "11111111-1111-4111-8111-111111111111", role: "client" }
      })
    );
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Fixture remains available for adjacent profile-state cases.
function birthProfile(
  overrides: Partial<{
    id: string;
    label: string | null;
  }> = {}
) {
  return {
    id: overrides.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId: "11111111-1111-4111-8111-111111111111",
    label: overrides.label ?? "Я",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "exact" as const,
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthRegion: "Москва",
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: null,
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "client_profile" as const,
    revision: 1,
    lastEditedByUserId: "11111111-1111-4111-8111-111111111111",
    lastEditedByRole: "client" as const,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}
