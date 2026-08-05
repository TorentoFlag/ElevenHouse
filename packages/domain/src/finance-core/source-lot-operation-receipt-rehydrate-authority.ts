import { sha256Digest } from "./source-lot-integrity";
import { positiveReceiptVersion } from "./source-lot-operation-receipt-rehydrate-values";
import type { PayableLotOperationAuthorityRef } from "./source-lot-operation-receipt-types";
import type { PayableLotHistoryRecord } from "./source-lot-types";
import {
  dataRecord,
  exactDataRecord,
  fail,
  identifier,
  nullableIdentifier
} from "./source-lot-validation";

export function authorityReference(
  input: unknown,
  maxDecimalDigits: number
): PayableLotOperationAuthorityRef {
  const projected = dataRecord(input);
  let ref: PayableLotOperationAuthorityRef;
  switch (projected.kind) {
    case "canonical_capture": {
      const fields = exactDataRecord(input, [
        "kind",
        "evidenceId",
        "intentId",
        "intentVersion",
        "providerAccountId",
        "providerPaymentId",
        "canonicalDigest",
        "digestPurpose"
      ]);
      ref = Object.freeze({
        kind: "canonical_capture",
        evidenceId: identifier(fields.evidenceId),
        intentId: identifier(fields.intentId),
        intentVersion: positiveReceiptVersion(fields.intentVersion, maxDecimalDigits),
        providerAccountId: identifier(fields.providerAccountId),
        providerPaymentId: identifier(fields.providerPaymentId),
        ...digestMetadata(fields)
      });
      break;
    }
    case "reserve_allocation": {
      const fields = exactDataRecord(input, [
        "kind",
        "decisionId",
        "decisionVersion",
        "authorityId",
        "authorityVersion",
        "canonicalDigest",
        "digestPurpose"
      ]);
      ref = Object.freeze({
        kind: "reserve_allocation",
        decisionId: identifier(fields.decisionId),
        decisionVersion: positiveReceiptVersion(fields.decisionVersion, maxDecimalDigits),
        authorityId: identifier(fields.authorityId),
        authorityVersion: positiveReceiptVersion(fields.authorityVersion, maxDecimalDigits),
        ...digestMetadata(fields)
      });
      break;
    }
    case "payment_capture_integrity": {
      const fields = exactDataRecord(input, [
        "kind",
        "authorityId",
        "authorityVersion",
        "intentId",
        "intentVersion",
        "evidenceId",
        "canonicalDigest",
        "digestPurpose"
      ]);
      ref = Object.freeze({
        kind: "payment_capture_integrity",
        authorityId: identifier(fields.authorityId),
        authorityVersion: positiveReceiptVersion(fields.authorityVersion, maxDecimalDigits),
        intentId: identifier(fields.intentId),
        intentVersion: positiveReceiptVersion(fields.intentVersion, maxDecimalDigits),
        evidenceId: identifier(fields.evidenceId),
        ...digestMetadata(fields)
      });
      break;
    }
    case "release_blocks": {
      const fields = exactDataRecord(input, [
        "kind",
        "snapshotId",
        "snapshotVersion",
        "canonicalDigest",
        "digestPurpose"
      ]);
      ref = Object.freeze({
        kind: "release_blocks",
        snapshotId: identifier(fields.snapshotId),
        snapshotVersion: positiveReceiptVersion(fields.snapshotVersion, maxDecimalDigits),
        ...digestMetadata(fields)
      });
      break;
    }
    case "hold_release_evidence": {
      const fields = exactDataRecord(input, [
        "kind",
        "lotId",
        "bookingCompletionEvidenceId",
        "bookingContractVersion",
        "providerSettlementEvidenceId",
        "blocksSnapshotId",
        "blocksSnapshotVersion",
        "canonicalDigest",
        "digestPurpose"
      ]);
      ref = Object.freeze({
        kind: "hold_release_evidence",
        lotId: identifier(fields.lotId),
        bookingCompletionEvidenceId: identifier(fields.bookingCompletionEvidenceId),
        bookingContractVersion: positiveReceiptVersion(
          fields.bookingContractVersion,
          maxDecimalDigits
        ),
        providerSettlementEvidenceId: nullableIdentifier(fields.providerSettlementEvidenceId),
        blocksSnapshotId: identifier(fields.blocksSnapshotId),
        blocksSnapshotVersion: positiveReceiptVersion(
          fields.blocksSnapshotVersion,
          maxDecimalDigits
        ),
        ...digestMetadata(fields)
      });
      break;
    }
    default: {
      const fields = exactDataRecord(input, [
        "kind",
        "authorityId",
        "authorityVersion",
        "evidenceId",
        "canonicalDigest",
        "digestPurpose"
      ]);
      if (!operationAuthorityRefKind(fields.kind)) fail("invalid_field");
      ref = Object.freeze({
        kind: fields.kind,
        authorityId: identifier(fields.authorityId),
        authorityVersion: positiveReceiptVersion(fields.authorityVersion, maxDecimalDigits),
        evidenceId: nullableIdentifier(fields.evidenceId),
        ...digestMetadata(fields)
      });
    }
  }
  return ref;
}

function digestMetadata(fields: {
  readonly canonicalDigest: unknown;
  readonly digestPurpose: unknown;
}) {
  if (fields.digestPurpose !== "drift_detection_only") fail("invalid_field");
  return {
    canonicalDigest: sha256Digest(fields.canonicalDigest),
    digestPurpose: "drift_detection_only" as const
  };
}

export function assertAuthorityRefOrder(
  operationKind: PayableLotHistoryRecord["kind"],
  refs: readonly PayableLotOperationAuthorityRef[]
): void {
  const expected =
    operationKind === "sale_capture"
      ? ["canonical_capture"]
      : operationKind === "hold_release"
        ? [
            "reserve_allocation",
            "hold_release_evidence",
            "payment_capture_integrity",
            "release_blocks"
          ]
        : operationKind === "reserve_release"
          ? ["reserve_release", "payment_capture_integrity", "release_blocks"]
          : [authorityKindForOperation(operationKind)];
  if (
    expected.some((kind) => kind === null) ||
    refs.length !== expected.length ||
    refs.some((ref, index) => ref.kind !== expected[index])
  ) {
    fail("invalid_field");
  }
}

function authorityKindForOperation(
  operationKind: PayableLotHistoryRecord["kind"]
): PayableLotOperationAuthorityRef["kind"] | null {
  switch (operationKind) {
    case "payout_requested":
      return "payout_request";
    case "payout_released":
      return "payout_no_transfer_outcome";
    case "payout_paid":
      return "payout_paid";
    case "payout_returned_reserved":
      return "payout_return";
    case "refund_approved":
      return "refund_approval";
    case "refund_confirmed":
      return "refund_confirmed";
    case "refund_failed":
      return "refund_failed";
    case "refund_bridge_payout_failed":
      return "refund_bridge_payout_failed";
    case "chargeback_confirmed":
      return "chargeback_confirmed";
    case "chargeback_principal_allocated":
      return "chargeback_principal_allocation";
    case "chargeback_recovery_collected":
      return "chargeback_recovery_collection";
    case "chargeback_won_reserved":
      return "chargeback_won";
    case "sale_capture":
    case "hold_release":
    case "reserve_release":
      return null;
  }
}

function operationAuthorityRefKind(
  value: unknown
): value is
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
  | "chargeback_won" {
  return (
    value === "reserve_release" ||
    value === "payout_request" ||
    value === "payout_no_transfer_outcome" ||
    value === "payout_paid" ||
    value === "payout_return" ||
    value === "refund_approval" ||
    value === "refund_confirmed" ||
    value === "refund_failed" ||
    value === "refund_bridge_payout_failed" ||
    value === "chargeback_confirmed" ||
    value === "chargeback_principal_allocation" ||
    value === "chargeback_recovery_collection" ||
    value === "chargeback_won"
  );
}
