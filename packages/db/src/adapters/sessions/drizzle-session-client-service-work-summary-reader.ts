import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  ClientServiceWorkSessionItem,
  SessionClientServiceWorkSummaryReader
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { clientAstrologerRelationships, sessions } from "../../schema";

const upcomingSessionStates = ["scheduled", "active"] as const;
const recentSessionStates = ["ended", "cancelled", "expired"] as const;
type ClientServiceWorkSessionRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly state: string;
  readonly productTitle: string;
  readonly scheduledStartAt: Date;
  readonly scheduledEndAt: Date;
  readonly timeZone: string;
};

export function createDrizzleSessionClientServiceWorkSummaryReader(
  database: ElevenHouseDatabase
): SessionClientServiceWorkSummaryReader {
  return {
    listClientServiceWorkSessions: async (input) => {
      const now = new Date(input.now);
      const limit = normalizeLimit(input.limit);
      const upcomingWhere = activePairWhere(input.ownerUserId, input.clientUserId, [
        inArray(sessions.state, upcomingSessionStates),
        gte(sessions.scheduledEndAt, now)
      ]);
      const recentWhere = activePairWhere(input.ownerUserId, input.clientUserId, [
        inArray(sessions.state, recentSessionStates),
        lt(sessions.scheduledStartAt, now)
      ]);
      const [upcomingTotal, upcoming, recentTotal, recent] = await Promise.all([
        countSessions(database, upcomingWhere),
        database
          .select({
            id: sessions.id,
            bookingId: sessions.bookingId,
            state: sessions.state,
            productTitle: sessions.productTitleSnapshot,
            scheduledStartAt: sessions.scheduledStartAt,
            scheduledEndAt: sessions.scheduledEndAt,
            timeZone: sessions.timeZoneSnapshot
          })
          .from(sessions)
          .innerJoin(
            clientAstrologerRelationships,
            activePairJoin(input.ownerUserId, input.clientUserId)
          )
          .where(upcomingWhere)
          .orderBy(asc(sessions.scheduledStartAt), asc(sessions.id))
          .limit(limit),
        countSessions(database, recentWhere),
        database
          .select({
            id: sessions.id,
            bookingId: sessions.bookingId,
            state: sessions.state,
            productTitle: sessions.productTitleSnapshot,
            scheduledStartAt: sessions.scheduledStartAt,
            scheduledEndAt: sessions.scheduledEndAt,
            timeZone: sessions.timeZoneSnapshot
          })
          .from(sessions)
          .innerJoin(
            clientAstrologerRelationships,
            activePairJoin(input.ownerUserId, input.clientUserId)
          )
          .where(recentWhere)
          .orderBy(desc(sessions.scheduledStartAt), desc(sessions.id))
          .limit(limit)
      ]);

      return {
        upcomingTotal,
        upcoming: upcoming.map(toSessionItem),
        recentTotal,
        recent: recent.map(toSessionItem)
      };
    }
  };
}

function activePairJoin(ownerUserId: string, clientUserId: string) {
  return and(
    eq(clientAstrologerRelationships.astrologerUserId, ownerUserId),
    eq(clientAstrologerRelationships.clientUserId, clientUserId),
    eq(clientAstrologerRelationships.status, "active"),
    eq(clientAstrologerRelationships.astrologerUserId, sessions.ownerUserId),
    eq(clientAstrologerRelationships.clientUserId, sessions.clientUserId)
  );
}

function activePairWhere(
  ownerUserId: string,
  clientUserId: string,
  predicates: readonly SQL[]
) {
  return and(
    eq(sessions.ownerUserId, ownerUserId),
    eq(sessions.clientUserId, clientUserId),
    ...predicates
  );
}

async function countSessions(
  database: ElevenHouseDatabase,
  where: ReturnType<typeof activePairWhere>
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .innerJoin(
      clientAstrologerRelationships,
      and(
        eq(clientAstrologerRelationships.astrologerUserId, sessions.ownerUserId),
        eq(clientAstrologerRelationships.clientUserId, sessions.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .where(where);
  return Number(row?.count ?? 0);
}

function toSessionItem(session: ClientServiceWorkSessionRow): ClientServiceWorkSessionItem {
  return {
    id: session.id,
    bookingId: session.bookingId,
    state: session.state as ClientServiceWorkSessionItem["state"],
    productTitle: session.productTitle,
    scheduledStartAt: session.scheduledStartAt.toISOString(),
    scheduledEndAt: session.scheduledEndAt.toISOString(),
    timeZone: session.timeZone,
    href: `/sessions/${session.id}`
  };
}

function normalizeLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) return 3;
  return Math.min(value, 3);
}
