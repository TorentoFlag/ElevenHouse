/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import type {
  ClientCheckoutProviderTransportUnknownCommitReceipt,
  ClientCheckoutProviderTransportUnknownUnitOfWork,
  MarkClientCheckoutProviderTransportUnknownCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeClientCheckoutPreparations } from "../../schema/finance/client-checkouts.schema";
import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationTransportUnknownReceipts
} from "../../schema/finance/provider-operations.schema";
import { mapClientCheckoutPreparationRow } from "./drizzle-client-checkout-preparation-store";
import { decodeFinanceUnsignedRevision } from "./finance-row-codecs";

type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export type ClientCheckoutProviderTransportUnknownPersistenceReason =
  | "invalid_command"
  | "checkout_preparation_not_found"
  | "checkout_preparation_version_conflict"
  | "checkout_preparation_correlation_conflict"
  | "checkout_preparation_terminal"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "provider_operation_not_found"
  | "provider_operation_version_conflict"
  | "provider_operation_correlation_conflict"
  | "provider_operation_terminal"
  | "transport_observation_not_found"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ClientCheckoutProviderTransportUnknownPersistenceError extends Error {
  readonly code = "client_checkout_provider_transport_unknown_persistence_error";

  constructor(readonly reason: ClientCheckoutProviderTransportUnknownPersistenceReason) {
    super("Client checkout provider transport indeterminacy could not be committed atomically");
    this.name = "ClientCheckoutProviderTransportUnknownPersistenceError";
  }
}

/**
 * This boundary deliberately does not write a provider result. A network failure proves neither
 * provider outcome nor payment money; it only fences the durable request until a canonical read.
 */
export function createDrizzleClientCheckoutProviderTransportUnknownUnitOfWork(
  database: ElevenHouseDatabase
): ClientCheckoutProviderTransportUnknownUnitOfWork {
  return Object.freeze({
    async markClientCheckoutProviderTransportUnknown(command) {
      const normalized = normalizeCommand(command);
      try {
        return await database.transaction((transaction) =>
          markUnknownInTransaction(transaction, normalized)
        );
      } catch (error) {
        if (error instanceof ClientCheckoutProviderTransportUnknownPersistenceError) throw error;
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
): Promise<ClientCheckoutProviderTransportUnknownCommitReceipt> {
  const preparation = await lockPreparation(transaction, command.providerOperationIntentId);
  const economicIntent = await lockEconomicIntent(transaction, command.economicPaymentIntentId);
  const operation = await lockOperation(transaction, command.providerOperationIntentId);

  assertCorrelation(preparation, economicIntent, operation, command);
  const persistedOperationVersion = revision(operation.version);
  const persistedPreparationVersion = revision(preparation.version);

  if (
    operation.status === "provider_unknown" &&
    persistedOperationVersion === command.expectedProviderOperationIntentVersion + 1 &&
    preparation.state === "provider_session_unknown" &&
    persistedPreparationVersion === 2
  ) {
    await assertTransportReceipt(
      transaction,
      command.providerOperationIntentId,
      persistedOperationVersion
    );
    return receipt(operation.id, persistedOperationVersion, preparation);
  }
  if (operation.status !== "pending_dispatch") fail("provider_operation_terminal");
  if (preparation.state !== "checkout_requested") fail("checkout_preparation_terminal");
  if (persistedOperationVersion !== command.expectedProviderOperationIntentVersion) {
    fail("provider_operation_version_conflict");
  }
  if (persistedPreparationVersion !== 1) fail("checkout_preparation_version_conflict");

  const nextOperationVersion = command.expectedProviderOperationIntentVersion + 1;
  const [updatedOperation] = await transaction
    .update(financeProviderOperationIntents)
    .set({
      status: "provider_unknown",
      version: String(nextOperationVersion),
      providerUnknownObservedAt: sql`clock_timestamp()`
    })
    .where(
      and(
        eq(financeProviderOperationIntents.id, command.providerOperationIntentId),
        eq(
          financeProviderOperationIntents.version,
          String(command.expectedProviderOperationIntentVersion)
        ),
        eq(financeProviderOperationIntents.status, "pending_dispatch")
      )
    )
    .returning();
  if (!updatedOperation || revision(updatedOperation.version) !== nextOperationVersion) {
    fail("provider_operation_version_conflict");
  }

  const [transportReceipt] = await transaction
    .insert(financeProviderOperationTransportUnknownReceipts)
    .values({
      providerOperationIntentId: command.providerOperationIntentId,
      providerOperationIntentVersion: String(nextOperationVersion),
      economicPaymentIntentId: updatedOperation.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: updatedOperation.correlatedEconomicPaymentVersion,
      economicPaymentSessionId: updatedOperation.economicPaymentSessionId,
      seriesId: updatedOperation.seriesId,
      providerAccountId: updatedOperation.providerAccountId,
      providerIdentityVersion: updatedOperation.providerIdentityVersion,
      purpose: updatedOperation.purpose,
      sourceId: updatedOperation.sourceId,
      operationKind: updatedOperation.operationKind,
      canonicalRequestDigest: updatedOperation.canonicalRequestDigest,
      idempotencyKey: updatedOperation.idempotencyKey,
      observedAt: updatedOperation.providerUnknownObservedAt ?? fail("persistence_write_incomplete")
    })
    .returning({
      providerOperationIntentId:
        financeProviderOperationTransportUnknownReceipts.providerOperationIntentId,
      providerOperationIntentVersion:
        financeProviderOperationTransportUnknownReceipts.providerOperationIntentVersion
    });
  if (
    !transportReceipt ||
    transportReceipt.providerOperationIntentId !== command.providerOperationIntentId ||
    revision(transportReceipt.providerOperationIntentVersion) !== nextOperationVersion
  ) {
    fail("persistence_write_incomplete");
  }

  const [updatedPreparation] = await transaction
    .update(financeClientCheckoutPreparations)
    .set({ state: "provider_session_unknown", version: "2" })
    .where(
      and(
        eq(financeClientCheckoutPreparations.id, preparation.id),
        eq(financeClientCheckoutPreparations.version, "1"),
        eq(financeClientCheckoutPreparations.state, "checkout_requested")
      )
    )
    .returning();
  if (!updatedPreparation) fail("checkout_preparation_version_conflict");
  return receipt(command.providerOperationIntentId, nextOperationVersion, updatedPreparation);
}

async function lockPreparation(transaction: FinanceTransaction, providerOperationIntentId: string) {
  const [preparation] = await transaction
    .select()
    .from(financeClientCheckoutPreparations)
    .where(
      eq(financeClientCheckoutPreparations.providerOperationIntentId, providerOperationIntentId)
    )
    .limit(1)
    .for("update");
  if (!preparation) fail("checkout_preparation_not_found");
  return preparation;
}

async function lockEconomicIntent(
  transaction: FinanceTransaction,
  economicPaymentIntentId: string
) {
  const [economicIntent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!economicIntent) fail("economic_payment_not_found");
  return economicIntent;
}

async function lockOperation(transaction: FinanceTransaction, providerOperationIntentId: string) {
  const [operation] = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, providerOperationIntentId))
    .limit(1)
    .for("update");
  if (!operation) fail("provider_operation_not_found");
  return operation;
}

function assertCorrelation(
  preparation: typeof financeClientCheckoutPreparations.$inferSelect,
  economicIntent: typeof financeEconomicPaymentIntents.$inferSelect,
  operation: typeof financeProviderOperationIntents.$inferSelect,
  command: NormalizedCommand
): void {
  if (revision(economicIntent.version) !== command.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  if (
    preparation.economicPaymentIntentId !== command.economicPaymentIntentId ||
    operation.economicPaymentIntentId !== command.economicPaymentIntentId ||
    operation.economicPaymentSessionId !== preparation.economicPaymentSessionId ||
    operation.purpose !== "client_order" ||
    operation.operationKind !== "checkout_session_create" ||
    operation.sourceId !== preparation.orderId
  ) {
    fail("provider_operation_correlation_conflict");
  }
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
  providerOperationIntentId: string,
  providerOperationIntentVersion: number,
  preparation: typeof financeClientCheckoutPreparations.$inferSelect
): ClientCheckoutProviderTransportUnknownCommitReceipt {
  return Object.freeze({
    kind: "client_checkout_provider_transport_unknown_commit_receipt",
    providerOperationIntentId,
    providerOperationIntentVersion,
    checkoutPreparation: mapClientCheckoutPreparationRow(preparation)
  });
}

function normalizeCommand(
  command: MarkClientCheckoutProviderTransportUnknownCommand
): NormalizedCommand {
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
      expectedProviderOperationIntentVersion: unsignedRevision(
        command.expectedProviderOperationIntentVersion
      )
    });
  } catch (error) {
    if (error instanceof ClientCheckoutProviderTransportUnknownPersistenceError) throw error;
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

function fail(reason: ClientCheckoutProviderTransportUnknownPersistenceReason): never {
  throw new ClientCheckoutProviderTransportUnknownPersistenceError(reason);
}
