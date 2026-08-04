import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  ChartAiDraftIdempotencyKeyReuseError,
  chartAiDraftCommandScope,
  type ChartAiDraftCommandKnownFailure,
  type ChartAiDraftCommandResult,
  type ChartAiDraftCommandStore
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { calculationInterpretations, calculationRecords, idempotencyCommands } from "../../schema";

const apiSurface = "astrologer-api";
const resultSchemaVersion = "chart-ai-draft-command-result.v1" as const;
const unknownOutcomeMessage = "Chart AI draft provider outcome requires reconciliation";

type ChartAiCommandTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export function createDrizzleChartAiDraftCommandStore(
  database: ElevenHouseDatabase
): ChartAiDraftCommandStore {
  return {
    acquire: (input) =>
      database.transaction(async (transaction) => {
        const now = new Date(input.now);
        await transaction
          .update(idempotencyCommands)
          .set({
            state: "completed",
            result: unknownOutcomeResult(),
            updatedAt: now,
            expiresAt: new Date(input.expiresAt)
          })
          .where(
            and(
              commandKeyWhere(input.actorUserId, input.key),
              eq(idempotencyCommands.state, "processing"),
              lte(idempotencyCommands.expiresAt, now)
            )
          );
        await transaction
          .delete(idempotencyCommands)
          .where(
            and(
              commandKeyWhere(input.actorUserId, input.key),
              lte(idempotencyCommands.expiresAt, now)
            )
          );

        const [inserted] = await transaction
          .insert(idempotencyCommands)
          .values({
            apiSurface,
            actorUserId: input.actorUserId,
            commandScope: chartAiDraftCommandScope,
            key: input.key,
            requestHash: input.requestHash,
            expiresAt: new Date(input.expiresAt),
            createdAt: now,
            updatedAt: now
          })
          .onConflictDoNothing({
            target: [
              idempotencyCommands.apiSurface,
              idempotencyCommands.actorUserId,
              idempotencyCommands.commandScope,
              idempotencyCommands.key
            ]
          })
          .returning({ id: idempotencyCommands.id });
        if (inserted) return { kind: "acquired", commandId: inserted.id };

        const [existing] = await transaction
          .select({
            id: idempotencyCommands.id,
            requestHash: idempotencyCommands.requestHash,
            state: idempotencyCommands.state,
            result: idempotencyCommands.result,
            updatedAt: idempotencyCommands.updatedAt
          })
          .from(idempotencyCommands)
          .where(commandKeyWhere(input.actorUserId, input.key))
          .limit(1);
        if (!existing) throw new Error("Expected chart AI idempotency command after conflict");
        if (existing.requestHash !== input.requestHash) {
          throw new ChartAiDraftIdempotencyKeyReuseError();
        }
        if (existing.state === "processing" && existing.result === null) {
          return {
            kind: "processing",
            commandId: existing.id,
            updatedAt: existing.updatedAt.toISOString()
          };
        }
        return {
          kind: "completed",
          commandId: existing.id,
          result: parseCompletedResult(existing.state, existing.result)
        };
      }),

    completeSuccess: (input) =>
      database.transaction(async (transaction) => {
        const command = await lockCommand(transaction, input.commandId, input.actorUserId);
        if (command.state === "completed") {
          return parseCompletedResult(command.state, command.result);
        }

        const [evidence] = await transaction
          .select({ interpretationId: calculationInterpretations.id })
          .from(calculationRecords)
          .innerJoin(
            calculationInterpretations,
            and(
              eq(calculationInterpretations.calculationId, calculationRecords.id),
              eq(calculationInterpretations.id, input.commandId),
              eq(calculationInterpretations.source, "ai")
            )
          )
          .where(
            and(
              eq(calculationRecords.id, input.calculationId),
              eq(calculationRecords.ownerUserId, input.actorUserId),
              eq(calculationRecords.resultChecksum, input.expectedResultChecksum)
            )
          )
          .limit(1);
        if (!evidence) return null;

        const result = {
          schemaVersion: resultSchemaVersion,
          kind: "success",
          calculationId: input.calculationId,
          interpretationId: evidence.interpretationId
        } as const;
        await persistCompletedResult(transaction, input.commandId, result, input.now);
        return result;
      }),

    completeKnownFailure: (input) => {
      const result = normalizeKnownFailure(input.failure);
      return completeTerminalResult({
        database,
        commandId: input.commandId,
        actorUserId: input.actorUserId,
        result,
        now: input.now
      });
    },

    completeUnknownOutcome: (input) =>
      completeTerminalResult({
        database,
        commandId: input.commandId,
        actorUserId: input.actorUserId,
        result: unknownOutcomeResult(),
        now: input.now
      }),

    reconcileExpiredProcessing: (input) => {
      assertReconciliationBounds(input);
      return database.transaction(async (transaction) => {
        const candidates = await transaction
          .select({ id: idempotencyCommands.id })
          .from(idempotencyCommands)
          .where(
            and(
              eq(idempotencyCommands.apiSurface, apiSurface),
              eq(idempotencyCommands.commandScope, chartAiDraftCommandScope),
              eq(idempotencyCommands.state, "processing"),
              lte(idempotencyCommands.expiresAt, sql`CURRENT_TIMESTAMP`)
            )
          )
          .orderBy(asc(idempotencyCommands.expiresAt), asc(idempotencyCommands.id))
          .limit(input.limit)
          .for("update", { of: idempotencyCommands, skipLocked: true });
        if (candidates.length === 0) return 0;
        const updated = await transaction
          .update(idempotencyCommands)
          .set({
            state: "completed",
            result: unknownOutcomeResult(),
            updatedAt: sql`CURRENT_TIMESTAMP`,
            expiresAt: sql`CURRENT_TIMESTAMP + (${input.retentionMs} * interval '1 millisecond')`
          })
          .where(
            and(
              inArray(
                idempotencyCommands.id,
                candidates.map(({ id }) => id)
              ),
              eq(idempotencyCommands.state, "processing")
            )
          )
          .returning({ id: idempotencyCommands.id });
        if (updated.length !== candidates.length) {
          throw new Error("Chart AI command reconciliation lost its locked claim");
        }
        return updated.length;
      });
    }
  };
}

function assertReconciliationBounds(input: { readonly retentionMs: number; readonly limit: number }) {
  if (
    !Number.isSafeInteger(input.retentionMs) ||
    input.retentionMs < 60_000 ||
    input.retentionMs > 7 * 24 * 60 * 60 * 1_000 ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 1_000
  ) {
    throw new TypeError("Chart AI command reconciliation bounds are invalid");
  }
}

function unknownOutcomeResult() {
  return {
    schemaVersion: resultSchemaVersion,
    kind: "unknown_outcome",
    code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN",
    message: unknownOutcomeMessage
  } as const;
}

async function completeTerminalResult(input: {
  readonly database: ElevenHouseDatabase;
  readonly commandId: string;
  readonly actorUserId: string;
  readonly result: ChartAiDraftCommandResult;
  readonly now: string;
}): Promise<ChartAiDraftCommandResult> {
  return input.database.transaction(async (transaction) => {
    const command = await lockCommand(transaction, input.commandId, input.actorUserId);
    if (command.state === "completed") {
      return parseCompletedResult(command.state, command.result);
    }
    await persistCompletedResult(transaction, input.commandId, input.result, input.now);
    return input.result;
  });
}

async function lockCommand(
  transaction: ChartAiCommandTransaction,
  commandId: string,
  actorUserId: string
) {
  const [command] = await transaction
    .select({
      state: idempotencyCommands.state,
      result: idempotencyCommands.result
    })
    .from(idempotencyCommands)
    .where(
      and(
        eq(idempotencyCommands.id, commandId),
        eq(idempotencyCommands.apiSurface, apiSurface),
        eq(idempotencyCommands.actorUserId, actorUserId),
        eq(idempotencyCommands.commandScope, chartAiDraftCommandScope)
      )
    )
    .for("update")
    .limit(1);
  if (!command) throw new Error("Chart AI idempotency command was not found");
  if (command.state !== "processing" && command.state !== "completed") {
    throw new Error("Chart AI idempotency command has an invalid state");
  }
  return command;
}

async function persistCompletedResult(
  transaction: ChartAiCommandTransaction,
  commandId: string,
  result: ChartAiDraftCommandResult,
  now: string
): Promise<void> {
  const [updated] = await transaction
    .update(idempotencyCommands)
    .set({
      state: "completed",
      result,
      updatedAt: new Date(now)
    })
    .where(and(eq(idempotencyCommands.id, commandId), eq(idempotencyCommands.state, "processing")))
    .returning({ id: idempotencyCommands.id });
  if (!updated) throw new Error("Chart AI idempotency command could not be completed");
}

function commandKeyWhere(actorUserId: string, key: string) {
  return and(
    eq(idempotencyCommands.apiSurface, apiSurface),
    eq(idempotencyCommands.actorUserId, actorUserId),
    eq(idempotencyCommands.commandScope, chartAiDraftCommandScope),
    eq(idempotencyCommands.key, key)
  );
}

function normalizeKnownFailure(
  failure: Omit<ChartAiDraftCommandKnownFailure, "schemaVersion" | "kind">
): ChartAiDraftCommandKnownFailure {
  if (
    !Number.isInteger(failure.statusCode) ||
    failure.statusCode < 400 ||
    failure.statusCode > 599
  ) {
    throw new TypeError("Chart AI terminal failure status is invalid");
  }
  if (!/^[A-Z0-9_]{1,120}$/u.test(failure.code)) {
    throw new TypeError("Chart AI terminal failure code is invalid");
  }
  const message = failure.message.trim();
  if (message.length < 1 || message.length > 240) {
    throw new TypeError("Chart AI terminal failure message is invalid");
  }
  return {
    schemaVersion: resultSchemaVersion,
    kind: "known_failure",
    statusCode: failure.statusCode,
    code: failure.code,
    message
  };
}

function parseCompletedResult(
  state: string,
  value: Record<string, unknown> | null
): ChartAiDraftCommandResult {
  if (
    state !== "completed" ||
    !value ||
    value.schemaVersion !== resultSchemaVersion ||
    typeof value.kind !== "string"
  ) {
    throw new Error("Chart AI idempotency command result is invalid");
  }
  if (
    value.kind === "success" &&
    typeof value.calculationId === "string" &&
    typeof value.interpretationId === "string"
  ) {
    return {
      schemaVersion: resultSchemaVersion,
      kind: "success",
      calculationId: value.calculationId,
      interpretationId: value.interpretationId
    };
  }
  if (
    value.kind === "known_failure" &&
    typeof value.statusCode === "number" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  ) {
    return normalizeKnownFailure({
      statusCode: value.statusCode,
      code: value.code,
      message: value.message
    });
  }
  if (
    value.kind === "unknown_outcome" &&
    value.code === "CHART_AI_DRAFT_OUTCOME_UNKNOWN" &&
    value.message === unknownOutcomeMessage
  ) {
    return {
      schemaVersion: resultSchemaVersion,
      kind: "unknown_outcome",
      code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN",
      message: unknownOutcomeMessage
    };
  }
  throw new Error("Chart AI idempotency command result is invalid");
}
