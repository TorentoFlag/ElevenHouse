import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  BookingClientServiceWorkSummaryReader,
  ClientServiceWorkBookingItem
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { bookings, clientAstrologerRelationships } from "../../schema";

const upcomingBookingStates = ["confirmed"] as const;
const recentBookingStates = ["completed", "cancelled", "no_show", "expired"] as const;
type ClientServiceWorkBookingRow = {
  readonly id: string;
  readonly state: string;
  readonly productTitle: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly timeZone: string;
};

export function createDrizzleBookingClientServiceWorkSummaryReader(
  database: ElevenHouseDatabase
): BookingClientServiceWorkSummaryReader {
  return {
    listClientServiceWorkBookings: async (input) => {
      const now = new Date(input.now);
      const limit = normalizeLimit(input.limit);
      const upcomingWhere = activePairWhere(input.ownerUserId, input.clientUserId, [
        inArray(bookings.state, upcomingBookingStates),
        gte(bookings.serviceStartAt, now)
      ]);
      const recentWhere = activePairWhere(input.ownerUserId, input.clientUserId, [
        inArray(bookings.state, recentBookingStates),
        lt(bookings.serviceStartAt, now)
      ]);
      const [upcomingTotal, upcoming, recentTotal, recent] = await Promise.all([
        countBookings(database, upcomingWhere),
        database
          .select({
            id: bookings.id,
            state: bookings.state,
            productTitle: bookings.productTitleSnapshot,
            startAt: bookings.serviceStartAt,
            endAt: bookings.serviceEndAt,
            timeZone: bookings.timeZoneSnapshot
          })
          .from(bookings)
          .innerJoin(
            clientAstrologerRelationships,
            activePairJoin(input.ownerUserId, input.clientUserId)
          )
          .where(upcomingWhere)
          .orderBy(asc(bookings.serviceStartAt), asc(bookings.id))
          .limit(limit),
        countBookings(database, recentWhere),
        database
          .select({
            id: bookings.id,
            state: bookings.state,
            productTitle: bookings.productTitleSnapshot,
            startAt: bookings.serviceStartAt,
            endAt: bookings.serviceEndAt,
            timeZone: bookings.timeZoneSnapshot
          })
          .from(bookings)
          .innerJoin(
            clientAstrologerRelationships,
            activePairJoin(input.ownerUserId, input.clientUserId)
          )
          .where(recentWhere)
          .orderBy(desc(bookings.serviceStartAt), desc(bookings.id))
          .limit(limit)
      ]);

      return {
        upcomingTotal,
        upcoming: upcoming.map(toBookingItem),
        recentTotal,
        recent: recent.map(toBookingItem)
      };
    }
  };
}

function activePairJoin(ownerUserId: string, clientUserId: string) {
  return and(
    eq(clientAstrologerRelationships.astrologerUserId, ownerUserId),
    eq(clientAstrologerRelationships.clientUserId, clientUserId),
    eq(clientAstrologerRelationships.status, "active"),
    eq(clientAstrologerRelationships.astrologerUserId, bookings.ownerUserId),
    eq(clientAstrologerRelationships.clientUserId, bookings.clientUserId)
  );
}

function activePairWhere(
  ownerUserId: string,
  clientUserId: string,
  predicates: readonly SQL[]
) {
  return and(
    eq(bookings.ownerUserId, ownerUserId),
    eq(bookings.clientUserId, clientUserId),
    ...predicates
  );
}

async function countBookings(
  database: ElevenHouseDatabase,
  where: ReturnType<typeof activePairWhere>
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(
      clientAstrologerRelationships,
      and(
        eq(clientAstrologerRelationships.astrologerUserId, bookings.ownerUserId),
        eq(clientAstrologerRelationships.clientUserId, bookings.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .where(where);
  return Number(row?.count ?? 0);
}

function toBookingItem(booking: ClientServiceWorkBookingRow): ClientServiceWorkBookingItem {
  const startAt = booking.startAt.toISOString();
  return {
    id: booking.id,
    state: booking.state as ClientServiceWorkBookingItem["state"],
    productTitle: booking.productTitle,
    startAt,
    endAt: booking.endAt.toISOString(),
    timeZone: booking.timeZone,
    href: `/calendar?bookingId=${booking.id}&startAt=${encodeURIComponent(startAt)}`
  };
}

function normalizeLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) return 3;
  return Math.min(value, 3);
}
