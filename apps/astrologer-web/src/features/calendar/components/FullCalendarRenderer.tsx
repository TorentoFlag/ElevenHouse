import FullCalendar, {
  type DateSelectInfo,
  type DatesSetInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventInput
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import "@fullcalendar/react/skeleton.css";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/themes/classic/theme.css";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { ReactElement } from "react";
import {
  createCalendarRendererModel,
  type CalendarRendererEntry,
  type CalendarRendererProps
} from "../model/calendarRenderer";
import {
  calendarGridClassNames,
  calendarGridGeometry,
  getCalendarDayHeaderClassName,
  getCalendarDayHeaderInnerClassName,
  getCalendarSlotLaneClassName
} from "../model/calendarGridGeometry";

const viewNames = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth"
} as const;

const eventKeyboardHandlers = new WeakMap<HTMLElement, (event: KeyboardEvent) => void>();

export function FullCalendarRenderer(props: CalendarRendererProps): ReactElement {
  const model = createCalendarRendererModel(props);
  const events: EventInput[] = [
    ...model.entries.map((entry) => ({
      id: entry.id,
      start: entry.start,
      end: entry.end,
      title: entry.title,
      display: "auto",
      editable: false,
      extendedProps: {
        calendarEntryId: entry.id,
        rendererEntry: entry
      }
    })),
    ...model.availability.map((period) => ({
      start: period.start,
      end: period.end,
      display: "background",
      editable: false,
      extendedProps: { calendarAvailability: true }
    }))
  ];

  return (
    <FullCalendar
      key={`${props.view}:${props.visibleRange.start}`}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, classicThemePlugin]}
      initialView={viewNames[props.view]}
      initialDate={formatLocalDate(props.visibleRange.start, props.timeZone)}
      headerToolbar={false}
      firstDay={1}
      allDaySlot={false}
      slotMinTime={calendarGridGeometry.slotMinTime}
      slotMaxTime={calendarGridGeometry.slotMaxTime}
      slotDuration={calendarGridGeometry.slotDuration}
      snapDuration={calendarGridGeometry.snapDuration}
      slotHeaderInterval={calendarGridGeometry.slotHeaderInterval}
      slotHeaderFormat={calendarGridGeometry.slotHeaderFormat}
      slotMinHeight={calendarGridGeometry.slotMinHeight}
      scrollTime={calendarGridGeometry.scrollTime}
      scrollTimeReset={false}
      expandRows={false}
      dayHeaderClass={getCalendarDayHeaderClassName}
      dayHeaderInnerClass={getCalendarDayHeaderInnerClassName}
      dayHeaderContent={(info) => renderDayHeaderContent(info, props)}
      slotHeaderClass={calendarGridClassNames.slotHeader}
      slotHeaderInnerClass={calendarGridClassNames.slotHeaderInner}
      slotLaneClass={getCalendarSlotLaneClassName}
      editable={false}
      eventStartEditable={false}
      eventDurationEditable={false}
      selectable
      selectMirror
      nowIndicator
      locale={props.locale}
      timeZone={props.timeZone}
      events={events}
      eventContent={renderEventContent}
      eventClass={getCalendarEventClassName}
      eventDidMount={(info) => mountAccessibleEvent(info, props)}
      eventWillUnmount={unmountAccessibleEvent}
      eventClick={(info) => handleEventClick(info, props)}
      datesSet={(info) => handleDatesSet(info, props)}
      select={(info) => handleSelect(info, props)}
    />
  );
}

type CalendarDayHeaderContentInfo = {
  readonly date: Date;
  readonly text?: string;
  readonly view: {
    readonly type: string;
  };
};

function renderDayHeaderContent(
  info: CalendarDayHeaderContentInfo,
  props: CalendarRendererProps
): ReactElement | true {
  if (info.view.type !== "timeGridDay" && info.view.type !== "timeGridWeek") return true;
  const parts = getLocalDateParts(info.date.toISOString(), props.timeZone, props.locale);

  return (
    <span className="eh-calendar-day-header-content">
      <span className="eh-calendar-day-header-weekday">{parts.weekday}</span>
      <span className="eh-calendar-day-header-date">{parts.day}</span>
    </span>
  );
}

function formatLocalDate(instant: string, timeZone: string): string {
  const parts = getLocalDateParts(instant, timeZone, "en");
  return `${parts.year}-${parts.month}-${parts.dayPadded}`;
}

function getLocalDateParts(
  instant: string,
  timeZone: string,
  locale: CalendarRendererProps["locale"]
): {
  readonly day: string;
  readonly dayPadded: string;
  readonly month: string;
  readonly weekday: string;
  readonly year: string;
} {
  const formatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value])
  );
  const dayPadded = parts.day ?? "01";

  return {
    day: String(Number.parseInt(dayPadded, 10)),
    dayPadded,
    month: parts.month ?? "01",
    weekday: (parts.weekday ?? "").replace(".", "").toUpperCase(),
    year: parts.year ?? "1970"
  };
}

function mountAccessibleEvent(
  info: EventDisplayInfo & { readonly el: HTMLElement },
  props: CalendarRendererProps
): void {
  const entryId = info.event.extendedProps.calendarEntryId;
  const entry = info.event.extendedProps.rendererEntry as CalendarRendererEntry | undefined;
  if (typeof entryId !== "string" || !entry) return;

  info.el.setAttribute("role", "button");
  info.el.setAttribute("tabindex", "0");
  info.el.setAttribute("aria-label", entry.accessibilityLabel);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onEntryActivate(entryId);
  };
  eventKeyboardHandlers.set(info.el, onKeyDown);
  info.el.addEventListener("keydown", onKeyDown);
}

function unmountAccessibleEvent(info: EventDisplayInfo & { readonly el: HTMLElement }): void {
  const onKeyDown = eventKeyboardHandlers.get(info.el);
  if (!onKeyDown) return;
  info.el.removeEventListener("keydown", onKeyDown);
  eventKeyboardHandlers.delete(info.el);
}

function renderEventContent(info: EventDisplayInfo): ReactElement | null {
  const entry = info.event.extendedProps.rendererEntry as CalendarRendererEntry | undefined;
  if (!entry) return null;

  return (
    <div
      className="eh-calendar-event-content"
      aria-label={entry.accessibilityLabel}
      data-calendar-entry-id={entry.id}
    >
      <span className="eh-calendar-event-time">{info.timeText}</span>
      <span className="eh-calendar-event-title">{entry.title}</span>
      {entry.subtitle ? (
        <span className="eh-calendar-event-subtitle">{entry.subtitle}</span>
      ) : null}
    </div>
  );
}

function getCalendarEventClassName(info: EventDisplayInfo): string | undefined {
  const entry = info.event.extendedProps.rendererEntry as CalendarRendererEntry | undefined;
  if (!entry) return undefined;

  return `eh-calendar-event eh-calendar-event--${entry.displayStatus}`;
}

function handleEventClick(info: EventClickInfo, props: CalendarRendererProps): void {
  const entryId = info.event.extendedProps.calendarEntryId;
  if (typeof entryId === "string") props.onEntryActivate(entryId);
}

function handleDatesSet(info: DatesSetInfo, props: CalendarRendererProps): void {
  props.onRangeChange({ start: info.startStr, end: info.endStr });
}

function handleSelect(info: DateSelectInfo, props: CalendarRendererProps): void {
  props.onEmptyRangeSelect({ start: info.startStr, end: info.endStr });
}
