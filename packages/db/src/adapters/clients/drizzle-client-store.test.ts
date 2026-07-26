import { describe, expect, it } from "vitest";
import {
  clientBirthData,
  clientJoinIntents,
  clientProfiles
} from "../../schema";
import { createDrizzleClientStore } from "./index";

type InsertCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};

type UpdateCall = {
  readonly table: unknown;
  readonly value: Record<string, unknown>;
};

function createFakeInsertDatabase(rows: readonly Record<string, unknown>[]) {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  let nextRowIndex = 0;

  const insert = (table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      onConflictDoUpdate: () => ({
        returning: async () => {
          inserts.push({ table, value });
          const row = rows[nextRowIndex];
          nextRowIndex += 1;
          return row ? [row] : [];
        }
      }),
      returning: async () => {
        inserts.push({ table, value });
        const row = rows[nextRowIndex];
        nextRowIndex += 1;
        return row ? [row] : [];
      }
    })
  });

  const update = (table: unknown) => ({
    set: (value: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          updates.push({ table, value });
          return [];
        }
      })
    })
  });

  return { database: { insert, update }, inserts, updates };
}

describe("createDrizzleClientStore", () => {
  it("upserts client profile and full birth data through Drizzle inserts", async () => {
    const now = new Date("2026-07-06T10:00:00.000Z");
    const { database, inserts } = createFakeInsertDatabase([
      {
        userId: "11111111-1111-4111-8111-111111111111",
        displayNameSnapshot: "Марина",
        preferredLocale: "ru",
        timezone: "Europe/Moscow",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        clientUserId: "11111111-1111-4111-8111-111111111111",
        label: "Основные данные",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        birthCountryCode: "RU",
        birthCity: "Москва",
        birthRegion: "Москва",
        birthTimezone: "Europe/Moscow",
        birthTimeDstOccurrence: null,
        birthLatitude: "55.7558",
        birthLongitude: "37.6173",
        source: "client_profile",
        isPrimary: true,
        createdAt: now,
        updatedAt: now
      }
    ]);
    const store = createDrizzleClientStore(database as never);

    await store.upsertClientProfile({
      userId: "11111111-1111-4111-8111-111111111111",
      displayNameSnapshot: "Марина",
      preferredLocale: "ru",
      timezone: "Europe/Moscow",
      now: now.toISOString()
    });
    await store.upsertClientBirthData({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      data: {
        label: "Основные данные",
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
        source: "client_profile",
        isPrimary: true
      },
      now: now.toISOString()
    });

    expect(inserts[0]).toMatchObject({
      table: clientProfiles,
      value: {
        userId: "11111111-1111-4111-8111-111111111111",
        displayNameSnapshot: "Марина"
      }
    });
    expect(inserts[1]).toMatchObject({
      table: clientBirthData,
      value: {
        clientUserId: "11111111-1111-4111-8111-111111111111",
        birthDate: "1990-03-14",
        birthTimePrecision: "exact",
        birthCountryCode: "RU",
        isPrimary: true
      }
    });
  });

  it("creates a primary birth profile after demoting previous primary rows", async () => {
    const now = new Date("2026-07-06T10:00:00.000Z");
    const { database, inserts, updates } = createFakeInsertDatabase([
      {
        id: "66666666-6666-4666-8666-666666666666",
        clientUserId: "11111111-1111-4111-8111-111111111111",
        label: "Партнёр",
        birthDate: "1988-07-22",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthPlaceText: "Калининград",
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthTimeDstOccurrence: null,
        birthLatitude: null,
        birthLongitude: null,
        source: "client_profile",
        isPrimary: true,
        createdAt: now,
        updatedAt: now
      }
    ]);
    const store = createDrizzleClientStore(database as never);

    await expect(
      store.createClientBirthDataProfile({
        clientUserId: "11111111-1111-4111-8111-111111111111",
        data: {
          label: "Партнёр",
          birthDate: "1988-07-22",
          birthTime: null,
          birthTimePrecision: "unknown",
          birthPlaceText: "Калининград",
          birthCountryCode: null,
          birthCity: null,
          birthRegion: null,
          birthTimezone: null,
          birthTimeDstOccurrence: null,
          birthLatitude: null,
          birthLongitude: null,
          source: "client_profile",
          isPrimary: true
        },
        now: now.toISOString()
      })
    ).resolves.toMatchObject({
      label: "Партнёр",
      isPrimary: true
    });

    expect(updates).toEqual([
      {
        table: clientBirthData,
        value: expect.objectContaining({ isPrimary: false })
      }
    ]);
    expect(inserts).toEqual([
      {
        table: clientBirthData,
        value: expect.objectContaining({
          clientUserId: "11111111-1111-4111-8111-111111111111",
          label: "Партнёр",
          isPrimary: true
        })
      }
    ]);
  });

  it("creates join intents with token hash only", async () => {
    const now = new Date("2026-07-06T10:00:00.000Z");
    const { database, inserts } = createFakeInsertDatabase([
      {
        id: "44444444-4444-4444-8444-444444444444",
        astrologerUserId: "22222222-2222-4222-8222-222222222222",
        tokenHash: "sha256:1234567890abcdef",
        publicHandleSnapshot: "alisa-vega",
        status: "pending",
        expiresAt: new Date("2026-07-06T11:00:00.000Z"),
        claimedByClientUserId: null,
        claimedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ]);
    const store = createDrizzleClientStore(database as never);

    await store.createJoinIntent({
      id: "44444444-4444-4444-8444-444444444444",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      tokenHash: "sha256:1234567890abcdef",
      publicHandleSnapshot: "alisa-vega",
      expiresAt: "2026-07-06T11:00:00.000Z",
      now: now.toISOString()
    });

    expect(inserts).toEqual([
      {
        table: clientJoinIntents,
        value: expect.objectContaining({
          tokenHash: "sha256:1234567890abcdef",
          publicHandleSnapshot: "alisa-vega"
        })
      }
    ]);
    expect(JSON.stringify(inserts.map((insert) => insert.value))).not.toContain("plain-token\"");
  });
});
