import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarRendererProps } from "../model/calendarRenderer";
import { FullCalendarRenderer } from "./FullCalendarRenderer";

const entryId = "11111111-1111-4111-8111-111111111111";

function createProps(): CalendarRendererProps {
  return {
    view: "week",
    locale: "ru",
    timeZone: "Europe/Moscow",
    visibleRange: {
      start: "2026-05-25T00:00:00.000Z",
      end: "2026-06-01T00:00:00.000Z"
    },
    entries: [
      {
        id: entryId,
        kind: "booking",
        startAt: "2026-05-29T08:00:00.000Z",
        endAt: "2026-05-29T09:00:00.000Z",
        title: "Марина К.",
        subtitle: "Натальный разбор",
        deliveryFormat: "video",
        displayStatus: "confirmed"
      }
    ],
    availability: [
      {
        startAt: "2026-05-29T07:00:00.000Z",
        endAt: "2026-05-29T16:00:00.000Z"
      }
    ],
    onRangeChange: vi.fn(),
    onEntryActivate: vi.fn(),
    onEmptyRangeSelect: vi.fn()
  };
}

describe("FullCalendarRenderer", () => {
  it("maps app-owned props into a toolbar-free, non-editable engine element", () => {
    const props = createProps();
    const calendar = FullCalendarRenderer(props) as ReactElement<Record<string, unknown>>;

    expect(calendar.props.initialView).toBe("timeGridWeek");
    expect(calendar.props.initialDate).toBe("2026-05-25");
    expect(calendar.props.headerToolbar).toBe(false);
    expect(calendar.props.editable).toBe(false);
    expect(calendar.props.selectable).toBe(true);
    expect(calendar.props.timeZone).toBe("Europe/Moscow");
    expect(calendar.props.locale).toBe("ru");
    expect(calendar.props.plugins).toHaveLength(4);
    expect(calendar.props.events).toEqual([
      expect.objectContaining({ id: entryId, display: "auto" }),
      expect.objectContaining({ display: "background" })
    ]);
  });

  it("uses the design-reference time range and 56px hourly geometry", () => {
    const calendar = FullCalendarRenderer(createProps()) as ReactElement<{
      dayHeaderClass(info: { view: { type: string }; isToday?: boolean }): string | false;
      dayHeaderInnerClass(info: { view: { type: string } }): string | false;
      slotLaneClass(info: { isMinor: boolean }): string;
      [key: string]: unknown;
    }>;

    expect(calendar.props.slotMinTime).toBe("08:00:00");
    expect(calendar.props.slotMaxTime).toBe("21:00:00");
    expect(calendar.props.slotDuration).toBe("01:00:00");
    expect(calendar.props.snapDuration).toBe("01:00:00");
    expect(calendar.props.slotHeaderInterval).toBe("01:00:00");
    expect(calendar.props.slotHeaderFormat).toEqual({
      hour: "numeric",
      minute: "2-digit",
      omitZeroMinute: false,
      meridiem: false
    });
    expect(calendar.props.slotMinHeight).toBe(56);
    expect(calendar.props.scrollTime).toBe("08:00:00");
    expect(calendar.props.scrollTimeReset).toBe(false);
    expect(calendar.props.expandRows).toBe(false);
    expect(calendar.props.firstDay).toBe(1);
    expect(calendar.props.dayHeaderClass({ view: { type: "timeGridWeek" } })).toBe(
      "eh-calendar-day-header"
    );
    expect(calendar.props.dayHeaderClass({ view: { type: "timeGridWeek" }, isToday: true })).toBe(
      "eh-calendar-day-header eh-calendar-day-header--today"
    );
    expect(
      calendar.props.dayHeaderInnerClass({ view: { type: "timeGridDay" } })
    ).toBe("eh-calendar-day-header-inner");
    expect(calendar.props.dayHeaderClass({ view: { type: "dayGridMonth" } })).toBe(false);
    expect(
      calendar.props.dayHeaderInnerClass({ view: { type: "dayGridMonth" } })
    ).toBe(false);
    expect(calendar.props.slotHeaderClass).toBe("eh-calendar-slot-header");
    expect(calendar.props.slotHeaderInnerClass).toBe("eh-calendar-slot-header-inner");
    expect(calendar.props.slotLaneClass({ isMinor: false })).toBe(
      "eh-calendar-slot-lane"
    );
    expect(calendar.props.slotLaneClass({ isMinor: true })).toBe(
      "eh-calendar-slot-lane eh-calendar-slot-lane--minor"
    );
  });

  it("starts the weekly grid from the local range date instead of the previous UTC day", () => {
    const calendar = FullCalendarRenderer({
      ...createProps(),
      visibleRange: {
        start: "2026-07-19T21:00:00.000Z",
        end: "2026-07-26T21:00:00.000Z"
      }
    }) as ReactElement<Record<string, unknown>>;

    expect(calendar.props.initialDate).toBe("2026-07-20");
  });

  it("renders reference-like time-grid day headers with separated weekday and date", () => {
    const calendar = FullCalendarRenderer(createProps()) as ReactElement<{
      dayHeaderContent(info: unknown): ReactElement<{
        className?: string;
        children: ReactElement[];
      }> | true;
    }>;

    const content = calendar.props.dayHeaderContent({
      date: new Date("2026-05-25T00:00:00.000Z"),
      view: { type: "timeGridWeek" }
    });

    if (content === true) throw new Error("Expected a custom day header element");
    expect(content.props.className).toBe("eh-calendar-day-header-content");
    expect(
      Children.toArray(content.props.children).map((child) =>
        isValidElement<{ children?: string; className?: string }>(child)
          ? { className: child.props.className, text: child.props.children }
          : null
      )
    ).toEqual([
      { className: "eh-calendar-day-header-weekday", text: "ПН" },
      { className: "eh-calendar-day-header-date", text: "25" }
    ]);
  });

  it("reinitializes the calendar engine when navigation changes the visible range", () => {
    const firstProps = createProps();
    const nextProps = {
      ...firstProps,
      visibleRange: {
        start: "2026-06-01T00:00:00.000Z",
        end: "2026-06-08T00:00:00.000Z"
      }
    };

    const firstCalendar = FullCalendarRenderer(firstProps) as ReactElement;
    const nextCalendar = FullCalendarRenderer(nextProps) as ReactElement;

    expect(firstCalendar.key).toBe("week:2026-05-25T00:00:00.000Z");
    expect(nextCalendar.key).toBe("week:2026-06-01T00:00:00.000Z");
  });

  it("routes engine callbacks back through stable app identifiers and ISO ranges", () => {
    const props = createProps();
    const calendar = FullCalendarRenderer(props) as ReactElement<{
      eventClick(info: unknown): void;
      datesSet(info: unknown): void;
      select(info: unknown): void;
    }>;

    calendar.props.eventClick({ event: { extendedProps: { calendarEntryId: entryId } } });
    calendar.props.datesSet({
      startStr: "2026-05-25T00:00:00.000Z",
      endStr: "2026-06-01T00:00:00.000Z"
    });
    calendar.props.select({
      startStr: "2026-05-29T10:00:00.000Z",
      endStr: "2026-05-29T11:00:00.000Z"
    });

    expect(props.onEntryActivate).toHaveBeenCalledWith(entryId);
    expect(props.onRangeChange).toHaveBeenCalledWith({
      start: "2026-05-25T00:00:00.000Z",
      end: "2026-06-01T00:00:00.000Z"
    });
    expect(props.onEmptyRangeSelect).toHaveBeenCalledWith({
      start: "2026-05-29T10:00:00.000Z",
      end: "2026-05-29T11:00:00.000Z"
    });
  });

  it("renders app-owned accessible event content", () => {
    const calendar = FullCalendarRenderer(createProps()) as ReactElement<{
      eventContent(info: unknown): ReactElement<{
        "aria-label": string;
        className?: string;
        children: ReactElement[];
      }>;
    }>;
    const content = calendar.props.eventContent({
      event: {
        extendedProps: {
          rendererEntry: {
            id: entryId,
            start: "2026-05-29T08:00:00.000Z",
            end: "2026-05-29T09:00:00.000Z",
            kind: "booking",
            title: "Марина К.",
            subtitle: "Натальный разбор",
            deliveryFormat: "video",
            displayStatus: "confirmed",
            accessibilityLabel: "11:00, Марина К., Натальный разбор, Подтверждена"
          }
        }
      },
      timeText: "11:00"
    });

    expect(content.props["aria-label"]).toBe(
      "11:00, Марина К., Натальный разбор, Подтверждена"
    );
    expect(Children.toArray(content.props.children)).toHaveLength(3);
    expect(content.props.className).toBe("eh-calendar-event-content");
    expect(
      Children.toArray(content.props.children).map((child) =>
        isValidElement<{ className?: string }>(child) ? child.props.className : undefined
      )
    ).toEqual([
      "eh-calendar-event-time",
      "eh-calendar-event-title",
      "eh-calendar-event-subtitle"
    ]);
  });

  it("adds app-owned status classes to foreground events without styling availability backgrounds", () => {
    const calendar = FullCalendarRenderer(createProps()) as ReactElement<{
      eventClass(info: unknown): string | undefined;
    }>;

    expect(
      calendar.props.eventClass({
        event: { extendedProps: { rendererEntry: { displayStatus: "confirmed" } } }
      })
    ).toBe("eh-calendar-event eh-calendar-event--confirmed");
    expect(
      calendar.props.eventClass({
        event: { extendedProps: { rendererEntry: { displayStatus: "blocked" } } }
      })
    ).toBe("eh-calendar-event eh-calendar-event--blocked");
    expect(
      calendar.props.eventClass({ event: { extendedProps: { calendarAvailability: true } } })
    ).toBeUndefined();
  });

  it("makes rendered booking events keyboard-activatable through public mount hooks", () => {
    const props = createProps();
    const calendar = FullCalendarRenderer(props) as ReactElement<{
      eventDidMount(info: unknown): void;
      eventWillUnmount(info: unknown): void;
    }>;
    const setAttribute = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const element = { setAttribute, addEventListener, removeEventListener };
    const event = {
      extendedProps: {
        calendarEntryId: entryId,
        rendererEntry: {
          accessibilityLabel: "11:00, Марина К., Натальный разбор, Подтверждена"
        }
      }
    };

    calendar.props.eventDidMount({ el: element, event });

    expect(setAttribute).toHaveBeenCalledWith("role", "button");
    expect(setAttribute).toHaveBeenCalledWith("tabindex", "0");
    expect(setAttribute).toHaveBeenCalledWith(
      "aria-label",
      "11:00, Марина К., Натальный разбор, Подтверждена"
    );
    const keydown = addEventListener.mock.calls.find(([name]) => name === "keydown")?.[1] as
      | ((event: { key: string; preventDefault(): void }) => void)
      | undefined;
    const preventDefault = vi.fn();
    keydown?.({ key: "Enter", preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(props.onEntryActivate).toHaveBeenCalledWith(entryId);

    calendar.props.eventWillUnmount({ el: element, event });
    expect(removeEventListener).toHaveBeenCalledWith("keydown", keydown);
  });

  it("keeps FullCalendar imports inside the adapter component", () => {
    const featureRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const sourceFiles = collectSourceFiles(featureRoot).filter(
      (path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")
    );
    const leakingFiles = sourceFiles.filter((path) => {
      if (path.endsWith("/components/FullCalendarRenderer.tsx")) return false;
      return readFileSync(path, "utf8").includes("@fullcalendar/");
    });

    expect(leakingFiles).toEqual([]);
  });

  it("loads the FullCalendar layout skeleton required by the v7 renderer", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "FullCalendarRenderer.tsx"),
      "utf8"
    );

    expect(source).toContain('import "@fullcalendar/react/skeleton.css"');
  });

  it("uses the v7 classic theme for complete grid geometry and borders", () => {
    const calendar = FullCalendarRenderer(createProps()) as ReactElement<{
      plugins: readonly unknown[];
    }>;
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "FullCalendarRenderer.tsx"),
      "utf8"
    );

    expect(calendar.props.plugins).toHaveLength(4);
    expect(source).toContain('import "@fullcalendar/react/themes/classic/theme.css"');
  });
});

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}
