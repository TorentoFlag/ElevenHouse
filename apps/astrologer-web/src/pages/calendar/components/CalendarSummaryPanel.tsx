import type { CalendarRangeResponse } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import styles from "../CalendarPage.module.css";

type CalendarSummaryPanelProps = {
  readonly locale: SupportedLocale;
  readonly summary: CalendarRangeResponse["summary"] | null;
};

export function CalendarSummaryPanel({ locale, summary }: CalendarSummaryPanelProps) {
  const bookingCount = summary?.bookingCount ?? 0;
  const bookedMinutes = summary?.bookedMinutes ?? 0;
  const hours = bookedMinutes / 60;
  const confirmed = summary?.byDisplayStatus.confirmed ?? 0;
  const blocked = summary?.byDisplayStatus.blocked ?? 0;
  const sessionLabel = locale === "ru" ? pluralizeSessions(bookingCount) : pluralizeSessionsEn(bookingCount);
  const durationLabel = locale === "ru" ? `${formatNumber(hours, locale)} ч` : `${formatNumber(hours, locale)} h`;

  return (
    <aside className={styles.summaryPanel} aria-label={locale === "ru" ? "Сводка недели" : "Week summary"}>
      <div className={styles.summaryHeader}>
        <span className={styles.kicker}>{locale === "ru" ? "Неделя" : "Week"}</span>
        <strong className={styles.summaryHeadline}>
          {bookingCount} {sessionLabel} · {durationLabel}
        </strong>
      </div>

      <div className={styles.summarySection}>
        <span className={styles.kicker}>{locale === "ru" ? "По статусам" : "By status"}</span>
        <SummaryRow label={locale === "ru" ? "Подтверждена" : "Confirmed"} value={confirmed} tone="confirmed" />
        <SummaryRow label={locale === "ru" ? "Недоступно" : "Unavailable"} value={blocked} tone="blocked" />
      </div>
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
