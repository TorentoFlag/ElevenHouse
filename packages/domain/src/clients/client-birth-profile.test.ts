import { describe, expect, it, vi } from "vitest";
import {
  ClientBirthDataRelationshipDeniedError,
  ClientBirthDataRevisionConflictError,
  writeClientBirthProfile,
  type ClientBirthData,
  type ClientStore
} from "./index";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-05T12:00:00.000Z");

describe("writeClientBirthProfile", () => {
  it("persists the single profile with an explicit astrologer audit actor and CAS revision", async () => {
    const persist = vi.fn(async () => ({ kind: "written" as const, profile: birthProfile({ revision: 5 }) }));
    const store = {
      writeClientBirthProfile: persist
    } as Pick<ClientStore, "writeClientBirthProfile">;

    await expect(
      writeClientBirthProfile({
        store,
        clientUserId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: 4,
        data: {
          label: "Данные рождения",
          birthDate: "1990-03-14",
          birthTime: "08:25",
          birthTimePrecision: "exact",
          birthPlaceText: "Москва, Россия",
          birthCountryCode: "RU",
          birthCity: "Москва",
          birthRegion: "Москва",
          birthTimezone: "Europe/Moscow",
          birthTimeDstOccurrence: null,
          birthLatitude: 55.7558,
          birthLongitude: 37.6173,
          source: "manual"
        },
        now
      })
    ).resolves.toMatchObject({ revision: 5, lastEditedByRole: "astrologer" });

    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        clientUserId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: 4,
        data: expect.objectContaining({ source: "manual" })
      })
    );
  });

  it("surfaces an optimistic-lock conflict instead of overwriting a newer profile", async () => {
    const store = {
      writeClientBirthProfile: vi.fn(async () => ({ kind: "conflict" as const }))
    } as Pick<ClientStore, "writeClientBirthProfile">;

    await expect(
      writeClientBirthProfile({
        store,
        clientUserId,
        actor: { userId: clientUserId, role: "client" },
        expectedRevision: 1,
        data: { source: "client_profile" },
        now
      })
    ).rejects.toBeInstanceOf(ClientBirthDataRevisionConflictError);
  });

  it("denies an astrologer write when the store cannot prove an active client relationship", async () => {
    const store = {
      writeClientBirthProfile: vi.fn(async () => ({ kind: "not_related" as const }))
    } as Pick<ClientStore, "writeClientBirthProfile">;

    await expect(
      writeClientBirthProfile({
        store,
        clientUserId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: null,
        data: { source: "manual" },
        now
      })
    ).rejects.toBeInstanceOf(ClientBirthDataRelationshipDeniedError);
  });
});

function birthProfile(overrides: Partial<ClientBirthData> = {}): ClientBirthData {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    clientUserId,
    label: "Данные рождения",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "exact",
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthRegion: "Москва",
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: null,
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "manual",
    revision: 4,
    lastEditedByUserId: astrologerUserId,
    lastEditedByRole: "astrologer",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}
