import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  createProviderAccountIdentityBinding,
  readPersistedVerifiedEconomicPaymentCaptureReceipt,
  type ApplyVerifiedCaptureCommand,
  type CaptureFinancialMutationProposal,
  type EconomicPaymentEvidenceKind,
  type EconomicPaymentSessionState,
  type FinanceDigest,
  type PersistedVerifiedEconomicPaymentCaptureReceipt,
  type ProviderOperationResultCommitReceipt,
  type ResolvedFinanceOperationEnvelope,
  type VerifiedCaptureApplicationCommitReceipt,
  type VerifiedFinanceJournalCommitReceipt,
  type VerifiedWalletOperationCommitReceipt,
  type VerifiedCaptureApplicationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, asc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeVerifiedCaptureApplicationReceipts } from "../../schema/finance/capture-application.schema";
import { financeOrderEconomicsSnapshots } from "../../schema/finance/capture-authorities.schema";
import { financeClientCheckoutAuthorizations } from "../../schema/finance/client-checkout-authorizations.schema";
import {
  financeCaptureFacts,
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions,
  financePaymentClearingHeads,
  financePlatformInvoicePaymentBindings,
  financePaymentTransitionFacts
} from "../../schema/finance/economic-payments.schema";
import {
  financeAllocationLinkProofs,
  financeJournalTransactions,
  financePersistenceCommitReceipts
} from "../../schema/finance/ledger.schema";
import { orders } from "../../schema/finance/orders.schema";
import {
  financeProviderOperationIntents,
  financeProviderOperationResultCommitReceipts
} from "../../schema/finance/provider-operations.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import { financeWalletCommitBindings } from "../../schema/finance/wallet.schema";
import {
  platformTariffInvoices,
  platformTariffSubscriptions
} from "../../schema/platform-billing/tariff-authority.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  commitSealedJournalMutationInTransaction,
  prepareSealedJournalMutation,
  resolvePersistedProviderAstrologerJournalSourceScope,
  resolvePersistedProviderJournalSourceScope
} from "./drizzle-sealed-journal-commit-uow";
import { confirmPaidBooking } from "../scheduling";
import { markFinanceOrderPaid } from "./drizzle-order-store";
import {
  commitSealedWalletJournalMutationInTransaction,
  createResolvedPersistedRootCaptureAuthority
} from "./drizzle-sealed-wallet-journal-commit-uow";
import {
  mapDatabaseIssuedWalletCommitReceipt,
  prepareWalletJournalMutation
} from "./wallet-row-mapper";
import { decodeFinancePositiveRevision, encodeFinanceNumeric38 } from "./finance-row-codecs";
import { mapDatabaseIssuedJournalCommitReceipt } from "./journal-transaction-writer";

const commandKeys = [
  "economicPaymentIntentId",
  "expectedEconomicPaymentVersion",
  "providerOperationIntentId",
  "expectedProviderOperationIntentVersion",
  "financialMutation",
  "providerResult",
  "operationEnvelope"
] as const;
const providerResultKeys = [
  "kind",
  "providerOperationResultId",
  "providerOperationIntentId",
  "providerOperationIntentVersion",
  "providerOperationId",
  "operationKind",
  "economicPaymentIntentId",
  "correlatedEconomicPaymentVersion",
  "economicPaymentSessionId",
  "sourceId",
  "purpose",
  "providerAccount",
  "outcome",
  "providerPaymentId",
  "amountMinor",
  "currency",
  "evidenceArtifactId",
  "evidenceArtifactDigest",
  "canonicalRequestDigest",
  "observedAt",
  "persistenceTransactionBoundaryRef",
  "committedAt"
] as const;
const operationEnvelopeKeys = [
  "kind",
  "policyId",
  "policyVersion",
  "policyDigest",
  "maximumRows",
  "maximumDecimalDigits",
  "maximumArtifactBytes"
] as const;

type CapturePurpose = ProviderOperationResultCommitReceipt["purpose"];
type CaptureOperationKind = ProviderOperationResultCommitReceipt["operationKind"];

export type NormalizedVerifiedCaptureApplicationCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
  financialMutation: CaptureFinancialMutationProposal;
  providerResult: ApplyVerifiedCaptureCommand["providerResult"];
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PersistedProviderCaptureAuthority = Readonly<{
  providerResultReceiptId: string;
  providerResultReceiptDigest: FinanceDigest;
  providerResultReceiptBoundaryRef: string;
  providerOperationResultId: string;
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  economicPaymentIntentId: string;
  correlatedEconomicPaymentVersion: number;
  economicPaymentSessionId: string;
  sourceId: string;
  purpose: CapturePurpose;
  providerAccountSeriesId: string;
  providerAccountId: string;
  providerIdentityVersion: number;
  operationKind: CaptureOperationKind;
  providerOperationId: string;
  providerPaymentId: string;
  amountMinor: string;
  currency: "RUB";
  canonicalRequestDigest: FinanceDigest;
  evidenceArtifactId: string;
  evidenceArtifactDigest: FinanceDigest;
  observedAt: string;
  committedAt: string;
}>;

export type VerifiedCaptureApplicationPersistenceReason =
  | "invalid_command"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "economic_payment_correlation_conflict"
  | "economic_payment_session_not_found"
  | "economic_payment_session_conflict"
  | "provider_operation_not_found"
  | "provider_operation_version_conflict"
  | "provider_operation_correlation_conflict"
  | "financial_mutation_conflict"
  | "capture_application_conflict"
  | "provider_result_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export const verifiedCaptureApplicationWriteBoundaryValues = Object.freeze([
  "capture_transition_fact",
  "capture_fact",
  "economic_session_head",
  "economic_intent_head",
  "clearing_head",
  "sealed_journal",
  "wallet_head",
  "operation_receipt",
  "payable_lots",
  "authority_bindings",
  "effects",
  "lineage",
  "component_slots",
  "lot_transitions",
  "wallet_history",
  "commit_binding",
  "lot_state_snapshot",
  "lot_commitment_chain",
  "application_receipt_and_outbox"
] as const);

export type VerifiedCaptureApplicationWriteBoundary =
  (typeof verifiedCaptureApplicationWriteBoundaryValues)[number];

export type VerifiedCaptureApplicationFailureInjector = (
  boundary: VerifiedCaptureApplicationWriteBoundary
) => void | Promise<void>;

export class VerifiedCaptureApplicationPersistenceError extends Error {
  readonly code = "verified_capture_application_persistence_error";

  constructor(readonly reason: VerifiedCaptureApplicationPersistenceReason) {
    super("Verified capture could not be applied atomically");
    this.name = "VerifiedCaptureApplicationPersistenceError";
  }
}

export function createDrizzleVerifiedCaptureApplicationUnitOfWork(input: {
  readonly database: ElevenHouseDatabase;
  readonly afterWriteBoundary?: VerifiedCaptureApplicationFailureInjector;
}): VerifiedCaptureApplicationUnitOfWork {
  const unitOfWork = {
    async applyVerifiedCapture(command) {
      const normalized = normalizeVerifiedCaptureApplicationCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          applyInTransaction(
            transaction,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof VerifiedCaptureApplicationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("capture_application_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies VerifiedCaptureApplicationUnitOfWork;
  return Object.freeze(unitOfWork);
}

/** Internal composition hook for provider-result and capture work in one PostgreSQL transaction. */
export async function applyVerifiedCaptureInTransaction(
  transaction: FinanceTransaction,
  command: ApplyVerifiedCaptureCommand,
  afterWriteBoundary: VerifiedCaptureApplicationFailureInjector = noFailureInjection
): Promise<VerifiedCaptureApplicationCommitReceipt> {
  return applyInTransaction(
    transaction,
    normalizeVerifiedCaptureApplicationCommand(command),
    afterWriteBoundary
  );
}

export function normalizeVerifiedCaptureApplicationCommand(
  command: ApplyVerifiedCaptureCommand
): NormalizedVerifiedCaptureApplicationCommand {
  return boundary(() => {
    assertExactOwnDataRecord(command, commandKeys);
    const economicPaymentIntentId = identifier(command.economicPaymentIntentId, 160);
    const providerOperationIntentId = identifier(command.providerOperationIntentId, 160);
    const expectedEconomicPaymentVersion = positiveSafeInteger(
      command.expectedEconomicPaymentVersion
    );
    const expectedProviderOperationIntentVersion = positiveSafeInteger(
      command.expectedProviderOperationIntentVersion
    );
    const providerResult = normalizeProviderResult(command.providerResult);
    // Hosted checkout money is deliberately not authorized by the result of creating the
    // checkout session. Its only accepted authority is a later canonical payment-transition
    // semantic fact. Keep this legacy provider-result UOW platform-only so a future caller
    // cannot silently reintroduce the unsafe client-order branch.
    if (providerResult.purpose === "client_order") fail("invalid_command");
    if (
      providerResult.economicPaymentIntentId !== economicPaymentIntentId ||
      providerResult.providerOperationIntentId !== providerOperationIntentId ||
      providerResult.correlatedEconomicPaymentVersion !== expectedEconomicPaymentVersion ||
      providerResult.providerOperationIntentVersion !== expectedProviderOperationIntentVersion
    ) {
      fail("invalid_command");
    }
    const financialMutation = normalizeFinancialMutation(
      command.financialMutation,
      providerResult.purpose
    );
    return Object.freeze({
      economicPaymentIntentId,
      expectedEconomicPaymentVersion,
      providerOperationIntentId,
      expectedProviderOperationIntentVersion,
      financialMutation,
      providerResult,
      operationEnvelope: normalizeOperationEnvelope(command.operationEnvelope)
    });
  });
}

export function deriveVerifiedCapturePersistenceIds(
  providerOperationResultId: string
): Readonly<{ transitionFactId: string; captureFactId: string }> {
  return boundary(() => {
    const resultId = identifier(providerOperationResultId, 160);
    const hash = createHash("sha256").update(resultId, "utf8").digest("hex");
    return Object.freeze({
      transitionFactId: `capture-transition:${hash}`,
      captureFactId: `capture:${hash}`
    });
  });
}

export function rehydratePersistedProviderCaptureAuthority(
  row: typeof financeProviderOperationResultCommitReceipts.$inferSelect,
  expected: ApplyVerifiedCaptureCommand["providerResult"]
): PersistedProviderCaptureAuthority {
  return boundary(() => {
    const providerOperationIntentVersion = positiveRevision(row.providerOperationIntentVersion);
    const correlatedEconomicPaymentVersion = positiveRevision(row.correlatedEconomicPaymentVersion);
    const observedAt = databaseInstant(row.observedAt);
    const committedAt = databaseInstant(row.committedAt);
    if (
      !uuid(row.id) ||
      row.providerOperationResultId !== expected.providerOperationResultId ||
      row.providerOperationIntentId !== expected.providerOperationIntentId ||
      providerOperationIntentVersion !== expected.providerOperationIntentVersion ||
      row.providerOperationId !== expected.providerOperationId ||
      row.operationKind !== expected.operationKind ||
      row.economicPaymentIntentId !== expected.economicPaymentIntentId ||
      correlatedEconomicPaymentVersion !== expected.correlatedEconomicPaymentVersion ||
      row.economicPaymentSessionId !== expected.economicPaymentSessionId ||
      row.sourceId !== expected.sourceId ||
      row.purpose !== expected.purpose ||
      row.seriesId !== expected.providerAccount.seriesId ||
      row.providerAccountId !== expected.providerAccount.providerAccountId ||
      row.providerIdentityVersion !== expected.providerAccount.identityVersion ||
      row.outcome !== "succeeded" ||
      row.outcome !== expected.outcome ||
      row.providerPaymentId !== expected.providerPaymentId ||
      row.amountMinor !== expected.amountMinor ||
      row.currency !== expected.currency ||
      row.canonicalRequestDigest !== expected.canonicalRequestDigest ||
      row.evidenceArtifactId !== expected.evidenceArtifactId ||
      row.evidenceArtifactDigest !== expected.evidenceArtifactDigest ||
      observedAt !== expected.observedAt ||
      row.persistenceTransactionBoundaryRef !== expected.persistenceTransactionBoundaryRef ||
      committedAt !== expected.committedAt ||
      !digestOrFalse(row.canonicalDigest) ||
      row.canonicalPreimage.length < 1 ||
      !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
      databaseInstant(row.resultCommittedAt) > committedAt
    ) {
      fail("provider_result_conflict");
    }
    return Object.freeze({
      providerResultReceiptId: row.id,
      providerResultReceiptDigest: row.canonicalDigest as FinanceDigest,
      providerResultReceiptBoundaryRef: row.persistenceTransactionBoundaryRef,
      providerOperationResultId: row.providerOperationResultId,
      providerOperationIntentId: row.providerOperationIntentId,
      providerOperationIntentVersion,
      economicPaymentIntentId: row.economicPaymentIntentId,
      correlatedEconomicPaymentVersion,
      economicPaymentSessionId: row.economicPaymentSessionId,
      sourceId: row.sourceId,
      purpose: capturePurpose(row.purpose),
      providerAccountSeriesId: row.seriesId,
      providerAccountId: row.providerAccountId,
      providerIdentityVersion: row.providerIdentityVersion,
      operationKind: captureOperationKind(row.operationKind),
      providerOperationId: row.providerOperationId,
      providerPaymentId: row.providerPaymentId,
      amountMinor: encodeFinanceNumeric38(row.amountMinor),
      currency: row.currency,
      canonicalRequestDigest: row.canonicalRequestDigest as FinanceDigest,
      evidenceArtifactId: row.evidenceArtifactId,
      evidenceArtifactDigest: row.evidenceArtifactDigest as FinanceDigest,
      observedAt,
      committedAt
    }) as PersistedProviderCaptureAuthority;
  });
}

async function applyInTransaction(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand,
  afterWriteBoundary: VerifiedCaptureApplicationFailureInjector
): Promise<VerifiedCaptureApplicationCommitReceipt> {
  const authority = await lockPersistedProviderCaptureAuthority(transaction, command);
  const [economicIntent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, command.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!economicIntent) fail("economic_payment_not_found");
  assertEconomicIntentMatchesCapture(economicIntent, command, authority);

  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, authority.economicPaymentSessionId))
    .limit(1)
    .for("update");
  if (!session) fail("economic_payment_session_not_found");
  assertSessionMatchesCapture(session, command, authority);

  const [operation] = await transaction
    .select()
    .from(financeProviderOperationIntents)
    .where(eq(financeProviderOperationIntents.id, command.providerOperationIntentId))
    .limit(1)
    .for("update");
  if (!operation) fail("provider_operation_not_found");
  assertOperationMatchesCapture(operation, command, authority);

  const [existing] = await transaction
    .select()
    .from(financeVerifiedCaptureApplicationReceipts)
    .where(
      eq(
        financeVerifiedCaptureApplicationReceipts.providerResultReceiptId,
        authority.providerResultReceiptId
      )
    )
    .limit(1)
    .for("share");
  if (existing) {
    if (command.providerResult.purpose === "client_order") {
      return mapClientOrderCaptureApplicationReceipt(transaction, command, authority, existing);
    }
    const journalReceipt =
      command.providerResult.purpose === "platform_invoice"
        ? await rehydratePlatformInvoiceJournalReceipt(transaction, existing)
        : null;
    return await mapNoWalletCaptureApplicationReceipt(
      transaction,
      command,
      authority,
      existing,
      journalReceipt
    );
  }

  if (
    command.providerResult.purpose === "platform_card_setup" &&
    command.financialMutation.kind !== "no_posting"
  ) {
    fail("financial_mutation_conflict");
  }
  const platformInvoice =
    command.providerResult.purpose === "platform_invoice"
      ? await lockPlatformInvoiceCaptureAuthority(transaction, command, authority)
      : null;
  const clientOrder =
    command.providerResult.purpose === "client_order"
      ? await lockClientOrderCaptureAuthority(transaction, command, authority)
      : null;

  const currentEconomicVersion = positiveRevision(economicIntent.version);
  const currentSessionVersion = positiveRevision(session.version);
  if (currentEconomicVersion !== command.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  const nextEconomicVersion = currentEconomicVersion + 1;
  const nextSessionVersion = currentSessionVersion + 1;
  if (!Number.isSafeInteger(nextEconomicVersion) || !Number.isSafeInteger(nextSessionVersion)) {
    fail("persistence_write_incomplete");
  }
  if (
    session.state === "captured" ||
    session.state === "declined" ||
    session.state === "failed" ||
    session.state === "expired" ||
    session.state === "voided"
  ) {
    fail("economic_payment_session_conflict");
  }

  const ids = deriveVerifiedCapturePersistenceIds(authority.providerOperationResultId);
  const observedAt = new Date(authority.observedAt);
  const transition = await transaction
    .insert(financePaymentTransitionFacts)
    .values({
      id: ids.transitionFactId,
      economicPaymentIntentId: command.economicPaymentIntentId,
      economicPaymentSessionId: authority.economicPaymentSessionId,
      seriesId: authority.providerAccountSeriesId,
      providerAccountId: authority.providerAccountId,
      providerIdentityVersion: authority.providerIdentityVersion,
      fromState: session.state,
      toState: "captured",
      evidenceKind: "canonical_provider_result",
      authorityKind: "provider_operation_result",
      authorityId: authority.providerOperationResultId,
      evidenceArtifactId: authority.evidenceArtifactId,
      evidenceArtifactDigest: authority.evidenceArtifactDigest,
      intentVersionFrom: String(currentEconomicVersion),
      intentVersionTo: String(nextEconomicVersion),
      sessionVersionFrom: String(currentSessionVersion),
      sessionVersionTo: String(nextSessionVersion),
      observedAt
    })
    .returning({ id: financePaymentTransitionFacts.id });
  if (transition.length !== 1 || transition[0]?.id !== ids.transitionFactId) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("capture_transition_fact");

  const capture = await transaction
    .insert(financeCaptureFacts)
    .values({
      id: ids.captureFactId,
      economicPaymentIntentId: command.economicPaymentIntentId,
      economicPaymentSessionId: authority.economicPaymentSessionId,
      seriesId: authority.providerAccountSeriesId,
      providerAccountId: authority.providerAccountId,
      providerIdentityVersion: authority.providerIdentityVersion,
      providerPaymentId: authority.providerPaymentId,
      amountMinor: authority.amountMinor,
      currency: authority.currency,
      evidenceAuthorityKind: "provider_operation_result",
      evidenceAuthorityId: authority.providerOperationResultId,
      evidenceArtifactId: authority.evidenceArtifactId,
      evidenceArtifactDigest: authority.evidenceArtifactDigest,
      capturedAt: observedAt
    })
    .returning({ id: financeCaptureFacts.id });
  if (capture.length !== 1 || capture[0]?.id !== ids.captureFactId) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("capture_fact");

  const updatedSession = await transaction
    .update(financeEconomicPaymentSessions)
    .set({ state: "captured", version: String(nextSessionVersion), terminalAt: observedAt })
    .where(
      and(
        eq(financeEconomicPaymentSessions.id, authority.economicPaymentSessionId),
        eq(financeEconomicPaymentSessions.version, String(currentSessionVersion))
      )
    )
    .returning({
      id: financeEconomicPaymentSessions.id,
      version: financeEconomicPaymentSessions.version
    });
  if (
    updatedSession.length !== 1 ||
    positiveRevision(updatedSession[0]?.version) !== nextSessionVersion
  ) {
    fail("economic_payment_session_conflict");
  }
  await afterWriteBoundary("economic_session_head");

  const updatedIntent = await transaction
    .update(financeEconomicPaymentIntents)
    .set({ state: "captured", version: String(nextEconomicVersion) })
    .where(
      and(
        eq(financeEconomicPaymentIntents.id, command.economicPaymentIntentId),
        eq(financeEconomicPaymentIntents.version, String(currentEconomicVersion))
      )
    )
    .returning({
      id: financeEconomicPaymentIntents.id,
      version: financeEconomicPaymentIntents.version
    });
  if (
    updatedIntent.length !== 1 ||
    positiveRevision(updatedIntent[0]?.version) !== nextEconomicVersion
  ) {
    fail("economic_payment_version_conflict");
  }
  await afterWriteBoundary("economic_intent_head");

  let journalCommitReceipt: VerifiedFinanceJournalCommitReceipt | null = null;
  let walletCommitReceipt: VerifiedWalletOperationCommitReceipt | null = null;
  if (clientOrder) {
    if (command.financialMutation.kind === "wallet_and_journal") {
      const prepared = prepareWalletJournalMutation(command.financialMutation.command);
      assertClientWalletCaptureMutation(prepared, clientOrder, authority, ids.captureFactId);
      walletCommitReceipt = await commitSealedWalletJournalMutationInTransaction(
        transaction,
        command.financialMutation.command,
        createResolvedPersistedRootCaptureAuthority({
          canonicalCaptureEvidenceId: ids.captureFactId,
          captureIntentId: command.economicPaymentIntentId,
          captureSessionId: authority.economicPaymentSessionId,
          providerAccountSeriesId: authority.providerAccountSeriesId,
          providerAccountId: authority.providerAccountId,
          providerIdentityVersion: authority.providerIdentityVersion,
          providerPaymentId: authority.providerPaymentId,
          captureAmountMinor: authority.amountMinor,
          captureCurrency: "RUB",
          captureEvidenceAuthorityKind: "provider_operation_result",
          captureEvidenceAuthorityId: authority.providerOperationResultId,
          captureEvidenceArtifactId: authority.evidenceArtifactId,
          captureEvidenceArtifactDigest: authority.evidenceArtifactDigest
        }),
        async (boundary) => afterWriteBoundary(boundary)
      );
    } else if (command.financialMutation.kind === "journal_only") {
      assertClientFullCommissionJournalMutation(command.financialMutation, clientOrder, authority);
      const resolvedScope = await resolvePersistedProviderAstrologerJournalSourceScope(
        transaction,
        {
          seriesId: authority.providerAccountSeriesId,
          providerAccountId: authority.providerAccountId,
          identityVersion: authority.providerIdentityVersion
        },
        clientOrder.order.astrologerUserId
      );
      journalCommitReceipt = await commitSealedJournalMutationInTransaction(
        transaction,
        command.financialMutation.command,
        resolvedScope,
        async () => afterWriteBoundary("sealed_journal")
      );
    } else {
      fail("financial_mutation_conflict");
    }

    const clearing = await transaction
      .insert(financePaymentClearingHeads)
      .values({
        economicPaymentIntentId: command.economicPaymentIntentId,
        seriesId: authority.providerAccountSeriesId,
        providerAccountId: authority.providerAccountId,
        providerIdentityVersion: authority.providerIdentityVersion,
        currency: "RUB",
        state: "unmatched",
        version: "1"
      })
      .returning({ economicPaymentIntentId: financePaymentClearingHeads.economicPaymentIntentId });
    if (
      clearing.length !== 1 ||
      clearing[0]?.economicPaymentIntentId !== command.economicPaymentIntentId
    ) {
      fail("persistence_write_incomplete");
    }
    await afterWriteBoundary("clearing_head");

    const paid = await markFinanceOrderPaid(transaction, {
      orderId: clientOrder.order.id,
      now: authority.observedAt
    });
    if (!paid) fail("financial_mutation_conflict");
    if (clientOrder.order.bookingId) {
      const booking = await confirmPaidBooking(transaction, {
        bookingId: clientOrder.order.bookingId,
        now: authority.observedAt
      });
      if (!booking) fail("financial_mutation_conflict");
    }
    await afterWriteBoundary("effects");
  }
  if (platformInvoice) {
    if (command.financialMutation.kind !== "journal_only") fail("financial_mutation_conflict");
    assertPlatformInvoiceJournalMutation(command.financialMutation, platformInvoice, authority);
    const resolvedScope = await resolvePersistedProviderJournalSourceScope(transaction, {
      seriesId: authority.providerAccountSeriesId,
      providerAccountId: authority.providerAccountId,
      identityVersion: authority.providerIdentityVersion
    });
    journalCommitReceipt = await commitSealedJournalMutationInTransaction(
      transaction,
      command.financialMutation.command,
      resolvedScope,
      async () => afterWriteBoundary("sealed_journal")
    );

    const clearing = await transaction
      .insert(financePaymentClearingHeads)
      .values({
        economicPaymentIntentId: command.economicPaymentIntentId,
        seriesId: authority.providerAccountSeriesId,
        providerAccountId: authority.providerAccountId,
        providerIdentityVersion: authority.providerIdentityVersion,
        currency: "RUB",
        state: "unmatched",
        version: "1"
      })
      .returning({ economicPaymentIntentId: financePaymentClearingHeads.economicPaymentIntentId });
    if (
      clearing.length !== 1 ||
      clearing[0]?.economicPaymentIntentId !== command.economicPaymentIntentId
    ) {
      fail("persistence_write_incomplete");
    }
    await afterWriteBoundary("clearing_head");

    await activateCapturedPlatformInvoice(transaction, platformInvoice, observedAt);
    await afterWriteBoundary("effects");
  }

  const [application] = await transaction
    .insert(financeVerifiedCaptureApplicationReceipts)
    .values({
      captureFactId: ids.captureFactId,
      providerResultReceiptId: authority.providerResultReceiptId,
      journalPersistenceReceiptId: walletCommitReceipt
        ? await journalReceiptIdForWalletCommit(transaction, walletCommitReceipt)
        : (journalCommitReceipt?.ref.receiptId ?? null),
      walletCommitReceiptId: walletCommitReceipt?.receiptId ?? null
    })
    .returning();
  if (!application) fail("persistence_write_incomplete");
  await afterWriteBoundary("application_receipt_and_outbox");

  if (clientOrder) {
    return mapClientOrderCaptureApplicationReceipt(transaction, command, authority, application);
  }
  return await mapNoWalletCaptureApplicationReceipt(
    transaction,
    command,
    authority,
    application,
    journalCommitReceipt
  );
}

function noFailureInjection(): void {}

async function lockPersistedProviderCaptureAuthority(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand
): Promise<PersistedProviderCaptureAuthority> {
  const [account] = await transaction
    .select({ provider: financeProviderAccounts.provider })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, command.providerResult.providerAccount.seriesId),
        eq(
          financeProviderAccounts.providerAccountId,
          command.providerResult.providerAccount.providerAccountId
        ),
        eq(
          financeProviderAccounts.identityVersion,
          command.providerResult.providerAccount.identityVersion
        )
      )
    )
    .limit(1)
    .for("share");
  if (!account || account.provider !== "arc_pay") fail("provider_result_conflict");

  const [receipt] = await transaction
    .select()
    .from(financeProviderOperationResultCommitReceipts)
    .where(
      and(
        eq(
          financeProviderOperationResultCommitReceipts.providerOperationResultId,
          command.providerResult.providerOperationResultId
        ),
        eq(
          financeProviderOperationResultCommitReceipts.providerOperationIntentId,
          command.providerOperationIntentId
        )
      )
    )
    .limit(1)
    .for("update");
  if (!receipt) fail("provider_result_conflict");
  return rehydratePersistedProviderCaptureAuthority(receipt, command.providerResult);
}

type LockedClientOrderCaptureAuthority = Readonly<{
  order: typeof orders.$inferSelect;
  economics: typeof financeOrderEconomicsSnapshots.$inferSelect;
}>;

async function lockClientOrderCaptureAuthority(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority
): Promise<LockedClientOrderCaptureAuthority> {
  const [checkoutAuthorization] = await transaction
    .select()
    .from(financeClientCheckoutAuthorizations)
    .where(
      eq(
        financeClientCheckoutAuthorizations.providerOperationIntentId,
        authority.providerOperationIntentId
      )
    )
    .limit(1)
    .for("share");
  const [order] = await transaction
    .select()
    .from(orders)
    .where(eq(orders.id, authority.sourceId))
    .limit(1)
    .for("update");
  const [economics] = await transaction
    .select()
    .from(financeOrderEconomicsSnapshots)
    .where(eq(financeOrderEconomicsSnapshots.orderId, authority.sourceId))
    .limit(1)
    .for("share");
  if (
    !checkoutAuthorization ||
    !order ||
    !economics ||
    checkoutAuthorization.orderId !== authority.sourceId ||
    checkoutAuthorization.economicPaymentIntentId !== command.economicPaymentIntentId ||
    checkoutAuthorization.economicPaymentSessionId !== authority.economicPaymentSessionId ||
    checkoutAuthorization.providerOperationIntentId !== authority.providerOperationIntentId ||
    checkoutAuthorization.clientUserId !== order.clientUserId ||
    order.status !== "pending_payment" ||
    order.grossCurrency !== "RUB" ||
    String(order.grossAmountMinor) !== authority.amountMinor ||
    economics.orderId !== order.id ||
    economics.astrologerUserId !== order.astrologerUserId ||
    economics.grossCurrency !== "RUB" ||
    economics.commissionCurrency !== "RUB" ||
    economics.payableCurrency !== "RUB" ||
    economics.grossAmountMinor !== authority.amountMinor ||
    String(order.platformFeeAmountMinor) !== economics.commissionAmountMinor ||
    String(order.astrologerNetAmountMinor) !== economics.payableAmountMinor ||
    order.tariffCommissionBps !== economics.commissionBps
  ) {
    fail("financial_mutation_conflict");
  }
  return Object.freeze({ order, economics });
}

function assertClientWalletCaptureMutation(
  prepared: ReturnType<typeof prepareWalletJournalMutation>,
  client: LockedClientOrderCaptureAuthority,
  authority: PersistedProviderCaptureAuthority,
  captureFactId: string
): void {
  const roots = prepared.transition.createdLots.filter((lot) => lot.parentLotId === null);
  const root = roots[0];
  const capture = root?.captureSource.paymentIntent.capture;
  if (
    prepared.operationId !== captureFactId ||
    prepared.receipt.operationKind !== "sale_capture" ||
    roots.length !== 1 ||
    !root ||
    !capture ||
    prepared.astrologerUserId !== client.order.astrologerUserId ||
    root.astrologerUserId !== client.order.astrologerUserId ||
    root.sourceId !== client.order.id ||
    root.amount.amountMinor !== Number(client.economics.payableAmountMinor) ||
    root.amount.currency !== "RUB" ||
    root.captureSource.intentId !== authority.economicPaymentIntentId ||
    root.captureSource.canonicalEvidenceId !== captureFactId ||
    root.captureSource.paymentIntent.captureSessionId !== authority.economicPaymentSessionId ||
    capture.providerPaymentId !== authority.providerPaymentId ||
    capture.amount.amountMinor !== Number(authority.amountMinor) ||
    capture.amount.currency !== "RUB" ||
    capture.providerAccount.seriesId !== authority.providerAccountSeriesId ||
    capture.providerAccount.providerAccountId !== authority.providerAccountId ||
    capture.providerAccount.identityVersion !== authority.providerIdentityVersion
  ) {
    fail("financial_mutation_conflict");
  }
}

function assertClientFullCommissionJournalMutation(
  mutation: Extract<CaptureFinancialMutationProposal, { readonly kind: "journal_only" }>,
  client: LockedClientOrderCaptureAuthority,
  authority: PersistedProviderCaptureAuthority
): void {
  const prepared = prepareSealedJournalMutation(mutation.command);
  if (
    client.economics.payableAmountMinor !== "0" ||
    client.economics.commissionAmountMinor !== authority.amountMinor ||
    prepared.transaction.sourceKey.kind !== "order" ||
    prepared.transaction.sourceKey.sourceId !== client.order.id ||
    prepared.transaction.sourceKey.operation !== "sale_captured" ||
    prepared.transaction.entries.some((entry) => "astrologerUserId" in entry.account)
  ) {
    fail("financial_mutation_conflict");
  }
}

function assertEconomicIntentMatchesCapture(
  row: typeof financeEconomicPaymentIntents.$inferSelect,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority
): void {
  if (
    row.purpose !== authority.purpose ||
    row.sourceId !== authority.sourceId ||
    row.seriesId !== authority.providerAccountSeriesId ||
    row.providerAccountId !== authority.providerAccountId ||
    row.providerIdentityVersion !== authority.providerIdentityVersion ||
    encodeFinanceNumeric38(row.amountMinor) !== authority.amountMinor ||
    row.currency !== authority.currency ||
    authority.correlatedEconomicPaymentVersion !== command.expectedEconomicPaymentVersion ||
    authority.economicPaymentIntentId !== command.economicPaymentIntentId
  ) {
    fail("economic_payment_correlation_conflict");
  }
}

function assertSessionMatchesCapture(
  row: typeof financeEconomicPaymentSessions.$inferSelect,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority
): void {
  if (
    row.economicPaymentIntentId !== command.economicPaymentIntentId ||
    row.seriesId !== authority.providerAccountSeriesId ||
    row.providerAccountId !== authority.providerAccountId ||
    row.providerIdentityVersion !== authority.providerIdentityVersion
  ) {
    fail("economic_payment_session_conflict");
  }
}

function assertOperationMatchesCapture(
  row: typeof financeProviderOperationIntents.$inferSelect,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority
): void {
  if (
    positiveRevision(row.version) !== command.expectedProviderOperationIntentVersion ||
    row.status !== "succeeded" ||
    row.economicPaymentIntentId !== command.economicPaymentIntentId ||
    row.economicPaymentSessionId !== authority.economicPaymentSessionId ||
    positiveRevision(row.correlatedEconomicPaymentVersion) !==
      command.expectedEconomicPaymentVersion ||
    row.seriesId !== authority.providerAccountSeriesId ||
    row.providerAccountId !== authority.providerAccountId ||
    row.providerIdentityVersion !== authority.providerIdentityVersion ||
    row.purpose !== authority.purpose ||
    row.sourceId !== authority.sourceId ||
    row.operationKind !== authority.operationKind ||
    row.canonicalRequestDigest !== authority.canonicalRequestDigest
  ) {
    fail("provider_operation_correlation_conflict");
  }
}

type LockedPlatformInvoiceCaptureAuthority = Readonly<{
  invoice: typeof platformTariffInvoices.$inferSelect;
  subscription: typeof platformTariffSubscriptions.$inferSelect;
}>;

async function lockPlatformInvoiceCaptureAuthority(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority
): Promise<LockedPlatformInvoiceCaptureAuthority> {
  const [binding] = await transaction
    .select()
    .from(financePlatformInvoicePaymentBindings)
    .where(eq(financePlatformInvoicePaymentBindings.invoiceId, authority.sourceId))
    .limit(1)
    .for("share");
  if (!binding || binding.economicPaymentIntentId !== command.economicPaymentIntentId) {
    fail("economic_payment_correlation_conflict");
  }
  const [invoice] = await transaction
    .select()
    .from(platformTariffInvoices)
    .where(eq(platformTariffInvoices.id, authority.sourceId))
    .limit(1)
    .for("update");
  if (
    !invoice ||
    (invoice.state !== "payment_pending" && invoice.state !== "requires_customer_action") ||
    invoice.currency !== "RUB" ||
    !Number.isSafeInteger(invoice.amountMinor) ||
    invoice.amountMinor <= 0 ||
    String(invoice.amountMinor) !== authority.amountMinor
  ) {
    fail("financial_mutation_conflict");
  }
  const [subscription] = await transaction
    .select()
    .from(platformTariffSubscriptions)
    .where(eq(platformTariffSubscriptions.id, invoice.subscriptionId))
    .limit(1)
    .for("update");
  if (
    !subscription ||
    subscription.state !== "awaiting_initial_payment" ||
    subscription.ownerUserId !== invoice.ownerUserId ||
    subscription.tariffSeriesId !== invoice.tariffSeriesId ||
    subscription.tariffVersion !== invoice.tariffVersion ||
    subscription.tariffVersionDigest !== invoice.tariffVersionDigest ||
    subscription.startsAt !== null ||
    subscription.endsAt !== null
  ) {
    fail("financial_mutation_conflict");
  }
  return Object.freeze({ invoice, subscription });
}

function assertPlatformInvoiceJournalMutation(
  mutation: Extract<CaptureFinancialMutationProposal, { readonly kind: "journal_only" }>,
  platformInvoice: LockedPlatformInvoiceCaptureAuthority,
  authority: PersistedProviderCaptureAuthority
): void {
  const prepared = prepareSealedJournalMutation(mutation.command);
  const journal = prepared.transaction;
  const [debit, credit] = journal.entries;
  const amountMinor = safeDomainMoneyMinor(authority.amountMinor);
  if (
    journal.sourceKey.kind !== "platform_invoice" ||
    journal.sourceKey.sourceId !== platformInvoice.invoice.id ||
    journal.sourceKey.operation !== "captured" ||
    Date.parse(journal.occurredAt) !== Date.parse(authority.observedAt) ||
    Date.parse(journal.postedAt) < Date.parse(authority.observedAt) ||
    journal.reversesTransactionId !== null ||
    journal.entries.length !== 2 ||
    !debit ||
    !credit ||
    debit.side !== "debit" ||
    debit.amount.amountMinor !== amountMinor ||
    debit.amount.currency !== "RUB" ||
    debit.account.code !== "arc_provider_clearing" ||
    !("arcProviderAccountId" in debit.account) ||
    debit.account.arcProviderAccountId !== authority.providerAccountId ||
    credit.side !== "credit" ||
    credit.amount.amountMinor !== amountMinor ||
    credit.amount.currency !== "RUB" ||
    credit.account.code !== "platform_subscription_deferred" ||
    "arcProviderAccountId" in credit.account ||
    !hasNoJournalLinks(debit.links) ||
    !hasNoJournalLinks(credit.links) ||
    prepared.proof.journalSourceKey.sourceId !== platformInvoice.invoice.id ||
    prepared.proof.sourceEvidenceRef.evidenceId !== authority.providerOperationResultId
  ) {
    fail("financial_mutation_conflict");
  }
}

function hasNoJournalLinks(value: {
  readonly originalSaleId: string | null;
  readonly componentId: string | null;
  readonly payableLotId: string | null;
  readonly payoutAllocationId: string | null;
}): boolean {
  return (
    value.originalSaleId === null &&
    value.componentId === null &&
    value.payableLotId === null &&
    value.payoutAllocationId === null
  );
}

async function activateCapturedPlatformInvoice(
  transaction: FinanceTransaction,
  platformInvoice: LockedPlatformInvoiceCaptureAuthority,
  capturedAt: Date
): Promise<void> {
  const [invoice] = await transaction
    .update(platformTariffInvoices)
    .set({
      state: "captured",
      capturedAt,
      version: platformInvoice.invoice.version + 1
    })
    .where(
      and(
        eq(platformTariffInvoices.id, platformInvoice.invoice.id),
        eq(platformTariffInvoices.state, platformInvoice.invoice.state),
        eq(platformTariffInvoices.version, platformInvoice.invoice.version)
      )
    )
    .returning({ id: platformTariffInvoices.id, state: platformTariffInvoices.state });
  if (!invoice || invoice.id !== platformInvoice.invoice.id || invoice.state !== "captured") {
    fail("financial_mutation_conflict");
  }
  const version = positiveRevision(platformInvoice.subscription.version);
  const [subscription] = await transaction
    .update(platformTariffSubscriptions)
    .set({
      state: "active",
      startsAt: platformInvoice.invoice.billingPeriodStartAt,
      endsAt: platformInvoice.invoice.billingPeriodEndAt,
      version: version + 1,
      updatedAt: capturedAt
    })
    .where(
      and(
        eq(platformTariffSubscriptions.id, platformInvoice.subscription.id),
        eq(platformTariffSubscriptions.state, "awaiting_initial_payment"),
        eq(platformTariffSubscriptions.version, version)
      )
    )
    .returning({ id: platformTariffSubscriptions.id, state: platformTariffSubscriptions.state });
  if (
    !subscription ||
    subscription.id !== platformInvoice.subscription.id ||
    subscription.state !== "active"
  ) {
    fail("financial_mutation_conflict");
  }
}

async function rehydratePlatformInvoiceJournalReceipt(
  transaction: FinanceTransaction,
  application: typeof financeVerifiedCaptureApplicationReceipts.$inferSelect
): Promise<VerifiedFinanceJournalCommitReceipt> {
  if (!application.journalPersistenceReceiptId) fail("persistence_write_incomplete");
  const [row] = await transaction
    .select({
      receiptId: financePersistenceCommitReceipts.receiptId,
      canonicalDigest: financePersistenceCommitReceipts.canonicalDigest,
      journalTransactionId: financePersistenceCommitReceipts.journalTransactionId,
      journalTransactionDigest: financeJournalTransactions.canonicalDigest,
      journalLinkProofId: financeAllocationLinkProofs.proofId,
      journalLinkProofVersion: financeAllocationLinkProofs.version,
      journalLinkProofDigest: financeAllocationLinkProofs.proofDigest,
      persistenceTransactionBoundaryRef:
        financePersistenceCommitReceipts.persistenceTransactionBoundaryRef,
      issuedAt: financePersistenceCommitReceipts.issuedAt
    })
    .from(financePersistenceCommitReceipts)
    .innerJoin(
      financeJournalTransactions,
      eq(financeJournalTransactions.id, financePersistenceCommitReceipts.journalTransactionId)
    )
    .innerJoin(
      financeAllocationLinkProofs,
      eq(financeAllocationLinkProofs.id, financePersistenceCommitReceipts.proofRecordId)
    )
    .where(eq(financePersistenceCommitReceipts.receiptId, application.journalPersistenceReceiptId))
    .limit(1)
    .for("share");
  if (
    !row ||
    row.journalTransactionId === null ||
    row.journalTransactionDigest === null ||
    row.journalTransactionId !== application.journalTransactionId ||
    row.journalTransactionDigest !== application.journalTransactionDigest ||
    row.journalLinkProofId !== application.journalLinkProofId ||
    row.journalLinkProofVersion !== application.journalLinkProofVersion ||
    row.journalLinkProofDigest !== application.journalLinkProofDigest ||
    row.canonicalDigest !== application.journalCommitDigest
  ) {
    fail("persistence_write_incomplete");
  }
  const journalTransactionDigest = row.journalTransactionDigest;
  if (journalTransactionDigest === null) fail("persistence_write_incomplete");
  return mapDatabaseIssuedJournalCommitReceipt({
    ...row,
    journalTransactionDigest,
    receiptVersion: 1
  });
}

async function journalReceiptIdForWalletCommit(
  transaction: FinanceTransaction,
  receipt: VerifiedWalletOperationCommitReceipt
): Promise<string> {
  const [binding] = await transaction
    .select({
      journalPersistenceReceiptId: financeWalletCommitBindings.journalPersistenceReceiptId
    })
    .from(financeWalletCommitBindings)
    .where(eq(financeWalletCommitBindings.commitReceiptId, receipt.receiptId))
    .limit(1)
    .for("share");
  if (!binding || !binding.journalPersistenceReceiptId) fail("persistence_write_incomplete");
  return binding.journalPersistenceReceiptId;
}

async function mapClientOrderCaptureApplicationReceipt(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority,
  application: typeof financeVerifiedCaptureApplicationReceipts.$inferSelect
): Promise<VerifiedCaptureApplicationCommitReceipt> {
  return mapNoWalletCaptureApplicationReceipt(transaction, command, authority, application, null);
}

async function rehydrateWalletCommitReceipt(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand,
  application: typeof financeVerifiedCaptureApplicationReceipts.$inferSelect
): Promise<VerifiedWalletOperationCommitReceipt> {
  if (
    command.financialMutation.kind !== "wallet_and_journal" ||
    !application.walletCommitReceiptId ||
    !application.walletOperationId ||
    !application.walletId ||
    !application.walletRevision ||
    !application.walletCommitDigest
  ) {
    fail("persistence_write_incomplete");
  }
  const prepared = prepareWalletJournalMutation(command.financialMutation.command);
  const [binding] = await transaction
    .select({
      commitReceiptId: financeWalletCommitBindings.commitReceiptId,
      commitReceiptVersion: financeWalletCommitBindings.commitReceiptVersion,
      commitReceiptCanonicalDigest: financeWalletCommitBindings.commitReceiptCanonicalDigest,
      bindingId: financeWalletCommitBindings.bindingId,
      bindingDigest: financeWalletCommitBindings.bindingDigest,
      operationReceiptId: financeWalletCommitBindings.operationReceiptId,
      journalLinkProofId: financeWalletCommitBindings.journalLinkProofId,
      journalLinkProofVersion: financeWalletCommitBindings.journalLinkProofVersion,
      journalLinkProofDigest: financeWalletCommitBindings.journalLinkProofDigest,
      walletId: financeWalletCommitBindings.nextWalletId,
      previousWalletRevision: financeWalletCommitBindings.previousWalletRevision,
      nextWalletRevision: financeWalletCommitBindings.nextWalletRevision,
      mutationSequence: financeWalletCommitBindings.mutationSequence,
      persistenceTransactionBoundaryRef:
        financeWalletCommitBindings.persistenceTransactionBoundaryRef,
      issuedAt: financeWalletCommitBindings.issuedAt
    })
    .from(financeWalletCommitBindings)
    .where(eq(financeWalletCommitBindings.commitReceiptId, application.walletCommitReceiptId))
    .limit(1)
    .for("share");
  if (
    !binding ||
    binding.commitReceiptId !== application.walletCommitReceiptId ||
    binding.walletId !== application.walletId ||
    binding.nextWalletRevision !== application.walletRevision ||
    binding.commitReceiptCanonicalDigest !== application.walletCommitDigest ||
    binding.operationReceiptId !== prepared.receipt.receiptId
  ) {
    fail("persistence_write_incomplete");
  }
  return mapDatabaseIssuedWalletCommitReceipt(prepared, {
    ...binding,
    operationReceiptDigest: prepared.receipt.canonicalDigest
  });
}

async function mapNoWalletCaptureApplicationReceipt(
  transaction: FinanceTransaction,
  command: NormalizedVerifiedCaptureApplicationCommand,
  authority: PersistedProviderCaptureAuthority,
  application: typeof financeVerifiedCaptureApplicationReceipts.$inferSelect,
  journalCommitReceipt: VerifiedFinanceJournalCommitReceipt | null
): Promise<VerifiedCaptureApplicationCommitReceipt> {
  const isClientOrder = authority.purpose === "client_order";
  const isCardSetup = authority.purpose === "platform_card_setup";
  const isPlatformInvoice = authority.purpose === "platform_invoice";
  const economicEffectKind = isClientOrder
    ? "client_sale_captured"
    : isCardSetup
      ? "platform_card_setup_captured"
      : "platform_invoice_captured";
  const resolvedJournalReceipt =
    journalCommitReceipt ??
    (application.journalPersistenceReceiptId
      ? await rehydratePlatformInvoiceJournalReceipt(transaction, application)
      : null);
  const walletJournalCommitReceipt =
    isClientOrder && application.walletCommitReceiptId !== null
      ? await rehydrateWalletCommitReceipt(transaction, command, application)
      : null;
  if (
    (!isCardSetup && !isPlatformInvoice && !isClientOrder) ||
    application.purpose !== authority.purpose ||
    application.economicEffectKind !== economicEffectKind ||
    application.captureFactId !==
      deriveVerifiedCapturePersistenceIds(authority.providerOperationResultId).captureFactId ||
    application.providerResultReceiptId !== authority.providerResultReceiptId ||
    (isCardSetup
      ? application.journalPersistenceReceiptId !== null || journalCommitReceipt !== null
      : application.journalPersistenceReceiptId !== resolvedJournalReceipt?.ref.receiptId) ||
    (isClientOrder
      ? application.walletCommitReceiptId !== walletJournalCommitReceipt?.receiptId
      : application.walletCommitReceiptId !== null) ||
    (isCardSetup
      ? application.clearingState !== null || application.clearingVersion !== null
      : application.clearingState !== "unmatched" ||
        positiveRevision(application.clearingVersion) !== 1) ||
    !uuid(application.receiptId) ||
    !digestOrFalse(application.canonicalDigest) ||
    !/^postgres-xid:[0-9]+$/.test(application.persistenceTransactionBoundaryRef) ||
    !(application.committedAt instanceof Date) ||
    !Number.isFinite(application.committedAt.getTime())
  ) {
    fail("persistence_write_incomplete");
  }
  const sessions = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(
      eq(financeEconomicPaymentSessions.economicPaymentIntentId, command.economicPaymentIntentId)
    )
    .orderBy(
      asc(financeEconomicPaymentSessions.intentVersionOpened),
      asc(financeEconomicPaymentSessions.id)
    )
    .for("share");
  const transitions = await transaction
    .select()
    .from(financePaymentTransitionFacts)
    .where(
      eq(financePaymentTransitionFacts.economicPaymentIntentId, command.economicPaymentIntentId)
    )
    .orderBy(
      asc(financePaymentTransitionFacts.economicPaymentSessionId),
      asc(financePaymentTransitionFacts.sessionVersionTo)
    )
    .for("share");
  const effect = Object.freeze({
    kind: economicEffectKind,
    intentId: command.economicPaymentIntentId,
    sourceId: authority.sourceId,
    providerAccount: Object.freeze({
      seriesId: authority.providerAccountSeriesId,
      providerAccountId: authority.providerAccountId,
      identityVersion: authority.providerIdentityVersion
    }),
    providerPaymentId: authority.providerPaymentId,
    amount: Object.freeze({
      amountMinor: safeDomainMoneyMinor(authority.amountMinor),
      currency: "RUB" as const
    }),
    canonicalEvidenceId: application.captureFactId
  });
  const persisted = readPersistedVerifiedEconomicPaymentCaptureReceipt({
    kind: "verified_provider_capture_receipt",
    authorityStatus: "verified_persisted",
    receiptId: application.captureFactId,
    intent: {
      intentId: command.economicPaymentIntentId,
      version: positiveRevision(application.economicPaymentVersion),
      purpose: authority.purpose,
      sourceId: authority.sourceId,
      providerAccount: effect.providerAccount,
      amount: effect.amount,
      state: "captured",
      sessions: sessions.map((session) =>
        Object.freeze({
          sessionId: session.id,
          providerAccount: effect.providerAccount,
          state: session.state as EconomicPaymentSessionState,
          evidenceHistory: transitions
            .filter((transition) => transition.economicPaymentSessionId === session.id)
            .map((transition) =>
              Object.freeze({
                fromState: transition.fromState as EconomicPaymentSessionState,
                toState: transition.toState as EconomicPaymentSessionState,
                kind: transition.evidenceKind as EconomicPaymentEvidenceKind,
                evidenceId:
                  transition.id === application.captureTransitionFactId
                    ? application.captureFactId
                    : transition.authorityId
              })
            )
        })
      ),
      capture: effect,
      captureSessionId: authority.economicPaymentSessionId
    },
    effect
  } as unknown as PersistedVerifiedEconomicPaymentCaptureReceipt);
  return Object.freeze({
    ref: Object.freeze({
      kind: "verified_capture_application_commit_receipt" as const,
      receiptId: application.receiptId,
      version: 1 as const,
      canonicalDigest: application.canonicalDigest
    }),
    kind: "verified_capture_application_commit_receipt" as const,
    economicPaymentHead: Object.freeze({
      economicPaymentIntentId: command.economicPaymentIntentId,
      sourceId: authority.sourceId,
      purpose: authority.purpose,
      providerAccount: effect.providerAccount,
      amountMinor: authority.amountMinor,
      currency: "RUB" as const,
      state: "captured" as const,
      activeSessionId: authority.economicPaymentSessionId,
      capturedProviderPaymentId: authority.providerPaymentId,
      version: positiveRevision(application.economicPaymentVersion)
    }),
    providerOperationIntentId: authority.providerOperationIntentId,
    providerOperationIntentVersion: authority.providerOperationIntentVersion,
    economicEffectKind,
    economicCaptureReceipt: persisted,
    journalCommitReceipt: resolvedJournalReceipt,
    walletJournalCommitReceipt,
    persistenceTransactionBoundaryRef: application.persistenceTransactionBoundaryRef,
    committedAt: application.committedAt.toISOString()
  }) as VerifiedCaptureApplicationCommitReceipt;
}

function safeDomainMoneyMinor(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== value) {
    fail("persistence_write_incomplete");
  }
  return parsed;
}

function normalizeProviderResult(
  value: ApplyVerifiedCaptureCommand["providerResult"]
): ApplyVerifiedCaptureCommand["providerResult"] {
  assertExactOwnDataRecord(value, providerResultKeys);
  if (value.kind !== "provider_operation_result_commit_receipt" || value.outcome !== "succeeded") {
    fail("invalid_command");
  }
  const purpose = capturePurpose(value.purpose);
  const operationKind = captureOperationKind(value.operationKind);
  assertCapturePurposeOperationMatrix(purpose, operationKind);
  const amountMinor = encodeFinanceNumeric38(value.amountMinor);
  if (BigInt(amountMinor) < 0n || value.currency !== "RUB") fail("invalid_command");
  if ((purpose === "platform_card_setup") !== (amountMinor === "0")) fail("invalid_command");
  const observedAt = instant(value.observedAt);
  const committedAt = instant(value.committedAt);
  if (committedAt.getTime() < observedAt.getTime()) fail("invalid_command");
  const providerResult = Object.freeze({
    kind: value.kind,
    providerOperationResultId: identifier(value.providerOperationResultId, 160),
    providerOperationIntentId: identifier(value.providerOperationIntentId, 160),
    providerOperationIntentVersion: positiveSafeInteger(value.providerOperationIntentVersion),
    providerOperationId: identifier(value.providerOperationId, 160),
    operationKind,
    economicPaymentIntentId: identifier(value.economicPaymentIntentId, 160),
    correlatedEconomicPaymentVersion: positiveSafeInteger(value.correlatedEconomicPaymentVersion),
    economicPaymentSessionId: identifier(value.economicPaymentSessionId, 160),
    sourceId: identifier(value.sourceId, 160),
    purpose,
    providerAccount: createProviderAccountIdentityBinding(value.providerAccount),
    outcome: value.outcome,
    providerPaymentId: identifier(value.providerPaymentId, 160),
    amountMinor,
    currency: value.currency,
    evidenceArtifactId: identifier(value.evidenceArtifactId, 160),
    evidenceArtifactDigest: digest(value.evidenceArtifactDigest),
    canonicalRequestDigest: digest(value.canonicalRequestDigest),
    observedAt: observedAt.toISOString(),
    persistenceTransactionBoundaryRef: persistenceBoundary(value.persistenceTransactionBoundaryRef),
    committedAt: committedAt.toISOString()
  });
  return providerResult as ApplyVerifiedCaptureCommand["providerResult"];
}

function normalizeFinancialMutation(
  value: CaptureFinancialMutationProposal,
  purpose: CapturePurpose
): CaptureFinancialMutationProposal {
  if (purpose === "platform_card_setup") {
    assertExactOwnDataRecord(value, ["kind", "reason"]);
    if (value.kind !== "no_posting" || value.reason !== "zero_amount_platform_card_setup") {
      fail("invalid_command");
    }
    return Object.freeze({ ...value });
  }
  assertExactOwnDataRecord(value, ["kind", "command"]);
  if (purpose === "platform_invoice") {
    if (value.kind !== "journal_only") fail("invalid_command");
    return Object.freeze({ ...value });
  }
  if (value.kind !== "journal_only" && value.kind !== "wallet_and_journal") {
    fail("invalid_command");
  }
  return Object.freeze({ ...value });
}

function normalizeOperationEnvelope(
  value: ResolvedFinanceOperationEnvelope
): ResolvedFinanceOperationEnvelope {
  assertExactOwnDataRecord(value, operationEnvelopeKeys);
  if (value.kind !== "resolved_finance_operation_envelope") fail("invalid_command");
  const normalized = Object.freeze({
    kind: value.kind,
    policyId: identifier(value.policyId, 200),
    policyVersion: positiveSafeInteger(value.policyVersion),
    policyDigest: digest(value.policyDigest),
    maximumRows: positiveSafeInteger(value.maximumRows),
    maximumDecimalDigits: positiveSafeInteger(value.maximumDecimalDigits),
    maximumArtifactBytes: positiveSafeInteger(value.maximumArtifactBytes)
  });
  return normalized as ResolvedFinanceOperationEnvelope;
}

function assertCapturePurposeOperationMatrix(
  purpose: CapturePurpose,
  operationKind: CaptureOperationKind
): void {
  const valid =
    (purpose === "client_order" && operationKind === "checkout_session_create") ||
    (purpose === "platform_invoice" &&
      (operationKind === "saved_card_charge" ||
        operationKind === "saved_card_charge_3ds_method_complete")) ||
    (purpose === "platform_card_setup" && operationKind === "card_setup");
  if (!valid) fail("invalid_command");
}

function capturePurpose(value: unknown): CapturePurpose {
  if (value !== "client_order" && value !== "platform_invoice" && value !== "platform_card_setup") {
    fail("invalid_command");
  }
  return value;
}

function captureOperationKind(value: unknown): CaptureOperationKind {
  if (
    value !== "checkout_session_create" &&
    value !== "card_setup" &&
    value !== "saved_card_charge" &&
    value !== "saved_card_charge_3ds_method_complete"
  ) {
    fail("invalid_command");
  }
  return value;
}

function assertExactOwnDataRecord(value: unknown, expectedKeys: readonly string[]): void {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    fail("invalid_command");
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    fail("invalid_command");
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail("invalid_command");
    }
  }
}

function identifier(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > maximumLength ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  ) {
    fail("invalid_command");
  }
  return value;
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_command");
  return Number(value);
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("invalid_command");
  }
  return value as FinanceDigest;
}

function instant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    fail("invalid_command");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_command");
  }
  return parsed;
}

function persistenceBoundary(value: unknown): string {
  if (typeof value !== "string" || !/^postgres-xid:[0-9]+$/.test(value)) {
    fail("invalid_command");
  }
  return value;
}

function positiveRevision(value: unknown): number {
  const parsed = Number(decodeFinancePositiveRevision(value));
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail("provider_result_conflict");
  return parsed;
}

function databaseInstant(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("provider_result_conflict");
  }
  return value.toISOString();
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function digestOrFalse(value: unknown): value is FinanceDigest {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function boundary<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof VerifiedCaptureApplicationPersistenceError) throw error;
    fail("invalid_command");
  }
}

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { readonly code?: unknown; readonly cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

function fail(reason: VerifiedCaptureApplicationPersistenceReason): never {
  throw new VerifiedCaptureApplicationPersistenceError(reason);
}
