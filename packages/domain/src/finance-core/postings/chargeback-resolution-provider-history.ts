import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import type { ChargebackLostAllocationClosureAuthority } from "./chargeback-lost-closure-types";
import { readChargebackProviderReceiptBinding } from "./chargeback-provider-receipt-binding";
import type { UnverifiedChargebackProviderEvidenceBinding } from "./chargeback-provider-evidence";
import type {
  ChargebackLostResolutionPostingAuthority,
  ChargebackWonResolutionPostingAuthority
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

export function readChargebackResolutionProviderHistory(
  target: Target,
  latestAllocation: ChargebackPrincipalPostingAllocationAuthority,
  input: unknown,
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
): Readonly<{
  bindings: readonly UnverifiedChargebackProviderEvidenceBinding[];
  latest: UnverifiedChargebackProviderEvidenceBinding;
}> {
  const rows = readExactDataArray(input, 1, postingEnvelope.maxAllocations).map((row) =>
    readChargebackProviderReceiptBinding(row as never, postingEnvelope, receiptEnvelope)
  );
  const bindings = Object.freeze(rows.map((row) => row.binding));
  const first = bindings[0];
  const latest = bindings.at(-1);
  if (
    !first ||
    !latest ||
    !sameCanonicalFinancePostingValue(first, latestAllocation.confirmedProviderEvidenceBinding)
  ) {
    mismatch("evidence_mismatch");
  }
  assertUniqueProviderHistory(bindings);
  bindings.forEach((binding, index) => {
    assertProviderScope(target, binding, first);
    const prior = bindings[index - 1];
    if (prior) assertAdjacentProviderConfirmation(binding, prior);
  });
  const source = latest.sourceAuthority;
  const allocated = BigInt(latestAllocation.nextAllocatedPrincipal.amountMinor);
  const disputed = BigInt(source.nextCumulativeDisputedAmount.amountMinor);
  if (
    target.latestProviderBindingRef.bindingId !== latest.bindingId ||
    target.latestProviderBindingRef.version !== latest.version ||
    target.latestProviderBindingRef.canonicalDigest !== latest.bindingDigest ||
    target.providerPaymentId !== source.providerPaymentId ||
    target.arcProviderAccountId !== source.providerAccount.providerAccountId ||
    BigInt(target.disputedPrincipal.amountMinor) !== disputed ||
    disputed < allocated ||
    BigInt(target.unallocatedSuspense.amountMinor) !== disputed - allocated
  ) {
    mismatch("evidence_mismatch");
  }
  return Object.freeze({ bindings, latest });
}

function assertProviderScope(
  target: Target,
  binding: UnverifiedChargebackProviderEvidenceBinding,
  initial: UnverifiedChargebackProviderEvidenceBinding
): void {
  const source = binding.sourceAuthority;
  if (
    source.chargebackCaseId !== target.chargebackCaseId ||
    source.orderId !== target.originalOrderId ||
    source.astrologerUserId !== target.astrologerUserId ||
    source.providerAccount.providerAccountId !== target.arcProviderAccountId ||
    source.providerPaymentId !== target.providerPaymentId ||
    source.restrictionId !== initial.sourceAuthority.restrictionId ||
    binding.principalComponentId !== initial.principalComponentId ||
    !sameCanonicalFinancePostingValue(
      binding.componentRegistryAuthorityRef,
      initial.componentRegistryAuthorityRef
    ) ||
    compareFinancePostingInstants(target.decidedAt, source.confirmedAt) < 0
  ) {
    mismatch("scope_mismatch");
  }
}

function assertAdjacentProviderConfirmation(
  current: UnverifiedChargebackProviderEvidenceBinding,
  prior: UnverifiedChargebackProviderEvidenceBinding
): void {
  const source = current.sourceAuthority;
  const previous = prior.sourceAuthority;
  if (
    source.confirmationKind !== "cumulative_update" ||
    source.version !== previous.version + 1 ||
    source.priorRestrictionVersion !== previous.version ||
    !sameCanonicalFinancePostingValue(
      source.priorCumulativeDisputedAmount,
      previous.nextCumulativeDisputedAmount
    ) ||
    compareFinancePostingInstants(source.confirmedAt, previous.confirmedAt) < 0
  ) {
    mismatch("authority_mismatch");
  }
}

function assertUniqueProviderHistory(
  bindings: readonly UnverifiedChargebackProviderEvidenceBinding[]
): void {
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (
    !unique(bindings.map((row) => row.bindingId)) ||
    !unique(bindings.map((row) => row.operationReceiptId)) ||
    !unique(bindings.map((row) => row.sourceAuthority.authorityId)) ||
    !unique(bindings.map((row) => row.sourceAuthority.canonicalEvidenceId))
  ) {
    mismatch("authority_mismatch");
  }
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
