import { compareFinancePostingInstants, FinancePostingIntegrityError } from "./posting-codec";
import type {
  ChargebackPaidRecoveryPosition,
  ChargebackPlatformLossPosition,
  UnverifiedChargebackPrincipalPositionTransitionBinding,
  UnverifiedChargebackTreatmentDecision
} from "./chargeback-principal-position-types";

export function assertChargebackPrincipalPositionIntegrity(
  binding: Omit<UnverifiedChargebackPrincipalPositionTransitionBinding, "bindingDigest">
): void {
  const expected = BigInt(binding.expectedPositionVersion);
  const next = BigInt(binding.nextPositionVersion);
  if (next !== expected + 1n) mismatch("invalid_version");
  const basis = binding.confirmedBasis;
  const exposure = binding.caseExposure;
  if (
    basis.providerAccount.providerAccountId !== binding.providerAccountId ||
    !moneyEqual(basis.cumulativeDisputedAmount, exposure.disputedPrincipal) ||
    compareFinancePostingInstants(binding.observedAt, basis.confirmedAt) < 0
  ) {
    mismatch("scope_mismatch");
  }
  const before = amount(exposure.allocatedBefore);
  const payable = amount(exposure.payableDelta);
  const recovery = amount(exposure.recoveryDelta);
  const platform = amount(exposure.platformDelta);
  const delta = amount(exposure.allocationDelta);
  const after = amount(exposure.allocatedAfter);
  const disputed = amount(exposure.disputedPrincipal);
  const unallocated = amount(exposure.unallocatedAfter);
  if (
    payable + recovery + platform !== delta ||
    before + delta !== after ||
    after + unallocated !== disputed ||
    after > disputed
  ) {
    mismatch("amount_mismatch");
  }
  assertCanonicalPositions(binding);
  let recoveryTotal = 0n;
  for (const position of binding.recoveryPositions) {
    assertRecoveryPosition(binding, position);
    recoveryTotal += amount(position.currentDelta);
  }
  let platformTotal = 0n;
  for (const position of binding.platformPositions) {
    if (position.kind === "platform_loss") assertPlatformLoss(binding, position);
    else assertPlatformCommission(position);
    platformTotal += amount(position.currentDelta);
  }
  if (recoveryTotal !== recovery || platformTotal !== platform) {
    mismatch("amount_mismatch");
  }
}

function assertRecoveryPosition(
  binding: Omit<UnverifiedChargebackPrincipalPositionTransitionBinding, "bindingDigest">,
  position: ChargebackPaidRecoveryPosition
): void {
  assertCapacity(
    position.sourceCapacity,
    position.consumedBefore,
    position.currentDelta,
    position.consumedAfter,
    position.remainingAfter
  );
  const decision = position.treatmentDecision;
  assertDecision(binding, decision, position.positionId, "astrologer_recovery");
  if (
    amount(position.consumedAfter) > amount(decision.approvedAmount) ||
    compareFinancePostingInstants(binding.observedAt, position.paidEvidence.transferredAt) < 0
  ) {
    mismatch("amount_mismatch");
  }
}

function assertPlatformLoss(
  binding: Omit<UnverifiedChargebackPrincipalPositionTransitionBinding, "bindingDigest">,
  position: ChargebackPlatformLossPosition
): void {
  assertCapacity(
    position.sourceCapacity,
    position.consumedBefore,
    position.currentDelta,
    position.consumedAfter,
    position.remainingAfter
  );
  assertDecision(binding, position.treatmentDecision, position.positionId, "platform_loss");
  if (amount(position.consumedAfter) > amount(position.treatmentDecision.approvedAmount)) {
    mismatch("amount_mismatch");
  }
}

function assertDecision(
  binding: Omit<UnverifiedChargebackPrincipalPositionTransitionBinding, "bindingDigest">,
  decision: UnverifiedChargebackTreatmentDecision,
  positionId: string,
  treatment: UnverifiedChargebackTreatmentDecision["treatment"]
): void {
  if (
    decision.chargebackCaseId !== binding.chargebackCaseId ||
    decision.orderId !== binding.orderId ||
    decision.astrologerUserId !== binding.astrologerUserId ||
    decision.positionId !== positionId ||
    decision.treatment !== treatment ||
    compareFinancePostingInstants(binding.observedAt, decision.approvedAt) < 0
  ) {
    mismatch("authority_mismatch");
  }
}

function assertPlatformCommission(
  position: Extract<
    UnverifiedChargebackPrincipalPositionTransitionBinding["platformPositions"][number],
    { kind: "platform_commission_reversal" }
  >
): void {
  const original = amount(position.originalCommissionAmount);
  const beforeDeferred = amount(position.deferredRemainingBefore);
  const beforeRevenue = amount(position.revenueRemainingBefore);
  const beforeReversed = amount(position.reversedBefore);
  const delta = amount(position.currentDelta);
  const afterDeferred = amount(position.deferredRemainingAfter);
  const afterRevenue = amount(position.revenueRemainingAfter);
  const afterReversed = amount(position.reversedAfter);
  const selectedBefore =
    position.debitAccount === "platform_commission_deferred" ? beforeDeferred : beforeRevenue;
  if (
    beforeDeferred + beforeRevenue + beforeReversed !== original ||
    afterDeferred + afterRevenue + afterReversed !== original ||
    afterReversed !== beforeReversed + delta ||
    selectedBefore < delta ||
    (position.debitAccount === "platform_commission_deferred"
      ? afterDeferred !== beforeDeferred - delta || afterRevenue !== beforeRevenue
      : afterRevenue !== beforeRevenue - delta || afterDeferred !== beforeDeferred)
  ) {
    mismatch("amount_mismatch");
  }
}

function assertCapacity(
  capacity: { amountMinor: number },
  before: { amountMinor: number },
  delta: { amountMinor: number },
  after: { amountMinor: number },
  remaining: { amountMinor: number }
): void {
  if (
    amount(before) + amount(delta) !== amount(after) ||
    amount(after) + amount(remaining) !== amount(capacity) ||
    amount(after) > amount(capacity)
  ) {
    mismatch("amount_mismatch");
  }
}

function assertCanonicalPositions(
  binding: Omit<UnverifiedChargebackPrincipalPositionTransitionBinding, "bindingDigest">
): void {
  const positions = [...binding.recoveryPositions, ...binding.platformPositions];
  const ids = positions.map((position) => position.positionId);
  const components = positions.map((position) => position.componentId);
  if (
    !strictlyAscending(binding.recoveryPositions.map((position) => position.positionId)) ||
    !strictlyAscending(binding.platformPositions.map((position) => position.positionId)) ||
    new Set(ids).size !== ids.length ||
    new Set(components).size !== components.length ||
    positions.some((position) => position.originalSaleId !== binding.orderId)
  ) {
    mismatch("authority_mismatch");
  }
}

const amount = (value: { amountMinor: number }) => BigInt(value.amountMinor);
const moneyEqual = (left: { amountMinor: number; currency: string }, right: typeof left) =>
  left.amountMinor === right.amountMinor && left.currency === right.currency;
const strictlyAscending = (values: readonly string[]) =>
  values.every((value, index) => index === 0 || (values[index - 1] as string) < value);
function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
