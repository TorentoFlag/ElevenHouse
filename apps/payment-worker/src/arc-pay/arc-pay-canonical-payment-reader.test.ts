import { describe, expect, test } from "vitest";

import { createArcPayCanonicalPaymentReader } from "./arc-pay-canonical-payment-reader";

describe("ArcPay canonical payment reader", () => {
  test("lists captured checkout payments for bounded client-order reconciliation", async () => {
    const requests: Request[] = [];
    const reader = createArcPayCanonicalPaymentReader(
      { apiBaseUrl: "https://api.arcpay.space", apiSecret: "sk_test_valid" },
      async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init as RequestInit | undefined);
        requests.push(request);
        return new Response(
          JSON.stringify({
            page_size: 20,
            total: 3,
            payments: [
              {
                id: "01a01f3f-0332-7979-8b7f-8ecedf247071",
                external_id: "4a15078e-aae9-4081-ab6f-243eb096650c",
                status: "captured",
                amount: 1000,
                captured_amount: 1000,
                currency: "RUB",
                created_at: "2026-08-20T12:56:58.418615Z",
                updated_at: "2026-08-20T12:57:13.33164Z"
              },
              {
                id: "01a01f3f-0332-7979-8b7f-8ecedf247072",
                external_id: "other-order",
                status: "captured",
                amount: 1000,
                captured_amount: 1000,
                currency: "RUB",
                created_at: "2026-08-20T12:56:58.418615Z",
                updated_at: "2026-08-20T12:57:13.33164Z"
              },
              {
                id: "01a01f3f-0332-7979-8b7f-8ecedf247073",
                external_id: "4a15078e-aae9-4081-ab6f-243eb096650c",
                status: "pending",
                amount: 1000,
                captured_amount: 0,
                currency: "RUB",
                created_at: "2026-08-20T12:56:58.418615Z",
                updated_at: "2026-08-20T12:57:13.33164Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );

    const result = await reader.listCapturedPayments({
      pageSize: 20,
      expectedExternalId: "4a15078e-aae9-4081-ab6f-243eb096650c",
      expectedAmountMinor: 1000,
      expectedCurrency: "RUB"
    });

    expect(result.payments).toEqual([
      {
        providerPaymentId: "01a01f3f-0332-7979-8b7f-8ecedf247071",
        externalId: "4a15078e-aae9-4081-ab6f-243eb096650c",
        amountMinor: 1000,
        capturedAmountMinor: 1000,
        currency: "RUB",
        status: "captured",
        observedAt: "2026-08-20T12:57:13.33164Z"
      }
    ]);
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v1/payments");
    expect(url.searchParams.get("status")).toBe("captured");
    expect(url.searchParams.get("page_size")).toBe("20");
    expect(url.searchParams.has("search")).toBe(false);
  });
});
