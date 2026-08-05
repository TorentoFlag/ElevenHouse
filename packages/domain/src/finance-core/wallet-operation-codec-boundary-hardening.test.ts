import { describe, expect, it } from "vitest";
import { normalizeWalletProjectionDecoderEnvelope } from "./wallet-operation-codec-boundary";

describe("wallet-operation codec strict own-data boundary", () => {
  it("rejects non-enumerable decoder fields instead of accepting hidden input", () => {
    const input = {
      maxEconomicEdges: 64,
      maxAuthorityRefs: 16,
      maxJournalEntries: 32,
      maxDecimalDigits: 128
    };
    Object.defineProperty(input, "maxJournalEntries", {
      enumerable: false,
      value: 32
    });

    expect(() => normalizeWalletProjectionDecoderEnvelope(input)).toThrowError(
      expect.objectContaining({
        code: "wallet_operation_projection_integrity_violation",
        reason: "invalid_shape"
      })
    );
  });
});
