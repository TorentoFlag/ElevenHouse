import { describe, expect, it, vi } from "vitest";
import {
  ArcPayPaymentLookupError,
  createArcPayPaymentAttemptResolver
} from "./arc-pay-payment-reader";

const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const paymentAttemptId = "11111111-1111-4111-8111-111111111111";

describe("createArcPayPaymentAttemptResolver", () => {
  it("reads Arc Pay payment by the documented v1 endpoint and returns external_id", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({ id: providerPaymentId, external_id: paymentAttemptId }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });

    const resolver = createArcPayPaymentAttemptResolver({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "arc-pay-secret",
      environment: "sandbox",
      fetchImpl: fetchImpl as typeof fetch
    });

    await expect(
      resolver.resolvePaymentAttemptId({ providerPaymentId, environment: "sandbox" })
    ).resolves.toBe(paymentAttemptId);

    expect(calls).toMatchObject([
      {
        url: new URL(`https://api.arcpay.space/v1/payments/${providerPaymentId}`),
        options: { headers: { authorization: "Bearer arc-pay-secret" } }
      }
    ]);
  });

  it("fails closed when the secret is absent or the environment does not match", async () => {
    const fetchImpl = vi.fn();
    const resolver = createArcPayPaymentAttemptResolver({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: null,
      environment: "sandbox",
      fetchImpl
    });

    await expect(
      resolver.resolvePaymentAttemptId({ providerPaymentId, environment: "sandbox" })
    ).rejects.toBeInstanceOf(ArcPayPaymentLookupError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
