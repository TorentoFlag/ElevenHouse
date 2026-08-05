/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type CompleteSavedCardSetupThreeDsMethodCommand,
  type PersistedProviderDispatchReceipt,
  type SavedCardSetupThreeDsMethodCompletionUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import { financeTransientSecretRefs } from "../../schema/finance/provider-credentials.schema";
import { financeProviderOperationIntents } from "../../schema/finance/provider-operations.schema";
import { financeSavedCardSetupCustomerActions } from "../../schema/finance/saved-card-setup-actions.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { registerSealedArtifactInTransaction } from "./finance-artifact-registry";
import { persistProviderOperationBeforeIoInTransaction } from "./drizzle-provider-operation-intent-creation-uow";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type SavedCardSetupThreeDsMethodCompletionPersistenceReason =
  | "invalid_command"
  | "setup_session_not_awaiting_method"
  | "customer_action_conflict"
  | "provider_operation_conflict"
  | "economic_payment_conflict"
  | "three_ds_context_not_available"
  | "dispatch_artifact_conflict"
  | "retryable_concurrency_conflict";

export class SavedCardSetupThreeDsMethodCompletionPersistenceError extends Error {
  readonly code = "saved_card_setup_three_ds_method_completion_persistence_error" as const;

  constructor(readonly reason: SavedCardSetupThreeDsMethodCompletionPersistenceReason) {
    super("Saved-card 3DS Method completion could not be committed safely");
  }
}

/**
 * Consumes one owner-authorized 3DS Method handoff and commits the only matching ArcPay call
 * before I/O. The server transaction ID remains in the sealed response artifact; the browser
 * supplies only the completion indicator.
 */
export function createDrizzleSavedCardSetupThreeDsMethodCompletionUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): SavedCardSetupThreeDsMethodCompletionUnitOfWork {
  return Object.freeze({
    async completeThreeDsMethod(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => complete(transaction, normalized));
      } catch (error) {
        if (error instanceof SavedCardSetupThreeDsMethodCompletionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("customer_action_conflict");
        throw error;
      }
    }
  } satisfies SavedCardSetupThreeDsMethodCompletionUnitOfWork);
}

async function complete<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  command: CompleteSavedCardSetupThreeDsMethodCommand
): Promise<PersistedProviderDispatchReceipt> {
  const [session] = await transaction.select().from(financeSavedCardSetupSessions)
    .where(eq(financeSavedCardSetupSessions.id, command.setupSessionId)).limit(1).for("update");
  if (
    !session || session.state !== "requires_customer_action" ||
    session.version !== command.expectedSetupSessionVersion ||
    session.economicPaymentIntentId === null || session.providerSetupId === null ||
    session.threeDsMethodContextSecretRefId === null
  ) fail("setup_session_not_awaiting_method");

  const [action] = await transaction.select().from(financeSavedCardSetupCustomerActions)
    .where(and(eq(financeSavedCardSetupCustomerActions.id, command.customerActionId), eq(financeSavedCardSetupCustomerActions.setupSessionId, session.id)))
    .limit(1).for("update");
  if (
    !action || action.status !== "pending" || action.actionType !== "three_ds_method" || action.phase !== "method" ||
    action.setupSessionVersion !== String(session.version)
  ) fail("customer_action_conflict");

  const [priorOperation] = await transaction.select().from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, action.providerOperationIntentId)).limit(1).for("update");
  if (
    !priorOperation || priorOperation.status !== "requires_customer_action" ||
    priorOperation.version !== action.providerOperationIntentVersion ||
    priorOperation.operationKind !== "card_setup_execute" || priorOperation.dispatchStep !== "execute" ||
    priorOperation.purpose !== "platform_card_setup" || priorOperation.sourceId !== session.id ||
    priorOperation.economicPaymentIntentId !== session.economicPaymentIntentId ||
    priorOperation.economicPaymentSessionId === null ||
    priorOperation.seriesId !== session.seriesId || priorOperation.providerAccountId !== session.providerAccountId ||
    priorOperation.providerIdentityVersion !== session.providerIdentityVersion
  ) fail("provider_operation_conflict");

  const [economic] = await transaction.select().from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, session.economicPaymentIntentId)).limit(1).for("share");
  if (!economic) fail("economic_payment_conflict");
  const economicVersion = decimalVersion(economic.version);
  if (economicVersion === null || economic.purpose !== "platform_card_setup" || economic.sourceId !== session.id || economic.amountMinor !== "0" || economic.currency !== "RUB") {
    fail("economic_payment_conflict");
  }
  const expectedEconomicPaymentVersion = economicVersion;

  const [context] = await transaction.select().from(financeTransientSecretRefs)
    .where(eq(financeTransientSecretRefs.secretRefId, session.threeDsMethodContextSecretRefId)).limit(1).for("update");
  const now = new Date();
  if (!context || context.seriesId !== session.seriesId || context.providerAccountId !== session.providerAccountId ||
    context.providerIdentityVersion !== session.providerIdentityVersion || context.providerSetupId !== session.providerSetupId ||
    context.providerExpiresAt.getTime() <= now.getTime()) fail("three_ds_context_not_available");

  const envelope = createProviderDispatchEnvelope({
    kind: "card_setup", step: "complete_3ds_method", providerSetupId: session.providerSetupId,
    setupExternalId: session.id, customerActionId: action.id, completionIndicator: command.completionIndicator,
    threeDsMethodContextSecret: {
      kind: "sealed_one_time_provider_secret_ref", secretRef: context.sealedSecretRef,
      providerExpiresAt: context.providerExpiresAt.toISOString().replace(/\.000Z$/, "Z"), providerConsumption: "one_time"
    }
  });
  if (envelope.kind !== "card_setup" || envelope.step !== "complete_3ds_method") {
    fail("dispatch_artifact_conflict");
  }
  const artifact = await registerSealedArtifactInTransaction(transaction as never, {
    artifact: command.dispatchArtifact, artifactClass: "provider_request",
    binding: { kind: "provider", providerAccount: { seriesId: session.seriesId, providerAccountId: session.providerAccountId, identityVersion: session.providerIdentityVersion } },
    contentType: command.dispatchPrivateObject.contentType, privateObject: command.dispatchPrivateObject,
    retentionPolicyId: command.retentionPolicyId, retentionPolicyVersion: command.retentionPolicyVersion
  });
  if ("bankCashPoolId" in artifact || artifact.sha256Digest !== digestFinanceCanonicalValueV1(envelope)) fail("dispatch_artifact_conflict");

  const receipt = await persistProviderOperationBeforeIoInTransaction(transaction, {
    providerOperationIntentId: command.providerOperationIntentId,
    economicPaymentIntentId: session.economicPaymentIntentId,
    expectedEconomicPaymentVersion,
    expectedProviderOperationSourceVersion: 0,
    economicPaymentSessionId: priorOperation.economicPaymentSessionId,
    providerAccount: { seriesId: session.seriesId, providerAccountId: session.providerAccountId, identityVersion: session.providerIdentityVersion },
    operationKind: "card_setup_3ds_method_complete", dispatchEnvelope: envelope,
    dispatchAuthorization: {
      kind: "platform_card_setup_authorization", authorityId: `saved-card-setup-method:${session.id}:${action.id}`,
      authorityVersion: "1", sourceId: session.id,
      authorityDigest: digestFinanceCanonicalValueV1({ setupSessionId: session.id, consentId: session.consentId, consentVersion: session.consentVersion, actionId: action.id, actionResponseDigest: action.providerResponseArtifactDigest, completionIndicator: command.completionIndicator, contextSecretRefId: context.secretRefId }),
      setupSessionId: session.id, setupConsentId: session.consentId, setupConsentVersion: Number(session.consentVersion)
    } as never,
    dispatchArtifact: artifact, replacementAuthority: null, idempotencyKey: command.idempotencyKey,
    idempotencyRetentionDeadline: command.idempotencyRetentionDeadline, operationEnvelope: command.operationEnvelope
  });

  const [resolvedAction] = await transaction.update(financeSavedCardSetupCustomerActions)
    .set({ status: "completed", resolvedAt: sql`clock_timestamp()` })
    .where(and(eq(financeSavedCardSetupCustomerActions.id, action.id), eq(financeSavedCardSetupCustomerActions.status, "pending")))
    .returning({ id: financeSavedCardSetupCustomerActions.id });
  if (!resolvedAction) fail("customer_action_conflict");
  const [updatedSession] = await transaction.update(financeSavedCardSetupSessions)
    .set({ state: "execution_pending", version: session.version + 1, updatedAt: sql`clock_timestamp()` })
    .where(and(eq(financeSavedCardSetupSessions.id, session.id), eq(financeSavedCardSetupSessions.state, "requires_customer_action"), eq(financeSavedCardSetupSessions.version, session.version)))
    .returning({ id: financeSavedCardSetupSessions.id });
  if (!updatedSession) fail("setup_session_not_awaiting_method");
  return receipt;
}

function normalize(value: CompleteSavedCardSetupThreeDsMethodCommand): CompleteSavedCardSetupThreeDsMethodCommand {
  if (!uuid(value.setupSessionId) || !positive(value.expectedSetupSessionVersion) || !uuid(value.customerActionId) ||
    (value.completionIndicator !== "Y" && value.completionIndicator !== "N" && value.completionIndicator !== "U") ||
    !uuid(value.providerOperationIntentId) || !text(value.idempotencyKey) || !instant(value.idempotencyRetentionDeadline) ||
    !text(value.dispatchArtifact.artifactId) || !/^sha256:[a-f0-9]{64}$/.test(value.dispatchArtifact.sha256Digest) ||
    !positive(value.dispatchArtifact.byteLength) || !text(value.retentionPolicyId) || !text(value.retentionPolicyVersion)) fail("invalid_command");
  return value;
}
function decimalVersion(value: string): number | null { if (!/^[1-9][0-9]*$/.test(value)) return null; const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : null; }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1; }
function instant(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: SavedCardSetupThreeDsMethodCompletionPersistenceReason): never { throw new SavedCardSetupThreeDsMethodCompletionPersistenceError(reason); }
