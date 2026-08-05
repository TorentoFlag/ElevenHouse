import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import {
  buildReceiptPostingRecipe,
  normalizeReceiptPostingEnvelopes,
  prepareReceiptPosting,
  readReceiptPostingRoot,
  receiptAuthorityRef
} from "./receipt-liability-posting-core";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildUnverifiedHoldReleasePosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe {
  const envelopes = normalizeReceiptPostingEnvelopes(postingEnvelopeInput, receiptEnvelopeInput);
  const root = readReceiptPostingRoot(input);
  const prepared = prepareReceiptPosting(root, "hold_release", envelopes);
  return buildReceiptPostingRecipe(
    prepared,
    receiptAuthorityRef(prepared.receiptBinding),
    envelopes
  );
}

export function buildUnverifiedReserveReleasePosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe {
  const envelopes = normalizeReceiptPostingEnvelopes(postingEnvelopeInput, receiptEnvelopeInput);
  const root = readReceiptPostingRoot(input);
  const prepared = prepareReceiptPosting(root, "reserve_release", envelopes);
  return buildReceiptPostingRecipe(
    prepared,
    receiptAuthorityRef(prepared.receiptBinding),
    envelopes
  );
}
