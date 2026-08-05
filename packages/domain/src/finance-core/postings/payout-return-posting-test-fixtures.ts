import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  createPayableLotOperationReceipt,
  type PayableLotOperationReceipt
} from "../source-lot-operation-receipt";
import {
  createPayoutReturnAuthority,
  createReturnedPayoutReservedPayableLots
} from "../source-lots";
import { holdPayoutTransitionCase, receiptPostingInput } from "./hold-payout-posting-test-fixtures";
import type { UnverifiedPayoutBankExposureTransitionBinding } from "./payout-bank-exposure-types";
import { sha } from "./posting-test-primitives";

export function returnedReceipt(path: "direct_match" | "unknown_credit_reclassification"): {
  receipt: PayableLotOperationReceipt;
  sourceAuthority: ReturnType<typeof createPayoutReturnAuthority>;
} {
  const paid = holdPayoutTransitionCase("payout_paid").transition;
  const bankStatementEntryId =
    path === "direct_match"
      ? "returned-credit-statement-1"
      : "unknown-return-validation-operation-statement-entry";
  const sourceAuthority = createPayoutReturnAuthority({
    kind: "payout_return",
    authorityId: `payout-return-${path}`,
    version: 1,
    payoutRequestId: "receipt-payout",
    outcome: "returned_after_matched_debit",
    bankReference: "receipt-bank-reference",
    bankStatementEntryId,
    bankCreditEvidencePath: path,
    suspenseReclassificationId:
      path === "unknown_credit_reclassification" ? "return-reclass-1" : null,
    returnedAt: path === "direct_match" ? "2026-09-05T00:00:00Z" : "2026-08-06T09:00:00Z",
    evidenceId: `payout-return-${path}-evidence`
  });
  const transition = createReturnedPayoutReservedPayableLots({
    state: paid.state,
    expectedVersion: paid.nextVersion,
    payoutRequestId: sourceAuthority.payoutRequestId,
    authority: sourceAuthority,
    operationId: `payout-return-operation-${path}`,
    sourceKey: {
      kind: "bank",
      sourceId: bankStatementEntryId,
      operation: path === "direct_match" ? "payout_return_credit_matched" : "suspense_reclassified"
    },
    occurredAt: sourceAuthority.returnedAt,
    outputLotIds: [
      {
        sourceLotId: "receipt-payout-from-available",
        targetLotId: `returned-${path}-available`
      },
      {
        sourceLotId: "receipt-payout-from-reserve",
        targetLotId: `returned-${path}-reserve`
      }
    ]
  });
  return { receipt: createPayableLotOperationReceipt(transition), sourceAuthority };
}

export function payoutCoverageFixture(
  paid: UnverifiedPayoutBankExposureTransitionBinding,
  paidReceipt: PayableLotOperationReceipt,
  amountMinor = 9_000,
  issuedAt = "2026-09-04T02:01:00Z"
) {
  const sourceRef = paidReceipt.authorityRefs[0];
  if (!sourceRef || sourceRef.kind !== "payout_paid") throw new Error("missing paid ref");
  const core = {
    kind: "unverified_payout_outbound_clearing_coverage_binding" as const,
    schemaVersion: 1 as const,
    bindingId: "payout-clearing-coverage-return-1",
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bankExposureId: paid.bankExposureId,
    payoutRequestId: paid.payoutRequestId,
    bankCashPoolId: paid.bankCashPoolId,
    amount: { amountMinor, currency: "RUB" as const },
    claimedRemainingAmount: { amountMinor, currency: "RUB" as const },
    claimedConsumptionStatus: "unconsumed" as const,
    paidExposureBindingRef: {
      bindingId: paid.bindingId,
      exposureVersion: paid.exposureVersion,
      status: paid.status,
      bindingDigest: paid.bindingDigest
    },
    paidOperationReceiptId: paidReceipt.receiptId,
    paidOperationReceiptDigest: paidReceipt.canonicalDigest,
    paidAuthorityRef: {
      kind: sourceRef.kind,
      authorityId: sourceRef.authorityId,
      version: Number(sourceRef.authorityVersion),
      canonicalDigest: sourceRef.canonicalDigest
    },
    bankReference: "receipt-bank-reference",
    clearingJournalTransactionId: "journal-receipt-payout-paid",
    clearingJournalTransactionDigest: sha("c"),
    issuedAt
  };
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

export function returnedPostingBase(receipt: PayableLotOperationReceipt) {
  const input = receiptPostingInput(receipt);
  return { ...input, receiptBinding: input.receiptBinding };
}
