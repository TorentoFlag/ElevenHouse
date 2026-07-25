import { and, eq } from "drizzle-orm";
import { IdempotencyKeyReuseError } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { idempotencyCommands } from "../../schema";

export type SchedulingTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

type PersistedCommand = {
  readonly actorUserId: string;
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string;
  readonly now: string;
  readonly expiresAt: string;
};

const defaultApiSurface = "astrologer-api";

export async function executeIdempotentSchedulingCommand<T>(input: {
  readonly database: ElevenHouseDatabase;
  readonly command: PersistedCommand;
  readonly create: (
    transaction: SchedulingTransaction
  ) => Promise<{ readonly aggregateId: string; readonly value: T }>;
  readonly replay: (aggregateId: string) => Promise<T | null>;
  readonly apiSurface?: "astrologer-api" | "public-api";
}): Promise<{ readonly kind: "created" | "replayed"; readonly value: T }> {
  const apiSurface = input.apiSurface ?? defaultApiSurface;
  try {
    const value = await input.database.transaction(async (transaction) => {
      const [commandRow] = await transaction
        .insert(idempotencyCommands)
        .values({
          apiSurface,
          actorUserId: input.command.actorUserId,
          commandScope: input.command.scope,
          key: input.command.key,
          requestHash: input.command.requestHash,
          expiresAt: new Date(input.command.expiresAt),
          createdAt: new Date(input.command.now),
          updatedAt: new Date(input.command.now)
        })
        .returning({ id: idempotencyCommands.id });
      if (!commandRow) throw new Error("Expected idempotency command insert");

      const created = await input.create(transaction);
      await transaction
        .update(idempotencyCommands)
        .set({
          state: "completed",
          result: { aggregateId: created.aggregateId },
          updatedAt: new Date(input.command.now)
        })
        .where(eq(idempotencyCommands.id, commandRow.id));
      return created.value;
    });
    return { kind: "created", value };
  } catch (error) {
    if (!isIdempotencyUniqueViolation(error)) throw error;
  }

  const [existing] = await input.database
    .select({
      requestHash: idempotencyCommands.requestHash,
      state: idempotencyCommands.state,
      result: idempotencyCommands.result
    })
    .from(idempotencyCommands)
    .where(
      and(
        eq(idempotencyCommands.apiSurface, apiSurface),
        eq(idempotencyCommands.actorUserId, input.command.actorUserId),
        eq(idempotencyCommands.commandScope, input.command.scope),
        eq(idempotencyCommands.key, input.command.key)
      )
    )
    .limit(1);
  if (!existing) throw new Error("Expected persisted idempotency command after unique conflict");
  if (existing.requestHash !== input.command.requestHash) throw new IdempotencyKeyReuseError();
  const aggregateId = readCompletedAggregateId(existing.state, existing.result);
  const value = await input.replay(aggregateId);
  if (!value) throw new Error("Persisted idempotency result aggregate is missing");
  return { kind: "replayed", value };
}

function readCompletedAggregateId(
  state: string,
  result: Record<string, unknown> | null
): string {
  const aggregateId = result?.aggregateId;
  if (state !== "completed" || typeof aggregateId !== "string" || aggregateId.length === 0) {
    throw new Error("Persisted idempotency command result is incomplete");
  }
  return aggregateId;
}

function isIdempotencyUniqueViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(
    error,
    "23505",
    "idempotency_commands_scope_key_unique"
  );
}

export function isActiveReservationExclusionViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(
    error,
    "23P01",
    "schedule_reservations_active_owner_range_exclude"
  );
}

export function hasPostgresConstraintViolation(
  error: unknown,
  code: string,
  constraint: string
): boolean {
  let current: unknown = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if (
      "code" in current &&
      current.code === code &&
      "constraint" in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}
