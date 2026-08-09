import {
  FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT,
  assertSavedCardCredentialAuthorizationBinding,
  createFinanceProviderOperationDispatchRequestedPayload,
  createProviderAccountIdentityBinding,
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type ProviderDispatchEnvelope,
  type PersistedProviderDispatchReceipt,
  type PersistProviderOperationBeforeIoCommand,
  type ProviderDispatchAuthorizationReceipt,
  type ProviderOperationIntentCreationUnitOfWork,
  type ProviderOperationReplacementAuthority,
  type RawProviderArtifactRef,
  type ResolvedFinanceOperationEnvelope
} from "@elevenhouse/domain/finance-core";
import { and, eq, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import {
  financeArtifactTombstones,
  financeArtifacts
} from "../../schema/finance/finance-artifacts.schema";
import {
  financeRestrictedProviderCredentials,
  financeRestrictedProviderCredentialHeads,
  financeTransientSecretConsumptions,
  financeTransientSecretRefs
} from "../../schema/finance/provider-credentials.schema";
import { financeSavedCardConsentHeads } from "../../schema/finance/saved-card-consents.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import {
  financeProviderDispatchArtifacts,
  financeProviderOperationIntentCreationReceipts,
  financeProviderOperationIntents,
  financeProviderOperationResults,
  financeProviderOperationResultCommitReceipts,
  financeProviderOperationSourceHeads
} from "../../schema/finance/provider-operations.schema";
import {
  decodeFinancePositiveRevision,
  decodeFinanceUnsignedRevision,
  encodeFinanceNumeric38
} from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export const providerOperationIntentCreationWriteBoundaryValues = Object.freeze([
  "provider_operation_intent",
  "transient_secret_consumption",
  "provider_operation_source_head",
  "provider_dispatch_artifact",
  "provider_operation_creation_receipt",
  "provider_dispatch_outbox"
] as const);

export type ProviderOperationIntentCreationWriteBoundary =
  (typeof providerOperationIntentCreationWriteBoundaryValues)[number];

export type ProviderOperationIntentCreationFailureInjector = (
  boundary: ProviderOperationIntentCreationWriteBoundary
) => void | Promise<void>;

export type ProviderOperationIntentCreationPersistenceReason =
  | "invalid_command"
  | "provider_binding_not_found"
  | "provider_binding_not_active"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "economic_payment_correlation_conflict"
  | "economic_payment_session_not_found"
  | "dispatch_artifact_not_found"
  | "dispatch_artifact_conflict"
  | "source_version_conflict"
  | "operation_identity_conflict"
  | "replacement_authority_conflict"
  | "saved_card_credential_not_active"
  | "saved_card_consent_not_active"
  | "transient_secret_not_available"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ProviderOperationIntentCreationPersistenceError extends Error {
  readonly code = "provider_operation_intent_creation_persistence_error";

  constructor(readonly reason: ProviderOperationIntentCreationPersistenceReason) {
    super("Provider operation intent could not be persisted before provider I/O");
    this.name = "ProviderOperationIntentCreationPersistenceError";
  }
}

export function createDrizzleProviderOperationIntentCreationUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly afterWriteBoundary?: ProviderOperationIntentCreationFailureInjector;
}): ProviderOperationIntentCreationUnitOfWork {
  const unitOfWork = {
    async persistBeforeProviderIo(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          persistInTransaction(
            transaction,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof ProviderOperationIntentCreationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("operation_identity_conflict");
        throw error;
      }
    }
  } satisfies ProviderOperationIntentCreationUnitOfWork;
  return Object.freeze(unitOfWork);
}

/**
 * Internal composition hook for a larger PostgreSQL transaction. It retains this adapter's
 * validation, source-chain and outbox semantics, but never opens a nested transaction.
 */
export async function persistProviderOperationBeforeIoInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  command: PersistProviderOperationBeforeIoCommand,
  afterWriteBoundary: ProviderOperationIntentCreationFailureInjector = noFailureInjection
): Promise<PersistedProviderDispatchReceipt> {
  return persistInTransaction(transaction, normalizeCommand(command), afterWriteBoundary);
}

type Purpose = "client_order" | "platform_invoice" | "platform_card_setup";
type OperationKind = PersistProviderOperationBeforeIoCommand["operationKind"];
type NormalizedCommand = Readonly<{
  providerOperationIntentId: string;
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  expectedProviderOperationSourceVersion: number;
  economicPaymentSessionId: string | null;
  providerAccount: FinanceProviderAccountIdentity;
  purpose: Purpose | null;
  sourceId: string;
  operationKind: OperationKind;
  dispatchEnvelope: ProviderDispatchEnvelope;
  dispatchStep: "create" | "execute" | "complete_3ds_method" | null;
  canonicalRequestDigest: FinanceDigest;
  dispatchArtifact: RawProviderArtifactRef;
  replacementAuthority: ProviderOperationReplacementAuthority | null;
  replacementAuthorityDigest: FinanceDigest | null;
  dispatchAuthorization: ProviderDispatchAuthorizationReceipt;
  authorizationVersion: string;
  idempotencyKey: string;
  idempotencyRetentionDeadline: Date;
  restrictedCredentialId: string | null;
  restrictedCredentialVersion: string | null;
  sealedTransientSecretRef: string | null;
  transientProviderSetupId: string | null;
  transientProviderExpiresAt: Date | null;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

type ResolvedCommand = Readonly<Omit<NormalizedCommand, "purpose"> & { purpose: Purpose }>;

type LockedProviderAccount = Readonly<{
  provider: string;
  merchantTenantId: string;
  terminalScope: string;
  settlementScope: string;
  activeIdentityVersion: number;
}>;

async function persistInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  afterWriteBoundary: ProviderOperationIntentCreationFailureInjector
): Promise<PersistedProviderDispatchReceipt> {
  const provider = await lockExactProviderBinding(transaction, command.providerAccount);
  await lockOperationIdentity(transaction, command);
  const economicIntent = await lockEconomicIntent(transaction, command);

  const existing = await findExistingOperation(transaction, command);
  if (existing) {
    return replayExistingOperation(transaction, command, existing, economicIntent);
  }
  if (provider.activeIdentityVersion !== command.providerAccount.identityVersion) {
    fail("provider_binding_not_active");
  }
  if (safeVersion(economicIntent.version, false) !== command.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  const resolvedCommand = resolvePurpose(command, economicIntent.purpose);
  await lockSourceIdentity(transaction, resolvedCommand);
  await lockEconomicSession(transaction, resolvedCommand);
  const databaseNow = await readDatabaseClock(transaction);
  if (
    resolvedCommand.idempotencyRetentionDeadline.getTime() <= databaseNow.getTime() ||
    resolvedCommand.idempotencyRetentionDeadline.getTime() >
      databaseNow.getTime() + 72 * 60 * 60 * 1_000
  ) {
    fail("invalid_command");
  }

  const [sourceHead] = await transaction
    .select()
    .from(financeProviderOperationSourceHeads)
    .where(sourceHeadPredicate(resolvedCommand))
    .limit(1)
    .for("update");
  const actualSourceVersion = sourceHead ? safeVersion(sourceHead.headVersion, true) : 0;
  if (actualSourceVersion !== resolvedCommand.expectedProviderOperationSourceVersion) {
    fail("source_version_conflict");
  }

  const predecessor = await validateReplacementAuthority(
    transaction,
    resolvedCommand,
    sourceHead,
    provider
  );
  await validateDispatchArtifact(transaction, resolvedCommand, databaseNow);
  const transientSecretRefId = await validateCredentialOrSecret(
    transaction,
    resolvedCommand,
    databaseNow
  );
  assertDispatchEconomics(resolvedCommand, economicIntent.amountMinor, economicIntent.currency);

  const sourceChainVersion = actualSourceVersion + 1;
  const insertedOperation = await transaction
    .insert(financeProviderOperationIntents)
    .values({
      id: resolvedCommand.providerOperationIntentId,
      economicPaymentIntentId: resolvedCommand.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: String(resolvedCommand.expectedEconomicPaymentVersion),
      economicPaymentSessionId: resolvedCommand.economicPaymentSessionId,
      seriesId: resolvedCommand.providerAccount.seriesId,
      providerAccountId: resolvedCommand.providerAccount.providerAccountId,
      providerIdentityVersion: resolvedCommand.providerAccount.identityVersion,
      purpose: resolvedCommand.purpose,
      sourceId: resolvedCommand.sourceId,
      operationKind: resolvedCommand.operationKind,
      dispatchStep: resolvedCommand.dispatchStep,
      status: "pending_dispatch",
      version: "0",
      sourceChainVersion: String(sourceChainVersion),
      predecessorIntentId: predecessor?.id ?? null,
      predecessorSourceChainVersion: predecessor?.sourceChainVersion ?? null,
      replacementAuthorityDigest: resolvedCommand.replacementAuthorityDigest,
      idempotencyKey: resolvedCommand.idempotencyKey,
      idempotencyRetentionDeadline: resolvedCommand.idempotencyRetentionDeadline,
      canonicalRequestDigest: resolvedCommand.canonicalRequestDigest,
      dispatchAuthorizationId: resolvedCommand.dispatchAuthorization.authorityId,
      dispatchAuthorizationVersion: resolvedCommand.authorizationVersion,
      dispatchAuthorizationDigest: resolvedCommand.dispatchAuthorization.authorityDigest,
      operationPolicyId: resolvedCommand.operationEnvelope.policyId,
      operationPolicyVersion: resolvedCommand.operationEnvelope.policyVersion,
      operationPolicyDigest: resolvedCommand.operationEnvelope.policyDigest,
      operationMaximumRows: resolvedCommand.operationEnvelope.maximumRows,
      operationMaximumDecimalDigits: resolvedCommand.operationEnvelope.maximumDecimalDigits,
      operationMaximumArtifactBytes: resolvedCommand.operationEnvelope.maximumArtifactBytes,
      restrictedCredentialId: resolvedCommand.restrictedCredentialId,
      restrictedCredentialVersion: resolvedCommand.restrictedCredentialVersion,
      transientSecretRefId
    })
    .returning({
      id: financeProviderOperationIntents.id,
      correlatedEconomicPaymentVersion:
        financeProviderOperationIntents.correlatedEconomicPaymentVersion
    });
  if (
    insertedOperation.length !== 1 ||
    insertedOperation[0]?.id !== resolvedCommand.providerOperationIntentId ||
    safeVersion(insertedOperation[0].correlatedEconomicPaymentVersion, true) !==
      resolvedCommand.expectedEconomicPaymentVersion
  ) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("provider_operation_intent");

  if (transientSecretRefId !== null) {
    const consumed = await transaction
      .insert(financeTransientSecretConsumptions)
      .values({
        secretRefId: transientSecretRefId,
        providerOperationIntentId: resolvedCommand.providerOperationIntentId
      })
      .returning({ secretRefId: financeTransientSecretConsumptions.secretRefId });
    if (consumed.length !== 1 || consumed[0]?.secretRefId !== transientSecretRefId) {
      fail("persistence_write_incomplete");
    }
    await afterWriteBoundary("transient_secret_consumption");
  }

  if (sourceHead) {
    const updated = await transaction
      .update(financeProviderOperationSourceHeads)
      .set({
        currentOperationIntentId: command.providerOperationIntentId,
        headVersion: String(sourceChainVersion)
      })
      .where(
        and(
          sourceHeadPredicate(resolvedCommand),
          eq(financeProviderOperationSourceHeads.headVersion, String(actualSourceVersion))
        )
      )
      .returning({ headVersion: financeProviderOperationSourceHeads.headVersion });
    if (
      updated.length !== 1 ||
      safeVersion(updated[0]?.headVersion, false) !== sourceChainVersion
    ) {
      fail("source_version_conflict");
    }
  } else {
    const inserted = await transaction
      .insert(financeProviderOperationSourceHeads)
      .values({
        seriesId: resolvedCommand.providerAccount.seriesId,
        providerAccountId: resolvedCommand.providerAccount.providerAccountId,
        providerIdentityVersion: resolvedCommand.providerAccount.identityVersion,
        purpose: resolvedCommand.purpose,
        sourceId: resolvedCommand.sourceId,
        economicPaymentIntentId: resolvedCommand.economicPaymentIntentId,
        economicPaymentSessionId: resolvedCommand.economicPaymentSessionId,
        operationKind: resolvedCommand.operationKind,
        currentOperationIntentId: resolvedCommand.providerOperationIntentId,
        headVersion: "1"
      })
      .returning({
        currentOperationIntentId: financeProviderOperationSourceHeads.currentOperationIntentId
      });
    if (
      inserted.length !== 1 ||
      inserted[0]?.currentOperationIntentId !== resolvedCommand.providerOperationIntentId
    ) {
      fail("persistence_write_incomplete");
    }
  }
  await afterWriteBoundary("provider_operation_source_head");

  const linkedArtifact = await transaction
    .insert(financeProviderDispatchArtifacts)
    .values({
      providerOperationIntentId: resolvedCommand.providerOperationIntentId,
      artifactId: resolvedCommand.dispatchArtifact.artifactId,
      artifactDigest: resolvedCommand.dispatchArtifact.sha256Digest,
      canonicalRequestDigest: resolvedCommand.canonicalRequestDigest
    })
    .returning({ artifactId: financeProviderDispatchArtifacts.artifactId });
  if (
    linkedArtifact.length !== 1 ||
    linkedArtifact[0]?.artifactId !== resolvedCommand.dispatchArtifact.artifactId
  ) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("provider_dispatch_artifact");

  const [receipt] = await transaction
    .insert(financeProviderOperationIntentCreationReceipts)
    .values({
      providerOperationIntentId: resolvedCommand.providerOperationIntentId,
      providerOperationIntentVersion: "0",
      economicPaymentIntentId: resolvedCommand.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: String(resolvedCommand.expectedEconomicPaymentVersion),
      economicPaymentSessionId: resolvedCommand.economicPaymentSessionId,
      seriesId: resolvedCommand.providerAccount.seriesId,
      providerAccountId: resolvedCommand.providerAccount.providerAccountId,
      providerIdentityVersion: resolvedCommand.providerAccount.identityVersion,
      purpose: resolvedCommand.purpose,
      sourceId: resolvedCommand.sourceId,
      operationKind: resolvedCommand.operationKind,
      sourceChainVersion: String(sourceChainVersion),
      idempotencyKey: resolvedCommand.idempotencyKey,
      canonicalRequestDigest: resolvedCommand.canonicalRequestDigest,
      dispatchAuthorizationId: resolvedCommand.dispatchAuthorization.authorityId,
      dispatchAuthorizationVersion: resolvedCommand.authorizationVersion,
      dispatchAuthorizationDigest: resolvedCommand.dispatchAuthorization.authorityDigest,
      dispatchArtifactId: resolvedCommand.dispatchArtifact.artifactId,
      dispatchArtifactDigest: resolvedCommand.dispatchArtifact.sha256Digest
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("provider_operation_creation_receipt");

  const payload = createFinanceProviderOperationDispatchRequestedPayload({
    providerOperationIntentId: resolvedCommand.providerOperationIntentId
  });
  const outbox = await transaction
    .insert(outboxEvents)
    .values({
      eventType: FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT,
      aggregateId: resolvedCommand.providerOperationIntentId,
      payload
    })
    .returning({ id: outboxEvents.id });
  if (outbox.length !== 1 || !outbox[0]?.id) fail("persistence_write_incomplete");
  await afterWriteBoundary("provider_dispatch_outbox");
  return mapReceipt(receipt, economicIntent.amountMinor, economicIntent.currency);
}

async function lockExactProviderBinding<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  binding: FinanceProviderAccountIdentity
): Promise<LockedProviderAccount> {
  const [series] = await transaction
    .select({
      provider: financeProviderAccountSeries.provider,
      activeIdentityVersion: financeProviderAccountSeries.activeIdentityVersion
    })
    .from(financeProviderAccountSeries)
    .where(eq(financeProviderAccountSeries.seriesId, binding.seriesId))
    .limit(1)
    .for("share");
  const [account] = await transaction
    .select({
      provider: financeProviderAccounts.provider,
      merchantTenantId: financeProviderAccounts.merchantTenantId,
      terminalScope: financeProviderAccounts.terminalScope,
      settlementScope: financeProviderAccounts.settlementScope
    })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, binding.seriesId),
        eq(financeProviderAccounts.providerAccountId, binding.providerAccountId),
        eq(financeProviderAccounts.identityVersion, binding.identityVersion)
      )
    )
    .limit(1)
    .for("share");
  if (!series || !account || series.provider !== "arc_pay" || account.provider !== "arc_pay") {
    fail("provider_binding_not_found");
  }
  return Object.freeze({ ...account, activeIdentityVersion: series.activeIdentityVersion });
}

async function lockOperationIdentity<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
): Promise<void> {
  const keys = [
    `finance-provider-operation-id:${command.providerOperationIntentId}`,
    `finance-provider-operation-idempotency:${command.providerAccount.seriesId}:${command.providerAccount.providerAccountId}:${command.providerAccount.identityVersion}:${command.operationKind}:${command.idempotencyKey}`
  ].sort();
  for (const key of keys) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

async function lockSourceIdentity<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ResolvedCommand
): Promise<void> {
  await transaction.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(
      ${`finance-provider-operation-source:${command.providerAccount.seriesId}:${command.providerAccount.providerAccountId}:${command.providerAccount.identityVersion}:${command.purpose}:${command.sourceId}:${command.operationKind}`},
      0
    ))
  `);
}

async function findExistingOperation<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const rows = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(
      or(
        eq(financeProviderOperationIntents.id, command.providerOperationIntentId),
        and(
          eq(financeProviderOperationIntents.seriesId, command.providerAccount.seriesId),
          eq(
            financeProviderOperationIntents.providerAccountId,
            command.providerAccount.providerAccountId
          ),
          eq(
            financeProviderOperationIntents.providerIdentityVersion,
            command.providerAccount.identityVersion
          ),
          eq(financeProviderOperationIntents.operationKind, command.operationKind),
          eq(financeProviderOperationIntents.idempotencyKey, command.idempotencyKey)
        )
      )
    )
    .for("update");
  if (rows.length > 1) fail("operation_identity_conflict");
  return rows[0];
}

async function replayExistingOperation<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  operation: typeof financeProviderOperationIntents.$inferSelect,
  economicIntent: typeof financeEconomicPaymentIntents.$inferSelect
): Promise<PersistedProviderDispatchReceipt> {
  if (!sameImmutableOperation(operation, command)) fail("operation_identity_conflict");
  await validateReplayedTransientSecret(transaction, command, operation);
  const [artifact] = await transaction
    .select()
    .from(financeProviderDispatchArtifacts)
    .where(eq(financeProviderDispatchArtifacts.providerOperationIntentId, operation.id))
    .limit(1)
    .for("share");
  const [receipt] = await transaction
    .select()
    .from(financeProviderOperationIntentCreationReceipts)
    .where(
      eq(financeProviderOperationIntentCreationReceipts.providerOperationIntentId, operation.id)
    )
    .limit(1)
    .for("share");
  const [outbox] = await transaction
    .select({ payload: outboxEvents.payload })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.eventType, FINANCE_PROVIDER_OPERATION_DISPATCH_REQUESTED_EVENT),
        eq(outboxEvents.aggregateId, operation.id)
      )
    )
    .limit(1)
    .for("share");
  if (
    !artifact ||
    economicIntent.purpose !== operation.purpose ||
    economicIntent.sourceId !== operation.sourceId ||
    economicIntent.seriesId !== operation.seriesId ||
    economicIntent.providerAccountId !== operation.providerAccountId ||
    economicIntent.providerIdentityVersion !== operation.providerIdentityVersion ||
    artifact.artifactId !== command.dispatchArtifact.artifactId ||
    artifact.artifactDigest !== command.dispatchArtifact.sha256Digest ||
    artifact.canonicalRequestDigest !== command.canonicalRequestDigest ||
    !receipt ||
    !outbox ||
    !sameDispatchPayload(outbox.payload, operation.id)
  ) {
    fail("persistence_write_incomplete");
  }
  return mapReceipt(receipt, economicIntent.amountMinor, economicIntent.currency);
}

async function validateReplayedTransientSecret<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  operation: typeof financeProviderOperationIntents.$inferSelect
): Promise<void> {
  if (operation.transientSecretRefId === null) {
    if (command.sealedTransientSecretRef !== null) fail("operation_identity_conflict");
    return;
  }
  const [secret] = await transaction
    .select()
    .from(financeTransientSecretRefs)
    .where(eq(financeTransientSecretRefs.secretRefId, operation.transientSecretRefId))
    .limit(1)
    .for("share");
  const [consumption] = await transaction
    .select({
      providerOperationIntentId: financeTransientSecretConsumptions.providerOperationIntentId
    })
    .from(financeTransientSecretConsumptions)
    .where(eq(financeTransientSecretConsumptions.secretRefId, operation.transientSecretRefId))
    .limit(1)
    .for("share");
  if (
    !secret ||
    secret.sealedSecretRef !== command.sealedTransientSecretRef ||
    secret.providerSetupId !== command.transientProviderSetupId ||
    secret.providerExpiresAt.getTime() !== command.transientProviderExpiresAt?.getTime() ||
    consumption?.providerOperationIntentId !== operation.id
  ) {
    fail("operation_identity_conflict");
  }
}

async function lockEconomicIntent<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, command.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!intent) fail("economic_payment_not_found");
  if (
    (command.purpose !== null && intent.purpose !== command.purpose) ||
    intent.sourceId !== command.sourceId ||
    intent.seriesId !== command.providerAccount.seriesId ||
    intent.providerAccountId !== command.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== command.providerAccount.identityVersion
  ) {
    fail("economic_payment_correlation_conflict");
  }
  return intent;
}

function resolvePurpose(command: NormalizedCommand, persistedPurpose: string): ResolvedCommand {
  const resolvedPurpose = purposeFromPersistence(persistedPurpose);
  if (command.purpose !== null && command.purpose !== resolvedPurpose) {
    fail("economic_payment_correlation_conflict");
  }
  if (
    command.operationKind === "void" &&
    resolvedPurpose !== "client_order" &&
    resolvedPurpose !== "platform_invoice"
  ) {
    fail("economic_payment_correlation_conflict");
  }
  return Object.freeze({ ...command, purpose: resolvedPurpose });
}

async function lockEconomicSession<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ResolvedCommand
): Promise<void> {
  if (command.economicPaymentSessionId === null) return;
  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, command.economicPaymentSessionId))
    .limit(1)
    .for("share");
  if (
    !session ||
    session.economicPaymentIntentId !== command.economicPaymentIntentId ||
    session.seriesId !== command.providerAccount.seriesId ||
    session.providerAccountId !== command.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== command.providerAccount.identityVersion ||
    session.terminalAt !== null
  ) {
    fail("economic_payment_session_not_found");
  }
}

async function validateDispatchArtifact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ResolvedCommand,
  databaseNow: Date
): Promise<void> {
  const [row] = await transaction
    .select({
      artifact: financeArtifacts,
      tombstoneArtifactId: financeArtifactTombstones.artifactId
    })
    .from(financeArtifacts)
    .leftJoin(
      financeArtifactTombstones,
      eq(financeArtifactTombstones.artifactId, financeArtifacts.id)
    )
    .where(eq(financeArtifacts.id, command.dispatchArtifact.artifactId))
    .limit(1)
    .for("share", { of: financeArtifacts });
  if (!row) fail("dispatch_artifact_not_found");
  const byteLength = safeByteLength(row.artifact.byteLength);
  if (
    row.tombstoneArtifactId !== null ||
    row.artifact.artifactClass !== "provider_request" ||
    row.artifact.bindingKind !== "provider" ||
    row.artifact.seriesId !== command.providerAccount.seriesId ||
    row.artifact.providerAccountId !== command.providerAccount.providerAccountId ||
    row.artifact.providerIdentityVersion !== command.providerAccount.identityVersion ||
    row.artifact.sha256Digest !== command.dispatchArtifact.sha256Digest ||
    byteLength !== command.dispatchArtifact.byteLength ||
    byteLength > command.operationEnvelope.maximumArtifactBytes ||
    row.artifact.retainedUntil.getTime() <= databaseNow.getTime()
  ) {
    fail("dispatch_artifact_conflict");
  }
}

async function validateCredentialOrSecret<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ResolvedCommand,
  databaseNow: Date
): Promise<string | null> {
  if (command.restrictedCredentialId !== null) {
    const authorization = command.dispatchAuthorization;
    if (authorization.kind !== "platform_invoice_charge_authorization") {
      fail("invalid_command");
    }
    const [head] = await transaction
      .select({ credentialId: financeRestrictedProviderCredentialHeads.currentCredentialId })
      .from(financeRestrictedProviderCredentialHeads)
      .where(
        and(
          eq(financeRestrictedProviderCredentialHeads.seriesId, command.providerAccount.seriesId),
          eq(
            financeRestrictedProviderCredentialHeads.providerAccountId,
            command.providerAccount.providerAccountId
          ),
          eq(
            financeRestrictedProviderCredentialHeads.providerIdentityVersion,
            command.providerAccount.identityVersion
          ),
          eq(
            financeRestrictedProviderCredentialHeads.currentCredentialId,
            command.restrictedCredentialId
          ),
          eq(
            financeRestrictedProviderCredentialHeads.currentCredentialVersion,
            command.restrictedCredentialVersion!
          ),
          eq(financeRestrictedProviderCredentialHeads.currentLifecycle, "active")
        )
      )
      .limit(1)
      .for("share");
    if (!head) fail("saved_card_credential_not_active");

    const [consent] = await transaction
      .select({ consentId: financeSavedCardConsentHeads.consentId })
      .from(financeRestrictedProviderCredentials)
      .innerJoin(
        financeSavedCardConsentHeads,
        and(
          eq(
            financeRestrictedProviderCredentials.consentId,
            financeSavedCardConsentHeads.consentId
          ),
          eq(
            financeRestrictedProviderCredentials.consentVersion,
            financeSavedCardConsentHeads.consentVersion
          )
        )
      )
      .where(
        and(
          eq(financeRestrictedProviderCredentials.credentialId, command.restrictedCredentialId),
          eq(
            financeRestrictedProviderCredentials.credentialVersion,
            command.restrictedCredentialVersion!
          ),
          eq(financeRestrictedProviderCredentials.consentId, authorization.recurringConsentId),
          eq(
            financeRestrictedProviderCredentials.consentVersion,
            String(authorization.recurringConsentVersion)
          ),
          eq(financeSavedCardConsentHeads.currentLifecycle, "granted")
        )
      )
      .limit(1)
      .for("share");
    if (!consent) fail("saved_card_consent_not_active");
  }
  if (command.sealedTransientSecretRef === null) return null;
  const [secret] = await transaction
    .select()
    .from(financeTransientSecretRefs)
    .where(eq(financeTransientSecretRefs.sealedSecretRef, command.sealedTransientSecretRef))
    .limit(1)
    .for("update");
  if (
    !secret ||
    secret.seriesId !== command.providerAccount.seriesId ||
    secret.providerAccountId !== command.providerAccount.providerAccountId ||
    secret.providerIdentityVersion !== command.providerAccount.identityVersion ||
    secret.providerSetupId !== command.transientProviderSetupId ||
    secret.providerExpiresAt.getTime() !== command.transientProviderExpiresAt?.getTime() ||
    secret.providerExpiresAt.getTime() <= databaseNow.getTime()
  ) {
    fail("transient_secret_not_available");
  }
  const [consumption] = await transaction
    .select({ secretRefId: financeTransientSecretConsumptions.secretRefId })
    .from(financeTransientSecretConsumptions)
    .where(eq(financeTransientSecretConsumptions.secretRefId, secret.secretRefId))
    .limit(1)
    .for("share");
  if (consumption) fail("transient_secret_not_available");
  return secret.secretRefId;
}

async function validateReplacementAuthority<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: ResolvedCommand,
  sourceHead: typeof financeProviderOperationSourceHeads.$inferSelect | undefined,
  provider: LockedProviderAccount
): Promise<typeof financeProviderOperationIntents.$inferSelect | null> {
  if (!sourceHead) {
    if (command.replacementAuthority !== null) fail("replacement_authority_conflict");
    return null;
  }
  if (
    sourceHead.economicPaymentIntentId !== command.economicPaymentIntentId ||
    sourceHead.economicPaymentSessionId !== command.economicPaymentSessionId
  ) {
    fail("source_version_conflict");
  }
  const [predecessor] = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, sourceHead.currentOperationIntentId))
    .limit(1)
    .for("update");
  if (!predecessor || predecessor.status !== "failed" || !command.replacementAuthority) {
    fail("replacement_authority_conflict");
  }
  const [result] = await transaction
    .select()
    .from(financeProviderOperationResults)
    .where(
      and(
        eq(financeProviderOperationResults.providerOperationIntentId, predecessor.id),
        eq(financeProviderOperationResults.providerOperationIntentVersion, predecessor.version)
      )
    )
    .limit(1)
    .for("share");
  const [receipt] = result
    ? await transaction
        .select({ id: financeProviderOperationResultCommitReceipts.id })
        .from(financeProviderOperationResultCommitReceipts)
        .where(
          eq(financeProviderOperationResultCommitReceipts.providerOperationResultId, result.id)
        )
        .limit(1)
        .for("share")
    : [];
  if (!result || result.outcome !== "failed" || !receipt) {
    fail("replacement_authority_conflict");
  }
  const authority = command.replacementAuthority;
  const expectedSource = {
    kind: command.purpose,
    id: command.sourceId,
    economicIntentId: command.economicPaymentIntentId,
    economicSessionId: command.economicPaymentSessionId,
    providerAccount: command.providerAccount
  };
  const expectedProviderAccount = {
    providerAccountId: command.providerAccount.providerAccountId,
    identityVersion: command.providerAccount.identityVersion,
    provider: "arc_pay",
    merchantTenantId: provider.merchantTenantId,
    terminalScope: provider.terminalScope,
    settlementScope: provider.settlementScope
  };
  const expectedCore = {
    authorityVersion: 1,
    predecessorIntentId: predecessor.id,
    predecessorVersion: safeVersion(predecessor.version, true),
    predecessorCreatedAt: predecessor.createdAt.toISOString(),
    predecessorProviderAccount: expectedProviderAccount,
    predecessorProviderAccountBinding: command.providerAccount,
    predecessorPurpose: command.purpose,
    predecessorOperationKind: command.operationKind,
    predecessorSource: expectedSource,
    predecessorCanonicalRequestDigest: predecessor.canonicalRequestDigest,
    predecessorCanonicalResult: {
      outcome: "failed",
      evidence: {
        kind: "canonical_provider_read",
        reference: result.providerOperationId,
        digest: result.evidenceArtifactDigest,
        observedAt: result.observedAt.toISOString()
      }
    },
    candidateRequestDigest: command.canonicalRequestDigest
  } as const;
  if (
    !sameCanonical(authority, {
      ...expectedCore,
      authorityDigest: digestFinanceCanonicalValueV1(expectedCore)
    })
  ) {
    fail("replacement_authority_conflict");
  }
  return predecessor;
}

function normalizeCommand(command: PersistProviderOperationBeforeIoCommand): NormalizedCommand {
  try {
    assertExactOwnDataKeys(command, [
      "providerOperationIntentId",
      "economicPaymentIntentId",
      "expectedEconomicPaymentVersion",
      "expectedProviderOperationSourceVersion",
      "providerAccount",
      "dispatchArtifact",
      "replacementAuthority",
      "idempotencyKey",
      "idempotencyRetentionDeadline",
      "operationEnvelope",
      "operationKind",
      "economicPaymentSessionId",
      "dispatchEnvelope",
      "dispatchAuthorization"
    ]);
    const operationKind = operation(command.operationKind);
    const providerAccount = createProviderAccountIdentityBinding(command.providerAccount);
    const dispatchEnvelope = createProviderDispatchEnvelope(command.dispatchEnvelope);
    if (!operationEnvelopeMatchesKind(dispatchEnvelope, operationKind)) fail("invalid_command");
    const purpose = expectedPurpose(operationKind, command.dispatchAuthorization.kind);
    const economicPaymentSessionId =
      command.economicPaymentSessionId === null
        ? null
        : identifier(command.economicPaymentSessionId);
    if (
      !Number.isSafeInteger(command.expectedEconomicPaymentVersion) ||
      command.expectedEconomicPaymentVersion < 1 ||
      !Number.isSafeInteger(command.expectedProviderOperationSourceVersion) ||
      command.expectedProviderOperationSourceVersion < 0 ||
      (["checkout_session_create", "card_setup", "card_setup_execute", "card_setup_3ds_method_complete", "saved_card_charge", "saved_card_charge_3ds_method_complete"].includes(operationKind)
        ? economicPaymentSessionId === null
        : economicPaymentSessionId !== null)
    ) {
      fail("invalid_command");
    }
    const canonicalRequestDigest = digestFinanceCanonicalValueV1(dispatchEnvelope);
    const dispatchArtifact = artifactRef(command.dispatchArtifact);
    if (dispatchArtifact.sha256Digest !== canonicalRequestDigest) fail("invalid_command");
    const dispatchAuthorization = authorization(
      command.dispatchAuthorization,
      operationKind,
      purpose,
      command.economicPaymentIntentId,
      dispatchEnvelope
    );
    const operationEnvelope = resolvedOperationEnvelope(command.operationEnvelope);
    if (dispatchArtifact.byteLength > operationEnvelope.maximumArtifactBytes) {
      fail("invalid_command");
    }
    const idempotencyRetentionDeadline = instant(command.idempotencyRetentionDeadline);
    const replacementAuthority = replacement(command.replacementAuthority);
    const dispatchStep = dispatchEnvelope.kind === "card_setup"
      ? dispatchEnvelope.step
      : dispatchEnvelope.kind === "saved_card_charge_3ds_method"
        ? "complete_3ds_method"
        : null;
    const restrictedCredential =
      dispatchEnvelope.kind === "saved_card_charge" ? dispatchEnvelope.savedCardCredential : null;
    if (dispatchEnvelope.kind === "saved_card_charge") {
      const savedAuthorization = dispatchAuthorization as Extract<
        ProviderDispatchAuthorizationReceipt,
        { kind: "platform_invoice_charge_authorization" }
      >;
      assertSavedCardCredentialAuthorizationBinding(
        dispatchEnvelope,
        savedAuthorization.savedCardCredentialId,
        savedAuthorization.savedCardCredentialVersion
      );
    }
    const transientSecret = dispatchEnvelope.kind === "saved_card_charge_3ds_method"
      ? dispatchEnvelope.threeDsMethodContextSecret
      : dispatchEnvelope.kind === "card_setup"
      ? dispatchEnvelope.step === "execute"
        ? dispatchEnvelope.tokenizationSecret
        : dispatchEnvelope.step === "complete_3ds_method"
          ? dispatchEnvelope.threeDsMethodContextSecret
          : null
      : null;
    return Object.freeze({
      providerOperationIntentId: uuid(command.providerOperationIntentId),
      economicPaymentIntentId: identifier(command.economicPaymentIntentId),
      expectedEconomicPaymentVersion: command.expectedEconomicPaymentVersion,
      expectedProviderOperationSourceVersion: command.expectedProviderOperationSourceVersion,
      economicPaymentSessionId,
      providerAccount,
      purpose,
      sourceId: dispatchAuthorization.sourceId,
      operationKind,
      dispatchEnvelope,
      dispatchStep,
      canonicalRequestDigest,
      dispatchArtifact,
      replacementAuthority,
      replacementAuthorityDigest: replacementAuthority?.authorityDigest ?? null,
      dispatchAuthorization,
      authorizationVersion: positiveDecimal(dispatchAuthorization.authorityVersion),
      idempotencyKey: idempotencyKey(command.idempotencyKey),
      idempotencyRetentionDeadline,
      restrictedCredentialId: restrictedCredential?.credentialId ?? null,
      restrictedCredentialVersion:
        restrictedCredential === null ? null : String(restrictedCredential.credentialVersion),
      sealedTransientSecretRef: transientSecret?.secretRef ?? null,
      transientProviderSetupId:
        dispatchEnvelope.kind === "saved_card_charge_3ds_method"
          ? dispatchEnvelope.providerPaymentId
          : dispatchEnvelope.kind === "card_setup" &&
              (dispatchEnvelope.step === "execute" || dispatchEnvelope.step === "complete_3ds_method")
            ? dispatchEnvelope.providerSetupId
            : null,
      transientProviderExpiresAt:
        transientSecret === null ? null : instant(transientSecret.providerExpiresAt),
      operationEnvelope
    });
  } catch (error) {
    if (error instanceof ProviderOperationIntentCreationPersistenceError) throw error;
    fail("invalid_command");
  }
}

function authorization(
  value: ProviderDispatchAuthorizationReceipt,
  operationKind: OperationKind,
  purpose: Purpose | null,
  economicPaymentIntentId: string,
  dispatchEnvelope: ReturnType<typeof createProviderDispatchEnvelope>
): ProviderDispatchAuthorizationReceipt {
  const base = ["kind", "authorityId", "authorityVersion", "authorityDigest", "sourceId"];
  const expectedByKind: Readonly<
    Record<ProviderDispatchAuthorizationReceipt["kind"], readonly string[]>
  > = {
    client_order_checkout_authorization: [
      ...base,
      "orderId",
      "orderSnapshotVersion",
      "paymentCommandId"
    ],
    platform_card_setup_authorization: [
      ...base,
      "setupSessionId",
      "setupConsentId",
      "setupConsentVersion"
    ],
    platform_invoice_charge_authorization: [
      ...base,
      "invoiceId",
      "invoiceVersion",
      "subscriptionId",
      "subscriptionVersion",
      "recurringConsentId",
      "recurringConsentVersion",
      "savedCardCredentialId",
      "savedCardCredentialVersion"
    ],
    platform_invoice_3ds_method_authorization: [
      ...base,
      "invoiceId",
      "invoiceVersion",
      "subscriptionId",
      "customerActionId",
      "customerActionResponseDigest",
      "providerPaymentId"
    ],
    refund_authorization: [...base, "refundId", "refundVersion", "approvedCumulativeAmountMinor"],
    void_authorization: [
      ...base,
      "economicPaymentIntentId",
      "economicPaymentVersion",
      "authorizedProviderPaymentId"
    ]
  };
  assertExactOwnDataKeys(value, expectedByKind[value.kind] ?? []);
  identifier(value.authorityId);
  positiveDecimal(value.authorityVersion);
  digest(value.authorityDigest);
  const sourceId = identifier(value.sourceId);
  const expectedKind = expectedAuthorizationKind(operationKind);
  if (value.kind !== expectedKind) fail("invalid_command");
  if (sourceId.length === 0) fail("invalid_command");
  if (value.kind === "client_order_checkout_authorization") {
    if (
      purpose !== "client_order" ||
      value.orderId !== sourceId ||
      dispatchEnvelope.kind !== "checkout_session_create" ||
      dispatchEnvelope.orderId !== value.orderId
    )
      fail("invalid_command");
    positiveInteger(value.orderSnapshotVersion);
    identifier(value.paymentCommandId);
  } else if (value.kind === "platform_card_setup_authorization") {
    if (purpose !== "platform_card_setup" || value.setupSessionId !== sourceId)
      fail("invalid_command");
    identifier(value.setupConsentId);
    positiveInteger(value.setupConsentVersion);
  } else if (value.kind === "platform_invoice_charge_authorization") {
    if (purpose !== "platform_invoice" || value.invoiceId !== sourceId) fail("invalid_command");
    positiveInteger(value.invoiceVersion);
    identifier(value.subscriptionId);
    positiveInteger(value.subscriptionVersion);
    identifier(value.recurringConsentId);
    positiveInteger(value.recurringConsentVersion);
    identifier(value.savedCardCredentialId);
    positiveInteger(value.savedCardCredentialVersion);
  } else if (value.kind === "platform_invoice_3ds_method_authorization") {
    if (
      purpose !== "platform_invoice" ||
      value.invoiceId !== sourceId ||
      dispatchEnvelope.kind !== "saved_card_charge_3ds_method" ||
      dispatchEnvelope.invoiceId !== value.invoiceId ||
      dispatchEnvelope.customerActionId !== value.customerActionId ||
      dispatchEnvelope.providerPaymentId !== value.providerPaymentId
    ) fail("invalid_command");
    positiveInteger(value.invoiceVersion);
    identifier(value.subscriptionId);
    identifier(value.customerActionId);
    digest(value.customerActionResponseDigest);
    identifier(value.providerPaymentId);
  } else if (value.kind === "refund_authorization") {
    if (
      purpose !== "client_order" ||
      dispatchEnvelope.kind !== "refund" ||
      dispatchEnvelope.externalId !== value.refundId
    ) {
      fail("invalid_command");
    }
    identifier(value.refundId);
    positiveInteger(value.refundVersion);
    encodeFinanceNumeric38(value.approvedCumulativeAmountMinor);
  } else {
    if (
      value.economicPaymentIntentId !== economicPaymentIntentId ||
      dispatchEnvelope.kind !== "void" ||
      dispatchEnvelope.providerPaymentId !== value.authorizedProviderPaymentId
    )
      fail("invalid_command");
    positiveInteger(value.economicPaymentVersion);
    identifier(value.authorizedProviderPaymentId);
  }
  return value;
}

function replacement(value: unknown): ProviderOperationReplacementAuthority | null {
  if (value === null) return null;
  assertExactOwnDataKeys(value, [
    "authorityVersion",
    "predecessorIntentId",
    "predecessorVersion",
    "predecessorCreatedAt",
    "predecessorProviderAccount",
    "predecessorProviderAccountBinding",
    "predecessorPurpose",
    "predecessorOperationKind",
    "predecessorSource",
    "predecessorCanonicalRequestDigest",
    "predecessorCanonicalResult",
    "candidateRequestDigest",
    "authorityDigest"
  ]);
  const authority = value as ProviderOperationReplacementAuthority;
  digest(authority.authorityDigest);
  return authority;
}

function resolvedOperationEnvelope(value: unknown): ResolvedFinanceOperationEnvelope {
  assertExactOwnDataKeys(value, [
    "kind",
    "policyId",
    "policyVersion",
    "policyDigest",
    "maximumRows",
    "maximumDecimalDigits",
    "maximumArtifactBytes"
  ]);
  const envelope = value as ResolvedFinanceOperationEnvelope;
  if (envelope.kind !== "resolved_finance_operation_envelope") fail("invalid_command");
  identifier(envelope.policyId);
  positiveInteger(envelope.policyVersion);
  digest(envelope.policyDigest);
  positiveInteger(envelope.maximumRows);
  positiveInteger(envelope.maximumDecimalDigits);
  positiveInteger(envelope.maximumArtifactBytes);
  return envelope;
}

function artifactRef(value: unknown): RawProviderArtifactRef {
  assertExactOwnDataKeys(value, ["artifactId", "sha256Digest", "byteLength"]);
  const artifact = value as RawProviderArtifactRef;
  identifier(artifact.artifactId);
  digest(artifact.sha256Digest);
  if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 1)
    fail("invalid_command");
  return Object.freeze({ ...artifact });
}

function sameImmutableOperation(
  row: typeof financeProviderOperationIntents.$inferSelect,
  command: NormalizedCommand
): boolean {
  return (
    row.id === command.providerOperationIntentId &&
    row.economicPaymentIntentId === command.economicPaymentIntentId &&
    safeVersion(row.correlatedEconomicPaymentVersion, true) ===
      command.expectedEconomicPaymentVersion &&
    row.economicPaymentSessionId === command.economicPaymentSessionId &&
    row.seriesId === command.providerAccount.seriesId &&
    row.providerAccountId === command.providerAccount.providerAccountId &&
    row.providerIdentityVersion === command.providerAccount.identityVersion &&
    (command.purpose === null
      ? row.purpose === "client_order" || row.purpose === "platform_invoice"
      : row.purpose === command.purpose) &&
    row.sourceId === command.sourceId &&
    row.operationKind === command.operationKind &&
    row.dispatchStep === command.dispatchStep &&
    row.sourceChainVersion === String(command.expectedProviderOperationSourceVersion + 1) &&
    row.replacementAuthorityDigest === command.replacementAuthorityDigest &&
    row.idempotencyKey === command.idempotencyKey &&
    row.idempotencyRetentionDeadline.getTime() === command.idempotencyRetentionDeadline.getTime() &&
    row.canonicalRequestDigest === command.canonicalRequestDigest &&
    row.dispatchAuthorizationId === command.dispatchAuthorization.authorityId &&
    row.dispatchAuthorizationVersion === command.authorizationVersion &&
    row.dispatchAuthorizationDigest === command.dispatchAuthorization.authorityDigest &&
    row.operationPolicyId === command.operationEnvelope.policyId &&
    row.operationPolicyVersion === command.operationEnvelope.policyVersion &&
    row.operationPolicyDigest === command.operationEnvelope.policyDigest &&
    row.operationMaximumRows === command.operationEnvelope.maximumRows &&
    row.operationMaximumDecimalDigits === command.operationEnvelope.maximumDecimalDigits &&
    row.operationMaximumArtifactBytes === command.operationEnvelope.maximumArtifactBytes &&
    row.restrictedCredentialId === command.restrictedCredentialId &&
    row.restrictedCredentialVersion === command.restrictedCredentialVersion &&
    (command.sealedTransientSecretRef === null
      ? row.transientSecretRefId === null
      : row.transientSecretRefId !== null)
  );
}

function mapReceipt(
  row: typeof financeProviderOperationIntentCreationReceipts.$inferSelect,
  economicAmountMinor: string,
  economicCurrency: string
): PersistedProviderDispatchReceipt {
  const operationVersion = safeVersion(row.providerOperationIntentVersion, true);
  const economicVersion = safeVersion(row.correlatedEconomicPaymentVersion, true);
  if (
    operationVersion !== 0 ||
    economicVersion < 1 ||
    economicCurrency !== "RUB" ||
    !digestPattern.test(row.canonicalRequestDigest) ||
    !digestPattern.test(row.dispatchAuthorizationDigest) ||
    !digestPattern.test(row.canonicalDigest) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !(row.committedAt instanceof Date) ||
    Number.isNaN(row.committedAt.getTime())
  ) {
    fail("persistence_write_incomplete");
  }
  const amountMinor = encodeFinanceNumeric38(economicAmountMinor);
  const receipt = Object.freeze({
    kind: "persisted_provider_dispatch_receipt" as const,
    providerOperationIntentId: row.providerOperationIntentId,
    providerOperationIntentVersion: operationVersion,
    economicPaymentIntentId: row.economicPaymentIntentId,
    economicPaymentVersion: economicVersion,
    economicPaymentSessionId: row.economicPaymentSessionId,
    sourceId: row.sourceId,
    purpose: purpose(row.purpose),
    amountMinor,
    currency: "RUB" as const,
    providerAccount: createProviderAccountIdentityBinding({
      seriesId: row.seriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.providerIdentityVersion
    }),
    canonicalRequestDigest: row.canonicalRequestDigest as FinanceDigest,
    dispatchAuthorizationId: row.dispatchAuthorizationId,
    dispatchAuthorizationDigest: row.dispatchAuthorizationDigest as FinanceDigest,
    idempotencyKey: row.idempotencyKey,
    sealedDispatchPayloadRef: row.dispatchArtifactId,
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
    committedAt: row.committedAt.toISOString()
  });
  return receipt as PersistedProviderDispatchReceipt;
}

function assertDispatchEconomics(
  command: ResolvedCommand,
  economicAmountMinor: string,
  economicCurrency: string
): void {
  if (economicCurrency !== "RUB") fail("economic_payment_correlation_conflict");
  const economicAmount = BigInt(encodeFinanceNumeric38(economicAmountMinor));
  const envelope = command.dispatchEnvelope;
  if (envelope.kind === "card_setup") {
    if (economicAmount !== 0n) fail("economic_payment_correlation_conflict");
    return;
  }
  if (envelope.kind === "saved_card_charge_3ds_method") {
    if (economicAmount <= 0n) fail("economic_payment_correlation_conflict");
    return;
  }
  if (envelope.kind === "void") {
    if (economicAmount <= 0n) fail("economic_payment_correlation_conflict");
    return;
  }
  if (envelope.amount.currency !== "RUB") fail("economic_payment_correlation_conflict");
  const dispatchAmount = BigInt(envelope.amount.amountMinor);
  if (envelope.kind === "refund") {
    if (dispatchAmount <= 0n || dispatchAmount > economicAmount) {
      fail("economic_payment_correlation_conflict");
    }
    return;
  }
  if (dispatchAmount !== economicAmount) fail("economic_payment_correlation_conflict");
}

function sourceHeadPredicate(command: ResolvedCommand) {
  return and(
    eq(financeProviderOperationSourceHeads.seriesId, command.providerAccount.seriesId),
    eq(
      financeProviderOperationSourceHeads.providerAccountId,
      command.providerAccount.providerAccountId
    ),
    eq(
      financeProviderOperationSourceHeads.providerIdentityVersion,
      command.providerAccount.identityVersion
    ),
    eq(financeProviderOperationSourceHeads.purpose, command.purpose),
    eq(financeProviderOperationSourceHeads.sourceId, command.sourceId),
    eq(financeProviderOperationSourceHeads.operationKind, command.operationKind)
  );
}

async function readDatabaseClock<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>
): Promise<Date> {
  const result = await transaction.execute(
    sql<{ databaseNow: Date }>`select clock_timestamp() as "databaseNow"`
  );
  const value = result.rows[0]?.databaseNow;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) fail("persistence_write_incomplete");
  return date;
}

function safeVersion(value: unknown, allowZero: boolean): number {
  const decoded = allowZero
    ? decodeFinanceUnsignedRevision(value)
    : decodeFinancePositiveRevision(value);
  const parsed = Number(decoded);
  if (!Number.isSafeInteger(parsed)) fail("persistence_write_incomplete");
  return parsed;
}

function safeByteLength(value: unknown): number {
  const parsed = Number(decodeFinanceUnsignedRevision(value));
  if (!Number.isSafeInteger(parsed)) fail("dispatch_artifact_conflict");
  return parsed;
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function operation(value: unknown): OperationKind {
  if (
    value !== "checkout_session_create" &&
    value !== "card_setup" &&
    value !== "card_setup_execute" &&
    value !== "card_setup_3ds_method_complete" &&
    value !== "saved_card_charge" &&
    value !== "saved_card_charge_3ds_method_complete" &&
    value !== "refund" &&
    value !== "void"
  )
    fail("invalid_command");
  return value;
}

function expectedPurpose(
  operationKind: OperationKind,
  authorizationKind: ProviderDispatchAuthorizationReceipt["kind"]
): Purpose | null {
  const matrix = {
    checkout_session_create: ["client_order", "client_order_checkout_authorization"],
    card_setup: ["platform_card_setup", "platform_card_setup_authorization"],
    card_setup_execute: ["platform_card_setup", "platform_card_setup_authorization"],
    card_setup_3ds_method_complete: ["platform_card_setup", "platform_card_setup_authorization"],
    saved_card_charge: ["platform_invoice", "platform_invoice_charge_authorization"],
    saved_card_charge_3ds_method_complete: ["platform_invoice", "platform_invoice_3ds_method_authorization"],
    refund: ["client_order", "refund_authorization"],
    void: [null, "void_authorization"]
  } as const;
  const [purposeValue, expectedAuthorization] = matrix[operationKind];
  if (authorizationKind !== expectedAuthorization) fail("invalid_command");
  if (operationKind === "void") return null;
  return purposeValue;
}

function expectedAuthorizationKind(operationKind: OperationKind) {
  return {
    checkout_session_create: "client_order_checkout_authorization",
    card_setup: "platform_card_setup_authorization",
    card_setup_execute: "platform_card_setup_authorization",
    card_setup_3ds_method_complete: "platform_card_setup_authorization",
    saved_card_charge: "platform_invoice_charge_authorization",
    saved_card_charge_3ds_method_complete: "platform_invoice_3ds_method_authorization",
    refund: "refund_authorization",
    void: "void_authorization"
  }[operationKind] as ProviderDispatchAuthorizationReceipt["kind"];
}

function operationEnvelopeMatchesKind(envelope: ProviderDispatchEnvelope, operationKind: OperationKind): boolean {
  return (
    (operationKind === "checkout_session_create" && envelope.kind === "checkout_session_create") ||
    (operationKind === "card_setup" && envelope.kind === "card_setup" && envelope.step === "create") ||
    (operationKind === "card_setup_execute" && envelope.kind === "card_setup" && envelope.step === "execute") ||
    (operationKind === "card_setup_3ds_method_complete" && envelope.kind === "card_setup" && envelope.step === "complete_3ds_method") ||
    (operationKind === "saved_card_charge" && envelope.kind === "saved_card_charge") ||
    (operationKind === "saved_card_charge_3ds_method_complete" && envelope.kind === "saved_card_charge_3ds_method") ||
    (operationKind === "refund" && envelope.kind === "refund") ||
    (operationKind === "void" && envelope.kind === "void")
  );
}

function purpose(value: unknown): Purpose {
  if (value !== "client_order" && value !== "platform_invoice" && value !== "platform_card_setup") {
    fail("persistence_write_incomplete");
  }
  return value;
}

function purposeFromPersistence(value: unknown): Purpose {
  return purpose(value);
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    containsAsciiControl(value)
  )
    fail("invalid_command");
  return value;
}

function containsAsciiControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function uuid(value: unknown): string {
  const normalized = identifier(value);
  if (!uuidPattern.test(normalized)) fail("invalid_command");
  return normalized;
}

function idempotencyKey(value: unknown): string {
  const normalized = identifier(value);
  if (normalized.length < 8 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) fail("invalid_command");
  return normalized;
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !digestPattern.test(value)) fail("invalid_command");
  return value as FinanceDigest;
}

function positiveDecimal(value: unknown): string {
  return decodeFinancePositiveRevision(value);
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_command");
  return Number(value);
}

function instant(value: unknown): Date {
  if (typeof value !== "string") fail("invalid_command");
  const date = new Date(value);
  if (
    Number.isNaN(date.getTime()) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    fail("invalid_command");
  }
  return date;
}

function sameDispatchPayload(value: unknown, operationId: string): boolean {
  try {
    return (
      createFinanceProviderOperationDispatchRequestedPayload(value).providerOperationIntentId ===
      operationId
    );
  } catch {
    return false;
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return digestFinanceCanonicalValueV1(left) === digestFinanceCanonicalValueV1(right);
  } catch {
    return false;
  }
}

function assertExactOwnDataKeys(value: unknown, expectedKeys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const expected = new Set(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.size) fail("invalid_command");
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) fail("invalid_command");
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

function noFailureInjection(): void {}

function fail(reason: ProviderOperationIntentCreationPersistenceReason): never {
  throw new ProviderOperationIntentCreationPersistenceError(reason);
}
