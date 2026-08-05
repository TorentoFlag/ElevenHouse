import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { postingContext, sha } from "./posting-test-primitives";

export function suspenseReclassificationContext(operationId: string, originalOperationId: string) {
  return postingContext(
    `journal-${operationId}`,
    `proof-${operationId}`,
    operationId,
    {
      kind: "bank",
      sourceId: `${originalOperationId}-statement-entry`,
      operation: "suspense_reclassified"
    },
    "2026-08-06T09:00:00Z",
    "2026-08-06T09:01:00Z"
  );
}

export function suspenseReclassificationAuthority(input: {
  direction: "debit" | "credit";
  authorityId: string;
  operationId: string;
  amountMinor: number;
  originalAuthorityId: string;
  originalOperationId: string;
  target:
    | ReturnType<typeof payoutDebitTarget>
    | ReturnType<typeof merchantPayoutCreditTarget>
    | {
        kind: "returned_payout_credit";
        payoutRequestId: string;
        proposedAllocations: readonly {
          astrologerUserId: string;
          amount: { amountMinor: number; currency: "RUB" };
          originalSaleId: string;
          componentId: string;
          payableLotId: string;
          payoutAllocationId: string;
        }[];
      };
}) {
  const target =
    input.target.kind === "returned_payout_credit"
      ? {
          ...input.target,
          proposedAllocations: [...input.target.proposedAllocations].sort((left, right) =>
            left.payableLotId === right.payableLotId
              ? left.payoutAllocationId < right.payoutAllocationId
                ? -1
                : left.payoutAllocationId > right.payoutAllocationId
                  ? 1
                  : 0
              : left.payableLotId < right.payableLotId
                ? -1
                : 1
          )
        }
      : input.target;
  const originalSourceOperation: "unknown_debit_recorded" | "unknown_credit_recorded" =
    input.direction === "debit" ? "unknown_debit_recorded" : "unknown_credit_recorded";
  const originalUnknown = {
    classificationPath: "unknown_then_reclassification" as const,
    classificationAuthorityId: input.originalAuthorityId,
    classificationVersion: 1,
    journalTransactionId: `journal-${input.originalOperationId}`,
    journalTransactionDigest: sha("8"),
    occurredAt: input.direction === "debit" ? "2026-08-05T07:00:00Z" : "2026-08-05T08:00:00Z",
    postedAt: input.direction === "debit" ? "2026-08-05T07:03:00Z" : "2026-08-05T08:03:00Z",
    operationId: input.originalOperationId,
    sourceKey: {
      kind: "bank" as const,
      sourceId: `${input.originalOperationId}-statement-entry`,
      operation: originalSourceOperation
    },
    evidenceId: `${input.originalOperationId}-evidence`,
    evidenceDigest: sha("f"),
    bankStatementEntryId: `${input.originalOperationId}-statement-entry`,
    bankCashPoolId: "bank-pool-rub-1",
    direction: input.direction,
    amount: { amountMinor: input.amountMinor, currency: "RUB" as const }
  };
  const approvedAt = "2026-08-06T09:00:00Z";
  const payload = {
    kind: "bank_suspense_reclassification" as const,
    authorityId: input.authorityId,
    authorityVersion: 1,
    operationId: input.operationId,
    direction: input.direction,
    bankCashPoolId: "bank-pool-rub-1",
    amount: { amountMinor: input.amountMinor, currency: "RUB" as const },
    approvedAt,
    originalUnknown,
    target
  };
  const payloadHash = hashFinanceCommandPayload(payload);
  const makerBinding = {
    authorizationId: `${input.operationId}-maker-authorization`,
    actorUserId: "finance-maker-1",
    actionKind: "bank_statement_match" as const,
    aggregateId: originalUnknown.bankStatementEntryId,
    expectedVersion: originalUnknown.classificationVersion,
    payloadHash,
    claimedStatus: "consumed" as const,
    consumedAt: "2026-08-06T08:58:00Z"
  };
  const checkerBinding = {
    authorizationId: `${input.operationId}-checker-authorization`,
    actorUserId: "finance-checker-1",
    actionKind: "bank_statement_match" as const,
    aggregateId: originalUnknown.bankStatementEntryId,
    expectedVersion: originalUnknown.classificationVersion,
    payloadHash,
    claimedStatus: "consumed" as const,
    consumedAt: "2026-08-06T08:59:00Z"
  };
  const approvalBindingCore = {
    kind: "bank_reclassification_approval_binding" as const,
    bindingId: `${input.operationId}-approval-binding`,
    version: "1",
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    payloadHash,
    makerBinding,
    checkerBinding,
    issuedAt: approvedAt
  };
  return {
    kind: "unverified_bank_suspense_reclassification_binding" as const,
    authorityId: input.authorityId,
    version: 1,
    operationId: input.operationId,
    direction: input.direction,
    bankCashPoolId: "bank-pool-rub-1",
    amount: { amountMinor: input.amountMinor, currency: "RUB" as const },
    approvedAt,
    originalUnknown,
    approvalBinding: {
      ...approvalBindingCore,
      bindingDigest: hashFinanceCommandPayload(approvalBindingCore)
    },
    target
  };
}

export function validCreditMerchantReclassificationInput() {
  return {
    context: suspenseReclassificationContext(
      "credit-reclassification-validation-operation",
      "unknown-credit-validation-operation"
    ),
    authority: suspenseReclassificationAuthority({
      direction: "credit",
      authorityId: "credit-reclassification-validation-authority",
      operationId: "credit-reclassification-validation-operation",
      amountMinor: 5_000_000,
      originalAuthorityId: "unknown-credit-validation-authority",
      originalOperationId: "unknown-credit-validation-operation",
      target: merchantPayoutCreditTarget()
    })
  };
}

export function validDebitReclassificationInput() {
  return {
    context: suspenseReclassificationContext(
      "debit-reclassification-validation-operation",
      "unknown-debit-validation-operation"
    ),
    authority: suspenseReclassificationAuthority({
      direction: "debit",
      authorityId: "debit-reclassification-validation-authority",
      operationId: "debit-reclassification-validation-operation",
      amountMinor: 2_500_000,
      originalAuthorityId: "unknown-debit-validation-authority",
      originalOperationId: "unknown-debit-validation-operation",
      target: payoutDebitTarget()
    })
  };
}

export function validReturnedCreditReclassificationInput() {
  return {
    context: suspenseReclassificationContext(
      "return-reclassification-validation-operation",
      "unknown-return-validation-operation"
    ),
    authority: suspenseReclassificationAuthority({
      direction: "credit",
      authorityId: "return-reclassification-validation-authority",
      operationId: "return-reclassification-validation-operation",
      amountMinor: 2_500_000,
      originalAuthorityId: "unknown-return-validation-authority",
      originalOperationId: "unknown-return-validation-operation",
      target: returnedCreditTarget({})
    })
  };
}

export function returnedCreditTarget(options: {
  secondAmountMinor?: number;
  duplicatePayableLot?: boolean;
  duplicatePayoutAllocation?: boolean;
  mixedAstrologers?: boolean;
}) {
  return {
    kind: "returned_payout_credit" as const,
    payoutRequestId: "payout-request-returned-validation",
    proposedAllocations: [
      {
        astrologerUserId: "astrologer-1",
        amount: { amountMinor: 1_500_000, currency: "RUB" as const },
        originalSaleId: "order-1",
        componentId: "component-1",
        payableLotId: "returned-lot-1",
        payoutAllocationId: "payout-allocation-1"
      },
      {
        astrologerUserId: options.mixedAstrologers ? "astrologer-2" : "astrologer-1",
        amount: { amountMinor: options.secondAmountMinor ?? 1_000_000, currency: "RUB" as const },
        originalSaleId: "order-2",
        componentId: "component-2",
        payableLotId: options.duplicatePayableLot ? "returned-lot-1" : "returned-lot-2",
        payoutAllocationId: options.duplicatePayoutAllocation
          ? "payout-allocation-1"
          : "payout-allocation-2"
      }
    ]
  };
}

export function payoutDebitTarget() {
  const bindingCore = {
    kind: "bank_outbound_clearing_exposure_binding" as const,
    bindingId: "bank-outbound-exposure-binding-1",
    version: "1",
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bankExposureId: "bank-exposure-validation",
    payoutRequestId: "payout-request-validation",
    bankCashPoolId: "bank-pool-rub-1",
    amount: { amountMinor: 2_500_000, currency: "RUB" as const },
    claimedRemainingAmount: { amountMinor: 2_500_000, currency: "RUB" as const },
    claimedConsumptionStatus: "unconsumed" as const,
    clearingJournalTransactionId: "journal-payout-paid-validation",
    clearingJournalTransactionDigest: sha("7"),
    issuedAt: "2026-08-05T07:00:00Z"
  };
  return {
    kind: "payout_debit" as const,
    exposureBinding: {
      ...bindingCore,
      bindingDigest: hashFinanceCommandPayload(bindingCore)
    }
  };
}

export function merchantPayoutCreditTarget() {
  const bindingCore = {
    kind: "arc_merchant_payout_clearing_exposure_binding" as const,
    bindingId: "arc-clearing-exposure-binding-1",
    version: "1",
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    providerAccountId: "arc-provider-live-1",
    merchantPayoutId: "arc-merchant-payout-1",
    bankCashPoolId: "bank-pool-rub-1",
    amount: { amountMinor: 5_000_000, currency: "RUB" as const },
    claimedRemainingAmount: { amountMinor: 5_000_000, currency: "RUB" as const },
    claimedConsumptionStatus: "unconsumed" as const,
    clearingJournalTransactionId: "journal-merchant-payout-confirmed-1",
    clearingJournalTransactionDigest: sha("6"),
    issuedAt: "2026-08-03T11:01:00Z"
  };
  return {
    kind: "merchant_payout_credit" as const,
    exposureBinding: {
      ...bindingCore,
      bindingDigest: hashFinanceCommandPayload(bindingCore)
    }
  };
}
