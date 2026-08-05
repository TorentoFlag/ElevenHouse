import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { releasedState } from "../source-lot-reference-test-fixtures";
import {
  collectChargebackRecoveryPayableLots,
  createChargebackLostAuthority,
  createChargebackRecoveryCollectionAuthority,
  createChargebackWonAuthority,
  recordChargebackLostRestrictionOutcome,
  restoreChargebackWonReservedPayableLots
} from "../source-lots";
import { buildChargebackRecoveryCollectionPosting } from "./chargeback-recovery-posting";
import { outcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";
import { chargebackResolutionAllocationFixture } from "./chargeback-resolution-allocation-test-fixture";
import { chargebackResolutionProviderConfirmationChain } from "./chargeback-resolution-test-primitives";
import { receiptDecoderEnvelope } from "./chargeback-confirmed-posting-test-fixtures";
import { postingDecoderEnvelope, sha } from "./posting-test-primitives";

export function chargebackWonResolutionFixture() {
  return createChargebackWonResolutionFixture().input;
}

export function chargebackWonResolutionFixtureWithSuspense(amountMinor: number) {
  return createChargebackWonResolutionFixture(amountMinor).input;
}

export function chargebackResolutionRecoveryPostingInputFixture() {
  return createChargebackWonResolutionFixture().recoveryPostingInput;
}

function createChargebackWonResolutionFixture(suspenseClearedAmountMinor = 2_000) {
  const allocation = chargebackResolutionAllocationFixture();
  const wonCase = wonReceiptCase();
  const withRecovery = releasedState("order-resolution-recovery", wonCase.previousState, {
    capturedAt: "2026-08-05T00:00:00Z",
    bookingCompletedAt: "2026-08-05T01:00:00Z",
    settlementMatchedAt: "2026-08-05T02:00:00Z",
    integrityEvaluatedAt: "2026-08-08T00:00:00Z",
    releasedAt: "2026-08-08T00:00:00Z"
  });
  const recoverySource = createChargebackRecoveryCollectionAuthority({
    kind: "chargeback_recovery_collection",
    authorityId: "resolution-recovery-source-authority-1",
    version: 1,
    recoveryCollectionId: "resolution-recovery-collection-1",
    chargebackCaseId: allocation.allocationAuthority.chargebackCaseId,
    astrologerUserId: allocation.allocationAuthority.astrologerUserId,
    collectionSource: { kind: "future_payable", sourceOrderId: "order-resolution-recovery" },
    collectedPayableAmount: { amountMinor: 200, currency: "RUB" },
    accountingAllocationId: "resolution-recovery-accounting-1",
    accountingAllocationVersion: 1,
    allocationStatus: "approved",
    canonicalEvidenceId: "resolution-recovery-evidence-1",
    collectedAt: "2026-08-09T00:00:00Z"
  });
  const recoveryTransition = collectChargebackRecoveryPayableLots({
    state: withRecovery.state,
    expectedVersion: withRecovery.nextVersion,
    authority: recoverySource,
    requestedLots: [{ lotId: "lot-order-resolution-recovery-available", amountMinor: 200 }],
    operationId: "resolution-recovery-operation-1",
    sourceKey: {
      kind: "chargeback",
      sourceId: recoverySource.recoveryCollectionId,
      operation: "recovery_collected"
    },
    occurredAt: recoverySource.collectedAt,
    outputLotIds: [
      {
        sourceLotId: "lot-order-resolution-recovery-available",
        remainderLotId: "lot-order-resolution-recovery-available-remainder"
      }
    ]
  });
  const recovery = recoveryPosting(recoveryTransition, allocation);
  const wonSource = createChargebackWonAuthority({
    kind: "chargeback_won",
    authorityId: "chargeback-resolution-won-source",
    version: 1,
    chargebackCaseId: allocation.allocationAuthority.chargebackCaseId,
    restoredPayableAmount: { amountMinor: 2_200, currency: "RUB" },
    suspenseClearedAmount: { amountMinor: suspenseClearedAmountMinor, currency: "RUB" },
    accountingAllocationId: "chargeback-resolution-won-accounting",
    accountingAllocationVersion: 1,
    allocationStatus: "approved",
    canonicalEvidenceId: "chargeback-resolution-won-evidence",
    wonAt: "2026-08-10T00:00:00Z"
  });
  const wonTransition = restoreChargebackWonReservedPayableLots({
    state: recoveryTransition.state,
    expectedVersion: recoveryTransition.nextVersion,
    authority: wonSource,
    requestedLots: [
      { lotId: "lot-order-chargeback-available", amountMinor: 2_000 },
      { lotId: "lot-order-resolution-recovery-available", amountMinor: 200 }
    ],
    operationId: "chargeback-resolution-won-operation",
    sourceKey: { kind: "chargeback", sourceId: wonSource.chargebackCaseId, operation: "won" },
    occurredAt: wonSource.wonAt,
    outputLotIds: [
      {
        sourceLotId: "lot-order-chargeback-available",
        targetLotId: "resolution-won-reserved-payable"
      },
      {
        sourceLotId: "lot-order-resolution-recovery-available",
        targetLotId: "resolution-won-reserved-recovery"
      }
    ]
  });
  const receipt = createPayableLotOperationReceipt(wonTransition);
  const componentBindings = receiptBindings(receipt, "resolution-won-component");
  const outcomeEvidence = outcome(wonSource, "won");
  const provider = allocation.allocationAuthority.confirmedProviderEvidenceBinding;
  const core = {
    kind: "chargeback_won_resolution_posting" as const,
    schemaVersion: 1 as const,
    authorityId: wonSource.authorityId,
    version: wonSource.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: wonSource.chargebackCaseId,
    originalOrderId: allocation.allocationAuthority.orderId,
    astrologerUserId: allocation.allocationAuthority.astrologerUserId,
    arcProviderAccountId: allocation.allocationAuthority.arcProviderAccountId,
    providerPaymentId: provider.sourceAuthority.providerPaymentId,
    sourceAuthority: wonSource,
    sourceAuthorityDigest: hashFinanceCommandPayload(wonSource),
    outcomeEvidenceRef: outcomeEvidenceRef(outcomeEvidence),
    latestProviderBindingRef: providerRef(provider),
    allocationRefs: [allocation.allocationRef],
    disputedPrincipal: { amountMinor: 5_000, currency: "RUB" as const },
    unallocatedSuspense: { amountMinor: suspenseClearedAmountMinor, currency: "RUB" as const },
    decidedAt: wonSource.wonAt,
    recoveryRefs: [
      {
        kind: recovery.authority.kind,
        authorityId: recovery.authority.authorityId,
        version: recovery.authority.version,
        canonicalDigest: recovery.authority.canonicalDigest,
        journalTransactionId: recovery.transaction.id,
        journalDigest: hashFinanceCommandPayload(recovery.transaction)
      }
    ],
    operationReceiptId: receipt.receiptId,
    operationReceiptDigest: receipt.canonicalDigest,
    componentBindingsDigest: hashFinanceCommandPayload(componentBindings),
    outstandingRecovery: { amountMinor: 300, currency: "RUB" as const },
    restoredPayable: wonSource.restoredPayableAmount,
    platformReversal: { amountMinor: 500, currency: "RUB" as const }
  };
  const authority = Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
  const input = Object.freeze({
    context: {
      journalTransactionId: "journal-chargeback-resolution-won",
      linkProofId: "proof-chargeback-resolution-won",
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      occurredAt: receipt.occurredAt,
      postedAt: receipt.occurredAt
    },
    authority,
    resolvedProviderConfirmationChain: chargebackResolutionProviderConfirmationChain(allocation),
    resolvedAllocationAuthorities: [allocation.allocationAuthority],
    resolvedPrincipalPositionTransitionBindings: [allocation.principalPositionTransitionBinding],
    allocationJournals: [allocation.allocationTransaction],
    resolvedRecoveryAuthorities: [recovery.authority],
    recoveryJournals: [recovery.transaction],
    originalPlatformJournals: allocation.originalPlatformJournals,
    outcomeEvidence,
    operationReceipt: receipt,
    componentBindings,
    operationSnapshotRef: snapshot(receipt, "resolution-won-snapshot", "71", "72")
  });
  return Object.freeze({ input, recoveryPostingInput: recovery.input });
}

export function chargebackLostResolutionFixture(fullyAllocated = false) {
  const allocation = chargebackResolutionAllocationFixture(fullyAllocated);
  const source = createChargebackLostAuthority({
    kind: "chargeback_lost",
    authorityId: `chargeback-resolution-lost-source-${fullyAllocated ? "closed" : "blocked"}`,
    version: 1,
    chargebackCaseId: allocation.allocationAuthority.chargebackCaseId,
    unallocatedSuspense: allocation.allocationAuthority.unallocatedSuspense,
    accountingAllocationId: `chargeback-resolution-lost-accounting-${fullyAllocated ? "closed" : "blocked"}`,
    accountingAllocationVersion: 1,
    allocationStatus: "approved",
    canonicalEvidenceId: `chargeback-resolution-lost-evidence-${fullyAllocated ? "closed" : "blocked"}`,
    lostAt: "2026-08-10T00:00:00Z"
  });
  const state = wonReceiptCase().previousState;
  const transition = recordChargebackLostRestrictionOutcome({
    state,
    expectedVersion: state.version,
    authority: source,
    operationId: `chargeback-resolution-lost-operation-${fullyAllocated ? "closed" : "blocked"}`,
    operationKey: {
      kind: "chargeback_restriction",
      restrictionId: "chargeback-restriction-1",
      operation: "lost_final"
    },
    occurredAt: source.lostAt
  });
  const outcomeEvidence = outcome(source, "lost");
  const provider = allocation.allocationAuthority.confirmedProviderEvidenceBinding;
  const core = {
    kind: "chargeback_lost_resolution_no_posting" as const,
    schemaVersion: 1 as const,
    authorityId: source.authorityId,
    version: source.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: source.chargebackCaseId,
    originalOrderId: allocation.allocationAuthority.orderId,
    astrologerUserId: allocation.allocationAuthority.astrologerUserId,
    arcProviderAccountId: allocation.allocationAuthority.arcProviderAccountId,
    providerPaymentId: provider.sourceAuthority.providerPaymentId,
    sourceAuthority: source,
    sourceAuthorityDigest: hashFinanceCommandPayload(source),
    outcomeEvidenceRef: outcomeEvidenceRef(outcomeEvidence),
    latestProviderBindingRef: providerRef(provider),
    allocationRefs: [allocation.allocationRef],
    recoveryRefs: [],
    disputedPrincipal: allocation.allocationAuthority.disputedPrincipal,
    unallocatedSuspense: allocation.allocationAuthority.unallocatedSuspense,
    decidedAt: source.lostAt,
    resultingRestrictionStatus: transition.state.chargebackRestrictions.find(
      (row) => row.chargebackCaseId === source.chargebackCaseId
    )!.status as "allocation_blocked" | "closed_lost"
  };
  const authority = Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
  return Object.freeze({
    authority,
    resolvedProviderConfirmationChain: chargebackResolutionProviderConfirmationChain(allocation),
    resolvedAllocationAuthorities: [allocation.allocationAuthority],
    resolvedPrincipalPositionTransitionBindings: [allocation.principalPositionTransitionBinding],
    allocationJournals: [allocation.allocationTransaction],
    resolvedRecoveryAuthorities: [],
    recoveryJournals: [],
    outcomeEvidence
  });
}

function recoveryPosting(
  transition: ReturnType<typeof collectChargebackRecoveryPayableLots>,
  allocation: ReturnType<typeof chargebackResolutionAllocationFixture>
) {
  const receipt = createPayableLotOperationReceipt(transition);
  const componentBindings = receiptBindings(receipt, "resolution-recovery-component");
  const source = transition.historyRecord.authority;
  if (source?.kind !== "chargeback_recovery_collection") throw new Error("missing recovery source");
  const row = allocation.allocationAuthority.recoveryAllocations[0];
  const entryIndex = allocation.allocationTransaction.entries.findIndex(
    (entry) => entry.account.code === "astrologer_recovery_receivable"
  );
  const entry = allocation.allocationTransaction.entries[entryIndex];
  const position = allocation.principalPositionTransitionBinding.recoveryPositions.find(
    (candidate) => candidate.positionId === row?.allocationId
  );
  if (!row || !entry || !position) throw new Error("missing recovery exposure");
  const core = {
    kind: "chargeback_recovery_posting_allocation" as const,
    schemaVersion: 1 as const,
    authorityId: source.recoveryCollectionId,
    version: source.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: source.chargebackCaseId,
    originalOrderId: allocation.allocationAuthority.orderId,
    astrologerUserId: source.astrologerUserId,
    arcProviderAccountId: allocation.allocationAuthority.arcProviderAccountId,
    providerPaymentId:
      allocation.allocationAuthority.confirmedProviderEvidenceBinding.sourceAuthority
        .providerPaymentId,
    sourceAuthority: source,
    sourceAuthorityDigest: hashFinanceCommandPayload(source),
    latestProviderBindingRef: providerRef(
      allocation.allocationAuthority.confirmedProviderEvidenceBinding
    ),
    allocationRefs: [allocation.allocationRef],
    priorAuthorityRef: null,
    latestOutcomeEvidenceRef: null,
    operationReceiptId: receipt.receiptId,
    operationReceiptDigest: receipt.canonicalDigest,
    componentBindingsDigest: hashFinanceCommandPayload(componentBindings),
    collectionTotal: source.collectedPayableAmount,
    collectionRows: [
      {
        exposureId: row.allocationId,
        amount: source.collectedPayableAmount,
        receiptPayableEffectId: receipt.effects[0]!.effectId,
        receiptPayableComponentId: componentBindings[0]!.componentId,
        receiptRecoveryEffectId: receipt.effects[1]!.effectId,
        receiptRecoveryComponentId: componentBindings[1]!.componentId
      }
    ],
    exposures: [
      {
        exposureId: row.allocationId,
        originalComponentId: row.componentId,
        originalSaleId: row.originalSaleId,
        payableLotId: row.payableLotId,
        payoutAllocationId: row.payoutAllocationId,
        sourceCapacity: position.sourceCapacity,
        allocatedAmount: position.consumedAfter,
        priorCollectedAmount: { amountMinor: 0, currency: "RUB" as const },
        collectionDelta: source.collectedPayableAmount,
        nextCollectedAmount: source.collectedPayableAmount
      }
    ],
    tranches: [
      {
        exposureId: row.allocationId,
        allocationAuthorityId: allocation.allocationAuthority.authorityId,
        allocationAuthorityVersion: allocation.allocationAuthority.version,
        accountingAllocationRevisionId:
          allocation.allocationAuthority.sourceAuthority.accountingAllocationRevisionId,
        positionTransitionBindingId: allocation.principalPositionTransitionBinding.bindingId,
        positionTransitionVersion:
          allocation.principalPositionTransitionBinding.nextPositionVersion,
        originalJournalEntry: {
          transactionId: allocation.allocationTransaction.id,
          entryIndex,
          canonicalDigest: hashFinanceCommandPayload(entry)
        },
        amount: row.amount
      }
    ],
    collectedAt: source.collectedAt
  };
  const authority = Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
  const input = {
    context: {
      journalTransactionId: "journal-resolution-recovery-1",
      linkProofId: "proof-resolution-recovery-1",
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      occurredAt: receipt.occurredAt,
      postedAt: receipt.occurredAt
    },
    authority,
    resolvedPriorAuthorities: [],
    resolvedAllocationAuthorities: [allocation.allocationAuthority],
    resolvedPrincipalPositionTransitionBindings: [allocation.principalPositionTransitionBinding],
    originalAllocationJournals: [allocation.allocationTransaction],
    latestOutcomeEvidence: null,
    operationReceipt: receipt,
    componentBindings,
    operationSnapshotRef: snapshot(receipt, "resolution-recovery-snapshot", "70", "71")
  };
  const recipe = buildChargebackRecoveryCollectionPosting(
    input,
    postingDecoderEnvelope,
    receiptDecoderEnvelope
  );
  return Object.freeze({ authority, transaction: recipe.transaction, input });
}

function outcome(
  source:
    | ReturnType<typeof createChargebackWonAuthority>
    | ReturnType<typeof createChargebackLostAuthority>,
  outcomeValue: "won" | "lost"
) {
  const core = {
    kind: "unverified_chargeback_outcome_evidence_binding" as const,
    schemaVersion: 1 as const,
    evidenceId: source.canonicalEvidenceId,
    version: source.version,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    auditSource: "internal_case_review" as const,
    outcome: outcomeValue,
    chargebackCaseId: source.chargebackCaseId,
    sourceAuthority: source,
    sourceAuthorityDigest: hashFinanceCommandPayload(source),
    auditedByActorUserId: "finance-auditor-1",
    decidedAt: source.kind === "chargeback_won" ? source.wonAt : source.lostAt
  };
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}

function receiptBindings(
  receipt: ReturnType<typeof createPayableLotOperationReceipt>,
  prefix: string
) {
  return Object.freeze(
    receipt.requiredExternalLinkSlots.map((slot, index) => {
      const core = {
        kind: "finance_component_slot_resolution_binding" as const,
        bindingId: `${prefix}-binding-${index + 1}`,
        version: "1",
        authorizationStatus: "unverified" as const,
        digestPurpose: "drift_detection_only" as const,
        operationReceiptId: receipt.receiptId,
        operationReceiptDigest: receipt.canonicalDigest,
        slotId: slot.slotId,
        effectId: slot.effectId,
        componentId: `${prefix}-${index + 1}`,
        requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
      };
      return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
    })
  );
}
const providerRef = (provider: {
  kind: "unverified_chargeback_provider_evidence_binding";
  bindingId: string;
  version: number;
  bindingDigest: `sha256:${string}`;
}) =>
  Object.freeze({
    kind: provider.kind,
    bindingId: provider.bindingId,
    version: provider.version,
    canonicalDigest: provider.bindingDigest
  });
function snapshot(
  receipt: ReturnType<typeof createPayableLotOperationReceipt>,
  snapshotId: string,
  previous: string,
  next: string
) {
  return {
    snapshotId,
    operationId: receipt.operationId,
    sourceKey: receipt.sourceKey,
    previousWalletRevision: previous,
    nextWalletRevision: next,
    previousLotStateDigest: receipt.previousLotState.digest,
    nextLotStateDigest: receipt.nextLotState.digest,
    historyRecordDigest: receipt.historyRecord.canonicalDigest,
    snapshotDigest: sha("8")
  };
}
function wonReceiptCase() {
  const value = buildReceiptTransitionCases().find(
    (item) => item.kind === "chargeback_won_reserved"
  );
  if (!value) throw new Error("missing won Task5 case");
  return value;
}
