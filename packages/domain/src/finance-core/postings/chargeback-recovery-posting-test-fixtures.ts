import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import {
  collectChargebackRecoveryPayableLots,
  createChargebackLostAuthority,
  createChargebackRecoveryCollectionAuthority,
  createChargebackWonAuthority,
  recordChargebackLostRestrictionOutcome
} from "../source-lots";
import { chargebackRecoveryAllocationFixture } from "./chargeback-recovery-allocation-test-fixture";
import { outcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";
import { sha } from "./posting-test-primitives";

type PriorAuthority = Readonly<{
  authorityId: string;
  version: number;
  canonicalDigest: `sha256:${string}`;
}>;

export function chargebackRecoveryPostingFixtures() {
  const shared = chargebackRecoveryAllocationFixture();
  const firstTransition = recoveryTransition(
    shared.recoveryCase.previousState,
    shared.recoveryCase.previousState.version,
    "lot-order-receipt-recovery-available",
    200,
    1,
    "recovery-income-remainder-1"
  );
  const secondTransition = recoveryTransition(
    firstTransition.state,
    firstTransition.nextVersion,
    "recovery-income-remainder-1",
    150,
    2,
    "recovery-income-remainder-2"
  );
  const first = postingInput(firstTransition, shared, null, 0);
  const second = postingInput(secondTransition, shared, first.authority, 200);
  const multiLot = postingInput(multiLotRecoveryTransition(shared), shared, null, 0);
  const lostSource = createChargebackLostAuthority({
    kind: "chargeback_lost",
    authorityId: "recovery-lost-source-authority",
    version: 1,
    chargebackCaseId: shared.confirmedSource.chargebackCaseId,
    unallocatedSuspense: shared.allocationAuthority.unallocatedSuspense,
    accountingAllocationId: "recovery-lost-accounting-allocation",
    accountingAllocationVersion: 1,
    allocationStatus: "approved",
    canonicalEvidenceId: "recovery-lost-evidence",
    lostAt: "2026-08-12T00:00:00Z"
  });
  const lost = recordChargebackLostRestrictionOutcome({
    state: shared.recoveryCase.previousState,
    expectedVersion: shared.recoveryCase.previousState.version,
    authority: lostSource,
    operationId: "recovery-lost-operation",
    operationKey: {
      kind: "chargeback_restriction",
      restrictionId: shared.confirmedSource.restrictionId,
      operation: "lost_final"
    },
    occurredAt: lostSource.lostAt
  });
  const afterLostTransition = recoveryTransition(
    lost.state,
    lost.nextVersion,
    "lot-order-receipt-recovery-available",
    200,
    1,
    "recovery-after-lost-remainder"
  );
  const lostEvidence = outcome(lostSource, "lost");
  const afterLost = postingInput(afterLostTransition, shared, null, 0, lostEvidence);
  return Object.freeze({ first, second, multiLot, afterLost });
}

function multiLotRecoveryTransition(
  shared: ReturnType<typeof chargebackRecoveryAllocationFixture>
) {
  const collectionId = "recovery-collection-multi-lot";
  const collectedAt = "2026-08-13T12:00:00Z";
  return collectChargebackRecoveryPayableLots({
    state: shared.recoveryCase.previousState,
    expectedVersion: shared.recoveryCase.previousState.version,
    authority: createChargebackRecoveryCollectionAuthority({
      kind: "chargeback_recovery_collection",
      authorityId: "recovery-source-authority-multi-lot",
      version: 1,
      recoveryCollectionId: collectionId,
      chargebackCaseId: shared.confirmedSource.chargebackCaseId,
      astrologerUserId: shared.confirmedSource.astrologerUserId,
      collectionSource: { kind: "future_payable", sourceOrderId: "order-receipt-recovery" },
      collectedPayableAmount: { amountMinor: 200, currency: "RUB" },
      accountingAllocationId: "recovery-posting-accounting-allocation-multi-lot",
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: "recovery-evidence-multi-lot",
      collectedAt
    }),
    requestedLots: [
      { lotId: "lot-order-receipt-recovery-available", amountMinor: 100 },
      { lotId: "lot-order-receipt-recovery-reserved", amountMinor: 100 }
    ],
    operationId: "recovery-collected-operation-multi-lot",
    sourceKey: { kind: "chargeback", sourceId: collectionId, operation: "recovery_collected" },
    occurredAt: collectedAt,
    outputLotIds: [
      {
        sourceLotId: "lot-order-receipt-recovery-available",
        remainderLotId: "recovery-multi-lot-available-remainder"
      },
      {
        sourceLotId: "lot-order-receipt-recovery-reserved",
        remainderLotId: "recovery-multi-lot-reserved-remainder"
      }
    ]
  });
}

function recoveryTransition(
  state: unknown,
  expectedVersion: number,
  lotId: string,
  amountMinor: number,
  version: number,
  remainderLotId: string
) {
  const shared = chargebackRecoveryAllocationFixture();
  const collectionId = `recovery-collection-${version}`;
  const collectedAt = `2026-08-${12 + version}T00:00:00Z`;
  return collectChargebackRecoveryPayableLots({
    state,
    expectedVersion,
    authority: createChargebackRecoveryCollectionAuthority({
      kind: "chargeback_recovery_collection",
      authorityId: `recovery-source-authority-${version}`,
      version: 1,
      recoveryCollectionId: collectionId,
      chargebackCaseId: shared.confirmedSource.chargebackCaseId,
      astrologerUserId: shared.confirmedSource.astrologerUserId,
      collectionSource: { kind: "future_payable", sourceOrderId: "order-receipt-recovery" },
      collectedPayableAmount: { amountMinor, currency: "RUB" },
      accountingAllocationId: `recovery-posting-accounting-allocation-${version}`,
      accountingAllocationVersion: 1,
      allocationStatus: "approved",
      canonicalEvidenceId: `recovery-evidence-${version}`,
      collectedAt
    }),
    requestedLots: [{ lotId, amountMinor }],
    operationId: `recovery-collected-operation-${version}`,
    sourceKey: { kind: "chargeback", sourceId: collectionId, operation: "recovery_collected" },
    occurredAt: collectedAt,
    outputLotIds: [{ sourceLotId: lotId, remainderLotId }]
  });
}

function postingInput(
  transition: ReturnType<typeof collectChargebackRecoveryPayableLots>,
  shared: ReturnType<typeof chargebackRecoveryAllocationFixture>,
  priorAuthority: PriorAuthority | null,
  priorCollected: number,
  latestOutcomeEvidence: ReturnType<typeof outcome> | null = null
) {
  const operationReceipt = createPayableLotOperationReceipt(transition);
  const componentBindings = bindings(operationReceipt);
  const sourceAuthority = transition.historyRecord.authority;
  if (sourceAuthority?.kind !== "chargeback_recovery_collection") {
    throw new Error("missing recovery source authority");
  }
  const postingVersion = priorAuthority === null ? 1 : priorAuthority.version + 1;
  const originalIndex = shared.allocationTransaction.entries.findIndex(
    (entry) => entry.account.code === "astrologer_recovery_receivable"
  );
  const originalEntry = shared.allocationTransaction.entries[originalIndex];
  if (!originalEntry || operationReceipt.effects.length % 2 !== 0) {
    throw new Error("missing recovery evidence");
  }
  const provider = shared.allocationAuthority.confirmedProviderEvidenceBinding;
  const recoveryPosition = shared.positionBinding.recoveryPositions.find(
    (position) => position.positionId === shared.recoveryAllocation.allocationId
  );
  if (!recoveryPosition) throw new Error("missing recovery principal position");
  const collectionRows = [];
  for (let index = 0; index < operationReceipt.effects.length; index += 2) {
    const debit = operationReceipt.effects[index];
    const credit = operationReceipt.effects[index + 1];
    const debitBinding = componentBindings[index];
    const creditBinding = componentBindings[index + 1];
    if (!debit || !credit || !debitBinding || !creditBinding) {
      throw new Error("missing recovery receipt pair");
    }
    collectionRows.push({
      exposureId: shared.recoveryAllocation.allocationId,
      amount: debit.amount,
      receiptPayableEffectId: debit.effectId,
      receiptPayableComponentId: debitBinding.componentId,
      receiptRecoveryEffectId: credit.effectId,
      receiptRecoveryComponentId: creditBinding.componentId
    });
  }
  collectionRows.sort((left, right) =>
    left.receiptPayableEffectId.localeCompare(right.receiptPayableEffectId)
  );
  const exposure = Object.freeze({
    exposureId: shared.recoveryAllocation.allocationId,
    originalComponentId: shared.recoveryAllocation.componentId,
    originalSaleId: shared.recoveryAllocation.originalSaleId,
    payableLotId: shared.recoveryAllocation.payableLotId,
    payoutAllocationId: shared.recoveryAllocation.payoutAllocationId,
    sourceCapacity: recoveryPosition.sourceCapacity,
    allocatedAmount: recoveryPosition.consumedAfter,
    priorCollectedAmount: { amountMinor: priorCollected, currency: "RUB" as const },
    collectionDelta: sourceAuthority.collectedPayableAmount,
    nextCollectedAmount: {
      amountMinor: priorCollected + sourceAuthority.collectedPayableAmount.amountMinor,
      currency: "RUB" as const
    }
  });
  const tranche = Object.freeze({
    exposureId: exposure.exposureId,
    allocationAuthorityId: shared.allocationAuthority.authorityId,
    allocationAuthorityVersion: shared.allocationAuthority.version,
    accountingAllocationRevisionId:
      shared.allocationAuthority.sourceAuthority.accountingAllocationRevisionId,
    positionTransitionBindingId: shared.positionBinding.bindingId,
    positionTransitionVersion: shared.positionBinding.nextPositionVersion,
    originalJournalEntry: {
      transactionId: shared.allocationTransaction.id,
      entryIndex: originalIndex,
      canonicalDigest: hashFinanceCommandPayload(originalEntry)
    },
    amount: shared.recoveryAllocation.amount
  });
  const core = {
    kind: "chargeback_recovery_posting_allocation" as const,
    schemaVersion: 1 as const,
    authorityId: sourceAuthority.recoveryCollectionId,
    version: postingVersion,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: sourceAuthority.chargebackCaseId,
    originalOrderId: shared.allocationAuthority.orderId,
    astrologerUserId: sourceAuthority.astrologerUserId,
    arcProviderAccountId: shared.allocationAuthority.arcProviderAccountId,
    providerPaymentId: provider.sourceAuthority.providerPaymentId,
    sourceAuthority,
    sourceAuthorityDigest: hashFinanceCommandPayload(sourceAuthority),
    latestProviderBindingRef: {
      kind: provider.kind,
      bindingId: provider.bindingId,
      version: provider.version,
      canonicalDigest: provider.bindingDigest
    },
    allocationRefs: [shared.allocationRef],
    priorAuthorityRef:
      priorAuthority === null
        ? null
        : {
            kind: "chargeback_recovery_posting_allocation" as const,
            authorityId: priorAuthority.authorityId,
            version: priorAuthority.version,
            canonicalDigest: priorAuthority.canonicalDigest
          },
    latestOutcomeEvidenceRef:
      latestOutcomeEvidence === null ? null : outcomeEvidenceRef(latestOutcomeEvidence),
    operationReceiptId: operationReceipt.receiptId,
    operationReceiptDigest: operationReceipt.canonicalDigest,
    componentBindingsDigest: hashFinanceCommandPayload(componentBindings),
    collectionTotal: sourceAuthority.collectedPayableAmount,
    exposures: [exposure],
    tranches: [tranche],
    collectionRows,
    collectedAt: sourceAuthority.collectedAt
  };
  const authority = Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
  return Object.freeze({
    context: {
      journalTransactionId: `journal-${sourceAuthority.recoveryCollectionId}`,
      linkProofId: `proof-${sourceAuthority.recoveryCollectionId}`,
      operationId: operationReceipt.operationId,
      sourceKey: operationReceipt.sourceKey,
      occurredAt: operationReceipt.occurredAt,
      postedAt: operationReceipt.occurredAt
    },
    authority,
    resolvedPriorAuthorities: priorAuthority === null ? [] : [priorAuthority],
    resolvedAllocationAuthorities: [shared.allocationAuthority],
    resolvedPrincipalPositionTransitionBindings: [shared.positionBinding],
    originalAllocationJournals: [shared.allocationTransaction],
    latestOutcomeEvidence,
    operationReceipt,
    componentBindings,
    operationSnapshotRef: {
      snapshotId: `snapshot-${sourceAuthority.recoveryCollectionId}`,
      operationId: operationReceipt.operationId,
      sourceKey: operationReceipt.sourceKey,
      previousWalletRevision: String(50 + postingVersion - 1),
      nextWalletRevision: String(50 + postingVersion),
      previousLotStateDigest: operationReceipt.previousLotState.digest,
      nextLotStateDigest: operationReceipt.nextLotState.digest,
      historyRecordDigest: operationReceipt.historyRecord.canonicalDigest,
      snapshotDigest: sha(postingVersion === 1 ? "7" : "8")
    }
  });
}

export function withWonRecoveryOutcome(
  input: ReturnType<typeof chargebackRecoveryPostingFixtures>["afterLost"]
) {
  const source = createChargebackWonAuthority({
    kind: "chargeback_won",
    authorityId: "recovery-won-source-authority",
    version: 1,
    chargebackCaseId: input.authority.chargebackCaseId,
    restoredPayableAmount: { amountMinor: 0, currency: "RUB" },
    suspenseClearedAmount: { amountMinor: 4_500, currency: "RUB" },
    accountingAllocationId: "recovery-won-accounting-allocation",
    accountingAllocationVersion: 1,
    allocationStatus: "approved",
    canonicalEvidenceId: "recovery-won-evidence",
    wonAt: "2026-08-12T00:00:00Z"
  });
  const evidence = outcome(source, "won");
  return Object.freeze({
    ...input,
    authority: rehashRecoveryAuthority({
      ...input.authority,
      latestOutcomeEvidenceRef: outcomeEvidenceRef(evidence)
    }),
    latestOutcomeEvidence: evidence
  });
}

function outcome(
  source:
    | ReturnType<typeof createChargebackLostAuthority>
    | ReturnType<typeof createChargebackWonAuthority>,
  result: "lost" | "won"
) {
  const core = {
    kind: "unverified_chargeback_outcome_evidence_binding" as const,
    schemaVersion: 1 as const,
    evidenceId: source.canonicalEvidenceId,
    version: source.version,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    auditSource: "internal_case_review" as const,
    outcome: result,
    chargebackCaseId: source.chargebackCaseId,
    sourceAuthority: source,
    sourceAuthorityDigest: hashFinanceCommandPayload(source),
    auditedByActorUserId: "finance-auditor-1",
    decidedAt: source.kind === "chargeback_lost" ? source.lostAt : source.wonAt
  };
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}

function bindings(receipt: ReturnType<typeof createPayableLotOperationReceipt>) {
  return receipt.requiredExternalLinkSlots.map((slot, index) => {
    const core = {
      kind: "finance_component_slot_resolution_binding" as const,
      bindingId: `binding-${slot.slotId}`,
      version: "1",
      authorizationStatus: "unverified" as const,
      digestPurpose: "drift_detection_only" as const,
      operationReceiptId: receipt.receiptId,
      operationReceiptDigest: receipt.canonicalDigest,
      slotId: slot.slotId,
      effectId: slot.effectId,
      componentId: index === 0 ? "component-future-payable" : "component-recovery-collection",
      requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
    };
    return { ...core, bindingDigest: hashFinanceCommandPayload(core) };
  });
}

export function rehashRecoveryAuthority<T extends Record<string, unknown>>(input: T) {
  const core = { ...input };
  delete core.canonicalDigest;
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) }) as Readonly<
    T & { canonicalDigest: `sha256:${string}` }
  >;
}
