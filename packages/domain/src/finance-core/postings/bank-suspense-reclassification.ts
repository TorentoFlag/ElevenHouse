import { FinancePostingIntegrityError, readFinancePostingIdentifier } from "./posting-codec";
import { readFinanceJournalPostingContext } from "./posting-event-identity";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";
import { readBankSuspenseReclassification } from "./bank-suspense-reclassification-authority";
import type { UnverifiedBankSuspenseReclassificationBinding } from "./bank-suspense-reclassification-types";

export type {
  BankSuspenseReclassificationOriginalUnknown,
  BankSuspenseReclassificationTarget,
  ReturnedPayoutCreditAllocation,
  UnverifiedArcMerchantPayoutClearingExposureBinding,
  UnverifiedBankOutboundClearingExposureBinding,
  UnverifiedBankReclassificationApprovalBinding,
  UnverifiedBankSuspenseReclassificationBinding,
  UnverifiedConsumedBankStatementMatchAuthorizationBinding
} from "./bank-suspense-reclassification-types";

export { readUnverifiedArcMerchantPayoutClearingExposureBinding } from "./bank-suspense-exposure-binding";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

type PostingInput<Authority> = Readonly<{
  context: Parameters<typeof readFinanceJournalPostingContext>[0];
  authority: Authority;
}>;

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

export function buildUnverifiedBankDebitSuspenseReclassificationRecipe(
  input: PostingInput<UnverifiedBankSuspenseReclassificationBinding>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  return buildUnverifiedBankDebitSuspenseReclassificationRecipeFromUnknown(input, decoderEnvelope);
}

function buildUnverifiedBankDebitSuspenseReclassificationRecipeFromUnknown(
  input: unknown,
  decoderEnvelope: FinancePostingDecoderEnvelope
): JournalRecipe {
  const prepared = readBankSuspenseReclassification(input, "debit", decoderEnvelope);
  if (prepared.target.kind !== "payout_debit") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const exposure = prepared.target.exposureBinding;
  readFinancePostingIdentifier(exposure.payoutRequestId);
  readFinancePostingIdentifier(exposure.bankExposureId);
  return createUnverifiedFinanceJournalPostingRecipe(
    {
      context: prepared.context,
      authorityRef: {
        kind: "unverified_bank_suspense_reclassification_binding",
        authorityId: prepared.authorityId,
        version: prepared.version,
        canonicalDigest: prepared.authorityDigest
      },
      sourceEvidenceRef: prepared.sourceEvidenceRef,
      operationSnapshotRef: null,
      entrySourceLinks: [null, null],
      entries: [
        {
          account: {
            code: "bank_outbound_clearing",
            bankCashPoolId: prepared.bankCashPoolId,
            currency: "RUB"
          },
          side: "debit",
          amount: prepared.amount,
          links: noLinks
        },
        {
          account: {
            code: "bank_unmatched_debit_suspense",
            bankCashPoolId: prepared.bankCashPoolId,
            currency: "RUB"
          },
          side: "credit",
          amount: prepared.amount,
          links: noLinks
        }
      ]
    },
    decoderEnvelope
  );
}

export function buildApprovedBankDebitSuspenseReclassificationPosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): never {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  buildUnverifiedBankDebitSuspenseReclassificationRecipeFromUnknown(input, decoderEnvelope);
  throw new FinancePostingIntegrityError("trusted_reclassification_commit_receipt_required");
}

export function buildUnverifiedBankCreditSuspenseReclassificationRecipe(
  input: PostingInput<UnverifiedBankSuspenseReclassificationBinding>,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): JournalRecipe {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  return buildUnverifiedBankCreditSuspenseReclassificationRecipeFromUnknown(input, decoderEnvelope);
}

function buildUnverifiedBankCreditSuspenseReclassificationRecipeFromUnknown(
  input: unknown,
  decoderEnvelope: FinancePostingDecoderEnvelope
): JournalRecipe {
  const prepared = readBankSuspenseReclassification(input, "credit", decoderEnvelope);
  const debit = {
    account: {
      code: "bank_unmatched_credit_suspense" as const,
      bankCashPoolId: prepared.bankCashPoolId,
      currency: "RUB" as const
    },
    side: "debit" as const,
    amount: prepared.amount,
    links: noLinks
  };
  if (prepared.target.kind === "merchant_payout_credit") {
    const exposure = prepared.target.exposureBinding;
    const providerAccountId = readFinancePostingIdentifier(exposure.providerAccountId);
    readFinancePostingIdentifier(exposure.merchantPayoutId);
    return createUnverifiedFinanceJournalPostingRecipe(
      {
        context: prepared.context,
        authorityRef: {
          kind: "unverified_bank_suspense_reclassification_binding",
          authorityId: prepared.authorityId,
          version: prepared.version,
          canonicalDigest: prepared.authorityDigest
        },
        sourceEvidenceRef: prepared.sourceEvidenceRef,
        operationSnapshotRef: null,
        entrySourceLinks: [null, null],
        entries: [
          debit,
          {
            account: {
              code: "arc_to_bank_clearing",
              arcProviderAccountId: providerAccountId,
              bankCashPoolId: prepared.bankCashPoolId,
              currency: "RUB"
            },
            side: "credit",
            amount: prepared.amount,
            links: noLinks
          }
        ]
      },
      decoderEnvelope
    );
  }
  if (prepared.target.kind !== "returned_payout_credit") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  throw new FinancePostingIntegrityError("payable_lot_operation_receipt_required");
}

export function buildApprovedBankCreditSuspenseReclassificationPosting(
  input: unknown,
  decoderEnvelopeInput: unknown
): never {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  buildUnverifiedBankCreditSuspenseReclassificationRecipeFromUnknown(input, decoderEnvelope);
  throw new FinancePostingIntegrityError("trusted_reclassification_commit_receipt_required");
}
