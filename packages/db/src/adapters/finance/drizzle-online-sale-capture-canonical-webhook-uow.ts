import type {
  ApplyCanonicalOnlineSaleCaptureCommand,
  CanonicalOnlineSaleCaptureSemanticCommitReceipt,
  OnlineSaleCaptureCanonicalCaptureUnitOfWork,
  OnlineSaleCapturePersistenceCommand,
  OnlineSaleCapturePersistenceResolver,
  OnlineSaleCaptureResolution,
  WebhookSemanticCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { createHash } from "node:crypto";
import {
  createCapturedProviderPaymentSemanticSourceId,
  digestFinanceCanonicalValueV1,
  hasAsciiControlCharacter
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions,
  financePaymentClearingHeads,
  financePaymentTransitionFacts
} from "../../schema/finance/economic-payments.schema";
import {
  financeOnlineSaleCaptureApplications,
  financeOnlineSaleCaptureJournalProofs
} from "../../schema/finance/online-sale-capture.schema";
import { orders } from "../../schema/finance/orders.schema";
import { confirmPaidBooking } from "../scheduling";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { markFinanceOrderPaid } from "./drizzle-order-store";
import {
  commitOnlineSaleCaptureInTransaction,
  OnlineSaleCaptureCommitPersistenceError,
  type OnlineSaleCaptureCommitReceipt
} from "./drizzle-online-sale-capture-commit-uow";
import {
  ensureCanonicalClientOrderCaptureFactInTransaction,
  OnlineSaleCapturePersistenceResolutionError
} from "./drizzle-online-sale-capture-persistence-resolver";
import {
  applyVerifiedWebhookSemanticFactInTransaction,
  WebhookInboxProcessingPersistenceError
} from "./drizzle-webhook-inbox-processing-uow";

const commandKeys = ["semanticFact", "capture"] as const;

export type OnlineSaleCaptureCanonicalWebhookPersistenceReason =
  | "invalid_command"
  | "semantic_capture_conflict"
  | "capture_replay_conflict"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "economic_payment_session_not_found"
  | "economic_payment_session_conflict"
  | "order_fulfillment_conflict"
  | "v2_evidence_conflict"
  | "persistence_write_incomplete"
  | "retryable_concurrency_conflict";

export class OnlineSaleCaptureCanonicalWebhookPersistenceError extends Error {
  readonly code = "online_sale_capture_canonical_webhook_persistence_error";

  constructor(readonly reason: OnlineSaleCaptureCanonicalWebhookPersistenceReason) {
    super("Canonical online sale capture could not be committed atomically");
    this.name = "OnlineSaleCaptureCanonicalWebhookPersistenceError";
  }
}

type TransactionOps = Readonly<{
  applySemanticFact(
    transaction: FinanceTransaction,
    workerId: string,
    command: ApplyCanonicalOnlineSaleCaptureCommand["semanticFact"]
  ): Promise<WebhookSemanticCommitReceipt>;
  applyCaptureFact(
    transaction: FinanceTransaction,
    semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt
  ): Promise<string>;
  commitOnlineSaleCapture(
    transaction: FinanceTransaction,
    command: OnlineSaleCapturePersistenceCommand
  ): Promise<OnlineSaleCaptureCommitReceipt>;
  applyEconomicEffects(
    transaction: FinanceTransaction,
    input: Readonly<{
      capture: ApplyCanonicalOnlineSaleCaptureCommand["capture"];
      semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt;
      captureFactId: string;
      persistenceCommand: OnlineSaleCapturePersistenceCommand;
      captureCommitReceipt: OnlineSaleCaptureCommitReceipt;
    }>
  ): Promise<void>;
}>;

/**
 * The only DB boundary allowed to consume a sealed HPP capture. It writes the inbox checkpoint
 * and semantic fact, lets a server-owned resolver build a bounded v2 command under that exact
 * transaction, then persists the v2 graph. Any failure aborts the outer transaction.
 */
export function createDrizzleOnlineSaleCaptureCanonicalWebhookUnitOfWork(
  input: Readonly<{
    database: ElevenHouseDatabase;
    workerId: string;
    mutationResolver: OnlineSaleCapturePersistenceResolver<FinanceTransaction>;
    transactionOps?: TransactionOps;
  }>
): OnlineSaleCaptureCanonicalCaptureUnitOfWork {
  const workerId = identifier(input.workerId);
  assertMutationResolver(input.mutationResolver);
  const transactionOps = input.transactionOps ?? defaultTransactionOps;
  return Object.freeze({
    async applyCanonicalOnlineSaleCapture(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction(async (transaction) => {
          const semanticCommitReceipt = assertCanonicalClientOrderSemanticReceipt(
            await transactionOps.applySemanticFact(transaction, workerId, normalized.semanticFact),
            normalized
          );
          const captureFactId = await transactionOps.applyCaptureFact(
            transaction,
            semanticCommitReceipt
          );
          const persistenceCommand = await resolveOnlineSaleCapturePersistenceInTransaction(
            input.mutationResolver,
            transaction,
            Object.freeze({ semanticCapture: semanticCommitReceipt, capture: normalized.capture })
          );
          const captureCommitReceipt = await transactionOps.commitOnlineSaleCapture(
            transaction,
            persistenceCommand
          );
          assertCaptureEffectMatchesSemantic(semanticCommitReceipt, captureCommitReceipt);
          await transactionOps.applyEconomicEffects(
            transaction,
            Object.freeze({
              capture: normalized.capture,
              semanticCapture: semanticCommitReceipt,
              captureFactId,
              persistenceCommand,
              captureCommitReceipt
            })
          );
          return Object.freeze({
            kind: "canonical_online_sale_capture_commit_receipt" as const,
            effect: captureCommitReceipt.effect === "replayed" ? "semantic_replay" : "applied_once",
            semanticCommitReceipt,
            captureReceipt: persistenceCommand.receipt
          });
        });
      } catch (error) {
        if (
          error instanceof OnlineSaleCaptureCanonicalWebhookPersistenceError ||
          error instanceof WebhookInboxProcessingPersistenceError ||
          error instanceof OnlineSaleCaptureCommitPersistenceError ||
          error instanceof OnlineSaleCapturePersistenceResolutionError
        ) {
          throw error;
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        throw error;
      }
    }
  } satisfies OnlineSaleCaptureCanonicalCaptureUnitOfWork);
}

const defaultTransactionOps: TransactionOps = Object.freeze({
  applySemanticFact: applyVerifiedWebhookSemanticFactInTransaction,
  applyCaptureFact: ensureCanonicalClientOrderCaptureFactInTransaction,
  commitOnlineSaleCapture: commitOnlineSaleCaptureInTransaction,
  applyEconomicEffects: applyOnlineSaleCaptureEconomicEffectsInTransaction
});

/**
 * Applies the economic and fulfillment consequences only after the v2 writer has produced its
 * receipt/proof/commitment. It deliberately contains no v1 wallet or sealed-journal writer.
 */
export async function applyOnlineSaleCaptureEconomicEffectsInTransaction(
  transaction: FinanceTransaction,
  input: Readonly<{
    capture: ApplyCanonicalOnlineSaleCaptureCommand["capture"];
    semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt;
    captureFactId: string;
    persistenceCommand: OnlineSaleCapturePersistenceCommand;
    captureCommitReceipt: OnlineSaleCaptureCommitReceipt;
  }>
): Promise<void> {
  const { capture, semanticCapture, captureFactId, persistenceCommand, captureCommitReceipt } =
    input;
  if (
    captureCommitReceipt.effect !== "applied_once" ||
    persistenceCommand.receipt.captureAuthority.canonicalEvidenceId !== captureFactId ||
    persistenceCommand.receipt.captureAuthority.intentId !== capture.economicPaymentIntentId ||
    persistenceCommand.receipt.captureAuthority.providerPaymentId !==
      semanticCapture.providerPaymentId
  ) {
    fail("v2_evidence_conflict");
  }
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, capture.economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!intent) fail("economic_payment_not_found");
  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, semanticCapture.economicPaymentSessionId))
    .limit(1)
    .for("update");
  if (!session) fail("economic_payment_session_not_found");
  assertEconomicCaptureAuthority(intent, session, input);

  const currentEconomicVersion = revision(intent.version);
  const currentSessionVersion = revision(session.version);
  if (currentEconomicVersion !== capture.expectedEconomicPaymentVersion) {
    fail("economic_payment_version_conflict");
  }
  if (isTerminalSessionState(session.state)) fail("economic_payment_session_conflict");
  const nextEconomicVersion = currentEconomicVersion + 1;
  const nextSessionVersion = currentSessionVersion + 1;
  if (!Number.isSafeInteger(nextEconomicVersion) || !Number.isSafeInteger(nextSessionVersion)) {
    fail("persistence_write_incomplete");
  }

  const ids = capturePersistenceIds(semanticCapture.semanticFactId);
  const observedAt = instant(semanticCapture.observedAt);
  const transition = await transaction
    .insert(financePaymentTransitionFacts)
    .values({
      id: ids.transitionFactId,
      economicPaymentIntentId: intent.id,
      economicPaymentSessionId: session.id,
      seriesId: semanticCapture.providerAccount.seriesId,
      providerAccountId: semanticCapture.providerAccount.providerAccountId,
      providerIdentityVersion: semanticCapture.providerAccount.identityVersion,
      fromState: session.state,
      toState: "captured",
      evidenceKind: "canonical_provider_result",
      authorityKind: "provider_semantic_fact",
      authorityId: semanticCapture.semanticFactId,
      evidenceArtifactId: semanticCapture.evidenceArtifactId,
      evidenceArtifactDigest: semanticCapture.evidenceArtifactDigest,
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

  const clearing = await transaction
    .insert(financePaymentClearingHeads)
    .values({
      economicPaymentIntentId: intent.id,
      seriesId: semanticCapture.providerAccount.seriesId,
      providerAccountId: semanticCapture.providerAccount.providerAccountId,
      providerIdentityVersion: semanticCapture.providerAccount.identityVersion,
      currency: "RUB",
      state: "unmatched",
      version: "1"
    })
    .returning({ economicPaymentIntentId: financePaymentClearingHeads.economicPaymentIntentId });
  if (clearing.length !== 1 || clearing[0]?.economicPaymentIntentId !== intent.id) {
    fail("persistence_write_incomplete");
  }

  const [order] = await transaction
    .select({ id: orders.id, bookingId: orders.bookingId })
    .from(orders)
    .where(eq(orders.id, persistenceCommand.receipt.orderEconomics.orderId))
    .limit(1)
    .for("update");
  if (!order || order.id !== intent.sourceId) fail("order_fulfillment_conflict");
  const paid = await markFinanceOrderPaid(transaction, {
    orderId: order.id,
    now: observedAt.toISOString()
  });
  if (!paid) fail("order_fulfillment_conflict");
  if (order.bookingId) {
    const booking = await confirmPaidBooking(transaction, {
      bookingId: order.bookingId,
      now: observedAt.toISOString()
    });
    if (!booking) fail("order_fulfillment_conflict");
  }

  const [proof] = await transaction
    .select({
      proofId: financeOnlineSaleCaptureJournalProofs.proofId,
      receiptId: financeOnlineSaleCaptureJournalProofs.receiptId,
      journalTransactionId: financeOnlineSaleCaptureJournalProofs.journalTransactionId,
      journalTransactionDigest: financeOnlineSaleCaptureJournalProofs.journalTransactionDigest
    })
    .from(financeOnlineSaleCaptureJournalProofs)
    .where(eq(financeOnlineSaleCaptureJournalProofs.receiptId, captureCommitReceipt.receiptId))
    .limit(1)
    .for("share");
  if (
    !proof ||
    proof.receiptId !== captureCommitReceipt.receiptId ||
    proof.journalTransactionId !== captureCommitReceipt.journalTransactionId ||
    proof.journalTransactionDigest !== captureCommitReceipt.journalTransactionDigest
  ) {
    fail("v2_evidence_conflict");
  }
  const boundaryRef = await issueBoundaryRef(transaction);
  const applicationPreimage = Object.freeze({
    kind: "online_sale_capture_application",
    version: 2,
    semanticCommitReceiptId: semanticCapture.receiptId,
    semanticFactId: semanticCapture.semanticFactId,
    captureFactId,
    economicPaymentIntentId: intent.id,
    economicPaymentVersion: String(nextEconomicVersion),
    economicPaymentSessionId: session.id,
    economicPaymentSessionVersion: String(nextSessionVersion),
    providerAccount: semanticCapture.providerAccount,
    providerPaymentId: semanticCapture.providerPaymentId,
    amountMinor: semanticCapture.amountMinor,
    currency: "RUB",
    clearing: { state: "unmatched", version: "1" },
    onlineSaleReceiptId: captureCommitReceipt.receiptId,
    onlineSaleJournalProofId: proof.proofId,
    onlineWalletCommitmentId: captureCommitReceipt.commitmentId,
    onlineWalletId: captureCommitReceipt.walletId,
    onlineWalletRevision: captureCommitReceipt.walletRevision,
    onlineWalletCommitmentDigest: captureCommitReceipt.commitmentDigest,
    persistenceTransactionBoundaryRef: boundaryRef
  });
  const [application] = await transaction
    .insert(financeOnlineSaleCaptureApplications)
    .values({
      semanticCommitReceiptId: semanticCapture.receiptId,
      semanticFactId: semanticCapture.semanticFactId,
      captureFactId,
      economicPaymentIntentId: intent.id,
      economicPaymentVersion: String(nextEconomicVersion),
      economicPaymentSessionId: session.id,
      economicPaymentSessionVersion: String(nextSessionVersion),
      providerAccountSeriesId: semanticCapture.providerAccount.seriesId,
      providerAccountId: semanticCapture.providerAccount.providerAccountId,
      providerIdentityVersion: semanticCapture.providerAccount.identityVersion,
      providerPaymentId: semanticCapture.providerPaymentId,
      amountMinor: semanticCapture.amountMinor,
      currency: "RUB",
      evidenceAuthorityKind: "provider_semantic_fact",
      evidenceArtifactId: semanticCapture.evidenceArtifactId,
      evidenceArtifactDigest: semanticCapture.evidenceArtifactDigest,
      clearingState: "unmatched",
      clearingVersion: "1",
      onlineSaleReceiptId: captureCommitReceipt.receiptId,
      onlineSaleJournalProofId: proof.proofId,
      onlineWalletCommitmentId: captureCommitReceipt.commitmentId,
      onlineWalletId: captureCommitReceipt.walletId,
      onlineWalletRevision: captureCommitReceipt.walletRevision,
      onlineWalletCommitmentDigest: captureCommitReceipt.commitmentDigest,
      canonicalPreimage: JSON.stringify(applicationPreimage),
      canonicalDigest: digestFinanceCanonicalValueV1(applicationPreimage),
      persistenceTransactionBoundaryRef: boundaryRef,
      committedAt: new Date()
    })
    .returning({ id: financeOnlineSaleCaptureApplications.id });
  if (!application) fail("persistence_write_incomplete");
}

function assertEconomicCaptureAuthority(
  intent: typeof financeEconomicPaymentIntents.$inferSelect,
  session: typeof financeEconomicPaymentSessions.$inferSelect,
  input: Readonly<{
    capture: ApplyCanonicalOnlineSaleCaptureCommand["capture"];
    semanticCapture: CanonicalOnlineSaleCaptureSemanticCommitReceipt;
    captureFactId: string;
    persistenceCommand: OnlineSaleCapturePersistenceCommand;
  }>
): void {
  const semantic = input.semanticCapture;
  if (
    intent.purpose !== "client_order" ||
    intent.id !== input.capture.economicPaymentIntentId ||
    intent.seriesId !== semantic.providerAccount.seriesId ||
    intent.providerAccountId !== semantic.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== semantic.providerAccount.identityVersion ||
    intent.amountMinor !== semantic.amountMinor ||
    intent.currency !== "RUB" ||
    session.id !== semantic.economicPaymentSessionId ||
    session.economicPaymentIntentId !== intent.id ||
    session.seriesId !== intent.seriesId ||
    session.providerAccountId !== intent.providerAccountId ||
    session.providerIdentityVersion !== intent.providerIdentityVersion ||
    input.persistenceCommand.receipt.operationId !== input.captureFactId
  ) {
    fail("semantic_capture_conflict");
  }
}

function capturePersistenceIds(semanticFactId: string): Readonly<{ transitionFactId: string }> {
  const hash = createHash("sha256").update(semanticFactId, "utf8").digest("hex");
  return Object.freeze({ transitionFactId: `capture-transition:semantic:${hash}` });
}

function revision(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    fail("persistence_write_incomplete");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail("persistence_write_incomplete");
  return parsed;
}

function isTerminalSessionState(state: string): boolean {
  return ["captured", "declined", "failed", "expired", "voided"].includes(state);
}

function instant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail("persistence_write_incomplete");
  return date;
}

async function issueBoundaryRef(transaction: FinanceTransaction): Promise<string> {
  const result = await transaction.execute<{ boundary: string }>(
    sql`select 'postgres-xid:' || txid_current()::text as boundary`
  );
  const boundary = result.rows[0]?.boundary;
  if (!boundary || !/^postgres-xid:[0-9]+$/u.test(boundary)) fail("persistence_write_incomplete");
  return boundary;
}

/** Testable composition seam; the resolver is never allowed to open a sibling transaction. */
export function resolveOnlineSaleCapturePersistenceInTransaction(
  resolver: OnlineSaleCapturePersistenceResolver<FinanceTransaction>,
  transaction: FinanceTransaction,
  resolution: OnlineSaleCaptureResolution
): Promise<OnlineSaleCapturePersistenceCommand> {
  return resolver.resolveOnlineSaleCapturePersistence(transaction, resolution);
}

type NormalizedCommand = Readonly<{
  semanticFact: ApplyCanonicalOnlineSaleCaptureCommand["semanticFact"];
  capture: ApplyCanonicalOnlineSaleCaptureCommand["capture"];
}>;

function normalizeCommand(input: ApplyCanonicalOnlineSaleCaptureCommand): NormalizedCommand {
  try {
    exactRecord(input, commandKeys);
    const semanticFact = input.semanticFact;
    const capture = input.capture;
    if (
      typeof semanticFact !== "object" ||
      semanticFact === null ||
      typeof capture !== "object" ||
      capture === null ||
      semanticFact.semanticEvidence.semanticSourceKind !== "payment_transition" ||
      semanticFact.semanticEvidence.purpose !== "client_order" ||
      semanticFact.semanticEvidence.economicPaymentIntentId !== capture.economicPaymentIntentId ||
      semanticFact.semanticEvidence.economicPaymentSessionId === null ||
      semanticFact.semanticEvidence.providerPaymentId === null ||
      semanticFact.semanticEvidence.semanticSourceId !==
        createCapturedProviderPaymentSemanticSourceId(
          semanticFact.semanticEvidence.providerPaymentId
        ) ||
      semanticFact.semanticEvidence.amountMinor === null ||
      semanticFact.semanticEvidence.currency !== "RUB"
    ) {
      fail("semantic_capture_conflict");
    }
    return Object.freeze({ semanticFact, capture });
  } catch (error) {
    if (error instanceof OnlineSaleCaptureCanonicalWebhookPersistenceError) throw error;
    fail("invalid_command");
  }
}

function assertCanonicalClientOrderSemanticReceipt(
  receipt: WebhookSemanticCommitReceipt,
  command: NormalizedCommand
): CanonicalOnlineSaleCaptureSemanticCommitReceipt {
  if (
    receipt.kind !== "webhook_semantic_commit_receipt" ||
    receipt.semanticSourceKind !== "payment_transition" ||
    receipt.purpose !== "client_order" ||
    (receipt.businessEffect !== "applied_once" && receipt.businessEffect !== "semantic_replay") ||
    receipt.economicPaymentIntentId !== command.capture.economicPaymentIntentId ||
    receipt.economicPaymentSessionId === null ||
    receipt.providerPaymentId === null ||
    receipt.semanticSourceId !== createCapturedProviderPaymentSemanticSourceId(receipt.providerPaymentId) ||
    receipt.amountMinor === null ||
    receipt.currency !== "RUB"
  ) {
    fail("semantic_capture_conflict");
  }
  return receipt as CanonicalOnlineSaleCaptureSemanticCommitReceipt;
}

function assertCaptureEffectMatchesSemantic(
  semantic: CanonicalOnlineSaleCaptureSemanticCommitReceipt,
  capture: OnlineSaleCaptureCommitReceipt
): void {
  if (
    (semantic.businessEffect === "applied_once" && capture.effect !== "applied_once") ||
    (semantic.businessEffect === "semantic_replay" && capture.effect !== "replayed")
  ) {
    fail("capture_replay_conflict");
  }
}

function assertMutationResolver(
  value: unknown
): asserts value is OnlineSaleCapturePersistenceResolver<FinanceTransaction> {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Readonly<{ resolveOnlineSaleCapturePersistence?: unknown }>)
      .resolveOnlineSaleCapturePersistence !== "function"
  ) {
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
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_command");
  }
  return value;
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

function fail(reason: OnlineSaleCaptureCanonicalWebhookPersistenceReason): never {
  throw new OnlineSaleCaptureCanonicalWebhookPersistenceError(reason);
}
