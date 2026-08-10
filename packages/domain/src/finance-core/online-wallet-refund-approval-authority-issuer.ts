import {
  hashFinanceCommandPayload,
  type FinanceTransactionAuthorizationProof
} from "../finance-authorization";
import { hasAsciiControlCharacter } from "./finance-string-validation";
import type { FinanceProviderAccountIdentity } from "./ports/finance-port-types";
import type { VerifiedOnlineWalletRefundApprovalAuthority } from "./ports/trusted-finance-evidence";

export class OnlineWalletRefundApprovalAuthorityIssuanceError extends Error {
  readonly code = "online_wallet_refund_approval_authority_issuance_invalid" as const;

  constructor() {
    super("Online-wallet refund approval authority could not be issued from the finance authorization proof");
    this.name = "OnlineWalletRefundApprovalAuthorityIssuanceError";
  }
}

/** The sole browser-originated monetary decision; every other approval fact is server-derived. */
export type OnlineWalletRefundDecisionAuthorizationPayload = Readonly<{
  candidateId: string;
  candidateReviewId: string;
  candidateVersion: number;
  refundAmountMinor: string;
  currency: "RUB";
}>;

/**
 * Issues the nominal V2 refund capability only after the admin passkey proof is consumed in the
 * same transaction that has locked and re-read the candidate/capture/wallet position.
 */
export function issueVerifiedOnlineWalletRefundApprovalAuthority(input: Readonly<{
  authorization: FinanceTransactionAuthorizationProof;
  refundCaseId: string;
  refundCandidateId: string;
  refundCandidateReviewId: string;
  refundCandidateVersion: number;
  orderId: string;
  captureApplicationId: string;
  walletId: string;
  economicPaymentIntentId: string;
  providerAccount: FinanceProviderAccountIdentity;
  providerPaymentId: string;
  previousCumulativeRefundedMinor: string;
  approvedCumulativeRefundedMinor: string;
  approvedAt: string;
}>): VerifiedOnlineWalletRefundApprovalAuthority {
  const refundCaseId = identifier(input.refundCaseId);
  const refundCandidateId = identifier(input.refundCandidateId);
  const refundCandidateReviewId = identifier(input.refundCandidateReviewId);
  const refundCandidateVersion = version(input.refundCandidateVersion);
  const orderId = identifier(input.orderId);
  const captureApplicationId = identifier(input.captureApplicationId);
  const walletId = identifier(input.walletId);
  const economicPaymentIntentId = identifier(input.economicPaymentIntentId);
  const providerAccount = providerBinding(input.providerAccount);
  const providerPaymentId = identifier(input.providerPaymentId);
  const previousCumulativeRefundedMinor = nonNegativeMinor(input.previousCumulativeRefundedMinor);
  const approvedCumulativeRefundedMinor = positiveMinor(input.approvedCumulativeRefundedMinor);
  if (BigInt(approvedCumulativeRefundedMinor) <= BigInt(previousCumulativeRefundedMinor)) fail();
  const approvedAt = instant(input.approvedAt);
  const refundAmountMinor = String(
    BigInt(approvedCumulativeRefundedMinor) - BigInt(previousCumulativeRefundedMinor)
  );
  const expectedPayload: OnlineWalletRefundDecisionAuthorizationPayload = Object.freeze({
    candidateId: refundCandidateId,
    candidateReviewId: refundCandidateReviewId,
    candidateVersion: refundCandidateVersion,
    refundAmountMinor,
    currency: "RUB"
  });
  assertAuthorization(input.authorization, expectedPayload);
  const approvalAuthorityDigest = hashFinanceCommandPayload({
    kind: "online_wallet_refund_approval_authority.v1",
    refundCaseId,
    refundCandidateId,
    refundCandidateReviewId,
    refundCandidateVersion,
    orderId,
    captureApplicationId,
    walletId,
    economicPaymentIntentId,
    providerAccount,
    providerPaymentId,
    previousCumulativeRefundedMinor,
    approvedCumulativeRefundedMinor,
    approvedByActorId: input.authorization.actorUserId,
    approvedAt
  });
  return Object.freeze({
    kind: "verified_online_wallet_refund_approval_authority" as const,
    refundCaseId,
    refundCandidateId,
    refundCandidateVersion,
    orderId,
    captureApplicationId,
    walletId,
    economicPaymentIntentId,
    providerAccount,
    providerPaymentId,
    previousCumulativeRefundedMinor,
    approvedCumulativeRefundedMinor,
    approvalAuthorityId: input.authorization.authorizationId,
    approvalAuthorityVersion: "1",
    approvalAuthorityDigest,
    approvedByActorId: input.authorization.actorUserId,
    approvedAt
  }) as VerifiedOnlineWalletRefundApprovalAuthority;
}

function assertAuthorization(
  proof: FinanceTransactionAuthorizationProof,
  expectedPayload: OnlineWalletRefundDecisionAuthorizationPayload
): void {
  if (
    proof.status !== "consumed" ||
    proof.actionKind !== "refund_execute" ||
    proof.aggregateId !== expectedPayload.candidateId ||
    proof.expectedVersion !== expectedPayload.candidateVersion ||
    proof.payloadHash !== hashFinanceCommandPayload(expectedPayload) ||
    !identifier(proof.actorUserId) ||
    !identifier(proof.sessionId) ||
    !identifier(proof.authorizationId) ||
    !instant(proof.verifiedAt) ||
    !instant(proof.expiresAt)
  ) {
    fail();
  }
}

function providerBinding(value: unknown): FinanceProviderAccountIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const fields = value as Record<string, unknown>;
  if (Reflect.ownKeys(fields).length !== 3) fail();
  return Object.freeze({
    seriesId: identifier(fields.seriesId),
    providerAccountId: identifier(fields.providerAccountId),
    identityVersion: version(fields.identityVersion)
  });
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail();
  }
  return value;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail();
  return Number(value);
}

function nonNegativeMinor(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) fail();
  return value;
}

function positiveMinor(value: unknown): string {
  const normalized = nonNegativeMinor(value);
  if (normalized === "0") fail();
  return normalized;
}

function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail();
  }
  return value;
}

function fail(): never {
  throw new OnlineWalletRefundApprovalAuthorityIssuanceError();
}
