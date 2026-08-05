/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import type {
  MarkProviderOperationTransportUnknownCommand,
  ProviderOperationTransportUnknownCommitReceipt,
  ProviderOperationTransportUnknownUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationTransportUnknownReceipts
} from "../../schema/finance/provider-operations.schema";
import { decodeFinanceUnsignedRevision } from "./finance-row-codecs";

type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type OperationKind = ProviderOperationTransportUnknownCommitReceipt["operationKind"];

export type ProviderOperationTransportUnknownPersistenceReason =
  | "invalid_command"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "provider_operation_not_found"
  | "provider_operation_version_conflict"
  | "provider_operation_correlation_conflict"
  | "provider_operation_terminal"
  | "transport_observation_not_found"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ProviderOperationTransportUnknownPersistenceError extends Error {
  readonly code = "provider_operation_transport_unknown_persistence_error";

  constructor(readonly reason: ProviderOperationTransportUnknownPersistenceReason) {
    super("Provider transport indeterminacy could not be committed atomically");
  }
}

/**
 * Generic provider-I/O fence. Unlike the client-checkout-specific UoW, this boundary owns only
 * the provider operation and its immutable receipt; it deliberately does not invent a product
 * state transition for card setup, recurring charge, refund or void.
 */
export function createDrizzleProviderOperationTransportUnknownUnitOfWork(
  database: ElevenHouseDatabase
): ProviderOperationTransportUnknownUnitOfWork {
  return Object.freeze({
    async markProviderOperationTransportUnknown(command) {
      const normalized = normalizeCommand(command);
      try {
        return await database.transaction((transaction) => markUnknownInTransaction(transaction, normalized));
      } catch (error) {
        if (error instanceof ProviderOperationTransportUnknownPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23503" || code === "23505" || code === "23514") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  });
}

type NormalizedCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
}>;

async function markUnknownInTransaction(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<ProviderOperationTransportUnknownCommitReceipt> {
  const economic = await lockEconomicIntent(transaction, command.economicPaymentIntentId);
  const operation = await lockOperation(transaction, command.providerOperationIntentId);
  assertCorrelation(economic, operation, command);
  const operationVersion = revision(operation.version);

  if (
    operation.status === "provider_unknown" &&
    operationVersion === command.expectedProviderOperationIntentVersion + 1
  ) {
    await assertTransportReceipt(transaction, command.providerOperationIntentId, operationVersion);
    return receipt(operation, operationVersion);
  }
  if (operation.status !== "pending_dispatch") fail("provider_operation_terminal");
  if (operationVersion !== command.expectedProviderOperationIntentVersion) {
    fail("provider_operation_version_conflict");
  }

  const nextVersion = operationVersion + 1;
  const [updated] = await transaction
    .update(financeProviderOperationIntents)
    .set({
      status: "provider_unknown",
      version: String(nextVersion),
      providerUnknownObservedAt: sql`clock_timestamp()`
    })
    .where(
      and(
        eq(financeProviderOperationIntents.id, command.providerOperationIntentId),
        eq(financeProviderOperationIntents.version, String(operationVersion)),
        eq(financeProviderOperationIntents.status, "pending_dispatch")
      )
    )
    .returning();
  if (!updated || revision(updated.version) !== nextVersion || !updated.providerUnknownObservedAt) {
    fail("provider_operation_version_conflict");
  }

  const [inserted] = await transaction
    .insert(financeProviderOperationTransportUnknownReceipts)
    .values({
      providerOperationIntentId: updated.id,
      providerOperationIntentVersion: String(nextVersion),
      economicPaymentIntentId: updated.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: updated.correlatedEconomicPaymentVersion,
      economicPaymentSessionId: updated.economicPaymentSessionId,
      seriesId: updated.seriesId,
      providerAccountId: updated.providerAccountId,
      providerIdentityVersion: updated.providerIdentityVersion,
      purpose: updated.purpose,
      sourceId: updated.sourceId,
      operationKind: updated.operationKind,
      canonicalRequestDigest: updated.canonicalRequestDigest,
      idempotencyKey: updated.idempotencyKey,
      observedAt: updated.providerUnknownObservedAt
    })
    .returning({
      providerOperationIntentId:
        financeProviderOperationTransportUnknownReceipts.providerOperationIntentId,
      providerOperationIntentVersion:
        financeProviderOperationTransportUnknownReceipts.providerOperationIntentVersion
    });
  if (
    !inserted ||
    inserted.providerOperationIntentId !== command.providerOperationIntentId ||
    revision(inserted.providerOperationIntentVersion) !== nextVersion
  ) {
    fail("persistence_write_incomplete");
  }
  return receipt(updated, nextVersion);
}

async function lockEconomicIntent(transaction: FinanceTransaction, id: string) {
  const [economic] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, id))
    .limit(1)
    .for("update");
  if (!economic) fail("economic_payment_not_found");
  return economic;
}

async function lockOperation(transaction: FinanceTransaction, id: string) {
  const [operation] = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, id))
    .limit(1)
    .for("update");
  if (!operation) fail("provider_operation_not_found");
  return operation;
}

function assertCorrelation(
  economic: typeof financeEconomicPaymentIntents.$inferSelect,
  operation: typeof financeProviderOperationIntents.$inferSelect,
  command: NormalizedCommand
): void {
  if (revision(economic.version) !== command.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  if (operation.economicPaymentIntentId !== economic.id) fail("provider_operation_correlation_conflict");
}

async function assertTransportReceipt(
  transaction: FinanceTransaction,
  providerOperationIntentId: string,
  providerOperationIntentVersion: number
): Promise<void> {
  const [existing] = await transaction
    .select({ id: financeProviderOperationTransportUnknownReceipts.id })
    .from(financeProviderOperationTransportUnknownReceipts)
    .where(
      and(
        eq(
          financeProviderOperationTransportUnknownReceipts.providerOperationIntentId,
          providerOperationIntentId
        ),
        eq(
          financeProviderOperationTransportUnknownReceipts.providerOperationIntentVersion,
          String(providerOperationIntentVersion)
        )
      )
    )
    .limit(1)
    .for("share");
  if (!existing) fail("transport_observation_not_found");
}

function receipt(
  operation: typeof financeProviderOperationIntents.$inferSelect,
  providerOperationIntentVersion: number
): ProviderOperationTransportUnknownCommitReceipt {
  return Object.freeze({
    kind: "provider_operation_transport_unknown_commit_receipt",
    providerOperationIntentId: operation.id,
    providerOperationIntentVersion,
    economicPaymentIntentId: operation.economicPaymentIntentId,
    correlatedEconomicPaymentVersion: revision(operation.correlatedEconomicPaymentVersion),
    operationKind: operationKind(operation.operationKind)
  });
}

function normalizeCommand(command: MarkProviderOperationTransportUnknownCommand): NormalizedCommand {
  try {
    assertExactKeys(command, [
      "economicPaymentIntentId",
      "expectedEconomicPaymentVersion",
      "providerOperationIntentId",
      "expectedProviderOperationIntentVersion"
    ]);
    return Object.freeze({
      economicPaymentIntentId: identifier(command.economicPaymentIntentId),
      expectedEconomicPaymentVersion: unsignedRevision(command.expectedEconomicPaymentVersion),
      providerOperationIntentId: identifier(command.providerOperationIntentId),
      expectedProviderOperationIntentVersion: unsignedRevision(command.expectedProviderOperationIntentVersion)
    });
  } catch (error) {
    if (error instanceof ProviderOperationTransportUnknownPersistenceError) throw error;
    fail("invalid_command");
  }
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function unsignedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail("invalid_command");
  }
  return value;
}

function revision(value: unknown): number {
  try {
    const parsed = Number(decodeFinanceUnsignedRevision(value));
    if (!Number.isSafeInteger(parsed)) throw new Error();
    return parsed;
  } catch {
    fail("persistence_write_incomplete");
  }
}

function operationKind(value: unknown): OperationKind {
  if (
    value === "checkout_session_create" ||
    value === "card_setup" ||
    value === "saved_card_charge" ||
    value === "refund" ||
    value === "void"
  ) {
    return value;
  }
  fail("persistence_write_incomplete");
}

function assertExactKeys(value: unknown, expected: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) fail("invalid_command");
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}

function postgresCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const record = current as Readonly<{ code?: unknown; cause?: unknown }>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return undefined;
}

function fail(reason: ProviderOperationTransportUnknownPersistenceReason): never {
  throw new ProviderOperationTransportUnknownPersistenceError(reason);
}
