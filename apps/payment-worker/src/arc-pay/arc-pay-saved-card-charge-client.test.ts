import { createFiscalChargeSnapshot, createFiscalProfile } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import {
  ArcPaySavedCardChargeClientError,
  createArcPaySavedCardChargeClient
} from "./arc-pay-saved-card-charge-client";

describe("ArcPay saved-card charge client", () => {
  it("rejects a non-UUID idempotency key before sending a financial mutation", async () => {
    const fetchImpl = vi.fn();
    const client = createArcPaySavedCardChargeClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, fetchImpl as typeof fetch);

    await expect(client.chargeSavedCard({
      envelope: envelope(),
      providerCustomerId: "astrologer:00000000-0000-4000-8000-000000000001",
      cardTokenId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "saved-charge:invoice-1"
    })).rejects.toEqual(expect.objectContaining<Partial<ArcPaySavedCardChargeClientError>>({
      reason: "invalid_input"
    }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("serializes the sealed recurring charge into ArcPay's documented MIT request", async () => {
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.arcpay.space/v1/payments/saved-card");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer test-secret",
        "idempotency-key": "20000000-0000-4000-8000-000000000002"
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        amount: 199_000,
        currency: "RUB",
        card_token_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "astrologer:00000000-0000-4000-8000-000000000001",
        external_id: "platform-tariff-invoice:1",
        stored_credential_reason: "recurring",
        recurring_frequency_days: 31,
        merchant_inn: "7701234567",
        customer_email: "astro@example.test",
        fiscal_items: [{
          name: "ElevenHouse Pro",
          quantity: "1",
          unit_price: 199_000,
          vat_rate: "no_vat",
          payment_object: "service",
          payment_method: "full_payment",
          measure: "piece",
          item_code: "platform-plan"
        }]
      });
      return response({ payment_id: "arc-payment-1", status: "pending" });
    });
    const client = createArcPaySavedCardChargeClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, fetchImpl as typeof fetch);

    await expect(client.chargeSavedCard({
      envelope: envelope(),
      providerCustomerId: "astrologer:00000000-0000-4000-8000-000000000001",
      cardTokenId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "20000000-0000-4000-8000-000000000002"
    })).resolves.toMatchObject({ providerPaymentId: "arc-payment-1", status: "pending" });
  });

  it("fails closed on a non-success provider response", async () => {
    const client = createArcPaySavedCardChargeClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, vi.fn(async () => response({ code: "token_not_found" }, 404)) as typeof fetch);

    await expect(client.chargeSavedCard({
      envelope: envelope(),
      providerCustomerId: "astrologer:00000000-0000-4000-8000-000000000001",
      cardTokenId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "20000000-0000-4000-8000-000000000002"
    })).rejects.toEqual(expect.objectContaining<Partial<ArcPaySavedCardChargeClientError>>({
      reason: "provider_rejected"
    }));
  });
});

function envelope() {
  return {
    kind: "saved_card_charge" as const,
    amount: { amountMinor: 199_000, currency: "RUB" as const },
    savedCardCredential: {
      kind: "restricted_saved_card_credential_ref" as const,
      schemaVersion: 1 as const,
      credentialId: "credential-1",
      credentialVersion: 1
    },
    externalId: "platform-tariff-invoice:1",
    storedCredentialReason: "recurring" as const,
    recurringFrequencyDays: 31,
    fiscalSnapshot: createFiscalChargeSnapshot({
      profile: createFiscalProfile({
        profileSeriesId: "platform-subscription", version: 1, transactionCategory: "platform_subscription",
        currency: "RUB", fiscalizationProvider: "arc_pay_embedded", merchantTaxId: "7701234567",
        buyerContactRequirement: "email_or_phone",
        lineTemplate: { vatRate: "no_vat", paymentObject: "service", paymentMethod: "full_payment", measure: "piece", itemCode: "platform-plan" }
      }),
      buyerContact: { kind: "email", value: "astro@example.test" },
      lines: [{ sourceLineId: "platform-tariff-invoice:1", name: "ElevenHouse Pro", amountMinor: 199_000 }]
    })
  };
}

function response(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
