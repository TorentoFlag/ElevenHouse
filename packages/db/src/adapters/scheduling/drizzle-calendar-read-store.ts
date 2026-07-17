import { and, asc, eq, gt, lt } from "drizzle-orm";
import type { CalendarRangeEntry, CalendarReadStore } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  bookings,
  clientProfiles,
  manualCalendarBlocks,
  scheduleReservations
} from "../../schema";

export function createDrizzleCalendarReadStore(
  database: ElevenHouseDatabase
): CalendarReadStore {
  return {
    readRange: async (input) => {
      const [bookingRows, blockRows] = await Promise.all([
        database
          .select({ booking: bookings, clientDisplayName: clientProfiles.displayNameSnapshot })
          .from(bookings)
          .leftJoin(clientProfiles, eq(clientProfiles.userId, bookings.clientUserId))
          .where(
            and(
              eq(bookings.ownerUserId, input.ownerUserId),
              eq(bookings.state, "confirmed"),
              lt(bookings.serviceStartAt, new Date(input.endAt)),
              gt(bookings.serviceEndAt, new Date(input.startAt))
            )
          )
          .orderBy(asc(bookings.serviceStartAt), asc(bookings.id)),
        database
          .select({ block: manualCalendarBlocks, reservation: scheduleReservations })
          .from(manualCalendarBlocks)
          .innerJoin(
            scheduleReservations,
            eq(scheduleReservations.id, manualCalendarBlocks.reservationId)
          )
          .where(
            and(
              eq(manualCalendarBlocks.ownerUserId, input.ownerUserId),
              eq(manualCalendarBlocks.state, "active"),
              eq(scheduleReservations.lifecycle, "active"),
              lt(scheduleReservations.serviceStartAt, new Date(input.endAt)),
              gt(scheduleReservations.serviceEndAt, new Date(input.startAt))
            )
          )
          .orderBy(asc(scheduleReservations.serviceStartAt), asc(manualCalendarBlocks.id))
      ]);

      const entries: CalendarRangeEntry[] = [
        ...bookingRows.map(
          ({ booking, clientDisplayName }): CalendarRangeEntry => ({
            id: booking.id,
            kind: "booking",
            startAt: booking.serviceStartAt.toISOString(),
            endAt: booking.serviceEndAt.toISOString(),
            title: clientDisplayName ?? booking.clientUserId,
            subtitle: booking.productTitleSnapshot,
            deliveryFormat: booking.deliveryFormatSnapshot as CalendarRangeEntry["deliveryFormat"],
            displayStatus: "confirmed"
          })
        ),
        ...blockRows.map(
          ({ block, reservation }): CalendarRangeEntry => ({
            id: block.id,
            kind: "manual_block",
            startAt: reservation.serviceStartAt.toISOString(),
            endAt: reservation.serviceEndAt.toISOString(),
            title: block.title,
            subtitle: null,
            deliveryFormat: null,
            displayStatus: "blocked"
          })
        )
      ].sort(
        (left, right) =>
          Date.parse(left.startAt) - Date.parse(right.startAt) || left.id.localeCompare(right.id)
      );
      const bookingCount = bookingRows.length;
      const blockedCount = blockRows.length;
      return {
        entries,
        summary: {
          bookingCount,
          bookedMinutes: bookingRows.reduce(
            (total, row) => total + row.booking.durationMinutesSnapshot,
            0
          ),
          byDisplayStatus: {
            ...(bookingCount > 0 ? { confirmed: bookingCount } : {}),
            ...(blockedCount > 0 ? { blocked: blockedCount } : {})
          }
        }
      };
    }
  };
}
