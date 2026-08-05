/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import type {
  ActivateSavedCardCredentialCommand,
  SavedCardCredentialActivationReceipt,
  SavedCardCredentialActivationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financeRestrictedProviderCredentialActivationEvidence } from "../../schema/finance/provider-credential-activation-evidence.schema";
import {
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentialLifecycleEvents,
  financeRestrictedProviderCredentials
} from "../../schema/finance/provider-credentials.schema";
import {
  financeProviderOperationResultCommitReceipts,
  financeProviderOperationResults
} from "../../schema/finance/provider-operations.schema";
import { financeSavedCardSetupCustomerActions } from "../../schema/finance/saved-card-setup-actions.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type SavedCardCredentialActivationPersistenceReason =
  | "invalid_command"
  | "setup_session_not_activatable"
  | "setup_session_conflict"
  | "provider_result_not_verified"
  | "provider_result_correlation_conflict"
  | "canonical_directory_artifact_conflict"
  | "credential_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SavedCardCredentialActivationPersistenceError extends Error {
  readonly code = "saved_card_credential_activation_persistence_error" as const;
  constructor(readonly reason: SavedCardCredentialActivationPersistenceReason) {
    super("Verified saved-card credential could not be activated safely");
  }
}

export function createDrizzleSavedCardCredentialActivationUnitOfWork<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): SavedCardCredentialActivationUnitOfWork {
  return Object.freeze({
    async activateSavedCardCredential(command) {
      try {
        return await input.database.transaction((transaction) => activate(transaction, command));
      } catch (error) {
        if (error instanceof SavedCardCredentialActivationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("credential_conflict");
        throw error;
      }
    }
  } satisfies SavedCardCredentialActivationUnitOfWork);
}

async function activate<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>, command: ActivateSavedCardCredentialCommand
): Promise<SavedCardCredentialActivationReceipt> {
  normalize(command);
  const [session] = await transaction.select().from(financeSavedCardSetupSessions)
    .where(eq(financeSavedCardSetupSessions.id, command.setupSessionId)).limit(1).for("update");
  if (!session) fail("setup_session_not_activatable");
  if (session.state === "credential_active") {
    if (session.savedCardCredentialId !== command.credential.credentialId || session.savedCardCredentialVersion !== "1") fail("credential_conflict");
    return receipt(session.id, session.version, session.savedCardCredentialId, session.savedCardCredentialVersion, session.terminalAt);
  }
  if ((session.state !== "execution_pending" && session.state !== "requires_customer_action") || session.version !== command.expectedSetupSessionVersion || !session.economicPaymentIntentId || !session.providerSetupId) fail("setup_session_not_activatable");

  const [result] = await transaction.select({ id: financeProviderOperationResults.id })
    .from(financeProviderOperationResults)
    .innerJoin(financeProviderOperationResultCommitReceipts, eq(financeProviderOperationResultCommitReceipts.providerOperationResultId, financeProviderOperationResults.id))
    .where(and(
      eq(financeProviderOperationResults.id, command.providerResult.providerOperationResultId),
      eq(financeProviderOperationResults.providerOperationIntentId, command.providerResult.providerOperationIntentId),
      eq(financeProviderOperationResults.providerOperationIntentVersion, String(command.providerResult.providerOperationIntentVersion)),
      eq(financeProviderOperationResults.outcome, "succeeded"),
      eq(financeProviderOperationResults.providerOperationId, session.providerSetupId),
      eq(financeProviderOperationResults.providerPaymentId, session.providerSetupId),
      eq(financeProviderOperationResults.amountMinor, "0"),
      eq(financeProviderOperationResults.currency, "RUB"),
      eq(financeProviderOperationResultCommitReceipts.economicPaymentIntentId, session.economicPaymentIntentId),
      eq(financeProviderOperationResultCommitReceipts.sourceId, session.id),
      eq(financeProviderOperationResultCommitReceipts.purpose, "platform_card_setup"),
      inArray(financeProviderOperationResultCommitReceipts.operationKind, ["card_setup_execute", "card_setup_3ds_method_complete"])
    )).limit(1).for("share");
  if (!result) fail("provider_result_not_verified");

  const [artifact] = await transaction.select().from(financeArtifacts)
    .where(eq(financeArtifacts.id, command.canonicalSavedCardDirectoryArtifact.artifactId)).limit(1).for("share");
  if (!artifact || artifact.artifactClass !== "provider_canonical_read" || artifact.bindingKind !== "provider" || artifact.sha256Digest !== command.canonicalSavedCardDirectoryArtifact.sha256Digest || artifact.byteLength !== String(command.canonicalSavedCardDirectoryArtifact.byteLength) || artifact.seriesId !== session.seriesId || artifact.providerAccountId !== session.providerAccountId || artifact.providerIdentityVersion !== session.providerIdentityVersion) fail("canonical_directory_artifact_conflict");

  const version = "1";
  await transaction.insert(financeRestrictedProviderCredentials).values({
    credentialId: command.credential.credentialId, credentialVersion: version,
    seriesId: session.seriesId, providerAccountId: session.providerAccountId, providerIdentityVersion: session.providerIdentityVersion,
    providerCustomerId: session.providerCustomerId, providerCredentialFingerprint: command.credential.providerCredentialFingerprint,
    restrictedTokenHandleRef: command.credential.restrictedTokenHandleRef, displayBrand: command.credential.displayBrand,
    displayLast4: command.credential.displayLast4, displayMask: command.credential.displayMask,
    expiryMonth: command.credential.expiryMonth, expiryYear: command.credential.expiryYear,
    consentId: session.consentId, consentVersion: session.consentVersion
  });
  await transaction.insert(financeRestrictedProviderCredentialActivationEvidence).values({
    credentialId: command.credential.credentialId, credentialVersion: version, artifactId: artifact.id,
    artifactDigest: artifact.sha256Digest, observedAt: new Date(command.observedAt)
  });
  await transaction.insert(financeRestrictedProviderCredentialLifecycleEvents).values([
    { credentialId: command.credential.credentialId, credentialVersion: version, eventSequence: "1", lifecycle: "pending_activation", reasonCode: null, occurredAt: new Date(command.observedAt) },
    { credentialId: command.credential.credentialId, credentialVersion: version, eventSequence: "2", lifecycle: "active", reasonCode: null, occurredAt: new Date(command.observedAt) }
  ]);
  await transaction.insert(financeRestrictedProviderCredentialHeads).values({
    seriesId: session.seriesId, providerAccountId: session.providerAccountId, providerIdentityVersion: session.providerIdentityVersion,
    providerCustomerId: session.providerCustomerId, currentCredentialId: command.credential.credentialId, currentCredentialVersion: version,
    currentLifecycle: "active", lifecycleEventSequence: "2", headVersion: "1", updatedAt: new Date(command.observedAt)
  });
  const [updated] = await transaction.update(financeSavedCardSetupSessions).set({
    state: "credential_active", savedCardCredentialId: command.credential.credentialId, savedCardCredentialVersion: version,
    version: session.version + 1, terminalAt: new Date(command.observedAt), updatedAt: sql`clock_timestamp()`
  }).where(and(eq(financeSavedCardSetupSessions.id, session.id), eq(financeSavedCardSetupSessions.version, session.version))).returning({ id: financeSavedCardSetupSessions.id, version: financeSavedCardSetupSessions.version });
  if (!updated) fail("setup_session_conflict");
  await transaction.update(financeSavedCardSetupCustomerActions).set({ status: "completed", resolvedAt: new Date(command.observedAt) })
    .where(and(eq(financeSavedCardSetupCustomerActions.setupSessionId, session.id), eq(financeSavedCardSetupCustomerActions.status, "pending")));
  return receipt(updated.id, updated.version, command.credential.credentialId, version, new Date(command.observedAt));
}

function receipt(id: string, version: number, credentialId: string | null, credentialVersion: string | null, activatedAt: Date | null): SavedCardCredentialActivationReceipt {
  if (!credentialId || !credentialVersion || !activatedAt) fail("persistence_write_incomplete");
  return Object.freeze({ kind: "saved_card_credential_activation_receipt", setupSessionId: id, setupSessionVersion: version, savedCardCredentialId: credentialId, savedCardCredentialVersion: credentialVersion, activatedAt: activatedAt.toISOString() });
}
function normalize(value: ActivateSavedCardCredentialCommand): void { if (!uuid(value.setupSessionId) || !Number.isSafeInteger(value.expectedSetupSessionVersion) || value.expectedSetupSessionVersion < 1 || !identifier(value.credential.credentialId) || !/^kms:\/\//.test(value.credential.restrictedTokenHandleRef) || !/^sha256:[a-f0-9]{64}$/.test(value.credential.providerCredentialFingerprint) || !identifier(value.canonicalSavedCardDirectoryArtifact.artifactId) || !/^sha256:[a-f0-9]{64}$/.test(value.canonicalSavedCardDirectoryArtifact.sha256Digest) || !Number.isSafeInteger(value.canonicalSavedCardDirectoryArtifact.byteLength) || value.canonicalSavedCardDirectoryArtifact.byteLength < 1 || Number.isNaN(Date.parse(value.observedAt))) fail("invalid_command"); }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: SavedCardCredentialActivationPersistenceReason): never { throw new SavedCardCredentialActivationPersistenceError(reason); }
