import { createHash } from "node:crypto";

import type {
  FinanceDigest,
  FinanceProviderAccountIdentity,
  FinanceOperationResourcePolicyReader,
  OnlineWalletRefundApplicationUnitOfWork,
  OnlineWalletRefundPositionReader,
  VerifiedWebhookSemanticEvidence,
  WebhookProcessingErrorClass
} from "@elevenhouse/domain/finance-core";
import { resolveFinanceOperationEnvelope } from "@elevenhouse/domain/finance-core";
import type {
  ClaimedRefundedClientOrderWebhook,
  RefundedClientOrderWebhookClaimPort
} from "@elevenhouse/db/finance";

import type {
  ArcPayCanonicalPaymentReader,
  ArcPayCanonicalPaymentReaderError,
  ArcPayCanonicalRefundOutcome
} from "../arc-pay/arc-pay-canonical-payment-reader";
import { ArcPayWebhookPayloadError, parseArcPayWebhook } from "../arc-pay/arc-pay-webhook";
import type {
  CapturedClientOrderCorrelationPort,
  ClaimedWebhookArtifactResolver
} from "./canonical-client-order-capture.processor";

export type CanonicalRefundEvidenceSealer = Readonly<{
  sealCanonicalRefund(
    input: Readonly<{
      claim: ClaimedRefundedClientOrderWebhook;
      economicPaymentIntentId: string;
      providerPaymentId: string;
      providerRefundId: string;
      refundDeltaMinor: number;
      previousCumulativeRefundedMinor: number;
      cumulativeRefundedMinor: number;
      observedAt: string;
      rawCanonicalResponseBytes: Uint8Array;
    }>
  ): Promise<VerifiedWebhookSemanticEvidence>;
}>;

export type CanonicalClientOrderRefundProcessor = Readonly<{
  processOne(): Promise<
    | Readonly<{ kind: "idle" }>
    | Readonly<{
        kind: "committed";
        effect: "applied_once" | "semantic_replay" | "blocked_payout_outcome";
        inboxItemId: string;
      }>
  >;
}>;

export class CanonicalClientOrderRefundProcessorError extends Error {
  readonly code = "canonical_client_order_refund_processor_error" as const;

  constructor(
    readonly reason:
      | "claimed_webhook_invalid"
      | "canonical_read_unavailable"
      | "canonical_correlation_invalid"
      | "operation_policy_missing"
      | "canonical_refund_not_succeeded"
      | "sealed_evidence_invalid"
      | "commit_failed"
  ) {
    super("Canonical client-order refund could not be processed safely");
    this.name = "CanonicalClientOrderRefundProcessorError";
  }
}

/**
 * Processes one durable ArcPay `payment.refunded` inbox item. The raw webhook only supplies the
 * operation reference and expected progression; no V2 wallet effect occurs until ArcPay's
 * canonical payment resource confirms the exact refund operation and cumulative amount.
 */
export function createCanonicalClientOrderRefundProcessor(
  input: Readonly<{
    claims: RefundedClientOrderWebhookClaimPort;
    webhookArtifacts: ClaimedWebhookArtifactResolver;
    canonicalPayments: Pick<
      ArcPayCanonicalPaymentReader,
      "readPaymentOutcomeById" | "readRefundOutcome"
    >;
    correlations: CapturedClientOrderCorrelationPort;
    positions: OnlineWalletRefundPositionReader;
    policies: FinanceOperationResourcePolicyReader;
    evidence: CanonicalRefundEvidenceSealer;
    application: OnlineWalletRefundApplicationUnitOfWork;
    processorVersion: number;
  }>
): CanonicalClientOrderRefundProcessor {
  return Object.freeze({
    async processOne() {
      const claim = await input.claims.claimNextRefundedClientOrderWebhook();
      if (!claim) return Object.freeze({ kind: "idle" as const });
      try {
        const rawWebhookBytes = await input.webhookArtifacts.loadClaimedWebhookBytes(claim);
        const webhook = parseClaimedRefundedWebhook(claim, rawWebhookBytes);
        const discovery = await input.canonicalPayments.readPaymentOutcomeById({
          providerPaymentId: webhook.providerPaymentId
        });
        const correlation = await input.correlations.resolveCapturedClientOrder({
          providerAccount: claim.providerAccount,
          providerPaymentId: webhook.providerPaymentId,
          externalId: discovery.payment.externalId
        });
        assertCorrelation(correlation, claim.providerAccount, webhook.providerPaymentId, discovery.payment);
        const position = await input.positions.findRefundPosition({
          providerAccount: claim.providerAccount,
          providerPaymentId: webhook.providerPaymentId
        });
        if (
          !position ||
          position.economicPaymentIntentId !== correlation.economicPaymentIntentId ||
          !nonNegativeMinorString(position.previousCumulativeRefundedMinor)
        ) {
          fail("canonical_correlation_invalid");
        }
        const policy = await input.policies.findPublishedForOperation({
          operationKind: "refund_execute"
        });
        if (!policy) fail("operation_policy_missing");
        const operationEnvelope = resolveFinanceOperationEnvelope({
          policy,
          operationKind: "refund_execute"
        });
        const canonical = await input.canonicalPayments.readRefundOutcome({
          providerPaymentId: webhook.providerPaymentId,
          expectedExternalId: correlation.externalId,
          providerRefundId: webhook.providerRefundId,
          expectedRefundAmountMinor: webhook.refundAmountMinor,
          previousCumulativeRefundedMinor: Number(position.previousCumulativeRefundedMinor),
          expectedCumulativeRefundedMinor: webhook.cumulativeRefundedMinor
        });
        assertCanonicalRefund(canonical.refund, {
          providerPaymentId: webhook.providerPaymentId,
          externalId: correlation.externalId,
          providerRefundId: webhook.providerRefundId,
          refundAmountMinor: webhook.refundAmountMinor,
          cumulativeRefundedMinor: webhook.cumulativeRefundedMinor
        });
        if (canonical.refund.status !== "succeeded") fail("canonical_refund_not_succeeded");
        const semanticEvidence = await input.evidence.sealCanonicalRefund({
          claim,
          economicPaymentIntentId: position.economicPaymentIntentId,
          providerPaymentId: webhook.providerPaymentId,
          providerRefundId: webhook.providerRefundId,
          refundDeltaMinor: canonical.refund.amountMinor,
          previousCumulativeRefundedMinor: Number(position.previousCumulativeRefundedMinor),
          cumulativeRefundedMinor: canonical.refund.cumulativeRefundedMinor,
          observedAt: canonical.refund.observedAt,
          rawCanonicalResponseBytes: canonical.rawResponseBytes
        });
        assertSemanticEvidence(semanticEvidence, claim, position.economicPaymentIntentId, canonical.refund);
        const receipt = await input.application.applyCanonicalOnlineWalletRefund({
          semanticFact: {
            inboxItemId: claim.inboxItemId,
            expectedInboxVersion: claim.inboxVersion,
            expectedCheckpointSequence: claim.expectedCheckpointSequence,
            processorVersion: input.processorVersion,
            semanticEvidence,
            operationEnvelope
          },
          refund: {
            providerPaymentId: webhook.providerPaymentId,
            providerRefundId: webhook.providerRefundId,
            refundDeltaMinor: String(canonical.refund.amountMinor),
            previousCumulativeRefundedMinor: position.previousCumulativeRefundedMinor,
            cumulativeRefundedMinor: String(canonical.refund.cumulativeRefundedMinor),
            occurredAt: canonical.refund.observedAt
          }
        });
        return Object.freeze({
          kind: "committed" as const,
          effect: receipt.effect,
          inboxItemId: claim.inboxItemId
        });
      } catch (error) {
        const processed = normalizeProcessingError(error);
        try {
          await input.claims.recordFailure({ claim, errorClass: processed.errorClass });
        } catch {
          // The expiring lease remains the recovery path; preserve the primary processing error.
        }
        throw processed.error;
      }
    }
  } satisfies CanonicalClientOrderRefundProcessor);
}

function parseClaimedRefundedWebhook(
  claim: ClaimedRefundedClientOrderWebhook,
  rawWebhookBytes: Uint8Array
): Readonly<{
  providerPaymentId: string;
  providerRefundId: string;
  refundAmountMinor: number;
  cumulativeRefundedMinor: number;
}> {
  if (
    claim.providerEventType !== "payment.refunded" ||
    claim.sealedWebhookArtifact.contentType !== "application/json" ||
    rawWebhookBytes.byteLength !== claim.sealedWebhookArtifact.byteLength ||
    digest(rawWebhookBytes) !== claim.sealedWebhookArtifact.sha256Digest
  ) {
    fail("claimed_webhook_invalid");
  }
  let event;
  try {
    event = parseArcPayWebhook({
      webhookId: claim.webhookId,
      rawBody: new TextDecoder("utf-8", { fatal: true }).decode(rawWebhookBytes)
    });
  } catch (error) {
    if (error instanceof ArcPayWebhookPayloadError) fail("claimed_webhook_invalid");
    throw error;
  }
  if (
    event.type !== "payment.refunded" ||
    event.providerWebhookId !== claim.webhookId ||
    event.environment !== claim.receivingEnvironment ||
    event.moneyFacts.kind !== "bounded"
  ) {
    fail("claimed_webhook_invalid");
  }
  const [refundAmount, cumulativeRefunded] = event.moneyFacts.amounts;
  const payloadData = record(event.payload.data);
  if (
    !refundAmount ||
    !cumulativeRefunded ||
    refundAmount.currency !== "RUB" ||
    cumulativeRefunded.currency !== "RUB" ||
    cumulativeRefunded.amountMinor < refundAmount.amountMinor
  ) {
    fail("claimed_webhook_invalid");
  }
  return Object.freeze({
    providerPaymentId: event.providerPaymentId,
    providerRefundId: uuid(payloadData.refund_id),
    refundAmountMinor: refundAmount.amountMinor,
    cumulativeRefundedMinor: cumulativeRefunded.amountMinor
  });
}

function assertCorrelation(
  correlation: Awaited<ReturnType<CapturedClientOrderCorrelationPort["resolveCapturedClientOrder"]>>,
  providerAccount: FinanceProviderAccountIdentity,
  providerPaymentId: string,
  discovery: Readonly<{ providerPaymentId: string; externalId: string }>
): void {
  if (
    correlation.externalId !== discovery.externalId ||
    discovery.providerPaymentId !== providerPaymentId ||
    !sameProviderAccount(correlation.providerAccount, providerAccount) ||
    !positiveMinorString(correlation.expectedAmountMinor) ||
    correlation.expectedCurrency !== "RUB" ||
    !positiveSafeInteger(correlation.expectedEconomicPaymentVersion)
  ) {
    fail("canonical_correlation_invalid");
  }
}

function assertCanonicalRefund(
  refund: ArcPayCanonicalRefundOutcome,
  expected: Readonly<{
    providerPaymentId: string;
    externalId: string;
    providerRefundId: string;
    refundAmountMinor: number;
    cumulativeRefundedMinor: number;
  }>
): void {
  if (
    refund.providerPaymentId !== expected.providerPaymentId ||
    refund.externalId !== expected.externalId ||
    refund.providerRefundId !== expected.providerRefundId ||
    refund.amountMinor !== expected.refundAmountMinor ||
    refund.cumulativeRefundedMinor !== expected.cumulativeRefundedMinor ||
    refund.currency !== "RUB" ||
    !Number.isFinite(Date.parse(refund.observedAt))
  ) {
    fail("canonical_correlation_invalid");
  }
}

function assertSemanticEvidence(
  evidence: VerifiedWebhookSemanticEvidence,
  claim: ClaimedRefundedClientOrderWebhook,
  economicPaymentIntentId: string,
  refund: ArcPayCanonicalRefundOutcome
): void {
  if (
    evidence.semanticSourceKind !== "refund" ||
    evidence.semanticSourceId !== refund.providerRefundId ||
    evidence.purpose !== "client_order" ||
    evidence.webhookId !== claim.webhookId ||
    !sameProviderAccount(evidence.providerAccount, claim.providerAccount) ||
    evidence.economicPaymentIntentId !== economicPaymentIntentId ||
    evidence.economicPaymentSessionId !== null ||
    evidence.providerPaymentId !== null ||
    evidence.amountMinor !== null ||
    evidence.currency !== null ||
    evidence.observedAt !== refund.observedAt
  ) {
    fail("sealed_evidence_invalid");
  }
}

function normalizeProcessingError(error: unknown): Readonly<{
  error: CanonicalClientOrderRefundProcessorError;
  errorClass: WebhookProcessingErrorClass;
}> {
  if (error instanceof CanonicalClientOrderRefundProcessorError) {
    return Object.freeze({
      error,
      errorClass:
        error.reason === "canonical_read_unavailable" ||
        error.reason === "canonical_refund_not_succeeded"
          ? "canonical_provider_read_unavailable"
          : "processor_contract_violation"
    });
  }
  if (isArcCanonicalReadUnavailable(error)) {
    return Object.freeze({
      error: new CanonicalClientOrderRefundProcessorError("canonical_read_unavailable"),
      errorClass: "canonical_provider_read_unavailable"
    });
  }
  return Object.freeze({
    error: new CanonicalClientOrderRefundProcessorError("commit_failed"),
    errorClass: "unexpected_internal_failure"
  });
}

function isArcCanonicalReadUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Partial<ArcPayCanonicalPaymentReaderError>;
  return record.code === "ARC_PAY_CANONICAL_PAYMENT_READER_ERROR" && record.reason === "transport";
}

function sameProviderAccount(
  left: FinanceProviderAccountIdentity,
  right: FinanceProviderAccountIdentity
): boolean {
  return (
    left.seriesId === right.seriesId &&
    left.providerAccountId === right.providerAccountId &&
    left.identityVersion === right.identityVersion
  );
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("claimed_webhook_invalid");
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    fail("claimed_webhook_invalid");
  }
  return value;
}

function positiveMinorString(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function nonNegativeMinorString(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value);
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function digest(value: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as FinanceDigest;
}

function fail(reason: CanonicalClientOrderRefundProcessorError["reason"]): never {
  throw new CanonicalClientOrderRefundProcessorError(reason);
}
