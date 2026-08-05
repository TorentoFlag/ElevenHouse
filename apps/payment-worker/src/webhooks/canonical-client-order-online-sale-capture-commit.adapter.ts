import type {
  OnlineSaleCaptureCanonicalCaptureUnitOfWork,
  VerifiedWebhookSemanticEvidence
} from "@elevenhouse/domain/finance-core";

import type {
  CanonicalClientOrderWebhookCommitPort,
  ClaimedCapturedClientOrderWebhook,
  CapturedClientOrderCorrelation
} from "./canonical-client-order-capture.processor";

/**
 * Worker composition for HPP captures. It preserves one lower-level composite UoW and exposes no
 * v1 `financialMutation` proposal to webhook code.
 */
export function createCanonicalClientOrderOnlineSaleCaptureCommitAdapter(
  input: Readonly<{
    processorVersion: number;
    capture: OnlineSaleCaptureCanonicalCaptureUnitOfWork;
  }>
): CanonicalClientOrderWebhookCommitPort {
  const processorVersion = positiveInteger(input.processorVersion);
  return Object.freeze({
    async commitCapturedClientOrder({ claim, correlation, semanticEvidence }) {
      const committed = await input.capture.applyCanonicalOnlineSaleCapture(
        commandForCapturedClientOrder({
          claim,
          correlation,
          semanticEvidence,
          processorVersion
        })
      );
      return Object.freeze({ effect: committed.effect });
    }
  } satisfies CanonicalClientOrderWebhookCommitPort);
}

function commandForCapturedClientOrder(
  input: Readonly<{
    claim: ClaimedCapturedClientOrderWebhook;
    correlation: CapturedClientOrderCorrelation;
    semanticEvidence: VerifiedWebhookSemanticEvidence;
    processorVersion: number;
  }>
): Parameters<OnlineSaleCaptureCanonicalCaptureUnitOfWork["applyCanonicalOnlineSaleCapture"]>[0] {
  return Object.freeze({
    semanticFact: Object.freeze({
      inboxItemId: input.claim.inboxItemId,
      expectedInboxVersion: input.claim.inboxVersion,
      expectedCheckpointSequence: input.claim.expectedCheckpointSequence,
      processorVersion: input.processorVersion,
      semanticEvidence: input.semanticEvidence,
      operationEnvelope: input.correlation.operationEnvelope
    }),
    capture: Object.freeze({
      economicPaymentIntentId: input.correlation.economicPaymentIntentId,
      expectedEconomicPaymentVersion: input.correlation.expectedEconomicPaymentVersion,
      operationEnvelope: input.correlation.operationEnvelope
    })
  });
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("processorVersion must be a positive safe integer");
  }
  return value;
}
