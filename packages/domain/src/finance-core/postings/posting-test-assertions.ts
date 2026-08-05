import { expect } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError, type FinancePostingIntegrityReason } from "./posting-codec";

export function hashProofCore(proof: Record<string, unknown>): `sha256:${string}` {
  const core = Object.fromEntries(Object.entries(proof).filter(([key]) => key !== "proofDigest"));
  return hashFinanceCommandPayload(core);
}

export function expectPostingError(
  action: () => unknown,
  reason: FinancePostingIntegrityReason
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect(error).toMatchObject({ code: "finance_posting_integrity_error", reason });
    return;
  }
  throw new Error("expected FinancePostingIntegrityError");
}
