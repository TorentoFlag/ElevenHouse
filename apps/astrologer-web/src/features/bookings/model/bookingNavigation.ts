import { z } from "@elevenhouse/validation";
import { Temporal } from "temporal-polyfill";

const bookingCalendarHandoffSchema = z
  .object({
    bookingId: z.string().uuid(),
    startAt: z.string().datetime({ offset: true })
  })
  .strict();

export type BookingCalendarHandoff = z.infer<typeof bookingCalendarHandoffSchema>;

export function buildBookingCalendarPath(input: BookingCalendarHandoff): string {
  const handoff = bookingCalendarHandoffSchema.parse(input);
  const params = new URLSearchParams({
    bookingId: handoff.bookingId,
    startAt: handoff.startAt
  });
  return `/calendar?${params.toString()}`;
}

export function parseBookingCalendarHandoff(search: string): BookingCalendarHandoff | null {
  const params = new URLSearchParams(search);
  const parsed = bookingCalendarHandoffSchema.safeParse({
    bookingId: params.get("bookingId"),
    startAt: params.get("startAt")
  });
  return parsed.success ? parsed.data : null;
}

export function bookingCalendarAnchorDate(
  handoff: BookingCalendarHandoff,
  timeZone: string
): string {
  return Temporal.Instant.from(handoff.startAt)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}
