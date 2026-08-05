import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import {
  readUnverifiedPayoutBankExposureBinding,
  readUnverifiedPayoutBankExposureTransitionBinding
} from "./payout-bank-exposure-binding";
import {
  assertFinancePostingMoneyEqual,
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readPayoutAuthorizationProof, readPayoutStateTransition } from "./payout-posting-codec";
import { readPayoutPaidSourceAuthority } from "./payout-source-authority-codec";
import { PayoutPostingContradictionError } from "./payout-posting-contradiction";
import { readPayoutReceiptSourceAuthorityRef } from "./payout-receipt-authority";
import {
  buildReceiptPostingRecipe,
  emptyJournalLinks,
  normalizeReceiptPostingEnvelopes,
  prepareReceiptPosting,
  sumReceiptRows
} from "./receipt-liability-posting-core";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildUnverifiedPayoutPaidPosting(
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
  const prepared = prepareReceiptPosting(root, "payout_paid", envelopes);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "sourceAuthority",
    "receiptBinding",
    "payoutState",
    "exposureTransition",
    "authorizationProof"
  ]);
  if (fields.kind !== "payout_paid_posting") mismatch();
  const previous = readUnverifiedPayoutBankExposureBinding(
    root.previousExposureBinding,
    envelopes.posting
  );
  if (previous.status === "released") {
    throw new PayoutPostingContradictionError("paid_after_definitive_no_transfer");
  }
  const sourceAuthority = readPayoutPaidSourceAuthority(fields.sourceAuthority);
  const sourceRef = readPayoutReceiptSourceAuthorityRef(prepared.receipt, sourceAuthority);
  const payoutState = readPayoutStateTransition(fields.payoutState, envelopes.posting);
  if (
    sourceAuthority.payoutRequestId !== prepared.receipt.sourceKey.sourceId ||
    sourceAuthority.transferredAt !== prepared.receipt.occurredAt ||
    payoutState.from !== "processing_manual" ||
    payoutState.to !== "paid" ||
    !sameCanonicalFinancePostingValue(fields.receiptBinding, prepared.receiptBinding)
  ) {
    mismatch();
  }
  const commandCore = Object.freeze({
    kind: "payout_paid_posting" as const,
    sourceAuthority,
    receiptBinding: prepared.receiptBinding,
    payoutState
  });
  const payloadHash = hashFinanceCommandPayload(commandCore);
  const proof = readPayoutAuthorizationProof(fields.authorizationProof, {
    actionKind: "payout_confirm_paid",
    aggregateId: sourceAuthority.payoutRequestId,
    expectedVersion: payoutState.expectedVersion,
    payloadHash,
    occurredAt: sourceAuthority.transferredAt
  });
  const exposure = readUnverifiedPayoutBankExposureTransitionBinding(
    { binding: fields.exposureTransition, previousBinding: root.previousExposureBinding },
    envelopes.posting
  );
  if (
    previous.status !== "initiated_unreflected" ||
    exposure.transitionKind !== "paid_proven" ||
    exposure.status !== "paid_unreflected" ||
    exposure.payoutRequestId !== sourceAuthority.payoutRequestId ||
    exposure.astrologerUserId !== prepared.receipt.astrologerUserId ||
    exposure.occurredAt !== sourceAuthority.transferredAt ||
    proof.actorUserId === exposure.approvedByActorUserId ||
    !sameCanonicalFinancePostingValue(exposure.transitionAuthorityRef, sourceRef)
  ) {
    mismatch();
  }
  const amount = Object.freeze({
    amountMinor: sumReceiptRows(prepared, "debit"),
    currency: "RUB" as const
  });
  assertFinancePostingMoneyEqual(exposure.amount, amount, "amount_mismatch");
  const postingAuthorityRef = Object.freeze({
    kind: "payout_paid_posting",
    authorityId: sourceAuthority.authorityId,
    version: sourceAuthority.version,
    canonicalDigest: hashFinanceCommandPayload({
      ...commandCore,
      exposureTransition: exposure,
      authorizationProof: proof
    })
  });
  return buildReceiptPostingRecipe(prepared, postingAuthorityRef, envelopes, [
    {
      account: {
        code: "bank_outbound_clearing",
        bankCashPoolId: exposure.bankCashPoolId,
        currency: "RUB"
      },
      side: "credit",
      amount,
      links: emptyJournalLinks
    }
  ]);
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
