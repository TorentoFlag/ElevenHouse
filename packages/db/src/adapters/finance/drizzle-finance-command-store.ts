import { and, eq } from "drizzle-orm";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  type FinanceIdempotentCommand,
  type FinanceIdempotentCommandResult
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { financeIdempotencyCommands } from "../../schema";

export type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
export type FinanceDatabase = ElevenHouseDatabase | FinanceTransaction;

export type FinanceIdempotencyResult = Record<string, unknown>;

export async function executeIdempotentFinanceCommand<T>(input: {
  readonly database: ElevenHouseDatabase;
  readonly command: FinanceIdempotentCommand;
  readonly create: (
    transaction: FinanceTransaction
  ) => Promise<{ readonly result: FinanceIdempotencyResult; readonly value: T }>;
  readonly replay: (result: FinanceIdempotencyResult) => Promise<T | null>;
}): Promise<FinanceIdempotentCommandResult<T>> {
  try {
    const value = await input.database.transaction(async (transaction) => {
      const timestamp = new Date(input.command.now);
      const [commandRow] = await transaction
        .insert(financeIdempotencyCommands)
        .values({
          scope: input.command.scope,
          idempotencyKey: input.command.idempotencyKey,
          actorUserId: input.command.actorUserId,
          requestHash: input.command.requestHash,
          expiresAt: new Date(input.command.expiresAt),
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning({ id: financeIdempotencyCommands.id });
      if (!commandRow) throw new Error("Expected finance idempotency command insert");

      const created = await input.create(transaction);
      await transaction
        .update(financeIdempotencyCommands)
        .set({
          state: "completed",
          result: created.result,
          updatedAt: timestamp
        })
        .where(eq(financeIdempotencyCommands.id, commandRow.id));

      return created.value;
    });
    return { kind: "created", value };
  } catch (error) {
    if (!isFinanceIdempotencyUniqueViolation(error)) throw error;
  }

  const [existing] = await input.database
    .select({
      requestHash: financeIdempotencyCommands.requestHash,
      state: financeIdempotencyCommands.state,
      result: financeIdempotencyCommands.result,
      errorCode: financeIdempotencyCommands.errorCode
    })
    .from(financeIdempotencyCommands)
    .where(
      and(
        eq(financeIdempotencyCommands.scope, input.command.scope),
        eq(financeIdempotencyCommands.idempotencyKey, input.command.idempotencyKey)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error("Expected persisted finance idempotency command after unique conflict");
  }
  if (existing.requestHash !== input.command.requestHash) {
    throw new FinanceIdempotencyConflictError();
  }
  if (existing.state === "processing") {
    throw new FinanceIdempotencyInProgressError();
  }
  if (existing.state === "failed") {
    throw new FinanceIdempotencyFailedError(existing.errorCode ?? "unknown_finance_error");
  }
  if (!existing.result) {
    throw new Error("Persisted finance idempotency command result is incomplete");
  }

  const value = await input.replay(existing.result);
  if (!value) throw new Error("Persisted finance idempotency replay result is missing");
  return { kind: "replayed", value };
}

export function isFinanceIdempotencyUniqueViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(
    error,
    "23505",
    "finance_idempotency_commands_scope_key_unique"
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
