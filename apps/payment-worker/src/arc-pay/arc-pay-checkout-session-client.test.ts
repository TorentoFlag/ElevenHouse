import { describe, expect, test } from "vitest";

import { createArcPayCheckoutSessionClient } from "./arc-pay-checkout-session-client";

const checkoutEnvelope = {
  kind: "checkout_session_create",
  amount: { amountMinor: 1000, currency: "RUB" },
  captureMode: "one_stage",
  paymentMethods: [{ method: "bank_card", paymentMode: "redirect" }],
  successUrl: "https://client.elevenhouse.ai/payments/success",
  failureUrl: "https://client.elevenhouse.ai/payments/failure",
  cancelUrl: "https://client.elevenhouse.ai/payments/cancel",
  externalId: "client-order-checkout:43a1cbed-cc07-4f0c-b5c6-18c8eefe3220",
  orderId: "43a1cbed-cc07-4f0c-b5c6-18c8eefe3220",
  fiscalSnapshot: null
} as const;

describe("ArcPay hosted checkout session client", () => {
  test("uses the documented hosted checkout endpoint without a versioned path prefix", async () => {
    const requests: Request[] = [];
    const client = createArcPayCheckoutSessionClient(
      { apiBaseUrl: "https://api.arcpay.space", apiSecret: "sk_test_valid" },
      async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init as RequestInit | undefined);
        requests.push(request);
        return new Response(
          JSON.stringify({
            id: "7bfa4fc9-52b2-4fb9-90f0-22b2a5a2f33c",
            url: "https://checkout.arcpay.space/session/7bfa4fc9"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    );

    await client.createHostedCheckout({
      envelope: checkoutEnvelope,
      idempotencyKey: "a6142be4-8c89-4c7d-a509-1036bdfb8df5"
    });

    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).pathname).toBe("/checkout/sessions");
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer sk_test_valid");
    expect(requests[0]!.headers.get("idempotency-key")).toBe(
      "a6142be4-8c89-4c7d-a509-1036bdfb8df5"
    );
  });
});
