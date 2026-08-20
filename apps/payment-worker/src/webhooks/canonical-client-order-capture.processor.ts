import { createHash } from "node:crypto";

import type {
  FinanceDigest,
  FinanceProviderAccountIdentity,
  CapturedClientOrderCorrelation,
  VerifiedWebhookSemanticEvidence,
  WebhookProcessingErrorClass
} from "@elevenhouse/domain/finance-core";
import { createCapturedProviderPaymentSemanticSourceId } from "@elevenhouse/domain/finance-core";

import type {
  ArcPayCanonicalCapturedPayment,
  ArcPayCanonicalPaymentReader,
  ArcPayCanonicalPaymentReaderError,
  ArcPayCanonicalPaymentOutcome
} from "../arc-pay/arc-pay-canonical-payment-reader";
import { ArcPayWebhookPayloadError, parseArcPayWebhook } from "../arc-pay/arc-pay-webhook";

export type ClaimedCapturedClientOrderWebhook = Readonly<{
  inboxItemId: string;
  inboxVersion: number;
  expectedCheckpointSequence: number;
  leaseFence: number;
  providerAccount: FinanceProviderAccountIdentity;
  webhookId: string;
  providerEventType: "payment.captured";
  /** The claim implementation has already authenticated artifact registry metadata and binding. */
  sealedWebhookArtifact: Readonly<{
    artifactId: string;
    sha256Digest: FinanceDigest;
    byteLength: number;
    contentType: "application/json";
  }>;
}>;

/**
 * Reads the registered immutable object after the DB claim. It must check the registry's provider
 * binding and artifact identity before returning bytes; the processor independently rechecks the
 * byte digest and size to catch a storage or adapter integrity failure.
 */
export type ClaimedWebhookArtifactClaim = Readonly<{
  inboxItemId: string;
  inboxVersion: number;
  leaseFence: number;
  sealedWebhookArtifact: ClaimedCapturedClientOrderWebhook["sealedWebhookArtifact"];
}>;

export type ClaimedWebhookArtifactResolver = Readonly<{
  loadClaimedWebhookBytes(claim: ClaimedWebhookArtifactClaim): Promise<Uint8Array>;
}>;

export type CapturedClientOrderWebhookClaimPort = Readonly<{
  claimNextCapturedClientOrderWebhook(): Promise<ClaimedCapturedClientOrderWebhook | null>;
  recordFailure(
    input: Readonly<{
      claim: ClaimedCapturedClientOrderWebhook;
      errorClass: WebhookProcessingErrorClass;
    }>
  ): Promise<void>;
}>;

export type CapturedClientOrderCorrelationPort = Readonly<{
  /**
   * This is a read/lock-only correlation. The `externalId` originates exclusively from a
   * canonical ArcPay read; a raw webhook field must never be passed here as authority.
   */
  resolveCapturedClientOrder(
    input: Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      providerPaymentId: string;
      externalId: string;
    }>
  ): Promise<CapturedClientOrderCorrelation>;
}>;

export type CanonicalCaptureEvidenceSealer = Readonly<{
  /**
   * Seals exact canonical ArcPay response bytes and mints the branded semantic evidence only
   * when its artifact binding matches the locked checkout correlation.
   */
  sealCanonicalCapture(
    input: Readonly<{
      claim: ClaimedCapturedClientOrderWebhook;
      correlation: CapturedClientOrderCorrelation;
      canonicalPayment: ArcPayCanonicalCapturedPayment;
      rawCanonicalResponseBytes: Uint8Array;
    }>
  ): Promise<VerifiedWebhookSemanticEvidence>;
  sealCanonicalCaptureFromProviderRead(
    input: Readonly<{
      correlation: CapturedClientOrderCorrelation;
      canonicalPayment: ArcPayCanonicalCapturedPayment;
      rawCanonicalResponseBytes: Uint8Array;
    }>
  ): Promise<VerifiedWebhookSemanticEvidence>;
}>;

/**
 * One database transaction: semantic fact/checkpoint plus client-order capture, journal, wallet,
 * clearing and order effects. Calling the two lower-level UOWs independently is prohibited.
 */
export type CanonicalClientOrderWebhookCommitPort = Readonly<{
  commitCapturedClientOrder(
    input: Readonly<{
      claim: ClaimedCapturedClientOrderWebhook;
      correlation: CapturedClientOrderCorrelation;
      semanticEvidence: VerifiedWebhookSemanticEvidence;
    }>
  ): Promise<Readonly<{ effect: "applied_once" | "semantic_replay" }>>;
}>;

export type CanonicalClientOrderCaptureProcessor = Readonly<{
  processOne(): Promise<
    | Readonly<{ kind: "idle" }>
    | Readonly<{
        kind: "committed";
        effect: "applied_once" | "semantic_replay";
        inboxItemId: string;
      }>
  >;
}>;

export class CanonicalClientOrderCaptureProcessorError extends Error {
  readonly code = "canonical_client_order_capture_processor_error" as const;

  constructor(
    readonly reason:
      | "claimed_webhook_invalid"
      | "canonical_read_unavailable"
      | "canonical_correlation_invalid"
      | "sealed_evidence_invalid"
      | "commit_failed"
  ) {
    super("Canonical client-order capture could not be processed safely");
    this.name = "CanonicalClientOrderCaptureProcessorError";
  }
}

/**
 * Processes one durable HPP `payment.captured` inbox item. The first ArcPay lookup is intentionally
 * non-mutating and exists only to discover the provider's immutable `external_id`. It is followed
 * by a second, correlation-bound captured read; only the latter can be sealed and committed.
 */
export function createCanonicalClientOrderCaptureProcessor(
  input: Readonly<{
    claims: CapturedClientOrderWebhookClaimPort;
    webhookArtifacts: ClaimedWebhookArtifactResolver;
    canonicalPayments: Pick<
      ArcPayCanonicalPaymentReader,
      "readPaymentOutcomeById" | "readCapturedPayment"
    >;
    correlations: CapturedClientOrderCorrelationPort;
    evidence: CanonicalCaptureEvidenceSealer;
    commit: CanonicalClientOrderWebhookCommitPort;
  }>
): CanonicalClientOrderCaptureProcessor {
  return Object.freeze({
    async processOne() {
      const claim = await input.claims.claimNextCapturedClientOrderWebhook();
      if (!claim) return Object.freeze({ kind: "idle" as const });
      try {
        const rawWebhookBytes = await input.webhookArtifacts.loadClaimedWebhookBytes(claim);
        assertClaimedWebhook(claim, rawWebhookBytes);
        const event = parseClaimedCapturedWebhook(claim, rawWebhookBytes);
        const discovery = await input.canonicalPayments.readPaymentOutcomeById({
          providerPaymentId: event.providerPaymentId
        });
        const correlation = await input.correlations.resolveCapturedClientOrder({
          providerAccount: claim.providerAccount,
          providerPaymentId: event.providerPaymentId,
          externalId: discovery.payment.externalId
        });
        assertCorrelation(correlation, claim, event.providerPaymentId, discovery.payment);
        const canonical = await input.canonicalPayments.readCapturedPayment({
          providerPaymentId: event.providerPaymentId,
          expectedExternalId: correlation.externalId
        });
        assertCapturedPayment(canonical.payment, correlation, event.providerPaymentId);
        const semanticEvidence = await input.evidence.sealCanonicalCapture({
          claim,
          correlation,
          canonicalPayment: canonical.payment,
          rawCanonicalResponseBytes: canonical.rawResponseBytes
        });
        assertSemanticEvidence(semanticEvidence, claim, correlation, canonical.payment);
        const committed = await input.commit.commitCapturedClientOrder({
          claim,
          correlation,
          semanticEvidence
        });
        return Object.freeze({
          kind: "committed" as const,
          effect: committed.effect,
          inboxItemId: claim.inboxItemId
        });
      } catch (error) {
        const processed = normalizeProcessingError(error);
        try {
          await input.claims.recordFailure({ claim, errorClass: processed.errorClass });
        } catch {
          // A failed lease release remains observable through its expiry; never hide the cause that
          // prevented a financial commit behind a secondary recovery failure.
        }
        throw processed.error;
      }
    }
  } satisfies CanonicalClientOrderCaptureProcessor);
}

function parseClaimedCapturedWebhook(
  claim: ClaimedCapturedClientOrderWebhook,
  rawWebhookBytes: Uint8Array
) {
  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(rawWebhookBytes);
  } catch {
    fail("claimed_webhook_invalid");
  }
  let event;
  try {
    event = parseArcPayWebhook({ webhookId: claim.webhookId, rawBody });
  } catch (error) {
    if (error instanceof ArcPayWebhookPayloadError) fail("claimed_webhook_invalid");
    throw error;
  }
  if (event.type !== "payment.captured" || event.providerWebhookId !== claim.webhookId) {
    fail("claimed_webhook_invalid");
  }
  return event;
}

function assertClaimedWebhook(
  claim: ClaimedCapturedClientOrderWebhook,
  rawWebhookBytes: Uint8Array
): void {
  if (
    claim.providerEventType !== "payment.captured" ||
    claim.sealedWebhookArtifact.contentType !== "application/json" ||
    rawWebhookBytes.byteLength !== claim.sealedWebhookArtifact.byteLength ||
    digest(rawWebhookBytes) !== claim.sealedWebhookArtifact.sha256Digest
  ) {
    fail("claimed_webhook_invalid");
  }
}

function assertCorrelation(
  correlation: CapturedClientOrderCorrelation,
  claim: ClaimedCapturedClientOrderWebhook,
  providerPaymentId: string,
  discovery: ArcPayCanonicalPaymentOutcome
): void {
  if (
    discovery.providerPaymentId !== providerPaymentId ||
    correlation.externalId !== discovery.externalId ||
    !sameProviderAccount(correlation.providerAccount, claim.providerAccount) ||
    !positiveMinorString(correlation.expectedAmountMinor) ||
    correlation.expectedCurrency !== "RUB" ||
    !positiveSafeInteger(correlation.expectedEconomicPaymentVersion)
  ) {
    fail("canonical_correlation_invalid");
  }
}

function assertCapturedPayment(
  payment: ArcPayCanonicalCapturedPayment,
  correlation: CapturedClientOrderCorrelation,
  providerPaymentId: string
): void {
  if (
    payment.providerPaymentId !== providerPaymentId ||
    payment.externalId !== correlation.externalId ||
    payment.currency !== correlation.expectedCurrency ||
    String(payment.amountMinor) !== correlation.expectedAmountMinor ||
    payment.capturedAmountMinor !== payment.amountMinor ||
    (payment.status !== "captured" && payment.status !== "settled")
  ) {
    fail("canonical_correlation_invalid");
  }
}

function assertSemanticEvidence(
  evidence: VerifiedWebhookSemanticEvidence,
  claim: ClaimedCapturedClientOrderWebhook,
  correlation: CapturedClientOrderCorrelation,
  payment: ArcPayCanonicalCapturedPayment
): void {
  if (
    evidence.semanticSourceKind !== "payment_transition" ||
    evidence.semanticSourceId !==
      createCapturedProviderPaymentSemanticSourceId(payment.providerPaymentId) ||
    evidence.purpose !== "client_order" ||
    evidence.sourceDelivery !== "webhook" ||
    evidence.webhookId !== claim.webhookId ||
    !sameProviderAccount(evidence.providerAccount, claim.providerAccount) ||
    evidence.economicPaymentIntentId !== correlation.economicPaymentIntentId ||
    evidence.economicPaymentSessionId !== correlation.economicPaymentSessionId ||
    evidence.providerPaymentId !== payment.providerPaymentId ||
    evidence.amountMinor !== correlation.expectedAmountMinor ||
    evidence.currency !== correlation.expectedCurrency
  ) {
    fail("sealed_evidence_invalid");
  }
}

function normalizeProcessingError(error: unknown): Readonly<{
  error: CanonicalClientOrderCaptureProcessorError;
  errorClass: WebhookProcessingErrorClass;
}> {
  if (error instanceof CanonicalClientOrderCaptureProcessorError) {
    return Object.freeze({
      error,
      errorClass:
        error.reason === "canonical_read_unavailable"
          ? "canonical_provider_read_unavailable"
          : "processor_contract_violation"
    });
  }
  if (isArcCanonicalReadUnavailable(error)) {
    return Object.freeze({
      error: new CanonicalClientOrderCaptureProcessorError("canonical_read_unavailable"),
      errorClass: "canonical_provider_read_unavailable"
    });
  }
  return Object.freeze({
    error: new CanonicalClientOrderCaptureProcessorError("commit_failed"),
    errorClass: "unexpected_internal_failure"
  });
}

function isArcCanonicalReadUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Partial<ArcPayCanonicalPaymentReaderError>;
  return (
    record.code === "ARC_PAY_CANONICAL_PAYMENT_READER_ERROR" &&
    (record.reason === "transport" || record.reason === "not_captured")
  );
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

function positiveMinorString(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function digest(value: Uint8Array): FinanceDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as FinanceDigest;
}

function fail(reason: CanonicalClientOrderCaptureProcessorError["reason"]): never {
  throw new CanonicalClientOrderCaptureProcessorError(reason);
}
