import {
  capturePaymentProviderWebhook,
  ingestPaymentProviderWebhook,
  recordPaymentReversalProviderWebhook,
  releaseTerminalPaymentProviderWebhook,
  type CapturedSaleUnitOfWork,
  type FinanceOrderStore,
  type PaymentStore,
  type RefundReversalProviderEventType,
  type RefundReversalUnitOfWork,
  type TerminalPaymentProviderEventType,
  type TerminalPaymentUnitOfWork
} from "@elevenhouse/domain";
import type { ArcPayWebhookEvent } from "../arc-pay/arc-pay-webhook";

export type PaymentWebhookProcessor = {
  readonly process: (event: ArcPayWebhookEvent) => Promise<{ readonly duplicate: boolean }>;
};

export function createPaymentWebhookProcessor(input: {
  readonly paymentStore: Pick<
    PaymentStore,
    | "findAttemptById"
    | "linkAttemptToProviderPayment"
    | "recordProviderEvent"
    | "findProviderEventByWebhookId"
  >;
  readonly orderStore: Pick<FinanceOrderStore, "findById">;
  readonly capturedSale: CapturedSaleUnitOfWork;
  readonly terminalPayment: TerminalPaymentUnitOfWork;
  readonly reversal: RefundReversalUnitOfWork;
  readonly resolvePaymentAttemptId: (input: {
    readonly providerPaymentId: string;
    readonly environment: "sandbox" | "live";
  }) => Promise<string>;
  readonly now?: () => Date;
}): PaymentWebhookProcessor {
  return {
    async process(event) {
      const replayed = await input.paymentStore.findProviderEventByWebhookId({
        provider: "arc_pay",
        environment: event.environment,
        providerWebhookId: event.providerWebhookId
      });
      if (replayed) return { duplicate: true };

      const paymentAttemptId = await input.resolvePaymentAttemptId({
        providerPaymentId: event.providerPaymentId,
        environment: event.environment
      });
      const request = {
        paymentAttemptId,
        provider: "arc_pay" as const,
        environment: event.environment,
        providerWebhookId: event.providerWebhookId,
        providerPaymentId: event.providerPaymentId,
        type: event.type,
        occurredAt: event.occurredAt,
        receivedAt: (input.now ?? (() => new Date()))().toISOString(),
        payload: event.payload,
        moneyFacts: event.moneyFacts
      };
      const result = await processPaymentProviderEvent(input, event, request);
      return { duplicate: result.kind === "replayed" };
    }
  };
}

function isTerminalReleaseEvent(
  type: ArcPayWebhookEvent["type"]
): type is TerminalPaymentProviderEventType {
  return (
    type === "payment.failed" ||
    type === "payment.declined" ||
    type === "payment.expired" ||
    type === "payment.voided"
  );
}

async function processPaymentProviderEvent(
  input: {
    readonly paymentStore: Pick<
      PaymentStore,
      | "findAttemptById"
      | "linkAttemptToProviderPayment"
      | "recordProviderEvent"
      | "findProviderEventByWebhookId"
    >;
    readonly orderStore: Pick<FinanceOrderStore, "findById">;
    readonly capturedSale: CapturedSaleUnitOfWork;
    readonly terminalPayment: TerminalPaymentUnitOfWork;
    readonly reversal: RefundReversalUnitOfWork;
  },
  event: ArcPayWebhookEvent,
  request: Parameters<typeof ingestPaymentProviderWebhook>[0]["request"]
) {
  if (event.type === "payment.captured") {
    return capturePaymentProviderWebhook({
      capturedSale: input.capturedSale,
      request: { ...request, type: "payment.captured" }
    });
  }
  if (isTerminalReleaseEvent(event.type)) {
    return releaseTerminalPaymentProviderWebhook({
      terminalPayment: input.terminalPayment,
      request: { ...request, type: event.type }
    });
  }
  if (isReversalEvent(event.type)) {
    return recordPaymentReversalProviderWebhook({
      reversal: input.reversal,
      request: { ...request, type: event.type }
    });
  }
  return ingestPaymentProviderWebhook({
    paymentStore: input.paymentStore,
    orderStore: input.orderStore,
    request
  });
}

function isReversalEvent(
  type: ArcPayWebhookEvent["type"]
): type is RefundReversalProviderEventType {
  return (
    type === "payment.refunded" ||
    type === "payment.partially_refunded" ||
    type === "payment.chargeback"
  );
}
