import { describe, expect, it } from "vitest";

import {
  astroCalendarGenerationRequestSchema,
  astroCalendarEventTypeValues,
  astroCalendarRangeQuerySchema,
  astroCalendarRangeResponseSchema,
  type AstroCalendarGenerationRequest,
  type AstroCalendarRangeResponse
} from "./astro-calendar";

const clientId = "11111111-1111-4111-8111-111111111111";
const generationId = "22222222-2222-4222-8222-222222222222";

const warning = {
  code: "DICTIONARY_ENTRY_MISSING",
  severity: "warning",
  message: "Нет трактовки для кода astro_calendar.sun.cancer.house_11",
  clientId: null,
  eventId: "client-transit-sun-cancer",
  dictionaryCode: "astro_calendar.sun.cancer.house_11",
  action: {
    type: "create_dictionary_entry",
    dictionaryCode: "astro_calendar.sun.cancer.house_11",
    suggestedCategory: "calendar"
  }
} as const;

const validResponse = {
  schemaVersion: "astro-calendar-range.v1",
  timeZone: "Europe/Moscow",
  range: {
    start: "2026-07-01",
    end: "2026-07-30"
  },
  generation: {
    status: "ready",
    generationId,
    fingerprint: "astro-calendar-fixture-fingerprint",
    generatedAt: "2026-07-01T00:02:00.000Z",
    provider: {
      name: "kerykeion",
      version: "5.12.0",
      ephemeris: "swiss-ephemeris"
    }
  },
  events: [
    {
      id: "global-moon-phase-2026-07-10",
      source: "global",
      type: "global.moon_phase",
      startsAt: "2026-07-10T20:36:00.000Z",
      endsAt: null,
      timePrecision: "exact",
      title: "Новолуние",
      subtitle: "Рак",
      description: null,
      tone: "neutral",
      points: ["Moon"],
      aspect: null,
      sign: "Cancer",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.global.moon_phase.new_moon.cancer"],
      warnings: []
    },
    {
      id: "global-eclipse-2026-07-12",
      source: "global",
      type: "global.eclipse",
      startsAt: "2026-07-12T09:10:00.000Z",
      endsAt: null,
      timePrecision: "hour",
      title: "Затмение",
      subtitle: "Солнечное",
      description: null,
      tone: "intense",
      points: ["Sun", "Moon"],
      aspect: "conjunction",
      sign: "Cancer",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.global.eclipse.solar.cancer"],
      warnings: []
    },
    {
      id: "global-ingress-venus-leo",
      source: "global",
      type: "global.ingress",
      startsAt: "2026-07-14T11:44:00.000Z",
      endsAt: null,
      timePrecision: "exact",
      title: "Венера входит во Льва",
      subtitle: null,
      description: null,
      tone: "opportunity",
      points: ["Venus"],
      aspect: null,
      sign: "Leo",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.global.ingress.venus.leo"],
      warnings: []
    },
    {
      id: "client-birthday-11111111-2026",
      source: "client",
      type: "client.birthday",
      startsAt: "2026-07-15T00:00:00.000Z",
      endsAt: "2026-07-15T23:59:59.000Z",
      timePrecision: "day",
      title: "День рождения",
      subtitle: "Мария Иванова",
      description: null,
      tone: "supportive",
      points: ["Sun"],
      aspect: null,
      sign: "Cancer",
      clientRefs: [{ clientId, displayName: "Мария Иванова", initials: "МИ" }],
      chartLink: {
        mode: "solar_return",
        clientId,
        date: "2026-07-15"
      },
      dictionaryCodes: ["astro_calendar.client.birthday"],
      warnings: []
    },
    {
      id: "client-solar-window-11111111-2026",
      source: "client",
      type: "client.solar_window",
      startsAt: "2026-07-08T00:00:00.000Z",
      endsAt: "2026-07-22T23:59:59.000Z",
      timePrecision: "day",
      title: "Солярное окно",
      subtitle: "Мария Иванова",
      description: null,
      tone: "opportunity",
      points: ["Sun"],
      aspect: null,
      sign: "Cancer",
      clientRefs: [{ clientId, displayName: "Мария Иванова", initials: "МИ" }],
      chartLink: {
        mode: "solar_return",
        clientId,
        date: "2026-07-15"
      },
      dictionaryCodes: ["astro_calendar.client.solar_window"],
      warnings: []
    },
    {
      id: "client-transit-11111111-sun-cancer-house-11",
      source: "client",
      type: "client.transit_aspect",
      startsAt: "2026-07-18T13:20:00.000Z",
      endsAt: null,
      timePrecision: "exact",
      title: "Транзит Солнца",
      subtitle: "XI дом",
      description: null,
      tone: "neutral",
      points: ["Sun"],
      aspect: "trine",
      sign: "Cancer",
      clientRefs: [{ clientId, displayName: "Мария Иванова", initials: "МИ" }],
      chartLink: {
        mode: "transit",
        clientId,
        date: "2026-07-18"
      },
      dictionaryCodes: ["astro_calendar.sun.cancer.house_11"],
      warnings: [warning]
    }
  ],
  readiness: {
    clientsTotal: 1,
    clientsReady: 1,
    clientsWithMissingBirthData: 0,
    clientsWithUnknownBirthTime: 0,
    clientsWithApproximateBirthTime: 0
  },
  summary: {
    eventCount: 6,
    globalEventCount: 3,
    clientEventCount: 3,
    byType: {
      "global.moon_phase": 1,
      "global.eclipse": 1,
      "global.ingress": 1,
      "client.birthday": 1,
      "client.solar_window": 1,
      "client.transit_aspect": 1
    },
    byTone: {
      neutral: 2,
      intense: 1,
      opportunity: 2,
      supportive: 1
    }
  },
  dictionaryCodes: [
    "astro_calendar.global.moon_phase.new_moon.cancer",
    "astro_calendar.global.eclipse.solar.cancer",
    "astro_calendar.global.ingress.venus.leo",
    "astro_calendar.client.birthday",
    "astro_calendar.client.solar_window",
    "astro_calendar.sun.cancer.house_11"
  ],
  warnings: [warning]
} satisfies AstroCalendarRangeResponse;

describe("astro calendar contracts", () => {
  it("parses a complete first-slice response with every supported event type", () => {
    expect(new Set(validResponse.events.map((event) => event.type))).toEqual(
      new Set(astroCalendarEventTypeValues)
    );
    expect(astroCalendarRangeResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it("normalizes bounded query-string filters", () => {
    expect(
      astroCalendarRangeQuerySchema.parse({
        start: "2026-07-01",
        end: "2026-07-30",
        timeZone: "Europe/Moscow",
        clientIds: `${clientId},33333333-3333-4333-8333-333333333333`,
        eventTypes: ["global.moon_phase", "client.birthday"]
      })
    ).toEqual({
      start: "2026-07-01",
      end: "2026-07-30",
      timeZone: "Europe/Moscow",
      scope: "all",
      clientIds: [clientId, "33333333-3333-4333-8333-333333333333"],
      eventTypes: ["global.moon_phase", "client.birthday"]
    });

    expect(
      astroCalendarRangeQuerySchema.parse({
        start: "2026-07-01",
        end: "2026-07-30",
        timeZone: "Europe/Moscow"
      })
    ).toEqual({
      start: "2026-07-01",
      end: "2026-07-30",
      timeZone: "Europe/Moscow",
      scope: "all",
      clientIds: [],
      eventTypes: []
    });
  });

  it("parses owner-scoped client snapshots for private chart-engine generation", () => {
    const request = astroCalendarGenerationRequestSchema.parse({
      start: "2026-07-01",
      end: "2026-07-31",
      timeZone: "Europe/Moscow",
      scope: "client",
      clientIds: [clientId],
      eventTypes: ["client.birthday", "client.solar_window"],
      clients: [
        {
          clientId,
          displayName: "Мария Иванова",
          initials: "МИ",
          birthDate: "1990-07-15",
          birthTime: "14:30",
          birthTimePrecision: "exact",
          birthTimezone: "Europe/Moscow",
          birthLatitude: 55.7558,
          birthLongitude: 37.6173
        }
      ],
      settings: {
        zodiac: "tropical",
        houseSystem: "placidus",
        nodeType: "true",
        aspectPreset: "major",
        orbMultiplier: 1
      }
    }) satisfies AstroCalendarGenerationRequest;

    expect(request.clients).toEqual([
      expect.objectContaining({
        clientId,
        displayName: "Мария Иванова",
        initials: "МИ",
        birthDate: "1990-07-15",
        birthTimezone: "Europe/Moscow"
      })
    ]);

    expect(
      astroCalendarGenerationRequestSchema.parse({
        start: "2026-07-01",
        end: "2026-07-31",
        timeZone: "Europe/Moscow",
        clientIds: [],
        eventTypes: [],
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      }).clients
    ).toEqual([]);
  });

  it("rejects invalid timezone and invalid date ranges", () => {
    expect(
      astroCalendarRangeQuerySchema.safeParse({
        start: "2026-07-01",
        end: "2026-07-30",
        timeZone: "Mars/Olympus",
        clientIds: [],
        eventTypes: []
      }).success
    ).toBe(false);
    expect(
      astroCalendarRangeQuerySchema.safeParse({
        start: "2026-07-30",
        end: "2026-07-01",
        timeZone: "Europe/Moscow",
        clientIds: [],
        eventTypes: []
      }).success
    ).toBe(false);
    expect(
      astroCalendarRangeQuerySchema.safeParse({
        start: "2026-01-01",
        end: "2026-04-05",
        timeZone: "Europe/Moscow",
        clientIds: [],
        eventTypes: []
      }).success
    ).toBe(false);
  });

  it("rejects generation ranges and client birth dates outside packaged ephemeris data", () => {
    expect(
      astroCalendarRangeQuerySchema.safeParse({
        start: "2400-01-01",
        end: "2400-01-30",
        timeZone: "Europe/Moscow",
        clientIds: [],
        eventTypes: []
      }).success
    ).toBe(false);
    expect(
      astroCalendarGenerationRequestSchema.safeParse({
        start: "2026-07-01",
        end: "2026-07-30",
        timeZone: "Europe/Moscow",
        clientIds: [clientId],
        eventTypes: ["client.birthday"],
        clients: [
          {
            clientId,
            displayName: "Мария Иванова",
            initials: "МИ",
            birthDate: "1799-12-31",
            birthTime: "14:30",
            birthTimePrecision: "exact",
            birthTimezone: "Europe/Moscow",
            birthLatitude: 55.7558,
            birthLongitude: 37.6173
          }
        ],
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      }).success
    ).toBe(false);
  });

  it("rejects unsupported future event types", () => {
    expect(
      astroCalendarRangeQuerySchema.safeParse({
        start: "2026-07-01",
        end: "2026-07-30",
        timeZone: "Europe/Moscow",
        clientIds: [],
        eventTypes: ["global.void_of_course_moon"]
      }).success
    ).toBe(false);
    expect(
      astroCalendarRangeResponseSchema.safeParse({
        ...validResponse,
        events: [{ ...validResponse.events[0], type: "automation.ready_to_send" }]
      }).success
    ).toBe(false);
  });

  it("preserves missing dictionary warnings and create-entry actions", () => {
    const parsed = astroCalendarRangeResponseSchema.parse(validResponse);

    expect(parsed.warnings[0]).toEqual(warning);
    expect(parsed.events[5]?.warnings[0]?.action).toEqual({
      type: "create_dictionary_entry",
      dictionaryCode: "astro_calendar.sun.cancer.house_11",
      suggestedCategory: "calendar"
    });
  });
});
