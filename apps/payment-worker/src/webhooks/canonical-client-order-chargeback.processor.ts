import { createHash } from "node:crypto";

import type {
  FinanceDigest,
  FinanceOperationResourcePolicyReader,
  FinanceProviderAccountIdentity,
  OnlineWalletChargebackCaseUnitOfWork,
  VerifiedWebhookSemanticEvidence,
  WebhookProcessingErrorClass
} from "@elevenhouse/domain/finance-core";
import { resolveFinanceOperationEnvelope } from "@elevenhouse/domain/finance-core";
import type {
  ChargebackClientOrderWebhookClaimPort,
  ClaimedChargebackClientOrderWebhook
} from "@elevenhouse/db/finance";

import type {
  ArcPayCanonicalPaymentOutcome,
  ArcPayCanonicalPaymentReader,
  ArcPayCanonicalPaymentReaderError
} from "../arc-pay/arc-pay-canonical-payment-reader";
import { ArcPayWebhookPayloadError, parseArcPayWebhook } from "../arc-pay/arc-pay-webhook";
import type {
  CapturedClientOrderCorrelationPort,
  ClaimedWebhookArtifactResolver
} from "./canonical-client-order-capture.processor";

export type CanonicalChargebackEvidenceSealer = Readonly<{
  sealCanonicalChargeback(input: Readonly<{
    claim: ClaimedChargebackClientOrderWebhook;
    economicPaymentIntentId: string;
    providerPaymentId: string;
    disputedPrincipalMinor: number;
    observedAt: string;
    rawCanonicalResponseBytes: Uint8Array;
  }>): Promise<VerifiedWebhookSemanticEvidence>;
}>;

export type CanonicalClientOrderChargebackProcessor = Readonly<{
  processOne(): Promise<
    | Readonly<{ kind: "idle" }>
    | Readonly<{ kind: "committed"; effect: "applied_once" | "semantic_replay"; inboxItemId: string }>
  >;
}>;

export class CanonicalClientOrderChargebackProcessorError extends Error {
  readonly code = "canonical_client_order_chargeback_processor_error" as const;

  constructor(
    readonly reason:
      | "claimed_webhook_invalid"
      | "canonical_read_unavailable"
      | "canonical_correlation_invalid"
      | "canonical_chargeback_not_confirmed"
      | "operation_policy_missing"
      | "sealed_evidence_invalid"
      | "commit_failed"
  ) {
    super("Canonical client-order chargeback could not be processed safely");
    this.name = "CanonicalClientOrderChargebackProcessorError";
  }
}

/**
 * A signed ArcPay chargeback webhook opens only a provisional provider loss. The worker requires
 * a second correlated ArcPay payment read, but does not invent a win/loss outcome because the
 * public provider contract has no authoritative outcome event for that lifecycle.
 */
export function createCanonicalClientOrderChargebackProcessor(input: Readonly<{
  claims: ChargebackClientOrderWebhookClaimPort;
  webhookArtifacts: ClaimedWebhookArtifactResolver;
  canonicalPayments: Pick<ArcPayCanonicalPaymentReader, "readPaymentOutcomeById">;
  correlations: CapturedClientOrderCorrelationPort;
  policies: FinanceOperationResourcePolicyReader;
  evidence: CanonicalChargebackEvidenceSealer;
  application: OnlineWalletChargebackCaseUnitOfWork;
  processorVersion: number;
}>): CanonicalClientOrderChargebackProcessor {
  return Object.freeze({
    async processOne() {
      const claim = await input.claims.claimNextChargebackClientOrderWebhook();
      if (!claim) return Object.freeze({ kind: "idle" as const });
      try {
        const rawWebhookBytes = await input.webhookArtifacts.loadClaimedWebhookBytes(claim);
        const webhook = parseClaimedChargebackWebhook(claim, rawWebhookBytes);
        const canonical = await input.canonicalPayments.readPaymentOutcomeById({
          providerPaymentId: webhook.providerPaymentId
        });
        const correlation = await input.correlations.resolveCapturedClientOrder({
          providerAccount: claim.providerAccount,
          providerPaymentId: webhook.providerPaymentId,
          externalId: canonical.payment.externalId
        });
        assertCanonicalChargeback(canonical.payment, correlation, claim.providerAccount, webhook);
        const policy = await input.policies.findPublishedForOperation({
          operationKind: "chargeback_record_provisional"
        });
        if (!policy) fail("operation_policy_missing");
        const semanticEvidence = await input.evidence.sealCanonicalChargeback({
          claim,
          economicPaymentIntentId: correlation.economicPaymentIntentId,
          providerPaymentId: webhook.providerPaymentId,
          disputedPrincipalMinor: webhook.disputedPrincipalMinor,
          observedAt: canonical.payment.observedAt,
          rawCanonicalResponseBytes: canonical.rawResponseBytes
        });
        assertSemanticEvidence(semanticEvidence, claim, correlation.economicPaymentIntentId, canonical.payment);
        const receipt = await input.application.applyVerifiedOnlineWalletChargebackNotice({
          semanticFact: {
            inboxItemId: claim.inboxItemId,
            expectedInboxVersion: claim.inboxVersion,
            expectedCheckpointSequence: claim.expectedCheckpointSequence,
            processorVersion: input.processorVersion,
            semanticEvidence,
            operationEnvelope: resolveFinanceOperationEnvelope({
              policy,
              operationKind: "chargeback_record_provisional"
            })
          },
          chargeback: {
            providerPaymentId: webhook.providerPaymentId,
            providerSource: { kind: "webhook_event_id", webhookEventId: claim.webhookId },
            disputedPrincipalMinor: String(webhook.disputedPrincipalMinor),
            occurredAt: canonical.payment.observedAt
          }
        });
        return Object.freeze({ kind: "committed" as const, effect: receipt.effect, inboxItemId: claim.inboxItemId });
      } catch (error) {
        const processed = normalizeProcessingError(error);
        try {
          await input.claims.recordFailure({ claim, errorClass: processed.errorClass });
        } catch {
          // The lease expiry retains the durable recovery path when recording the failure fails.
        }
        throw processed.error;
      }
    }
  } satisfies CanonicalClientOrderChargebackProcessor);
}

function parseClaimedChargebackWebhook(
  claim: ClaimedChargebackClientOrderWebhook,
  rawWebhookBytes: Uint8Array
): Readonly<{ providerPaymentId: string; disputedPrincipalMinor: number }> {
  if (
    claim.providerEventType !== "payment.chargeback" ||
    claim.sealedWebhookArtifact.contentType !== "application/json" ||
    rawWebhookBytes.byteLength !== claim.sealedWebhookArtifact.byteLength ||
    digest(rawWebhookBytes) !== claim.sealedWebhookArtifact.sha256Digest
  ) fail("claimed_webhook_invalid");
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
  const [principal] = event.moneyFacts.amounts;
  if (
    event.type !== "payment.chargeback" ||
    event.providerWebhookId !== claim.webhookId ||
    event.moneyFacts.kind !== "bounded" ||
    !principal ||
    principal.currency !== "RUB"
  ) fail("claimed_webhook_invalid");
  return Object.freeze({ providerPaymentId: event.providerPaymentId, disputedPrincipalMinor: principal.amountMinor });
}

function assertCanonicalChargeback(
  payment: ArcPayCanonicalPaymentOutcome,
  correlation: Awaited<ReturnType<CapturedClientOrderCorrelationPort["resolveCapturedClientOrder"]>>,
  providerAccount: FinanceProviderAccountIdentity,
  webhook: Readonly<{ providerPaymentId: string; disputedPrincipalMinor: number }>
): void {
  if (
    payment.status !== "chargeback"
  ) fail("canonical_chargeback_not_confirmed");
  if (
    payment.providerPaymentId !== webhook.providerPaymentId ||
    payment.externalId !== correlation.externalId ||
    !sameProviderAccount(correlation.providerAccount, providerAccount) ||
    payment.currency !== "RUB" ||
    payment.capturedAmountMinor !== payment.amountMinor ||
    !positiveSafeInteger(payment.amountMinor) ||
    webhook.disputedPrincipalMinor > payment.amountMinor ||
    correlation.expectedAmountMinor !== String(payment.amountMinor) ||
    correlation.expectedCurrency !== "RUB" ||
    !positiveSafeInteger(correlation.expectedEconomicPaymentVersion) ||
    !Number.isFinite(Date.parse(payment.observedAt))
  ) fail("canonical_correlation_invalid");
}

function assertSemanticEvidence(
  evidence: VerifiedWebhookSemanticEvidence,
  claim: ClaimedChargebackClientOrderWebhook,
  economicPaymentIntentId: string,
  payment: ArcPayCanonicalPaymentOutcome
): void {
  if (
    evidence.semanticSourceKind !== "chargeback" ||
    evidence.semanticSourceId !== claim.webhookId ||
    evidence.purpose !== "client_order" ||
    evidence.webhookId !== claim.webhookId ||
    !sameProviderAccount(evidence.providerAccount, claim.providerAccount) ||
    evidence.economicPaymentIntentId !== economicPaymentIntentId ||
    evidence.economicPaymentSessionId !== null ||
    evidence.providerPaymentId !== null ||
    evidence.amountMinor !== null ||
    evidence.currency !== null ||
    evidence.observedAt !== payment.observedAt
  ) fail("sealed_evidence_invalid");
}

function normalizeProcessingError(error: unknown): Readonly<{
  error: CanonicalClientOrderChargebackProcessorError;
  errorClass: WebhookProcessingErrorClass;
}> {
  if (error instanceof CanonicalClientOrderChargebackProcessorError) {
    return Object.freeze({
      error,
      errorClass:
        error.reason === "canonical_read_unavailable" || error.reason === "canonical_chargeback_not_confirmed"
          ? "canonical_provider_read_unavailable"
          : "processor_contract_violation"
    });
  }
  if (isArcCanonicalReadUnavailable(error)) {
    return Object.freeze({
      error: new CanonicalClientOrderChargebackProcessorError("canonical_read_unavailable"),
      errorClass: "canonical_provider_read_unavailable"
    });
  }
  return Object.freeze({
    error: new CanonicalClientOrderChargebackProcessorError("commit_failed"),
    errorClass: "unexpected_internal_failure"
  });
}

function isArcCanonicalReadUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Partial<ArcPayCanonicalPaymentReaderError>;
  return record.code === "ARC_PAY_CANONICAL_PAYMENT_READER_ERROR" && record.reason === "transport";
}

function sameProviderAccount(left: FinanceProviderAccountIdentity, right: FinanceProviderAccountIdentity): boolean {
  return left.seriesId === right.seriesId && left.providerAccountId === right.providerAccountId && left.identityVersion === right.identityVersion;
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function digest(value: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as FinanceDigest;
}

function fail(reason: CanonicalClientOrderChargebackProcessorError["reason"]): never {
  throw new CanonicalClientOrderChargebackProcessorError(reason);
}
