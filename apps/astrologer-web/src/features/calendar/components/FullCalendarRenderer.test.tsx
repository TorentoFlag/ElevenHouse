import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Children, type ReactElement } from "react";
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
    expect(calendar.props.initialDate).toBe(props.visibleRange.start);
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
      endStr: "2026-05-29T10:30:00.000Z"
    });

    expect(props.onEntryActivate).toHaveBeenCalledWith(entryId);
    expect(props.onRangeChange).toHaveBeenCalledWith({
      start: "2026-05-25T00:00:00.000Z",
      end: "2026-06-01T00:00:00.000Z"
    });
    expect(props.onEmptyRangeSelect).toHaveBeenCalledWith({
      start: "2026-05-29T10:00:00.000Z",
      end: "2026-05-29T10:30:00.000Z"
    });
  });

  it("renders app-owned accessible event content", () => {
    const calendar = FullCalendarRenderer(createProps()) as ReactElement<{
      eventContent(info: unknown): ReactElement<{
        "aria-label": string;
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
