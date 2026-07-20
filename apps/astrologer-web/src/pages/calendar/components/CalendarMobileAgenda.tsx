import type { AvailabilityBackground, CalendarEntry } from "@elevenhouse/contracts";
import { Calendar, Clock, Video, Mic, Chat, Doc } from "@elevenhouse/design-system/icons";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Temporal } from "temporal-polyfill";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import { createClientInitials } from "../../../features/bookings/model/bookingDetailModel";
import styles from "../CalendarPage.module.css";

type CalendarMobileAgendaProps = {
  readonly copy: AstrologerCopy["calendar"]["mobileAgenda"];
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly rangeLabel: string;
  readonly entries: readonly CalendarEntry[];
  readonly availability: readonly AvailabilityBackground[];
  readonly onSelectEntry: (entry: CalendarEntry) => void;
  readonly onOpenManualBooking: (selection: {
    readonly start: string;
    readonly end: string;
  }) => void;
};

type AgendaDay = {
  readonly date: string;
  readonly firstInstant: string;
  readonly entries: readonly CalendarEntry[];
  readonly availability: readonly AvailabilityBackground[];
};

export function CalendarMobileAgenda(props: CalendarMobileAgendaProps) {
  const days = createAgendaDays(props.entries, props.availability, props.timeZone);

  return (
    <section
      className={styles.mobileAgenda}
      data-mobile-calendar-agenda="true"
      aria-label={props.copy.agendaLabel}
    >
      <header className={styles.mobileAgendaHeader}>
        <Calendar width={17} height={17} aria-hidden="true" />
        <strong>{props.rangeLabel}</strong>
        <span>{props.timeZone}</span>
      </header>

      {days.length === 0 ? (
        <p className={styles.mobileAgendaEmpty}>{props.copy.emptyLabel}</p>
      ) : (
        <div className={styles.mobileAgendaDays}>
          {days.map((day) => (
            <AgendaDaySection key={day.date} day={day} {...props} />
          ))}
        </div>
      )}
    </section>
  );
}

function AgendaDaySection(props: CalendarMobileAgendaProps & { readonly day: AgendaDay }) {
  const headingId = `calendar-agenda-${props.day.date}`;

  return (
    <section className={styles.mobileAgendaDay} aria-labelledby={headingId}>
      <h2 id={headingId}>{formatDayLabel(props.day.firstInstant, props.locale, props.timeZone)}</h2>

      <div className={styles.mobileAgendaItems}>
        {props.day.entries.map((entry) =>
          entry.kind === "booking" ? (
            <BookingAgendaItem
              key={entry.id}
              copy={props.copy}
              entry={entry}
              locale={props.locale}
              timeZone={props.timeZone}
              onSelectEntry={props.onSelectEntry}
            />
          ) : (
            <BlockAgendaItem
              key={entry.id}
              copy={props.copy}
              entry={entry}
              locale={props.locale}
              timeZone={props.timeZone}
            />
          )
        )}

        {props.day.availability.map((period) => {
          const startLabel = formatTime(period.startAt, props.locale, props.timeZone);
          const endLabel = formatTime(period.endAt, props.locale, props.timeZone);
          return (
            <button
              className={styles.mobileAvailabilityItem}
              data-calendar-availability-start={period.startAt}
              key={`${period.startAt}:${period.endAt}`}
              type="button"
              aria-label={props.copy.bookFromLabel(startLabel)}
              onClick={() =>
                props.onOpenManualBooking({ start: period.startAt, end: period.endAt })
              }
            >
              <Clock width={16} height={16} aria-hidden="true" />
              <span>
                {props.copy.availabilityLabel} {startLabel}–{endLabel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BookingAgendaItem(props: {
  readonly copy: CalendarMobileAgendaProps["copy"];
  readonly entry: CalendarEntry;
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly onSelectEntry: (entry: CalendarEntry) => void;
}) {
  const timeLabel = formatTimeRange(props.entry, props.locale, props.timeZone);
  const accessibilityLabel = [
    timeLabel,
    props.entry.title,
    props.entry.subtitle,
    props.copy.confirmedLabel
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <button
      className={styles.mobileBookingItem}
      data-calendar-entry-id={props.entry.id}
      type="button"
      aria-label={accessibilityLabel}
      onClick={() => props.onSelectEntry(props.entry)}
    >
      <span className={styles.mobileAgendaTime}>{timeLabel}</span>
      <span className={styles.mobileAgendaAvatar} aria-hidden="true">
        {createClientInitials(props.entry.title)}
      </span>
      <span className={styles.mobileAgendaIdentity}>
        <strong>{props.entry.title}</strong>
        <span>
          <DeliveryFormatIcon format={props.entry.deliveryFormat} />
          {props.entry.subtitle}
        </span>
      </span>
      <span className={styles.mobileAgendaStatus} aria-hidden="true" />
    </button>
  );
}

function BlockAgendaItem(props: {
  readonly copy: CalendarMobileAgendaProps["copy"];
  readonly entry: CalendarEntry;
  readonly locale: SupportedLocale;
  readonly timeZone: string;
}) {
  const timeLabel = formatTimeRange(props.entry, props.locale, props.timeZone);

  return (
    <article
      className={styles.mobileBlockItem}
      data-calendar-entry-id={props.entry.id}
      aria-label={`${timeLabel}, ${props.entry.title}, ${props.copy.blockedLabel}`}
    >
      <Clock width={16} height={16} aria-hidden="true" />
      <span>
        <strong>{props.entry.title}</strong>
        <span>{timeLabel}</span>
      </span>
    </article>
  );
}

function DeliveryFormatIcon(props: { readonly format: CalendarEntry["deliveryFormat"] }) {
  const iconProps = { width: 13, height: 13, "aria-hidden": true } as const;
  if (props.format === "video") return <Video {...iconProps} />;
  if (props.format === "audio") return <Mic {...iconProps} />;
  if (props.format === "chat" || props.format === "channel") return <Chat {...iconProps} />;
  return <Doc {...iconProps} />;
}

function createAgendaDays(
  entries: readonly CalendarEntry[],
  availability: readonly AvailabilityBackground[],
  timeZone: string
): AgendaDay[] {
  const entriesByDay = new Map<string, CalendarEntry[]>();
  const availabilityByDay = new Map<string, AvailabilityBackground[]>();

  for (const entry of entries) {
    const date = getLocalDate(entry.startAt, timeZone);
    entriesByDay.set(date, [...(entriesByDay.get(date) ?? []), entry]);
  }
  for (const period of availability) {
    const date = getLocalDate(period.startAt, timeZone);
    availabilityByDay.set(date, [...(availabilityByDay.get(date) ?? []), period]);
  }

  return [...new Set([...entriesByDay.keys(), ...availabilityByDay.keys()])].sort().map((date) => {
    const dayEntries = [...(entriesByDay.get(date) ?? [])].sort(compareStart);
    const dayAvailability = [...(availabilityByDay.get(date) ?? [])].sort(compareStart);
    return {
      date,
      firstInstant: dayEntries[0]?.startAt ?? dayAvailability[0]?.startAt ?? `${date}T00:00:00Z`,
      entries: dayEntries,
      availability: dayAvailability
    };
  });
}

function compareStart(
  left: { readonly startAt: string },
  right: { readonly startAt: string }
): number {
  return Date.parse(left.startAt) - Date.parse(right.startAt);
}

function getLocalDate(instant: string, timeZone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

function formatDayLabel(instant: string, locale: SupportedLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "long"
  }).format(new Date(instant));
}

function formatTimeRange(
  entry: Pick<CalendarEntry, "startAt" | "endAt">,
  locale: SupportedLocale,
  timeZone: string
): string {
  return `${formatTime(entry.startAt, locale, timeZone)}–${formatTime(
    entry.endAt,
    locale,
    timeZone
  )}`;
}

function formatTime(instant: string, locale: SupportedLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(instant));
}
