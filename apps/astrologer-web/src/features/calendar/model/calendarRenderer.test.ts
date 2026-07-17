import { describe, expect, it } from "vitest";
import {
  createCalendarRendererModel,
  type CalendarRendererProps
} from "./calendarRenderer";

const props = {
  view: "week",
  locale: "ru",
  timeZone: "Europe/Moscow",
  visibleRange: {
    start: "2026-05-25T00:00:00.000Z",
    end: "2026-06-01T00:00:00.000Z"
  },
  entries: [
    {
      id: "11111111-1111-4111-8111-111111111111",
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
  onRangeChange: () => undefined,
  onEntryActivate: () => undefined,
  onEmptyRangeSelect: () => undefined
} satisfies CalendarRendererProps;

describe("calendar renderer model", () => {
  it("maps validated entries without exposing an engine type", () => {
    expect(createCalendarRendererModel(props)).toEqual({
      entries: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          start: "2026-05-29T08:00:00.000Z",
          end: "2026-05-29T09:00:00.000Z",
          kind: "booking",
          title: "Марина К.",
          subtitle: "Натальный разбор",
          deliveryFormat: "video",
          displayStatus: "confirmed",
          accessibilityLabel: "11:00, Марина К., Натальный разбор, Подтверждена"
        }
      ],
      availability: [
        {
          start: "2026-05-29T07:00:00.000Z",
          end: "2026-05-29T16:00:00.000Z"
        }
      ]
    });
  });

  it("localizes accessible labels independently of FullCalendar", () => {
    const model = createCalendarRendererModel({ ...props, locale: "en" });

    expect(model.entries[0]?.accessibilityLabel).toBe(
      "11:00 AM, Марина К., Натальный разбор, Confirmed"
    );
  });
});
