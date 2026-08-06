/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createClientCheckoutPreparation,
  failClientCheckoutPreparation,
  publishClientCheckoutReady,
  recordClientCheckoutProviderSessionUnknown,
  type ClientCheckoutPreparation,
  type ClientCheckoutPreparationReadPort,
  type ClientCheckoutPreparationWorkerUnitOfWork,
  type FailClientCheckoutPreparationCommand,
  type MarkClientCheckoutProviderSessionUnknownCommand,
  type PublishClientCheckoutReadyCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeClientCheckoutPreparations } from "../../schema/finance/client-checkouts.schema";
import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financeProviderOperationIntents } from "../../schema/finance/provider-operations.schema";
import { decodeFinancePositiveRevision } from "./finance-row-codecs";

type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export type ClientCheckoutPreparationPersistenceReason =
  | "invalid_command"
  | "checkout_preparation_not_found"
  | "checkout_preparation_version_conflict"
  | "checkout_preparation_transition_conflict"
  | "provider_operation_correlation_conflict"
  | "response_artifact_conflict"
  | "persistence_write_incomplete";

export class ClientCheckoutPreparationPersistenceError extends Error {
  readonly code = "client_checkout_preparation_persistence_error";

  constructor(readonly reason: ClientCheckoutPreparationPersistenceReason) {
    super("Client checkout preparation could not be persisted");
  }
}

export function createDrizzleClientCheckoutPreparationStore(
  database: ElevenHouseDatabase
): ClientCheckoutPreparationReadPort & ClientCheckoutPreparationWorkerUnitOfWork {
  return Object.freeze({
    findClientCheckoutPreparation: async (input) => {
      const checkoutPreparationId = uuid(input.checkoutPreparationId);
      const clientUserId = uuid(input.clientUserId);
      const [row] = await database
        .select()
        .from(financeClientCheckoutPreparations)
        .where(
          and(
            eq(financeClientCheckoutPreparations.id, checkoutPreparationId),
            eq(financeClientCheckoutPreparations.clientUserId, clientUserId)
          )
        )
        .limit(1);
      return row ? mapClientCheckoutPreparationRow(row) : null;
    },
    publishClientCheckoutReady: (command) =>
      database.transaction((transaction) =>
        publishReady(transaction, normalizeReadyCommand(command))
      ),
    markClientCheckoutProviderSessionUnknown: (command) =>
      database.transaction((transaction) =>
        markUnknown(transaction, normalizeUnknownCommand(command))
      ),
    failClientCheckoutPreparation: (command) =>
      database.transaction((transaction) =>
        failPreparation(transaction, normalizeFailureCommand(command))
      )
  });
}

/** Internal composition hook for the worker's provider-result transaction. */
export async function publishClientCheckoutReadyInTransaction(
  transaction: FinanceTransaction,
  command: PublishClientCheckoutReadyCommand
): Promise<ClientCheckoutPreparation> {
  return publishReady(transaction, normalizeReadyCommand(command));
}

type BaseCommand = Readonly<{
  checkoutPreparationId: string;
  providerOperationIntentId: string;
  expectedVersion: number;
}>;
type ReadyCommand = BaseCommand &
  Readonly<{
    providerCheckoutId: string;
    responseArtifactId: string;
    responseArtifactDigest: `sha256:${string}`;
  }>;
type FailureCommand = BaseCommand & Readonly<{ failureCode: string }>;

async function publishReady(
  transaction: FinanceTransaction,
  command: ReadyCommand
): Promise<ClientCheckoutPreparation> {
  const row = await lockRequestedPreparation(transaction, command);
  await validateResponseArtifact(transaction, row, command);
  const [updated] = await transaction
    .update(financeClientCheckoutPreparations)
    .set({
      state: "checkout_ready",
      version: String(command.expectedVersion + 1),
      providerCheckoutId: command.providerCheckoutId,
      responseArtifactId: command.responseArtifactId,
      responseArtifactDigest: command.responseArtifactDigest
    })
    .where(
      and(
        eq(financeClientCheckoutPreparations.id, command.checkoutPreparationId),
        eq(financeClientCheckoutPreparations.version, String(command.expectedVersion)),
        eq(financeClientCheckoutPreparations.state, "checkout_requested")
      )
    )
    .returning();
  if (!updated) fail("checkout_preparation_version_conflict");
  return mapClientCheckoutPreparationRow(updated);
}

async function markUnknown(
  transaction: FinanceTransaction,
  command: BaseCommand
): Promise<ClientCheckoutPreparation> {
  await lockRequestedPreparation(transaction, command);
  const [updated] = await transaction
    .update(financeClientCheckoutPreparations)
    .set({ state: "provider_session_unknown", version: String(command.expectedVersion + 1) })
    .where(
      and(
        eq(financeClientCheckoutPreparations.id, command.checkoutPreparationId),
        eq(financeClientCheckoutPreparations.version, String(command.expectedVersion)),
        eq(financeClientCheckoutPreparations.state, "checkout_requested")
      )
    )
    .returning();
  if (!updated) fail("checkout_preparation_version_conflict");
  return mapClientCheckoutPreparationRow(updated);
}

async function failPreparation(
  transaction: FinanceTransaction,
  command: FailureCommand
): Promise<ClientCheckoutPreparation> {
  await lockRequestedPreparation(transaction, command);
  const [updated] = await transaction
    .update(financeClientCheckoutPreparations)
    .set({
      state: "failed",
      version: String(command.expectedVersion + 1),
      failureCode: command.failureCode
    })
    .where(
      and(
        eq(financeClientCheckoutPreparations.id, command.checkoutPreparationId),
        eq(financeClientCheckoutPreparations.version, String(command.expectedVersion)),
        eq(financeClientCheckoutPreparations.state, "checkout_requested")
      )
    )
    .returning();
  if (!updated) fail("checkout_preparation_version_conflict");
  return mapClientCheckoutPreparationRow(updated);
}

async function lockRequestedPreparation(
  transaction: FinanceTransaction,
  command: BaseCommand
): Promise<typeof financeClientCheckoutPreparations.$inferSelect> {
  const [row] = await transaction
    .select()
    .from(financeClientCheckoutPreparations)
    .where(eq(financeClientCheckoutPreparations.id, command.checkoutPreparationId))
    .limit(1)
    .for("update");
  if (!row) fail("checkout_preparation_not_found");
  if (row.providerOperationIntentId !== command.providerOperationIntentId) {
    fail("provider_operation_correlation_conflict");
  }
  if (positiveVersion(row.version) !== command.expectedVersion) {
    fail("checkout_preparation_version_conflict");
  }
  if (row.state !== "checkout_requested") fail("checkout_preparation_transition_conflict");
  return row;
}

async function validateResponseArtifact(
  transaction: FinanceTransaction,
  preparation: typeof financeClientCheckoutPreparations.$inferSelect,
  command: ReadyCommand
): Promise<void> {
  const [row] = await transaction
    .select({ artifact: financeArtifacts, operation: financeProviderOperationIntents })
    .from(financeProviderOperationIntents)
    .innerJoin(financeArtifacts, eq(financeArtifacts.id, command.responseArtifactId))
    .where(eq(financeProviderOperationIntents.id, preparation.providerOperationIntentId))
    .limit(1)
    .for("share", { of: financeArtifacts });
  if (
    !row ||
    row.operation.economicPaymentIntentId !== preparation.economicPaymentIntentId ||
    row.operation.economicPaymentSessionId !== preparation.economicPaymentSessionId ||
    row.operation.operationKind !== "checkout_session_create" ||
    row.artifact.artifactClass !== "provider_response" ||
    row.artifact.bindingKind !== "provider" ||
    row.artifact.seriesId !== row.operation.seriesId ||
    row.artifact.providerAccountId !== row.operation.providerAccountId ||
    row.artifact.providerIdentityVersion !== row.operation.providerIdentityVersion ||
    row.artifact.sha256Digest !== command.responseArtifactDigest
  ) {
    fail("response_artifact_conflict");
  }
}

export function mapClientCheckoutPreparationRow(
  row: typeof financeClientCheckoutPreparations.$inferSelect
): ClientCheckoutPreparation {
  const requested = createClientCheckoutPreparation({
    checkoutPreparationId: row.id,
    orderId: row.orderId,
    clientUserId: row.clientUserId,
    economicPaymentIntentId: row.economicPaymentIntentId,
    economicPaymentSessionId: row.economicPaymentSessionId,
    providerOperationIntentId: row.providerOperationIntentId,
    requestArtifactId: row.requestArtifactId,
    requestArtifactDigest: digest(row.requestArtifactDigest)
  });
  const version = positiveVersion(row.version);
  if (row.state === "checkout_requested" && version === 1) return requested;
  if (row.state === "checkout_ready" && version === 2) {
    return publishClientCheckoutReady(requested, {
      providerCheckoutId: row.providerCheckoutId ?? "",
      responseArtifactId: row.responseArtifactId ?? "",
      responseArtifactDigest: digest(row.responseArtifactDigest ?? "")
    });
  }
  if (row.state === "provider_session_unknown" && version === 2) {
    return recordClientCheckoutProviderSessionUnknown(requested);
  }
  if (row.state === "failed" && version === 2) {
    return failClientCheckoutPreparation(requested, row.failureCode ?? "");
  }
  fail("persistence_write_incomplete");
}

function normalizeReadyCommand(command: PublishClientCheckoutReadyCommand): ReadyCommand {
  assertExactKeys(command, [
    "checkoutPreparationId",
    "providerOperationIntentId",
    "expectedVersion",
    "providerCheckoutId",
    "responseArtifactId",
    "responseArtifactDigest"
  ]);
  return Object.freeze({
    ...normalizeBaseCommand(command),
    providerCheckoutId: uuid(command.providerCheckoutId),
    responseArtifactId: identifier(command.responseArtifactId),
    responseArtifactDigest: digest(command.responseArtifactDigest)
  });
}

function normalizeUnknownCommand(
  command: MarkClientCheckoutProviderSessionUnknownCommand
): BaseCommand {
  assertExactKeys(command, [
    "checkoutPreparationId",
    "providerOperationIntentId",
    "expectedVersion"
  ]);
  return normalizeBaseCommand(command);
}

function normalizeFailureCommand(command: FailClientCheckoutPreparationCommand): FailureCommand {
  assertExactKeys(command, [
    "checkoutPreparationId",
    "providerOperationIntentId",
    "expectedVersion",
    "failureCode"
  ]);
  return Object.freeze({
    ...normalizeBaseCommand(command),
    failureCode: failureCode(command.failureCode)
  });
}

function normalizeBaseCommand(command: BaseCommand): BaseCommand {
  return Object.freeze({
    checkoutPreparationId: uuid(command.checkoutPreparationId),
    providerOperationIntentId: uuid(command.providerOperationIntentId),
    expectedVersion: expectedVersion(command.expectedVersion)
  });
}

function expectedVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("invalid_command");
  }
  return value;
}

function positiveVersion(value: unknown): number {
  const decoded = decodeFinancePositiveRevision(value);
  const parsed = Number(decoded);
  if (!Number.isSafeInteger(parsed)) fail("invalid_command");
  return parsed;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

function failureCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9_]{1,100}$/.test(value)) fail("invalid_command");
  return value;
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

function fail(reason: ClientCheckoutPreparationPersistenceReason): never {
  throw new ClientCheckoutPreparationPersistenceError(reason);
}
