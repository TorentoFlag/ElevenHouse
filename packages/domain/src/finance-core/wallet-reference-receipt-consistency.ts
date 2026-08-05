import { serializeFinanceSourceKey } from "./finance-source-key";
import {
  createEmptyPayableLotState,
  type PayableLotHistoryRecord,
  type PayableLotReferenceState
} from "./source-lots";
import { digestValue, sameCanonicalValue } from "./source-lot-operation-receipt-core";
import {
  createPayableLotOperationReceipt,
  type PayableLotOperationReceipt
} from "./source-lot-operation-receipt";
import type { WalletProjectionDiscrepancy } from "./wallet-reference-types";

export function addSourceLotReceiptDiscrepancies(
  state: PayableLotReferenceState,
  receipts: readonly PayableLotOperationReceipt[],
  discrepancies: WalletProjectionDiscrepancy[]
): void {
  const receiptsByOperationId = new Map<string, PayableLotOperationReceipt>();
  for (const receipt of receipts) {
    if (receiptsByOperationId.has(receipt.operationId)) {
      pushSourceLotReceiptMismatch(discrepancies, "duplicate_receipt", receipt.operationId);
      continue;
    }
    receiptsByOperationId.set(receipt.operationId, receipt);
  }

  const historyOperationIds = new Set(state.history.map((record) => record.operationId));
  state.history.forEach((record, index) => {
    const receipt = receiptsByOperationId.get(record.operationId);
    if (!receipt) {
      pushSourceLotReceiptMismatch(discrepancies, "missing_receipt", record.operationId);
      return;
    }
    if (receipts[index]?.operationId !== record.operationId) {
      pushSourceLotReceiptMismatch(discrepancies, "order_mismatch", record.operationId);
    }
    if (receipt.operationKind !== record.kind) {
      pushSourceLotReceiptMismatch(discrepancies, "operation_kind_mismatch", record.operationId);
    }
    if (
      serializeFinanceSourceKey(receipt.sourceKey) !== serializeFinanceSourceKey(record.sourceKey)
    ) {
      pushSourceLotReceiptMismatch(discrepancies, "source_key_mismatch", record.operationId);
    }
    if (receipt.occurredAt !== record.occurredAt) {
      pushSourceLotReceiptMismatch(discrepancies, "occurred_at_mismatch", record.operationId);
    }
    if (receipt.historyRecord.canonicalDigest !== digestValue(record)) {
      pushSourceLotReceiptMismatch(discrepancies, "history_digest_mismatch", record.operationId);
    }
    if (!receiptSemanticsMatchReferenceState(state, record, receipt)) {
      pushSourceLotReceiptMismatch(discrepancies, "receipt_semantics_mismatch", record.operationId);
    }
    if (
      receipt.previousLotState.version !== String(record.previousVersion) ||
      receipt.nextLotState.version !== String(record.nextVersion)
    ) {
      pushSourceLotReceiptMismatch(discrepancies, "version_chain_mismatch", record.operationId);
    }
    if (
      receipt.astrologerUserId !== state.astrologerUserId ||
      receipt.currency !== state.currency
    ) {
      pushSourceLotReceiptMismatch(discrepancies, "owner_currency_mismatch", record.operationId);
    }
  });

  for (const receipt of receipts) {
    if (!historyOperationIds.has(receipt.operationId)) {
      pushSourceLotReceiptMismatch(discrepancies, "extra_receipt", receipt.operationId);
    }
  }

  const initialDigest = createEmptyPayableLotState({
    astrologerUserId: state.astrologerUserId,
    currency: state.currency
  }).stateDigest;
  const monetaryByNextVersion = new Map(
    state.history.map((record) => [record.nextVersion, record] as const)
  );
  const restrictionByNextVersion = new Map(
    state.restrictionHistory.map((record) => [record.nextVersion, record] as const)
  );
  for (const record of state.history) {
    const receipt = receiptsByOperationId.get(record.operationId);
    if (!receipt) continue;
    if (record.previousVersion === 1) {
      if (receipt.previousLotState.digest !== initialDigest) {
        pushSourceLotReceiptMismatch(discrepancies, "state_digest_mismatch", record.operationId);
      }
    } else {
      const priorMonetary = monetaryByNextVersion.get(record.previousVersion);
      const priorRestriction = restrictionByNextVersion.get(record.previousVersion);
      if (priorMonetary) {
        const priorReceipt = receiptsByOperationId.get(priorMonetary.operationId);
        if (priorReceipt && receipt.previousLotState.digest !== priorReceipt.nextLotState.digest) {
          pushSourceLotReceiptMismatch(discrepancies, "state_digest_mismatch", record.operationId);
        }
      } else if (!priorRestriction) {
        pushSourceLotReceiptMismatch(discrepancies, "version_chain_mismatch", record.operationId);
      }
    }
    if (record.nextVersion === state.version && receipt.nextLotState.digest !== state.stateDigest) {
      pushSourceLotReceiptMismatch(discrepancies, "state_digest_mismatch", record.operationId);
    }
  }
}

function receiptSemanticsMatchReferenceState(
  state: PayableLotReferenceState,
  record: PayableLotHistoryRecord,
  receipt: PayableLotOperationReceipt
): boolean {
  try {
    const lotsById = new Map(state.lots.map((lot) => [lot.lotId, lot] as const));
    const consumedLots = record.consumedLotIds.map((lotId) => lotsById.get(lotId));
    const createdLots = record.createdLotIds.map((lotId) => {
      const lot = lotsById.get(lotId);
      if (!lot || lot.createdByOperationId !== record.operationId) return undefined;
      return Object.freeze({
        ...lot,
        status: "active" as const,
        consumedByOperationId: null,
        consumedAt: null
      });
    });
    if (
      consumedLots.some((lot): lot is undefined => lot === undefined) ||
      createdLots.some((lot): lot is undefined => lot === undefined)
    ) {
      return false;
    }
    const expected = createPayableLotOperationReceipt({
      kind: record.kind,
      operationId: record.operationId,
      sourceKey: record.sourceKey,
      previousVersion: record.previousVersion,
      nextVersion: record.nextVersion,
      previousStateDigest: receipt.previousLotState.digest,
      nextStateDigest: receipt.nextLotState.digest,
      consumedLots,
      createdLots,
      historyRecord: record,
      state: {
        version: record.nextVersion,
        astrologerUserId: state.astrologerUserId,
        currency: state.currency,
        lots: [],
        history: [record],
        chargebackRestrictions: [],
        restrictionHistory: [],
        stateDigest: receipt.nextLotState.digest
      }
    });
    return sameCanonicalValue(expected, receipt);
  } catch {
    return false;
  }
}

function pushSourceLotReceiptMismatch(
  discrepancies: WalletProjectionDiscrepancy[],
  reason: Extract<
    WalletProjectionDiscrepancy,
    { readonly kind: "source_lot_receipt_mismatch" }
  >["reason"],
  operationId: string | null
): void {
  const mismatch = Object.freeze({
    kind: "source_lot_receipt_mismatch" as const,
    reason,
    operationId
  });
  if (
    !discrepancies.some(
      (candidate) =>
        candidate.kind === mismatch.kind &&
        candidate.reason === mismatch.reason &&
        candidate.operationId === mismatch.operationId
    )
  ) {
    discrepancies.push(mismatch);
  }
}
