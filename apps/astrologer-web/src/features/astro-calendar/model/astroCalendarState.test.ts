import type {
  AstroCalendarRangeResponse,
  DictionaryEntriesResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createAstroCalendarRangeQuery,
  resolveAstroCalendarInterpretations,
  summarizeAstroCalendarState
} from "./astroCalendarState";

const response = {
  schemaVersion: "astro-calendar-range.v1",
  timeZone: "Europe/Moscow",
  range: {
    start: "2026-08-01",
    end: "2026-08-31"
  },
  generation: {
    status: "ready",
    generationId: "33333333-3333-4333-8333-333333333333",
    fingerprint: "astro-calendar-fingerprint-v1",
    generatedAt: "2026-07-26T10:00:00.000Z",
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      ephemeris: "swiss-ephemeris"
    }
  },
  events: [
    {
      id: "event-1",
      source: "global",
      type: "global.moon_phase",
      startsAt: "2026-08-09T08:55:00.000Z",
      endsAt: null,
      timePrecision: "hour",
      title: "Полнолуние",
      subtitle: null,
      description: null,
      tone: "intense",
      points: ["moon", "sun"],
      aspect: "opposition",
      sign: "aquarius",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.moon_phase.full_moon", "astro_calendar.missing"],
      warnings: []
    }
  ],
  readiness: {
    clientsTotal: 3,
    clientsReady: 1,
    clientsWithMissingBirthData: 1,
    clientsWithUnknownBirthTime: 1,
    clientsWithApproximateBirthTime: 1
  },
  summary: {
    eventCount: 1,
    globalEventCount: 1,
    clientEventCount: 0,
    byType: {
      "global.moon_phase": 1
    },
    byTone: {
      intense: 1
    }
  },
  dictionaryCodes: ["astro_calendar.moon_phase.full_moon", "astro_calendar.missing"],
  warnings: [
    {
      code: "CLIENT_BIRTH_DATA_MISSING",
      severity: "warning",
      message: "У клиента нет полных данных рождения.",
      clientId: "22222222-2222-4222-8222-222222222222",
      eventId: null,
      dictionaryCode: null,
      action: null
    },
    {
      code: "CLIENT_BIRTH_TIME_UNKNOWN",
      severity: "warning",
      message: "Время рождения неизвестно.",
      clientId: "44444444-4444-4444-8444-444444444444",
      eventId: null,
      dictionaryCode: null,
      action: null
    },
    {
      code: "CLIENT_BIRTH_TIME_APPROXIMATE",
      severity: "info",
      message: "Время рождения указано приблизительно.",
      clientId: "55555555-5555-4555-8555-555555555555",
      eventId: null,
      dictionaryCode: null,
      action: null
    },
    {
      code: "DICTIONARY_ENTRY_MISSING",
      severity: "warning",
      message: "Нет трактовки для полнолуния.",
      clientId: null,
      eventId: "event-1",
      dictionaryCode: "astro_calendar.missing",
      action: {
        type: "create_dictionary_entry",
        dictionaryCode: "astro_calendar.missing",
        suggestedCategory: "calendar"
      }
    }
  ]
} satisfies AstroCalendarRangeResponse;

const dictionaryEntries = {
  entries: [
    {
      id: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
      categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
      categoryCode: "calendar",
      code: "astro_calendar.moon_phase.full_moon",
      locale: "ru",
      source: "platform",
      title: "Полнолуние",
      content: "Период кульминации и проявления эмоциональных процессов.",
      platformEntryId: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    }
  ],
  total: 1,
  counts: {
    sources: {
      all: 1,
      platform: 1,
      modified: 0,
      custom: 0
    }
  }
} satisfies DictionaryEntriesResponse;

describe("astro calendar state", () => {
  it("keeps first-load no data state separate from stale recalculation", () => {
    expect(summarizeAstroCalendarState(null)).toMatchObject({
      status: "no-data",
      canGenerate: true,
      canRetry: false,
      canRecalculate: false,
      hasCurrentResult: false,
      primaryAction: "generate",
      isCompletionClaimed: false
    });
  });

  it("creates stable range queries from local filter state", () => {
    expect(
      createAstroCalendarRangeQuery({
        start: "2026-08-01",
        end: "2026-08-31",
        timeZone: "Europe/Moscow",
        scope: "all",
        clientIds: [
          "22222222-2222-4222-8222-222222222222",
          "22222222-2222-4222-8222-222222222222",
          "11111111-1111-4111-8111-111111111111"
        ],
        eventTypes: ["client.birthday", "global.moon_phase", "client.birthday"]
      })
    ).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
      timeZone: "Europe/Moscow",
      scope: "all",
      clientIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222"
      ],
      eventTypes: ["client.birthday", "global.moon_phase"]
    });
  });

  it("surfaces missing dictionary entries with a create action", () => {
    expect(resolveAstroCalendarInterpretations(response, dictionaryEntries)).toEqual({
      entriesByCode: {
        "astro_calendar.moon_phase.full_moon": dictionaryEntries.entries[0]
      },
      missing: [
        {
          code: "astro_calendar.missing",
          suggestedCategory: "calendar",
          createSearchParams: {
            code: "astro_calendar.missing",
            category: "calendar"
          }
        }
      ],
      status: "partial"
    });
  });

  it("enables recalculation when the range response is stale", () => {
    expect(
      summarizeAstroCalendarState({
        ...response,
        generation: {
          ...response.generation,
          status: "stale",
          generatedAt: null,
          provider: null
        },
        events: [],
        summary: {
          eventCount: 0,
          globalEventCount: 0,
          clientEventCount: 0,
          byType: {},
          byTone: {}
        }
      })
    ).toMatchObject({
      status: "stale",
      canGenerate: true,
      canRetry: false,
      canRecalculate: true,
      hasCurrentResult: false,
      primaryAction: "recalculate"
    });
  });

  it("keeps calculating state honest without fake queued completion", () => {
    expect(
      summarizeAstroCalendarState({
        ...response,
        generation: {
          ...response.generation,
          status: "calculating",
          generatedAt: null,
          provider: null
        },
        events: [],
        summary: {
          eventCount: 0,
          globalEventCount: 0,
          clientEventCount: 0,
          byType: {},
          byTone: {}
        }
      })
    ).toMatchObject({
      status: "calculating",
      canGenerate: false,
      canRetry: false,
      canRecalculate: false,
      hasCurrentResult: false,
      primaryAction: "none",
      isCompletionClaimed: false
    });
  });

  it("keeps failed generations retryable without claiming a current result", () => {
    expect(
      summarizeAstroCalendarState({
        ...response,
        generation: {
          ...response.generation,
          status: "failed",
          generatedAt: null,
          provider: null
        },
        events: [],
        summary: {
          eventCount: 0,
          globalEventCount: 0,
          clientEventCount: 0,
          byType: {},
          byTone: {}
        }
      })
    ).toMatchObject({
      status: "failed",
      canGenerate: true,
      canRetry: true,
      canRecalculate: false,
      hasCurrentResult: false,
      primaryAction: "retry",
      isCompletionClaimed: false
    });
  });

  it("keeps already calculated results read-only until filters or settings change", () => {
    expect(summarizeAstroCalendarState(response)).toMatchObject({
      status: "ready",
      canGenerate: false,
      canRetry: false,
      canRecalculate: false,
      hasCurrentResult: true,
      primaryAction: "none",
      isCompletionClaimed: true
    });
  });

  it("summarizes missing and approximate birth data separately", () => {
    expect(summarizeAstroCalendarState(response).readiness).toEqual({
      status: "partial",
      clientsTotal: 3,
      clientsReady: 1,
      missingBirthData: 1,
      unknownBirthTime: 1,
      approximateBirthTime: 1,
      warnings: response.warnings.slice(0, 3)
    });
  });
});
