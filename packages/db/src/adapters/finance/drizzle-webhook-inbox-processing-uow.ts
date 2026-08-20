/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";

import {
  createProviderAccountIdentityBinding,
  type ApplyVerifiedProviderCanonicalSemanticFactCommand,
  type ApplyVerifiedWebhookSemanticFactCommand,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type ResolvedFinanceOperationEnvelope,
  type VerifiedWebhookSemanticEvidence,
  type WebhookInboxProcessingUnitOfWork,
  type WebhookSemanticCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import {
  financeArtifactTombstones,
  financeArtifacts
} from "../../schema/finance/finance-artifacts.schema";
import {
  financeProviderSemanticFacts,
  financeWebhookInbox,
  financeWebhookSemanticCommitReceipts
} from "../../schema/finance/webhook-inbox.schema";
import {
  decodeFinancePositiveRevision,
  decodeFinanceUnsignedRevision,
  encodeFinanceNumeric38
} from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

const commandKeys = [
  "inboxItemId",
  "expectedInboxVersion",
  "expectedCheckpointSequence",
  "processorVersion",
  "semanticEvidence",
  "operationEnvelope"
] as const;
const semanticCommonKeys = [
  "kind",
  "sourceDelivery",
  "providerAccount",
  "webhookId",
  "semanticSourceKind",
  "semanticSourceId",
  "economicPaymentIntentId",
  "economicPaymentSessionId",
  "providerPaymentId",
  "amountMinor",
  "currency",
  "purpose",
  "canonicalFactDigest",
  "artifact",
  "observedAt"
] as const;
const providerIdentityKeys = ["seriesId", "providerAccountId", "identityVersion"] as const;
const artifactKeys = ["artifactId", "sha256Digest", "byteLength"] as const;
const envelopeKeys = [
  "kind",
  "policyId",
  "policyVersion",
  "policyDigest",
  "maximumRows",
  "maximumDecimalDigits",
  "maximumArtifactBytes"
] as const;

export const webhookInboxProcessingWriteBoundaryValues = Object.freeze([
  "inbox_completion",
  "semantic_fact",
  "semantic_commit_receipt"
] as const);

export type WebhookInboxProcessingWriteBoundary =
  (typeof webhookInboxProcessingWriteBoundaryValues)[number];

export type WebhookInboxProcessingFailureInjector = (
  boundary: WebhookInboxProcessingWriteBoundary
) => void | Promise<void>;

export type WebhookInboxProcessingPersistenceReason =
  | "invalid_command"
  | "inbox_not_claimed"
  | "inbox_version_conflict"
  | "inbox_correlation_conflict"
  | "economic_payment_not_found"
  | "economic_payment_correlation_conflict"
  | "economic_payment_session_not_found"
  | "evidence_artifact_not_found"
  | "evidence_artifact_conflict"
  | "semantic_fact_conflict"
  | "semantic_receipt_missing"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class WebhookInboxProcessingPersistenceError extends Error {
  readonly code = "webhook_inbox_processing_persistence_error";

  constructor(readonly reason: WebhookInboxProcessingPersistenceReason) {
    super("Verified webhook semantic fact could not be committed atomically");
    this.name = "WebhookInboxProcessingPersistenceError";
  }
}

export type NormalizedVerifiedWebhookSemanticFactCommand = Readonly<{
  inboxItemId: string;
  expectedInboxVersion: number;
  expectedCheckpointSequence: number;
  processorVersion: number;
  semanticEvidence: Readonly<{
    providerAccount: FinanceProviderAccountIdentity;
    sourceDelivery: "webhook" | "provider_canonical_read";
    webhookId: string | null;
    semanticSourceKind: "payment_transition" | "refund" | "chargeback" | "settlement_entry";
    semanticSourceId: string;
    economicPaymentIntentId: string;
    economicPaymentSessionId: string | null;
    providerPaymentId: string | null;
    amountMinor: bigint | null;
    currency: "RUB" | null;
    purpose: "client_order" | "platform_invoice" | "platform_card_setup";
    canonicalFactDigest: FinanceDigest;
    artifact: Readonly<{ artifactId: string; sha256Digest: FinanceDigest; byteLength: number }>;
    observedAt: Date;
  }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type NormalizedVerifiedProviderCanonicalSemanticFactCommand = Omit<
  NormalizedVerifiedWebhookSemanticFactCommand,
  "inboxItemId" | "expectedInboxVersion" | "expectedCheckpointSequence"
>;

/**
 * Applies one canonical semantic fact only after a separate worker has claimed the inbox item.
 * It never creates payment transitions, wallet mutations, journal postings, or capture receipts.
 */
export function createDrizzleWebhookInboxProcessingUnitOfWork<
  TSchema extends Record<string, unknown>
>(
  input: Readonly<{
    database: NodePgDatabase<TSchema>;
    workerId: string;
    afterWriteBoundary?: WebhookInboxProcessingFailureInjector;
  }>
): WebhookInboxProcessingUnitOfWork {
  const workerId = identifier(input.workerId);
  return Object.freeze({
    async applyVerifiedSemanticFact(command) {
      const normalized = normalizeVerifiedWebhookSemanticFactCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          applyNormalizedWebhookSemanticFactInTransaction(
            transaction,
            workerId,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof WebhookInboxProcessingPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("semantic_fact_conflict");
        if (code === "23503" || code === "23514" || code === "55000") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies WebhookInboxProcessingUnitOfWork);
}

/**
 * Composition hook for a larger PostgreSQL transaction. It intentionally does not open or commit
 * a transaction, so a semantic receipt can be consumed by the client-order capture boundary
 * before either fact becomes durable.
 */
export async function applyVerifiedWebhookSemanticFactInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  workerId: string,
  input: ApplyVerifiedWebhookSemanticFactCommand,
  afterWriteBoundary: WebhookInboxProcessingFailureInjector = noFailureInjection
): Promise<WebhookSemanticCommitReceipt> {
  return applyNormalizedWebhookSemanticFactInTransaction(
    transaction,
    identifier(workerId),
    normalizeVerifiedWebhookSemanticFactCommand(input),
    afterWriteBoundary
  );
}

export async function applyVerifiedProviderCanonicalSemanticFactInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  input: ApplyVerifiedProviderCanonicalSemanticFactCommand,
  afterWriteBoundary: WebhookInboxProcessingFailureInjector = noFailureInjection
): Promise<WebhookSemanticCommitReceipt> {
  return applyNormalizedProviderCanonicalSemanticFactInTransaction(
    transaction,
    normalizeVerifiedProviderCanonicalSemanticFactCommand(input),
    afterWriteBoundary
  );
}

async function applyNormalizedWebhookSemanticFactInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  workerId: string,
  command: NormalizedVerifiedWebhookSemanticFactCommand,
  afterWriteBoundary: WebhookInboxProcessingFailureInjector
): Promise<WebhookSemanticCommitReceipt> {
  const inbox = await lockClaimedInbox(transaction, workerId, command);
  await lockEconomicFacts(transaction, command);
  await validateCanonicalArtifact(transaction, command);
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(
    ${semanticAdvisoryKey(command.semanticEvidence)}, 0
  ))`);

  const existing = await findSemanticFact(transaction, command.semanticEvidence);
  if (existing) assertExistingSemanticFact(existing, command.semanticEvidence);

  const completed = await completeInbox(transaction, workerId, inbox.leaseFence, command);
  await afterWriteBoundary("inbox_completion");

  if (existing) {
    const receipt = await findSemanticReceipt(transaction, existing.id);
    if (!receipt) fail("semantic_receipt_missing");
    return mapReceipt(receipt, "semantic_replay");
  }

  const semanticFactId = semanticFactIdFor(command.semanticEvidence);
  const [semanticFact] = await transaction
    .insert(financeProviderSemanticFacts)
    .values({
      id: semanticFactId,
      inboxItemId: command.inboxItemId,
      seriesId: command.semanticEvidence.providerAccount.seriesId,
      providerAccountId: command.semanticEvidence.providerAccount.providerAccountId,
      providerIdentityVersion: command.semanticEvidence.providerAccount.identityVersion,
      economicPaymentIntentId: command.semanticEvidence.economicPaymentIntentId,
      economicPaymentSessionId: command.semanticEvidence.economicPaymentSessionId,
      semanticSourceKind: command.semanticEvidence.semanticSourceKind,
      semanticSourceId: command.semanticEvidence.semanticSourceId,
      providerPaymentId: command.semanticEvidence.providerPaymentId,
      amountMinor:
        command.semanticEvidence.amountMinor === null
          ? null
          : encodeFinanceNumeric38(command.semanticEvidence.amountMinor),
      currency: command.semanticEvidence.currency,
      purpose: command.semanticEvidence.purpose,
      canonicalFactDigest: command.semanticEvidence.canonicalFactDigest,
      evidenceArtifactId: command.semanticEvidence.artifact.artifactId,
      evidenceArtifactDigest: command.semanticEvidence.artifact.sha256Digest,
      effectDisposition: "applied_once",
      observedAt: command.semanticEvidence.observedAt
    })
    .returning();
  if (!semanticFact || completed.issuedVersion < 2) fail("persistence_write_incomplete");
  await afterWriteBoundary("semantic_fact");

  const [receipt] = await transaction
    .insert(financeWebhookSemanticCommitReceipts)
    .values({
      semanticFactId: semanticFact.id,
      inboxItemId: semanticFact.inboxItemId,
      inboxVersion: String(completed.issuedVersion),
      checkpointSequence: String(command.expectedCheckpointSequence),
      processingStatus: "completed",
      seriesId: semanticFact.seriesId,
      providerAccountId: semanticFact.providerAccountId,
      providerIdentityVersion: semanticFact.providerIdentityVersion,
      economicPaymentIntentId: semanticFact.economicPaymentIntentId,
      economicPaymentSessionId: semanticFact.economicPaymentSessionId,
      semanticSourceKind: semanticFact.semanticSourceKind,
      semanticSourceId: semanticFact.semanticSourceId,
      providerPaymentId: semanticFact.providerPaymentId,
      amountMinor: semanticFact.amountMinor,
      currency: semanticFact.currency,
      purpose: semanticFact.purpose,
      canonicalFactDigest: semanticFact.canonicalFactDigest,
      evidenceArtifactId: semanticFact.evidenceArtifactId,
      evidenceArtifactDigest: semanticFact.evidenceArtifactDigest,
      effectDisposition: semanticFact.effectDisposition,
      observedAt: semanticFact.observedAt,
      semanticFactCommittedAt: semanticFact.committedAt
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("semantic_commit_receipt");
  return mapReceipt(receipt, "applied_once");
}

async function applyNormalizedProviderCanonicalSemanticFactInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedVerifiedProviderCanonicalSemanticFactCommand,
  afterWriteBoundary: WebhookInboxProcessingFailureInjector
): Promise<WebhookSemanticCommitReceipt> {
  if (
    command.semanticEvidence.sourceDelivery !== "provider_canonical_read" ||
    command.semanticEvidence.webhookId !== null
  ) {
    fail("invalid_command");
  }
  await lockEconomicFacts(transaction, command);
  await validateCanonicalArtifact(transaction, command);
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(
    ${semanticAdvisoryKey(command.semanticEvidence)}, 0
  ))`);

  const existing = await findSemanticFact(transaction, command.semanticEvidence);
  if (existing) {
    assertExistingSemanticFact(existing, command.semanticEvidence);
    const existingReceipt = await findSemanticReceipt(transaction, existing.id);
    if (!existingReceipt) fail("semantic_receipt_missing");
    return mapReceipt(existingReceipt, "semantic_replay");
  }

  const semanticFactId = semanticFactIdFor(command.semanticEvidence);
  const [semanticFact] = await transaction
    .insert(financeProviderSemanticFacts)
    .values({
      id: semanticFactId,
      inboxItemId: null,
      seriesId: command.semanticEvidence.providerAccount.seriesId,
      providerAccountId: command.semanticEvidence.providerAccount.providerAccountId,
      providerIdentityVersion: command.semanticEvidence.providerAccount.identityVersion,
      economicPaymentIntentId: command.semanticEvidence.economicPaymentIntentId,
      economicPaymentSessionId: command.semanticEvidence.economicPaymentSessionId,
      semanticSourceKind: command.semanticEvidence.semanticSourceKind,
      semanticSourceId: command.semanticEvidence.semanticSourceId,
      providerPaymentId: command.semanticEvidence.providerPaymentId,
      amountMinor:
        command.semanticEvidence.amountMinor === null
          ? null
          : encodeFinanceNumeric38(command.semanticEvidence.amountMinor),
      currency: command.semanticEvidence.currency,
      purpose: command.semanticEvidence.purpose,
      canonicalFactDigest: command.semanticEvidence.canonicalFactDigest,
      evidenceArtifactId: command.semanticEvidence.artifact.artifactId,
      evidenceArtifactDigest: command.semanticEvidence.artifact.sha256Digest,
      effectDisposition: "applied_once",
      observedAt: command.semanticEvidence.observedAt
    })
    .returning();
  if (!semanticFact) fail("persistence_write_incomplete");
  await afterWriteBoundary("semantic_fact");

  const [receipt] = await transaction
    .insert(financeWebhookSemanticCommitReceipts)
    .values({
      semanticFactId: semanticFact.id,
      inboxItemId: null,
      inboxVersion: null,
      checkpointSequence: null,
      processingStatus: null,
      seriesId: semanticFact.seriesId,
      providerAccountId: semanticFact.providerAccountId,
      providerIdentityVersion: semanticFact.providerIdentityVersion,
      economicPaymentIntentId: semanticFact.economicPaymentIntentId,
      economicPaymentSessionId: semanticFact.economicPaymentSessionId,
      semanticSourceKind: semanticFact.semanticSourceKind,
      semanticSourceId: semanticFact.semanticSourceId,
      providerPaymentId: semanticFact.providerPaymentId,
      amountMinor: semanticFact.amountMinor,
      currency: semanticFact.currency,
      purpose: semanticFact.purpose,
      canonicalFactDigest: semanticFact.canonicalFactDigest,
      evidenceArtifactId: semanticFact.evidenceArtifactId,
      evidenceArtifactDigest: semanticFact.evidenceArtifactDigest,
      effectDisposition: semanticFact.effectDisposition,
      observedAt: semanticFact.observedAt,
      semanticFactCommittedAt: semanticFact.committedAt
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("semantic_commit_receipt");
  return mapReceipt(receipt, "applied_once");
}

async function lockClaimedInbox<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  workerId: string,
  command: NormalizedVerifiedWebhookSemanticFactCommand
): Promise<Readonly<{ leaseFence: number }>> {
  const [inbox] = await transaction
    .select()
    .from(financeWebhookInbox)
    .where(eq(financeWebhookInbox.id, command.inboxItemId))
    .limit(1)
    .for("update");
  if (!inbox) fail("inbox_not_claimed");
  const version = revision(inbox.version, false);
  if (version !== command.expectedInboxVersion) fail("inbox_version_conflict");
  if (
    inbox.processingStatus !== "processing" ||
    inbox.leaseOwnerId !== workerId ||
    inbox.leaseExpiresAt === null
  ) {
    fail("inbox_not_claimed");
  }
  if (
    inbox.seriesId !== command.semanticEvidence.providerAccount.seriesId ||
    inbox.providerAccountId !== command.semanticEvidence.providerAccount.providerAccountId ||
    inbox.providerIdentityVersion !== command.semanticEvidence.providerAccount.identityVersion ||
    inbox.transportEventId !== command.semanticEvidence.webhookId
  ) {
    fail("inbox_correlation_conflict");
  }
  if (revision(inbox.lastCheckpointSequence, true) + 1 !== command.expectedCheckpointSequence) {
    fail("inbox_version_conflict");
  }
  return Object.freeze({ leaseFence: revision(inbox.leaseFence, false) });
}

async function lockEconomicFacts<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: Pick<NormalizedVerifiedWebhookSemanticFactCommand, "semanticEvidence">
): Promise<void> {
  const evidence = command.semanticEvidence;
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, evidence.economicPaymentIntentId))
    .limit(1)
    .for("share");
  if (!intent) fail("economic_payment_not_found");
  if (
    intent.purpose !== evidence.purpose ||
    intent.seriesId !== evidence.providerAccount.seriesId ||
    intent.providerAccountId !== evidence.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== evidence.providerAccount.identityVersion
  )
    fail("economic_payment_correlation_conflict");
  if (evidence.semanticSourceKind === "payment_transition") {
    if (
      intent.amountMinor !== encodeFinanceNumeric38(evidence.amountMinor!) ||
      intent.currency !== evidence.currency
    )
      fail("economic_payment_correlation_conflict");
    const [session] = await transaction
      .select()
      .from(financeEconomicPaymentSessions)
      .where(eq(financeEconomicPaymentSessions.id, evidence.economicPaymentSessionId!))
      .limit(1)
      .for("share");
    if (
      !session ||
      session.economicPaymentIntentId !== intent.id ||
      session.seriesId !== intent.seriesId ||
      session.providerAccountId !== intent.providerAccountId ||
      session.providerIdentityVersion !== intent.providerIdentityVersion
    )
      fail("economic_payment_session_not_found");
  }
}

async function validateCanonicalArtifact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: Pick<
    NormalizedVerifiedWebhookSemanticFactCommand,
    "semanticEvidence" | "operationEnvelope"
  >
): Promise<void> {
  const evidence = command.semanticEvidence;
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
    .where(eq(financeArtifacts.id, evidence.artifact.artifactId))
    .limit(1)
    .for("share", { of: financeArtifacts });
  if (!row) fail("evidence_artifact_not_found");
  const byteLength = finiteNonNegativeNumber(row.artifact.byteLength);
  if (
    row.tombstoneArtifactId !== null ||
    row.artifact.artifactClass !== "provider_canonical_read" ||
    row.artifact.bindingKind !== "provider" ||
    row.artifact.seriesId !== evidence.providerAccount.seriesId ||
    row.artifact.providerAccountId !== evidence.providerAccount.providerAccountId ||
    row.artifact.providerIdentityVersion !== evidence.providerAccount.identityVersion ||
    row.artifact.sha256Digest !== evidence.artifact.sha256Digest ||
    byteLength !== evidence.artifact.byteLength ||
    byteLength > command.operationEnvelope.maximumArtifactBytes
  )
    fail("evidence_artifact_conflict");
}

async function findSemanticFact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  evidence: NormalizedVerifiedWebhookSemanticFactCommand["semanticEvidence"]
) {
  const [fact] = await transaction
    .select()
    .from(financeProviderSemanticFacts)
    .where(
      and(
        eq(financeProviderSemanticFacts.seriesId, evidence.providerAccount.seriesId),
        eq(
          financeProviderSemanticFacts.providerAccountId,
          evidence.providerAccount.providerAccountId
        ),
        eq(
          financeProviderSemanticFacts.providerIdentityVersion,
          evidence.providerAccount.identityVersion
        ),
        eq(financeProviderSemanticFacts.semanticSourceKind, evidence.semanticSourceKind),
        eq(financeProviderSemanticFacts.semanticSourceId, evidence.semanticSourceId)
      )
    )
    .limit(1)
    .for("update");
  return fact ?? null;
}

function assertExistingSemanticFact(
  fact: typeof financeProviderSemanticFacts.$inferSelect,
  evidence: NormalizedVerifiedWebhookSemanticFactCommand["semanticEvidence"]
): void {
  if (
    fact.economicPaymentIntentId !== evidence.economicPaymentIntentId ||
    fact.economicPaymentSessionId !== evidence.economicPaymentSessionId ||
    fact.providerPaymentId !== evidence.providerPaymentId ||
    fact.amountMinor !==
      (evidence.amountMinor === null ? null : encodeFinanceNumeric38(evidence.amountMinor)) ||
    fact.currency !== evidence.currency ||
    fact.purpose !== evidence.purpose ||
    fact.canonicalFactDigest !== evidence.canonicalFactDigest ||
    fact.evidenceArtifactId !== evidence.artifact.artifactId ||
    fact.evidenceArtifactDigest !== evidence.artifact.sha256Digest ||
    fact.effectDisposition !== "applied_once" ||
    fact.observedAt.getTime() !== evidence.observedAt.getTime()
  )
    fail("semantic_fact_conflict");
}

async function completeInbox<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  workerId: string,
  leaseFence: number,
  command: NormalizedVerifiedWebhookSemanticFactCommand
): Promise<Readonly<{ issuedVersion: number }>> {
  const result = await transaction.execute(sql`
    select issued_version, committed_checkpoint_sequence
    from finance_complete_webhook_inbox(
      ${command.inboxItemId},
      ${workerId},
      ${String(command.expectedInboxVersion)},
      ${String(leaseFence)},
      'completed',
      ${String(command.expectedCheckpointSequence)},
      ${String(command.processorVersion)},
      'canonical_semantic_fact_applied',
      'canonical_semantic_fact_applied'
    )
  `);
  const row = firstRow(result);
  const issuedVersion = revision(row?.issued_version, false);
  const committedCheckpointSequence = revision(row?.committed_checkpoint_sequence, false);
  if (committedCheckpointSequence !== command.expectedCheckpointSequence) {
    fail("persistence_write_incomplete");
  }
  return Object.freeze({ issuedVersion });
}

async function findSemanticReceipt<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  semanticFactId: string
) {
  const [receipt] = await transaction
    .select()
    .from(financeWebhookSemanticCommitReceipts)
    .where(eq(financeWebhookSemanticCommitReceipts.semanticFactId, semanticFactId))
    .limit(1)
    .for("share");
  return receipt ?? null;
}

function mapReceipt(
  row: typeof financeWebhookSemanticCommitReceipts.$inferSelect,
  businessEffect: WebhookSemanticCommitReceipt["businessEffect"]
): WebhookSemanticCommitReceipt {
  if (
    !isDigest(row.canonicalFactDigest) ||
    !isDigest(row.evidenceArtifactDigest) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !(row.observedAt instanceof Date) ||
    !(row.committedAt instanceof Date) ||
    Number.isNaN(row.observedAt.getTime()) ||
    Number.isNaN(row.committedAt.getTime())
  )
    fail("persistence_write_incomplete");
  const sourceKind = semanticSourceKind(row.semanticSourceKind);
  const sourceDelivery = row.inboxItemId === null ? "provider_canonical_read" : "webhook";
  const receipt = Object.freeze({
    kind: "webhook_semantic_commit_receipt" as const,
    sourceDelivery,
    receiptId: row.id,
    inboxItemId: row.inboxItemId,
    inboxVersion: row.inboxVersion === null ? null : revision(row.inboxVersion, false),
    committedCheckpointSequence:
      row.checkpointSequence === null ? null : revision(row.checkpointSequence, false),
    semanticFactId: row.semanticFactId,
    semanticSourceKind: sourceKind,
    semanticSourceId: row.semanticSourceId,
    providerAccount: createProviderAccountIdentityBinding({
      seriesId: row.seriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.providerIdentityVersion
    }),
    economicPaymentIntentId: row.economicPaymentIntentId,
    economicPaymentSessionId: row.economicPaymentSessionId,
    purpose: purpose(row.purpose),
    providerPaymentId: row.providerPaymentId,
    amountMinor: row.amountMinor,
    currency: currency(row.currency),
    canonicalFactDigest: row.canonicalFactDigest as FinanceDigest,
    evidenceArtifactId: row.evidenceArtifactId,
    evidenceArtifactDigest: row.evidenceArtifactDigest as FinanceDigest,
    observedAt: row.observedAt.toISOString(),
    businessEffect,
    walletJournalCommitReceipt: null,
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
    committedAt: row.committedAt.toISOString()
  });
  return receipt as unknown as WebhookSemanticCommitReceipt;
}

export function normalizeVerifiedWebhookSemanticFactCommand(
  command: ApplyVerifiedWebhookSemanticFactCommand
): NormalizedVerifiedWebhookSemanticFactCommand {
  return boundary(() => {
    exactRecord(command, commandKeys);
    const expectedInboxVersion = positiveInteger(command.expectedInboxVersion);
    const expectedCheckpointSequence = positiveInteger(command.expectedCheckpointSequence);
    const processorVersion = positiveInteger(command.processorVersion);
    const semanticEvidence = normalizeSemanticEvidence(command.semanticEvidence);
    if (semanticEvidence.sourceDelivery !== "webhook" || semanticEvidence.webhookId === null) {
      fail("invalid_command");
    }
    const operationEnvelope = normalizeEnvelope(command.operationEnvelope);
    if (semanticEvidence.artifact.byteLength > operationEnvelope.maximumArtifactBytes)
      fail("invalid_command");
    return Object.freeze({
      inboxItemId: identifier(command.inboxItemId),
      expectedInboxVersion,
      expectedCheckpointSequence,
      processorVersion,
      semanticEvidence,
      operationEnvelope
    });
  });
}

export function normalizeVerifiedProviderCanonicalSemanticFactCommand(
  command: ApplyVerifiedProviderCanonicalSemanticFactCommand
): NormalizedVerifiedProviderCanonicalSemanticFactCommand {
  return boundary(() => {
    exactRecord(command, ["processorVersion", "semanticEvidence", "operationEnvelope"]);
    const processorVersion = positiveInteger(command.processorVersion);
    const semanticEvidence = normalizeSemanticEvidence(command.semanticEvidence);
    if (
      semanticEvidence.sourceDelivery !== "provider_canonical_read" ||
      semanticEvidence.webhookId !== null
    ) {
      fail("invalid_command");
    }
    const operationEnvelope = normalizeEnvelope(command.operationEnvelope);
    if (semanticEvidence.artifact.byteLength > operationEnvelope.maximumArtifactBytes) {
      fail("invalid_command");
    }
    return Object.freeze({ processorVersion, semanticEvidence, operationEnvelope });
  });
}

function normalizeSemanticEvidence(value: VerifiedWebhookSemanticEvidence) {
  exactRecord(value, semanticCommonKeys);
  if (value.kind !== "verified_webhook_semantic_evidence") fail("invalid_command");
  const raw = value as unknown as Readonly<{
    providerAccount: unknown;
    sourceDelivery: unknown;
    webhookId: unknown;
    semanticSourceKind: unknown;
    semanticSourceId: unknown;
    economicPaymentIntentId: unknown;
    economicPaymentSessionId: unknown;
    providerPaymentId: unknown;
    amountMinor: unknown;
    currency: unknown;
    purpose: unknown;
    canonicalFactDigest: unknown;
    artifact: unknown;
    observedAt: unknown;
  }>;
  exactRecord(raw.providerAccount, providerIdentityKeys);
  const providerAccount = createProviderAccountIdentityBinding(raw.providerAccount);
  const sourceKind = semanticSourceKind(raw.semanticSourceKind);
  const sourceDelivery = sourceDeliveryKind(raw.sourceDelivery);
  const economicPaymentIntentId = identifier(raw.economicPaymentIntentId);
  const result = {
    providerAccount,
    sourceDelivery,
    webhookId: raw.webhookId === null ? null : identifier(raw.webhookId),
    semanticSourceKind: sourceKind,
    semanticSourceId: identifier(raw.semanticSourceId),
    economicPaymentIntentId,
    economicPaymentSessionId:
      raw.economicPaymentSessionId === null ? null : identifier(raw.economicPaymentSessionId),
    providerPaymentId: raw.providerPaymentId === null ? null : identifier(raw.providerPaymentId),
    amountMinor: raw.amountMinor === null ? null : BigInt(encodeFinanceNumeric38(raw.amountMinor)),
    currency: currency(raw.currency),
    purpose: purpose(raw.purpose),
    canonicalFactDigest: digest(raw.canonicalFactDigest),
    artifact: normalizeArtifact(raw.artifact),
    observedAt: instant(raw.observedAt)
  };
  const transition = sourceKind === "payment_transition";
  if (
    (sourceDelivery === "webhook" && result.webhookId === null) ||
    (sourceDelivery === "provider_canonical_read" && result.webhookId !== null) ||
    (transition &&
      (result.economicPaymentSessionId === null ||
        result.providerPaymentId === null ||
        result.amountMinor === null ||
        result.amountMinor < 0n ||
        result.currency !== "RUB")) ||
    (!transition &&
      (result.economicPaymentSessionId !== null ||
        result.providerPaymentId !== null ||
        result.amountMinor !== null ||
        result.currency !== null))
  )
    fail("invalid_command");
  return Object.freeze(result);
}

function normalizeArtifact(value: unknown) {
  exactRecord(value, artifactKeys);
  const artifact = value as Readonly<{
    artifactId: unknown;
    sha256Digest: unknown;
    byteLength: unknown;
  }>;
  const byteLength = positiveInteger(artifact.byteLength);
  return Object.freeze({
    artifactId: identifier(artifact.artifactId),
    sha256Digest: digest(artifact.sha256Digest),
    byteLength
  });
}

function normalizeEnvelope(value: unknown): ResolvedFinanceOperationEnvelope {
  exactRecord(value, envelopeKeys);
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

function semanticFactIdFor(
  evidence: NormalizedVerifiedWebhookSemanticFactCommand["semanticEvidence"]
): string {
  return `webhook-semantic:${createHash("sha256")
    .update(semanticAdvisoryKey(evidence), "utf8")
    .digest("hex")}`;
}

function semanticAdvisoryKey(
  evidence: NormalizedVerifiedWebhookSemanticFactCommand["semanticEvidence"]
): string {
  return [
    evidence.providerAccount.seriesId,
    evidence.providerAccount.providerAccountId,
    String(evidence.providerAccount.identityVersion),
    evidence.semanticSourceKind,
    evidence.semanticSourceId
  ].join("\n");
}

function boundary<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof WebhookInboxProcessingPersistenceError) throw error;
    fail("invalid_command");
  }
}

function exactRecord(value: unknown, expected: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) fail("invalid_command");
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail("invalid_command");
  return value;
}

function positiveInteger(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) === Number.MAX_SAFE_INTEGER
  ) {
    fail("invalid_command");
  }
  return Number(value);
}

function revision(value: unknown, allowZero: boolean): number {
  try {
    const decoded = allowZero
      ? decodeFinanceUnsignedRevision(value)
      : decodeFinancePositiveRevision(value);
    const parsed = Number(decoded);
    if (!Number.isSafeInteger(parsed)) fail("persistence_write_incomplete");
    return parsed;
  } catch (error) {
    if (error instanceof WebhookInboxProcessingPersistenceError) throw error;
    fail("persistence_write_incomplete");
  }
}

function finiteNonNegativeNumber(value: unknown): number {
  try {
    const parsed = Number(decodeFinanceUnsignedRevision(value));
    if (!Number.isSafeInteger(parsed)) fail("evidence_artifact_conflict");
    return parsed;
  } catch (error) {
    if (error instanceof WebhookInboxProcessingPersistenceError) throw error;
    fail("evidence_artifact_conflict");
  }
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !isDigest(value)) fail("invalid_command");
  return value;
}

function isDigest(value: string): value is FinanceDigest {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function instant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    fail("invalid_command");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail("invalid_command");
  return parsed;
}

function semanticSourceKind(
  value: unknown
): NormalizedVerifiedWebhookSemanticFactCommand["semanticEvidence"]["semanticSourceKind"] {
  if (
    value !== "payment_transition" &&
    value !== "refund" &&
    value !== "chargeback" &&
    value !== "settlement_entry"
  ) {
    fail("invalid_command");
  }
  return value;
}

function sourceDeliveryKind(value: unknown): "webhook" | "provider_canonical_read" {
  if (value !== "webhook" && value !== "provider_canonical_read") fail("invalid_command");
  return value;
}

function purpose(
  value: unknown
): NormalizedVerifiedWebhookSemanticFactCommand["semanticEvidence"]["purpose"] {
  if (value !== "client_order" && value !== "platform_invoice" && value !== "platform_card_setup") {
    fail("invalid_command");
  }
  return value;
}

function currency(value: unknown): "RUB" | null {
  if (value !== "RUB" && value !== null) fail("invalid_command");
  return value;
}

function firstRow(result: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof result !== "object" || result === null) return null;
  const rows = (result as Readonly<{ rows?: unknown }>).rows;
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    typeof rows[0] !== "object" ||
    rows[0] === null
  ) {
    return null;
  }
  return rows[0] as Readonly<Record<string, unknown>>;
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

function fail(reason: WebhookInboxProcessingPersistenceReason): never {
  throw new WebhookInboxProcessingPersistenceError(reason);
}
