import { and, eq } from "drizzle-orm";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  type FinanceIdempotentCommand,
  type FinanceIdempotentCommandResult
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeIdempotencyCommands } from "../../schema/finance/idempotency-commands.schema";
import type { FinanceIdempotencyResult, FinanceTransaction } from "./drizzle-finance-command-store";

/**
 * Idempotency boundary for a command with an unavoidable external side effect (for example an
 * immutable object write).  The command is durably reserved before the effect, and an identical
 * retry resumes a `processing` reservation after a crash.  Final DB registration is serialized
 * under the command row lock, so it and the audit record are emitted exactly once.
 */
export async function executeIdempotentFinanceExternalEffect<T, TEffect>(input: {
  readonly database: ElevenHouseDatabase;
  readonly command: FinanceIdempotentCommand;
  readonly performExternalEffect: () => Promise<TEffect>;
  readonly finalize: (
    transaction: FinanceTransaction,
    effect: TEffect
  ) => Promise<{ readonly result: FinanceIdempotencyResult; readonly value: T }>;
  readonly replay: (result: FinanceIdempotencyResult) => Promise<T | null>;
}): Promise<FinanceIdempotentCommandResult<T>> {
  const reservation = await reserve(input.database, input.command);
  if (reservation.kind === "completed") {
    const value = await input.replay(reservation.result);
    if (!value) throw new Error("Persisted finance idempotency replay result is missing");
    return { kind: "replayed", value };
  }

  const effect = await input.performExternalEffect();

  const finalized = await input.database.transaction(async (transaction) => {
    const [row] = await transaction
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
      .limit(1)
      .for("update");
    if (!row) throw new Error("Expected reserved finance idempotency command");
    assertMatchingCommand(row, input.command);
    if (row.state === "completed") {
      if (!row.result) throw new Error("Completed finance idempotency command is missing result");
      return { kind: "replayed" as const, result: row.result };
    }
    if (row.state === "failed") {
      throw new FinanceIdempotencyFailedError(row.errorCode ?? "unknown_finance_error");
    }
    const created = await input.finalize(transaction, effect);
    await transaction
      .update(financeIdempotencyCommands)
      .set({
        state: "completed",
        result: created.result,
        updatedAt: new Date(input.command.now)
      })
      .where(
        and(
          eq(financeIdempotencyCommands.scope, input.command.scope),
          eq(financeIdempotencyCommands.idempotencyKey, input.command.idempotencyKey)
        )
      );
    return { kind: "created" as const, value: created.value };
  });

  if (finalized.kind === "created") return finalized;
  const value = await input.replay(finalized.result);
  if (!value) throw new Error("Persisted finance idempotency replay result is missing");
  return { kind: "replayed", value };
}

async function reserve(
  database: ElevenHouseDatabase,
  command: FinanceIdempotentCommand
): Promise<{ readonly kind: "reserved" } | { readonly kind: "completed"; readonly result: FinanceIdempotencyResult }> {
  try {
    await database.transaction(async (transaction) => {
      await transaction.insert(financeIdempotencyCommands).values({
        scope: command.scope,
        idempotencyKey: command.idempotencyKey,
        actorUserId: command.actorUserId,
        requestHash: command.requestHash,
        expiresAt: new Date(command.expiresAt),
        createdAt: new Date(command.now),
        updatedAt: new Date(command.now)
      });
    });
    return { kind: "reserved" };
  } catch (error) {
    if (!isCommandUniqueViolation(error)) throw error;
  }

  const [existing] = await database
    .select({
      requestHash: financeIdempotencyCommands.requestHash,
      state: financeIdempotencyCommands.state,
      result: financeIdempotencyCommands.result,
      errorCode: financeIdempotencyCommands.errorCode
    })
    .from(financeIdempotencyCommands)
    .where(
      and(
        eq(financeIdempotencyCommands.scope, command.scope),
        eq(financeIdempotencyCommands.idempotencyKey, command.idempotencyKey)
      )
    )
    .limit(1);
  if (!existing) throw new Error("Expected persisted finance idempotency command after unique conflict");
  assertMatchingCommand(existing, command);
  if (existing.state === "completed") {
    if (!existing.result) throw new Error("Completed finance idempotency command is missing result");
    return { kind: "completed", result: existing.result };
  }
  if (existing.state === "failed") {
    throw new FinanceIdempotencyFailedError(existing.errorCode ?? "unknown_finance_error");
  }
  return { kind: "reserved" };
}

function assertMatchingCommand(
  existing: Readonly<{ requestHash: string; state: string; errorCode: string | null }>,
  command: FinanceIdempotentCommand
): void {
  if (existing.requestHash !== command.requestHash) throw new FinanceIdempotencyConflictError();
}

function isCommandUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      current.constraint === "finance_idempotency_commands_scope_key_unique"
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}
