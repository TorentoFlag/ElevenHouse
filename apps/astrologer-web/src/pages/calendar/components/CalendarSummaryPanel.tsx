import type { CalendarEntry, CalendarRangeResponse, CalendarView } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import styles from "../CalendarPage.module.css";

type CalendarSummaryPanelProps = {
  readonly entries: readonly CalendarEntry[];
  readonly locale: SupportedLocale;
  readonly range: { readonly start: string; readonly end: string };
  readonly summary: CalendarRangeResponse["summary"] | null;
  readonly timeZone: string;
  readonly today: string;
  readonly view: CalendarView;
};

export function CalendarSummaryPanel({
  entries,
  locale,
  range,
  summary,
  timeZone,
  today,
  view
}: CalendarSummaryPanelProps) {
  const bookingCount = summary?.bookingCount ?? 0;
  const bookedMinutes = summary?.bookedMinutes ?? 0;
  const hours = bookedMinutes / 60;
  const confirmed = summary?.byDisplayStatus.confirmed ?? 0;
  const blocked = summary?.byDisplayStatus.blocked ?? 0;
  const sessionLabel = locale === "ru" ? pluralizeSessions(bookingCount) : pluralizeSessionsEn(bookingCount);
  const durationLabel = locale === "ru" ? `${formatNumber(hours, locale)} ч` : `${formatNumber(hours, locale)} h`;
  const workloadDays = createWorkloadDays({ entries, locale, range, timeZone, today });
  const viewLabel = getSummaryViewLabel(view, locale);

  return (
    <aside className={styles.summaryPanel} aria-label={viewLabel.ariaLabel}>
      <div className={styles.summaryHeader}>
        <span className={styles.kicker}>{viewLabel.kicker}</span>
        <strong className={styles.summaryHeadline}>
          {bookingCount} {sessionLabel} · {durationLabel}
        </strong>
      </div>

      <div className={styles.summarySection}>
        <span className={styles.kicker}>{locale === "ru" ? "Загрузка по дням" : "Daily workload"}</span>
        <div className={styles.summaryBarChart} role="list">
          {workloadDays.map((day) => (
            <div
              aria-label={day.accessibleLabel}
              className={styles.summaryBarItem}
              data-calendar-summary-day={day.shortLabel}
              data-calendar-summary-tone={day.tone}
              key={day.key}
              role="listitem"
              title={day.accessibleLabel}
            >
              <span className={styles.summaryBar} aria-hidden="true">
                <span className={styles.summaryBarFill} style={{ height: `${day.heightPercent}%` }} />
              </span>
              <span>{day.shortLabel}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.summarySection}>
        <span className={styles.kicker}>{locale === "ru" ? "По статусам" : "By status"}</span>
        <SummaryRow label={locale === "ru" ? "Подтверждена" : "Confirmed"} value={confirmed} tone="confirmed" />
        <SummaryRow label={locale === "ru" ? "Недоступно" : "Unavailable"} value={blocked} tone="blocked" />
      </div>

      <p className={styles.summaryTimezoneNote}>
        <Icon iconName="globe" width={16} height={16} aria-hidden="true" />
        {locale === "ru"
          ? `Всё время — в вашем часовом поясе: ${timeZone}.`
          : `All times are shown in your time zone: ${timeZone}.`}
      </p>
    </aside>
  );
}

function getSummaryViewLabel(view: CalendarView, locale: SupportedLocale) {
  if (locale === "ru") {
    if (view === "day") return { ariaLabel: "Сводка дня", kicker: "День" };
    if (view === "month") return { ariaLabel: "Сводка месяца", kicker: "Месяц" };
    return { ariaLabel: "Сводка недели", kicker: "Неделя" };
  }

  if (view === "day") return { ariaLabel: "Day summary", kicker: "Day" };
  if (view === "month") return { ariaLabel: "Month summary", kicker: "Month" };
  return { ariaLabel: "Week summary", kicker: "Week" };
}

function SummaryRow({
  label,
  value,
  tone
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: "confirmed" | "blocked";
}) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.statusBadge} data-tone={tone}>
        <span className={styles.statusDot} aria-hidden="true" />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function pluralizeSessions(value: number): string {
  const remainder100 = value % 100;
  const remainder10 = value % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return "сессий";
  if (remainder10 === 1) return "сессия";
  if (remainder10 >= 2 && remainder10 <= 4) return "сессии";
  return "сессий";
}

function pluralizeSessionsEn(value: number): string {
  return value === 1 ? "session" : "sessions";
}

function formatNumber(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: 1
  }).format(value);
}

type WorkloadDay = {
  readonly accessibleLabel: string;
  readonly heightPercent: number;
  readonly key: string;
  readonly shortLabel: string;
  readonly tone: "active" | "empty" | "today";
};

function createWorkloadDays({
  entries,
  locale,
  range,
  today,
  timeZone
}: {
  readonly entries: readonly CalendarEntry[];
  readonly locale: SupportedLocale;
  readonly range: { readonly start: string; readonly end: string };
  readonly today: string;
  readonly timeZone: string;
}): WorkloadDay[] {
  const minutesByDay = [0, 0, 0, 0, 0, 0, 0];
  const todayIndex = getTodayIndexInRange(today, range, timeZone);

  for (const entry of entries) {
    if (entry.kind !== "booking") continue;
    const weekdayIndex = getLocalWeekdayIndex(entry.startAt, timeZone);
    if (weekdayIndex === null) continue;

    const durationMinutes = Math.max(0, (Date.parse(entry.endAt) - Date.parse(entry.startAt)) / 60_000);
    minutesByDay[weekdayIndex] = (minutesByDay[weekdayIndex] ?? 0) + durationMinutes;
  }

  const maxMinutes = Math.max(60, ...minutesByDay);

  return minutesByDay.map((minutes, index) => {
    const shortLabel = formatWeekday(index, locale);
    const hours = minutes / 60;
    const hoursLabel = locale === "ru" ? `${formatNumber(hours, locale)} ч` : `${formatNumber(hours, locale)} h`;

    return {
      accessibleLabel: `${shortLabel} · ${hoursLabel}`,
      heightPercent: minutes === 0 ? 7 : Math.max(7, Math.round((minutes / maxMinutes) * 100)),
      key: String(index),
      shortLabel,
      tone: index === todayIndex ? "today" : minutes > 0 ? "active" : "empty"
    };
  });
}

function getTodayIndexInRange(
  today: string,
  range: { readonly start: string; readonly end: string },
  timeZone: string
): number | null {
  if (
    today < formatLocalDate(range.start, timeZone) ||
    today >= formatLocalDate(range.end, timeZone)
  ) {
    return null;
  }

  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function formatLocalDate(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value])
  );

  return `${parts.year ?? "1970"}-${parts.month ?? "01"}-${parts.day ?? "01"}`;
}

function getLocalWeekdayIndex(instant: string, timeZone: string): number | null {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(new Date(instant));
  const indexByWeekday: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6
  };

  return indexByWeekday[weekday] ?? null;
}

function formatWeekday(index: number, locale: SupportedLocale): string {
  const labels =
    locale === "ru" ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels[index] ?? "";
}
