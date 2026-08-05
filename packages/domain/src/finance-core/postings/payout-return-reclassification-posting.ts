import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { readBankSuspenseReclassification } from "./bank-suspense-reclassification-authority";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { preparePayoutReturnCore } from "./payout-return-posting-core";
import {
  buildReceiptPostingRecipe,
  emptyJournalLinks,
  normalizeReceiptPostingEnvelopes,
  prepareReceiptPosting,
  type ReceiptPostingPrepared
} from "./receipt-liability-posting-core";
import type { ReturnedPayoutCreditAllocation } from "./bank-suspense-reclassification-types";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildUnverifiedPayoutReturnSuspenseReclassificationPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe {
  const envelopes = normalizeReceiptPostingEnvelopes(postingEnvelopeInput, receiptEnvelopeInput);
  const root = readExactDataRecord(input, [
    "context",
    "receiptBinding",
    "operationReceipt",
    "componentBindings",
    "operationSnapshotRef",
    "authority",
    "previousExposureBinding"
  ]);
  const prepared = prepareReceiptPosting(root, "payout_returned_reserved", envelopes);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "sourceAuthority",
    "receiptBinding",
    "exposureTransition",
    "priorClearingCoverage",
    "reclassificationBinding"
  ]);
  if (fields.kind !== "payout_return_suspense_reclassification_posting") mismatch();
  const core = preparePayoutReturnCore(
    fields,
    root.previousExposureBinding,
    prepared,
    "reflected",
    envelopes.posting
  );
  const reclassification = readBankSuspenseReclassification(
    { context: root.context, authority: fields.reclassificationBinding },
    "credit",
    envelopes.posting
  );
  if (
    reclassification.target.kind !== "returned_payout_credit" ||
    core.source.bankCreditEvidencePath !== "unknown_credit_reclassification" ||
    core.source.suspenseReclassificationId !== reclassification.authorityId ||
    core.source.bankStatementEntryId !== prepared.context.sourceKey.sourceId ||
    reclassification.target.payoutRequestId !== core.source.payoutRequestId ||
    reclassification.bankCashPoolId !== core.exposure.bankCashPoolId ||
    !allocationsMatchReceipt(reclassification.target.proposedAllocations, prepared)
  ) {
    mismatch();
  }
  return buildReceiptPostingRecipe(
    prepared,
    {
      kind: "payout_return_suspense_reclassification_posting",
      authorityId: core.source.authorityId,
      version: core.source.version,
      canonicalDigest: hashFinanceCommandPayload({
        kind: "payout_return_suspense_reclassification_posting",
        sourceAuthority: core.source,
        receiptBinding: prepared.receiptBinding,
        exposureTransition: core.exposure,
        priorClearingCoverage: core.coverage,
        reclassificationAuthorityRef: {
          kind: "unverified_bank_suspense_reclassification_binding",
          authorityId: reclassification.authorityId,
          version: reclassification.version,
          canonicalDigest: reclassification.authorityDigest
        }
      })
    },
    envelopes,
    [
      {
        account: {
          code: "bank_unmatched_credit_suspense",
          bankCashPoolId: core.exposure.bankCashPoolId,
          currency: "RUB"
        },
        side: "debit",
        amount: core.amount,
        links: emptyJournalLinks
      }
    ],
    true
  );
}

export function buildApprovedPayoutReturnSuspenseReclassificationPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): never {
  buildUnverifiedPayoutReturnSuspenseReclassificationPosting(
    input,
    postingEnvelopeInput,
    receiptEnvelopeInput
  );
  throw new FinancePostingIntegrityError("trusted_reclassification_commit_receipt_required");
}

function allocationsMatchReceipt(
  allocations: readonly ReturnedPayoutCreditAllocation[],
  prepared: ReceiptPostingPrepared
): boolean {
  if (allocations.length !== prepared.rows.length) return false;
  const byPayoutAllocation = new Map(
    allocations.map((allocation) => [allocation.payoutAllocationId, allocation] as const)
  );
  if (byPayoutAllocation.size !== allocations.length) return false;
  return prepared.rows.every((row) => {
    const payoutAllocationId = row.entry.links.payoutAllocationId;
    if (payoutAllocationId === null) return false;
    const allocation = byPayoutAllocation.get(payoutAllocationId);
    return Boolean(
      allocation &&
      allocation.astrologerUserId === prepared.receipt.astrologerUserId &&
      allocation.originalSaleId === row.entry.links.originalSaleId &&
      allocation.componentId === row.entry.links.componentId &&
      allocation.payableLotId === row.entry.links.payableLotId &&
      sameCanonicalFinancePostingValue(allocation.amount, row.entry.amount)
    );
  });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
