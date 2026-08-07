import { describe, expect, it, vi } from "vitest";
import {
  ArcPayCheckoutSessionClientError,
  createArcPayCheckoutSessionClient
} from "./arc-pay-checkout-session-client";
import {
  createFiscalChargeSnapshot,
  createFiscalProfile,
  type FiscalBuyerContact
} from "@elevenhouse/domain/finance-core";

const idempotencyKey = "11111111-1111-4111-8111-111111111111";

describe("ArcPay hosted checkout session client", () => {
  it("maps the sealed client-purchase fiscal snapshot and buyer email to the documented ArcPay HPP request", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", url: "https://checkout.arcpay.space/session-1" }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    });
    const client = createArcPayCheckoutSessionClient(config(), fetchImpl as typeof fetch);

    const result = await client.createHostedCheckout({ envelope: checkoutEnvelope(), idempotencyKey });
    expect(result).toMatchObject({
      providerCheckoutId: "22222222-2222-4222-8222-222222222222",
      checkoutUrl: "https://checkout.arcpay.space/session-1"
    });
    expect(new TextDecoder().decode(result.rawResponseBytes)).toBe(
      JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", url: "https://checkout.arcpay.space/session-1" })
    );

    expect(String(calls[0]?.url)).toBe("https://api.arcpay.space/v1/checkout/sessions");
    expect(calls[0]?.options).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer arc-pay-secret",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      }
    });
    expect(JSON.parse(String(calls[0]?.options?.body))).toEqual({
      amount: 12_000,
      currency: "RUB",
      payment_methods: [{ method: "bank_card", payment_mode: "redirect" }],
      capture_mode: "one_stage",
      success_url: "https://client.elevenhouse.test/payments/success",
      fail_url: "https://client.elevenhouse.test/payments/failure",
      cancel_url: "https://client.elevenhouse.test/payments/cancel",
      external_id: "payment-command-1",
      customer_email: "client@example.com",
      fiscal_items: [
        {
          name: "Астрологическая консультация",
          quantity: "1",
          unit_price: 12_000,
          vat_rate: "no_vat",
          payment_object: "service",
          payment_method: "full_payment",
          measure: "piece",
          item_code: "astrology-service"
        }
      ],
      metadata: { order_id: "order-1", fiscal_profile: "client-purchase-profile:3" }
    });
    expect(JSON.parse(String(calls[0]?.options?.body))).not.toHaveProperty("merchant_inn");
  });

  it("maps an immutable E.164 buyer phone without adding an unsupported HPP merchant identity field", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      void url;
      void options;
      return new Response(
        JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", url: "https://checkout.arcpay.space/session-1" }),
        { status: 201 }
      );
    });
    const client = createArcPayCheckoutSessionClient(config(), fetchImpl as typeof fetch);
    const envelope = checkoutEnvelope({ kind: "phone", value: "+79991234567" });

    await client.createHostedCheckout({ envelope, idempotencyKey });

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ customer_phone: "+79991234567" });
    expect(body).not.toHaveProperty("customer_email");
    expect(body).not.toHaveProperty("merchant_inn");
  });

  it("creates an ordinary checkout without fiscal fields when no receipt profile is configured", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => {
      void _url;
      void _options;
      return new Response(
        JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", url: "https://checkout.arcpay.space/session-1" }),
        { status: 201 }
      );
    });
    const client = createArcPayCheckoutSessionClient(config(), fetchImpl as typeof fetch);

    await client.createHostedCheckout({
      envelope: { ...checkoutEnvelope(), fiscalSnapshot: null },
      idempotencyKey
    });

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      amount: 12_000,
      external_id: "payment-command-1",
      metadata: { order_id: "order-1" }
    });
    expect(body).not.toHaveProperty("customer_email");
    expect(body).not.toHaveProperty("customer_phone");
    expect(body).not.toHaveProperty("fiscal_items");
    expect(body.metadata).not.toHaveProperty("fiscal_profile");
  });

  it("fails closed without a secret or a schema-valid provider session", async () => {
    const fetchImpl = vi.fn();
    const unconfigured = createArcPayCheckoutSessionClient(
      { ...config(), apiSecret: null },
      fetchImpl as typeof fetch
    );
    await expect(
      unconfigured.createHostedCheckout({ envelope: checkoutEnvelope(), idempotencyKey })
    ).rejects.toEqual(expect.objectContaining<Partial<ArcPayCheckoutSessionClientError>>({ reason: "not_configured" }));
    expect(fetchImpl).not.toHaveBeenCalled();

    const malformed = createArcPayCheckoutSessionClient(
      config(),
      vi.fn(async () => new Response(JSON.stringify({ id: "not-a-uuid", url: "http://unsafe.test" }), { status: 201 })) as typeof fetch
    );
    await expect(
      malformed.createHostedCheckout({ envelope: checkoutEnvelope(), idempotencyKey })
    ).rejects.toEqual(expect.objectContaining<Partial<ArcPayCheckoutSessionClientError>>({ reason: "invalid_response" }));
  });
});

function config() {
  return { apiBaseUrl: "https://api.arcpay.space", apiSecret: "arc-pay-secret" as string | null };
}

function checkoutEnvelope(
  buyerContact: FiscalBuyerContact = { kind: "email", value: "client@example.com" }
) {
  return {
    kind: "checkout_session_create" as const,
    amount: { amountMinor: 12_000, currency: "RUB" as const },
    captureMode: "one_stage" as const,
    paymentMethods: [{ method: "bank_card" as const, paymentMode: "redirect" as const }],
    successUrl: "https://client.elevenhouse.test/payments/success",
    failureUrl: "https://client.elevenhouse.test/payments/failure",
    cancelUrl: "https://client.elevenhouse.test/payments/cancel",
    externalId: "payment-command-1",
    orderId: "order-1",
    fiscalSnapshot: createFiscalChargeSnapshot({
      profile: createFiscalProfile({
        profileSeriesId: "client-purchase-profile",
        version: 3,
        transactionCategory: "client_purchase",
        currency: "RUB",
        fiscalizationProvider: "arc_pay_embedded",
        merchantTaxId: "7701234567",
        buyerContactRequirement: "email_or_phone",
        lineTemplate: {
          vatRate: "no_vat",
          paymentObject: "service",
          paymentMethod: "full_payment",
          measure: "piece",
          itemCode: "astrology-service"
        }
      }),
      buyerContact,
      lines: [
        {
          sourceLineId: "order-1",
          name: "Астрологическая консультация",
          amountMinor: 12_000
        }
      ]
    })
  };
}
