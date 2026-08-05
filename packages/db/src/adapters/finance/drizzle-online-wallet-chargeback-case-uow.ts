import { randomUUID } from "node:crypto";

import {
  createOnlineWalletChargebackConfirmedJournal,
  digestFinanceCanonicalValueV1,
  type ApplyVerifiedOnlineWalletChargebackNoticeCommand,
  type OnlineWalletChargebackCaseCommitReceipt,
  type OnlineWalletChargebackCaseUnitOfWork,
  type WebhookSemanticCommitReceipt
} from "@elevenhouse/domain/finance-core";
import { eq, sql } from "drizzle-orm";

import { financeOnlineWalletChargebackCases } from "../../schema/finance/online-wallet-chargeback-cases.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import { writeOnlineWalletProviderAstrologerJournal } from "./drizzle-online-wallet-journal-writer";
import { releaseOnlineWalletPayoutInTransaction } from "./drizzle-online-wallet-payout-release-uow";
import { issuePersistenceTransactionBoundaryRef } from "./drizzle-sealed-wallet-journal-commit-uow";
import {
  applyVerifiedWebhookSemanticFactInTransaction,
  WebhookInboxProcessingPersistenceError
} from "./drizzle-webhook-inbox-processing-uow";

export type OnlineWalletChargebackCasePersistenceReason =
  | "invalid_command"
  | "semantic_chargeback_conflict"
  | "capture_not_found"
  | "capture_identity_conflict"
  | "chargeback_replay_conflict"
  | "persistence_write_incomplete"
  | "retryable_concurrency_conflict";

export class OnlineWalletChargebackCasePersistenceError extends Error {
  readonly code = "online_wallet_chargeback_case_persistence_error";

  constructor(readonly reason: OnlineWalletChargebackCasePersistenceReason) {
    super("Verified online-wallet chargeback notice could not be applied atomically");
    this.name = "OnlineWalletChargebackCasePersistenceError";
  }
}

type NormalizedCommand = Readonly<{
  semanticFact: ApplyVerifiedOnlineWalletChargebackNoticeCommand["semanticFact"];
  chargeback: Readonly<{
    providerPaymentId: string;
    providerSourceKind: "provider_chargeback_id" | "webhook_event_id";
    providerSourceId: string;
    disputedPrincipalMinor: number;
    occurredAt: string;
  }>;
}>;

type ChargebackContextRow = Readonly<{
  captureApplicationId: unknown;
  rootLotId: unknown;
  walletId: unknown;
  orderId: unknown;
  astrologerUserId: unknown;
  versionId: unknown;
  seriesId: unknown;
  providerAccountId: unknown;
  identityVersion: unknown;
}>;

type ChargebackContext = Readonly<{
  captureApplicationId: string;
  rootLotId: string;
  walletId: string;
  orderId: string;
  astrologerUserId: string;
  providerAccount: Readonly<{
    versionId: string;
    seriesId: string;
    providerAccountId: string;
    identityVersion: number;
  }>;
}>;

/**
 * Commits one signature-verified ArcPay chargeback notice with its V2 provisional-loss journal.
 * It intentionally makes no debtor/recovery allocation and does not rewrite an existing payout:
 * those actions have their own policy-controlled operations.
 */
export function createDrizzleOnlineWalletChargebackCaseUnitOfWork(input: Readonly<{
  database: { transaction<T>(callback: (transaction: FinanceTransaction) => Promise<T>): Promise<T> };
  workerId: string;
}>): OnlineWalletChargebackCaseUnitOfWork {
  const workerId = identifier(input.workerId);
  return Object.freeze({
    async applyVerifiedOnlineWalletChargebackNotice(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          persistChargeback(transaction, workerId, normalized)
        );
      } catch (error) {
        if (
          error instanceof OnlineWalletChargebackCasePersistenceError ||
          error instanceof WebhookInboxProcessingPersistenceError
        ) {
          throw error;
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("chargeback_replay_conflict");
        if (code === "23503" || code === "23514" || code === "55000") {
          fail("persistence_write_incomplete");
        }
        throw error;
      }
    }
  } satisfies OnlineWalletChargebackCaseUnitOfWork);
}

function normalizeCommand(
  command: ApplyVerifiedOnlineWalletChargebackNoticeCommand
): NormalizedCommand {
  const providerPaymentId = identifier(command.chargeback.providerPaymentId);
  const source = command.chargeback.providerSource;
  const providerSourceKind = source.kind;
  const providerSourceId = identifier(
    source.kind === "provider_chargeback_id" ? source.providerChargebackId : source.webhookEventId
  );
  const disputedPrincipalMinor = positiveMinor(command.chargeback.disputedPrincipalMinor);
  const occurredAt = instant(command.chargeback.occurredAt).toISOString();
  const evidence = command.semanticFact.semanticEvidence;
  if (
    evidence.semanticSourceKind !== "chargeback" ||
    evidence.semanticSourceId !== providerSourceId ||
    evidence.purpose !== "client_order" ||
    evidence.economicPaymentSessionId !== null ||
    evidence.providerPaymentId !== null ||
    evidence.amountMinor !== null ||
    evidence.currency !== null
  ) {
    fail("invalid_command");
  }
  return Object.freeze({
    semanticFact: command.semanticFact,
    chargeback: Object.freeze({
      providerPaymentId,
      providerSourceKind,
      providerSourceId,
      disputedPrincipalMinor,
      occurredAt
    })
  });
}

async function persistChargeback(
  transaction: FinanceTransaction,
  workerId: string,
  command: NormalizedCommand
): Promise<OnlineWalletChargebackCaseCommitReceipt> {
  const semanticReceipt = await applyVerifiedWebhookSemanticFactInTransaction(
    transaction,
    workerId,
    command.semanticFact
  );
  assertSemanticReceipt(semanticReceipt, command);
  const existing = await readExistingCase(transaction, semanticReceipt.receiptId);
  if (existing) return mapReplay(existing, command);

  const context = await lockCaptureContext(transaction, semanticReceipt, command);
  const chargebackCaseId = `online-chargeback:${randomUUID()}`;
  const affectedPayouts = await lockAffectedPreBankPayouts(transaction, context);
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${context.walletId}, 0))`
  );
  for (const payout of affectedPayouts) {
    await releaseOnlineWalletPayoutInTransaction(transaction, {
      payoutRequestId: payout.payoutRequestId,
      expectedPayoutVersion: payout.payoutVersion,
      nextStatus: "cancelled",
      failureReason: null,
      adminNote: `ArcPay chargeback ${chargebackCaseId} cancelled this payout before bank initiation`,
      actorKind: "system",
      actorUserId: null,
      authority: {
        authorityId: `chargeback-payout-cancellation:${chargebackCaseId}:${payout.payoutRequestId}`,
        authorityVersion: "1",
        authorityDigest: digestFinanceCanonicalValueV1({
          kind: "chargeback_payout_cancellation",
          version: 1,
          chargebackCaseId,
          payoutRequestId: payout.payoutRequestId,
          payoutVersion: payout.payoutVersion,
          rootLotId: context.rootLotId
        })
      },
      occurredAt: command.chargeback.occurredAt
    });
  }
  const boundary = await issuePersistenceTransactionBoundaryRef(transaction);
  const journal = createOnlineWalletChargebackConfirmedJournal({
    chargebackCaseId,
    orderId: context.orderId,
    providerAccountId: context.providerAccount.providerAccountId,
    occurredAt: command.chargeback.occurredAt,
    postedAt: command.chargeback.occurredAt,
    grossPrincipalMinor: command.chargeback.disputedPrincipalMinor
  });
  const journalReceipt = await writeOnlineWalletProviderAstrologerJournal(transaction, {
    journal,
    astrologerUserId: context.astrologerUserId,
    providerAccount: context.providerAccount
  });
  const canonical = {
    kind: "online_wallet_chargeback_case",
    version: 2,
    chargebackCaseId,
    semanticCommitReceiptId: semanticReceipt.receiptId,
    semanticFactId: semanticReceipt.semanticFactId,
    providerAccount: context.providerAccount,
    providerSourceKind: command.chargeback.providerSourceKind,
    providerSourceId: command.chargeback.providerSourceId,
    providerPaymentId: command.chargeback.providerPaymentId,
    captureApplicationId: context.captureApplicationId,
    rootLotId: context.rootLotId,
    walletId: context.walletId,
    orderId: context.orderId,
    astrologerUserId: context.astrologerUserId,
    status: "provisional_loss",
    disputedPrincipalMinor: String(command.chargeback.disputedPrincipalMinor),
    journalTransactionId: journalReceipt.journalTransactionId,
    occurredAt: command.chargeback.occurredAt,
    persistenceTransactionBoundaryRef: boundary
  } as const;
  const [created] = await transaction
    .insert(financeOnlineWalletChargebackCases)
    .values({
      chargebackCaseId,
      semanticCommitReceiptId: semanticReceipt.receiptId,
      semanticFactId: semanticReceipt.semanticFactId,
      providerAccountSeriesId: context.providerAccount.seriesId,
      providerAccountId: context.providerAccount.providerAccountId,
      providerIdentityVersion: context.providerAccount.identityVersion,
      providerSourceKind: command.chargeback.providerSourceKind,
      providerSourceId: command.chargeback.providerSourceId,
      providerPaymentId: command.chargeback.providerPaymentId,
      captureApplicationId: context.captureApplicationId,
      rootLotId: context.rootLotId,
      walletId: context.walletId,
      orderId: context.orderId,
      astrologerUserId: context.astrologerUserId,
      caseVersion: 1,
      status: "provisional_loss",
      disputedPrincipalMinor: String(command.chargeback.disputedPrincipalMinor),
      journalTransactionId: journalReceipt.journalTransactionId,
      canonicalPreimage: JSON.stringify(canonical),
      canonicalDigest: digestFinanceCanonicalValueV1(canonical),
      persistenceTransactionBoundaryRef: boundary,
      occurredAt: instant(command.chargeback.occurredAt),
      committedAt: instant(command.chargeback.occurredAt)
    })
    .returning({ id: financeOnlineWalletChargebackCases.id });
  if (!created) fail("persistence_write_incomplete");
  return Object.freeze({
    kind: "online_wallet_chargeback_case_commit_receipt",
    effect: "applied_once",
    chargebackCaseId,
    walletId: context.walletId,
    rootLotId: context.rootLotId,
    journalTransactionId: journalReceipt.journalTransactionId
  });
}

type AffectedPayout = Readonly<{ payoutRequestId: string; payoutVersion: string }>;

async function lockAffectedPreBankPayouts(
  transaction: FinanceTransaction,
  context: ChargebackContext
): Promise<readonly AffectedPayout[]> {
  const rows = await transaction.execute<AffectedPayout>(sql`
    select payout.id as "payoutRequestId", payout.version as "payoutVersion"
      from finance_online_payout_requests payout
     where payout.wallet_id = ${context.walletId}
       and payout.status in ('requested', 'under_review', 'approved')
       and exists (
         select 1
           from finance_online_payout_request_allocations mapping
          where mapping.payout_request_id = payout.id
            and mapping.root_lot_id = ${context.rootLotId}
       )
     order by payout.id
     for update of payout
  `);
  return Object.freeze(rows.rows.map((row) => Object.freeze({
    payoutRequestId: identifier(row.payoutRequestId),
    payoutVersion: identifier(row.payoutVersion)
  })));
}

function assertSemanticReceipt(receipt: WebhookSemanticCommitReceipt, command: NormalizedCommand): void {
  if (
    (receipt.businessEffect !== "applied_once" && receipt.businessEffect !== "semantic_replay") ||
    receipt.semanticSourceKind !== "chargeback" ||
    receipt.semanticSourceId !== command.chargeback.providerSourceId ||
    receipt.purpose !== "client_order" ||
    receipt.economicPaymentSessionId !== null ||
    receipt.providerPaymentId !== null ||
    receipt.amountMinor !== null ||
    receipt.currency !== null
  ) {
    fail("semantic_chargeback_conflict");
  }
}

async function readExistingCase(transaction: FinanceTransaction, semanticCommitReceiptId: string) {
  const [row] = await transaction
    .select()
    .from(financeOnlineWalletChargebackCases)
    .where(eq(financeOnlineWalletChargebackCases.semanticCommitReceiptId, semanticCommitReceiptId))
    .limit(2)
    .for("share");
  return row ?? null;
}

function mapReplay(
  row: typeof financeOnlineWalletChargebackCases.$inferSelect,
  command: NormalizedCommand
): OnlineWalletChargebackCaseCommitReceipt {
  if (
    row.providerSourceKind !== command.chargeback.providerSourceKind ||
    row.providerSourceId !== command.chargeback.providerSourceId ||
    row.providerPaymentId !== command.chargeback.providerPaymentId ||
    row.disputedPrincipalMinor !== String(command.chargeback.disputedPrincipalMinor)
  ) {
    fail("chargeback_replay_conflict");
  }
  return Object.freeze({
    kind: "online_wallet_chargeback_case_commit_receipt",
    effect: "semantic_replay",
    chargebackCaseId: row.chargebackCaseId,
    walletId: row.walletId,
    rootLotId: row.rootLotId,
    journalTransactionId: row.journalTransactionId
  });
}

async function lockCaptureContext(
  transaction: FinanceTransaction,
  semanticReceipt: WebhookSemanticCommitReceipt,
  command: NormalizedCommand
): Promise<ChargebackContext> {
  const rows = await transaction.execute<ChargebackContextRow>(sql`
    select application.id as "captureApplicationId",
           receipt.root_lot_id as "rootLotId",
           application.online_wallet_id as "walletId",
           receipt.order_id as "orderId",
           receipt.astrologer_user_id as "astrologerUserId",
           provider.id as "versionId",
           provider.series_id as "seriesId",
           provider.provider_account_id as "providerAccountId",
           provider.identity_version as "identityVersion"
      from finance_online_sale_capture_applications application
      join finance_online_sale_capture_receipts receipt
        on receipt.receipt_id = application.online_sale_receipt_id
      join finance_provider_accounts provider
        on provider.series_id = application.provider_account_series_id
       and provider.provider_account_id = application.provider_account_id
       and provider.identity_version = application.provider_identity_version
     where application.economic_payment_intent_id = ${semanticReceipt.economicPaymentIntentId}
       and application.provider_account_series_id = ${semanticReceipt.providerAccount.seriesId}
       and application.provider_account_id = ${semanticReceipt.providerAccount.providerAccountId}
       and application.provider_identity_version = ${semanticReceipt.providerAccount.identityVersion}
       and application.provider_payment_id = ${command.chargeback.providerPaymentId}
     for update of application, receipt, provider
  `);
  if (rows.rows.length !== 1 || !rows.rows[0]) fail("capture_not_found");
  const row = rows.rows[0];
  return Object.freeze({
    captureApplicationId: identifier(row.captureApplicationId),
    rootLotId: identifier(row.rootLotId),
    walletId: uuid(row.walletId),
    orderId: identifier(row.orderId),
    astrologerUserId: uuid(row.astrologerUserId),
    providerAccount: Object.freeze({
      versionId: identifier(row.versionId),
      seriesId: identifier(row.seriesId),
      providerAccountId: identifier(row.providerAccountId),
      identityVersion: positiveInteger(row.identityVersion)
    })
  });
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || value.trim() !== value) {
    fail("invalid_command");
  }
  return value;
}

function uuid(value: unknown): string {
  const parsed = identifier(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed)) {
    fail("capture_identity_conflict");
  }
  return parsed;
}

function positiveMinor(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail("invalid_command");
  return parsed;
}

function positiveInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail("capture_identity_conflict");
  return parsed;
}

function instant(value: unknown): Date {
  const result = new Date(typeof value === "string" ? value : "");
  if (!Number.isFinite(result.getTime())) fail("invalid_command");
  return result;
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: OnlineWalletChargebackCasePersistenceReason): never {
  throw new OnlineWalletChargebackCasePersistenceError(reason);
}
