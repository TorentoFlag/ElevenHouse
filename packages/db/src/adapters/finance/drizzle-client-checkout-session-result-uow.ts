/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  type ClientCheckoutSessionResultCommitReceipt,
  type ClientCheckoutSessionResultUnitOfWork,
  type CompleteClientCheckoutSessionCommand,
  type ProviderOperationResultCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeClientCheckoutPreparations } from "../../schema/finance/client-checkouts.schema";
import {
  applyProviderOperationResultInTransaction,
  ProviderOperationResultApplicationPersistenceError
} from "./drizzle-provider-operation-result-application-uow";
import {
  ClientCheckoutPreparationPersistenceError,
  mapClientCheckoutPreparationRow,
  publishClientCheckoutReadyInTransaction
} from "./drizzle-client-checkout-preparation-store";

type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export type ClientCheckoutSessionResultPersistenceReason =
  | "invalid_command"
  | "checkout_preparation_not_found"
  | "checkout_preparation_version_conflict"
  | "checkout_preparation_correlation_conflict"
  | "checkout_preparation_terminal"
  | "provider_result_not_checkout_session"
  | "provider_result_not_session_created"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ClientCheckoutSessionResultPersistenceError extends Error {
  readonly code = "client_checkout_session_result_persistence_error";

  constructor(readonly reason: ClientCheckoutSessionResultPersistenceReason) {
    super("Client checkout session result could not be committed atomically");
    this.name = "ClientCheckoutSessionResultPersistenceError";
  }
}

/**
 * Makes successful HPP-session evidence and the client-visible checkout action one database
 * fact. It does not create a payment/capture fact or change order fulfilment.
 */
export function createDrizzleClientCheckoutSessionResultUnitOfWork(
  database: ElevenHouseDatabase
): ClientCheckoutSessionResultUnitOfWork {
  return Object.freeze({
    async completeClientCheckoutSession(command) {
      const normalized = normalizeCommand(command);
      try {
        return await database.transaction((transaction) =>
          completeInTransaction(transaction, normalized)
        );
      } catch (error) {
        if (error instanceof ClientCheckoutSessionResultPersistenceError) throw error;
        if (
          error instanceof ProviderOperationResultApplicationPersistenceError ||
          error instanceof ClientCheckoutPreparationPersistenceError
        ) {
          fail("persistence_write_incomplete");
        }
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
  providerResult: CompleteClientCheckoutSessionCommand["providerResult"];
  providerOperationIntentId: string;
  providerCheckoutId: string;
  responseArtifactId: string;
  responseArtifactDigest: `sha256:${string}`;
}>;

async function completeInTransaction(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<ClientCheckoutSessionResultCommitReceipt> {
  const preparation = await lockPreparation(transaction, command.providerOperationIntentId);
  assertPreparationCorrelation(preparation, command);
  const providerResult = await applyProviderOperationResultInTransaction(
    transaction,
    command.providerResult
  );
  assertSessionCreatedResult(providerResult, preparation, command);

  if (preparation.state === "checkout_ready") {
    return Object.freeze({
      kind: "client_checkout_session_result_commit_receipt",
      providerResult,
      checkoutPreparation: mapClientCheckoutPreparationRow(preparation)
    });
  }
  if (preparation.state !== "checkout_requested") fail("checkout_preparation_terminal");
  const checkoutPreparation = await publishClientCheckoutReadyInTransaction(transaction, {
    checkoutPreparationId: preparation.id,
    providerOperationIntentId: preparation.providerOperationIntentId,
    expectedVersion: 1,
    providerCheckoutId: command.providerCheckoutId,
    responseArtifactId: command.responseArtifactId,
    responseArtifactDigest: command.responseArtifactDigest
  });
  return Object.freeze({
    kind: "client_checkout_session_result_commit_receipt",
    providerResult,
    checkoutPreparation
  });
}

async function lockPreparation(
  transaction: FinanceTransaction,
  providerOperationIntentId: string
): Promise<typeof financeClientCheckoutPreparations.$inferSelect> {
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

function assertPreparationCorrelation(
  preparation: typeof financeClientCheckoutPreparations.$inferSelect,
  command: NormalizedCommand
): void {
  const provider = command.providerResult;
  if (
    provider.providerOperationIntentId !== preparation.providerOperationIntentId ||
    provider.economicPaymentIntentId !== preparation.economicPaymentIntentId ||
    provider.evidence.providerOperationIntentId !== preparation.providerOperationIntentId ||
    provider.evidence.economicPaymentIntentId !== preparation.economicPaymentIntentId ||
    provider.evidence.economicPaymentSessionId !== preparation.economicPaymentSessionId ||
    provider.evidence.artifact.artifactId !== command.responseArtifactId ||
    provider.evidence.artifact.sha256Digest !== command.responseArtifactDigest
  ) {
    fail("checkout_preparation_correlation_conflict");
  }
  const persistedVersion = Number(preparation.version);
  if (!Number.isSafeInteger(persistedVersion)) fail("persistence_write_incomplete");
  if (preparation.state === "checkout_requested" && persistedVersion !== 1) {
    fail("checkout_preparation_version_conflict");
  }
  if (
    preparation.state === "checkout_ready" &&
    (preparation.providerCheckoutId !== command.providerCheckoutId ||
      preparation.responseArtifactId !== command.responseArtifactId ||
      preparation.responseArtifactDigest !== command.responseArtifactDigest)
  ) {
    fail("checkout_preparation_correlation_conflict");
  }
}

function assertSessionCreatedResult(
  providerResult: ProviderOperationResultCommitReceipt,
  preparation: typeof financeClientCheckoutPreparations.$inferSelect,
  command: NormalizedCommand
): void {
  if (
    providerResult.operationKind !== "checkout_session_create" ||
    providerResult.outcome !== "succeeded" ||
    providerResult.providerOperationId !== command.providerCheckoutId ||
    providerResult.providerPaymentId !== null ||
    providerResult.amountMinor !== null ||
    providerResult.currency !== null ||
    providerResult.providerOperationIntentId !== preparation.providerOperationIntentId ||
    providerResult.economicPaymentIntentId !== preparation.economicPaymentIntentId ||
    providerResult.economicPaymentSessionId !== preparation.economicPaymentSessionId ||
    providerResult.evidenceArtifactId !== command.responseArtifactId ||
    providerResult.evidenceArtifactDigest !== command.responseArtifactDigest
  ) {
    fail("provider_result_not_session_created");
  }
}

function normalizeCommand(command: CompleteClientCheckoutSessionCommand): NormalizedCommand {
  try {
    assertExactKeys(command, [
      "providerResult",
      "providerCheckoutId",
      "responseArtifactId",
      "responseArtifactDigest"
    ]);
    return Object.freeze({
      providerResult: command.providerResult,
      providerOperationIntentId: identifier(command.providerResult.providerOperationIntentId),
      providerCheckoutId: uuid(command.providerCheckoutId),
      responseArtifactId: identifier(command.responseArtifactId),
      responseArtifactDigest: digest(command.responseArtifactDigest)
    });
  } catch (error) {
    if (error instanceof ClientCheckoutSessionResultPersistenceError) throw error;
    fail("invalid_command");
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
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

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail("invalid_command");
  return value as `sha256:${string}`;
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

function fail(reason: ClientCheckoutSessionResultPersistenceReason): never {
  throw new ClientCheckoutSessionResultPersistenceError(reason);
}
