import type { PayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { digestValue } from "../source-lot-operation-receipt-core";
import { FinancePostingIntegrityError, readFinancePostingDigest } from "./posting-codec";
import type { FinancePostingAuthorityRef } from "./posting-types";

export function readPayoutReceiptSourceAuthorityRef(
  receipt: PayableLotOperationReceipt,
  source: { readonly kind: string; readonly authorityId: string; readonly version: number }
): FinancePostingAuthorityRef {
  const reference = receipt.authorityRefs.find(
    (candidate) =>
      candidate.kind === source.kind &&
      "authorityId" in candidate &&
      candidate.authorityId === source.authorityId &&
      candidate.authorityVersion === String(source.version)
  );
  if (!reference || reference.canonicalDigest !== digestValue(source)) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    kind: source.kind,
    authorityId: source.authorityId,
    version: source.version,
    canonicalDigest: readFinancePostingDigest(reference.canonicalDigest)
  });
}
