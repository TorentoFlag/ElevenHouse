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

const viewNames = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth"
} as const;

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
      eventClick={(info) => handleEventClick(info, props)}
      datesSet={(info) => handleDatesSet(info, props)}
      select={(info) => handleSelect(info, props)}
    />
  );
}

function renderEventContent(info: EventDisplayInfo): ReactElement | null {
  const entry = info.event.extendedProps.rendererEntry as CalendarRendererEntry | undefined;
  if (!entry) return null;

  return (
    <div aria-label={entry.accessibilityLabel} data-calendar-entry-id={entry.id}>
      <span>{info.timeText}</span>
      <span>{entry.title}</span>
      {entry.subtitle ? <span>{entry.subtitle}</span> : null}
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
