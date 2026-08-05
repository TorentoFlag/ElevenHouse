import { describe, expect, it } from "vitest";
import {
  buildUnverifiedHoldReleasePosting,
  buildUnverifiedReserveReleasePosting
} from "./hold-reserve-posting";
import {
  holdPayoutReceipt,
  postingDecoderEnvelope,
  receiptDecoderEnvelope,
  receiptPostingInput
} from "./hold-payout-posting-test-fixtures";
import { FinancePostingIntegrityError } from "./posting-codec";

describe("hold and reserve receipt postings", () => {
  it("posts literal 9,600 hold release as 8,640 available plus 960 reserved", () => {
    const recipe = buildUnverifiedHoldReleasePosting(
      receiptPostingInput(holdPayoutReceipt("hold_release")),
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.entries.map(row)).toEqual([
      ["astrologer_pending", "debit", 9_600],
      ["astrologer_available", "credit", 8_640],
      ["astrologer_reserved", "credit", 960]
    ]);
    expect(recipe).toMatchObject({
      kind: "journal",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(recipe.linkProof.edges.every((edge) => edge.semanticEdgeId !== null)).toBe(true);
  });

  it("posts reserve release without admitting returned payout reserved receipts", () => {
    const recipe = buildUnverifiedReserveReleasePosting(
      receiptPostingInput(holdPayoutReceipt("reserve_release")),
      postingDecoderEnvelope,
      receiptDecoderEnvelope
    );
    expect(recipe.transaction.entries.map(row)).toEqual([
      ["astrologer_reserved", "debit", 960],
      ["astrologer_available", "credit", 960]
    ]);
    expect(() =>
      buildUnverifiedReserveReleasePosting(
        receiptPostingInput(holdPayoutReceipt("payout_returned_reserved")),
        postingDecoderEnvelope,
        receiptDecoderEnvelope
      )
    ).toThrowError(expect.objectContaining({ reason: "authority_mismatch" }));
  });

  it("normalizes both envelopes before touching hostile input", () => {
    let touches = 0;
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          touches += 1;
          throw new Error("must not touch");
        }
      }
    );
    expect(() =>
      buildUnverifiedHoldReleasePosting(
        hostile as never,
        undefined as never,
        receiptDecoderEnvelope
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "decoder_envelope_required"
      })
    );
    expect(() =>
      buildUnverifiedHoldReleasePosting(
        hostile as never,
        postingDecoderEnvelope,
        undefined as never
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "proof_operation_receipt_mismatch"
      })
    );
    expect(touches).toBe(0);
  });

  it("rejects a Proxy receipt envelope before executing reflective traps", () => {
    let touches = 0;
    const hostileEnvelope = new Proxy(receiptDecoderEnvelope, {
      ownKeys(target) {
        touches += 1;
        return Reflect.ownKeys(target);
      }
    });
    expect(() =>
      buildUnverifiedHoldReleasePosting(
        receiptPostingInput(holdPayoutReceipt("hold_release")),
        postingDecoderEnvelope,
        hostileEnvelope
      )
    ).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        reason: "proof_operation_receipt_mismatch"
      })
    );
    expect(touches).toBe(0);
  });
});

function row(entry: { account: { code: string }; side: string; amount: { amountMinor: number } }) {
  return [entry.account.code, entry.side, entry.amount.amountMinor];
}
