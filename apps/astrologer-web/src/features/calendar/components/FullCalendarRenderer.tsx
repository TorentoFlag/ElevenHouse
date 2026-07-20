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
      initialDate={props.visibleRange.start}
      headerToolbar={false}
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
      eventClass={(info) =>
        info.event.extendedProps.rendererEntry ? "eh-calendar-event" : undefined
      }
      eventDidMount={(info) => mountAccessibleEvent(info, props)}
      eventWillUnmount={unmountAccessibleEvent}
      eventClick={(info) => handleEventClick(info, props)}
      datesSet={(info) => handleDatesSet(info, props)}
      select={(info) => handleSelect(info, props)}
    />
  );
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
