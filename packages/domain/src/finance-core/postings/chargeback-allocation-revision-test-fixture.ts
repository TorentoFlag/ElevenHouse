import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import {
  allocateChargebackPrincipalPayableLots,
  createChargebackPrincipalAllocationAuthority
} from "../source-lots";
import { chargebackAllocationPostingFixture } from "./chargeback-allocation-posting-test-fixtures";
import { sha } from "./posting-test-primitives";
import { nextChargebackPrincipalPositionInput } from "./chargeback-principal-position-test-fixtures";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";

export function chargebackAllocationRevisionTwoPostingFixture() {
  const first = chargebackAllocationPostingFixture();
  const firstCase = buildReceiptTransitionCases().find(
    (candidate) => candidate.kind === "chargeback_principal_allocated"
  );
  if (!firstCase) throw new Error("missing first allocation transition");
  const source = createChargebackPrincipalAllocationAuthority({
    ...first.allocationAuthority.sourceAuthority,
    authorityId: "receipt-chargeback-principal-authority-2",
    version: 2,
    payableAmount: { amountMinor: 100, currency: "RUB" },
    accountingAllocationRevisionId: "receipt-chargeback-allocation-revision-2",
    accountingAllocationVersion: 2
  });
  const sourceLot = firstCase.transition.state.lots.find(
    (lot) =>
      lot.status === "active" &&
      lot.sourceId === source.orderId &&
      (lot.bucket === "pending" || lot.bucket === "available" || lot.bucket === "reserved") &&
      lot.amount.amountMinor >= 100
  );
  if (!sourceLot) throw new Error("missing second allocation source lot");
  const transition = allocateChargebackPrincipalPayableLots({
    state: firstCase.transition.state,
    expectedVersion: firstCase.transition.nextVersion,
    authority: source,
    requestedLots: [{ lotId: sourceLot.lotId, amountMinor: 100 }],
    operationId: "receipt-chargeback-principal-allocated-2",
    sourceKey: {
      kind: "chargeback",
      sourceId: source.accountingAllocationRevisionId,
      operation: "principal_allocated"
    },
    occurredAt: "2026-08-04T02:00:00Z",
    outputLotIds: [
      {
        sourceLotId: sourceLot.lotId,
        remainderLotId: "receipt-chargeback-available-remainder-2"
      }
    ]
  });
  const receipt = createPayableLotOperationReceipt(transition);
  const componentBindings = Object.freeze(
    receipt.requiredExternalLinkSlots.map((slot, index) => {
      const core = Object.freeze({
        kind: "finance_component_slot_resolution_binding" as const,
        bindingId: `binding-${slot.slotId}`,
        version: "1",
        authorizationStatus: "unverified" as const,
        digestPurpose: "drift_detection_only" as const,
        operationReceiptId: receipt.receiptId,
        operationReceiptDigest: receipt.canonicalDigest,
        slotId: slot.slotId,
        effectId: slot.effectId,
        componentId: `component-chargeback-payable-v2-${index + 1}`,
        requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
      });
      return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
    })
  );
  const principalPosition = nextChargebackPrincipalPositionInput(
    first.principalPositionTransitionBinding as unknown as UnverifiedChargebackPrincipalPositionTransitionBinding,
    {
      positionId: first.principalPositionTransitionBinding.positionId,
      chargebackCaseId: source.chargebackCaseId,
      orderId: source.orderId,
      astrologerUserId: source.astrologerUserId,
      providerAccountId: first.principalPositionTransitionBinding.providerAccountId,
      accountingAllocationId: source.accountingAllocationId,
      accountingAllocationRevisionId: source.accountingAllocationRevisionId,
      accountingAllocationVersion: source.accountingAllocationVersion,
      providerEvidenceBindingDigest:
        first.principalPositionTransitionBinding.providerEvidenceBindingDigest,
      confirmedBasis: first.principalPositionTransitionBinding.confirmedBasis,
      observedAt: receipt.occurredAt
    }
  );
  const authorityCore = Object.freeze({
    ...first.allocationAuthority,
    authorityId: source.accountingAllocationRevisionId,
    version: source.accountingAllocationVersion,
    sourceAuthority: source,
    priorAllocationAuthorityRef: {
      kind: "chargeback_principal_posting_allocation" as const,
      authorityId: first.allocationAuthority.authorityId,
      accountingAllocationId: source.accountingAllocationId,
      version: first.allocationAuthority.version,
      nextAllocatedPrincipal: first.allocationAuthority.nextAllocatedPrincipal,
      canonicalDigest: first.allocationAuthority.canonicalDigest
    },
    positionTransitionRef: {
      kind: principalPosition.kind,
      bindingId: principalPosition.bindingId,
      nextPositionVersion: principalPosition.nextPositionVersion,
      bindingDigest: principalPosition.bindingDigest
    },
    payablePrincipal: source.payableAmount,
    recoveryPrincipal: { amountMinor: 0, currency: "RUB" as const },
    platformPrincipal: { amountMinor: 0, currency: "RUB" as const },
    principalAllocationDelta: { amountMinor: 100, currency: "RUB" as const },
    nextAllocatedPrincipal: { amountMinor: 3_100, currency: "RUB" as const },
    unallocatedSuspense: { amountMinor: 1_900, currency: "RUB" as const },
    recoveryAllocations: Object.freeze([]),
    platformAllocations: Object.freeze([]),
    approvedAt: receipt.occurredAt
  });
  const allocationAuthority = Object.freeze({
    ...authorityCore,
    canonicalDigest: hashFinanceCommandPayload(
      Object.fromEntries(Object.entries(authorityCore).filter(([key]) => key !== "canonicalDigest"))
    )
  });
  return Object.freeze({
    ...first,
    context: {
      journalTransactionId: "journal-chargeback-principal-allocation-2",
      linkProofId: "proof-chargeback-principal-allocation-2",
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      occurredAt: receipt.occurredAt,
      postedAt: "2026-08-04T02:00:01Z"
    },
    allocationAuthority,
    resolvedPriorAllocationAuthority: first.allocationAuthority,
    principalPositionTransitionBinding: principalPosition,
    resolvedPriorPrincipalPositionTransitionBinding: first.principalPositionTransitionBinding,
    allocationOperationReceipt: receipt,
    allocationComponentBindings: componentBindings,
    operationSnapshotRef: {
      snapshotId: "wallet-snapshot-chargeback-allocation-2",
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      previousWalletRevision: "42",
      nextWalletRevision: "43",
      previousLotStateDigest: receipt.previousLotState.digest,
      nextLotStateDigest: receipt.nextLotState.digest,
      historyRecordDigest: receipt.historyRecord.canonicalDigest,
      snapshotDigest: sha("f")
    },
    originalPlatformJournals: Object.freeze([])
  });
}
