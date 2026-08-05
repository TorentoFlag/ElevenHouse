import type { PayoutPostingContradictionReason } from "./hold-payout-posting-types";

export class PayoutPostingContradictionError extends Error {
  readonly code = "payout_posting_contradiction";

  constructor(readonly reason: PayoutPostingContradictionReason) {
    super("Payout evidence contradicts an already definitive outcome");
    this.name = "PayoutPostingContradictionError";
  }
}
