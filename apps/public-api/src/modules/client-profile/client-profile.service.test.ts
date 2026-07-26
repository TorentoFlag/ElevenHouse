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
      findBirthData: vi.fn(async () => null),
      listBirthDataProfiles: vi.fn(async () => [
        birthProfile({
          id: "55555555-5555-4555-8555-555555555555",
          label: "Я",
          isPrimary: true
        }),
        birthProfile({
          id: "66666666-6666-4666-8666-666666666666",
          label: "Партнёр",
          isPrimary: false
        })
      ])
    };
    const store = {
      upsertClientBirthData: vi.fn(async (input) => ({
        id: "55555555-5555-4555-8555-555555555555",
        clientUserId: input.clientUserId,
        ...input.data,
        createdAt: input.now,
        updatedAt: input.now
      })),
      createClientBirthDataProfile: vi.fn(async (input) => ({
        id: "77777777-7777-4777-8777-777777777777",
        clientUserId: input.clientUserId,
        ...input.data,
        createdAt: input.now,
        updatedAt: input.now
      })),
      updateClientBirthDataProfile: vi.fn()
    } satisfies Pick<
      ClientStore,
      "upsertClientBirthData" | "createClientBirthDataProfile" | "updateClientBirthDataProfile"
    >;
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
        isPrimary: true
      })
    ).resolves.toMatchObject({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      birthDate: "1990-03-14",
      birthTime: "08:25",
      source: "client_profile",
      isPrimary: true
    });
    await expect(
      service.listBirthProfiles("11111111-1111-4111-8111-111111111111")
    ).resolves.toMatchObject({
      profiles: [
        { label: "Я", isPrimary: true },
        { label: "Партнёр", isPrimary: false }
      ]
    });
    await expect(
      service.getOverview("11111111-1111-4111-8111-111111111111")
    ).resolves.toMatchObject({
      astrologers: [{ publicHandle: "alisa-vega" }],
      birthProfiles: [
        { label: "Я", isPrimary: true },
        { label: "Партнёр", isPrimary: false }
      ],
      summary: { directLinkOnly: true, upcomingBookingCount: 0 }
    });
    await expect(
      service.createBirthProfile("11111111-1111-4111-8111-111111111111", {
        label: "Мама",
        birthDate: "1962-11-05",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthPlaceText: "Тула",
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthTimeDstOccurrence: null,
        birthLatitude: null,
        birthLongitude: null,
        isPrimary: false
      })
    ).resolves.toMatchObject({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      label: "Мама",
      isPrimary: false
    });
  });
});

function birthProfile(
  overrides: Partial<{
    id: string;
    label: string | null;
    isPrimary: boolean;
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
    isPrimary: overrides.isPrimary ?? true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}
