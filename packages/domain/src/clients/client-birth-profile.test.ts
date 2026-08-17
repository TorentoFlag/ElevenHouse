import { describe, expect, it, vi } from "vitest";
import {
  ClientBirthDataRelationshipDeniedError,
  ClientBirthDataRevisionConflictError,
  writeClientRelatedBirthProfile,
  writeClientBirthProfile,
  type ClientBirthData,
  type ClientRelatedBirthProfile,
  type ClientRelatedBirthProfileStore,
  type ClientStore
} from "./index";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-05T12:00:00.000Z");

describe("writeClientBirthProfile", () => {
  it("persists the single profile with an explicit astrologer audit actor and CAS revision", async () => {
    const persist = vi.fn(async () => ({
      kind: "written" as const,
      profile: birthProfile({ revision: 5 })
    }));
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

describe("writeClientRelatedBirthProfile", () => {
  it("persists a client-owned related profile with separate name and relationship label", async () => {
    const persist = vi.fn(async () => ({
      kind: "written" as const,
      profile: relatedBirthProfile({ revision: 1 })
    }));
    const store = {
      writeClientRelatedBirthProfile: persist
    } as Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">;

    await expect(
      writeClientRelatedBirthProfile({
        store,
        clientUserId,
        actor: { userId: clientUserId, role: "client" },
        expectedRevision: null,
        data: {
          displayName: " Иванов Иван Иванович ",
          relationshipLabel: " муж ",
          birthDate: "1988-07-22",
          birthTime: null,
          birthTimePrecision: "unknown",
          birthPlaceText: "Калининград, Россия",
          birthCountryCode: "RU",
          birthCity: "Калининград",
          birthRegion: "Калининградская область",
          birthTimezone: "Europe/Kaliningrad",
          birthTimeDstOccurrence: null,
          birthLatitude: 54.7104,
          birthLongitude: 20.4522,
          source: "client_profile"
        },
        now
      })
    ).resolves.toMatchObject({
      clientUserId,
      displayName: "Иванов Иван Иванович",
      relationshipLabel: "муж"
    });

    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        clientUserId,
        relatedProfileId: null,
        actor: { userId: clientUserId, role: "client" },
        data: expect.objectContaining({
          displayName: "Иванов Иван Иванович",
          relationshipLabel: "муж",
          source: "client_profile"
        })
      })
    );
  });

  it("surfaces related-profile CAS conflicts and relationship denial", async () => {
    const conflictStore = {
      writeClientRelatedBirthProfile: vi.fn(async () => ({ kind: "conflict" as const }))
    } as Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">;
    await expect(
      writeClientRelatedBirthProfile({
        store: conflictStore,
        clientUserId,
        relatedProfileId: "66666666-6666-4666-8666-666666666666",
        actor: { userId: clientUserId, role: "client" },
        expectedRevision: 1,
        data: { displayName: "Иван", relationshipLabel: "муж", source: "client_profile" },
        now
      })
    ).rejects.toBeInstanceOf(ClientBirthDataRevisionConflictError);

    const deniedStore = {
      writeClientRelatedBirthProfile: vi.fn(async () => ({ kind: "not_related" as const }))
    } as Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">;
    await expect(
      writeClientRelatedBirthProfile({
        store: deniedStore,
        clientUserId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: null,
        data: { displayName: "Иван", relationshipLabel: "муж", source: "manual" },
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

function relatedBirthProfile(
  overrides: Partial<ClientRelatedBirthProfile> = {}
): ClientRelatedBirthProfile {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    clientUserId,
    displayName: "Иванов Иван Иванович",
    relationshipLabel: "муж",
    birthDate: "1988-07-22",
    birthTime: null,
    birthTimePrecision: "unknown",
    birthPlaceText: "Калининград, Россия",
    birthCountryCode: "RU",
    birthCity: "Калининград",
    birthRegion: "Калининградская область",
    birthTimezone: "Europe/Kaliningrad",
    birthTimeDstOccurrence: null,
    birthLatitude: 54.7104,
    birthLongitude: 20.4522,
    source: "client_profile",
    revision: 1,
    lastEditedByUserId: clientUserId,
    lastEditedByRole: "client",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}
