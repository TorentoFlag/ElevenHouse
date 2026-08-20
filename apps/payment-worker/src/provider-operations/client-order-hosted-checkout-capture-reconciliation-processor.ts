import type {
  CapturedClientOrderCorrelation,
  ClientOrderHostedCheckoutCaptureReconciliationCandidate,
  ClientOrderHostedCheckoutCaptureReconciliationCandidateReader,
  VerifiedWebhookSemanticEvidence
} from "@elevenhouse/domain/finance-core";

import type {
  ArcPayCanonicalPaymentReader,
  ArcPayCanonicalCapturedPayment
} from "../arc-pay/arc-pay-canonical-payment-reader";
import type { CanonicalCaptureEvidenceSealer } from "../webhooks/canonical-client-order-capture.processor";

export type ClientOrderHostedCheckoutCaptureReconciliationCommitPort = Readonly<{
  commitCapturedClientOrderFromProviderRead(
    input: Readonly<{
      correlation: CapturedClientOrderCorrelation;
      semanticEvidence: VerifiedWebhookSemanticEvidence;
    }>
  ): Promise<Readonly<{ effect: "applied_once" | "semantic_replay" }>>;
}>;

export type ClientOrderHostedCheckoutCaptureReconciliationTickResult = Readonly<{
  scanned: number;
  awaitingProvider: number;
  committed: number;
  replayed: number;
}>;

export type ClientOrderHostedCheckoutCaptureReconciliationProcessor = Readonly<{
  tick(): Promise<ClientOrderHostedCheckoutCaptureReconciliationTickResult>;
}>;

export class ClientOrderHostedCheckoutCaptureReconciliationProcessorError extends Error {
  readonly code = "client_order_hosted_checkout_capture_reconciliation_processor_error" as const;

  constructor(readonly reason: "invalid_input" | "ambiguous_provider_payment") {
    super("Client-order hosted checkout capture reconciliation could not be processed safely");
    this.name = "ClientOrderHostedCheckoutCaptureReconciliationProcessorError";
  }
}

export function createClientOrderHostedCheckoutCaptureReconciliationProcessor(
  input: Readonly<{
    candidates: ClientOrderHostedCheckoutCaptureReconciliationCandidateReader;
    canonicalPayments: Pick<
      ArcPayCanonicalPaymentReader,
      "listCapturedPayments" | "readCapturedPayment"
    >;
    evidence: Pick<CanonicalCaptureEvidenceSealer, "sealCanonicalCaptureFromProviderRead">;
    commit: ClientOrderHostedCheckoutCaptureReconciliationCommitPort;
    batchSize: number;
  }>
): ClientOrderHostedCheckoutCaptureReconciliationProcessor {
  const batchSize = positiveSafeInteger(input.batchSize);
  return Object.freeze({
    async tick() {
      const candidates = await input.candidates.listPendingClientOrderHostedCheckoutCandidates({
        limit: batchSize
      });
      let awaitingProvider = 0;
      let committed = 0;
      let replayed = 0;
      for (const candidate of candidates) {
        const captured = await findExactCapturedPayment(input.canonicalPayments, candidate);
        if (!captured) {
          awaitingProvider += 1;
          continue;
        }
        const canonical = await input.canonicalPayments.readCapturedPayment({
          providerPaymentId: captured.providerPaymentId,
          expectedExternalId: candidate.correlation.externalId
        });
        assertCapturedPayment(canonical.payment, candidate.correlation);
        const semanticEvidence = await input.evidence.sealCanonicalCaptureFromProviderRead({
          correlation: candidate.correlation,
          canonicalPayment: canonical.payment,
          rawCanonicalResponseBytes: canonical.rawResponseBytes
        });
        assertSemanticEvidence(semanticEvidence, candidate.correlation, canonical.payment);
        const result = await input.commit.commitCapturedClientOrderFromProviderRead({
          correlation: candidate.correlation,
          semanticEvidence
        });
        if (result.effect === "semantic_replay") replayed += 1;
        else committed += 1;
      }
      return Object.freeze({ scanned: candidates.length, awaitingProvider, committed, replayed });
    }
  });
}

export function startClientOrderHostedCheckoutCaptureReconciliationInterval(
  input: Readonly<{
    processor: ClientOrderHostedCheckoutCaptureReconciliationProcessor;
    intervalMs: number;
    onError(error: unknown): void;
    onResult?(result: ClientOrderHostedCheckoutCaptureReconciliationTickResult): void;
  }>
): () => void {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error("Client-order hosted checkout capture reconciliation interval is invalid");
  }
  const run = async () => {
    try {
      input.onResult?.(await input.processor.tick());
    } catch (error) {
      input.onError(error);
    }
  };
  const timer = setInterval(() => void run(), input.intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}

async function findExactCapturedPayment(
  reader: Pick<ArcPayCanonicalPaymentReader, "listCapturedPayments">,
  candidate: ClientOrderHostedCheckoutCaptureReconciliationCandidate
): Promise<ArcPayCanonicalCapturedPayment | null> {
  const amountMinor = Number(candidate.correlation.expectedAmountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) fail("invalid_input");
  const listed = await reader.listCapturedPayments({
    pageSize: 20,
    expectedExternalId: candidate.correlation.externalId,
    expectedAmountMinor: amountMinor,
    expectedCurrency: candidate.correlation.expectedCurrency
  });
  if (listed.payments.length === 0) return null;
  if (listed.payments.length !== 1) fail("ambiguous_provider_payment");
  return listed.payments[0] ?? null;
}

function assertCapturedPayment(
  payment: ArcPayCanonicalCapturedPayment,
  correlation: CapturedClientOrderCorrelation
): void {
  if (
    payment.externalId !== correlation.externalId ||
    String(payment.amountMinor) !== correlation.expectedAmountMinor ||
    payment.capturedAmountMinor !== payment.amountMinor ||
    payment.currency !== correlation.expectedCurrency ||
    payment.status !== "captured"
  ) {
    fail("invalid_input");
  }
}

function assertSemanticEvidence(
  evidence: VerifiedWebhookSemanticEvidence,
  correlation: CapturedClientOrderCorrelation,
  payment: ArcPayCanonicalCapturedPayment
): void {
  if (
    evidence.sourceDelivery !== "provider_canonical_read" ||
    evidence.webhookId !== null ||
    evidence.semanticSourceKind !== "payment_transition" ||
    evidence.providerPaymentId !== payment.providerPaymentId ||
    evidence.economicPaymentIntentId !== correlation.economicPaymentIntentId ||
    evidence.economicPaymentSessionId !== correlation.economicPaymentSessionId ||
    evidence.amountMinor !== correlation.expectedAmountMinor ||
    evidence.currency !== correlation.expectedCurrency ||
    evidence.purpose !== "client_order"
  ) {
    fail("invalid_input");
  }
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 100) {
    fail("invalid_input");
  }
  return Number(value);
}

function fail(
  reason: ClientOrderHostedCheckoutCaptureReconciliationProcessorError["reason"]
): never {
  throw new ClientOrderHostedCheckoutCaptureReconciliationProcessorError(reason);
}
