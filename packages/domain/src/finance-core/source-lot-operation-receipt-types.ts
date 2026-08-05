import type { Money } from "../money";
import type { FinanceSourceKey } from "./finance-source-key";
import type { PayableLotBucket, PayableLotHistoryRecord } from "./source-lot-types";

export type PayableLotReceiptDecoderEnvelope = Readonly<{
  maxAuthorityRefs: number;
  maxEffects: number;
  maxLineage: number;
  maxComponentSlots: number;
  maxDecimalDigits: number;
}>;

export type PayableLotReceiptDigestMetadata = Readonly<{
  canonicalDigest: string;
  digestPurpose: "drift_detection_only";
}>;

export type PayableLotOperationAuthorityRef =
  | (PayableLotReceiptDigestMetadata &
      Readonly<{
        kind: "canonical_capture";
        evidenceId: string;
        intentId: string;
        intentVersion: string;
        providerAccountId: string;
        providerPaymentId: string;
      }>)
  | (PayableLotReceiptDigestMetadata &
      Readonly<{
        kind: "reserve_allocation";
        decisionId: string;
        decisionVersion: string;
        authorityId: string;
        authorityVersion: string;
      }>)
  | (PayableLotReceiptDigestMetadata &
      Readonly<{
        kind: "payment_capture_integrity";
        authorityId: string;
        authorityVersion: string;
        intentId: string;
        intentVersion: string;
        evidenceId: string;
      }>)
  | (PayableLotReceiptDigestMetadata &
      Readonly<{
        kind: "release_blocks";
        snapshotId: string;
        snapshotVersion: string;
      }>)
  | (PayableLotReceiptDigestMetadata &
      Readonly<{
        kind: "hold_release_evidence";
        lotId: string;
        bookingCompletionEvidenceId: string;
        bookingContractVersion: string;
        providerSettlementEvidenceId: string | null;
        blocksSnapshotId: string;
        blocksSnapshotVersion: string;
      }>)
  | (PayableLotReceiptDigestMetadata &
      Readonly<{
        kind:
          | "reserve_release"
          | "payout_request"
          | "payout_no_transfer_outcome"
          | "payout_paid"
          | "payout_return"
          | "refund_approval"
          | "refund_confirmed"
          | "refund_failed"
          | "refund_bridge_payout_failed"
          | "chargeback_confirmed"
          | "chargeback_principal_allocation"
          | "chargeback_recovery_collection"
          | "chargeback_won";
        authorityId: string;
        authorityVersion: string;
        evidenceId: string | null;
      }>);

export type PayableLotReceiptEffectBucket = PayableLotBucket | "recovery_receivable";

export type PayableLotOperationEffect = Readonly<{
  effectId: string;
  lotAllocationId: string;
  bucket: PayableLotReceiptEffectBucket;
  side: "debit" | "credit";
  amount: Money;
  knownLinks: Readonly<{
    originalSaleId: string;
    rootLotId: string;
    payableLotId: string;
    payoutAllocationId: string | null;
  }>;
  componentSlotId: string;
}>;

export type PayableLotOperationComponentSlot = Readonly<{
  slotId: string;
  effectId: string;
  field: "componentId";
  requiredAuthority: Readonly<{
    kind: "finance_component_registry";
    operationKind: PayableLotHistoryRecord["kind"];
    bucket: PayableLotReceiptEffectBucket;
    side: "debit" | "credit";
    originalSaleId: string;
    rootLotId: string;
    payableLotId: string;
    payoutAllocationId: string | null;
  }>;
}>;

export type PayableLotOperationLineageEntry =
  | Readonly<{
      relation: "consumed" | "created" | "root_created";
      lotId: string;
      rootLotId: string;
      parentLotId: string | null;
      bucket: PayableLotBucket;
      amount: Money;
      economicEffectId: string | null;
    }>
  | Readonly<{
      relation: "referenced";
      lotId: string;
      rootLotId: string;
      economicEffectId: null;
    }>;

export type PayableLotOperationReceipt = Readonly<{
  kind: "payable_lot_operation_receipt";
  schemaVersion: 1;
  receiptId: string;
  operationId: string;
  operationKind: PayableLotHistoryRecord["kind"];
  sourceKey: FinanceSourceKey;
  occurredAt: string;
  astrologerUserId: string;
  currency: "RUB";
  previousLotState: Readonly<{
    version: string;
    digest: string;
  }>;
  nextLotState: Readonly<{
    version: string;
    digest: string;
  }>;
  historyRecord: Readonly<{
    kind: PayableLotHistoryRecord["kind"];
    canonicalDigest: string;
    digestPurpose: "drift_detection_only";
  }>;
  authorityRefs: readonly PayableLotOperationAuthorityRef[];
  effects: readonly PayableLotOperationEffect[];
  lineage: readonly PayableLotOperationLineageEntry[];
  requiredExternalLinkSlots: readonly PayableLotOperationComponentSlot[];
  canonicalDigest: string;
  digestPurpose: "drift_detection_only";
  integrityStatus: "unverified";
}>;
