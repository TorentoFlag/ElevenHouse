import { digestValue } from "./source-lot-operation-receipt-core";
import type { BoundedTransitionEvidence } from "./source-lot-operation-receipt-evidence";
import type { PayableLotOperationAuthorityRef } from "./source-lot-operation-receipt-types";
import type { PayableLotOperationAuthority } from "./source-lot-types";
import { fail } from "./source-lot-validation";

export function operationAuthorityRefs(
  evidence: BoundedTransitionEvidence
): readonly PayableLotOperationAuthorityRef[] {
  const refs: PayableLotOperationAuthorityRef[] = [];
  const record = evidence.historyRecord;
  if (record.kind === "sale_capture") {
    const root = evidence.createdLots[0];
    if (!root) fail("lineage_invalid");
    refs.push(
      Object.freeze({
        kind: "canonical_capture" as const,
        evidenceId: root.captureSource.canonicalEvidenceId,
        intentId: root.captureSource.intentId,
        intentVersion: String(root.captureSource.paymentIntent.version),
        providerAccountId: root.captureSource.providerAccountId,
        providerPaymentId: root.captureSource.providerPaymentId,
        canonicalDigest: digestValue(root.captureSource),
        digestPurpose: "drift_detection_only" as const
      })
    );
  }
  if (record.reserveAllocation) {
    refs.push(
      Object.freeze({
        kind: "reserve_allocation" as const,
        decisionId: record.reserveAllocation.decisionId,
        decisionVersion: String(record.reserveAllocation.version),
        authorityId: record.reserveAllocation.authority.id,
        authorityVersion: String(record.reserveAllocation.authority.version),
        canonicalDigest: digestValue(record.reserveAllocation),
        digestPurpose: "drift_detection_only" as const
      })
    );
  }
  if (record.authority) refs.push(operationAuthorityRef(record.authority));
  if (record.holdReleaseEvidence) {
    refs.push(
      Object.freeze({
        kind: "hold_release_evidence" as const,
        lotId: record.holdReleaseEvidence.lotId,
        bookingCompletionEvidenceId: record.holdReleaseEvidence.bookingCompletion.evidenceId,
        bookingContractVersion: String(
          record.holdReleaseEvidence.bookingCompletion.contractVersion
        ),
        providerSettlementEvidenceId:
          record.holdReleaseEvidence.providerSettlement?.evidenceId ?? null,
        blocksSnapshotId: record.holdReleaseEvidence.blocks.snapshotId,
        blocksSnapshotVersion: String(record.holdReleaseEvidence.blocks.version),
        canonicalDigest: digestValue(record.holdReleaseEvidence),
        digestPurpose: "drift_detection_only" as const
      })
    );
  }
  if (record.paymentIntegrity) {
    refs.push(
      Object.freeze({
        kind: "payment_capture_integrity" as const,
        authorityId: record.paymentIntegrity.authorityId,
        authorityVersion: String(record.paymentIntegrity.version),
        intentId: record.paymentIntegrity.intentId,
        intentVersion: String(record.paymentIntegrity.intentVersion),
        evidenceId: record.paymentIntegrity.canonicalEvidenceId,
        canonicalDigest: digestValue(record.paymentIntegrity),
        digestPurpose: "drift_detection_only" as const
      })
    );
  }
  if (record.blocks) {
    refs.push(
      Object.freeze({
        kind: "release_blocks" as const,
        snapshotId: record.blocks.snapshotId,
        snapshotVersion: String(record.blocks.version),
        canonicalDigest: digestValue(record.blocks),
        digestPurpose: "drift_detection_only" as const
      })
    );
  }
  return Object.freeze(refs);
}

function operationAuthorityRef(
  authority: PayableLotOperationAuthority
): PayableLotOperationAuthorityRef {
  if (authority.kind === "chargeback_lost") fail("lineage_invalid");
  let evidenceId: string | null = null;
  switch (authority.kind) {
    case "payout_no_transfer_outcome":
    case "payout_return":
      evidenceId = authority.evidenceId;
      break;
    case "refund_bridge_payout_failed":
      evidenceId = authority.payoutOutcomeAuthority.evidenceId;
      break;
    case "refund_confirmed":
    case "refund_failed":
    case "chargeback_confirmed":
    case "chargeback_recovery_collection":
    case "chargeback_won":
      evidenceId = authority.canonicalEvidenceId;
      break;
    case "chargeback_principal_allocation":
      evidenceId = authority.accountingAllocationRevisionId;
      break;
    case "reserve_release":
    case "payout_request":
    case "payout_paid":
    case "refund_approval":
      break;
  }
  return Object.freeze({
    kind: authority.kind,
    authorityId: authority.authorityId,
    authorityVersion: String(authority.version),
    evidenceId,
    canonicalDigest: digestValue(authority),
    digestPurpose: "drift_detection_only"
  });
}
