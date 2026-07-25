import { describe, expect, it } from "vitest";

import { planAstroCalendarGeneration } from "./plan-astro-calendar-generation";

const exactClient = {
  clientId: "11111111-1111-4111-8111-111111111111",
  displayName: "Мария Иванова",
  birthDate: "1990-07-15",
  birthTime: "10:30",
  birthTimePrecision: "exact" as const,
  birthTimezone: "Europe/Rome",
  birthLatitude: 41.9028,
  birthLongitude: 12.4964
};

describe("planAstroCalendarGeneration", () => {
  it("summarizes exact, unknown, approximate and missing client readiness", () => {
    const result = planAstroCalendarGeneration({
      clients: [
        exactClient,
        {
          ...exactClient,
          clientId: "22222222-2222-4222-8222-222222222222",
          displayName: "Без времени",
          birthTime: null,
          birthTimePrecision: "unknown"
        },
        {
          ...exactClient,
          clientId: "33333333-3333-4333-8333-333333333333",
          displayName: "Приблизительное время",
          birthTime: "12:00",
          birthTimePrecision: "approximate"
        },
        {
          ...exactClient,
          clientId: "44444444-4444-4444-8444-444444444444",
          displayName: "Нет места",
          birthTimezone: null,
          birthLatitude: null,
          birthLongitude: null
        }
      ]
    });

    expect(result.readiness).toEqual({
      clientsTotal: 4,
      clientsReady: 2,
      clientsWithMissingBirthData: 1,
      clientsWithUnknownBirthTime: 1,
      clientsWithApproximateBirthTime: 1
    });
    expect(result.clientReadiness).toEqual([
      {
        clientId: exactClient.clientId,
        displayName: "Мария Иванова",
        canUseDateOnlyEvents: true,
        canUseTimedEvents: true,
        warnings: []
      },
      {
        clientId: "22222222-2222-4222-8222-222222222222",
        displayName: "Без времени",
        canUseDateOnlyEvents: true,
        canUseTimedEvents: false,
        warnings: ["CLIENT_BIRTH_TIME_UNKNOWN"]
      },
      {
        clientId: "33333333-3333-4333-8333-333333333333",
        displayName: "Приблизительное время",
        canUseDateOnlyEvents: true,
        canUseTimedEvents: true,
        warnings: ["CLIENT_BIRTH_TIME_APPROXIMATE"]
      },
      {
        clientId: "44444444-4444-4444-8444-444444444444",
        displayName: "Нет места",
        canUseDateOnlyEvents: false,
        canUseTimedEvents: false,
        warnings: ["CLIENT_BIRTH_DATA_MISSING"]
      }
    ]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "CLIENT_BIRTH_TIME_UNKNOWN",
      "CLIENT_BIRTH_TIME_APPROXIMATE",
      "CLIENT_BIRTH_DATA_MISSING"
    ]);
  });
});
