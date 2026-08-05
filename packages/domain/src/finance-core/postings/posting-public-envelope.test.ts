import { describe, expect, it } from "vitest";
import { buildUnknownBankCreditPosting } from "./bank-statement-posting";
import { buildUnverifiedBankCreditSuspenseReclassificationRecipe } from "./bank-suspense-reclassification";
import { validReturnedCreditReclassificationInput } from "./bank-suspense-reclassification-test-fixtures";
import { validUnknownCreditInput } from "./bank-statement-posting-test-fixtures";
import { readUnverifiedFinanceComponentSlotResolutionBindings } from "./component-slot-resolution";
import {
  assertFinanceJournalLinkProofMatchesTransaction,
  rehydrateFinanceJournalLinkProof
} from "./journal-link-proof";
import { FinancePostingIntegrityError } from "./posting-codec";
import { postingDecoderEnvelope } from "./posting-test-primitives";

describe("public finance posting decoder envelopes", () => {
  it.each([
    ["omitted", undefined],
    ["extra field", { ...postingDecoderEnvelope, maxSerializedBytes: 1_000_000 }]
  ])("rejects a %s envelope before reading hostile builder input", (_name, envelope) => {
    let trapCalls = 0;
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          trapCalls += 1;
          throw new Error("must not read target input");
        }
      }
    );

    expect(() => buildUnknownBankCreditPosting(hostile as never, envelope as never)).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        code: "finance_posting_integrity_error",
        reason: "decoder_envelope_required"
      })
    );
    expect(trapCalls).toBe(0);
  });

  it("rejects an embedded caller-authored policy instead of reading it from target input", () => {
    expect(() =>
      buildUnknownBankCreditPosting(
        { ...validUnknownCreditInput(), decoderEnvelope: postingDecoderEnvelope } as never,
        postingDecoderEnvelope
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({ reason: "invalid_shape" })
    );
  });

  it("requires the envelope even for an empty component-binding array", () => {
    expect(() =>
      readUnverifiedFinanceComponentSlotResolutionBindings([], undefined as never)
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_required"
      })
    );
  });

  it("applies the component-binding cap before decoding binding objects", () => {
    expect(() =>
      readUnverifiedFinanceComponentSlotResolutionBindings([{}, {}], {
        ...postingDecoderEnvelope,
        maxComponentBindings: 1
      })
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_exceeded"
      })
    );
  });

  it("applies journal-entry and proof-edge caps at their respective boundaries", () => {
    const posting = buildUnknownBankCreditPosting(
      validUnknownCreditInput(),
      postingDecoderEnvelope
    );
    expect(() =>
      rehydrateFinanceJournalLinkProof(posting.linkProof, {
        ...postingDecoderEnvelope,
        maxProofEdges: 1
      })
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_exceeded"
      })
    );
    expect(() =>
      assertFinanceJournalLinkProofMatchesTransaction(
        { proof: posting.linkProof, transaction: posting.transaction },
        { ...postingDecoderEnvelope, maxJournalEntries: 1 }
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_exceeded"
      })
    );
  });

  it("applies the allocation cap before returned-payout target enumeration", () => {
    expect(() =>
      buildUnverifiedBankCreditSuspenseReclassificationRecipe(
        validReturnedCreditReclassificationInput(),
        { ...postingDecoderEnvelope, maxAllocations: 1 }
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_exceeded"
      })
    );
  });
});
