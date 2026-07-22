import type { CalendarEntry, CalendarRangeResponse } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import styles from "../CalendarPage.module.css";

type CalendarSummaryPanelProps = {
  readonly entries: readonly CalendarEntry[];
  readonly locale: SupportedLocale;
  readonly summary: CalendarRangeResponse["summary"] | null;
  readonly timeZone: string;
};

export function CalendarSummaryPanel({ entries, locale, summary, timeZone }: CalendarSummaryPanelProps) {
  const bookingCount = summary?.bookingCount ?? 0;
  const bookedMinutes = summary?.bookedMinutes ?? 0;
  const hours = bookedMinutes / 60;
  const confirmed = summary?.byDisplayStatus.confirmed ?? 0;
  const blocked = summary?.byDisplayStatus.blocked ?? 0;
  const sessionLabel = locale === "ru" ? pluralizeSessions(bookingCount) : pluralizeSessionsEn(bookingCount);
  const durationLabel = locale === "ru" ? `${formatNumber(hours, locale)} ч` : `${formatNumber(hours, locale)} h`;
  const workloadDays = createWorkloadDays({ entries, locale, timeZone });

  return (
    <aside className={styles.summaryPanel} aria-label={locale === "ru" ? "Сводка недели" : "Week summary"}>
      <div className={styles.summaryHeader}>
        <span className={styles.kicker}>{locale === "ru" ? "Неделя" : "Week"}</span>
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
        {locale === "ru"
          ? `Всё время — в вашем часовом поясе: ${timeZone}.`
          : `All times are shown in your time zone: ${timeZone}.`}
      </p>
    </aside>
  );
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
};

function createWorkloadDays({
  entries,
  locale,
  timeZone
}: {
  readonly entries: readonly CalendarEntry[];
  readonly locale: SupportedLocale;
  readonly timeZone: string;
}): WorkloadDay[] {
  const minutesByDay = [0, 0, 0, 0, 0, 0, 0];

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
      shortLabel
    };
  });
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
