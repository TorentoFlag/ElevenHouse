import type {
  AstroCalendarEvent,
  AstroCalendarEventType,
  AstroCalendarRangeQuery,
  AstroCalendarRangeResponse,
  AstroCalendarScope,
  DictionaryEffectiveEntryResponse
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import {
  resolveAstroCalendarInterpretations,
  summarizeAstroCalendarState
} from "../../features/astro-calendar/model/astroCalendarState";
import type { AstroCalendarEventTypeFilter } from "./useAstroCalendarPageController";
import styles from "./AstroCalendarPage.module.css";

export type AstroCalendarPageViewProps = {
  readonly rangeResponse: AstroCalendarRangeResponse | null;
  readonly dictionaryEntries: readonly DictionaryEffectiveEntryResponse[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly isDictionaryLoading: boolean;
  readonly isCommandPending: boolean;
  readonly query: AstroCalendarRangeQuery;
  readonly scope: AstroCalendarScope;
  readonly eventType: AstroCalendarEventTypeFilter;
  readonly search: string;
  readonly rangeLabel: string;
  readonly onScopeChange: (scope: AstroCalendarScope) => void;
  readonly onEventTypeChange: (eventType: AstroCalendarEventTypeFilter) => void;
  readonly onSearchChange: (search: string) => void;
  readonly onGenerate: () => void;
  readonly onRetry: () => void;
  readonly onRefresh: () => void;
};

const eventTypeMeta = {
  "global.moon_phase": { label: "Луна", glyph: "☾", color: "#d8d4ec" },
  "global.eclipse": { label: "Затмение", glyph: "☉", color: "#f47a7a" },
  "global.ingress": { label: "Ингрессия", glyph: "♀", color: "#6fa8ff" },
  "client.birthday": { label: "День рождения", glyph: "☼", color: "#e59cc4" },
  "client.solar_window": { label: "Соляр", glyph: "☉", color: "#f6d266" },
  "client.transit_aspect": { label: "Транзит", glyph: "♃", color: "#4ec8a0" }
} satisfies Record<AstroCalendarEventType, { label: string; glyph: string; color: string }>;

const eventPointGlyphs = {
  asc: "AC",
  ascendant: "AC",
  mc: "MC",
  midheaven: "MC",
  mercury: "☿",
  moon: "☾",
  mars: "♂",
  neptune: "♆",
  pluto: "♇",
  saturn: "♄",
  sun: "☉",
  uranus: "♅",
  venus: "♀",
  jupiter: "♃",
  меркурий: "☿",
  луна: "☾",
  марс: "♂",
  нептун: "♆",
  плутон: "♇",
  сатурн: "♄",
  солнце: "☉",
  уран: "♅",
  венера: "♀",
  юпитер: "♃"
} as const;

const eventTypeOptions = [
  "global.moon_phase",
  "global.ingress",
  "global.eclipse",
  "client.transit_aspect",
  "client.solar_window",
  "client.birthday"
] satisfies AstroCalendarEventType[];
const maxAgendaEvents = 12;
const maxVisibleInterpretations = 8;
const agendaEventTypeRank = {
  "client.birthday": 0,
  "client.solar_window": 1,
  "global.moon_phase": 2,
  "global.eclipse": 3,
  "global.ingress": 4,
  "client.transit_aspect": 5
} satisfies Record<AstroCalendarEventType, number>;

export function AstroCalendarPageView({
  rangeResponse,
  dictionaryEntries,
  isLoading,
  isFetching,
  isError,
  isDictionaryLoading,
  isCommandPending,
  query,
  scope,
  eventType,
  search,
  rangeLabel,
  onScopeChange,
  onEventTypeChange,
  onSearchChange,
  onGenerate,
  onRetry,
  onRefresh
}: AstroCalendarPageViewProps) {
  const state = summarizeAstroCalendarState(rangeResponse);
  const filteredEvents = filterEvents(rangeResponse?.events ?? [], { scope, eventType, search });
  const upcomingEvents = filterAgendaEvents(filteredEvents, query);
  const filteredResponse = rangeResponse
    ? createFilteredInterpretationResponse(rangeResponse, upcomingEvents)
    : null;
  const interpretations = filteredResponse
    ? resolveAstroCalendarInterpretations(
        filteredResponse,
        {
          entries: [...dictionaryEntries],
          total: dictionaryEntries.length,
          counts: {
            sources: {
              all: dictionaryEntries.length,
              platform: dictionaryEntries.filter((entry) => entry.source === "platform").length,
              modified: dictionaryEntries.filter((entry) => entry.source === "modified").length,
              custom: dictionaryEntries.filter((entry) => entry.source === "custom").length
            }
          }
        }
      )
    : null;
  const timelineEvents = upcomingEvents.slice(0, 12);
  const agendaEvents = upcomingEvents.slice(0, maxAgendaEvents);
  const statusCopy = getStatusCopy(state.status);
  const skyCopy = getSkyCardCopy(rangeResponse, state.status);
  const visibleEventCount = upcomingEvents.length;
  const affectedClientCount = countAffectedClients(upcomingEvents);
  const shouldShowActionState =
    filteredEvents.length === 0 &&
    (state.status === "no-data" || state.status === "stale" || state.status === "failed");
  const interpretationEntries = Object.values(interpretations?.entriesByCode ?? {});
  const visibleInterpretationEntries = interpretationEntries.slice(0, maxVisibleInterpretations);
  const visibleMissingInterpretations = (interpretations?.missing ?? []).slice(
    0,
    Math.max(maxVisibleInterpretations - visibleInterpretationEntries.length, 0)
  );
  const hiddenInterpretationCount =
    interpretationEntries.length +
    (interpretations?.missing.length ?? 0) -
    visibleInterpretationEntries.length -
    visibleMissingInterpretations.length;
  const hasInterpretations =
    visibleInterpretationEntries.length > 0 || visibleMissingInterpretations.length > 0;

  return (
    <section className={styles.page} aria-labelledby="astro-calendar-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.iconBox} aria-hidden="true">
            <Icon iconName="logoMoon" width={18} height={18} />
          </span>
          <div>
            <h1 id="astro-calendar-title">Астрокалендарь</h1>
          </div>
        </div>

        <div className={styles.scopeTabs} aria-label="Фильтр области событий">
          {[
            ["all", "Все"],
            ["global", "Глобальные"],
            ["client", "Клиентские"]
          ].map(([value, label]) => (
            <button
              key={value}
              className={scope === value ? styles.scopeActive : styles.scopeButton}
              type="button"
              onClick={() => onScopeChange(value as AstroCalendarScope)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className={styles.searchBox}>
          <Icon iconName="search" width={15} height={15} aria-hidden="true" />
          <input
            id="astro-calendar-search"
            name="astro-calendar-search"
            value={search}
            aria-label="Поиск по астрокалендарю"
            placeholder="Поиск: событие, знак, клиент…"
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>

        <span className={styles.toolbarMeta}>
          Персональные события — по <b>{state.readiness.clientsReady}</b> привязанным картам
        </span>
      </header>

      <div className={styles.layout}>
        <main className={styles.workspace} aria-busy={isFetching ? "true" : undefined}>
          <section className={styles.skyCard}>
            <span className={styles.skyIcon} aria-hidden="true">
              <Icon iconName="logoMoon" width={20} height={20} />
            </span>
            <div>
              <strong>{skyCopy.title}</strong>
              <p>{skyCopy.description}</p>
            </div>
            <span className={styles.skyBadge} title={statusCopy.description}>
              {statusBadgeLabel(state.status)}
            </span>
            <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
              <Icon iconName="content" width={14} height={14} aria-hidden="true" />
              Обновить
            </button>
          </section>

          <div className={styles.typeBar} aria-label="Фильтр типов событий">
            <button
              className={eventType === "all" ? styles.typeActive : styles.typeButton}
              type="button"
              onClick={() => onEventTypeChange("all")}
            >
              Все типы
            </button>
            {eventTypeOptions.map((type) => (
              <button
                key={type}
                className={eventType === type ? styles.typeActive : styles.typeButton}
                type="button"
                onClick={() => onEventTypeChange(type)}
              >
                <span style={{ background: eventTypeMeta[type].color }} />
                {eventTypeMeta[type].label}
              </button>
            ))}
          </div>

          <section className={styles.horizonCard} aria-label="Горизонт событий">
            <div className={styles.horizonHeader}>
              <strong>Горизонт · 30 дней</strong>
              <span>
                Событий впереди <b>{visibleEventCount}</b>
              </span>
              <span>
                Клиентов затронуто <b>{affectedClientCount}</b>
              </span>
              <span>
                Готовых автоматизаций <b>0</b>
              </span>
            </div>
            <div className={styles.timeline}>
              <span className={styles.todayMark}>сегодня</span>
              {timelineEvents.map((event, index) => {
                const meta = eventTypeMeta[event.type];
                const glyph = eventGlyph(event);
                return (
                  <span
                    key={event.id}
                    className={styles.timelineDot}
                    style={{ left: `${Math.min(96, 8 + index * 8)}%`, borderColor: meta.color, color: meta.color }}
                    title={displayEventTitle(event)}
                  >
                    {glyph}
                  </span>
                );
              })}
            </div>
          </section>

          {state.readiness.warnings.length > 0 ? (
            <section className={styles.readinessCard} aria-label="Готовность клиентских карт">
              <div className={styles.warningList}>
                {state.readiness.warnings.map((warning) => (
                  <p key={`${warning.code}:${warning.clientId ?? "all"}`}>{warning.message}</p>
                ))}
              </div>
            </section>
          ) : null}

          {isError ? (
            <div className={styles.stateCard} role="alert">
              <strong>Не удалось загрузить астрокалендарь</strong>
              <button type="button" onClick={onRefresh}>Повторить</button>
            </div>
          ) : isLoading ? (
            <div className={styles.stateCard}>Загружаем астрокалендарь...</div>
          ) : state.status === "calculating" ? (
            <div className={styles.stateCard}>
              <strong>Расчёт выполняется</strong>
              <span>Фронт не показывает завершение, пока API не вернёт готовый результат.</span>
            </div>
          ) : shouldShowActionState ? (
            <div className={styles.actionState}>
              <span>{rangeLabel} · {query.timeZone}</span>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isCommandPending || state.primaryAction === "none"}
                onClick={state.primaryAction === "retry" ? onRetry : onGenerate}
              >
                <Icon iconName={state.primaryAction === "retry" ? "refresh" : "lightning"} width={15} height={15} aria-hidden="true" />
                {state.primaryAction === "retry" ? "Повторить расчёт" : "Пересчитать"}
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className={styles.stateCard}>Событий не найдено</div>
          ) : (
            <section className={styles.agenda} aria-label="События астрокалендаря">
              {groupEvents(agendaEvents, query).map((group) => (
                <div key={group.label} className={styles.group}>
                  <h2>{group.label}</h2>
                  {group.events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ))}
            </section>
          )}

          <section className={styles.interpretations} aria-label="Трактовки">
            <h2 className={styles.kicker}>Трактовки</h2>
            {isDictionaryLoading ? <p className={styles.muted}>Загружаем справочник...</p> : null}
            {interpretations?.status === "none" ? (
              <p className={styles.muted}>У событий этого диапазона нет кодов трактовок.</p>
            ) : null}
            {hasInterpretations ? (
              <div className={styles.interpretationGrid}>
                {visibleInterpretationEntries.map((entry) => (
                  <article key={entry.code} className={styles.interpretationCard}>
                    <span>{entry.categoryCode}</span>
                    <h3>{entry.title}</h3>
                    <p>{entry.content}</p>
                    <small>Справочник · {entry.source}</small>
                  </article>
                ))}
                {visibleMissingInterpretations.map((missing) => (
                  <article key={missing.code} className={styles.missingCard}>
                    <span>Нет трактовки в справочнике</span>
                    <strong>{missing.code}</strong>
                    <a
                      href={referenceCreateHref(missing)}
                    >
                      Создать трактовку
                    </a>
                  </article>
                ))}
              </div>
            ) : null}
            {hiddenInterpretationCount > 0 ? (
              <p className={styles.muted}>Ещё {hiddenInterpretationCount} кодов без трактовки.</p>
            ) : null}
          </section>
        </main>
      </div>
    </section>
  );
}

function EventCard({ event }: { readonly event: AstroCalendarEvent }) {
  const meta = eventTypeMeta[event.type];
  const description = event.description ?? defaultEventDescription(event.type);
  const title = displayEventTitle(event);
  const glyph = eventGlyph(event);

  return (
    <article className={styles.eventCard}>
      <div className={styles.eventStripe} style={{ background: meta.color }} />
      <div className={styles.eventBody}>
        <div className={styles.eventMain}>
          <span
            className={styles.eventGlyph}
            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 16%, rgb(25 22 54))` }}
          >
            {glyph}
          </span>
          <div>
            <div className={styles.eventMeta}>
              <span style={{ color: meta.color }}>{meta.label}</span>
              <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
        <div className={styles.eventFooter}>
          {event.clientRefs.length > 0 ? (
            <div className={styles.clientRefs}>
              {event.clientRefs.map((client) => (
                <span key={client.clientId}>
                  <b>{client.initials}</b>
                  {client.displayName}
                </span>
              ))}
            </div>
          ) : (
            <span className={styles.globalBadge}>
              <Icon iconName="globe" width={12} height={12} aria-hidden="true" />
              Глобальное событие
            </span>
          )}
        </div>
        <div className={styles.eventActionRow}>
          <span>
            <Icon iconName="sparkle" width={14} height={14} aria-hidden="true" />
            {eventSuggestion(event)}
          </span>
          {event.clientRefs.length > 0 ? (
            <button
              className={styles.futureButton}
              type="button"
              disabled
              title="Сообщение по астрособытию требует отдельного production-контура"
            >
              <Icon iconName="chat" width={14} height={14} aria-hidden="true" />
              Написать
            </button>
          ) : null}
          <button
            className={styles.futureButton}
            type="button"
            disabled
            title="Автоматизации появятся после отдельного production-контура"
          >
            <Icon iconName="flow" width={14} height={14} aria-hidden="true" />
            Автоматизировать
          </button>
        </div>
      </div>
    </article>
  );
}

function eventGlyph(event: AstroCalendarEvent): string {
  if (event.type === "client.birthday" || event.type === "client.solar_window") {
    return eventTypeMeta[event.type].glyph;
  }
  for (const point of event.points) {
    const normalized = normalizeEventPoint(point);
    const glyph = eventPointGlyphs[normalized as keyof typeof eventPointGlyphs];
    if (glyph) return glyph;
  }
  return eventTypeMeta[event.type].glyph;
}

function normalizeEventPoint(point: string): string {
  return point.trim().toLowerCase().replace(/[_\s-]+/g, "_");
}

function displayEventTitle(event: AstroCalendarEvent): string {
  const primaryClient = event.clientRefs[0];
  if (event.type === "client.birthday" && primaryClient) {
    return `День рождения · ${primaryClient.displayName}`;
  }
  if (event.type === "client.solar_window" && primaryClient) {
    return `Соляр · ${primaryClient.displayName}`;
  }
  return event.title;
}

function getSkyCardCopy(
  response: AstroCalendarRangeResponse | null,
  status: ReturnType<typeof summarizeAstroCalendarState>["status"]
): { title: string; description: string } {
  if (!response?.generation.provider || status !== "ready") {
    return {
      title: getStatusCopy(status).title,
      description: getStatusCopy(status).description
    };
  }
  return {
    title: "Горизонт рассчитан",
    description: `${response.range.start}–${response.range.end} · ${response.generation.provider.name} ${response.generation.provider.version}`
  };
}

function statusBadgeLabel(status: ReturnType<typeof summarizeAstroCalendarState>["status"]): string {
  if (status === "ready") return "Расчёт готов";
  if (status === "calculating") return "Идёт расчёт";
  if (status === "failed") return "Ошибка расчёта";
  if (status === "stale") return "Нужен пересчёт";
  return "Нет расчёта";
}

function countAffectedClients(events: readonly AstroCalendarEvent[]): number {
  return new Set(events.flatMap((event) => event.clientRefs.map((client) => client.clientId))).size;
}

function defaultEventDescription(type: AstroCalendarEventType): string {
  if (type === "client.birthday") {
    return "Повод для тёплого касания и персонального предложения без ручного поиска по CRM.";
  }
  if (type === "client.solar_window") {
    return "Период вокруг возвращения Солнца: удобно предложить годовой прогноз или соляр.";
  }
  if (type === "client.transit_aspect") {
    return "Персональный транзит по привязанной карте клиента; проверьте уместность касания.";
  }
  if (type === "global.moon_phase") {
    return "Глобальный лунный инфоповод для контента, эфиров и мягких касаний аудитории.";
  }
  if (type === "global.eclipse") {
    return "Сильная глобальная точка периода; подходит для контента с предупреждением о нагрузке.";
  }
  return "Глобальное событие периода; можно использовать как повод для контента или рассылки.";
}

function eventSuggestion(event: AstroCalendarEvent): string {
  if (event.type === "client.birthday") {
    return "Поздравить + персональный бонус по программе лояльности";
  }
  if (event.type === "client.solar_window") {
    return "Предложить разбор соляра на год";
  }
  if (event.type === "client.transit_aspect") {
    return "Мягкое касание по транзиту без автоматической отправки";
  }
  if (event.type === "global.moon_phase") {
    return "Подготовить пост или эфир по лунному событию";
  }
  if (event.type === "global.eclipse") {
    return "Спец-разбор периода затмений без автозапуска";
  }
  return "Оффер или контент-повод по глобальному событию";
}

function createFilteredInterpretationResponse(
  response: AstroCalendarRangeResponse,
  events: readonly AstroCalendarEvent[]
): AstroCalendarRangeResponse {
  const dictionaryCodes = Array.from(new Set(events.flatMap((event) => event.dictionaryCodes)));
  const dictionaryCodeSet = new Set(dictionaryCodes);
  const eventIdSet = new Set(events.map((event) => event.id));

  return {
    ...response,
    dictionaryCodes,
    warnings: response.warnings.filter((warning) => {
      if (warning.eventId) return eventIdSet.has(warning.eventId);
      if (warning.dictionaryCode) return dictionaryCodeSet.has(warning.dictionaryCode);
      return true;
    })
  };
}

function referenceCreateHref(missing: {
  readonly code: string;
  readonly suggestedCategory: string;
}): string {
  const searchParams = new URLSearchParams({
    create: missing.code,
    search: missing.code,
    title: missing.code,
    category: missing.suggestedCategory
  });

  return `/reference?${searchParams.toString()}`;
}

function filterEvents(
  events: readonly AstroCalendarEvent[],
  filters: {
    readonly scope: AstroCalendarScope;
    readonly eventType: AstroCalendarEventTypeFilter;
    readonly search: string;
  }
) {
  const scopedEvents =
    filters.scope === "all"
      ? events
      : events.filter((event) => event.source === filters.scope);
  const typedEvents =
    filters.eventType === "all"
      ? scopedEvents
      : scopedEvents.filter((event) => event.type === filters.eventType);
  const needle = filters.search.trim().toLowerCase();
  if (!needle) return typedEvents;

  return typedEvents.filter((event) =>
    [
      displayEventTitle(event),
      event.title,
      event.subtitle ?? "",
      event.description ?? "",
      event.sign ?? "",
      ...event.clientRefs.map((client) => client.displayName)
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  );
}

function filterAgendaEvents(
  events: readonly AstroCalendarEvent[],
  query: AstroCalendarRangeQuery
) {
  const rangeStartKey = query.start;
  return [...events]
    .filter((event) => dateKeyInTimeZone(event.startsAt, query.timeZone) >= rangeStartKey)
    .sort(compareAgendaEvents);
}

function compareAgendaEvents(left: AstroCalendarEvent, right: AstroCalendarEvent): number {
  const time = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
  if (time !== 0) return time;
  const rank = agendaEventTypeRank[left.type] - agendaEventTypeRank[right.type];
  if (rank !== 0) return rank;
  return left.title.localeCompare(right.title, "ru");
}

function groupEvents(events: readonly AstroCalendarEvent[], query: AstroCalendarRangeQuery) {
  const groups = new Map<string, AstroCalendarEvent[]>();
  for (const event of events) {
    const label = groupLabel(event.startsAt, query);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }
  return Array.from(groups, ([label, groupedEvents]) => ({ label, events: groupedEvents }));
}

function groupLabel(instant: string, query: AstroCalendarRangeQuery): string {
  const eventKey = dateKeyInTimeZone(instant, query.timeZone);
  const rangeStart = new Date(`${query.start}T00:00:00.000Z`);
  const eventDate = new Date(`${eventKey}T00:00:00.000Z`);
  const daysFromStart = Math.floor(
    (eventDate.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysFromStart <= 0) return "Сегодня";
  if (daysFromStart <= 7) return "На этой неделе";
  if (daysFromStart <= 31) return "В этом месяце";
  return "Дальше";
}

function dateKeyInTimeZone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(instant));
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatEventDate(instant: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(new Date(instant))
    .replaceAll("\u202f", " ");
}

function getStatusCopy(status: ReturnType<typeof summarizeAstroCalendarState>["status"]) {
  if (status === "no-data") {
    return {
      title: "Календарь ещё не рассчитан",
      description: "Запустите расчёт, чтобы получить реальные глобальные и клиентские события."
    };
  }
  if (status === "stale") {
    return {
      title: "Астрокалендарь устарел",
      description: "Диапазон, настройки или клиентские данные изменились. Нужен пересчёт."
    };
  }
  if (status === "failed") {
    return {
      title: "Расчёт завершился ошибкой",
      description: "Ошибка видима и может быть повторена без фейкового результата."
    };
  }
  if (status === "calculating") {
    return {
      title: "Расчёт выполняется",
      description: "Фронт ждёт готовый результат от API и worker."
    };
  }
  return {
    title: "Натальная и событийная база рассчитана",
    description: "События ниже пришли из сохранённого read model и справочника трактовок."
  };
}
