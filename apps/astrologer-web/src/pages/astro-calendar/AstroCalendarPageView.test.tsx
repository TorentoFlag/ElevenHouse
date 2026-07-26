import { readFileSync } from "node:fs";
import type {
  AstroCalendarRangeResponse,
  DictionaryEffectiveEntryResponse
} from "@elevenhouse/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AstroCalendarPageViewProps } from "./AstroCalendarPageView";
import { AstroCalendarPageView } from "./AstroCalendarPageView";

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
      dictionaryCodes: ["astro_calendar.missing"],
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
  dictionaryCodes: ["astro_calendar.moon_phase.full_moon", "astro_calendar.missing"],
  warnings: [
    {
      code: "CLIENT_BIRTH_TIME_UNKNOWN",
      severity: "warning",
      message: "Время рождения неизвестно.",
      clientId: "22222222-2222-4222-8222-222222222222",
      eventId: null,
      dictionaryCode: null,
      action: null
    },
    {
      code: "DICTIONARY_ENTRY_MISSING",
      severity: "warning",
      message: "Нет трактовки для события.",
      clientId: null,
      eventId: "client-transit-1",
      dictionaryCode: "astro_calendar.missing",
      action: {
        type: "create_dictionary_entry",
        dictionaryCode: "astro_calendar.missing",
        suggestedCategory: "calendar"
      }
    }
  ]
} satisfies AstroCalendarRangeResponse;

const dictionaryEntry = {
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
} satisfies DictionaryEffectiveEntryResponse;

describe("AstroCalendarPageView", () => {
  it("renders the reference-like workspace with real range data and read-only future actions", () => {
    const markup = renderToStaticMarkup(<AstroCalendarPageView {...baseProps()} />);
    const css = readFileSync(new URL("./AstroCalendarPage.module.css", import.meta.url), "utf8");

    expect(markup).toContain("Астрокалендарь");
    expect(markup).toContain("Горизонт · 30 дней");
    expect(markup).toContain("Полнолуние 17° Водолея");
    expect(markup).toContain("Марина Краснова");
    expect(markup).toContain("Период кульминации");
    expect(markup).toContain("Автоматизации появятся после отдельного production-контура");
    expect(markup).toContain("disabled");
    expect(css).toContain("height: calc(100dvh - var(--astrologer-app-header-height, 68px))");
    expect(css).toMatch(/\.timeline\s*\{[^}]*height:\s*44px/s);
    expect(css).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*260px minmax\(520px, 1fr\) 360px/s);
  });

  it("keeps missing dictionary entries honest with a create link to references", () => {
    const markup = renderToStaticMarkup(<AstroCalendarPageView {...baseProps()} />);

    expect(markup).toContain("Нет трактовки в справочнике");
    expect(markup).toContain("astro_calendar.missing");
    expect(markup).toContain("/reference?code=astro_calendar.missing&amp;category=calendar");
    expect(markup).not.toContain("AI трактовка");
  });

  it("renders calculating state without claiming queue completion", () => {
    const props = baseProps({
      rangeResponse: {
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
        },
        dictionaryCodes: []
      }
    });
    const markup = renderToStaticMarkup(<AstroCalendarPageView {...props} />);

    expect(markup).toContain("Расчёт выполняется");
    expect(markup).toContain("Фронт не показывает завершение, пока API не вернёт готовый результат.");
    expect(markup).not.toContain("Карта рассчитана");
  });

  it("renders failed retry and stale recalculation states as primary actions", () => {
    const failedMarkup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          rangeResponse: {
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
            },
            dictionaryCodes: []
          }
        })}
      />
    );
    const staleMarkup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          rangeResponse: {
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
            },
            dictionaryCodes: []
          }
        })}
      />
    );

    expect(failedMarkup).toContain("Повторить расчёт");
    expect(staleMarkup).toContain("Пересчитать");
  });

  it("uses responsive CSS without a separate mobile wrapper", () => {
    const css = readFileSync(new URL("./AstroCalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.toolbar\s*\{[^}]*padding:\s*10px/s);
    expect(css).not.toContain("ios-frame");
  });
});

function baseProps(
  overrides: Partial<AstroCalendarPageViewProps> = {}
): AstroCalendarPageViewProps {
  return {
    rangeResponse: response,
    dictionaryEntries: [dictionaryEntry],
    isLoading: false,
    isFetching: false,
    isError: false,
    isDictionaryLoading: false,
    isCommandPending: false,
    query: {
      start: "2026-08-01",
      end: "2026-08-31",
      timeZone: "Europe/Moscow",
      scope: "all",
      clientIds: [],
      eventTypes: []
    },
    scope: "all",
    eventType: "all",
    search: "",
    rangeLabel: "1–31 августа 2026",
    onScopeChange: vi.fn(),
    onEventTypeChange: vi.fn(),
    onSearchChange: vi.fn(),
    onGenerate: vi.fn(),
    onRetry: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides
  };
}
