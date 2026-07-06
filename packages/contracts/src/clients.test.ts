import { describe, expect, it } from "vitest";
import {
  astrologerClientResponseSchema,
  astrologerClientListResponseSchema,
  clientBirthDataUpsertRequestSchema,
  createClientJoinIntentRequestSchema,
  createClientJoinIntentResponseSchema
} from "./clients";

describe("client contracts", () => {
  it("normalizes join intent handle and accepts opaque token responses", () => {
    expect(createClientJoinIntentRequestSchema.parse({ publicHandle: " Alisa-Vega " })).toEqual({
      publicHandle: "alisa-vega"
    });
    expect(
      createClientJoinIntentResponseSchema.parse({
        token: "join_1234567890abcdef",
        astrologer: {
          userId: "22222222-2222-4222-8222-222222222222",
          publicHandle: "alisa-vega",
          publicName: "Алиса Вега"
        },
        expiresAt: "2026-07-06T11:00:00.000Z"
      })
    ).toMatchObject({ token: "join_1234567890abcdef" });
  });

  it("accepts the full birth-data request shape", () => {
    expect(
      clientBirthDataUpsertRequestSchema.parse({
        label: "Основные данные",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        birthCountryCode: "RU",
        birthCity: "Москва",
        birthRegion: "Москва",
        birthTimezone: "Europe/Moscow",
        birthLatitude: 55.7558,
        birthLongitude: 37.6173
      })
    ).toMatchObject({ birthTimePrecision: "exact" });
  });

  it("rejects invalid client list items", () => {
    expect(() =>
      astrologerClientListResponseSchema.parse({
        clients: [{ clientUserId: "not-uuid", displayName: "", relationship: {} }],
        total: 1
      })
    ).toThrow();
  });

  it("accepts one astrologer client response for detail screens", () => {
    expect(
      astrologerClientResponseSchema.parse({
        client: {
          clientUserId: "11111111-1111-4111-8111-111111111111",
          displayName: "Марина Краснова",
          relationshipStatus: "active",
          firstLinkedAt: "2026-07-06T10:00:00.000Z",
          lastLinkedAt: "2026-07-06T10:05:00.000Z",
          birthData: null
        }
      })
    ).toMatchObject({
      client: {
        clientUserId: "11111111-1111-4111-8111-111111111111",
        relationshipStatus: "active"
      }
    });
  });
});
