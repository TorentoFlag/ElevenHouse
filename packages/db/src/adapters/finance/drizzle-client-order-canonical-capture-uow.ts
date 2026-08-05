import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  createProviderAccountIdentityBinding,
  hasAsciiControlCharacter,
  readPersistedVerifiedEconomicPaymentCaptureReceipt,
  type ApplyCanonicalClientOrderCaptureCommand,
  type CanonicalClientOrderCaptureCommitReceipt,
  type CanonicalClientOrderCaptureUnitOfWork,
  type FinanceDigest,
  type PersistedVerifiedEconomicPaymentCaptureReceipt,
  type ResolvedFinanceOperationEnvelope,
  type VerifiedClientOrderCaptureSemanticCommitReceipt,
  type VerifiedFinanceJournalCommitReceipt,
  type VerifiedWalletOperationCommitReceipt
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
  financePaymentTransitionFacts
} from "../../schema/finance/economic-payments.schema";
import {
  financeAllocationLinkProofs,
  financeJournalTransactions,
  financePersistenceCommitReceipts
} from "../../schema/finance/ledger.schema";
import { orders } from "../../schema/finance/orders.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import { financeWalletCommitBindings } from "../../schema/finance/wallet.schema";
import {
  financeProviderSemanticFacts,
  financeWebhookSemanticCommitReceipts
} from "../../schema/finance/webhook-inbox.schema";
import { confirmPaidBooking } from "../scheduling";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { markFinanceOrderPaid } from "./drizzle-order-store";
import {
  commitSealedJournalMutationInTransaction,
  prepareSealedJournalMutation,
  resolvePersistedProviderAstrologerJournalSourceScope
} from "./drizzle-sealed-journal-commit-uow";
import {
  commitSealedWalletJournalMutationInTransaction,
  createResolvedPersistedRootCaptureAuthority
} from "./drizzle-sealed-wallet-journal-commit-uow";
import { decodeFinancePositiveRevision, encodeFinanceNumeric38 } from "./finance-row-codecs";
import { mapDatabaseIssuedJournalCommitReceipt } from "./journal-transaction-writer";
import {
  mapDatabaseIssuedWalletCommitReceipt,
  prepareWalletJournalMutation
} from "./wallet-row-mapper";

const commandKeys = [
  "economicPaymentIntentId",
  "expectedEconomicPaymentVersion",
  "semanticCapture",
  "financialMutation",
  "operationEnvelope"
] as const;
const semanticReceiptKeys = [
  "kind",
  "receiptId",
  "inboxItemId",
  "inboxVersion",
  "committedCheckpointSequence",
  "semanticFactId",
  "semanticSourceKind",
  "semanticSourceId",
  "providerAccount",
  "economicPaymentIntentId",
  "economicPaymentSessionId",
  "purpose",
  "providerPaymentId",
  "amountMinor",
  "currency",
  "canonicalFactDigest",
  "evidenceArtifactId",
  "evidenceArtifactDigest",
  "observedAt",
  "businessEffect",
  "walletJournalCommitReceipt",
  "persistenceTransactionBoundaryRef",
  "committedAt"
] as const;
const providerAccountKeys = ["seriesId", "providerAccountId", "identityVersion"] as const;
const operationEnvelopeKeys = [
  "kind",
  "policyId",
  "policyVersion",
  "policyDigest",
  "maximumRows",
  "maximumDecimalDigits",
  "maximumArtifactBytes"
] as const;

export type ClientOrderCanonicalCapturePersistenceReason =
  | "invalid_command"
  | "semantic_capture_conflict"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "economic_payment_session_not_found"
  | "economic_payment_session_conflict"
  | "checkout_authorization_conflict"
  | "order_economics_conflict"
  | "financial_mutation_conflict"
  | "capture_application_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ClientOrderCanonicalCapturePersistenceError extends Error {
  readonly code = "client_order_canonical_capture_persistence_error";

  constructor(readonly reason: ClientOrderCanonicalCapturePersistenceReason) {
    super("Canonical client-order capture could not be applied atomically");
    this.name = "ClientOrderCanonicalCapturePersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  semanticCapture: VerifiedClientOrderCaptureSemanticCommitReceipt;
  financialMutation: ApplyCanonicalClientOrderCaptureCommand["financialMutation"];
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

type LockedSemanticCapture = Readonly<{
  fact: typeof financeProviderSemanticFacts.$inferSelect;
  receipt: typeof financeWebhookSemanticCommitReceipts.$inferSelect;
}>;

type LockedClientOrder = Readonly<{
  order: typeof orders.$inferSelect;
  economics: typeof financeOrderEconomicsSnapshots.$inferSelect;
}>;

/**
 * Client Hosted Checkout has a different monetary authority from saved-card charges. This UoW
 * intentionally never reads a provider-operation result: its only capture authority is the
 * sealed webhook semantic receipt backed by ArcPay's canonical payment read.
 */
export function createDrizzleClientOrderCanonicalCaptureUnitOfWork(
  input: Readonly<{
    database: ElevenHouseDatabase;
  }>
): CanonicalClientOrderCaptureUnitOfWork {
  return Object.freeze({
    async applyCanonicalClientOrderCapture(command) {
      try {
        return await input.database.transaction((transaction) =>
          applyCanonicalClientOrderCaptureInTransaction(transaction, command)
        );
      } catch (error) {
        if (error instanceof ClientOrderCanonicalCapturePersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("capture_application_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies CanonicalClientOrderCaptureUnitOfWork);
}

export function normalizeCanonicalClientOrderCaptureCommand(input: unknown): NormalizedCommand {
  return boundary(() => {
    assertExactRecord(input, commandKeys);
    const command = input as ApplyCanonicalClientOrderCaptureCommand;
    const economicPaymentIntentId = identifier(command.economicPaymentIntentId, 160);
    const expectedEconomicPaymentVersion = positiveInteger(command.expectedEconomicPaymentVersion);
    const semanticCapture = normalizeSemanticCapture(command.semanticCapture);
    if (semanticCapture.economicPaymentIntentId !== economicPaymentIntentId)
      fail("invalid_command");
    const financialMutation = normalizeFinancialMutation(command.financialMutation);
    const operationEnvelope = normalizeOperationEnvelope(command.operationEnvelope);
    return Object.freeze({
      economicPaymentIntentId,
      expectedEconomicPaymentVersion,
      semanticCapture,
      financialMutation,
      operationEnvelope
    });
  });
}

/** Internal composition hook; it does not open a nested transaction. */
export async function applyCanonicalClientOrderCaptureInTransaction(
  transaction: FinanceTransaction,
  input: ApplyCanonicalClientOrderCaptureCommand
): Promise<CanonicalClientOrderCaptureCommitReceipt> {
  const command = normalizeCanonicalClientOrderCaptureCommand(input);
  const semantic = await lockSemanticCapture(transaction, command);
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, command.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!intent) fail("economic_payment_not_found");
  assertIntentMatchesSemantic(intent, command, semantic.fact);

  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, semantic.fact.economicPaymentSessionId!))
    .limit(1)
    .for("update");
  if (!session) fail("economic_payment_session_not_found");
  assertSessionMatchesSemantic(session, intent, semantic.fact);

  const [existing] = await transaction
    .select()
    .from(financeVerifiedCaptureApplicationReceipts)
    .where(
      eq(
        financeVerifiedCaptureApplicationReceipts.providerSemanticCommitReceiptId,
        semantic.receipt.id
      )
    )
    .limit(1)
    .for("share");
  if (existing) return rehydrateCommittedCapture(transaction, command, semantic, existing);

  const client = await lockClientOrder(transaction, intent, session, semantic.fact);
  const currentEconomicVersion = revision(intent.version);
  const currentSessionVersion = revision(session.version);
  if (currentEconomicVersion !== command.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  if (isTerminalSessionState(session.state)) fail("economic_payment_session_conflict");
  const nextEconomicVersion = currentEconomicVersion + 1;
  const nextSessionVersion = currentSessionVersion + 1;
  if (!Number.isSafeInteger(nextEconomicVersion) || !Number.isSafeInteger(nextSessionVersion)) {
    fail("persistence_write_incomplete");
  }

  const ids = deriveSemanticCapturePersistenceIds(semantic.fact.id);
  const observedAt = semantic.fact.observedAt;
  const transition = await transaction
    .insert(financePaymentTransitionFacts)
    .values({
      id: ids.transitionFactId,
      economicPaymentIntentId: intent.id,
      economicPaymentSessionId: session.id,
      seriesId: semantic.fact.seriesId,
      providerAccountId: semantic.fact.providerAccountId,
      providerIdentityVersion: semantic.fact.providerIdentityVersion,
      fromState: session.state,
      toState: "captured",
      evidenceKind: "canonical_provider_result",
      authorityKind: "provider_semantic_fact",
      authorityId: semantic.fact.id,
      evidenceArtifactId: semantic.fact.evidenceArtifactId,
      evidenceArtifactDigest: semantic.fact.evidenceArtifactDigest,
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

  const capture = await transaction
    .insert(financeCaptureFacts)
    .values({
      id: ids.captureFactId,
      economicPaymentIntentId: intent.id,
      economicPaymentSessionId: session.id,
      seriesId: semantic.fact.seriesId,
      providerAccountId: semantic.fact.providerAccountId,
      providerIdentityVersion: semantic.fact.providerIdentityVersion,
      providerPaymentId: semantic.fact.providerPaymentId!,
      amountMinor: semantic.fact.amountMinor!,
      currency: "RUB",
      evidenceAuthorityKind: "provider_semantic_fact",
      evidenceAuthorityId: semantic.fact.id,
      evidenceArtifactId: semantic.fact.evidenceArtifactId,
      evidenceArtifactDigest: semantic.fact.evidenceArtifactDigest,
      capturedAt: observedAt
    })
    .returning({ id: financeCaptureFacts.id });
  if (capture.length !== 1 || capture[0]?.id !== ids.captureFactId) {
    fail("persistence_write_incomplete");
  }

  const updatedSession = await transaction
    .update(financeEconomicPaymentSessions)
    .set({ state: "captured", version: String(nextSessionVersion), terminalAt: observedAt })
    .where(
      and(
        eq(financeEconomicPaymentSessions.id, session.id),
        eq(financeEconomicPaymentSessions.version, String(currentSessionVersion))
      )
    )
    .returning({ version: financeEconomicPaymentSessions.version });
  if (updatedSession.length !== 1 || revision(updatedSession[0]?.version) !== nextSessionVersion) {
    fail("economic_payment_session_conflict");
  }

  const updatedIntent = await transaction
    .update(financeEconomicPaymentIntents)
    .set({ state: "captured", version: String(nextEconomicVersion) })
    .where(
      and(
        eq(financeEconomicPaymentIntents.id, intent.id),
        eq(financeEconomicPaymentIntents.version, String(currentEconomicVersion))
      )
    )
    .returning({ version: financeEconomicPaymentIntents.version });
  if (updatedIntent.length !== 1 || revision(updatedIntent[0]?.version) !== nextEconomicVersion) {
    fail("economic_payment_version_conflict");
  }

  const committed = await commitFinancialMutation(
    transaction,
    command,
    client,
    semantic.fact,
    ids.captureFactId
  );
  const clearing = await transaction
    .insert(financePaymentClearingHeads)
    .values({
      economicPaymentIntentId: intent.id,
      seriesId: semantic.fact.seriesId,
      providerAccountId: semantic.fact.providerAccountId,
      providerIdentityVersion: semantic.fact.providerIdentityVersion,
      currency: "RUB",
      state: "unmatched",
      version: "1"
    })
    .returning({ economicPaymentIntentId: financePaymentClearingHeads.economicPaymentIntentId });
  if (clearing.length !== 1 || clearing[0]?.economicPaymentIntentId !== intent.id) {
    fail("persistence_write_incomplete");
  }

  const paid = await markFinanceOrderPaid(transaction, {
    orderId: client.order.id,
    now: observedAt.toISOString()
  });
  if (!paid) fail("order_economics_conflict");
  if (client.order.bookingId) {
    const booking = await confirmPaidBooking(transaction, {
      bookingId: client.order.bookingId,
      now: observedAt.toISOString()
    });
    if (!booking) fail("order_economics_conflict");
  }

  const [application] = await transaction
    .insert(financeVerifiedCaptureApplicationReceipts)
    .values({
      captureFactId: ids.captureFactId,
      providerResultReceiptId: null,
      providerSemanticFactId: semantic.fact.id,
      providerSemanticCommitReceiptId: semantic.receipt.id,
      journalPersistenceReceiptId: committed.wallet
        ? await journalReceiptIdForWalletCommit(transaction, committed.wallet)
        : committed.journal.ref.receiptId,
      walletCommitReceiptId: committed.wallet?.receiptId ?? null
    })
    .returning();
  if (!application) fail("persistence_write_incomplete");
  return rehydrateCommittedCapture(transaction, command, semantic, application, committed);
}

async function lockSemanticCapture(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<LockedSemanticCapture> {
  const semantic = command.semanticCapture;
  const [account] = await transaction
    .select({ provider: financeProviderAccounts.provider })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, semantic.providerAccount.seriesId),
        eq(financeProviderAccounts.providerAccountId, semantic.providerAccount.providerAccountId),
        eq(financeProviderAccounts.identityVersion, semantic.providerAccount.identityVersion)
      )
    )
    .limit(1)
    .for("share");
  if (!account || account.provider !== "arc_pay") fail("semantic_capture_conflict");

  const [fact] = await transaction
    .select()
    .from(financeProviderSemanticFacts)
    .where(eq(financeProviderSemanticFacts.id, semantic.semanticFactId))
    .limit(1)
    .for("share");
  const [receipt] = await transaction
    .select()
    .from(financeWebhookSemanticCommitReceipts)
    .where(eq(financeWebhookSemanticCommitReceipts.id, semantic.receiptId))
    .limit(1)
    .for("share");
  if (!fact || !receipt || !semanticRowsMatchReceipt(fact, receipt, semantic)) {
    fail("semantic_capture_conflict");
  }
  return Object.freeze({ fact, receipt });
}

function semanticRowsMatchReceipt(
  fact: typeof financeProviderSemanticFacts.$inferSelect,
  receipt: typeof financeWebhookSemanticCommitReceipts.$inferSelect,
  semantic: VerifiedClientOrderCaptureSemanticCommitReceipt
): boolean {
  return (
    receipt.semanticFactId === fact.id &&
    receipt.processingStatus === "completed" &&
    receipt.effectDisposition === "applied_once" &&
    receipt.semanticSourceKind === "payment_transition" &&
    fact.semanticSourceKind === "payment_transition" &&
    receipt.inboxItemId === fact.inboxItemId &&
    fact.inboxItemId === semantic.inboxItemId &&
    revision(receipt.inboxVersion) === semantic.inboxVersion &&
    revision(receipt.checkpointSequence) === semantic.committedCheckpointSequence &&
    fact.seriesId === semantic.providerAccount.seriesId &&
    fact.providerAccountId === semantic.providerAccount.providerAccountId &&
    fact.providerIdentityVersion === semantic.providerAccount.identityVersion &&
    fact.economicPaymentIntentId === semantic.economicPaymentIntentId &&
    fact.economicPaymentSessionId === semantic.economicPaymentSessionId &&
    fact.purpose === "client_order" &&
    fact.providerPaymentId === semantic.providerPaymentId &&
    String(fact.amountMinor) === semantic.amountMinor &&
    fact.currency === "RUB" &&
    fact.canonicalFactDigest === semantic.canonicalFactDigest &&
    fact.evidenceArtifactId === semantic.evidenceArtifactId &&
    fact.evidenceArtifactDigest === semantic.evidenceArtifactDigest &&
    fact.observedAt.toISOString() === semantic.observedAt &&
    receipt.semanticSourceId === semantic.semanticSourceId &&
    receipt.economicPaymentIntentId === fact.economicPaymentIntentId &&
    receipt.economicPaymentSessionId === fact.economicPaymentSessionId &&
    receipt.providerPaymentId === fact.providerPaymentId &&
    String(receipt.amountMinor) === semantic.amountMinor &&
    receipt.currency === "RUB" &&
    receipt.canonicalFactDigest === fact.canonicalFactDigest &&
    receipt.evidenceArtifactId === fact.evidenceArtifactId &&
    receipt.evidenceArtifactDigest === fact.evidenceArtifactDigest &&
    receipt.observedAt.getTime() === fact.observedAt.getTime() &&
    receipt.persistenceTransactionBoundaryRef === semantic.persistenceTransactionBoundaryRef &&
    receipt.committedAt.toISOString() === semantic.committedAt
  );
}

function assertIntentMatchesSemantic(
  intent: typeof financeEconomicPaymentIntents.$inferSelect,
  command: NormalizedCommand,
  fact: typeof financeProviderSemanticFacts.$inferSelect
): void {
  if (
    intent.purpose !== "client_order" ||
    intent.id !== command.economicPaymentIntentId ||
    intent.sourceId.length < 1 ||
    intent.seriesId !== fact.seriesId ||
    intent.providerAccountId !== fact.providerAccountId ||
    intent.providerIdentityVersion !== fact.providerIdentityVersion ||
    String(intent.amountMinor) !== String(fact.amountMinor) ||
    intent.currency !== "RUB"
  )
    fail("semantic_capture_conflict");
}

function assertSessionMatchesSemantic(
  session: typeof financeEconomicPaymentSessions.$inferSelect,
  intent: typeof financeEconomicPaymentIntents.$inferSelect,
  fact: typeof financeProviderSemanticFacts.$inferSelect
): void {
  if (
    session.id !== fact.economicPaymentSessionId ||
    session.economicPaymentIntentId !== intent.id ||
    session.seriesId !== fact.seriesId ||
    session.providerAccountId !== fact.providerAccountId ||
    session.providerIdentityVersion !== fact.providerIdentityVersion
  )
    fail("semantic_capture_conflict");
}

async function lockClientOrder(
  transaction: FinanceTransaction,
  intent: typeof financeEconomicPaymentIntents.$inferSelect,
  session: typeof financeEconomicPaymentSessions.$inferSelect,
  fact: typeof financeProviderSemanticFacts.$inferSelect
): Promise<LockedClientOrder> {
  const [authorization] = await transaction
    .select()
    .from(financeClientCheckoutAuthorizations)
    .where(eq(financeClientCheckoutAuthorizations.economicPaymentSessionId, session.id))
    .limit(1)
    .for("share");
  const [order] = await transaction
    .select()
    .from(orders)
    .where(eq(orders.id, intent.sourceId))
    .limit(1)
    .for("update");
  const [economics] = await transaction
    .select()
    .from(financeOrderEconomicsSnapshots)
    .where(eq(financeOrderEconomicsSnapshots.orderId, intent.sourceId))
    .limit(1)
    .for("share");
  if (
    !authorization ||
    !order ||
    !economics ||
    authorization.orderId !== order.id ||
    authorization.clientUserId !== order.clientUserId ||
    authorization.economicPaymentIntentId !== intent.id ||
    authorization.economicPaymentSessionId !== session.id
  )
    fail("checkout_authorization_conflict");
  if (
    order.status !== "pending_payment" ||
    order.grossCurrency !== "RUB" ||
    String(order.grossAmountMinor) !== String(fact.amountMinor) ||
    economics.orderId !== order.id ||
    economics.astrologerUserId !== order.astrologerUserId ||
    economics.grossCurrency !== "RUB" ||
    economics.commissionCurrency !== "RUB" ||
    economics.payableCurrency !== "RUB" ||
    String(economics.grossAmountMinor) !== String(fact.amountMinor) ||
    String(order.platformFeeAmountMinor) !== String(economics.commissionAmountMinor) ||
    String(order.astrologerNetAmountMinor) !== String(economics.payableAmountMinor) ||
    order.tariffCommissionBps !== economics.commissionBps
  )
    fail("order_economics_conflict");
  return Object.freeze({ order, economics });
}

async function commitFinancialMutation(
  transaction: FinanceTransaction,
  command: NormalizedCommand,
  client: LockedClientOrder,
  fact: typeof financeProviderSemanticFacts.$inferSelect,
  captureFactId: string
): Promise<
  Readonly<{
    journal: VerifiedFinanceJournalCommitReceipt;
    wallet: VerifiedWalletOperationCommitReceipt | null;
  }>
> {
  if (command.financialMutation.kind === "wallet_and_journal") {
    const prepared = prepareWalletJournalMutation(command.financialMutation.command);
    assertWalletMutation(prepared, client, fact, captureFactId);
    const wallet = await commitSealedWalletJournalMutationInTransaction(
      transaction,
      command.financialMutation.command,
      createResolvedPersistedRootCaptureAuthority({
        canonicalCaptureEvidenceId: captureFactId,
        captureIntentId: fact.economicPaymentIntentId,
        captureSessionId: fact.economicPaymentSessionId,
        providerAccountSeriesId: fact.seriesId,
        providerAccountId: fact.providerAccountId,
        providerIdentityVersion: fact.providerIdentityVersion,
        providerPaymentId: fact.providerPaymentId,
        captureAmountMinor: String(fact.amountMinor),
        captureCurrency: "RUB",
        captureEvidenceAuthorityKind: "provider_semantic_fact",
        captureEvidenceAuthorityId: fact.id,
        captureEvidenceArtifactId: fact.evidenceArtifactId,
        captureEvidenceArtifactDigest: fact.evidenceArtifactDigest
      })
    );
    const journal = await rehydrateJournalReceiptForWallet(transaction, wallet);
    return Object.freeze({ journal, wallet });
  }
  if (command.financialMutation.kind !== "journal_only") fail("financial_mutation_conflict");
  const prepared = prepareSealedJournalMutation(command.financialMutation.command);
  if (
    client.economics.payableAmountMinor !== "0" ||
    String(client.economics.commissionAmountMinor) !== String(fact.amountMinor) ||
    prepared.transaction.sourceKey.kind !== "order" ||
    prepared.transaction.sourceKey.sourceId !== client.order.id ||
    prepared.transaction.sourceKey.operation !== "sale_captured" ||
    prepared.transaction.entries.some((entry) => "astrologerUserId" in entry.account)
  )
    fail("financial_mutation_conflict");
  const scope = await resolvePersistedProviderAstrologerJournalSourceScope(
    transaction,
    {
      seriesId: fact.seriesId,
      providerAccountId: fact.providerAccountId,
      identityVersion: fact.providerIdentityVersion
    },
    client.order.astrologerUserId
  );
  const journal = await commitSealedJournalMutationInTransaction(
    transaction,
    command.financialMutation.command,
    scope
  );
  return Object.freeze({ journal, wallet: null });
}

function assertWalletMutation(
  prepared: ReturnType<typeof prepareWalletJournalMutation>,
  client: LockedClientOrder,
  fact: typeof financeProviderSemanticFacts.$inferSelect,
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
    root.captureSource.intentId !== fact.economicPaymentIntentId ||
    root.captureSource.canonicalEvidenceId !== captureFactId ||
    root.captureSource.paymentIntent.captureSessionId !== fact.economicPaymentSessionId ||
    capture.providerPaymentId !== fact.providerPaymentId ||
    capture.amount.amountMinor !== Number(fact.amountMinor) ||
    capture.amount.currency !== "RUB" ||
    capture.providerAccount.seriesId !== fact.seriesId ||
    capture.providerAccount.providerAccountId !== fact.providerAccountId ||
    capture.providerAccount.identityVersion !== fact.providerIdentityVersion
  )
    fail("financial_mutation_conflict");
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
  if (!binding?.journalPersistenceReceiptId) fail("persistence_write_incomplete");
  return binding.journalPersistenceReceiptId;
}

async function rehydrateJournalReceiptForWallet(
  transaction: FinanceTransaction,
  wallet: VerifiedWalletOperationCommitReceipt
): Promise<VerifiedFinanceJournalCommitReceipt> {
  const [binding] = await transaction
    .select({
      journalPersistenceReceiptId: financeWalletCommitBindings.journalPersistenceReceiptId
    })
    .from(financeWalletCommitBindings)
    .where(eq(financeWalletCommitBindings.commitReceiptId, wallet.receiptId))
    .limit(1)
    .for("share");
  if (!binding?.journalPersistenceReceiptId) fail("persistence_write_incomplete");
  return rehydrateJournalReceipt(transaction, binding.journalPersistenceReceiptId);
}

async function rehydrateCommittedCapture(
  transaction: FinanceTransaction,
  command: NormalizedCommand,
  semantic: LockedSemanticCapture,
  application: typeof financeVerifiedCaptureApplicationReceipts.$inferSelect,
  committed?: Readonly<{
    journal: VerifiedFinanceJournalCommitReceipt;
    wallet: VerifiedWalletOperationCommitReceipt | null;
  }>
): Promise<CanonicalClientOrderCaptureCommitReceipt> {
  const ids = deriveSemanticCapturePersistenceIds(semantic.fact.id);
  if (
    application.purpose !== "client_order" ||
    application.economicEffectKind !== "client_sale_captured" ||
    application.captureFactId !== ids.captureFactId ||
    application.providerResultReceiptId !== null ||
    application.providerSemanticFactId !== semantic.fact.id ||
    application.providerSemanticCommitReceiptId !== semantic.receipt.id ||
    application.economicPaymentIntentId !== command.economicPaymentIntentId ||
    application.economicPaymentSessionId !== semantic.fact.economicPaymentSessionId ||
    application.providerPaymentId !== semantic.fact.providerPaymentId ||
    String(application.amountMinor) !== String(semantic.fact.amountMinor) ||
    application.currency !== "RUB" ||
    application.captureEvidenceAuthorityKind !== "provider_semantic_fact" ||
    application.captureEvidenceAuthorityId !== semantic.fact.id ||
    application.clearingState !== "unmatched" ||
    revision(application.clearingVersion) !== 1 ||
    !application.journalPersistenceReceiptId ||
    !uuid(application.receiptId) ||
    !digest(application.canonicalDigest) ||
    !postgresBoundary(application.persistenceTransactionBoundaryRef)
  )
    fail("persistence_write_incomplete");

  const journal =
    committed?.journal ??
    (await rehydrateJournalReceipt(transaction, application.journalPersistenceReceiptId));
  const wallet =
    committed?.wallet ?? (await rehydrateWalletCommitReceipt(transaction, command, application));
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
  const providerAccount = createProviderAccountIdentityBinding({
    seriesId: semantic.fact.seriesId,
    providerAccountId: semantic.fact.providerAccountId,
    identityVersion: semantic.fact.providerIdentityVersion
  });
  const amount = Object.freeze({
    amountMinor: safeMoney(String(semantic.fact.amountMinor)),
    currency: "RUB" as const
  });
  const effect = Object.freeze({
    kind: "client_sale_captured" as const,
    intentId: command.economicPaymentIntentId,
    sourceId: application.sourceId,
    providerAccount,
    providerPaymentId: semantic.fact.providerPaymentId!,
    amount,
    canonicalEvidenceId: application.captureFactId
  });
  const economicCaptureReceipt = readPersistedVerifiedEconomicPaymentCaptureReceipt({
    kind: "verified_provider_capture_receipt",
    authorityStatus: "verified_persisted",
    receiptId: application.captureFactId,
    intent: {
      intentId: command.economicPaymentIntentId,
      version: revision(application.economicPaymentVersion),
      purpose: "client_order",
      sourceId: application.sourceId,
      providerAccount,
      amount,
      state: "captured",
      sessions: sessions.map((session) =>
        Object.freeze({
          sessionId: session.id,
          providerAccount,
          state: session.state as never,
          evidenceHistory: transitions
            .filter((transition) => transition.economicPaymentSessionId === session.id)
            .map((transition) =>
              Object.freeze({
                fromState: transition.fromState as never,
                toState: transition.toState as never,
                kind: transition.evidenceKind as never,
                evidenceId:
                  transition.id === application.captureTransitionFactId
                    ? application.captureFactId
                    : transition.authorityId
              })
            )
        })
      ),
      capture: effect,
      captureSessionId: semantic.fact.economicPaymentSessionId
    },
    effect
  } as unknown as PersistedVerifiedEconomicPaymentCaptureReceipt);
  return Object.freeze({
    ref: Object.freeze({
      kind: "verified_capture_application_commit_receipt" as const,
      receiptId: application.receiptId,
      version: 1 as const,
      canonicalDigest: application.canonicalDigest as FinanceDigest
    }),
    kind: "canonical_client_order_capture_commit_receipt" as const,
    economicCaptureReceipt,
    journalCommitReceipt: journal,
    walletJournalCommitReceipt: wallet,
    persistenceTransactionBoundaryRef: application.persistenceTransactionBoundaryRef,
    committedAt: application.committedAt.toISOString()
  }) as CanonicalClientOrderCaptureCommitReceipt;
}

async function rehydrateJournalReceipt(
  transaction: FinanceTransaction,
  receiptId: string
): Promise<VerifiedFinanceJournalCommitReceipt> {
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
    .where(eq(financePersistenceCommitReceipts.receiptId, receiptId))
    .limit(1)
    .for("share");
  if (!row?.journalTransactionId || !row.journalTransactionDigest || !digest(row.canonicalDigest)) {
    fail("persistence_write_incomplete");
  }
  const journalTransactionDigest = row.journalTransactionDigest;
  return mapDatabaseIssuedJournalCommitReceipt({
    ...row,
    journalTransactionDigest,
    receiptVersion: 1
  });
}

async function rehydrateWalletCommitReceipt(
  transaction: FinanceTransaction,
  command: NormalizedCommand,
  application: typeof financeVerifiedCaptureApplicationReceipts.$inferSelect
): Promise<VerifiedWalletOperationCommitReceipt | null> {
  if (application.walletCommitReceiptId === null) {
    if (command.financialMutation.kind !== "journal_only") fail("persistence_write_incomplete");
    return null;
  }
  if (command.financialMutation.kind !== "wallet_and_journal") fail("persistence_write_incomplete");
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
    binding.walletId !== application.walletId ||
    binding.nextWalletRevision !== application.walletRevision ||
    binding.commitReceiptCanonicalDigest !== application.walletCommitDigest ||
    binding.operationReceiptId !== prepared.receipt.receiptId
  )
    fail("persistence_write_incomplete");
  return mapDatabaseIssuedWalletCommitReceipt(prepared, {
    ...binding,
    operationReceiptDigest: prepared.receipt.canonicalDigest
  });
}

function normalizeSemanticCapture(value: unknown): VerifiedClientOrderCaptureSemanticCommitReceipt {
  assertExactRecord(value, semanticReceiptKeys);
  const receipt = value as VerifiedClientOrderCaptureSemanticCommitReceipt;
  assertExactRecord(receipt.providerAccount, providerAccountKeys);
  if (
    receipt.kind !== "webhook_semantic_commit_receipt" ||
    !uuid(receipt.receiptId) ||
    !identifier(receipt.inboxItemId, 160) ||
    !positiveInteger(receipt.inboxVersion) ||
    !positiveInteger(receipt.committedCheckpointSequence) ||
    !identifier(receipt.semanticFactId, 160) ||
    receipt.semanticSourceKind !== "payment_transition" ||
    !identifier(receipt.semanticSourceId, 160) ||
    !identifier(receipt.providerAccount.seriesId, 160) ||
    !identifier(receipt.providerAccount.providerAccountId, 160) ||
    !positiveInteger(receipt.providerAccount.identityVersion) ||
    !identifier(receipt.economicPaymentIntentId, 160) ||
    !identifier(receipt.economicPaymentSessionId, 160) ||
    receipt.purpose !== "client_order" ||
    !identifier(receipt.providerPaymentId, 160) ||
    !positiveMoney(receipt.amountMinor) ||
    receipt.currency !== "RUB" ||
    !digest(receipt.canonicalFactDigest) ||
    !identifier(receipt.evidenceArtifactId, 160) ||
    !digest(receipt.evidenceArtifactDigest) ||
    !instant(receipt.observedAt) ||
    receipt.businessEffect !== "applied_once" ||
    receipt.walletJournalCommitReceipt !== null ||
    !postgresBoundary(receipt.persistenceTransactionBoundaryRef) ||
    !instant(receipt.committedAt) ||
    Date.parse(receipt.committedAt) < Date.parse(receipt.observedAt)
  )
    fail("invalid_command");
  return Object.freeze({ ...receipt }) as VerifiedClientOrderCaptureSemanticCommitReceipt;
}

function normalizeFinancialMutation(
  value: unknown
): ApplyCanonicalClientOrderCaptureCommand["financialMutation"] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !("kind" in value) ||
    !("command" in value)
  ) {
    fail("invalid_command");
  }
  if (value.kind !== "wallet_and_journal" && value.kind !== "journal_only") fail("invalid_command");
  return Object.freeze(value) as ApplyCanonicalClientOrderCaptureCommand["financialMutation"];
}

function normalizeOperationEnvelope(value: unknown): ResolvedFinanceOperationEnvelope {
  assertExactRecord(value, operationEnvelopeKeys);
  const envelope = value as ResolvedFinanceOperationEnvelope;
  if (
    envelope.kind !== "resolved_finance_operation_envelope" ||
    !identifier(envelope.policyId, 160) ||
    !positiveInteger(envelope.policyVersion) ||
    !digest(envelope.policyDigest) ||
    !positiveInteger(envelope.maximumRows) ||
    !positiveInteger(envelope.maximumDecimalDigits) ||
    !positiveInteger(envelope.maximumArtifactBytes)
  )
    fail("invalid_command");
  return Object.freeze({ ...envelope }) as ResolvedFinanceOperationEnvelope;
}

export function deriveSemanticCapturePersistenceIds(semanticFactId: string): Readonly<{
  transitionFactId: string;
  captureFactId: string;
}> {
  const value = identifier(semanticFactId, 160);
  const hash = createHash("sha256").update(value, "utf8").digest("hex");
  return Object.freeze({
    transitionFactId: `capture-transition:semantic:${hash}`,
    captureFactId: `capture:semantic:${hash}`
  });
}

function revision(value: unknown): number {
  try {
    const parsed = Number(decodeFinancePositiveRevision(String(value)));
    if (!Number.isSafeInteger(parsed) || parsed < 1) fail("persistence_write_incomplete");
    return parsed;
  } catch {
    fail("persistence_write_incomplete");
  }
}

function safeMoney(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    fail("persistence_write_incomplete");
  }
  return parsed;
}

function positiveMoney(value: unknown): value is string {
  try {
    return BigInt(encodeFinanceNumeric38(value)) > 0n;
  } catch {
    return false;
  }
}

function isTerminalSessionState(state: string): boolean {
  return ["captured", "declined", "failed", "expired", "voided"].includes(state);
}

function assertExactRecord(
  value: unknown,
  keys: readonly string[]
): asserts value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    fail("invalid_command");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    nodeUtilTypes.isProxy(value) === false &&
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function identifier(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail("invalid_command");
  return value as number;
}

function digest(value: unknown): value is FinanceDigest {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function instant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function postgresBoundary(value: unknown): value is string {
  return typeof value === "string" && /^postgres-xid:[0-9]+$/u.test(value);
}

function postgresCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function boundary<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof ClientOrderCanonicalCapturePersistenceError) throw error;
    fail("invalid_command");
  }
}

function fail(reason: ClientOrderCanonicalCapturePersistenceReason): never {
  throw new ClientOrderCanonicalCapturePersistenceError(reason);
}
