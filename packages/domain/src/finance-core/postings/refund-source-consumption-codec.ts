import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingMoney,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";
import type {
  RefundSourceConsumptionIdentity,
  UnverifiedRefundSourceConsumptionTransition
} from "./refund-source-consumption-types";
import { readRefundPostingMoney } from "./refund-posting-value-codec";

export function readUnverifiedRefundSourceConsumptionTransition(
  input: unknown
): UnverifiedRefundSourceConsumptionTransition {
  const fields = readExactDataRecord(input, [
    "positionId",
    "expectedPositionVersion",
    "nextPositionVersion",
    "componentId",
    "source",
    "capacity",
    "consumedBefore",
    "allocationDelta",
    "consumedAfter",
    "remainingAfter"
  ]);
  const expectedPositionVersion = nonnegativeVersion(fields.expectedPositionVersion);
  const nextPositionVersion = readFinancePostingVersion(fields.nextPositionVersion);
  const capacity = readFinancePostingMoney(fields.capacity);
  const consumedBefore = readRefundPostingMoney(fields.consumedBefore, false);
  const allocationDelta = readFinancePostingMoney(fields.allocationDelta);
  const consumedAfter = readFinancePostingMoney(fields.consumedAfter);
  const remainingAfter = readRefundPostingMoney(fields.remainingAfter, false);
  if (
    nextPositionVersion !== expectedPositionVersion + 1 ||
    (consumedBefore.amountMinor === 0) !== (expectedPositionVersion === 0) ||
    BigInt(consumedBefore.amountMinor) + BigInt(allocationDelta.amountMinor) !==
      BigInt(consumedAfter.amountMinor) ||
    BigInt(consumedAfter.amountMinor) + BigInt(remainingAfter.amountMinor) !==
      BigInt(capacity.amountMinor)
  ) {
    mismatch();
  }
  return Object.freeze({
    positionId: readFinancePostingIdentifier(fields.positionId),
    expectedPositionVersion,
    nextPositionVersion,
    componentId: readFinancePostingIdentifier(fields.componentId),
    source: readSource(fields.source),
    capacity,
    consumedBefore,
    allocationDelta,
    consumedAfter,
    remainingAfter
  });
}

function readSource(input: unknown): RefundSourceConsumptionIdentity {
  const kind = readOwnDataDiscriminator(input, "kind", [
    "payable_lot",
    "paid_payout_allocation",
    "in_flight_payout_allocation",
    "platform_journal_entry"
  ] as const);
  if (kind === "payable_lot") {
    const fields = readExactDataRecord(input, ["kind", "rootLotId", "sourceLotId"]);
    return Object.freeze({
      kind,
      rootLotId: readFinancePostingIdentifier(fields.rootLotId),
      sourceLotId: readFinancePostingIdentifier(fields.sourceLotId)
    });
  }
  if (kind === "paid_payout_allocation" || kind === "in_flight_payout_allocation") {
    const fields = readExactDataRecord(input, [
      "kind",
      "rootLotId",
      "payableLotId",
      "payoutRequestId",
      "payoutAllocationId"
    ]);
    return Object.freeze({
      kind,
      rootLotId: readFinancePostingIdentifier(fields.rootLotId),
      payableLotId: readFinancePostingIdentifier(fields.payableLotId),
      payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
      payoutAllocationId: readFinancePostingIdentifier(fields.payoutAllocationId)
    });
  }
  const fields = readExactDataRecord(input, ["kind", "transactionId", "entryIndex", "accountCode"]);
  if (
    (fields.accountCode !== "platform_commission_deferred" &&
      fields.accountCode !== "platform_commission_revenue") ||
    !Number.isSafeInteger(fields.entryIndex) ||
    (fields.entryIndex as number) < 0
  ) {
    mismatch();
  }
  return Object.freeze({
    kind,
    transactionId: readFinancePostingIdentifier(fields.transactionId),
    entryIndex: fields.entryIndex as number,
    accountCode: fields.accountCode
  });
}

function nonnegativeVersion(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0) mismatch();
  return input as number;
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
