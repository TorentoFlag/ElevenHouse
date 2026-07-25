import {
  capturePaymentProviderWebhook,
  ingestPaymentProviderWebhook,
  type CapturedSaleUnitOfWork,
  type FinanceOrderStore,
  type PaymentStore
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
      const result =
        event.type === "payment.captured"
          ? await capturePaymentProviderWebhook({
              capturedSale: input.capturedSale,
              request: { ...request, type: "payment.captured" }
            })
          : await ingestPaymentProviderWebhook({
              paymentStore: input.paymentStore,
              orderStore: input.orderStore,
              request
            });
      return { duplicate: result.kind === "replayed" };
    }
  };
}
