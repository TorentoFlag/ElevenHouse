import { digestValue } from "../source-lot-operation-receipt-core";
import {
  outcomeEvidenceRef,
  readUnverifiedChargebackOutcomeEvidenceBinding
} from "./chargeback-resolution-outcome-evidence";
import type {
  ChargebackLostResolutionPostingAuthority,
  ChargebackResolutionHistory,
  ChargebackWonResolutionPostingAuthority
} from "./chargeback-resolution-types";
import { FinancePostingIntegrityError, sameCanonicalFinancePostingValue } from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type { UnverifiedReceiptLinkedPostingProjection } from "./receipt-linked-posting-projection";

export type ChargebackWonResolutionComponents = Readonly<{
  recovery: readonly Readonly<{
    originalSaleId: string;
    componentId: string;
    payableLotId: string;
    payoutAllocationId: string;
    amountMinor: number;
  }>[];
  platform: readonly Readonly<{
    originalSaleId: string;
    componentId: string;
    accountCode:
      | "platform_commission_deferred"
      | "platform_commission_revenue"
      | "platform_chargeback_loss";
    amount: Readonly<{ amountMinor: number; currency: "RUB" }>;
  }>[];
}>;

export function assertChargebackResolutionOutcomeEvidence(
  authority: ChargebackWonResolutionPostingAuthority | ChargebackLostResolutionPostingAuthority,
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): void {
  const evidence = readUnverifiedChargebackOutcomeEvidenceBinding(input, envelope);
  if (
    !sameCanonicalFinancePostingValue(authority.outcomeEvidenceRef, outcomeEvidenceRef(evidence)) ||
    !sameCanonicalFinancePostingValue(authority.sourceAuthority, evidence.sourceAuthority) ||
    evidence.chargebackCaseId !== authority.chargebackCaseId ||
    evidence.decidedAt !== authority.decidedAt
  )
    mismatch("evidence_mismatch");
}

export function assertAndBuildChargebackWonResolutionComponents(
  authority: ChargebackWonResolutionPostingAuthority,
  history: ChargebackResolutionHistory
): ChargebackWonResolutionComponents {
  const latestPosition = history.principalPositions.at(-1);
  if (!latestPosition) mismatch("authority_mismatch");
  const recoveryPositions = latestPosition.recoveryPositions.filter(
    (position) => position.consumedAfter.amountMinor > 0
  );
  const platformPositions = latestPosition.platformPositions.filter((position) =>
    position.kind === "platform_commission_reversal"
      ? position.reversedAfter.amountMinor > 0
      : position.consumedAfter.amountMinor > 0
  );
  const knownRecoveryIds = new Set(recoveryPositions.map((row) => row.positionId));
  if ([...history.recoveredByExposure.keys()].some((id) => !knownRecoveryIds.has(id))) {
    mismatch("authority_mismatch");
  }
  let recovered = 0n;
  const recovery = Object.freeze(
    recoveryPositions.flatMap((row) => {
      const collected = history.recoveredByExposure.get(row.positionId) ?? 0;
      if (collected > row.consumedAfter.amountMinor) mismatch("amount_mismatch");
      recovered += BigInt(collected);
      const outstanding = row.consumedAfter.amountMinor - collected;
      return outstanding === 0
        ? []
        : [
            Object.freeze({
              originalSaleId: row.originalSaleId,
              componentId: row.componentId,
              payableLotId: row.payableLotId,
              payoutAllocationId: row.payoutAllocationId,
              amountMinor: outstanding
            })
          ];
    })
  );
  const platform = Object.freeze(
    platformPositions.map((row) => {
      const amountMinor =
        row.kind === "platform_commission_reversal"
          ? row.reversedAfter.amountMinor
          : row.consumedAfter.amountMinor;
      return Object.freeze({
        originalSaleId: row.originalSaleId,
        componentId: row.componentId,
        accountCode:
          row.kind === "platform_commission_reversal"
            ? row.debitAccount
            : ("platform_chargeback_loss" as const),
        amount: Object.freeze({ amountMinor, currency: "RUB" as const })
      });
    })
  );
  const payable = sum(
    history.allocations.map((allocation) => allocation.payablePrincipal.amountMinor)
  );
  const outstanding = sum(recovery.map((item) => item.amountMinor));
  const platformTotal = sum(platform.map((row) => row.amount.amountMinor));
  const restored = payable + recovered;
  const allocated = outstanding + restored + platformTotal;
  const latest = history.latestAllocation;
  if (
    outstanding !== BigInt(authority.outstandingRecovery.amountMinor) ||
    restored !== BigInt(authority.restoredPayable.amountMinor) ||
    platformTotal !== BigInt(authority.platformReversal.amountMinor) ||
    allocated !== BigInt(latest.nextAllocatedPrincipal.amountMinor) ||
    allocated + BigInt(authority.unallocatedSuspense.amountMinor) !==
      BigInt(authority.disputedPrincipal.amountMinor)
  )
    mismatch("amount_mismatch");
  return Object.freeze({ recovery, platform });
}

export function assertChargebackWonResolutionReceipt(
  authority: ChargebackWonResolutionPostingAuthority,
  projection: UnverifiedReceiptLinkedPostingProjection
): void {
  const receipt = projection.receipt;
  const source = authority.sourceAuthority;
  const expectedRef = Object.freeze({
    kind: source.kind,
    authorityId: source.authorityId,
    authorityVersion: String(source.version),
    evidenceId: source.canonicalEvidenceId,
    canonicalDigest: digestValue(source),
    digestPurpose: "drift_detection_only" as const
  });
  if (
    receipt.operationKind !== "chargeback_won_reserved" ||
    receipt.receiptId !== authority.operationReceiptId ||
    receipt.canonicalDigest !== authority.operationReceiptDigest ||
    receipt.sourceKey.kind !== "chargeback" ||
    receipt.sourceKey.operation !== "won" ||
    receipt.sourceKey.sourceId !== authority.chargebackCaseId ||
    receipt.astrologerUserId !== authority.astrologerUserId ||
    receipt.occurredAt !== authority.decidedAt ||
    receipt.authorityRefs.length !== 1 ||
    !sameCanonicalFinancePostingValue(receipt.authorityRefs[0], expectedRef)
  ) {
    mismatch("proof_operation_receipt_mismatch");
  }
  let restored = 0n;
  for (const row of projection.rows) {
    if (
      row.entry.account.code !== "astrologer_reserved" ||
      row.entry.side !== "credit" ||
      row.entry.account.astrologerUserId !== authority.astrologerUserId ||
      row.entry.links.componentId === null ||
      row.entry.links.payableLotId === null
    ) {
      mismatch("proof_operation_receipt_mismatch");
    }
    restored += BigInt(row.entry.amount.amountMinor);
  }
  if (restored !== BigInt(authority.restoredPayable.amountMinor)) mismatch("amount_mismatch");
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + BigInt(value), 0n);
function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
