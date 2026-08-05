import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { readFinancePostingJournalTransaction } from "./journal-posting-codec";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import type { ChargebackLostAllocationClosureAuthority } from "./chargeback-lost-closure-types";
import { readChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation";
import { assertChargebackPrincipalPostingPriorAuthorityResolved } from "./chargeback-posting-prior-allocation";
import { readChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-authority";
import { assertChargebackRecoveryAllocationHistory } from "./chargeback-recovery-posting-proof";
import {
  assertChargebackRecoveryHistoryFresh,
  assertChargebackRecoveryPriorAuthority
} from "./chargeback-recovery-prior-history";
import type {
  ChargebackRecoveryPostingAllocationAuthority,
  ChargebackResolvedAllocationRef
} from "./chargeback-recovery-posting-types";
import { assertChargebackResolutionAllocationJournal } from "./chargeback-resolution-allocation-journal";
import { assertChargebackResolutionRecoveryJournal } from "./chargeback-resolution-recovery-journal";
import { readChargebackResolutionPositionHistory } from "./chargeback-resolution-position-history";
import { readChargebackResolutionProviderHistory } from "./chargeback-resolution-provider-history";
import type {
  ChargebackResolutionHistory,
  ChargebackResolutionRecoveryRef,
  ChargebackWonResolutionPostingAuthority,
  ChargebackLostResolutionPostingAuthority
} from "./chargeback-resolution-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

type Target =
  | ChargebackWonResolutionPostingAuthority
  | ChargebackLostResolutionPostingAuthority
  | ChargebackLostAllocationClosureAuthority;

export function readChargebackResolutionHistory(
  target: Target,
  providerHistoryInput: unknown,
  allocationInputs: unknown,
  positionInputs: unknown,
  allocationJournalInputs: unknown,
  recoveryRefs: readonly ChargebackResolutionRecoveryRef[],
  recoveryInputs: unknown,
  recoveryJournalInputs: unknown,
  envelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
): ChargebackResolutionHistory {
  const allocations = readExactDataArray(allocationInputs, 1, envelope.maxAllocations).map(
    (value) => readChargebackPrincipalPostingAllocationAuthority(value, envelope)
  );
  const allocationJournals = readExactDataArray(
    allocationJournalInputs,
    1,
    envelope.maxAllocations
  ).map((value) => readFinancePostingJournalTransaction(value, envelope));
  const principalPositions = readChargebackResolutionPositionHistory(
    allocations,
    positionInputs,
    envelope
  );
  if (
    allocations.length !== target.allocationRefs.length ||
    allocationJournals.length !== target.allocationRefs.length
  )
    mismatch("authority_mismatch");
  allocations.forEach((allocation, index) => {
    const reference = target.allocationRefs[index];
    const journal = allocationJournals[index];
    if (!reference || !journal) mismatch("authority_mismatch");
    assertAllocationReference(reference, allocation, journal);
    assertScope(target, allocation);
    assertChargebackPrincipalPostingPriorAuthorityResolved(
      allocation,
      index === 0 ? null : (allocations[index - 1] ?? null)
    );
    assertChargebackResolutionAllocationJournal(allocation, journal);
    if (compareFinancePostingInstants(target.decidedAt, allocation.approvedAt) < 0) {
      mismatch("invalid_chronology");
    }
  });
  const latestAllocation = allocations.at(-1);
  if (!latestAllocation) mismatch("authority_mismatch");
  const providerHistory = readChargebackResolutionProviderHistory(
    target,
    latestAllocation,
    providerHistoryInput,
    envelope,
    receiptEnvelope
  );
  const recoveryAuthorities = readExactDataArray(recoveryInputs, 0, envelope.maxAllocations).map(
    (value) => readChargebackRecoveryPostingAllocationAuthority(value, envelope)
  );
  const recoveryJournals = readExactDataArray(
    recoveryJournalInputs,
    0,
    envelope.maxAllocations
  ).map((value) => readFinancePostingJournalTransaction(value, envelope));
  if (
    recoveryAuthorities.length !== recoveryRefs.length ||
    recoveryJournals.length !== recoveryRefs.length
  )
    mismatch("authority_mismatch");
  assertChargebackRecoveryHistoryFresh(recoveryAuthorities);
  assertUniqueChargebackRecoveryJournalSources(recoveryJournals);
  recoveryAuthorities.forEach((authority, index) => {
    const reference = recoveryRefs[index];
    const journal = recoveryJournals[index];
    if (!reference || !journal) mismatch("authority_mismatch");
    assertRecoveryReference(reference, authority, journal);
    const allocationPrefixLength = assertRecoveryScope(target, authority, allocations);
    assertChargebackRecoveryPriorAuthority(
      authority,
      index === 0 ? null : (recoveryAuthorities[index - 1] ?? null)
    );
    assertChargebackRecoveryAllocationHistory(
      authority,
      allocations.slice(0, allocationPrefixLength),
      principalPositions.slice(0, allocationPrefixLength),
      allocationJournals.slice(0, allocationPrefixLength),
      envelope
    );
    assertChargebackResolutionRecoveryJournal(authority, journal);
    if (
      target.kind === "chargeback_won_resolution_posting" &&
      authority.latestOutcomeEvidenceRef !== null
    )
      mismatch("authority_mismatch");
    if (compareFinancePostingInstants(target.decidedAt, authority.collectedAt) < 0) {
      mismatch("invalid_chronology");
    }
  });
  return Object.freeze({
    allocations: Object.freeze(allocations),
    principalPositions,
    allocationJournals: Object.freeze(allocationJournals),
    latestAllocation,
    providerEvidenceBindings: providerHistory.bindings,
    latestProviderEvidenceBinding: providerHistory.latest,
    recoveryAuthorities: Object.freeze(recoveryAuthorities),
    recoveryJournals: Object.freeze(recoveryJournals),
    recoveredByExposure: recoveredAmounts(recoveryAuthorities.at(-1) ?? null)
  });
}

function assertAllocationReference(
  reference: ChargebackResolvedAllocationRef,
  allocation: ReturnType<typeof readChargebackPrincipalPostingAllocationAuthority>,
  journal: ReturnType<typeof readFinancePostingJournalTransaction>
) {
  if (
    reference.authorityId !== allocation.authorityId ||
    reference.accountingAllocationId !== allocation.sourceAuthority.accountingAllocationId ||
    reference.version !== allocation.version ||
    reference.canonicalDigest !== allocation.canonicalDigest ||
    reference.journalTransactionId !== journal.id ||
    reference.journalDigest !== hashFinanceCommandPayload(journal) ||
    !sameCanonicalFinancePostingValue(
      reference.nextAllocatedPrincipal,
      allocation.nextAllocatedPrincipal
    )
  ) {
    mismatch("proof_transaction_mismatch");
  }
}

function assertRecoveryReference(
  reference: ChargebackResolutionRecoveryRef,
  authority: ChargebackRecoveryPostingAllocationAuthority,
  journal: ReturnType<typeof readFinancePostingJournalTransaction>
) {
  if (
    reference.authorityId !== authority.authorityId ||
    reference.version !== authority.version ||
    reference.canonicalDigest !== authority.canonicalDigest ||
    reference.journalTransactionId !== journal.id ||
    reference.journalDigest !== hashFinanceCommandPayload(journal)
  ) {
    mismatch("proof_transaction_mismatch");
  }
}

function assertScope(
  target: Target,
  allocation: ReturnType<typeof readChargebackPrincipalPostingAllocationAuthority>
) {
  if (
    allocation.chargebackCaseId !== target.chargebackCaseId ||
    allocation.orderId !== target.originalOrderId ||
    allocation.astrologerUserId !== target.astrologerUserId ||
    allocation.arcProviderAccountId !== target.arcProviderAccountId
  )
    mismatch("scope_mismatch");
}

function assertRecoveryScope(
  target: Target,
  authority: ChargebackRecoveryPostingAllocationAuthority,
  allocations: readonly ReturnType<typeof readChargebackPrincipalPostingAllocationAuthority>[]
): number {
  const prefixLength = authority.allocationRefs.length;
  if (
    authority.chargebackCaseId !== target.chargebackCaseId ||
    authority.originalOrderId !== target.originalOrderId ||
    authority.astrologerUserId !== target.astrologerUserId ||
    authority.arcProviderAccountId !== target.arcProviderAccountId ||
    authority.providerPaymentId !== target.providerPaymentId ||
    prefixLength === 0 ||
    prefixLength > target.allocationRefs.length ||
    authority.allocationRefs.some(
      (reference, index) =>
        !sameCanonicalFinancePostingValue(reference, target.allocationRefs[index])
    )
  )
    mismatch("scope_mismatch");
  const nextAllocation = allocations[prefixLength];
  if (
    nextAllocation &&
    compareFinancePostingInstants(authority.collectedAt, nextAllocation.approvedAt) >= 0
  ) {
    mismatch("invalid_chronology");
  }
  return prefixLength;
}

function recoveredAmounts(latest: ChargebackRecoveryPostingAllocationAuthority | null) {
  return new Map(
    (latest?.exposures ?? []).map(
      (row) => [row.exposureId, row.nextCollectedAmount.amountMinor] as const
    )
  );
}

export function assertUniqueChargebackRecoveryJournalSources(
  journals: readonly ReturnType<typeof readFinancePostingJournalTransaction>[]
): void {
  const sources = journals.map(
    (journal) =>
      `${journal.sourceKey.kind}\u0000${journal.sourceKey.sourceId}\u0000${journal.sourceKey.operation}`
  );
  if (new Set(sources).size !== sources.length) mismatch("proof_transaction_mismatch");
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
