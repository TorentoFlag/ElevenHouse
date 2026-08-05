import { expect } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError, type FinancePostingIntegrityReason } from "./posting-codec";

export const noPostingLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function rehashApprovalBinding<T extends Record<string, unknown>>(
  binding: T
): T & { bindingDigest: `sha256:${string}` } {
  const core = Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== "bindingDigest")
  );
  return { ...binding, bindingDigest: hashFinanceCommandPayload(core) };
}

export function rehashExposureBinding<T extends Record<string, unknown>>(
  binding: T
): T & { bindingDigest: `sha256:${string}` } {
  const core = Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== "bindingDigest")
  );
  return { ...binding, bindingDigest: hashFinanceCommandPayload(core) };
}

export function expectJournalEntries(
  result: {
    kind: string;
    authorizationStatus?: string;
    atomicityStatus?: string;
    transaction?: { entries: readonly unknown[] };
  },
  expected: readonly unknown[]
): void {
  expect(result.kind).toBe("journal");
  expect(result).toMatchObject({
    authorizationStatus: "unverified",
    atomicityStatus: "unverified"
  });
  if (result.kind !== "journal" || !result.transaction) {
    throw new Error("expected journal decision");
  }
  expect(result.transaction.entries).toEqual(expected);
}

export function expectPostingError(
  action: () => unknown,
  reason?: FinancePostingIntegrityReason
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect(error).toMatchObject({
      code: "finance_posting_integrity_error",
      ...(reason ? { reason } : {})
    });
    return;
  }
  throw new Error("expected FinancePostingIntegrityError");
}
