import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createFinanceJournalTransaction } from "../journal";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import {
  createChargebackLostAuthority,
  createChargebackPrincipalAllocationAuthority,
  recordChargebackLostRestrictionOutcome
} from "../source-lots";
import { readChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation";
import { rehashChargebackAllocation } from "./chargeback-allocation-posting-test-fixtures";
import { readUnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position";
import { rehashChargebackPrincipalPosition } from "./chargeback-principal-position-test-fixtures";
import { chargebackResolutionRevisionHistoryFixture } from "./chargeback-resolution-revision-test-fixture";
import { chargebackLostResolutionFixture } from "./chargeback-resolution-posting-test-fixtures";
import { rehashResolutionAuthority } from "./chargeback-resolution-test-primitives";
import { postingDecoderEnvelope } from "./posting-test-primitives";

export function chargebackLostAllocationClosureFixture() {
  const prior = chargebackLostResolutionFixture();
  const allocation = fullAllocationRevisionFixture();
  const receiptCase = buildReceiptTransitionCases().find(
    (candidate) => candidate.kind === "chargeback_won_reserved"
  );
  if (!receiptCase) throw new Error("missing chargeback restriction state");
  const firstTransition = recordChargebackLostRestrictionOutcome({
    state: receiptCase.previousState,
    expectedVersion: receiptCase.previousState.version,
    authority: prior.authority.sourceAuthority,
    operationId: "chargeback-resolution-lost-operation-blocked",
    operationKey: {
      kind: "chargeback_restriction",
      restrictionId:
        allocation.first.allocationAuthority.confirmedProviderEvidenceBinding.sourceAuthority
          .restrictionId,
      operation: "lost_final"
    },
    occurredAt: prior.authority.sourceAuthority.lostAt
  });
  const sourceAuthority = createChargebackLostAuthority({
    ...prior.authority.sourceAuthority,
    authorityId: "chargeback-resolution-lost-closure-source",
    version: 2,
    unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
    accountingAllocationId: "chargeback-resolution-lost-closure-accounting",
    accountingAllocationVersion: 2,
    canonicalEvidenceId: "chargeback-resolution-lost-closure-evidence",
    lostAt: "2026-08-13T00:00:00Z"
  });
  const restrictionTransition = recordChargebackLostRestrictionOutcome({
    state: firstTransition.state,
    expectedVersion: firstTransition.nextVersion,
    authority: sourceAuthority,
    operationId: "chargeback-resolution-lost-allocation-closed",
    operationKey: {
      kind: "chargeback_restriction",
      restrictionId: firstTransition.operationKey.restrictionId,
      operation: "lost_allocation_closed"
    },
    occurredAt: sourceAuthority.lostAt
  });
  const transitionRef = restrictionTransitionRef(restrictionTransition, sourceAuthority);
  const authorityCore = {
    kind: "chargeback_lost_allocation_closure_no_posting" as const,
    schemaVersion: 1 as const,
    authorityId: sourceAuthority.authorityId,
    version: sourceAuthority.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: prior.authority.chargebackCaseId,
    originalOrderId: prior.authority.originalOrderId,
    astrologerUserId: prior.authority.astrologerUserId,
    arcProviderAccountId: prior.authority.arcProviderAccountId,
    providerPaymentId: prior.authority.providerPaymentId,
    sourceAuthority,
    sourceAuthorityDigest: hashFinanceCommandPayload(sourceAuthority),
    initialLostOutcomeRef: prior.authority.outcomeEvidenceRef,
    priorLostResolutionRef: {
      kind: prior.authority.kind,
      authorityId: prior.authority.authorityId,
      version: prior.authority.version,
      canonicalDigest: prior.authority.canonicalDigest
    },
    restrictionTransitionRef: transitionRef,
    latestProviderBindingRef: prior.authority.latestProviderBindingRef,
    allocationRefs: [
      allocation.first.allocationRef,
      allocation.second.allocationRef,
      allocation.allocationRef
    ],
    recoveryRefs: [],
    disputedPrincipal: { amountMinor: 5_000, currency: "RUB" as const },
    unallocatedSuspense: { amountMinor: 0, currency: "RUB" as const },
    decidedAt: sourceAuthority.lostAt
  };
  const authority = Object.freeze({
    ...authorityCore,
    canonicalDigest: hashFinanceCommandPayload(authorityCore)
  });
  return Object.freeze({
    authority,
    resolvedPriorLostResolutionAuthority: prior.authority,
    initialLostOutcomeEvidence: prior.outcomeEvidence,
    restrictionTransition,
    resolvedProviderConfirmationChain: prior.resolvedProviderConfirmationChain,
    resolvedAllocationAuthorities: [
      allocation.first.allocationAuthority,
      allocation.second.allocationAuthority,
      allocation.allocationAuthority
    ],
    resolvedPrincipalPositionTransitionBindings: [
      allocation.first.principalPositionTransitionBinding,
      allocation.second.position,
      allocation.position
    ],
    allocationJournals: [
      allocation.first.allocationTransaction,
      allocation.second.allocationTransaction,
      allocation.allocationTransaction
    ],
    resolvedRecoveryAuthorities: [],
    recoveryJournals: []
  });
}

function fullAllocationRevisionFixture() {
  const second = chargebackResolutionRevisionHistoryFixture("2026-08-11T00:00:00Z");
  const prior = second.position;
  const sourceAuthority = createChargebackPrincipalAllocationAuthority({
    ...second.allocationAuthority.sourceAuthority,
    authorityId: "chargeback-resolution-allocation-source-3",
    version: 3,
    payableAmount: { amountMinor: 0, currency: "RUB" },
    accountingAllocationRevisionId: "chargeback-resolution-allocation-revision-3",
    accountingAllocationVersion: 3
  });
  const approvedAt = "2026-08-12T00:00:00Z";
  const positionId = "platform:residual-loss";
  const decisionCore = Object.freeze({
    kind: "unverified_chargeback_treatment_decision" as const,
    schemaVersion: 1 as const,
    decisionId: "chargeback-resolution-residual-loss-decision",
    version: 1,
    approvalStatus: "approved" as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: second.allocationAuthority.chargebackCaseId,
    orderId: second.allocationAuthority.orderId,
    astrologerUserId: second.allocationAuthority.astrologerUserId,
    positionId,
    treatment: "platform_loss" as const,
    approvedAmount: { amountMinor: 1_200, currency: "RUB" as const },
    policyId: "chargeback-resolution-residual-loss-policy",
    policyVersion: 1,
    proposedByActorUserId: "finance-maker-resolution",
    approvedByActorUserId: "finance-checker-resolution",
    approvedAt
  });
  const treatmentDecision = Object.freeze({
    ...decisionCore,
    canonicalDigest: hashFinanceCommandPayload(decisionCore)
  });
  const platformAllocation = Object.freeze({
    kind: "platform_component" as const,
    allocationId: positionId,
    componentId: "component-platform-residual-loss",
    originalSaleId: second.allocationAuthority.orderId,
    accountCode: "platform_chargeback_loss" as const,
    amount: treatmentDecision.approvedAmount,
    originalJournalEntry: null,
    treatmentAuthorityRef: Object.freeze({
      kind: "chargeback_platform_loss_treatment" as const,
      authorityId: treatmentDecision.decisionId,
      version: treatmentDecision.version,
      canonicalDigest: treatmentDecision.canonicalDigest
    })
  });
  const position = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    rehashChargebackPrincipalPosition({
      ...prior,
      bindingId: "chargeback-resolution-position-transition-3",
      expectedPositionVersion: prior.nextPositionVersion,
      nextPositionVersion: "3",
      previousBindingRef: {
        bindingId: prior.bindingId,
        nextPositionVersion: prior.nextPositionVersion,
        bindingDigest: prior.bindingDigest
      },
      accountingAllocationRevisionId: sourceAuthority.accountingAllocationRevisionId,
      accountingAllocationVersion: sourceAuthority.accountingAllocationVersion,
      caseExposure: {
        disputedPrincipal: second.allocationAuthority.disputedPrincipal,
        allocatedBefore: second.allocationAuthority.nextAllocatedPrincipal,
        payableDelta: { amountMinor: 0, currency: "RUB" },
        recoveryDelta: { amountMinor: 0, currency: "RUB" },
        platformDelta: platformAllocation.amount,
        allocationDelta: platformAllocation.amount,
        allocatedAfter: { amountMinor: 5_000, currency: "RUB" },
        unallocatedAfter: { amountMinor: 0, currency: "RUB" }
      },
      recoveryPositions: prior.recoveryPositions.map((row) => ({
        ...row,
        consumedBefore: row.consumedAfter,
        currentDelta: { amountMinor: 0, currency: "RUB" },
        consumedAfter: row.consumedAfter,
        remainingAfter: row.remainingAfter
      })),
      platformPositions: [
        ...prior.platformPositions.map((row) =>
          row.kind === "platform_commission_reversal"
            ? {
                ...row,
                deferredRemainingBefore: row.deferredRemainingAfter,
                revenueRemainingBefore: row.revenueRemainingAfter,
                reversedBefore: row.reversedAfter,
                currentDelta: { amountMinor: 0, currency: "RUB" as const }
              }
            : {
                ...row,
                consumedBefore: row.consumedAfter,
                currentDelta: { amountMinor: 0, currency: "RUB" as const }
              }
        ),
        {
          kind: "platform_loss" as const,
          positionId,
          originalSaleId: platformAllocation.originalSaleId,
          componentId: platformAllocation.componentId,
          sourceCapacity: platformAllocation.amount,
          consumedBefore: { amountMinor: 0, currency: "RUB" as const },
          currentDelta: platformAllocation.amount,
          consumedAfter: platformAllocation.amount,
          remainingAfter: { amountMinor: 0, currency: "RUB" as const },
          treatmentDecision
        }
      ],
      observedAt: approvedAt
    }),
    postingDecoderEnvelope
  );
  const allocationAuthority = readChargebackPrincipalPostingAllocationAuthority(
    rehashChargebackAllocation({
      ...second.allocationAuthority,
      authorityId: sourceAuthority.accountingAllocationRevisionId,
      version: sourceAuthority.accountingAllocationVersion,
      sourceAuthority,
      priorAllocationAuthorityRef: {
        kind: second.allocationAuthority.kind,
        authorityId: second.allocationAuthority.authorityId,
        accountingAllocationId: sourceAuthority.accountingAllocationId,
        version: second.allocationAuthority.version,
        nextAllocatedPrincipal: second.allocationAuthority.nextAllocatedPrincipal,
        canonicalDigest: second.allocationAuthority.canonicalDigest
      },
      positionTransitionRef: {
        kind: position.kind,
        bindingId: position.bindingId,
        nextPositionVersion: position.nextPositionVersion,
        bindingDigest: position.bindingDigest
      },
      payablePrincipal: { amountMinor: 0, currency: "RUB" },
      recoveryPrincipal: { amountMinor: 0, currency: "RUB" },
      platformPrincipal: platformAllocation.amount,
      principalAllocationDelta: platformAllocation.amount,
      nextAllocatedPrincipal: { amountMinor: 5_000, currency: "RUB" },
      unallocatedSuspense: { amountMinor: 0, currency: "RUB" },
      recoveryAllocations: [],
      platformAllocations: [platformAllocation],
      approvedAt
    }),
    postingDecoderEnvelope
  );
  const allocationTransaction = createFinanceJournalTransaction({
    id: "journal-chargeback-resolution-allocation-3",
    sourceKey: {
      kind: "chargeback",
      sourceId: sourceAuthority.accountingAllocationRevisionId,
      operation: "principal_allocated"
    },
    occurredAt: approvedAt,
    postedAt: approvedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: { code: "platform_chargeback_loss", currency: "RUB" },
        side: "debit",
        amount: platformAllocation.amount,
        links: {
          originalSaleId: platformAllocation.originalSaleId,
          componentId: platformAllocation.componentId,
          payableLotId: null,
          payoutAllocationId: null
        }
      },
      {
        account: {
          code: "chargeback_principal_suspense",
          arcProviderAccountId: allocationAuthority.arcProviderAccountId,
          currency: "RUB"
        },
        side: "credit",
        amount: platformAllocation.amount,
        links: {
          originalSaleId: allocationAuthority.orderId,
          componentId: allocationAuthority.confirmedProviderEvidenceBinding.principalComponentId,
          payableLotId: null,
          payoutAllocationId: null
        }
      }
    ]
  });
  const allocationRef = Object.freeze({
    kind: allocationAuthority.kind,
    authorityId: allocationAuthority.authorityId,
    accountingAllocationId: sourceAuthority.accountingAllocationId,
    version: allocationAuthority.version,
    nextAllocatedPrincipal: allocationAuthority.nextAllocatedPrincipal,
    canonicalDigest: allocationAuthority.canonicalDigest,
    journalTransactionId: allocationTransaction.id,
    journalDigest: hashFinanceCommandPayload(allocationTransaction)
  });
  return Object.freeze({
    first: second.first,
    second,
    allocationAuthority,
    allocationTransaction,
    allocationRef,
    position
  });
}

function restrictionTransitionRef(
  transition: ReturnType<typeof recordChargebackLostRestrictionOutcome>,
  sourceAuthority: ReturnType<typeof createChargebackLostAuthority>
) {
  const core = Object.freeze({
    kind: "chargeback_lost_allocation_closure_transition" as const,
    operationId: transition.operationId,
    restrictionId: transition.operationKey.restrictionId,
    previousVersion: transition.previousVersion,
    nextVersion: transition.nextVersion,
    previousStateDigest: transition.previousStateDigest,
    nextStateDigest: transition.nextStateDigest,
    sourceAuthorityDigest: hashFinanceCommandPayload(sourceAuthority),
    occurredAt: transition.record.occurredAt
  });
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}

export function rehashLostClosureAuthority<T extends Record<string, unknown>>(input: T) {
  return rehashResolutionAuthority(input);
}
