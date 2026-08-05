import type { Money } from "../../money";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingMoney,
  readOwnDataDiscriminator
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readUnverifiedArcMerchantPayoutClearingExposureBinding,
  readUnverifiedBankOutboundClearingExposureBinding
} from "./bank-suspense-exposure-binding";
import type {
  BankSuspenseReclassificationTarget,
  ReturnedPayoutCreditAllocation
} from "./bank-suspense-reclassification-types";

export function readBankSuspenseReclassificationTarget(
  input: unknown,
  expectedTotal: Money,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): BankSuspenseReclassificationTarget {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const discriminator = readExactTargetKind(input);
  if (discriminator === "payout_debit") {
    const fields = readExactDataRecord(input, ["kind", "exposureBinding"]);
    return Object.freeze({
      kind: "payout_debit",
      exposureBinding: readUnverifiedBankOutboundClearingExposureBinding(
        fields.exposureBinding,
        decoderEnvelope
      )
    });
  }
  if (discriminator === "merchant_payout_credit") {
    const fields = readExactDataRecord(input, ["kind", "exposureBinding"]);
    return Object.freeze({
      kind: "merchant_payout_credit",
      exposureBinding: readUnverifiedArcMerchantPayoutClearingExposureBinding(
        fields.exposureBinding,
        decoderEnvelope
      )
    });
  }
  const fields = readExactDataRecord(input, ["kind", "payoutRequestId", "proposedAllocations"]);
  return Object.freeze({
    kind: "returned_payout_credit",
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    proposedAllocations: readReturnedPayoutCreditAllocations(
      fields.proposedAllocations,
      expectedTotal,
      decoderEnvelope
    )
  });
}

function readExactTargetKind(input: unknown): BankSuspenseReclassificationTarget["kind"] {
  return readOwnDataDiscriminator(input, "kind", [
    "payout_debit",
    "merchant_payout_credit",
    "returned_payout_credit"
  ] as const);
}

function readReturnedPayoutCreditAllocations(
  input: unknown,
  expectedTotal: Money,
  decoderEnvelope: FinancePostingDecoderEnvelope
): readonly ReturnedPayoutCreditAllocation[] {
  const rows = readExactDataArray(input, 1, decoderEnvelope.maxAllocations);
  const payableLotIds = new Set<string>();
  const payoutAllocationIds = new Set<string>();
  const astrologerUserIds = new Set<string>();
  let totalMinor = 0n;
  const allocations = rows.map((row) => {
    const fields = readExactDataRecord(row, [
      "astrologerUserId",
      "amount",
      "originalSaleId",
      "componentId",
      "payableLotId",
      "payoutAllocationId"
    ]);
    const allocation = Object.freeze({
      astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
      amount: readFinancePostingMoney(fields.amount),
      originalSaleId: readFinancePostingIdentifier(fields.originalSaleId),
      componentId: readFinancePostingIdentifier(fields.componentId),
      payableLotId: readFinancePostingIdentifier(fields.payableLotId),
      payoutAllocationId: readFinancePostingIdentifier(fields.payoutAllocationId)
    });
    if (
      payableLotIds.has(allocation.payableLotId) ||
      payoutAllocationIds.has(allocation.payoutAllocationId)
    ) {
      throw new FinancePostingIntegrityError("authority_mismatch");
    }
    payableLotIds.add(allocation.payableLotId);
    payoutAllocationIds.add(allocation.payoutAllocationId);
    astrologerUserIds.add(allocation.astrologerUserId);
    totalMinor += BigInt(allocation.amount.amountMinor);
    return allocation;
  });
  if (astrologerUserIds.size !== 1 || totalMinor !== BigInt(expectedTotal.amountMinor)) {
    throw new FinancePostingIntegrityError("amount_mismatch");
  }
  return Object.freeze(
    allocations.sort(
      (left, right) =>
        compareFinancePostingIdentifiers(left.payableLotId, right.payableLotId) ||
        compareFinancePostingIdentifiers(left.payoutAllocationId, right.payoutAllocationId)
    )
  );
}

function compareFinancePostingIdentifiers(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) as number);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) as number);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] as number) - (rightPoints[index] as number);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
