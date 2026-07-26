import type {
  AstroCalendarGenerationRequest,
  AstroCalendarRangeQuery
} from "@elevenhouse/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { listDictionaryEntriesByCodes } from "../../dictionary/api/listDictionaryEntriesByCodes";
import {
  createAstroCalendarGeneration,
  getAstroCalendarRange,
  retryAstroCalendarGeneration
} from "../api/astroCalendarApi";
import {
  astroCalendarDictionaryEntriesQueryOptions,
  astroCalendarGenerationMutationOptions,
  astroCalendarQueryKeys,
  astroCalendarRangeQueryOptions,
  astroCalendarRetryMutationOptions
} from "./astroCalendarQueries";

vi.mock("../api/astroCalendarApi", () => ({
  createAstroCalendarGeneration: vi.fn(),
  getAstroCalendarRange: vi.fn(),
  retryAstroCalendarGeneration: vi.fn()
}));

vi.mock("../../dictionary/api/listDictionaryEntriesByCodes", () => ({
  listDictionaryEntriesByCodes: vi.fn()
}));

const rangeQuery = {
  start: "2026-08-01",
  end: "2026-08-31",
  timeZone: "Europe/Moscow",
  scope: "all",
  clientIds: [],
  eventTypes: []
} satisfies AstroCalendarRangeQuery;

const generationInput = {
  ...rangeQuery,
  settings: {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  }
} satisfies AstroCalendarGenerationRequest;

describe("astro calendar query options", () => {
  it("loads range data through the typed API and keeps previous data while filters change", async () => {
    vi.mocked(getAstroCalendarRange).mockResolvedValue({
      schemaVersion: "astro-calendar-range.v1",
      timeZone: "Europe/Moscow",
      range: {
        start: "2026-08-01",
        end: "2026-08-31"
      },
      generation: {
        status: "stale",
        generationId: null,
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
    });

    const options = astroCalendarRangeQueryOptions(rangeQuery);

    expect(options.queryKey).toEqual(astroCalendarQueryKeys.range(rangeQuery));
    expect(options.placeholderData).toBe(keepPreviousData);
    await expect(options.queryFn()).resolves.toMatchObject({
      schemaVersion: "astro-calendar-range.v1"
    });
    expect(getAstroCalendarRange).toHaveBeenCalledWith(rangeQuery);
  });

  it("fetches dictionary entries by deterministic response codes only when codes exist", async () => {
    vi.mocked(listDictionaryEntriesByCodes).mockResolvedValue({
      entries: [],
      total: 0,
      counts: {
        sources: {
          all: 0,
          platform: 0,
          modified: 0,
          custom: 0
        }
      }
    });

    const enabledOptions = astroCalendarDictionaryEntriesQueryOptions({
      locale: "ru",
      codes: ["astro_calendar.moon_phase.full_moon"]
    });
    const disabledOptions = astroCalendarDictionaryEntriesQueryOptions({
      locale: "ru",
      codes: []
    });

    expect(enabledOptions.queryKey).toEqual(
      astroCalendarQueryKeys.dictionaryEntries({
        locale: "ru",
        codes: ["astro_calendar.moon_phase.full_moon"]
      })
    );
    expect(enabledOptions.enabled).toBe(true);
    expect(disabledOptions.enabled).toBe(false);
    await expect(enabledOptions.queryFn()).resolves.toMatchObject({ total: 0 });
    expect(listDictionaryEntriesByCodes).toHaveBeenCalledWith({
      locale: "ru",
      codes: ["astro_calendar.moon_phase.full_moon"]
    });
  });

  it("invalidates astro calendar range queries after generation and retry mutations", async () => {
    vi.mocked(createAstroCalendarGeneration).mockResolvedValue({} as never);
    vi.mocked(retryAstroCalendarGeneration).mockResolvedValue({} as never);
    const queryClient = {
      invalidateQueries: vi.fn()
    };

    const createOptions = astroCalendarGenerationMutationOptions(queryClient);
    const retryOptions = astroCalendarRetryMutationOptions(queryClient);

    await createOptions.mutationFn(generationInput);
    await createOptions.onSuccess();
    await retryOptions.mutationFn("33333333-3333-4333-8333-333333333333");
    await retryOptions.onSuccess();

    expect(createAstroCalendarGeneration).toHaveBeenCalledWith(generationInput);
    expect(retryAstroCalendarGeneration).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333"
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: astroCalendarQueryKeys.all()
    });
  });
});
