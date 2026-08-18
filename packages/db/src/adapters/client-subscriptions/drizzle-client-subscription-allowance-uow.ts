import { and, asc, eq, lte, sql } from "drizzle-orm";
import type {
  ClientSubscriptionAllowanceCommand,
  ClientSubscriptionAllowanceCommandExecution,
  ClientSubscriptionAllowanceCommandUnitOfWork,
  ClientSubscriptionAllowancePersistenceReceipt,
  ClientSubscriptionAllowancePersistedResult,
  ClientSubscriptionPeriodAllowance
} from "@elevenhouse/domain";
import { stableJson, validateClientSubscriptionAllowanceDecision } from "@elevenhouse/domain";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientSubscriptionAllowanceCommandEffects,
  clientSubscriptionAllowanceCommandReceipts,
  clientSubscriptionAllowanceConsumptions,
  clientSubscriptionAllowanceReservations,
  clientSubscriptionPeriodAllowances
} from "../../schema/client-subscriptions";
import type { ClientSubscriptionTransaction } from "./drizzle-client-subscription-transition-persistence";

const sha256DigestSchema = z.custom<`sha256:${string}`>(
  (value): value is `sha256:${string}` =>
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
);
const rejectedOutcomeSchema = z.enum([
  "allowance_exhausted",
  "period_ended",
  "paid_access_not_ended",
  "reservation_already_exists",
  "reservation_not_found",
  "reservation_not_active"
]);
const commandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("reserve"),
      reservationId: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true })
    })
    .strict(),
  z
    .object({
      operation: z.literal("consume_available"),
      consumptionId: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true })
    })
    .strict(),
  z
    .object({
      operation: z.enum(["consume_reserved", "release_reserved", "forfeit_reserved"]),
      reservationId: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true })
    })
    .strict(),
  z
    .object({
      operation: z.literal("expire_available"),
      occurredAt: z.string().datetime({ offset: true })
    })
    .strict()
]);

export function createDrizzleClientSubscriptionAllowanceCommandUnitOfWork(
  database: ElevenHouseDatabase
): ClientSubscriptionAllowanceCommandUnitOfWork {
  return {
    execute: (input) =>
      database.transaction((transaction) =>
        executeClientSubscriptionAllowanceCommandInTransaction(transaction, input)
      )
  };
}

type ClientSubscriptionAllowanceTransactionInput = Parameters<
  ClientSubscriptionAllowanceCommandUnitOfWork["execute"]
>[0];

/**
 * Persists one allowance command inside an already-owned transaction and acquires the standalone
 * same-key advisory lock. Callers that already hold the period allowance in a broader global lock
 * order must use the prelocked entry below so they do not invert advisory-lock and row-lock order.
 */
export async function executeClientSubscriptionAllowanceCommandInTransaction(
  transaction: ClientSubscriptionTransaction,
  input: ClientSubscriptionAllowanceTransactionInput
): Promise<ClientSubscriptionAllowanceCommandExecution> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(
      ${`client-subscription-allowance:${input.periodId}:${input.idempotencyKey}`}, 0
    ))`
  );
  return executePrelockedClientSubscriptionAllowanceCommandInTransaction(transaction, input);
}

/**
 * Persists an allowance command after the caller has already locked its period allowance in the
 * enclosing transaction's global lock order. This entry deliberately does not acquire the
 * standalone allowance-command advisory lock.
 */
export async function executePrelockedClientSubscriptionAllowanceCommandInTransaction(
  transaction: ClientSubscriptionTransaction,
  input: ClientSubscriptionAllowanceTransactionInput
): Promise<ClientSubscriptionAllowanceCommandExecution> {
  const [prior] = await transaction
    .select()
    .from(clientSubscriptionAllowanceCommandReceipts)
    .where(
      and(
        eq(clientSubscriptionAllowanceCommandReceipts.periodId, input.periodId),
        eq(clientSubscriptionAllowanceCommandReceipts.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (prior) {
    if (
      prior.requestHash !== input.requestHash ||
      !sameAllowanceCommand(commandSchema.parse(prior.command), input.command)
    ) {
      return { outcome: "idempotency_conflict" };
    }
    return {
      outcome: "replayed",
      result: await hydrateAllowanceReceiptResult(transaction, prior)
    };
  }

  const current = await loadAllowance(transaction, input.periodId, "update");
  if (!current) return { outcome: "not_found" };
  if (current.version !== input.expectedVersion) {
    return {
      outcome: "version_conflict",
      expectedVersion: input.expectedVersion,
      currentVersion: current.version
    };
  }
  const decision = input.decide(current);
  if (decision.outcome === "version_conflict") return decision;
  if (decision.outcome === "idempotency_conflict") {
    throw new Error("Allowance domain idempotency conflicted without a persistence receipt");
  }
  if (decision.outcome === "idempotent") {
    throw new Error("Allowance domain replayed without a persistence receipt");
  }
  if (decision.outcome !== "applied") {
    const rejected = rejectedOutcomeSchema.parse(decision.outcome);
    const receipt: ClientSubscriptionAllowancePersistenceReceipt = {
      periodId: input.periodId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      command: input.command,
      resultVersion: input.expectedVersion,
      result: { outcome: "rejected", decision: { outcome: rejected } }
    };
    await transaction.insert(clientSubscriptionAllowanceCommandReceipts).values({
      periodId: input.periodId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      command: input.command,
      resultKind: "rejected",
      result: receipt.result,
      resultVersion: input.expectedVersion
    });
    return { outcome: "rejected", decision: { outcome: rejected }, receipt };
  }

  validateClientSubscriptionAllowanceDecision(input, decision);
  const receipt: ClientSubscriptionAllowancePersistenceReceipt = {
    periodId: input.periodId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    command: input.command,
    resultVersion: decision.allowance.version,
    result: { outcome: "applied" }
  };
  await transaction.insert(clientSubscriptionAllowanceCommandReceipts).values({
    periodId: input.periodId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    command: input.command,
    resultKind: "applied",
    result: receipt.result,
    resultVersion: decision.allowance.version
  });
  const fact = await persistAllowanceFact(transaction, current, input.command);
  const [updated] = await transaction
    .update(clientSubscriptionPeriodAllowances)
    .set({
      available: decision.allowance.available,
      reserved: decision.allowance.reserved,
      consumed: decision.allowance.consumed,
      released: decision.allowance.released,
      version: decision.allowance.version,
      updatedAt: new Date(input.command.occurredAt)
    })
    .where(
      and(
        eq(clientSubscriptionPeriodAllowances.periodId, input.periodId),
        eq(clientSubscriptionPeriodAllowances.version, input.expectedVersion)
      )
    )
    .returning({ periodId: clientSubscriptionPeriodAllowances.periodId });
  if (!updated) throw new Error("Allowance CAS changed inside locked transaction");
  await transaction.insert(clientSubscriptionAllowanceCommandEffects).values({
    periodId: input.periodId,
    idempotencyKey: input.idempotencyKey,
    beforeVersion: current.version,
    beforeAvailable: current.available,
    beforeReserved: current.reserved,
    beforeConsumed: current.consumed,
    beforeReleased: current.released,
    afterVersion: decision.allowance.version,
    afterAvailable: decision.allowance.available,
    afterReserved: decision.allowance.reserved,
    afterConsumed: decision.allowance.consumed,
    afterReleased: decision.allowance.released,
    operation: input.command.operation,
    occurredAt: new Date(input.command.occurredAt),
    reservationId: fact.reservationId,
    reservationStateBefore: fact.reservationStateBefore,
    reservationStateAfter: fact.reservationStateAfter,
    consumptionId: fact.consumptionId
  });
  return { outcome: "applied", allowance: decision.allowance, receipt };
}

type AllowanceReceiptRow = typeof clientSubscriptionAllowanceCommandReceipts.$inferSelect;

export function findClientSubscriptionPeriodAllowance(
  transaction: ClientSubscriptionTransaction,
  periodId: string,
  lock: "none" | "update" = "none"
): Promise<ClientSubscriptionPeriodAllowance | null> {
  return loadAllowance(transaction, periodId, lock);
}

async function hydrateAllowanceReceiptResult(
  transaction: ClientSubscriptionTransaction,
  row: AllowanceReceiptRow
): Promise<ClientSubscriptionAllowancePersistedResult> {
  const command = commandSchema.parse(row.command);
  const receiptBase = {
    periodId: row.periodId,
    expectedVersion: row.expectedVersion,
    idempotencyKey: row.idempotencyKey,
    requestHash: sha256DigestSchema.parse(row.requestHash),
    command,
    resultVersion: row.resultVersion
  };
  if (row.resultKind === "rejected") {
    const parsed = z
      .object({
        outcome: z.literal("rejected"),
        decision: z.object({ outcome: rejectedOutcomeSchema }).strict()
      })
      .strict()
      .parse(row.result);
    const receipt: ClientSubscriptionAllowancePersistenceReceipt = {
      ...receiptBase,
      result: parsed
    };
    return { outcome: "rejected", decision: parsed.decision, receipt };
  }
  if (row.resultKind !== "applied") throw new Error("Unknown allowance receipt result kind");
  z.object({ outcome: z.literal("applied") })
    .strict()
    .parse(row.result);
  const allowance = await loadAllowanceAtVersion(transaction, row.periodId, row.resultVersion);
  if (!allowance) throw new Error("Persisted allowance replay result is missing");
  const receipt: ClientSubscriptionAllowancePersistenceReceipt = {
    ...receiptBase,
    result: { outcome: "applied" }
  };
  return { outcome: "applied", allowance, receipt };
}

async function loadAllowance(
  transaction: ClientSubscriptionTransaction,
  periodId: string,
  lock: "none" | "update"
): Promise<ClientSubscriptionPeriodAllowance | null> {
  const query = transaction
    .select()
    .from(clientSubscriptionPeriodAllowances)
    .where(eq(clientSubscriptionPeriodAllowances.periodId, periodId))
    .limit(1);
  const rows = lock === "update" ? await query.for("update") : await query;
  const row = rows[0];
  if (!row) return null;
  const reservations = await transaction
    .select()
    .from(clientSubscriptionAllowanceReservations)
    .where(eq(clientSubscriptionAllowanceReservations.periodId, periodId))
    .orderBy(asc(clientSubscriptionAllowanceReservations.reservedAt));
  const receipts = await transaction
    .select()
    .from(clientSubscriptionAllowanceCommandReceipts)
    .where(
      and(
        eq(clientSubscriptionAllowanceCommandReceipts.periodId, periodId),
        eq(clientSubscriptionAllowanceCommandReceipts.resultKind, "applied")
      )
    )
    .orderBy(asc(clientSubscriptionAllowanceCommandReceipts.resultVersion));
  return {
    periodId: row.periodId,
    endsAt: row.endsAt.toISOString(),
    total: row.total,
    available: row.available,
    reserved: row.reserved,
    consumed: row.consumed,
    released: row.released,
    version: row.version,
    reservations: reservations.map((reservation) => ({
      reservationId: reservation.id,
      state: z.enum(["reserved", "consumed", "released"]).parse(reservation.state)
    })),
    receipts: receipts.map((receipt) => ({
      idempotencyKey: receipt.idempotencyKey,
      requestHash: sha256DigestSchema.parse(receipt.requestHash),
      operation: commandSchema.parse(receipt.command).operation,
      command: commandSchema.parse(receipt.command),
      resultVersion: receipt.resultVersion
    }))
  };
}

async function loadAllowanceAtVersion(
  transaction: ClientSubscriptionTransaction,
  periodId: string,
  version: number
): Promise<ClientSubscriptionPeriodAllowance | null> {
  const current = await loadAllowance(transaction, periodId, "none");
  if (!current) return null;
  if (current.version === version) return current;
  const [effect] = await transaction
    .select()
    .from(clientSubscriptionAllowanceCommandEffects)
    .where(
      and(
        eq(clientSubscriptionAllowanceCommandEffects.periodId, periodId),
        eq(clientSubscriptionAllowanceCommandEffects.afterVersion, version)
      )
    )
    .limit(1);
  if (!effect) return null;
  const effects = await transaction
    .select()
    .from(clientSubscriptionAllowanceCommandEffects)
    .where(
      and(
        eq(clientSubscriptionAllowanceCommandEffects.periodId, periodId),
        lte(clientSubscriptionAllowanceCommandEffects.afterVersion, version)
      )
    )
    .orderBy(asc(clientSubscriptionAllowanceCommandEffects.afterVersion));
  const receipts = await transaction
    .select()
    .from(clientSubscriptionAllowanceCommandReceipts)
    .where(
      and(
        eq(clientSubscriptionAllowanceCommandReceipts.periodId, periodId),
        eq(clientSubscriptionAllowanceCommandReceipts.resultKind, "applied"),
        lte(clientSubscriptionAllowanceCommandReceipts.resultVersion, version)
      )
    )
    .orderBy(asc(clientSubscriptionAllowanceCommandReceipts.resultVersion));
  const reservationStates = new Map<string, "reserved" | "consumed" | "released">();
  for (const item of effects) {
    if (item.reservationId && item.reservationStateAfter) {
      reservationStates.set(
        item.reservationId,
        z.enum(["reserved", "consumed", "released"]).parse(item.reservationStateAfter)
      );
    }
  }
  return {
    periodId,
    endsAt: current.endsAt,
    total: current.total,
    available: effect.afterAvailable,
    reserved: effect.afterReserved,
    consumed: effect.afterConsumed,
    released: effect.afterReleased,
    version,
    reservations: [...reservationStates].map(([reservationId, state]) => ({
      reservationId,
      state
    })),
    receipts: receipts.map((receipt) => {
      const parsed = commandSchema.parse(receipt.command);
      return {
        idempotencyKey: receipt.idempotencyKey,
        requestHash: sha256DigestSchema.parse(receipt.requestHash),
        operation: parsed.operation,
        command: parsed,
        resultVersion: receipt.resultVersion
      };
    })
  };
}

async function persistAllowanceFact(
  transaction: ClientSubscriptionTransaction,
  current: ClientSubscriptionPeriodAllowance,
  command: ClientSubscriptionAllowanceCommand
): Promise<{
  readonly reservationId: string | null;
  readonly reservationStateBefore: "reserved" | null;
  readonly reservationStateAfter: "reserved" | "consumed" | "released" | null;
  readonly consumptionId: string | null;
}> {
  switch (command.operation) {
    case "reserve":
      await transaction.insert(clientSubscriptionAllowanceReservations).values({
        id: command.reservationId,
        periodId: current.periodId,
        subscriptionId: await allowanceSubscriptionId(transaction, current.periodId),
        state: "reserved",
        reservedAt: new Date(command.occurredAt),
        consumedAt: null,
        releasedAt: null
      });
      return {
        reservationId: command.reservationId,
        reservationStateBefore: null,
        reservationStateAfter: "reserved",
        consumptionId: null
      };
    case "consume_available":
      await transaction.insert(clientSubscriptionAllowanceConsumptions).values({
        id: command.consumptionId,
        periodId: current.periodId,
        subscriptionId: await allowanceSubscriptionId(transaction, current.periodId),
        source: "available",
        reservationId: null,
        consumedAt: new Date(command.occurredAt)
      });
      return {
        reservationId: null,
        reservationStateBefore: null,
        reservationStateAfter: null,
        consumptionId: command.consumptionId
      };
    case "consume_reserved":
      await updateReservation(transaction, current.periodId, command.reservationId, {
        state: "consumed",
        consumedAt: new Date(command.occurredAt),
        releasedAt: null
      });
      await transaction.insert(clientSubscriptionAllowanceConsumptions).values({
        id: command.reservationId,
        periodId: current.periodId,
        subscriptionId: await allowanceSubscriptionId(transaction, current.periodId),
        source: "reservation",
        reservationId: command.reservationId,
        consumedAt: new Date(command.occurredAt)
      });
      return {
        reservationId: command.reservationId,
        reservationStateBefore: "reserved",
        reservationStateAfter: "consumed",
        consumptionId: command.reservationId
      };
    case "release_reserved":
    case "forfeit_reserved":
      await updateReservation(transaction, current.periodId, command.reservationId, {
        state: "released",
        consumedAt: null,
        releasedAt: new Date(command.occurredAt)
      });
      return {
        reservationId: command.reservationId,
        reservationStateBefore: "reserved",
        reservationStateAfter: "released",
        consumptionId: null
      };
    case "expire_available":
      return {
        reservationId: null,
        reservationStateBefore: null,
        reservationStateAfter: null,
        consumptionId: null
      };
  }
}

async function allowanceSubscriptionId(
  transaction: ClientSubscriptionTransaction,
  periodId: string
): Promise<string> {
  const [row] = await transaction
    .select({ subscriptionId: clientSubscriptionPeriodAllowances.subscriptionId })
    .from(clientSubscriptionPeriodAllowances)
    .where(eq(clientSubscriptionPeriodAllowances.periodId, periodId))
    .limit(1);
  if (!row) throw new Error("Allowance subscription identity is missing");
  return row.subscriptionId;
}

async function updateReservation(
  transaction: ClientSubscriptionTransaction,
  periodId: string,
  reservationId: string,
  values: {
    readonly state: "consumed" | "released";
    readonly consumedAt: Date | null;
    readonly releasedAt: Date | null;
  }
): Promise<void> {
  const [updated] = await transaction
    .update(clientSubscriptionAllowanceReservations)
    .set(values)
    .where(
      and(
        eq(clientSubscriptionAllowanceReservations.id, reservationId),
        eq(clientSubscriptionAllowanceReservations.periodId, periodId),
        eq(clientSubscriptionAllowanceReservations.state, "reserved")
      )
    )
    .returning({ id: clientSubscriptionAllowanceReservations.id });
  if (!updated) throw new Error("Allowance reservation changed inside locked transaction");
}

function sameAllowanceCommand(
  left: ClientSubscriptionAllowanceCommand,
  right: ClientSubscriptionAllowanceCommand
): boolean {
  return stableJson(left) === stableJson(right);
}
