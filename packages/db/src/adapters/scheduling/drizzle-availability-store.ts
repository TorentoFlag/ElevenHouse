import { and, asc, count, eq, gt, lt, ne, or, sql } from "drizzle-orm";
import type {
  AvailabilityDateOverride,
  AvailabilitySchedule,
  AvailabilityStore,
  AvailabilityStorePutDefaultInput,
  AvailabilityStoreReplaceInput,
  AvailabilityStoreReplaceResult
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  availabilityDateOverrides,
  availabilityOverridePeriods,
  availabilityProductAssignments,
  availabilitySchedules,
  availabilityWeeklyPeriods,
  bookings,
  scheduleReservations
} from "../../schema";
import { hasPostgresConstraintViolation } from "./drizzle-idempotent-scheduling-command";

type AvailabilityTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];
type AvailabilityDatabase = ElevenHouseDatabase | AvailabilityTransaction;
type ScheduleRow = typeof availabilitySchedules.$inferSelect;

export function createDrizzleAvailabilityStore(
  database: ElevenHouseDatabase
): AvailabilityStore {
  return {
    findDefaultByOwner: async ({ ownerUserId }) => {
      const [row] = await database
        .select()
        .from(availabilitySchedules)
        .where(
          and(
            eq(availabilitySchedules.ownerUserId, ownerUserId),
            eq(availabilitySchedules.isDefault, true)
          )
        )
        .limit(1);
      return row ? hydrateSchedule(database, row) : null;
    },
    putDefault: async (input) => {
      if (input.expectedVersion === null) {
        try {
          return await database.transaction(async (transaction) => {
            const [row] = await transaction
              .insert(availabilitySchedules)
              .values(toScheduleCreate(input))
              .returning();
            if (!row) throw new Error("Expected default availability schedule insert");
            await replaceChildren(transaction, row, input);
            return {
              kind: "created" as const,
              schedule: await hydrateSchedule(transaction, row)
            };
          });
        } catch (error) {
          if (!isDefaultScheduleUniqueViolation(error)) throw error;
          const existing = await findDefaultVersion(database, input.ownerUserId);
          if (!existing) throw error;
          return { kind: "version_conflict", currentVersion: existing.version };
        }
      }

      return database.transaction(async (transaction) => {
        const [row] = await transaction
          .update(availabilitySchedules)
          .set(toScheduleUpdate(input))
          .where(
            and(
              eq(availabilitySchedules.ownerUserId, input.ownerUserId),
              eq(availabilitySchedules.isDefault, true),
              eq(availabilitySchedules.version, input.expectedVersion!)
            )
          )
          .returning();
        if (!row) {
          const existing = await findDefaultVersion(transaction, input.ownerUserId);
          return existing
            ? { kind: "version_conflict" as const, currentVersion: existing.version }
            : { kind: "not_found" as const };
        }
        await replaceChildren(transaction, row, input);
        return {
          kind: "updated" as const,
          schedule: await hydrateSchedule(transaction, row)
        };
      });
    },
    replace: (input) =>
      database.transaction(async (transaction) => {
        const [row] = await transaction
          .update(availabilitySchedules)
          .set(toScheduleUpdate(input))
          .where(
            and(
              eq(availabilitySchedules.id, input.scheduleId),
              eq(availabilitySchedules.ownerUserId, input.ownerUserId),
              eq(availabilitySchedules.version, input.expectedVersion)
            )
          )
          .returning();
        if (!row) return classifyReplaceMiss(transaction, input);
        await replaceChildren(transaction, row, input);
        return {
          kind: "updated" as const,
          schedule: await hydrateSchedule(transaction, row)
        };
      }),
    readProjectionContext: async (input) => {
      const [row] = await database
        .select()
        .from(availabilitySchedules)
        .where(
          and(
            eq(availabilitySchedules.id, input.scheduleId),
            eq(availabilitySchedules.ownerUserId, input.ownerUserId)
          )
        )
        .limit(1);
      if (!row) return null;

      const schedule = await hydrateSchedule(database, row);
      const activeReservations = await database
        .select({
          occupiedStartAt: scheduleReservations.occupiedStartAt,
          occupiedEndAt: scheduleReservations.occupiedEndAt
        })
        .from(scheduleReservations)
        .where(
          and(
            eq(scheduleReservations.ownerUserId, input.ownerUserId),
            eq(scheduleReservations.scheduleId, input.scheduleId),
            eq(scheduleReservations.lifecycle, "active"),
            or(
              ne(scheduleReservations.kind, "hold"),
              gt(scheduleReservations.holdExpiresAt, sql`now()`)
            ),
            lt(scheduleReservations.occupiedStartAt, new Date(input.rangeEndAt)),
            gt(scheduleReservations.occupiedEndAt, new Date(input.rangeStartAt))
          )
        )
        .orderBy(asc(scheduleReservations.occupiedStartAt));
      const localDateExpression = sql<string>`to_char(${bookings.serviceStartAt} at time zone ${row.timeZone}, 'YYYY-MM-DD')`;
      const dailyCounts = await database
        .select({ localDate: localDateExpression, value: count() })
        .from(bookings)
        .innerJoin(scheduleReservations, eq(bookings.reservationId, scheduleReservations.id))
        .where(
          and(
            eq(bookings.ownerUserId, input.ownerUserId),
            eq(bookings.state, "confirmed"),
            eq(scheduleReservations.scheduleId, input.scheduleId),
            lt(bookings.serviceStartAt, new Date(input.rangeEndAt)),
            gt(bookings.serviceEndAt, new Date(input.rangeStartAt))
          )
        )
        .groupBy(sql`1`);

      return {
        schedule,
        activeReservations: activeReservations.map((reservation) => ({
          occupiedStartAt: reservation.occupiedStartAt.toISOString(),
          occupiedEndAt: reservation.occupiedEndAt.toISOString()
        })),
        confirmedBookingCountByLocalDate: Object.fromEntries(
          dailyCounts.map((dailyCount) => [dailyCount.localDate, Number(dailyCount.value)])
        )
      };
    }
  };
}

async function classifyReplaceMiss(
  database: AvailabilityDatabase,
  input: AvailabilityStoreReplaceInput
): Promise<AvailabilityStoreReplaceResult> {
  const [existing] = await database
    .select({ version: availabilitySchedules.version })
    .from(availabilitySchedules)
    .where(
      and(
        eq(availabilitySchedules.id, input.scheduleId),
        eq(availabilitySchedules.ownerUserId, input.ownerUserId)
      )
    )
    .limit(1);
  return existing
    ? { kind: "version_conflict", currentVersion: existing.version }
    : { kind: "not_found" };
}

async function findDefaultVersion(
  database: AvailabilityDatabase,
  ownerUserId: string
): Promise<{ readonly version: number } | null> {
  const [row] = await database
    .select({ version: availabilitySchedules.version })
    .from(availabilitySchedules)
    .where(
      and(
        eq(availabilitySchedules.ownerUserId, ownerUserId),
        eq(availabilitySchedules.isDefault, true)
      )
    )
    .limit(1);
  return row ?? null;
}

function toScheduleCreate(input: AvailabilityStorePutDefaultInput) {
  return {
    ownerUserId: input.ownerUserId,
    timeZone: input.timeZone,
    startIntervalMinutes: input.startIntervalMinutes,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
    minimumNoticeMinutes: input.minimumNoticeMinutes,
    bookingHorizonDays: input.bookingHorizonDays,
    maximumBookingsPerDay: input.maximumBookingsPerDay,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

function toScheduleUpdate(
  input: AvailabilityStorePutDefaultInput | AvailabilityStoreReplaceInput
) {
  return {
    timeZone: input.timeZone,
    startIntervalMinutes: input.startIntervalMinutes,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
    minimumNoticeMinutes: input.minimumNoticeMinutes,
    bookingHorizonDays: input.bookingHorizonDays,
    maximumBookingsPerDay: input.maximumBookingsPerDay,
    version: sql`${availabilitySchedules.version} + 1`,
    updatedAt: new Date(input.now)
  };
}

async function replaceChildren(
  database: AvailabilityDatabase,
  schedule: ScheduleRow,
  input: AvailabilityStorePutDefaultInput | AvailabilityStoreReplaceInput
): Promise<void> {
  await database
    .delete(availabilityProductAssignments)
    .where(eq(availabilityProductAssignments.scheduleId, schedule.id));
  await database
    .delete(availabilityWeeklyPeriods)
    .where(eq(availabilityWeeklyPeriods.scheduleId, schedule.id));
  await database
    .delete(availabilityDateOverrides)
    .where(eq(availabilityDateOverrides.scheduleId, schedule.id));

  if (input.weeklyPeriods.length > 0) {
    await database.insert(availabilityWeeklyPeriods).values(
      input.weeklyPeriods.map((period) => ({
        scheduleId: schedule.id,
        ownerUserId: schedule.ownerUserId,
        weekday: period.weekday,
        startMinute: period.startMinute,
        endMinute: period.endMinute
      }))
    );
  }
  for (const override of input.dateOverrides) {
    const [overrideRow] = await database
      .insert(availabilityDateOverrides)
      .values({
        scheduleId: schedule.id,
        ownerUserId: schedule.ownerUserId,
        localDate: override.date,
        mode: override.mode
      })
      .returning({ id: availabilityDateOverrides.id });
    if (!overrideRow) throw new Error("Expected availability override insert");
    if (override.periods.length > 0) {
      await database.insert(availabilityOverridePeriods).values(
        override.periods.map((period) => ({
          overrideId: overrideRow.id,
          scheduleId: schedule.id,
          ownerUserId: schedule.ownerUserId,
          startMinute: period.startMinute,
          endMinute: period.endMinute
        }))
      );
    }
  }
  if (input.productIds.length > 0) {
    await database.insert(availabilityProductAssignments).values(
      input.productIds.map((productId) => ({
        scheduleId: schedule.id,
        ownerUserId: schedule.ownerUserId,
        productId
      }))
    );
  }
}

async function hydrateSchedule(
  database: AvailabilityDatabase,
  row: ScheduleRow
): Promise<AvailabilitySchedule> {
  const weeklyPeriods = await database
    .select()
    .from(availabilityWeeklyPeriods)
    .where(eq(availabilityWeeklyPeriods.scheduleId, row.id))
    .orderBy(
      asc(availabilityWeeklyPeriods.weekday),
      asc(availabilityWeeklyPeriods.startMinute)
    );
  const overrideRows = await database
    .select()
    .from(availabilityDateOverrides)
    .where(eq(availabilityDateOverrides.scheduleId, row.id))
    .orderBy(asc(availabilityDateOverrides.localDate));
  const overridePeriodRows = await database
    .select()
    .from(availabilityOverridePeriods)
    .where(eq(availabilityOverridePeriods.scheduleId, row.id))
    .orderBy(
      asc(availabilityOverridePeriods.overrideId),
      asc(availabilityOverridePeriods.startMinute)
    );
  const productRows = await database
    .select({ productId: availabilityProductAssignments.productId })
    .from(availabilityProductAssignments)
    .where(eq(availabilityProductAssignments.scheduleId, row.id))
    .orderBy(asc(availabilityProductAssignments.productId));

  const periodsByOverrideId = new Map<string, Array<{ startMinute: number; endMinute: number }>>();
  for (const period of overridePeriodRows) {
    const periods = periodsByOverrideId.get(period.overrideId) ?? [];
    periods.push({ startMinute: period.startMinute, endMinute: period.endMinute });
    periodsByOverrideId.set(period.overrideId, periods);
  }

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    timeZone: row.timeZone,
    isDefault: row.isDefault,
    version: row.version,
    startIntervalMinutes: row.startIntervalMinutes,
    bufferBeforeMinutes: row.bufferBeforeMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
    bookingHorizonDays: row.bookingHorizonDays,
    maximumBookingsPerDay: row.maximumBookingsPerDay,
    weeklyPeriods: weeklyPeriods.map((period) => ({
      weekday: period.weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      startMinute: period.startMinute,
      endMinute: period.endMinute
    })),
    dateOverrides: overrideRows.map(
      (override): AvailabilityDateOverride => ({
        date: override.localDate,
        mode: override.mode as AvailabilityDateOverride["mode"],
        periods: periodsByOverrideId.get(override.id) ?? []
      })
    ),
    productIds: productRows.map((assignment) => assignment.productId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function isDefaultScheduleUniqueViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(
    error,
    "23505",
    "availability_schedules_default_owner_unique"
  );
}
