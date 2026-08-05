/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type ExecuteSavedCardSetupCommand,
  type SavedCardSetupExecutionReceipt,
  type SavedCardSetupExecutionUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeEconomicPaymentIntents } from "../../schema/finance/economic-payments.schema";
import { financeTransientSecretRefs } from "../../schema/finance/provider-credentials.schema";
import { financeProviderOperationIntents } from "../../schema/finance/provider-operations.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { registerSealedArtifactInTransaction } from "./finance-artifact-registry";
import { persistProviderOperationBeforeIoInTransaction } from "./drizzle-provider-operation-intent-creation-uow";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type SavedCardSetupExecutionPersistenceReason =
  | "invalid_command"
  | "setup_session_not_tokenizable"
  | "setup_session_conflict"
  | "economic_payment_not_found"
  | "transient_secret_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SavedCardSetupExecutionPersistenceError extends Error {
  readonly code = "saved_card_setup_execution_persistence_error" as const;

  constructor(readonly reason: SavedCardSetupExecutionPersistenceReason) {
    super("Saved-card setup execution could not be committed before provider I/O");
  }
}

/**
 * Commits the opaque KMS token reference, its one-time consumption and the ArcPay execute
 * operation in one PostgreSQL transaction. The browser token itself is never accepted by this
 * adapter and therefore can never reach the database or outbox payload.
 */
export function createDrizzleSavedCardSetupExecutionUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): SavedCardSetupExecutionUnitOfWork {
  return Object.freeze({
    async executeSavedCardSetup(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => execute(transaction, normalized));
      } catch (error) {
        if (error instanceof SavedCardSetupExecutionPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("transient_secret_conflict");
        throw error;
      }
    }
  } satisfies SavedCardSetupExecutionUnitOfWork);
}

async function execute<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>,
  command: ExecuteSavedCardSetupCommand
): Promise<SavedCardSetupExecutionReceipt> {
  const [session] = await transaction
    .select()
    .from(financeSavedCardSetupSessions)
    .where(eq(financeSavedCardSetupSessions.id, command.setupSessionId))
    .limit(1)
    .for("update");
  if (!session) fail("setup_session_not_tokenizable");

  if (session.state === "execution_pending") {
    if (session.version !== command.expectedSetupSessionVersion + 1) fail("setup_session_conflict");
    return receipt(session.id, session.version, command.providerOperationIntentId);
  }
  if (
    session.state !== "tokenization_required" ||
    session.version !== command.expectedSetupSessionVersion ||
    session.economicPaymentIntentId === null ||
    session.providerSetupId === null ||
    session.providerSetupId !== command.providerSetupId ||
    session.providerCustomerId !== command.providerCustomerId ||
    session.seriesId !== command.providerAccount.seriesId ||
    session.providerAccountId !== command.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== command.providerAccount.identityVersion
  ) {
    fail("setup_session_not_tokenizable");
  }

  const [economicIntent] = await transaction
    .select({
      id: financeEconomicPaymentIntents.id,
      version: financeEconomicPaymentIntents.version,
      purpose: financeEconomicPaymentIntents.purpose,
      sourceId: financeEconomicPaymentIntents.sourceId,
      amountMinor: financeEconomicPaymentIntents.amountMinor,
      currency: financeEconomicPaymentIntents.currency
    })
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, session.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (
    !economicIntent ||
    economicIntent.purpose !== "platform_card_setup" ||
    economicIntent.sourceId !== session.id ||
    economicIntent.amountMinor !== "0" ||
    economicIntent.currency !== "RUB" ||
    !/^[1-9][0-9]*$/.test(economicIntent.version)
  ) {
    fail("economic_payment_not_found");
  }
  const expectedEconomicPaymentVersion = Number(economicIntent.version);
  if (!Number.isSafeInteger(expectedEconomicPaymentVersion)) fail("economic_payment_not_found");

  const [creationOperation] = await transaction
    .select({ economicPaymentSessionId: financeProviderOperationIntents.economicPaymentSessionId })
    .from(financeProviderOperationIntents)
    .where(
      and(
        eq(financeProviderOperationIntents.economicPaymentIntentId, session.economicPaymentIntentId),
        eq(financeProviderOperationIntents.sourceId, session.id),
        eq(financeProviderOperationIntents.operationKind, "card_setup"),
        eq(financeProviderOperationIntents.dispatchStep, "create"),
        eq(financeProviderOperationIntents.status, "succeeded")
      )
    )
    .limit(1)
    .for("share");
  if (creationOperation?.economicPaymentSessionId === null || creationOperation?.economicPaymentSessionId === undefined) {
    fail("economic_payment_not_found");
  }

  const envelope = createProviderDispatchEnvelope({
    kind: "card_setup",
    step: "execute",
    customerId: session.providerCustomerId,
    providerSetupId: session.providerSetupId,
    setupExternalId: session.id,
    tokenizationSecret: command.sealedTokenizationSecret
  });
  if (envelope.kind !== "card_setup" || envelope.step !== "execute") fail("invalid_command");

  const insertedSecrets = await transaction
    .insert(financeTransientSecretRefs)
    .values([
      {
        secretRefId: command.transientSecretRefId,
        seriesId: command.providerAccount.seriesId,
        providerAccountId: command.providerAccount.providerAccountId,
        providerIdentityVersion: command.providerAccount.identityVersion,
        providerSetupId: session.providerSetupId,
        sealedSecretRef: command.sealedTokenizationSecret.secretRef,
        providerExpiresAt: new Date(command.sealedTokenizationSecret.providerExpiresAt)
      },
      {
        secretRefId: command.threeDsMethodContextSecretRefId,
        seriesId: command.providerAccount.seriesId,
        providerAccountId: command.providerAccount.providerAccountId,
        providerIdentityVersion: command.providerAccount.identityVersion,
        providerSetupId: session.providerSetupId,
        sealedSecretRef: command.sealedThreeDsMethodContext.secretRef,
        providerExpiresAt: new Date(command.sealedThreeDsMethodContext.providerExpiresAt)
      }
    ])
    .returning({ secretRefId: financeTransientSecretRefs.secretRefId });
  if (
    insertedSecrets.length !== 2 ||
    !insertedSecrets.some((secret) => secret.secretRefId === command.transientSecretRefId) ||
    !insertedSecrets.some((secret) => secret.secretRefId === command.threeDsMethodContextSecretRefId)
  ) {
    fail("persistence_write_incomplete");
  }

  const artifact = await registerSealedArtifactInTransaction(transaction as never, {
    artifact: command.dispatchArtifact,
    artifactClass: "provider_request",
    binding: { kind: "provider", providerAccount: command.providerAccount },
    contentType: command.dispatchPrivateObject.contentType,
    privateObject: command.dispatchPrivateObject,
    retentionPolicyId: command.retentionPolicyId,
    retentionPolicyVersion: command.retentionPolicyVersion
  });
  if ("bankCashPoolId" in artifact) fail("persistence_write_incomplete");

  const sourceId = session.id;
  const authorization = Object.freeze({
    kind: "platform_card_setup_authorization" as const,
    authorityId: `saved-card-setup-execute:${session.id}`,
    authorityVersion: "1",
    authorityDigest: digestFinanceCanonicalValueV1({
      setupSessionId: session.id,
      consentId: session.consentId,
      consentVersion: session.consentVersion,
      economicPaymentIntentId: session.economicPaymentIntentId,
      providerSetupId: session.providerSetupId,
      sealedTokenizationSecretRef: command.sealedTokenizationSecret.secretRef
    }),
    sourceId,
    setupSessionId: session.id,
    setupConsentId: session.consentId,
    setupConsentVersion: Number(session.consentVersion)
  }) as never;
  await persistProviderOperationBeforeIoInTransaction(transaction, {
    providerOperationIntentId: command.providerOperationIntentId,
    economicPaymentIntentId: session.economicPaymentIntentId,
    expectedEconomicPaymentVersion,
    expectedProviderOperationSourceVersion: 0,
    economicPaymentSessionId: creationOperation.economicPaymentSessionId,
    providerAccount: command.providerAccount,
    operationKind: "card_setup_execute",
    dispatchEnvelope: envelope,
    dispatchAuthorization: authorization,
    dispatchArtifact: artifact,
    replacementAuthority: null,
    idempotencyKey: command.idempotencyKey,
    idempotencyRetentionDeadline: command.idempotencyRetentionDeadline,
    operationEnvelope: command.operationEnvelope
  });

  const [updated] = await transaction
    .update(financeSavedCardSetupSessions)
    .set({
      state: "execution_pending",
      version: session.version + 1,
      threeDsMethodContextSecretRefId: command.threeDsMethodContextSecretRefId,
      updatedAt: sql`clock_timestamp()`
    })
    .where(
      and(
        eq(financeSavedCardSetupSessions.id, session.id),
        eq(financeSavedCardSetupSessions.state, "tokenization_required"),
        eq(financeSavedCardSetupSessions.version, session.version)
      )
    )
    .returning({ id: financeSavedCardSetupSessions.id, version: financeSavedCardSetupSessions.version });
  if (!updated) fail("setup_session_conflict");
  return receipt(updated.id, updated.version, command.providerOperationIntentId);
}

function normalize(value: ExecuteSavedCardSetupCommand): ExecuteSavedCardSetupCommand {
  if (
    !uuid(value.setupSessionId) ||
    !uuid(value.providerOperationIntentId) ||
    !identifier(value.transientSecretRefId) ||
    !identifier(value.threeDsMethodContextSecretRefId) ||
    value.threeDsMethodContextSecretRefId === value.transientSecretRefId ||
    !identifier(value.providerSetupId) ||
    !identifier(value.providerCustomerId) ||
    !Number.isSafeInteger(value.expectedSetupSessionVersion) ||
    value.expectedSetupSessionVersion < 1 ||
    !uuid(value.idempotencyKey) ||
    Number.isNaN(Date.parse(value.idempotencyRetentionDeadline)) ||
    value.sealedTokenizationSecret.secretRef === value.sealedThreeDsMethodContext.secretRef ||
    value.sealedTokenizationSecret.providerExpiresAt !== value.sealedThreeDsMethodContext.providerExpiresAt
  ) {
    fail("invalid_command");
  }
  return value;
}

function receipt(
  setupSessionId: string,
  setupSessionVersion: number,
  providerOperationIntentId: string
): SavedCardSetupExecutionReceipt {
  return Object.freeze({
    kind: "saved_card_setup_execution_receipt" as const,
    setupSessionId,
    setupSessionVersion,
    providerOperationIntentId,
    state: "execution_pending" as const
  });
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
}
function fail(reason: SavedCardSetupExecutionPersistenceReason): never {
  throw new SavedCardSetupExecutionPersistenceError(reason);
}
