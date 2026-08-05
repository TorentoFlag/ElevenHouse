import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createFinanceJournalTransaction } from "../journal";
import { createChargebackPrincipalAllocationAuthority } from "../source-lots";
import { readChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation";
import { rehashChargebackAllocation } from "./chargeback-allocation-posting-test-fixtures";
import { chargebackResolutionAllocationFixture } from "./chargeback-resolution-allocation-test-fixture";
import { chargebackResolutionRecoveryPostingInputFixture } from "./chargeback-resolution-posting-test-fixtures";
import { readUnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position";
import { rehashChargebackPrincipalPosition } from "./chargeback-principal-position-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

export function chargebackResolutionRevisionHistoryFixture(approvedAt = "2026-08-04T02:00:00Z") {
  const first = chargebackResolutionAllocationFixture();
  const priorPosition = first.principalPositionTransitionBinding;
  const priorRecovery = priorPosition.recoveryPositions[0];
  const priorPlatform = priorPosition.platformPositions[0];
  const recoveryAllocation = first.allocationAuthority.recoveryAllocations[0];
  const platformAllocation = first.allocationAuthority.platformAllocations[0];
  if (!priorRecovery || !priorPlatform || !recoveryAllocation || !platformAllocation) {
    throw new Error("missing cumulative position fixture");
  }
  if (priorPlatform.kind !== "platform_commission_reversal") {
    throw new Error("missing commission position fixture");
  }
  const source = createChargebackPrincipalAllocationAuthority({
    ...first.allocationAuthority.sourceAuthority,
    authorityId: "chargeback-resolution-revision-source-2",
    version: 2,
    payableAmount: { amountMinor: 0, currency: "RUB" },
    accountingAllocationRevisionId: "chargeback-resolution-allocation-revision-2",
    accountingAllocationVersion: 2
  });
  const position = readUnverifiedChargebackPrincipalPositionTransitionBinding(
    rehashChargebackPrincipalPosition({
      ...priorPosition,
      bindingId: "chargeback-resolution-position-transition-2",
      expectedPositionVersion: priorPosition.nextPositionVersion,
      nextPositionVersion: "2",
      previousBindingRef: {
        bindingId: priorPosition.bindingId,
        nextPositionVersion: priorPosition.nextPositionVersion,
        bindingDigest: priorPosition.bindingDigest
      },
      accountingAllocationRevisionId: source.accountingAllocationRevisionId,
      accountingAllocationVersion: source.accountingAllocationVersion,
      caseExposure: {
        disputedPrincipal: first.allocationAuthority.disputedPrincipal,
        allocatedBefore: first.allocationAuthority.nextAllocatedPrincipal,
        payableDelta: source.payableAmount,
        recoveryDelta: { amountMinor: 300, currency: "RUB" },
        platformDelta: { amountMinor: 500, currency: "RUB" },
        allocationDelta: { amountMinor: 800, currency: "RUB" },
        allocatedAfter: { amountMinor: 3_800, currency: "RUB" },
        unallocatedAfter: { amountMinor: 1_200, currency: "RUB" }
      },
      recoveryPositions: [
        {
          ...priorRecovery,
          consumedBefore: priorRecovery.consumedAfter,
          currentDelta: { amountMinor: 300, currency: "RUB" },
          consumedAfter: priorRecovery.sourceCapacity,
          remainingAfter: { amountMinor: 0, currency: "RUB" }
        }
      ],
      platformPositions: [
        {
          ...priorPlatform,
          deferredRemainingBefore: priorPlatform.deferredRemainingAfter,
          revenueRemainingBefore: priorPlatform.revenueRemainingAfter,
          reversedBefore: priorPlatform.reversedAfter,
          currentDelta: { amountMinor: 500, currency: "RUB" },
          deferredRemainingAfter: priorPlatform.deferredRemainingAfter,
          revenueRemainingAfter: { amountMinor: 0, currency: "RUB" },
          reversedAfter: priorPlatform.originalCommissionAmount
        }
      ],
      observedAt: approvedAt
    }),
    postingDecoderEnvelope
  );
  const nextRecovery = Object.freeze({
    ...recoveryAllocation,
    amount: { amountMinor: 300, currency: "RUB" as const }
  });
  const nextPlatform = Object.freeze({
    ...platformAllocation,
    amount: { amountMinor: 500, currency: "RUB" as const }
  });
  const allocationAuthority = readChargebackPrincipalPostingAllocationAuthority(
    rehashChargebackAllocation({
      ...first.allocationAuthority,
      authorityId: source.accountingAllocationRevisionId,
      version: source.accountingAllocationVersion,
      sourceAuthority: source,
      priorAllocationAuthorityRef: {
        kind: "chargeback_principal_posting_allocation",
        authorityId: first.allocationAuthority.authorityId,
        accountingAllocationId: source.accountingAllocationId,
        version: first.allocationAuthority.version,
        nextAllocatedPrincipal: first.allocationAuthority.nextAllocatedPrincipal,
        canonicalDigest: first.allocationAuthority.canonicalDigest
      },
      positionTransitionRef: {
        kind: position.kind,
        bindingId: position.bindingId,
        nextPositionVersion: position.nextPositionVersion,
        bindingDigest: position.bindingDigest
      },
      payablePrincipal: source.payableAmount,
      recoveryPrincipal: nextRecovery.amount,
      platformPrincipal: nextPlatform.amount,
      principalAllocationDelta: { amountMinor: 800, currency: "RUB" },
      nextAllocatedPrincipal: { amountMinor: 3_800, currency: "RUB" },
      unallocatedSuspense: { amountMinor: 1_200, currency: "RUB" },
      recoveryAllocations: [nextRecovery],
      platformAllocations: [nextPlatform],
      approvedAt
    }),
    postingDecoderEnvelope
  );
  const allocationTransaction = createFinanceJournalTransaction({
    id: "journal-chargeback-resolution-allocation-2",
    sourceKey: {
      kind: "chargeback",
      sourceId: source.accountingAllocationRevisionId,
      operation: "principal_allocated"
    },
    occurredAt: approvedAt,
    postedAt: approvedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: {
          code: "astrologer_recovery_receivable",
          astrologerUserId: allocationAuthority.astrologerUserId,
          currency: "RUB"
        },
        side: "debit",
        amount: nextRecovery.amount,
        links: recoveryLinks(nextRecovery)
      },
      {
        account: { code: nextPlatform.accountCode, currency: "RUB" },
        side: "debit",
        amount: nextPlatform.amount,
        links: platformLinks(nextPlatform)
      },
      {
        account: {
          code: "chargeback_principal_suspense",
          arcProviderAccountId: allocationAuthority.arcProviderAccountId,
          currency: "RUB"
        },
        side: "credit",
        amount: allocationAuthority.principalAllocationDelta,
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
    kind: "chargeback_principal_posting_allocation" as const,
    authorityId: allocationAuthority.authorityId,
    accountingAllocationId: source.accountingAllocationId,
    version: allocationAuthority.version,
    nextAllocatedPrincipal: allocationAuthority.nextAllocatedPrincipal,
    canonicalDigest: allocationAuthority.canonicalDigest,
    journalTransactionId: allocationTransaction.id,
    journalDigest: hashFinanceCommandPayload(allocationTransaction)
  });
  return Object.freeze({
    first,
    allocationAuthority,
    allocationTransaction,
    allocationRef,
    position
  });
}

export function chargebackRecoveryRevisionPostingFixture() {
  const revision = chargebackResolutionRevisionHistoryFixture();
  const base = chargebackResolutionRecoveryPostingInputFixture();
  if (
    base.resolvedAllocationAuthorities[0]?.canonicalDigest !==
    revision.first.allocationAuthority.canonicalDigest
  ) {
    throw new Error("mismatched cumulative recovery base");
  }
  const recoveryEntryIndex = revision.allocationTransaction.entries.findIndex(
    (entry) => entry.account.code === "astrologer_recovery_receivable"
  );
  const recoveryEntry = revision.allocationTransaction.entries[recoveryEntryIndex];
  const recoveryPosition = revision.position.recoveryPositions[0];
  const exposure = base.authority.exposures[0];
  if (!recoveryEntry || !recoveryPosition || !exposure) {
    throw new Error("missing cumulative recovery tranche");
  }
  const secondTranche = Object.freeze({
    exposureId: recoveryPosition.positionId,
    allocationAuthorityId: revision.allocationAuthority.authorityId,
    allocationAuthorityVersion: revision.allocationAuthority.version,
    accountingAllocationRevisionId:
      revision.allocationAuthority.sourceAuthority.accountingAllocationRevisionId,
    positionTransitionBindingId: revision.position.bindingId,
    positionTransitionVersion: revision.position.nextPositionVersion,
    originalJournalEntry: {
      transactionId: revision.allocationTransaction.id,
      entryIndex: recoveryEntryIndex,
      canonicalDigest: hashFinanceCommandPayload(recoveryEntry)
    },
    amount: revision.allocationAuthority.recoveryPrincipal
  });
  const authorityCore = {
    ...base.authority,
    allocationRefs: [revision.first.allocationRef, revision.allocationRef],
    exposures: [
      {
        ...exposure,
        sourceCapacity: recoveryPosition.sourceCapacity,
        allocatedAmount: recoveryPosition.consumedAfter
      }
    ],
    tranches: [...base.authority.tranches, secondTranche]
  };
  Reflect.deleteProperty(authorityCore, "canonicalDigest");
  const authority = Object.freeze({
    ...authorityCore,
    canonicalDigest: hashFinanceCommandPayload(authorityCore)
  });
  return Object.freeze({
    ...base,
    authority,
    resolvedAllocationAuthorities: [
      revision.first.allocationAuthority,
      revision.allocationAuthority
    ],
    resolvedPrincipalPositionTransitionBindings: [
      revision.first.principalPositionTransitionBinding,
      revision.position
    ],
    originalAllocationJournals: [
      revision.first.allocationTransaction,
      revision.allocationTransaction
    ]
  });
}

const recoveryLinks = (row: {
  originalSaleId: string;
  componentId: string;
  payableLotId: string;
  payoutAllocationId: string;
}) => ({
  originalSaleId: row.originalSaleId,
  componentId: row.componentId,
  payableLotId: row.payableLotId,
  payoutAllocationId: row.payoutAllocationId
});
const platformLinks = (row: { originalSaleId: string; componentId: string }) => ({
  originalSaleId: row.originalSaleId,
  componentId: row.componentId,
  payableLotId: null,
  payoutAllocationId: null
});
