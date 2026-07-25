export type Money = { readonly amountMinor: number; readonly currency: "RUB" };

export function allocateBps(input: {
  amountMinor: number;
  bps: number;
}): { readonly feeMinor: number; readonly remainderMinor: number } {
  assertSafeIntegerInRange(input.amountMinor, 0, Number.MAX_SAFE_INTEGER, "amountMinor");
  assertSafeIntegerInRange(input.bps, 0, 10_000, "bps");

  const feeMinor = Number((BigInt(input.amountMinor) * BigInt(input.bps) + 5_000n) / 10_000n);
  const remainderMinor = input.amountMinor - feeMinor;

  return { feeMinor, remainderMinor };
}

function assertSafeIntegerInRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${fieldName} must be a safe integer between ${min} and ${max}`);
  }
}
