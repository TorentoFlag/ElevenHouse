import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type PrepareSavedCardSetupCommand,
  type SavedCardSetupPreparationReceipt,
  type SavedCardSetupPreparationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { createEconomicPaymentIntentInTransaction } from "./drizzle-economic-payment-intent-creation-uow";
import { openEconomicPaymentSessionInTransaction } from "./drizzle-economic-payment-session-open-uow";
import { persistProviderOperationBeforeIoInTransaction } from "./drizzle-provider-operation-intent-creation-uow";
import { registerSealedArtifactInTransaction } from "./finance-artifact-registry";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<Parameters<NodePgDatabase<TSchema>["transaction"]>[0]>[0];

export class SavedCardSetupPreparationPersistenceError extends Error {
  readonly code = "saved_card_setup_preparation_persistence_error" as const;
  constructor(readonly reason: "invalid_command" | "setup_session_not_requested" | "setup_session_conflict" | "retryable_concurrency_conflict" | "persistence_write_incomplete") { super("Saved-card setup could not be prepared before provider I/O"); }
}

export function createDrizzleSavedCardSetupPreparationUnitOfWork<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): SavedCardSetupPreparationUnitOfWork {
  return Object.freeze({
    async prepareSavedCardSetup(command) {
      const normalized = normalize(command);
      try { return await input.database.transaction((transaction) => prepare(transaction, normalized)); }
      catch (error) {
        if (error instanceof SavedCardSetupPreparationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        throw error;
      }
    }
  } satisfies SavedCardSetupPreparationUnitOfWork);
}

async function prepare<TSchema extends Record<string, unknown>>(transaction: Transaction<TSchema>, command: PrepareSavedCardSetupCommand): Promise<SavedCardSetupPreparationReceipt> {
  const [session] = await transaction.select().from(financeSavedCardSetupSessions).where(eq(financeSavedCardSetupSessions.id, command.setupSessionId)).limit(1).for("update");
  if (!session) fail("setup_session_not_requested");
  if (session.state === "preparation_pending") {
    if (session.economicPaymentIntentId !== command.economicPaymentIntentId) fail("setup_session_conflict");
    return receipt(session.id, Number(session.version), command.economicPaymentIntentId, command.providerOperationIntentId);
  }
  if (session.state !== "setup_requested" || session.economicPaymentIntentId !== null || session.version !== 1) fail("setup_session_not_requested");
  if (session.seriesId !== command.providerAccount.seriesId || session.providerAccountId !== command.providerAccount.providerAccountId || session.providerIdentityVersion !== command.providerAccount.identityVersion) fail("setup_session_conflict");
  const envelope = createProviderDispatchEnvelope(command.dispatchEnvelope);
  if (envelope.kind !== "card_setup" || envelope.step !== "create" || envelope.setupExternalId !== session.id || envelope.customerId !== session.providerCustomerId) fail("invalid_command");
  const sourceId = session.id;
  const intent = await createEconomicPaymentIntentInTransaction(transaction, { economicPaymentIntentId: command.economicPaymentIntentId, sourceId, purpose: "platform_card_setup", providerAccount: command.providerAccount, amountMinor: "0", currency: "RUB", expectedSourceUniquenessVersion: 0 });
  const paymentSession = await openEconomicPaymentSessionInTransaction(transaction, { economicPaymentIntentId: intent.economicPaymentHead.economicPaymentIntentId, economicPaymentSessionId: command.economicPaymentSessionId, expectedEconomicPaymentVersion: 1, providerAccount: command.providerAccount });
  const artifact = await registerSealedArtifactInTransaction(transaction as never, { artifact: command.dispatchArtifact, artifactClass: "provider_request", binding: { kind: "provider", providerAccount: command.providerAccount }, contentType: command.dispatchPrivateObject.contentType, privateObject: command.dispatchPrivateObject, retentionPolicyId: command.retentionPolicyId, retentionPolicyVersion: command.retentionPolicyVersion });
  if ("bankCashPoolId" in artifact) fail("persistence_write_incomplete");
  const authorization = Object.freeze({ kind: "platform_card_setup_authorization" as const, authorityId: `saved-card-setup:${session.id}`, authorityVersion: "1", authorityDigest: digestFinanceCanonicalValueV1({ setupSessionId: session.id, consentId: session.consentId, consentVersion: session.consentVersion, economicPaymentIntentId: command.economicPaymentIntentId }), sourceId: session.id, setupSessionId: session.id, setupConsentId: session.consentId, setupConsentVersion: Number(session.consentVersion) }) as never;
  await persistProviderOperationBeforeIoInTransaction(transaction, { providerOperationIntentId: command.providerOperationIntentId, economicPaymentIntentId: command.economicPaymentIntentId, expectedEconomicPaymentVersion: paymentSession.economicPaymentHead.version, expectedProviderOperationSourceVersion: 0, economicPaymentSessionId: command.economicPaymentSessionId, providerAccount: command.providerAccount, operationKind: "card_setup", dispatchEnvelope: envelope, dispatchAuthorization: authorization, dispatchArtifact: artifact, replacementAuthority: null, idempotencyKey: command.idempotencyKey, idempotencyRetentionDeadline: command.idempotencyRetentionDeadline, operationEnvelope: command.operationEnvelope });
  const [updated] = await transaction.update(financeSavedCardSetupSessions).set({ state: "preparation_pending", version: 2, economicPaymentIntentId: command.economicPaymentIntentId, updatedAt: sql`clock_timestamp()` }).where(and(eq(financeSavedCardSetupSessions.id, session.id), eq(financeSavedCardSetupSessions.state, "setup_requested"), eq(financeSavedCardSetupSessions.version, 1))).returning({ id: financeSavedCardSetupSessions.id, version: financeSavedCardSetupSessions.version });
  if (!updated) fail("setup_session_conflict");
  return receipt(updated.id, updated.version, command.economicPaymentIntentId, command.providerOperationIntentId);
}

function receipt(setupSessionId: string, setupSessionVersion: number, economicPaymentIntentId: string, providerOperationIntentId: string): SavedCardSetupPreparationReceipt { return Object.freeze({ kind: "saved_card_setup_preparation_receipt" as const, setupSessionId, setupSessionVersion, economicPaymentIntentId, providerOperationIntentId }); }
function normalize(value: PrepareSavedCardSetupCommand): PrepareSavedCardSetupCommand { if (!uuid(value.setupSessionId) || !uuid(value.economicPaymentIntentId) || !uuid(value.economicPaymentSessionId) || !uuid(value.providerOperationIntentId) || !uuid(value.dispatchEnvelope.setupExternalId) || !value.idempotencyKey.trim() || Number.isNaN(Date.parse(value.idempotencyRetentionDeadline))) fail("invalid_command"); return value; }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function postgresCode(error: unknown) { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: SavedCardSetupPreparationPersistenceError["reason"]): never { throw new SavedCardSetupPreparationPersistenceError(reason); }
