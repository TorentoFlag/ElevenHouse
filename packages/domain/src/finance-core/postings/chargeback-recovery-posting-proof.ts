import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { FinanceJournalTransaction } from "../journal";
import { readFinancePostingJournalTransaction } from "./journal-posting-codec";
import { readChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation";
import { assertChargebackPrincipalPostingPriorAuthorityResolved } from "./chargeback-posting-prior-allocation";
import type { ChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-types";
import { readChargebackResolutionPositionHistory } from "./chargeback-resolution-position-history";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export function assertChargebackRecoveryAllocationHistory(
  authority: ChargebackRecoveryPostingAllocationAuthority,
  allocationInputs: unknown,
  positionInputs: unknown,
  journalInputs: unknown,
  envelope: FinancePostingDecoderEnvelope
): void {
  const rawAllocations = readExactDataArray(allocationInputs, 1, envelope.maxAllocations);
  const rawJournals = readExactDataArray(journalInputs, 1, envelope.maxAllocations);
  if (
    rawAllocations.length !== authority.allocationRefs.length ||
    rawJournals.length !== authority.allocationRefs.length
  )
    mismatch("authority_mismatch");
  const allocations = rawAllocations.map((value) =>
    readChargebackPrincipalPostingAllocationAuthority(value, envelope)
  );
  const positions = readChargebackResolutionPositionHistory(allocations, positionInputs, envelope);
  let journals: readonly FinanceJournalTransaction[];
  try {
    journals = rawJournals.map((value) => readFinancePostingJournalTransaction(value, envelope));
  } catch {
    mismatch("proof_transaction_mismatch");
  }
  const seenTranches = new Set<string>();
  for (const [index, allocation] of allocations.entries()) {
    const reference = authority.allocationRefs[index];
    const journal = journals[index];
    if (!reference || !journal) mismatch("authority_mismatch");
    assertAllocationIdentity(authority, allocation, journal, reference);
    assertChargebackPrincipalPostingPriorAuthorityResolved(
      allocation,
      index === 0 ? null : (allocations[index - 1] ?? null)
    );
    for (const row of allocation.recoveryAllocations) {
      const position = positions[index];
      const exposure = authority.exposures.find(
        (candidate) => candidate.exposureId === row.allocationId
      );
      const tranche = authority.tranches.find(
        (candidate) =>
          candidate.allocationAuthorityId === allocation.authorityId &&
          candidate.allocationAuthorityVersion === allocation.version &&
          candidate.exposureId === row.allocationId
      );
      const trancheKey = `${allocation.authorityId}\u0000${row.allocationId}`;
      if (!position || !exposure || !tranche || seenTranches.has(trancheKey)) {
        mismatch("proof_transaction_mismatch");
      }
      seenTranches.add(trancheKey);
      if (
        tranche.accountingAllocationRevisionId !==
          allocation.sourceAuthority.accountingAllocationRevisionId ||
        tranche.positionTransitionBindingId !== position.bindingId ||
        tranche.positionTransitionVersion !== position.nextPositionVersion ||
        exposure.originalComponentId !== row.componentId ||
        exposure.originalSaleId !== row.originalSaleId ||
        exposure.payableLotId !== row.payableLotId ||
        exposure.payoutAllocationId !== row.payoutAllocationId
      )
        mismatch("proof_transaction_mismatch");
      assertFinancePostingMoneyEqual(tranche.amount, row.amount, "proof_transaction_mismatch");
      assertOriginalRecoveryEntry(authority, exposure, tranche, journal);
    }
  }
  if (seenTranches.size !== authority.tranches.length) mismatch("proof_transaction_mismatch");
  assertCurrentRecoveryPositions(authority, positions.at(-1));
  const latest = allocations.at(-1);
  if (!latest) mismatch("authority_mismatch");
  const provider = latest.confirmedProviderEvidenceBinding;
  if (
    authority.latestProviderBindingRef.bindingId !== provider.bindingId ||
    authority.latestProviderBindingRef.version !== provider.version ||
    authority.latestProviderBindingRef.canonicalDigest !== provider.bindingDigest ||
    authority.providerPaymentId !== provider.sourceAuthority.providerPaymentId
  )
    mismatch("scope_mismatch");
}

function assertAllocationIdentity(
  target: ChargebackRecoveryPostingAllocationAuthority,
  allocation: ReturnType<typeof readChargebackPrincipalPostingAllocationAuthority>,
  journal: FinanceJournalTransaction,
  reference: ChargebackRecoveryPostingAllocationAuthority["allocationRefs"][number]
): void {
  if (
    reference.authorityId !== allocation.authorityId ||
    reference.accountingAllocationId !== allocation.sourceAuthority.accountingAllocationId ||
    reference.version !== allocation.version ||
    reference.canonicalDigest !== allocation.canonicalDigest ||
    reference.journalTransactionId !== journal.id ||
    reference.journalDigest !== hashFinanceCommandPayload(journal) ||
    journal.sourceKey.kind !== "chargeback" ||
    journal.sourceKey.operation !== "principal_allocated" ||
    journal.sourceKey.sourceId !== allocation.sourceAuthority.accountingAllocationRevisionId ||
    allocation.chargebackCaseId !== target.chargebackCaseId ||
    allocation.orderId !== target.originalOrderId ||
    allocation.astrologerUserId !== target.astrologerUserId ||
    allocation.arcProviderAccountId !== target.arcProviderAccountId
  )
    mismatch("scope_mismatch");
  assertFinancePostingMoneyEqual(
    reference.nextAllocatedPrincipal,
    allocation.nextAllocatedPrincipal,
    "amount_mismatch"
  );
  if (compareFinancePostingInstants(target.collectedAt, allocation.approvedAt) < 0) {
    mismatch("invalid_chronology");
  }
}

function assertOriginalRecoveryEntry(
  authority: ChargebackRecoveryPostingAllocationAuthority,
  exposure: ChargebackRecoveryPostingAllocationAuthority["exposures"][number],
  tranche: ChargebackRecoveryPostingAllocationAuthority["tranches"][number],
  journal: FinanceJournalTransaction
): void {
  const reference = tranche.originalJournalEntry;
  const entry =
    journal.id === reference.transactionId ? journal.entries[reference.entryIndex] : undefined;
  if (
    !entry ||
    hashFinanceCommandPayload(entry) !== reference.canonicalDigest ||
    entry.account.code !== "astrologer_recovery_receivable" ||
    entry.account.astrologerUserId !== authority.astrologerUserId ||
    entry.side !== "debit" ||
    entry.links.originalSaleId !== exposure.originalSaleId ||
    entry.links.componentId !== exposure.originalComponentId ||
    entry.links.payableLotId !== exposure.payableLotId ||
    entry.links.payoutAllocationId !== exposure.payoutAllocationId
  )
    mismatch("proof_transaction_mismatch");
  assertFinancePostingMoneyEqual(entry.amount, tranche.amount, "proof_transaction_mismatch");
}

function assertCurrentRecoveryPositions(
  authority: ChargebackRecoveryPostingAllocationAuthority,
  latest: ReturnType<typeof readChargebackResolutionPositionHistory>[number] | undefined
): void {
  if (!latest) mismatch("authority_mismatch");
  const positions = latest.recoveryPositions.filter(
    (position) => position.consumedAfter.amountMinor > 0
  );
  if (positions.length !== authority.exposures.length) mismatch("authority_mismatch");
  for (const exposure of authority.exposures) {
    const position = positions.find((candidate) => candidate.positionId === exposure.exposureId);
    if (
      !position ||
      position.originalSaleId !== exposure.originalSaleId ||
      position.componentId !== exposure.originalComponentId ||
      position.payableLotId !== exposure.payableLotId ||
      position.payoutAllocationId !== exposure.payoutAllocationId
    ) {
      mismatch("authority_mismatch");
    }
    assertFinancePostingMoneyEqual(
      position.sourceCapacity,
      exposure.sourceCapacity,
      "amount_mismatch"
    );
    assertFinancePostingMoneyEqual(
      position.consumedAfter,
      exposure.allocatedAmount,
      "amount_mismatch"
    );
  }
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
