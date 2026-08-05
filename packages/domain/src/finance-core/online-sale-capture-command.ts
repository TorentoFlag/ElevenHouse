import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import { type OnlineSaleCaptureReceipt } from "./online-sale-capture-receipt";
import { exactDataRecord, fail } from "./source-lot-validation";

const commandKeys = ["kind", "receipt", "astrologerUserId", "journal"] as const;

/**
 * Explicit admission object for the separate v2 writer. It is not assignable to the v1 sealed
 * wallet command, preventing accidental transport through v1 receipt/proof tables.
 */
export type OnlineSaleCapturePersistenceCommand = Readonly<{
  kind: "online_sale_capture_persistence_command";
  receipt: OnlineSaleCaptureReceipt;
  astrologerUserId: string;
  journal: FinanceJournalTransaction;
}>;

export function createOnlineSaleCapturePersistenceCommand(
  input: unknown
): OnlineSaleCapturePersistenceCommand {
  const fields = exactDataRecord(input, commandKeys);
  if (fields.kind !== "online_sale_capture_persistence_command") fail("invalid_field");
  const receipt = receiptV2(fields.receipt);
  const astrologerUserId = requiredUuid(fields.astrologerUserId);
  if (
    astrologerUserId !== receipt.rootLot.astrologerUserId ||
    astrologerUserId !== receipt.orderEconomics.astrologerUserId
  ) {
    fail("lineage_invalid");
  }
  const journal = journalForReceipt(fields.journal, receipt);
  return Object.freeze({
    kind: "online_sale_capture_persistence_command",
    receipt,
    astrologerUserId,
    journal
  });
}

function receiptV2(value: unknown): OnlineSaleCaptureReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_field");
  const receipt = value as OnlineSaleCaptureReceipt;
  if (
    receipt.kind !== "online_sale_capture_receipt" ||
    receipt.schemaVersion !== 2 ||
    !uuid(receipt.walletId) ||
    !revision(receipt.expectedWalletRevision) ||
    receipt.nextWalletRevision !== (BigInt(receipt.expectedWalletRevision) + 1n).toString() ||
    receipt.receiptId !== receipt.operationId ||
    receipt.sourceKey.kind !== "order" ||
    receipt.sourceKey.operation !== "sale_captured" ||
    receipt.sourceKey.sourceId !== receipt.rootLot.sourceId ||
    receipt.rootLot.lotId !== receipt.rootLot.rootLotId ||
    receipt.rootLot.parentLotId !== null ||
    receipt.rootLot.bucket !== "pending" ||
    receipt.rootLot.status !== "active" ||
    receipt.captureAuthority.canonicalEvidenceId !== receipt.operationId ||
    receipt.captureAuthority.intentId !== receipt.rootLot.captureSource.intentId ||
    receipt.captureAuthority.providerAccountId !==
      receipt.rootLot.captureSource.providerAccountId ||
    receipt.captureAuthority.providerPaymentId !==
      receipt.rootLot.captureSource.providerPaymentId ||
    receipt.canonicalDigest !==
      digestFinanceCanonicalValueV1({
        kind: receipt.kind,
        schemaVersion: receipt.schemaVersion,
        receiptId: receipt.receiptId,
        operationId: receipt.operationId,
        walletId: receipt.walletId,
        expectedWalletRevision: receipt.expectedWalletRevision,
        nextWalletRevision: receipt.nextWalletRevision,
        previousCommitmentDigest: receipt.previousCommitmentDigest,
        sourceKey: receipt.sourceKey,
        occurredAt: receipt.occurredAt,
        rootLot: receipt.rootLot,
        captureAuthority: receipt.captureAuthority,
        orderEconomics: receipt.orderEconomics,
        riskPolicy: receipt.riskPolicy,
        fulfillment: receipt.fulfillment
      })
  )
    fail("invalid_field");
  if (
    (receipt.expectedWalletRevision === "0" && receipt.previousCommitmentDigest !== null) ||
    (receipt.expectedWalletRevision !== "0" && !digest(receipt.previousCommitmentDigest))
  )
    fail("invalid_field");
  return receipt;
}

function journalForReceipt(
  value: unknown,
  receipt: OnlineSaleCaptureReceipt
): FinanceJournalTransaction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_field");
  const candidate = value as FinanceJournalTransaction;
  const journal = createFinanceJournalTransaction({
    id: candidate.id,
    sourceKey: candidate.sourceKey,
    occurredAt: candidate.occurredAt,
    postedAt: candidate.postedAt,
    reversesTransactionId: candidate.reversesTransactionId,
    entries: candidate.entries
  });
  if (
    journal.sourceKey.kind !== receipt.sourceKey.kind ||
    journal.sourceKey.sourceId !== receipt.sourceKey.sourceId ||
    journal.sourceKey.operation !== receipt.sourceKey.operation ||
    journal.occurredAt !== receipt.occurredAt ||
    !journal.entries.some((entry) => entry.links.payableLotId === receipt.rootLot.lotId)
  )
    fail("lineage_invalid");
  return journal;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null;
}

function requiredUuid(value: unknown): string {
  const candidate = uuid(value);
  if (candidate === null) fail("invalid_field");
  return candidate;
}

function revision(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}
