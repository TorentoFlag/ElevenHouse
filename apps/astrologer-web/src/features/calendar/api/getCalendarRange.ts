import {
  calendarRangeQuerySchema,
  calendarRangeResponseSchema,
  type CalendarRangeQuery,
  type CalendarRangeResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getCalendarRange(query: CalendarRangeQuery): Promise<CalendarRangeResponse> {
  const parsed = calendarRangeQuerySchema.parse(query);
  const search = new URLSearchParams({
    start: parsed.start,
    end: parsed.end,
    timeZone: parsed.timeZone
  });

  return calendarRangeResponseSchema.parse(
    await application.http.get(`/calendar/range?${search.toString()}`)
  );
}
