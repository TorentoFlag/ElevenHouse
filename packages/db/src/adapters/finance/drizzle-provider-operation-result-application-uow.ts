import { randomUUID } from "node:crypto";

import {
  createProviderAccountIdentityBinding,
  type ApplyVerifiedProviderResultCommand,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type ProviderOperationResultApplicationUnitOfWork,
  type ProviderOperationResultCommitReceipt,
  type RawProviderArtifactRef,
  type ResolvedFinanceOperationEnvelope,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import {
  financeArtifactTombstones,
  financeArtifacts
} from "../../schema/finance/finance-artifacts.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationResultCommitReceipts,
  financeProviderOperationResults
} from "../../schema/finance/provider-operations.schema";
import {
  decodeFinancePositiveRevision,
  decodeFinanceUnsignedRevision,
  encodeFinanceNumeric38
} from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export const providerOperationResultApplicationWriteBoundaryValues = Object.freeze([
  "provider_operation_result",
  "provider_operation_head",
  "provider_operation_result_receipt"
] as const);

export type ProviderOperationResultApplicationWriteBoundary =
  (typeof providerOperationResultApplicationWriteBoundaryValues)[number];

export type ProviderOperationResultApplicationFailureInjector = (
  boundary: ProviderOperationResultApplicationWriteBoundary
) => void | Promise<void>;

export type ProviderOperationResultApplicationPersistenceReason =
  | "invalid_command"
  | "provider_binding_not_found"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "economic_payment_correlation_conflict"
  | "economic_payment_session_not_found"
  | "provider_operation_not_found"
  | "provider_operation_version_conflict"
  | "provider_operation_correlation_conflict"
  | "provider_operation_terminal"
  | "provider_evidence_conflict"
  | "evidence_artifact_not_found"
  | "evidence_artifact_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ProviderOperationResultApplicationPersistenceError extends Error {
  readonly code = "provider_operation_result_application_persistence_error";

  constructor(readonly reason: ProviderOperationResultApplicationPersistenceReason) {
    super("Verified provider result could not be applied atomically");
    this.name = "ProviderOperationResultApplicationPersistenceError";
  }
}

export function createDrizzleProviderOperationResultApplicationUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly afterWriteBoundary?: ProviderOperationResultApplicationFailureInjector;
}): ProviderOperationResultApplicationUnitOfWork {
  const unitOfWork = {
    async applyVerifiedProviderResult(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          applyInTransaction(
            transaction,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof ProviderOperationResultApplicationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("provider_evidence_conflict");
        throw error;
      }
    }
  } satisfies ProviderOperationResultApplicationUnitOfWork;
  return Object.freeze(unitOfWork);
}

/**
 * Internal composition hook for a larger PostgreSQL transaction. It retains provider-result
 * validation and receipt semantics, but never opens a nested transaction.
 */
export async function applyProviderOperationResultInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  command: ApplyVerifiedProviderResultCommand,
  afterWriteBoundary: ProviderOperationResultApplicationFailureInjector = noFailureInjection
): Promise<ProviderOperationResultCommitReceipt> {
  return applyInTransaction(transaction, normalizeCommand(command), afterWriteBoundary);
}

type Purpose = "client_order" | "platform_invoice" | "platform_card_setup";
type OperationKind = VerifiedProviderOperationEvidence["operationKind"];
type Outcome = VerifiedProviderOperationEvidence["outcome"];

type NormalizedCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
  evidence: Readonly<{
    providerAccount: FinanceProviderAccountIdentity;
    economicPaymentIntentId: string;
    economicPaymentSessionId: string | null;
    sourceId: string;
    purpose: Purpose;
    providerOperationIntentId: string;
    operationKind: OperationKind;
    providerOperationId: string;
    canonicalRequestDigest: FinanceDigest;
    idempotencyKey: string;
    outcome: Outcome;
    providerPaymentId: string | null;
    amountMinor: string | null;
    currency: "RUB" | null;
    artifact: RawProviderArtifactRef;
    observedAt: Date;
  }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

async function applyInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  afterWriteBoundary: ProviderOperationResultApplicationFailureInjector
): Promise<ProviderOperationResultCommitReceipt> {
  await lockExactProviderBinding(transaction, command.evidence.providerAccount);
  const economicIntent = await lockEconomicIntent(transaction, command);
  const operation = await lockProviderOperation(transaction, command);
  assertCaptureResultMoney(economicIntent, command);

  const existing = await findExistingResult(transaction, command);
  if (existing) return replayExistingResult(transaction, command, existing);

  if (safeVersion(economicIntent.version, false) !== command.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  if (safeVersion(operation.version, true) !== command.expectedProviderOperationIntentVersion) {
    fail("provider_operation_version_conflict");
  }
  if (operation.status === "succeeded" || operation.status === "failed") {
    fail("provider_operation_terminal");
  }
  assertOperationCorrelation(operation, command);
  await lockEconomicSession(transaction, command);
  await validateEvidenceArtifact(transaction, command);
  const earliestObservedAt = operation.providerUnknownObservedAt ?? operation.createdAt;
  if (command.evidence.observedAt.getTime() < earliestObservedAt.getTime()) {
    fail("provider_evidence_conflict");
  }

  const nextOperationVersion = command.expectedProviderOperationIntentVersion + 1;
  if (!Number.isSafeInteger(nextOperationVersion)) fail("invalid_command");
  const providerOperationResultId = randomUUID();
  const [result] = await transaction
    .insert(financeProviderOperationResults)
    .values({
      id: providerOperationResultId,
      providerOperationIntentId: command.providerOperationIntentId,
      providerOperationIntentVersion: String(nextOperationVersion),
      correlatedEconomicPaymentVersion: String(command.expectedEconomicPaymentVersion),
      seriesId: command.evidence.providerAccount.seriesId,
      providerAccountId: command.evidence.providerAccount.providerAccountId,
      providerIdentityVersion: command.evidence.providerAccount.identityVersion,
      outcome: command.evidence.outcome,
      providerOperationId: command.evidence.providerOperationId,
      providerPaymentId: command.evidence.providerPaymentId,
      amountMinor: command.evidence.amountMinor,
      currency: command.evidence.currency,
      canonicalRequestDigest: command.evidence.canonicalRequestDigest,
      idempotencyKey: command.evidence.idempotencyKey,
      evidenceArtifactId: command.evidence.artifact.artifactId,
      evidenceArtifactDigest: command.evidence.artifact.sha256Digest,
      observedAt: command.evidence.observedAt
    })
    .returning();
  if (
    !result ||
    result.id !== providerOperationResultId ||
    safeVersion(result.correlatedEconomicPaymentVersion, true) !==
      command.expectedEconomicPaymentVersion
  ) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("provider_operation_result");

  const nextStatus =
    command.evidence.outcome === "ambiguous" ? "provider_unknown" : command.evidence.outcome;
  const updated = await transaction
    .update(financeProviderOperationIntents)
    .set({
      status: nextStatus,
      version: String(nextOperationVersion),
      providerUnknownObservedAt:
        command.evidence.outcome === "ambiguous"
          ? command.evidence.observedAt
          : operation.providerUnknownObservedAt,
      terminalAt: command.evidence.outcome === "ambiguous" ? null : command.evidence.observedAt
    })
    .where(
      and(
        eq(financeProviderOperationIntents.id, command.providerOperationIntentId),
        eq(
          financeProviderOperationIntents.version,
          String(command.expectedProviderOperationIntentVersion)
        )
      )
    )
    .returning({
      id: financeProviderOperationIntents.id,
      version: financeProviderOperationIntents.version,
      status: financeProviderOperationIntents.status
    });
  if (
    updated.length !== 1 ||
    updated[0]?.id !== command.providerOperationIntentId ||
    safeVersion(updated[0].version, false) !== nextOperationVersion ||
    updated[0].status !== nextStatus
  ) {
    fail("provider_operation_version_conflict");
  }
  await afterWriteBoundary("provider_operation_head");

  const [receipt] = await transaction
    .insert(financeProviderOperationResultCommitReceipts)
    .values({
      providerOperationResultId,
      providerOperationIntentId: command.providerOperationIntentId,
      providerOperationIntentVersion: String(nextOperationVersion),
      economicPaymentIntentId: command.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: String(command.expectedEconomicPaymentVersion),
      economicPaymentSessionId: command.evidence.economicPaymentSessionId,
      seriesId: command.evidence.providerAccount.seriesId,
      providerAccountId: command.evidence.providerAccount.providerAccountId,
      providerIdentityVersion: command.evidence.providerAccount.identityVersion,
      purpose: command.evidence.purpose,
      sourceId: command.evidence.sourceId,
      operationKind: command.evidence.operationKind,
      outcome: command.evidence.outcome,
      providerOperationId: command.evidence.providerOperationId,
      providerPaymentId: command.evidence.providerPaymentId,
      amountMinor: command.evidence.amountMinor,
      currency: command.evidence.currency,
      canonicalRequestDigest: command.evidence.canonicalRequestDigest,
      idempotencyKey: command.evidence.idempotencyKey,
      evidenceArtifactId: command.evidence.artifact.artifactId,
      evidenceArtifactDigest: command.evidence.artifact.sha256Digest,
      observedAt: command.evidence.observedAt,
      resultCommittedAt: result.committedAt
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("provider_operation_result_receipt");
  return mapReceipt(receipt);
}

async function lockExactProviderBinding<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  binding: FinanceProviderAccountIdentity
): Promise<void> {
  const [account] = await transaction
    .select({ provider: financeProviderAccounts.provider })
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
  if (!account || account.provider !== "arc_pay") fail("provider_binding_not_found");
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
    intent.purpose !== command.evidence.purpose ||
    intent.sourceId !== command.evidence.sourceId ||
    intent.seriesId !== command.evidence.providerAccount.seriesId ||
    intent.providerAccountId !== command.evidence.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== command.evidence.providerAccount.identityVersion
  ) {
    fail("economic_payment_correlation_conflict");
  }
  return intent;
}

async function lockProviderOperation<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [operation] = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, command.providerOperationIntentId))
    .limit(1)
    .for("update");
  if (!operation) fail("provider_operation_not_found");
  return operation;
}

async function findExistingResult<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
) {
  const [result] = await transaction
    .select()
    .from(financeProviderOperationResults)
    .where(
      and(
        eq(
          financeProviderOperationResults.providerOperationIntentId,
          command.providerOperationIntentId
        ),
        eq(
          financeProviderOperationResults.providerOperationIntentVersion,
          String(command.expectedProviderOperationIntentVersion + 1)
        )
      )
    )
    .limit(1)
    .for("share");
  return result;
}

async function replayExistingResult<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  result: typeof financeProviderOperationResults.$inferSelect
): Promise<ProviderOperationResultCommitReceipt> {
  if (!sameResult(result, command)) fail("provider_evidence_conflict");
  const [receipt] = await transaction
    .select()
    .from(financeProviderOperationResultCommitReceipts)
    .where(eq(financeProviderOperationResultCommitReceipts.providerOperationResultId, result.id))
    .limit(1)
    .for("share");
  if (!receipt) fail("persistence_write_incomplete");
  return mapReceipt(receipt);
}

function assertOperationCorrelation(
  operation: typeof financeProviderOperationIntents.$inferSelect,
  command: NormalizedCommand
): void {
  const evidence = command.evidence;
  if (
    operation.economicPaymentIntentId !== command.economicPaymentIntentId ||
    operation.economicPaymentSessionId !== evidence.economicPaymentSessionId ||
    operation.seriesId !== evidence.providerAccount.seriesId ||
    operation.providerAccountId !== evidence.providerAccount.providerAccountId ||
    operation.providerIdentityVersion !== evidence.providerAccount.identityVersion ||
    operation.purpose !== evidence.purpose ||
    operation.sourceId !== evidence.sourceId ||
    operation.operationKind !== evidence.operationKind ||
    operation.canonicalRequestDigest !== evidence.canonicalRequestDigest ||
    operation.idempotencyKey !== evidence.idempotencyKey
  ) {
    fail("provider_operation_correlation_conflict");
  }
}

function assertCaptureResultMoney(
  economicIntent: typeof financeEconomicPaymentIntents.$inferSelect,
  command: NormalizedCommand
): void {
  const evidence = command.evidence;
  if (
    evidence.outcome !== "succeeded" ||
    (evidence.operationKind !== "card_setup" &&
      evidence.operationKind !== "card_setup_execute" &&
      evidence.operationKind !== "card_setup_3ds_method_complete" &&
      evidence.operationKind !== "saved_card_charge" &&
      evidence.operationKind !== "saved_card_charge_3ds_method_complete")
  ) {
    return;
  }
  const expectedAmountMinor = encodeFinanceNumeric38(economicIntent.amountMinor);
  if (
    evidence.providerPaymentId === null ||
    evidence.amountMinor === null ||
    evidence.currency !== "RUB" ||
    evidence.amountMinor !== expectedAmountMinor ||
    ((evidence.operationKind === "card_setup" || evidence.operationKind === "card_setup_execute" || evidence.operationKind === "card_setup_3ds_method_complete")
      ? expectedAmountMinor !== "0"
      : BigInt(expectedAmountMinor) <= 0n)
  ) {
    fail("provider_evidence_conflict");
  }
}

async function lockEconomicSession<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
): Promise<void> {
  if (command.evidence.economicPaymentSessionId === null) return;
  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, command.evidence.economicPaymentSessionId))
    .limit(1)
    .for("share");
  if (
    !session ||
    session.economicPaymentIntentId !== command.economicPaymentIntentId ||
    session.seriesId !== command.evidence.providerAccount.seriesId ||
    session.providerAccountId !== command.evidence.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== command.evidence.providerAccount.identityVersion
  ) {
    fail("economic_payment_session_not_found");
  }
}

async function validateEvidenceArtifact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand
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
    .where(eq(financeArtifacts.id, command.evidence.artifact.artifactId))
    .limit(1)
    .for("share", { of: financeArtifacts });
  if (!row) fail("evidence_artifact_not_found");
  const byteLength = safeByteLength(row.artifact.byteLength);
  if (
    row.tombstoneArtifactId !== null ||
    (row.artifact.artifactClass !== "provider_response" &&
      row.artifact.artifactClass !== "provider_canonical_read") ||
    row.artifact.bindingKind !== "provider" ||
    row.artifact.seriesId !== command.evidence.providerAccount.seriesId ||
    row.artifact.providerAccountId !== command.evidence.providerAccount.providerAccountId ||
    row.artifact.providerIdentityVersion !== command.evidence.providerAccount.identityVersion ||
    row.artifact.sha256Digest !== command.evidence.artifact.sha256Digest ||
    byteLength !== command.evidence.artifact.byteLength ||
    byteLength > command.operationEnvelope.maximumArtifactBytes
  ) {
    fail("evidence_artifact_conflict");
  }
}

function normalizeCommand(command: ApplyVerifiedProviderResultCommand): NormalizedCommand {
  try {
    assertExactOwnDataKeys(command, [
      "economicPaymentIntentId",
      "expectedEconomicPaymentVersion",
      "providerOperationIntentId",
      "expectedProviderOperationIntentVersion",
      "evidence",
      "operationEnvelope"
    ]);
    if (
      !Number.isSafeInteger(command.expectedEconomicPaymentVersion) ||
      command.expectedEconomicPaymentVersion < 1 ||
      !Number.isSafeInteger(command.expectedProviderOperationIntentVersion) ||
      command.expectedProviderOperationIntentVersion < 0 ||
      command.expectedProviderOperationIntentVersion === Number.MAX_SAFE_INTEGER
    ) {
      fail("invalid_command");
    }
    const evidence = normalizeEvidence(command.evidence);
    const economicPaymentIntentId = identifier(command.economicPaymentIntentId);
    const providerOperationIntentId = identifier(command.providerOperationIntentId);
    if (
      evidence.economicPaymentIntentId !== economicPaymentIntentId ||
      evidence.providerOperationIntentId !== providerOperationIntentId
    ) {
      fail("invalid_command");
    }
    return Object.freeze({
      economicPaymentIntentId,
      expectedEconomicPaymentVersion: command.expectedEconomicPaymentVersion,
      providerOperationIntentId,
      expectedProviderOperationIntentVersion: command.expectedProviderOperationIntentVersion,
      evidence,
      operationEnvelope: resolvedOperationEnvelope(command.operationEnvelope)
    });
  } catch (error) {
    if (error instanceof ProviderOperationResultApplicationPersistenceError) throw error;
    fail("invalid_command");
  }
}

function normalizeEvidence(
  value: VerifiedProviderOperationEvidence
): NormalizedCommand["evidence"] {
  assertExactOwnDataKeys(value, [
    "kind",
    "providerAccount",
    "economicPaymentIntentId",
    "economicPaymentSessionId",
    "sourceId",
    "purpose",
    "providerOperationIntentId",
    "operationKind",
    "providerOperationId",
    "canonicalRequestDigest",
    "idempotencyKey",
    "outcome",
    "providerPaymentId",
    "amountMinor",
    "currency",
    "artifact",
    "observedAt"
  ]);
  if (value.kind !== "verified_provider_operation_evidence") fail("invalid_command");
  const providerAccount = createProviderAccountIdentityBinding(value.providerAccount);
  const purposeValue = purpose(value.purpose);
  const operationKind = operation(value.operationKind);
  assertPurposeOperationMatrix(purposeValue, operationKind, value.economicPaymentSessionId);
  const amountMinor = value.amountMinor === null ? null : encodeFinanceNumeric38(value.amountMinor);
  if (
    (amountMinor === null) !== (value.currency === null) ||
    (amountMinor !== null && (BigInt(amountMinor) < 0n || value.currency !== "RUB"))
  ) {
    fail("invalid_command");
  }
  return Object.freeze({
    providerAccount,
    economicPaymentIntentId: identifier(value.economicPaymentIntentId),
    economicPaymentSessionId:
      value.economicPaymentSessionId === null ? null : identifier(value.economicPaymentSessionId),
    sourceId: identifier(value.sourceId),
    purpose: purposeValue,
    providerOperationIntentId: identifier(value.providerOperationIntentId),
    operationKind,
    providerOperationId: identifier(value.providerOperationId),
    canonicalRequestDigest: digest(value.canonicalRequestDigest),
    idempotencyKey: idempotencyKey(value.idempotencyKey),
    outcome: outcome(value.outcome),
    providerPaymentId:
      value.providerPaymentId === null ? null : identifier(value.providerPaymentId),
    amountMinor,
    currency: value.currency,
    artifact: artifactRef(value.artifact),
    observedAt: instant(value.observedAt)
  });
}

function sameResult(
  row: typeof financeProviderOperationResults.$inferSelect,
  command: NormalizedCommand
): boolean {
  const evidence = command.evidence;
  return (
    row.providerOperationIntentId === command.providerOperationIntentId &&
    safeVersion(row.providerOperationIntentVersion, false) ===
      command.expectedProviderOperationIntentVersion + 1 &&
    safeVersion(row.correlatedEconomicPaymentVersion, true) ===
      command.expectedEconomicPaymentVersion &&
    row.seriesId === evidence.providerAccount.seriesId &&
    row.providerAccountId === evidence.providerAccount.providerAccountId &&
    row.providerIdentityVersion === evidence.providerAccount.identityVersion &&
    row.outcome === evidence.outcome &&
    row.providerOperationId === evidence.providerOperationId &&
    row.providerPaymentId === evidence.providerPaymentId &&
    row.amountMinor === evidence.amountMinor &&
    row.currency === evidence.currency &&
    row.canonicalRequestDigest === evidence.canonicalRequestDigest &&
    row.idempotencyKey === evidence.idempotencyKey &&
    row.evidenceArtifactId === evidence.artifact.artifactId &&
    row.evidenceArtifactDigest === evidence.artifact.sha256Digest &&
    row.observedAt.getTime() === evidence.observedAt.getTime()
  );
}

function mapReceipt(
  row: typeof financeProviderOperationResultCommitReceipts.$inferSelect
): ProviderOperationResultCommitReceipt {
  const providerOperationIntentVersion = safeVersion(row.providerOperationIntentVersion, false);
  const correlatedEconomicPaymentVersion = safeVersion(row.correlatedEconomicPaymentVersion, true);
  if (
    !digestPattern.test(row.canonicalRequestDigest) ||
    !digestPattern.test(row.evidenceArtifactDigest) ||
    !digestPattern.test(row.canonicalDigest) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !(row.committedAt instanceof Date) ||
    !(row.observedAt instanceof Date) ||
    Number.isNaN(row.committedAt.getTime()) ||
    Number.isNaN(row.observedAt.getTime())
  ) {
    fail("persistence_write_incomplete");
  }
  const receipt = Object.freeze({
    kind: "provider_operation_result_commit_receipt" as const,
    providerOperationResultId: row.providerOperationResultId,
    providerOperationIntentId: row.providerOperationIntentId,
    providerOperationIntentVersion,
    providerOperationId: row.providerOperationId,
    operationKind: operationFromPersistence(row.operationKind),
    economicPaymentIntentId: row.economicPaymentIntentId,
    correlatedEconomicPaymentVersion,
    economicPaymentSessionId: row.economicPaymentSessionId,
    sourceId: row.sourceId,
    purpose: purposeFromPersistence(row.purpose),
    providerAccount: createProviderAccountIdentityBinding({
      seriesId: row.seriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.providerIdentityVersion
    }),
    outcome: outcomeFromPersistence(row.outcome),
    providerPaymentId: row.providerPaymentId,
    amountMinor: row.amountMinor === null ? null : encodeFinanceNumeric38(row.amountMinor),
    currency: currencyFromPersistence(row.currency),
    evidenceArtifactId: row.evidenceArtifactId,
    evidenceArtifactDigest: row.evidenceArtifactDigest as FinanceDigest,
    canonicalRequestDigest: row.canonicalRequestDigest as FinanceDigest,
    observedAt: row.observedAt.toISOString(),
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
    committedAt: row.committedAt.toISOString()
  });
  return receipt as unknown as ProviderOperationResultCommitReceipt;
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
  const result = Object.freeze({
    artifactId: identifier(artifact.artifactId),
    sha256Digest: digest(artifact.sha256Digest),
    byteLength: artifact.byteLength
  });
  if (!Number.isSafeInteger(result.byteLength) || result.byteLength < 1) fail("invalid_command");
  return result;
}

function assertPurposeOperationMatrix(
  purposeValue: Purpose,
  operationKind: OperationKind,
  economicPaymentSessionId: unknown
): void {
  const allowed =
    (operationKind === "checkout_session_create" && purposeValue === "client_order") ||
    ((operationKind === "card_setup" || operationKind === "card_setup_execute" || operationKind === "card_setup_3ds_method_complete") &&
      purposeValue === "platform_card_setup") ||
    ((operationKind === "saved_card_charge" || operationKind === "saved_card_charge_3ds_method_complete") && purposeValue === "platform_invoice") ||
    (operationKind === "refund" && purposeValue === "client_order") ||
    (operationKind === "void" &&
      (purposeValue === "client_order" || purposeValue === "platform_invoice"));
  const requiresSession =
    operationKind === "checkout_session_create" ||
    operationKind === "card_setup" ||
    operationKind === "card_setup_execute" ||
    operationKind === "card_setup_3ds_method_complete" ||
    operationKind === "saved_card_charge" ||
    operationKind === "saved_card_charge_3ds_method_complete";
  if (
    !allowed ||
    (requiresSession ? economicPaymentSessionId === null : economicPaymentSessionId !== null)
  ) {
    fail("invalid_command");
  }
}

const digestPattern = /^sha256:[a-f0-9]{64}$/;

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    containsAsciiControl(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function containsAsciiControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
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

function purpose(value: unknown): Purpose {
  if (value !== "client_order" && value !== "platform_invoice" && value !== "platform_card_setup") {
    fail("invalid_command");
  }
  return value;
}

function purposeFromPersistence(value: unknown): Purpose {
  try {
    return purpose(value);
  } catch {
    fail("persistence_write_incomplete");
  }
}

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
  ) {
    fail("invalid_command");
  }
  return value;
}

function operationFromPersistence(value: unknown): OperationKind {
  try {
    return operation(value);
  } catch {
    fail("persistence_write_incomplete");
  }
}

function outcome(value: unknown): Outcome {
  if (value !== "succeeded" && value !== "failed" && value !== "ambiguous") {
    fail("invalid_command");
  }
  return value;
}

function outcomeFromPersistence(value: unknown): Outcome {
  try {
    return outcome(value);
  } catch {
    fail("persistence_write_incomplete");
  }
}

function currencyFromPersistence(value: unknown): "RUB" | null {
  if (value !== null && value !== "RUB") fail("persistence_write_incomplete");
  return value;
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

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_command");
  return Number(value);
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
  if (!Number.isSafeInteger(parsed)) fail("evidence_artifact_conflict");
  return parsed;
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

function fail(reason: ProviderOperationResultApplicationPersistenceReason): never {
  throw new ProviderOperationResultApplicationPersistenceError(reason);
}
