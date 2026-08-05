import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createFinanceJournalTransaction } from "../journal";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { chargebackConfirmedPostingFixture } from "./chargeback-confirmed-posting-test-fixtures";
import { sha } from "./posting-test-primitives";
import {
  chargebackPrincipalPositionInput,
  rehashChargebackPrincipalPosition
} from "./chargeback-principal-position-test-fixtures";

export function chargebackAllocationPostingFixture() {
  const receiptCase = buildReceiptTransitionCases().find(
    (candidate) => candidate.kind === "chargeback_principal_allocated"
  );
  if (!receiptCase) throw new Error("missing chargeback allocation transition");
  const sourceAuthority = receiptCase.transition.historyRecord.authority;
  if (sourceAuthority?.kind !== "chargeback_principal_allocation") {
    throw new Error("missing chargeback allocation authority");
  }
  const operationReceipt = createPayableLotOperationReceipt(receiptCase.transition);
  const componentBindings = Object.freeze(
    operationReceipt.requiredExternalLinkSlots.map((slot, index) => {
      const core = Object.freeze({
        kind: "finance_component_slot_resolution_binding" as const,
        bindingId: `binding-${slot.slotId}`,
        version: "1",
        authorizationStatus: "unverified" as const,
        digestPurpose: "drift_detection_only" as const,
        operationReceiptId: operationReceipt.receiptId,
        operationReceiptDigest: operationReceipt.canonicalDigest,
        slotId: slot.slotId,
        effectId: slot.effectId,
        componentId: `component-chargeback-payable-${index + 1}`,
        requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
      });
      return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
    })
  );
  const platformComponentId = "component-platform-commission";
  const originalPlatformJournal = createFinanceJournalTransaction({
    id: "journal-original-platform-commission-earned",
    sourceKey: { kind: "order", sourceId: sourceAuthority.orderId, operation: "commission_earned" },
    occurredAt: "2026-08-03T12:00:00Z",
    postedAt: "2026-08-03T12:00:01Z",
    reversesTransactionId: null,
    entries: [
      {
        account: { code: "platform_commission_deferred", currency: "RUB" },
        side: "debit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: {
          originalSaleId: sourceAuthority.orderId,
          componentId: platformComponentId,
          payableLotId: null,
          payoutAllocationId: null
        }
      },
      {
        account: { code: "platform_commission_revenue", currency: "RUB" },
        side: "credit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: {
          originalSaleId: sourceAuthority.orderId,
          componentId: platformComponentId,
          payableLotId: null,
          payoutAllocationId: null
        }
      }
    ]
  });
  const originalPlatformEntry = originalPlatformJournal.entries[1];
  if (!originalPlatformEntry) throw new Error("missing original platform entry");
  const provider = chargebackConfirmedPostingFixture();
  const recoveryAllocation = Object.freeze({
    kind: "recovery_receivable" as const,
    allocationId: "chargeback-recovery-component-allocation",
    componentId: "component-astrologer-recovery",
    originalSaleId: sourceAuthority.orderId,
    payableLotId: "paid-payable-lot-1",
    payoutRequestId: "payout-1",
    payoutAllocationId: "payout-allocation-1",
    amount: { amountMinor: 500, currency: "RUB" as const },
    treatmentAuthorityRef: Object.freeze({
      kind: "chargeback_recovery_treatment",
      authorityId: "chargeback-recovery-treatment-1",
      version: 1,
      canonicalDigest: sha("c")
    })
  });
  const platformAllocation = Object.freeze({
    kind: "platform_component" as const,
    allocationId: "chargeback-platform-component-allocation",
    componentId: platformComponentId,
    originalSaleId: sourceAuthority.orderId,
    accountCode: "platform_commission_revenue" as const,
    amount: { amountMinor: 500, currency: "RUB" as const },
    originalJournalEntry: Object.freeze({
      transactionId: originalPlatformJournal.id,
      entryIndex: 1,
      canonicalDigest: hashFinanceCommandPayload(originalPlatformEntry)
    }),
    treatmentAuthorityRef: Object.freeze({
      kind: "chargeback_component_reversal",
      authorityId: "chargeback-component-reversal-1",
      version: 1,
      canonicalDigest: sha("d")
    })
  });
  const positionTemplate = chargebackPrincipalPositionInput();
  const recoveryTemplate = positionTemplate.recoveryPositions[0];
  const platformTemplate = positionTemplate.platformPositions[0];
  if (!recoveryTemplate || !platformTemplate) throw new Error("missing position template");
  const treatmentCore: Record<string, unknown> = {
    ...recoveryTemplate.treatmentDecision,
    chargebackCaseId: sourceAuthority.chargebackCaseId,
    orderId: sourceAuthority.orderId,
    astrologerUserId: sourceAuthority.astrologerUserId,
    positionId: recoveryAllocation.allocationId,
    decisionId: recoveryAllocation.treatmentAuthorityRef.authorityId,
    version: recoveryAllocation.treatmentAuthorityRef.version,
    approvedAmount: recoveryAllocation.amount
  };
  Reflect.deleteProperty(treatmentCore, "canonicalDigest");
  const recoveryPosition = Object.freeze({
    ...recoveryTemplate,
    positionId: treatmentCore.positionId as string,
    originalSaleId: recoveryAllocation.originalSaleId,
    componentId: recoveryAllocation.componentId,
    payableLotId: recoveryAllocation.payableLotId,
    payoutRequestId: recoveryAllocation.payoutRequestId,
    payoutAllocationId: recoveryAllocation.payoutAllocationId,
    sourceCapacity: recoveryAllocation.amount,
    currentDelta: recoveryAllocation.amount,
    consumedAfter: recoveryAllocation.amount,
    remainingAfter: { amountMinor: 0, currency: "RUB" as const },
    treatmentDecision: Object.freeze({
      ...treatmentCore,
      canonicalDigest: hashFinanceCommandPayload(treatmentCore)
    })
  });
  const resolvedRecoveryAllocation = Object.freeze({
    ...recoveryAllocation,
    treatmentAuthorityRef: Object.freeze({
      ...recoveryAllocation.treatmentAuthorityRef,
      canonicalDigest: recoveryPosition.treatmentDecision.canonicalDigest
    })
  });
  const providerSource = provider.providerEvidenceBinding.sourceAuthority;
  const principalPosition = rehashChargebackPrincipalPosition({
    ...positionTemplate,
    positionId: `chargeback-position:${sourceAuthority.chargebackCaseId}`,
    chargebackCaseId: sourceAuthority.chargebackCaseId,
    orderId: sourceAuthority.orderId,
    astrologerUserId: sourceAuthority.astrologerUserId,
    providerAccountId: providerSource.providerAccount.providerAccountId,
    accountingAllocationId: sourceAuthority.accountingAllocationId,
    accountingAllocationRevisionId: sourceAuthority.accountingAllocationRevisionId,
    accountingAllocationVersion: sourceAuthority.accountingAllocationVersion,
    providerEvidenceBindingDigest: provider.providerEvidenceBinding.bindingDigest,
    confirmedBasis: sourceAuthority.confirmedBasis,
    recoveryPositions: [recoveryPosition],
    platformPositions: [
      {
        ...platformTemplate,
        positionId: platformAllocation.allocationId,
        originalSaleId: platformAllocation.originalSaleId,
        componentId: platformAllocation.componentId,
        debitAccount: platformAllocation.accountCode,
        originalJournalEntry: platformAllocation.originalJournalEntry,
        ledgerPositionAuthorityRef: platformAllocation.treatmentAuthorityRef,
        currentDelta: platformAllocation.amount,
        revenueRemainingAfter: { amountMinor: 500, currency: "RUB" },
        reversedAfter: { amountMinor: 500, currency: "RUB" }
      }
    ],
    observedAt: operationReceipt.occurredAt
  });
  const allocationCore = Object.freeze({
    kind: "chargeback_principal_posting_allocation" as const,
    schemaVersion: 1 as const,
    authorityId: sourceAuthority.accountingAllocationRevisionId,
    version: sourceAuthority.accountingAllocationVersion,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: sourceAuthority.chargebackCaseId,
    orderId: sourceAuthority.orderId,
    astrologerUserId: sourceAuthority.astrologerUserId,
    arcProviderAccountId: provider.providerEvidenceBinding.providerEvidence.providerAccountId,
    allocationStatus: "approved" as const,
    sourceAuthority,
    confirmedProviderEvidenceBinding: provider.providerEvidenceBinding,
    priorAllocationAuthorityRef: null,
    positionTransitionRef: Object.freeze({
      kind: principalPosition.kind,
      bindingId: principalPosition.bindingId,
      nextPositionVersion: principalPosition.nextPositionVersion,
      bindingDigest: principalPosition.bindingDigest
    }),
    disputedPrincipal:
      provider.providerEvidenceBinding.sourceAuthority.nextCumulativeDisputedAmount,
    payablePrincipal: sourceAuthority.payableAmount,
    recoveryPrincipal: resolvedRecoveryAllocation.amount,
    platformPrincipal: platformAllocation.amount,
    principalAllocationDelta: { amountMinor: 3_000, currency: "RUB" as const },
    nextAllocatedPrincipal: { amountMinor: 3_000, currency: "RUB" as const },
    unallocatedSuspense: { amountMinor: 2_000, currency: "RUB" as const },
    recoveryAllocations: Object.freeze([resolvedRecoveryAllocation]),
    platformAllocations: Object.freeze([platformAllocation]),
    approvedAt: operationReceipt.occurredAt
  });
  const allocationAuthority = Object.freeze({
    ...allocationCore,
    canonicalDigest: hashFinanceCommandPayload(allocationCore)
  });
  const operationSnapshotRef = Object.freeze({
    snapshotId: "wallet-snapshot-chargeback-allocation-1",
    operationId: operationReceipt.operationId,
    sourceKey: operationReceipt.sourceKey,
    previousWalletRevision: "41",
    nextWalletRevision: "42",
    previousLotStateDigest: operationReceipt.previousLotState.digest,
    nextLotStateDigest: operationReceipt.nextLotState.digest,
    historyRecordDigest: operationReceipt.historyRecord.canonicalDigest,
    snapshotDigest: sha("e")
  });
  const context = Object.freeze({
    journalTransactionId: "journal-chargeback-principal-allocation-1",
    linkProofId: "proof-chargeback-principal-allocation-1",
    operationId: operationReceipt.operationId,
    sourceKey: operationReceipt.sourceKey,
    occurredAt: operationReceipt.occurredAt,
    postedAt: "2026-08-04T01:00:01Z"
  });
  return Object.freeze({
    context,
    allocationAuthority,
    resolvedPriorAllocationAuthority: null,
    principalPositionTransitionBinding: principalPosition,
    resolvedPriorPrincipalPositionTransitionBinding: null,
    providerConfirmationOperationReceipt: provider.operationReceipt,
    providerConfirmationComponentBindings: provider.componentBindings,
    allocationOperationReceipt: operationReceipt,
    allocationComponentBindings: componentBindings,
    operationSnapshotRef,
    originalPlatformJournals: Object.freeze([originalPlatformJournal])
  });
}

export function rehashChargebackAllocation(input: Record<string, unknown>) {
  const core = { ...input };
  delete core.canonicalDigest;
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}
