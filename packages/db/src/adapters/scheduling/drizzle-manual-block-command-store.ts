import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  ManualCalendarBlockConflictError,
  type ManualCalendarBlock,
  type ManualCalendarBlockClaim,
  type ManualCalendarBlockCommandStore
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { manualCalendarBlocks, scheduleReservations } from "../../schema";
import {
  executeIdempotentSchedulingCommand,
  isActiveReservationExclusionViolation,
  type SchedulingTransaction
} from "./drizzle-idempotent-scheduling-command";

type ManualBlockDatabase = ElevenHouseDatabase | SchedulingTransaction;

export function createDrizzleManualBlockCommandStore(
  database: ElevenHouseDatabase
): ManualCalendarBlockCommandStore {
  return {
    executeCreate: async (command, createClaim) => {
      try {
        const result = await executeIdempotentSchedulingCommand({
          database,
          command,
          create: async (transaction) => {
            const claim = await createClaim();
            assertActorOwnsClaim(command.actorUserId, claim);
            const blockId = randomUUID();
            const reservationId = randomUUID();
            await transaction.insert(scheduleReservations).values({
              id: reservationId,
              ownerUserId: claim.ownerUserId,
              scheduleId: claim.scheduleId,
              kind: "manual_block",
              lifecycle: "active",
              serviceStartAt: new Date(claim.startAt),
              serviceEndAt: new Date(claim.endAt),
              occupiedStartAt: new Date(claim.startAt),
              occupiedEndAt: new Date(claim.endAt),
              sourceAggregateId: blockId,
              createdAt: new Date(command.now),
              updatedAt: new Date(command.now)
            });
            await transaction.insert(manualCalendarBlocks).values({
              id: blockId,
              ownerUserId: claim.ownerUserId,
              reservationId,
              title: claim.title,
              state: "active",
              createdAt: new Date(command.now),
              updatedAt: new Date(command.now)
            });
            const block = await findOwnedBlock(transaction, claim.ownerUserId, blockId);
            if (!block) throw new Error("Expected manual calendar block insert");
            return { aggregateId: blockId, value: block };
          },
          replay: (blockId) => findOwnedBlock(database, command.actorUserId, blockId)
        });
        return { kind: result.kind, block: result.value };
      } catch (error) {
        if (isActiveReservationExclusionViolation(error)) {
          throw new ManualCalendarBlockConflictError();
        }
        throw error;
      }
    },
    release: (input) =>
      database.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(manualCalendarBlocks)
          .set({ state: "released", updatedAt: new Date(input.now) })
          .where(
            and(
              eq(manualCalendarBlocks.id, input.blockId),
              eq(manualCalendarBlocks.ownerUserId, input.ownerUserId),
              eq(manualCalendarBlocks.state, "active")
            )
          )
          .returning({ reservationId: manualCalendarBlocks.reservationId });
        if (updated) {
          await transaction
            .update(scheduleReservations)
            .set({ lifecycle: "released", updatedAt: new Date(input.now) })
            .where(
              and(
                eq(scheduleReservations.id, updated.reservationId),
                eq(scheduleReservations.ownerUserId, input.ownerUserId),
                eq(scheduleReservations.lifecycle, "active")
              )
            );
        }
        return findOwnedBlock(transaction, input.ownerUserId, input.blockId);
      })
  };
}

async function findOwnedBlock(
  database: ManualBlockDatabase,
  ownerUserId: string,
  blockId: string
): Promise<ManualCalendarBlock | null> {
  const [row] = await database
    .select({ block: manualCalendarBlocks, reservation: scheduleReservations })
    .from(manualCalendarBlocks)
    .innerJoin(
      scheduleReservations,
      eq(scheduleReservations.id, manualCalendarBlocks.reservationId)
    )
    .where(
      and(
        eq(manualCalendarBlocks.ownerUserId, ownerUserId),
        eq(manualCalendarBlocks.id, blockId)
      )
    )
    .limit(1);
  return row
    ? {
        id: row.block.id,
        reservationId: row.block.reservationId,
        ownerUserId: row.block.ownerUserId,
        scheduleId: row.reservation.scheduleId,
        title: row.block.title,
        state: row.block.state as ManualCalendarBlock["state"],
        startAt: row.reservation.serviceStartAt.toISOString(),
        endAt: row.reservation.serviceEndAt.toISOString(),
        createdAt: row.block.createdAt.toISOString(),
        updatedAt: row.block.updatedAt.toISOString()
      }
    : null;
}

function assertActorOwnsClaim(actorUserId: string, claim: ManualCalendarBlockClaim): void {
  if (actorUserId !== claim.ownerUserId) {
    throw new Error("Manual block actor does not own the claim");
  }
}
