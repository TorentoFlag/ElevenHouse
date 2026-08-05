import {
  hashFinanceCommandPayload,
  type FinanceTransactionAuthorizationProof
} from "../finance-authorization";
import type { VerifiedRefundApprovalAuthority } from "./ports/trusted-finance-evidence";

export class RefundApprovalAuthorityIssuanceError extends Error {
  readonly code = "refund_approval_authority_issuance_invalid" as const;

  constructor() {
    super("Refund approval authority could not be issued from the finance authorization proof");
    this.name = "RefundApprovalAuthorityIssuanceError";
  }
}

/** The exact payload a super-admin passkey approves before a server creates a refund case. */
export type RefundDecisionAuthorizationPayload = Readonly<{
  candidateId: string;
  candidateReviewId: string;
  candidateVersion: number;
  refundAmountMinor: string;
  currency: "RUB";
}>;

/**
 * Server-only authority issuer. It is deliberately the sole place that constructs the branded
 * refund approval capability; HTTP handlers and adapters receive only the resulting opaque value.
 *
 * The caller must supply every other field from rows locked in the same transaction that consumed
 * `authorization`. This function binds the operator's passkey proof to the candidate review and
 * exact incremental amount, while the caller binds those facts to the captured order/payment.
 */
export function issueVerifiedRefundApprovalAuthority(input: Readonly<{
  authorization: FinanceTransactionAuthorizationProof;
  candidateId: string;
  candidateReviewId: string;
  candidateVersion: number;
  refundId: string;
  refundVersion: number;
  orderId: string;
  economicPaymentIntentId: string;
  previousCumulativeRefundedMinor: string;
  approvedCumulativeRefundedMinor: string;
  allocationAuthorityId: string;
  allocationAuthorityVersion: string;
  allocationAuthorityDigest: string;
  approvalAuthorityId: string;
  approvedAt: string;
}>): VerifiedRefundApprovalAuthority {
  const candidateId = identifier(input.candidateId);
  const candidateReviewId = identifier(input.candidateReviewId);
  const candidateVersion = version(input.candidateVersion);
  const refundId = identifier(input.refundId);
  const refundVersion = version(input.refundVersion);
  const orderId = identifier(input.orderId);
  const economicPaymentIntentId = identifier(input.economicPaymentIntentId);
  const previousCumulativeRefundedMinor = nonNegativeMinor(input.previousCumulativeRefundedMinor);
  const approvedCumulativeRefundedMinor = positiveMinor(input.approvedCumulativeRefundedMinor);
  if (BigInt(approvedCumulativeRefundedMinor) <= BigInt(previousCumulativeRefundedMinor)) fail();
  const allocationAuthorityId = identifier(input.allocationAuthorityId);
  const allocationAuthorityVersion = positiveRevision(input.allocationAuthorityVersion);
  const allocationAuthorityDigest = digest(input.allocationAuthorityDigest);
  const approvalAuthorityId = identifier(input.approvalAuthorityId);
  const approvedAt = instant(input.approvedAt);
  const expectedPayload: RefundDecisionAuthorizationPayload = Object.freeze({
    candidateId,
    candidateReviewId,
    candidateVersion,
    refundAmountMinor: String(BigInt(approvedCumulativeRefundedMinor) - BigInt(previousCumulativeRefundedMinor)),
    currency: "RUB"
  });
  assertAuthorization(input.authorization, expectedPayload);
  const authorityDigest = hashFinanceCommandPayload({
    kind: "refund_approval_authority.v1",
    refundId,
    refundVersion,
    orderId,
    economicPaymentIntentId,
    previousCumulativeRefundedMinor,
    approvedCumulativeRefundedMinor,
    allocationAuthorityId,
    allocationAuthorityVersion,
    approvedByActorId: input.authorization.actorUserId,
    approvedAt
  });
  return Object.freeze({
    kind: "verified_refund_approval_authority",
    refundId,
    refundVersion,
    orderId,
    economicPaymentIntentId,
    previousCumulativeRefundedMinor,
    approvedCumulativeRefundedMinor,
    allocationAuthorityId,
    allocationAuthorityVersion,
    allocationAuthorityDigest,
    approvalAuthorityId,
    approvalAuthorityVersion: "1",
    approvalAuthorityDigest: authorityDigest,
    approvedByActorId: input.authorization.actorUserId,
    approvedAt
  }) as VerifiedRefundApprovalAuthority;
}

function assertAuthorization(
  proof: FinanceTransactionAuthorizationProof,
  expectedPayload: RefundDecisionAuthorizationPayload
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

function identifier(value: unknown): string {
  // eslint-disable-next-line no-control-regex -- Exact ASCII C0/DEL rejection is part of the authority grammar.
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}

function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail();
  return value;
}

function positiveRevision(value: unknown): string {
  return positiveMinor(value);
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

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) fail();
  return value as `sha256:${string}`;
}

function instant(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) fail();
  return value;
}

function fail(): never {
  throw new RefundApprovalAuthorityIssuanceError();
}
