import { describe, expect, it } from "vitest";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readFinancePostingUnsignedDecimal
} from "./posting-codec";

const envelope = Object.freeze({
  maxJournalEntries: 16,
  maxProofEdges: 16,
  maxComponentBindings: 16,
  maxAllocations: 16,
  maxDecimalDigits: 32
}) satisfies FinancePostingDecoderEnvelope;

describe("finance posting decoder envelope", () => {
  it("normalizes an exact trusted out-of-band envelope", () => {
    expect(normalizeFinancePostingDecoderEnvelope(envelope)).toEqual(envelope);
    expect(Object.isFrozen(normalizeFinancePostingDecoderEnvelope(envelope))).toBe(true);
  });

  it.each([
    ["omitted", undefined],
    ["non-positive", { ...envelope, maxProofEdges: 0 }],
    ["unsafe", { ...envelope, maxAllocations: Number.MAX_SAFE_INTEGER + 1 }],
    ["caller-authored extra field", { ...envelope, maxSerializedBytes: 1_000_000 }]
  ])("rejects a %s decoder envelope without defaults", (_name, candidate) => {
    expect(() => normalizeFinancePostingDecoderEnvelope(candidate)).toThrowError(
      FinancePostingIntegrityError
    );
  });

  it("rejects an oversized hostile array before enumeration", () => {
    let trapCalls = 0;
    const hostile = new Proxy([1, 2, 3], {
      ownKeys() {
        trapCalls += 1;
        throw new Error("must not enumerate");
      }
    });

    expect(() => readExactDataArray(hostile, 0, 2)).toThrowError(FinancePostingIntegrityError);
    expect(trapCalls).toBe(0);
  });

  it("rejects an oversized decimal before regex or BigInt consumers", () => {
    expect(() => readFinancePostingUnsignedDecimal("9".repeat(33), 32)).toThrowError(
      FinancePostingIntegrityError
    );
  });
});
