// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AstroCalendarRangeResponse, DictionaryEntriesResponse } from "@elevenhouse/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@elevenhouse/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../Application";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstroCalendarPage } from "./AstroCalendarPage";

describe("AstroCalendarPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("mounts the astro calendar route page", () => {
    render(
      <QueryClientProvider client={queryClient()}>
        <I18nProvider dictionaries={astrologerCopyByLocale}>
          <AstroCalendarPage />
        </I18nProvider>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: /астрокалендарь/i })).toBeInTheDocument();
  });

  it("keeps scope and type filters local instead of requesting separate recalculation fingerprints", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url.startsWith("/astro-calendar/range?")) return rangeResponse;
      if (url.startsWith("/dictionary/entries/by-codes?")) return dictionaryResponse;
      throw new Error(`Unexpected GET ${url}`);
    });

    render(
      <QueryClientProvider client={queryClient()}>
        <I18nProvider dictionaries={astrologerCopyByLocale}>
          <AstroCalendarPage />
        </I18nProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Полнолуние 17° Водолея")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Глобальные" }));
    expect(screen.getByText("Полнолуние 17° Водолея")).toBeInTheDocument();
    expect(screen.queryByText("Марина Краснова")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Луна" }));
    expect(screen.getByText("Полнолуние 17° Водолея")).toBeInTheDocument();
    expect(screen.queryByText("Пересчитать")).not.toBeInTheDocument();

    await waitFor(() => {
      const rangeCalls = get.mock.calls
        .map(([url]) => url)
        .filter((url) => url.startsWith("/astro-calendar/range?"));
      expect(rangeCalls).toHaveLength(1);
      expect(rangeCalls[0]).toContain("scope=all");
      expect(rangeCalls[0]).not.toContain("eventTypes=");
    });
  });
});

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
}

const rangeResponse = {
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
      id: "moon-full-2026-08-09",
      source: "global",
      type: "global.moon_phase",
      startsAt: "2026-08-09T08:55:00.000Z",
      endsAt: null,
      timePrecision: "hour",
      title: "Полнолуние 17° Водолея",
      subtitle: "Глобальное событие",
      description: "Кульминация лунного цикла.",
      tone: "intense",
      points: ["moon", "sun"],
      aspect: "opposition",
      sign: "aquarius",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.moon_phase.full_moon"],
      warnings: []
    },
    {
      id: "client-transit-1",
      source: "client",
      type: "client.transit_aspect",
      startsAt: "2026-08-13T12:00:00.000Z",
      endsAt: null,
      timePrecision: "day",
      title: "Транзитный Юпитер к Солнцу",
      subtitle: "Рост и расширение",
      description: "Персональный период возможностей.",
      tone: "opportunity",
      points: ["jupiter", "sun"],
      aspect: "trine",
      sign: "cancer",
      clientRefs: [
        {
          clientId: "22222222-2222-4222-8222-222222222222",
          displayName: "Марина Краснова",
          initials: "МК"
        }
      ],
      chartLink: {
        mode: "transit",
        clientId: "22222222-2222-4222-8222-222222222222",
        date: "2026-08-13"
      },
      dictionaryCodes: ["astro_calendar.client.transit.jupiter.trine.sun"],
      warnings: []
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
    eventCount: 2,
    globalEventCount: 1,
    clientEventCount: 1,
    byType: {
      "global.moon_phase": 1,
      "client.transit_aspect": 1
    },
    byTone: {
      intense: 1,
      opportunity: 1
    }
  },
  dictionaryCodes: [
    "astro_calendar.moon_phase.full_moon",
    "astro_calendar.client.transit.jupiter.trine.sun"
  ],
  warnings: []
} satisfies AstroCalendarRangeResponse;

const dictionaryResponse = {
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
} satisfies DictionaryEntriesResponse;
