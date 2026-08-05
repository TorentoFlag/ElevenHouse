import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { assertPayoutApprovalMatchesRequestReceipt } from "./payout-approval-request-receipt";
import {
  readUnverifiedPayoutBankExposureBinding,
  readUnverifiedPayoutBankExposureTransitionBinding
} from "./payout-bank-exposure-binding";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readPayoutAuthorizationProof,
  readPayoutBeneficiarySnapshot,
  readPayoutStateTransition
} from "./payout-posting-codec";
import { readUnverifiedPayableLotPostingAuthorityBinding } from "./hold-payout-receipt-binding";
import { readUnverifiedPayoutBankLiquidityDecisionBinding } from "./payout-liquidity-binding";
import { createPayoutStateNoPostingRecipe } from "./payout-no-posting-recipe";
import { readFinancePostingReceiptDecoderEnvelope } from "./payable-lot-receipt-envelope";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type NoPostingRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "no_posting" }>;

export function buildUnverifiedPayoutApprovalNoPosting(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptDecoderEnvelopeInput: PayableLotReceiptDecoderEnvelope
): NoPostingRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const receiptEnvelope = readFinancePostingReceiptDecoderEnvelope(receiptDecoderEnvelopeInput);
  const root = readExactDataRecord(input, [
    "authority",
    "previousExposureBinding",
    "requestReceipt"
  ]);
  if (root.previousExposureBinding !== null) mismatch();
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "authorityId",
    "version",
    "payoutRequestId",
    "astrologerUserId",
    "amount",
    "beneficiarySnapshot",
    "bankCashPoolId",
    "payoutState",
    "requestReceiptBinding",
    "liquidityDecision",
    "exposureTransition",
    "authorizationProof",
    "approvedAt"
  ]);
  if (fields.kind !== "payout_approval_no_posting") mismatch();
  const core = readApprovalCore(fields, envelope);
  assertPayoutApprovalMatchesRequestReceipt(root.requestReceipt, core, envelope, receiptEnvelope);
  const digest = hashFinanceCommandPayload(core);
  const proof = readPayoutAuthorizationProof(fields.authorizationProof, {
    actionKind: "payout_approve",
    aggregateId: core.payoutRequestId,
    expectedVersion: core.payoutState.expectedVersion,
    payloadHash: digest,
    occurredAt: core.approvedAt
  });
  const exposure = readUnverifiedPayoutBankExposureTransitionBinding(
    { binding: fields.exposureTransition, previousBinding: null },
    envelope
  );
  if (
    exposure.transitionKind !== "approval_committed" ||
    exposure.status !== "committed" ||
    exposure.payoutRequestId !== core.payoutRequestId ||
    exposure.astrologerUserId !== core.astrologerUserId ||
    exposure.bankCashPoolId !== core.bankCashPoolId ||
    exposure.approvedByActorUserId !== proof.actorUserId ||
    exposure.occurredAt !== core.approvedAt ||
    !sameCanonicalFinancePostingValue(exposure.beneficiarySnapshot, core.beneficiarySnapshot) ||
    !sameCanonicalFinancePostingValue(exposure.transitionAuthorityRef, {
      kind: core.kind,
      authorityId: core.authorityId,
      version: core.version,
      canonicalDigest: digest
    })
  ) {
    mismatch();
  }
  assertFinancePostingMoneyEqual(exposure.amount, core.amount, "amount_mismatch");
  return createPayoutStateNoPostingRecipe(
    core.authorityId,
    core.version,
    core.payoutRequestId,
    "approved",
    digest,
    envelope
  );
}

export function buildUnverifiedPayoutBankWorkInitiatedNoPosting(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): NoPostingRecipe {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["authority", "previousExposureBinding"]);
  const fields = readExactDataRecord(root.authority, [
    "kind",
    "authorityId",
    "version",
    "payoutRequestId",
    "amount",
    "beneficiarySnapshot",
    "bankCashPoolId",
    "payoutState",
    "exposureTransition",
    "authorizationProof",
    "initiatedAt"
  ]);
  if (fields.kind !== "payout_bank_work_initiated_no_posting") mismatch();
  const core = readInitiationCore(fields, envelope);
  const digest = hashFinanceCommandPayload(core);
  readPayoutAuthorizationProof(fields.authorizationProof, {
    actionKind: "payout_start_processing",
    aggregateId: core.payoutRequestId,
    expectedVersion: core.payoutState.expectedVersion,
    payloadHash: digest,
    occurredAt: core.initiatedAt
  });
  const previous = readUnverifiedPayoutBankExposureBinding(root.previousExposureBinding, envelope);
  const exposure = readUnverifiedPayoutBankExposureTransitionBinding(
    { binding: fields.exposureTransition, previousBinding: root.previousExposureBinding },
    envelope
  );
  if (
    previous.status !== "committed" ||
    exposure.transitionKind !== "bank_work_initiated" ||
    exposure.status !== "initiated_unreflected" ||
    exposure.payoutRequestId !== core.payoutRequestId ||
    exposure.bankCashPoolId !== core.bankCashPoolId ||
    exposure.occurredAt !== core.initiatedAt ||
    !sameCanonicalFinancePostingValue(exposure.beneficiarySnapshot, core.beneficiarySnapshot) ||
    !sameCanonicalFinancePostingValue(exposure.transitionAuthorityRef, {
      kind: core.kind,
      authorityId: core.authorityId,
      version: core.version,
      canonicalDigest: digest
    })
  ) {
    mismatch();
  }
  assertFinancePostingMoneyEqual(exposure.amount, core.amount, "amount_mismatch");
  return createPayoutStateNoPostingRecipe(
    core.authorityId,
    core.version,
    core.payoutRequestId,
    "bank_work_initiated",
    digest,
    envelope
  );
}

function readApprovalCore(
  fields: Readonly<Record<string, unknown>>,
  envelope: FinancePostingDecoderEnvelope
) {
  const state = readPayoutStateTransition(fields.payoutState, envelope);
  const receipt = readUnverifiedPayableLotPostingAuthorityBinding(
    fields.requestReceiptBinding,
    envelope
  );
  const liquidity = readUnverifiedPayoutBankLiquidityDecisionBinding(
    fields.liquidityDecision,
    envelope
  );
  const approvedAt = readFinancePostingInstant(fields.approvedAt);
  const payoutRequestId = readFinancePostingIdentifier(fields.payoutRequestId);
  const astrologerUserId = readFinancePostingIdentifier(fields.astrologerUserId);
  const bankCashPoolId = readFinancePostingIdentifier(fields.bankCashPoolId);
  const amount = readFinancePostingMoney(fields.amount);
  const beneficiarySnapshot = readPayoutBeneficiarySnapshot(fields.beneficiarySnapshot);
  if (
    state.from !== "under_review" ||
    state.to !== "approved" ||
    receipt.operationKind !== "payout_requested" ||
    receipt.sourceKey.kind !== "payout" ||
    receipt.sourceKey.sourceId !== payoutRequestId ||
    receipt.sourceKey.operation !== "requested" ||
    liquidity.payoutRequestId !== payoutRequestId ||
    liquidity.bankCashPoolId !== bankCashPoolId ||
    compareFinancePostingInstants(liquidity.decidedAt, receipt.issuedAt) < 0 ||
    compareFinancePostingInstants(approvedAt, liquidity.decidedAt) < 0
  )
    mismatch();
  assertFinancePostingMoneyEqual(liquidity.amount, amount, "amount_mismatch");
  return Object.freeze({
    kind: "payout_approval_no_posting" as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    payoutRequestId,
    astrologerUserId,
    amount,
    beneficiarySnapshot,
    bankCashPoolId,
    payoutState: state,
    requestReceiptBinding: receipt,
    liquidityDecision: liquidity,
    approvedAt
  });
}

function readInitiationCore(
  fields: Readonly<Record<string, unknown>>,
  envelope: FinancePostingDecoderEnvelope
) {
  const payoutState = readPayoutStateTransition(fields.payoutState, envelope);
  if (payoutState.from !== "approved" || payoutState.to !== "processing_manual") mismatch();
  return Object.freeze({
    kind: "payout_bank_work_initiated_no_posting" as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    amount: readFinancePostingMoney(fields.amount),
    beneficiarySnapshot: readPayoutBeneficiarySnapshot(fields.beneficiarySnapshot),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    payoutState,
    initiatedAt: readFinancePostingInstant(fields.initiatedAt)
  });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
