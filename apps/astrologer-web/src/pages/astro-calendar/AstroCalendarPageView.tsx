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
  "global.eclipse": { label: "Затмения", glyph: "☉", color: "#f47a7a" },
  "global.ingress": { label: "Ингрессии", glyph: "♀", color: "#6fa8ff" },
  "client.birthday": { label: "Дни рождения", glyph: "☼", color: "#e59cc4" },
  "client.solar_window": { label: "Соляры", glyph: "☉", color: "#f6d266" },
  "client.transit_aspect": { label: "Транзиты", glyph: "♃", color: "#4ec8a0" }
} satisfies Record<AstroCalendarEventType, { label: string; glyph: string; color: string }>;

const eventTypeOptions = Object.keys(eventTypeMeta) as AstroCalendarEventType[];

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
  const interpretations = rangeResponse
    ? resolveAstroCalendarInterpretations(
        rangeResponse,
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
  const filteredEvents = filterEvents(rangeResponse?.events ?? [], search);
  const timelineEvents = filteredEvents.slice(0, 12);
  const statusCopy = getStatusCopy(state.status);

  return (
    <section className={styles.page} aria-labelledby="astro-calendar-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.iconBox} aria-hidden="true">
            <Icon iconName="calendar" width={18} height={18} />
          </span>
          <div>
            <h1 id="astro-calendar-title">Астрокалендарь</h1>
            <p>{rangeLabel} · {query.timeZone}</p>
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
            value={search}
            placeholder="Поиск: событие, знак, клиент..."
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>

        <button
          className={styles.primaryButton}
          type="button"
          disabled={isCommandPending || state.primaryAction === "none"}
          onClick={state.primaryAction === "retry" ? onRetry : onGenerate}
        >
          <Icon iconName={state.primaryAction === "retry" ? "refresh" : "lightning"} width={15} height={15} aria-hidden="true" />
          {state.primaryAction === "retry"
            ? "Повторить расчёт"
            : state.primaryAction === "recalculate"
              ? "Пересчитать"
              : "Рассчитать"}
        </button>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rail} aria-label="Фильтры и готовность клиентов">
          <section className={styles.panelSection}>
            <h2>Готовность</h2>
            <div className={styles.readinessGrid}>
              <Metric label="Клиентов" value={state.readiness.clientsTotal} />
              <Metric label="Готовы" value={state.readiness.clientsReady} />
              <Metric label="Нет данных" value={state.readiness.missingBirthData} />
              <Metric label="Нет времени" value={state.readiness.unknownBirthTime} />
              <Metric label="Примерно" value={state.readiness.approximateBirthTime} />
            </div>
            {state.readiness.warnings.length > 0 ? (
              <div className={styles.warningList}>
                {state.readiness.warnings.map((warning) => (
                  <p key={`${warning.code}:${warning.clientId ?? "all"}`}>{warning.message}</p>
                ))}
              </div>
            ) : null}
          </section>

          <section className={styles.panelSection}>
            <h2>Типы</h2>
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
          </section>
        </aside>

        <main className={styles.workspace} aria-busy={isFetching ? "true" : undefined}>
          <section className={styles.skyCard}>
            <span className={styles.skyIcon} aria-hidden="true">
              <Icon iconName="orbit" width={20} height={20} />
            </span>
            <div>
              <strong>{statusCopy.title}</strong>
              <p>{statusCopy.description}</p>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
              <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
              Обновить
            </button>
          </section>

          <section className={styles.horizonCard} aria-label="Горизонт событий">
            <div className={styles.horizonHeader}>
              <strong>Горизонт · 30 дней</strong>
              <span>
                Событий <b>{rangeResponse?.summary.eventCount ?? 0}</b>
              </span>
              <span>
                Клиентских <b>{rangeResponse?.summary.clientEventCount ?? 0}</b>
              </span>
              <span>
                Глобальных <b>{rangeResponse?.summary.globalEventCount ?? 0}</b>
              </span>
            </div>
            <div className={styles.timeline}>
              <span className={styles.todayMark}>сегодня</span>
              {timelineEvents.map((event, index) => {
                const meta = eventTypeMeta[event.type];
                return (
                  <span
                    key={event.id}
                    className={styles.timelineDot}
                    style={{ left: `${Math.min(96, 8 + index * 8)}%`, borderColor: meta.color, color: meta.color }}
                    title={event.title}
                  >
                    {meta.glyph}
                  </span>
                );
              })}
            </div>
          </section>

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
          ) : filteredEvents.length === 0 ? (
            <div className={styles.stateCard}>Событий не найдено</div>
          ) : (
            <section className={styles.agenda} aria-label="События астрокалендаря">
              {groupEvents(filteredEvents).map((group) => (
                <div key={group.label} className={styles.group}>
                  <h2>{group.label}</h2>
                  {group.events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ))}
            </section>
          )}
        </main>

        <aside className={styles.details} aria-label="Трактовки">
          <section className={styles.panelSection}>
            <h2>Трактовки</h2>
            {isDictionaryLoading ? <p className={styles.muted}>Загружаем справочник...</p> : null}
            {interpretations?.status === "none" ? (
              <p className={styles.muted}>У событий этого диапазона нет кодов трактовок.</p>
            ) : null}
            {Object.values(interpretations?.entriesByCode ?? {}).map((entry) => (
              <article key={entry.code} className={styles.interpretationCard}>
                <span>{entry.categoryCode}</span>
                <h3>{entry.title}</h3>
                <p>{entry.content}</p>
                <small>Справочник · {entry.source}</small>
              </article>
            ))}
            {interpretations?.missing.map((missing) => (
              <article key={missing.code} className={styles.missingCard}>
                <span>Нет трактовки в справочнике</span>
                <strong>{missing.code}</strong>
                <a
                  href={`/reference?code=${encodeURIComponent(missing.code)}&category=${encodeURIComponent(missing.suggestedCategory)}`}
                >
                  Создать трактовку
                </a>
              </article>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}

function EventCard({ event }: { readonly event: AstroCalendarEvent }) {
  const meta = eventTypeMeta[event.type];

  return (
    <article className={styles.eventCard}>
      <div className={styles.eventStripe} style={{ background: meta.color }} />
      <div className={styles.eventBody}>
        <div className={styles.eventMain}>
          <span className={styles.eventGlyph} style={{ color: meta.color }}>
            {meta.glyph}
          </span>
          <div>
            <div className={styles.eventMeta}>
              <span style={{ color: meta.color }}>{meta.label}</span>
              <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
            </div>
            <h3>{event.title}</h3>
            {event.description ? <p>{event.description}</p> : null}
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
          <button
            className={styles.futureButton}
            type="button"
            disabled
            title="Автоматизации появятся после отдельного production-контура"
          >
            <Icon iconName="flow" width={14} height={14} aria-hidden="true" />
            Автоматизация
          </button>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className={styles.metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function filterEvents(events: readonly AstroCalendarEvent[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return events;

  return events.filter((event) =>
    [
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

function groupEvents(events: readonly AstroCalendarEvent[]) {
  const groups = new Map<string, AstroCalendarEvent[]>();
  for (const event of events) {
    const label = groupLabel(event.startsAt);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }
  return Array.from(groups, ([label, groupedEvents]) => ({ label, events: groupedEvents }));
}

function groupLabel(instant: string): string {
  const day = new Date(instant).getUTCDate();
  if (day <= 7) return "На этой неделе";
  if (day <= 31) return "В этом месяце";
  return "Дальше";
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
