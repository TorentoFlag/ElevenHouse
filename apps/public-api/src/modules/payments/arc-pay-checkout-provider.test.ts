import { describe, expect, it, vi } from "vitest";
import {
  ArcPayCheckoutConfigurationError,
  ArcPayCheckoutProvider
} from "./arc-pay-checkout-provider";

const input = {
  paymentAttemptId: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  amount: { amountMinor: 500_00, currency: "RUB" as const },
  successUrl: "https://client.elevenhouse.test/payments/success",
  failureUrl: "https://client.elevenhouse.test/payments/failure",
  cancelUrl: "https://client.elevenhouse.test/payments/cancel"
};

describe("ArcPayCheckoutProvider", () => {
  it("sends the documented hosted-checkout contract with a stable UUID idempotency key", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({ id: "arc-checkout-1", url: "https://checkout.arcpay.space/1" }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    });
    const provider = new ArcPayCheckoutProvider(config(), fetchImpl as typeof fetch);

    await expect(provider.openCheckout(input)).resolves.toEqual({
      providerCheckoutId: "arc-checkout-1",
      checkoutUrl: "https://checkout.arcpay.space/1"
    });

    expect(calls).toMatchObject([
      {
        url: new URL("https://api.arcpay.space/v1/checkout/sessions"),
        options: expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            authorization: "Bearer arc-pay-secret",
            "idempotency-key": input.paymentAttemptId
          })
        })
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const options = calls[0]?.options;
    expect(JSON.parse(String(options?.body))).toEqual({
      amount: 500_00,
      currency: "RUB",
      payment_methods: [{ method: "bank_card", payment_mode: "redirect" }],
      capture_mode: "one_stage",
      success_url: input.successUrl,
      fail_url: input.failureUrl,
      cancel_url: input.cancelUrl,
      external_id: input.paymentAttemptId,
      metadata: { order_id: input.orderId, payment_attempt_id: input.paymentAttemptId }
    });
  });

  it("fails closed before a network request when credentials or discovered methods are absent", async () => {
    const fetchImpl = vi.fn();
    const provider = new ArcPayCheckoutProvider(
      { ...config(), secret: null, paymentMethods: [] },
      fetchImpl
    );

    await expect(provider.openCheckout(input)).rejects.toBeInstanceOf(
      ArcPayCheckoutConfigurationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function config() {
  return {
    enabled: true,
    apiBaseUrl: "https://api.arcpay.space",
    secret: "arc-pay-secret",
    environment: "sandbox" as const,
    captureMode: "one_stage" as const,
    paymentMethods: [{ method: "bank_card" as const, paymentMode: "redirect" as const }]
  };
}
