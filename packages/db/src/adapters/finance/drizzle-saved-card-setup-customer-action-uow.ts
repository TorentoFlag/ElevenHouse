/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  type RecordSavedCardSetupCustomerActionCommand,
  type SavedCardSetupCustomerActionReceipt,
  type SavedCardSetupCustomerActionUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financeProviderOperationIntents } from "../../schema/finance/provider-operations.schema";
import { financeSavedCardSetupCustomerActions } from "../../schema/finance/saved-card-setup-actions.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";

export type SavedCardSetupCustomerActionPersistenceReason =
  | "invalid_command"
  | "setup_session_not_execution_pending"
  | "economic_payment_conflict"
  | "provider_operation_conflict"
  | "response_artifact_conflict"
  | "setup_session_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SavedCardSetupCustomerActionPersistenceError extends Error {
  readonly code = "saved_card_setup_customer_action_persistence_error" as const;

  constructor(readonly reason: SavedCardSetupCustomerActionPersistenceReason) {
    super("Saved-card customer action could not be persisted safely");
  }
}

/**
 * Moves both the setup coordinator and its exact execute operation to a durable non-terminal
 * customer-action state. It intentionally creates no provider result and no credential: only a
 * later canonical provider result is allowed to do that.
 */
export function createDrizzleSavedCardSetupCustomerActionUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): SavedCardSetupCustomerActionUnitOfWork {
  return Object.freeze({
    async recordCustomerAction(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => record(transaction, normalized));
      } catch (error) {
        if (error instanceof SavedCardSetupCustomerActionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("provider_operation_conflict");
        throw error;
      }
    }
  } satisfies SavedCardSetupCustomerActionUnitOfWork);
}

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];
type Command = RecordSavedCardSetupCustomerActionCommand;

async function record<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  command: Command
): Promise<SavedCardSetupCustomerActionReceipt> {
  const [session] = await transaction
    .select()
    .from(financeSavedCardSetupSessions)
    .where(eq(financeSavedCardSetupSessions.id, command.setupSessionId))
    .limit(1)
    .for("update");
  if (!session || session.state !== "execution_pending" || session.version !== command.expectedSetupSessionVersion) {
    fail("setup_session_not_execution_pending");
  }
  if (
    session.economicPaymentIntentId !== command.economicPaymentIntentId ||
    session.providerSetupId !== command.providerSetupId ||
    session.seriesId !== command.providerAccount.seriesId ||
    session.providerAccountId !== command.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== command.providerAccount.identityVersion
  ) {
    fail("economic_payment_conflict");
  }

  const [operation] = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, command.providerOperationIntentId))
    .limit(1)
    .for("update");
  if (
    !operation ||
    operation.status !== "pending_dispatch" ||
    operation.version !== String(command.expectedProviderOperationIntentVersion) ||
    !(
      (operation.operationKind === "card_setup_execute" && operation.dispatchStep === "execute") ||
      (operation.operationKind === "card_setup_3ds_method_complete" && operation.dispatchStep === "complete_3ds_method")
    ) ||
    operation.purpose !== "platform_card_setup" ||
    operation.sourceId !== session.id ||
    operation.economicPaymentIntentId !== session.economicPaymentIntentId ||
    operation.correlatedEconomicPaymentVersion !== String(command.expectedEconomicPaymentVersion) ||
    operation.seriesId !== session.seriesId ||
    operation.providerAccountId !== session.providerAccountId ||
    operation.providerIdentityVersion !== session.providerIdentityVersion
  ) {
    fail("provider_operation_conflict");
  }
  if (operation.operationKind === "card_setup_3ds_method_complete" && command.actionType !== "three_ds_challenge") {
    fail("provider_operation_conflict");
  }

  const [artifact] = await transaction
    .select()
    .from(financeArtifacts)
    .where(eq(financeArtifacts.id, command.responseArtifact.artifactId))
    .limit(1)
    .for("share");
  if (
    !artifact ||
    artifact.artifactClass !== "provider_response" ||
    artifact.bindingKind !== "provider" ||
    artifact.sha256Digest !== command.responseArtifact.sha256Digest ||
    artifact.byteLength !== String(command.responseArtifact.byteLength) ||
    artifact.seriesId !== session.seriesId ||
    artifact.providerAccountId !== session.providerAccountId ||
    artifact.providerIdentityVersion !== session.providerIdentityVersion
  ) {
    fail("response_artifact_conflict");
  }

  const nextOperationVersion = command.expectedProviderOperationIntentVersion + 1;
  const nextSessionVersion = command.expectedSetupSessionVersion + 1;
  const [action] = await transaction
    .insert(financeSavedCardSetupCustomerActions)
    .values({
      setupSessionId: session.id,
      setupSessionVersion: String(nextSessionVersion),
      providerOperationIntentId: operation.id,
      providerOperationIntentVersion: String(nextOperationVersion),
      providerResponseArtifactId: artifact.id,
      providerResponseArtifactDigest: artifact.sha256Digest,
      actionType: command.actionType,
      phase: command.phase,
      status: "pending"
    })
    .returning({ id: financeSavedCardSetupCustomerActions.id });
  if (!action) fail("persistence_write_incomplete");

  const [updatedOperation] = await transaction
    .update(financeProviderOperationIntents)
    .set({
      status: "requires_customer_action",
      version: String(nextOperationVersion),
      providerUnknownObservedAt: null,
      terminalAt: null,
      updatedAt: sql`clock_timestamp()`
    })
    .where(
      and(
        eq(financeProviderOperationIntents.id, operation.id),
        eq(financeProviderOperationIntents.status, "pending_dispatch"),
        eq(financeProviderOperationIntents.version, operation.version)
      )
    )
    .returning({ id: financeProviderOperationIntents.id, version: financeProviderOperationIntents.version });
  if (!updatedOperation || updatedOperation.version !== String(nextOperationVersion)) {
    fail("provider_operation_conflict");
  }

  const [updatedSession] = await transaction
    .update(financeSavedCardSetupSessions)
    .set({
      state: "requires_customer_action",
      version: nextSessionVersion,
      updatedAt: sql`clock_timestamp()`
    })
    .where(
      and(
        eq(financeSavedCardSetupSessions.id, session.id),
        eq(financeSavedCardSetupSessions.state, "execution_pending"),
        eq(financeSavedCardSetupSessions.version, session.version)
      )
    )
    .returning({ id: financeSavedCardSetupSessions.id, version: financeSavedCardSetupSessions.version });
  if (!updatedSession || updatedSession.version !== nextSessionVersion) fail("setup_session_conflict");
  return Object.freeze({
    kind: "saved_card_setup_customer_action_receipt" as const,
    setupSessionId: updatedSession.id,
    setupSessionVersion: updatedSession.version,
    providerOperationIntentId: operation.id,
    providerOperationIntentVersion: nextOperationVersion,
    state: "requires_customer_action" as const
  });
}

function normalize(value: Command): Command {
  if (
    !uuid(value.setupSessionId) ||
    !identifier(value.economicPaymentIntentId) ||
    !uuid(value.providerOperationIntentId) ||
    !uuid(value.providerSetupId) ||
    !positive(value.expectedSetupSessionVersion) ||
    !nonnegative(value.expectedEconomicPaymentVersion) ||
    !nonnegative(value.expectedProviderOperationIntentVersion) ||
    !identifier(value.providerAccount.seriesId) ||
    !identifier(value.providerAccount.providerAccountId) ||
    !positive(value.providerAccount.identityVersion) ||
    !identifier(value.responseArtifact.artifactId) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.responseArtifact.sha256Digest) ||
    !nonnegative(value.responseArtifact.byteLength) ||
    (value.actionType !== "three_ds_method" && value.actionType !== "three_ds_challenge") ||
    (value.phase !== "method" && value.phase !== "challenge") ||
    (value.actionType === "three_ds_method" && value.phase !== "method") ||
    (value.actionType === "three_ds_challenge" && value.phase !== "challenge") ||
    Number.isNaN(Date.parse(value.observedAt))
  ) {
    fail("invalid_command");
  }
  return value;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}
function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
}
function fail(reason: SavedCardSetupCustomerActionPersistenceReason): never {
  throw new SavedCardSetupCustomerActionPersistenceError(reason);
}
