import type { AstroCalendarRangeResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import {
  createAstroCalendarGeneration,
  getAstroCalendarRange,
  retryAstroCalendarGeneration
} from "./astroCalendarApi";

const rangeResponse = {
  schemaVersion: "astro-calendar-range.v1",
  timeZone: "Europe/Moscow",
  range: {
    start: "2026-08-01",
    end: "2026-08-31"
  },
  generation: {
    status: "calculating",
    generationId: "33333333-3333-4333-8333-333333333333",
    fingerprint: "astro-calendar-fingerprint-v1",
    generatedAt: null,
    provider: null
  },
  events: [],
  readiness: {
    clientsTotal: 0,
    clientsReady: 0,
    clientsWithMissingBirthData: 0,
    clientsWithUnknownBirthTime: 0,
    clientsWithApproximateBirthTime: 0
  },
  summary: {
    eventCount: 0,
    globalEventCount: 0,
    clientEventCount: 0,
    byType: {},
    byTone: {}
  },
  dictionaryCodes: [],
  warnings: []
} satisfies AstroCalendarRangeResponse;

const settings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
} as const;

describe("astroCalendarApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads astro calendar ranges with serialized filters through the shared contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(rangeResponse);

    await expect(
      getAstroCalendarRange({
        start: "2026-08-01",
        end: "2026-08-31",
        timeZone: "Europe/Moscow",
        scope: "client",
        clientIds: ["22222222-2222-4222-8222-222222222222"],
        eventTypes: ["client.birthday", "client.transit_aspect"]
      })
    ).resolves.toEqual(rangeResponse);

    const calledPath = get.mock.calls[0]?.[0];
    expect(calledPath).toBeDefined();
    const url = new URL(calledPath ?? "", "https://elevenhouse.test");

    expect(url.pathname).toBe("/astro-calendar/range");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
      timeZone: "Europe/Moscow",
      scope: "client",
      clientIds: "22222222-2222-4222-8222-222222222222",
      eventTypes: "client.birthday,client.transit_aspect"
    });
  });

  it("rejects malformed astro calendar range responses", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({
      ...rangeResponse,
      schemaVersion: "astro-calendar-range.v0"
    });

    await expect(
      getAstroCalendarRange({
        start: "2026-08-01",
        end: "2026-08-31",
        timeZone: "Europe/Moscow",
        scope: "all",
        clientIds: [],
        eventTypes: []
      })
    ).rejects.toThrow();
  });

  it("creates generation requests with chart settings and CSRF protection", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(rangeResponse);

    await expect(
      createAstroCalendarGeneration({
        start: "2026-08-01",
        end: "2026-08-31",
        timeZone: "Europe/Moscow",
        scope: "all",
        clientIds: [],
        eventTypes: ["global.moon_phase"],
        clients: [],
        settings
      })
    ).resolves.toEqual(rangeResponse);

    expect(post).toHaveBeenCalledWith(
      "/astro-calendar/generations",
      {
        start: "2026-08-01",
        end: "2026-08-31",
        timeZone: "Europe/Moscow",
        scope: "all",
        clientIds: [],
        eventTypes: ["global.moon_phase"],
        clients: [],
        settings
      },
      { csrf: true }
    );
  });

  it("retries existing generations with CSRF protection", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(rangeResponse);

    await expect(
      retryAstroCalendarGeneration("33333333-3333-4333-8333-333333333333")
    ).resolves.toEqual(rangeResponse);

    expect(post).toHaveBeenCalledWith(
      "/astro-calendar/generations/33333333-3333-4333-8333-333333333333/retry",
      undefined,
      { csrf: true }
    );
  });
});
