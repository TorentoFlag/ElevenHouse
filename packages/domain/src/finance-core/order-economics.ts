import { allocateBps, type Money } from "../money";

export type OrderEconomicsAllocationRevision = "bps_half_up_v1";

export type OrderEconomicsSnapshot = {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly planId: string;
  readonly planVersionId: string;
  readonly gross: Money;
  readonly commission: Money;
  readonly payable: Money;
  readonly commissionBps: number;
  readonly allocationRevision: OrderEconomicsAllocationRevision;
};

export class OrderEconomicsSnapshotValidationError extends Error {
  readonly code = "invalid_order_economics_snapshot";

  constructor() {
    super("Order economics snapshot is invalid");
    this.name = "OrderEconomicsSnapshotValidationError";
  }
}

const orderEconomicsKeys = [
  "orderId",
  "astrologerUserId",
  "planId",
  "planVersionId",
  "gross",
  "commission",
  "payable",
  "commissionBps",
  "allocationRevision"
] as const;

export function createOrderEconomicsSnapshot(input: unknown): OrderEconomicsSnapshot {
  const candidate = exactRecord(input, orderEconomicsKeys);
  const gross = money(candidate.gross, true);
  const commission = money(candidate.commission, false);
  const payable = money(candidate.payable, false);
  const commissionBps = integer(candidate.commissionBps, 0, 10_000);
  const allocationRevision = allocationRevisionValue(candidate.allocationRevision);

  if (BigInt(gross.amountMinor) !== BigInt(commission.amountMinor) + BigInt(payable.amountMinor)) {
    invalid();
  }

  const allocation = allocateBps({ amountMinor: gross.amountMinor, bps: commissionBps });
  if (
    allocation.feeMinor !== commission.amountMinor ||
    allocation.remainderMinor !== payable.amountMinor
  ) {
    invalid();
  }

  return Object.freeze({
    orderId: identifier(candidate.orderId),
    astrologerUserId: identifier(candidate.astrologerUserId),
    planId: identifier(candidate.planId),
    planVersionId: identifier(candidate.planVersionId),
    gross,
    commission,
    payable,
    commissionBps,
    allocationRevision
  });
}

function allocationRevisionValue(value: unknown): OrderEconomicsAllocationRevision {
  if (value !== "bps_half_up_v1") invalid();
  return value;
}

function money(value: unknown, positive: boolean): Money {
  const candidate = exactRecord(value, ["amountMinor", "currency"]);
  if (candidate.currency !== "RUB") invalid();

  return Object.freeze({
    amountMinor: integer(candidate.amountMinor, positive ? 1 : 0, Number.MAX_SAFE_INTEGER),
    currency: "RUB"
  });
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    invalid();
  }
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid();
  }
  return value as number;
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Record<Keys[number], unknown> {
  try {
    if (!isPlainRecord(value)) invalid();
    const actualKeys = Reflect.ownKeys(value)
      .map((key) => {
        if (typeof key !== "string") return invalid();
        return key;
      })
      .sort();
    const sortedExpectedKeys = [...expectedKeys].sort();
    if (
      actualKeys.length !== sortedExpectedKeys.length ||
      actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
    ) {
      invalid();
    }
    const projected = Object.create(null) as Record<string, unknown>;
    for (const key of actualKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) invalid();
      projected[key] = descriptor.value;
    }
    return Object.freeze(projected) as Record<Keys[number], unknown>;
  } catch {
    return invalid();
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(): never {
  throw new OrderEconomicsSnapshotValidationError();
}
