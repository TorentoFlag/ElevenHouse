import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import {
  readUnverifiedPayoutBankExposureBinding,
  readUnverifiedPayoutBankExposureTransitionBinding
} from "./payout-bank-exposure-binding";
import type { PayoutBridgeClosurePostingRef } from "./hold-payout-posting-types";
import {
  assertFinancePostingMoneyEqual,
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingMoney,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readPayoutAuthorityRef, readPayoutStateTransition } from "./payout-posting-codec";
import { readPayoutNoTransferAuthority } from "./payout-source-authority-codec";
import { readPayoutReceiptSourceAuthorityRef } from "./payout-receipt-authority";
import {
  buildReceiptPostingRecipe,
  normalizeReceiptPostingEnvelopes,
  prepareReceiptPosting,
  readReceiptPostingRoot,
  receiptAuthorityRef,
  sumReceiptRows,
  type ReceiptPostingPrepared
} from "./receipt-liability-posting-core";
import type { FinancePostingAuthorityRef, UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export function buildUnverifiedPayoutRequestPosting(
  input: unknown,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe {
  const envelopes = normalizeReceiptPostingEnvelopes(postingEnvelopeInput, receiptEnvelopeInput);
  const prepared = prepareReceiptPosting(
    readReceiptPostingRoot(input),
    "payout_requested",
    envelopes
  );
  return buildReceiptPostingRecipe(
    prepared,
    receiptAuthorityRef(prepared.receiptBinding),
    envelopes
  );
}

export function buildUnverifiedPayoutNoTransferReleasePosting(
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
  const prepared = prepareReceiptPosting(root, "payout_released", envelopes);
  const authorityRef = readReleaseAuthorityRef(
    root.authority,
    root.previousExposureBinding,
    prepared,
    envelopes.posting
  );
  return buildReceiptPostingRecipe(prepared, authorityRef, envelopes);
}

function readReleaseAuthorityRef(
  input: unknown,
  previousInput: unknown,
  prepared: ReceiptPostingPrepared,
  envelope: FinancePostingDecoderEnvelope
): FinancePostingAuthorityRef {
  const fields = readExactDataRecord(input, [
    "kind",
    "sourceAuthority",
    "receiptBinding",
    "payoutState",
    "exposureTransition",
    "bridgeClosures"
  ]);
  if (fields.kind !== "payout_no_transfer_release_posting") mismatch();
  const source = readPayoutNoTransferAuthority(fields.sourceAuthority);
  const sourceRef = readPayoutReceiptSourceAuthorityRef(prepared.receipt, source);
  const state = readPayoutStateTransition(fields.payoutState, envelope);
  if (
    source.payoutRequestId !== prepared.receipt.sourceKey.sourceId ||
    source.decidedAt !== prepared.receipt.occurredAt ||
    state.to !== outcomeState(source.outcome) ||
    (state.from !== "requested" &&
      state.from !== "under_review" &&
      state.from !== "approved" &&
      state.from !== "processing_manual") ||
    !sameCanonicalFinancePostingValue(fields.receiptBinding, prepared.receiptBinding)
  ) {
    mismatch();
  }
  const closures = readBridgeClosures(fields.bridgeClosures, sourceRef, envelope);
  if (previousInput === null || fields.exposureTransition === null) {
    if (
      previousInput !== null ||
      fields.exposureTransition !== null ||
      closures.length !== 0 ||
      source.bankInitiation !== "not_started" ||
      (state.from !== "requested" && state.from !== "under_review")
    ) {
      mismatch();
    }
    return compositeAuthorityRef(source, {
      kind: "payout_no_transfer_release_posting",
      sourceAuthority: source,
      receiptBinding: prepared.receiptBinding,
      payoutState: state,
      exposureTransition: null,
      bridgeClosures: closures
    });
  }
  const previous = readUnverifiedPayoutBankExposureBinding(previousInput, envelope);
  const next = readUnverifiedPayoutBankExposureTransitionBinding(
    { binding: fields.exposureTransition, previousBinding: previousInput },
    envelope
  );
  if (
    next.transitionKind !== "pre_transfer_released" ||
    next.status !== "released" ||
    next.payoutRequestId !== source.payoutRequestId ||
    next.astrologerUserId !== prepared.receipt.astrologerUserId ||
    next.occurredAt !== source.decidedAt ||
    !sameCanonicalFinancePostingValue(next.transitionAuthorityRef, sourceRef) ||
    (previous.status !== "committed" && previous.status !== "initiated_unreflected") ||
    (source.bankInitiation === "not_started" &&
      (previous.status !== "committed" || state.from !== "approved")) ||
    (source.bankInitiation === "started" &&
      (previous.status !== "initiated_unreflected" || state.from !== "processing_manual"))
  ) {
    mismatch();
  }
  const coveredMinor =
    sumReceiptRows(prepared, "debit") +
    closures.reduce((sum, closure) => sum + closure.amount.amountMinor, 0);
  assertFinancePostingMoneyEqual(
    next.amount,
    { amountMinor: coveredMinor, currency: "RUB" },
    "amount_mismatch"
  );
  return compositeAuthorityRef(source, {
    kind: "payout_no_transfer_release_posting",
    sourceAuthority: source,
    receiptBinding: prepared.receiptBinding,
    payoutState: state,
    exposureTransition: next,
    bridgeClosures: closures
  });
}

function readBridgeClosures(
  input: unknown,
  sourceRef: FinancePostingAuthorityRef,
  envelope: FinancePostingDecoderEnvelope
): readonly PayoutBridgeClosurePostingRef[] {
  const ids = new Set<string>();
  const receiptIds = new Set<string>();
  const journalIds = new Set<string>();
  return Object.freeze(
    readExactDataArray(input, 0, envelope.maxAllocations).map((value) => {
      const fields = readExactDataRecord(value, [
        "bridgeAllocationId",
        "operationReceiptId",
        "operationReceiptDigest",
        "journalTransactionId",
        "journalTransactionDigest",
        "amount",
        "payoutOutcomeAuthorityRef"
      ]);
      const bridgeAllocationId = readFinancePostingIdentifier(fields.bridgeAllocationId);
      const operationReceiptId = readFinancePostingIdentifier(fields.operationReceiptId);
      const journalTransactionId = readFinancePostingIdentifier(fields.journalTransactionId);
      const amount = readFinancePostingMoney(fields.amount);
      const outcomeRef = readPayoutAuthorityRef(fields.payoutOutcomeAuthorityRef);
      if (
        ids.has(bridgeAllocationId) ||
        receiptIds.has(operationReceiptId) ||
        journalIds.has(journalTransactionId) ||
        amount.amountMinor <= 0 ||
        !sameCanonicalFinancePostingValue(outcomeRef, sourceRef)
      ) {
        mismatch();
      }
      ids.add(bridgeAllocationId);
      receiptIds.add(operationReceiptId);
      journalIds.add(journalTransactionId);
      return Object.freeze({
        bridgeAllocationId,
        operationReceiptId,
        operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
        journalTransactionId,
        journalTransactionDigest: readFinancePostingDigest(fields.journalTransactionDigest),
        amount: amount as Money,
        payoutOutcomeAuthorityRef: outcomeRef
      });
    })
  );
}

function outcomeState(outcome: "rejected" | "cancelled" | "failed_pre_transfer") {
  return outcome === "failed_pre_transfer" ? "failed" : outcome;
}

function compositeAuthorityRef(
  source: { readonly authorityId: string; readonly version: number },
  authority: unknown
): FinancePostingAuthorityRef {
  return Object.freeze({
    kind: "payout_no_transfer_release_posting",
    authorityId: source.authorityId,
    version: source.version,
    canonicalDigest: hashFinanceCommandPayload(authority)
  });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
