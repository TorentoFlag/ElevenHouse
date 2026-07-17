export const calendarGridGeometry = {
  slotMinTime: "08:00:00",
  slotMaxTime: "21:00:00",
  slotDuration: "01:00:00",
  snapDuration: "01:00:00",
  slotHeaderInterval: "01:00:00",
  slotHeaderFormat: {
    hour: "numeric",
    minute: "2-digit",
    omitZeroMinute: false,
    meridiem: false
  },
  slotMinHeight: 56,
  scrollTime: "08:00:00"
} as const;

export const calendarGridClassNames = {
  dayHeader: "eh-calendar-day-header",
  dayHeaderInner: "eh-calendar-day-header-inner",
  slotHeader: "eh-calendar-slot-header",
  slotHeaderInner: "eh-calendar-slot-header-inner",
  slotLane: "eh-calendar-slot-lane",
  minorSlotLane: "eh-calendar-slot-lane--minor"
} as const;

type CalendarViewClassInfo = {
  readonly view: {
    readonly type: string;
  };
};

export function getCalendarDayHeaderClassName(
  info: CalendarViewClassInfo
): string | false {
  return isTimeGridView(info.view.type) ? calendarGridClassNames.dayHeader : false;
}

export function getCalendarDayHeaderInnerClassName(
  info: CalendarViewClassInfo
): string | false {
  return isTimeGridView(info.view.type) ? calendarGridClassNames.dayHeaderInner : false;
}

export function getCalendarSlotLaneClassName(info: { readonly isMinor: boolean }): string {
  return info.isMinor
    ? `${calendarGridClassNames.slotLane} ${calendarGridClassNames.minorSlotLane}`
    : calendarGridClassNames.slotLane;
}

function isTimeGridView(viewType: string): boolean {
  return viewType === "timeGridDay" || viewType === "timeGridWeek";
}
