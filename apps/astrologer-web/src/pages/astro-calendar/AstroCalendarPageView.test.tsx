import { readFileSync } from "node:fs";
import type {
  AstroCalendarEvent,
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
    expect(markup).toContain("Горизонт рассчитан");
    expect(markup).toContain("Горизонт · 30 дней");
    expect(markup).toContain("Событий впереди");
    expect(markup).toContain("Клиентов затронуто");
    expect(markup).toContain("Готовых автоматизаций");
    expect(markup).not.toContain("Глобальных <b>");
    expect(markup).toContain("Полнолуние 17° Водолея");
    expect(markup).toContain("Марина Краснова");
    expect(markup).toContain("Написать");
    expect(markup).toContain("Автоматизировать");
    expect(markup).toContain("/flows?source=astro_calendar");
    expect(markup).toContain("eventId=client-transit-1");
    expect(markup).toContain("suggestedTemplateKey=sleeping-client-reactivation");
    expect(markup).toContain("Мягкое касание по транзиту без автоматической отправки");
    expect(markup).toContain("id=\"astro-calendar-search\"");
    expect(markup).toContain("name=\"astro-calendar-search\"");
    expect(markup).toContain("aria-label=\"Поиск по астрокалендарю\"");
    expect(markup).toContain("Период кульминации");
    expect(markup).not.toContain("Отправлено клиенту");
    expect(css).toContain("height: calc(100dvh - var(--astrologer-app-header-height, 68px))");
    expect(css).toMatch(/\.timeline\s*\{[^}]*height:\s*44px/s);
    expect(css).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 920px\)/s);
    expect(css).toMatch(/\.layout\s*\{[^}]*justify-content:\s*center/s);
  });

  it("keeps missing dictionary entries honest with a create link to references", () => {
    const markup = renderToStaticMarkup(<AstroCalendarPageView {...baseProps()} />);

    expect(markup).toContain("Нет трактовки в справочнике");
    expect(markup).toContain("astro_calendar.missing");
    expect(markup).toContain(
      "/reference?create=astro_calendar.missing&amp;search=astro_calendar.missing&amp;title=astro_calendar.missing&amp;category=calendar"
    );
    expect(markup).not.toContain("AI трактовка");
  });

  it("filters the ready range locally by scope and type without showing recalculation", () => {
    const globalMarkup = renderToStaticMarkup(
      <AstroCalendarPageView {...baseProps({ scope: "global" })} />
    );
    const moonMarkup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          eventType: "global.moon_phase",
          query: {
            ...baseProps().query,
            eventTypes: ["global.moon_phase"]
          }
        })}
      />
    );
    const clientMarkup = renderToStaticMarkup(
      <AstroCalendarPageView {...baseProps({ scope: "client" })} />
    );

    expect(globalMarkup).toContain("Горизонт рассчитан");
    expect(globalMarkup).toContain("Полнолуние 17° Водолея");
    expect(globalMarkup).not.toContain("Марина Краснова");
    expect(globalMarkup).toContain("Событий впереди <b>1</b>");
    expect(globalMarkup).toContain("Клиентов затронуто <b>0</b>");
    expect(globalMarkup).not.toContain("Пересчитать");
    expect(moonMarkup).toContain("Полнолуние 17° Водолея");
    expect(moonMarkup).not.toContain("Марина Краснова");
    expect(clientMarkup).toContain("Марина Краснова");
    expect(clientMarkup).not.toContain("Полнолуние 17° Водолея");
  });

  it("keeps dictionary cards scoped to the filtered event set", () => {
    const markup = renderToStaticMarkup(
      <AstroCalendarPageView {...baseProps({ scope: "global" })} />
    );

    expect(markup).toContain("Полнолуние");
    expect(markup).not.toContain("astro_calendar.missing");
    expect(markup).not.toContain("Нет трактовки в справочнике");
  });

  it("keeps the first agenda screen focused on upcoming events", () => {
    const events = Array.from({ length: 15 }, (_, index) => eventWithTitle(index));
    const markup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          rangeResponse: {
            ...response,
            events,
            summary: {
              ...response.summary,
              eventCount: events.length
            },
            dictionaryCodes: []
          }
        })}
      />
    );

    expect(markup).toContain("Сегодня");
    expect(markup).not.toContain("Солярное окно до диапазона");
    expect(markup).toContain("Событие 12");
    expect(markup).not.toContain("Событие 13");
  });

  it("keeps horizon counters aligned with the visible upcoming agenda", () => {
    const previousSolarWindow = {
      ...response.events[1]!,
      id: "previous-solar-window",
      type: "client.solar_window",
      startsAt: "2026-07-30T00:00:00.000Z",
      title: "Соляр · скрытое окно",
      clientRefs: [
        {
          clientId: "11111111-1111-4111-8111-111111111111",
          displayName: "Вера Морозова",
          initials: "ВМ"
        }
      ],
      dictionaryCodes: ["astro_calendar.client.solar_window"]
    } satisfies AstroCalendarEvent;
    const upcomingSolarWindow = {
      ...previousSolarWindow,
      id: "upcoming-solar-window",
      startsAt: "2026-08-03T00:00:00.000Z",
      title: "Соляр · видимое окно",
      clientRefs: [
        {
          clientId: "22222222-2222-4222-8222-222222222222",
          displayName: "Марина Краснова",
          initials: "МК"
        }
      ]
    } satisfies AstroCalendarEvent;
    const markup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          eventType: "client.solar_window",
          query: {
            ...baseProps().query,
            eventTypes: ["client.solar_window"]
          },
          rangeResponse: {
            ...response,
            events: [previousSolarWindow, upcomingSolarWindow],
            dictionaryCodes: ["astro_calendar.client.solar_window"],
            warnings: []
          }
        })}
      />
    );

    expect(markup).toContain("Событий впереди <b>1</b>");
    expect(markup).toContain("Клиентов затронуто <b>1</b>");
    expect(markup).toContain("Соляр · Марина Краснова");
    expect(markup).not.toContain("Вера Морозова");
  });

  it("prioritizes birthday moments before transit noise at the same timestamp", () => {
    const birthday = {
      ...eventWithTitle(1),
      id: "birthday",
      type: "client.birthday",
      title: "День рождения",
      description: null,
      clientRefs: [
        {
          clientId: "22222222-2222-4222-8222-222222222222",
          displayName: "Марина Краснова",
          initials: "МК"
        }
      ]
    } satisfies AstroCalendarEvent;
    const transit = {
      ...eventWithTitle(1),
      id: "transit",
      type: "client.transit_aspect",
      title: "Сатурн: секстиль к Сатурн"
    } satisfies AstroCalendarEvent;
    const markup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          rangeResponse: {
            ...response,
            events: [transit, birthday],
            dictionaryCodes: []
          }
        })}
      />
    );

    expect(markup.indexOf("<h3>День рождения · Марина Краснова</h3>")).toBeLessThan(
      markup.indexOf("<h3>Сатурн: секстиль к Сатурн</h3>")
    );
    expect(markup).toContain(">☼</span>");
    expect(markup).toContain("Повод для тёплого касания");
  });

  it("uses the event point glyph instead of one shared transit glyph", () => {
    const venusTransit = {
      ...eventWithTitle(1),
      id: "venus-transit",
      type: "client.transit_aspect",
      title: "Венера: секстиль к Плутон",
      points: ["Венера", "Плутон"]
    } satisfies AstroCalendarEvent;
    const saturnTransit = {
      ...eventWithTitle(2),
      id: "saturn-transit",
      type: "client.transit_aspect",
      title: "Сатурн: квадрат к Уран",
      points: ["Saturn", "Uranus"]
    } satisfies AstroCalendarEvent;
    const markup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          rangeResponse: {
            ...response,
            events: [venusTransit, saturnTransit],
            dictionaryCodes: []
          }
        })}
      />
    );

    expect(markup).toContain("♀");
    expect(markup).toContain("♄");
    expect(markup).not.toContain('title="Венера: секстиль к Плутон">♃</span>');
  });

  it("limits missing dictionary cards while preserving the total missing count", () => {
    const dictionaryCodes = Array.from({ length: 10 }, (_, index) => `astro_calendar.missing_${index + 1}`);
    const events = dictionaryCodes.map(
      (code, index) =>
        ({
          ...eventWithTitle(index + 1),
          id: `missing-${index + 1}`,
          dictionaryCodes: [code]
        }) satisfies AstroCalendarEvent
    );
    const markup = renderToStaticMarkup(
      <AstroCalendarPageView
        {...baseProps({
          dictionaryEntries: [],
          rangeResponse: {
            ...response,
            events,
            dictionaryCodes,
            warnings: []
          }
        })}
      />
    );

    expect(markup).toContain("astro_calendar.missing_8");
    expect(markup).not.toContain("astro_calendar.missing_9");
    expect(markup).toContain("Ещё 2 кодов без трактовки.");
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

  it("does not present stale or failed empty generations as an empty successful calendar", () => {
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

    expect(staleMarkup).toContain("Астрокалендарь устарел");
    expect(staleMarkup).toContain("Пересчитать");
    expect(staleMarkup).not.toContain("Событий не найдено");
    expect(failedMarkup).toContain("Расчёт завершился ошибкой");
    expect(failedMarkup).toContain("Повторить расчёт");
    expect(failedMarkup).not.toContain("Событий не найдено");
  });

  it("uses responsive CSS without a separate mobile wrapper or clipped side rails", () => {
    const css = readFileSync(new URL("./AstroCalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.workspace\s*\{[^}]*max-width:\s*920px/s);
    expect(css).not.toContain('grid-template-areas: "rail workspace details"');
    expect(css).not.toContain("230px minmax(520px, 1fr) 320px");
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
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

function eventWithTitle(index: number): AstroCalendarEvent {
  const baseEvent: AstroCalendarEvent = response.events[0]!;
  return {
    ...baseEvent,
    id: `event-${index}`,
    startsAt:
      index === 0
        ? "2026-07-25T00:00:00.000Z"
        : `2026-08-${String(index).padStart(2, "0")}T08:55:00.000Z`,
    title: index === 0 ? "Солярное окно до диапазона" : `Событие ${index}`,
    dictionaryCodes: []
  };
}
