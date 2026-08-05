import { describe, expect, it, vi } from "vitest";

import {
  ArcPayRefundClientError,
  createArcPayRefundClient
} from "./arc-pay-refund-client";

describe("ArcPay refund client", () => {
  it("serializes an immutable refund envelope to the documented idempotent ArcPay endpoint", async () => {
    const fetchImpl = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://api.arcpay.space/v1/payments/11111111-1111-4111-8111-111111111111/refunds"
      );
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          authorization: "Bearer test-secret",
          "content-type": "application/json",
          "idempotency-key": "33333333-3333-4333-8333-333333333333"
        }
      });
      expect(JSON.parse(String(init?.body))).toEqual({ amount: 4_000, reason: "refund:refund-1" });
      return response({
        id: "22222222-2222-4222-8222-222222222222",
        payment_id: "11111111-1111-4111-8111-111111111111",
        amount: 4_000,
        currency: "RUB",
        status: "pending",
        created_at: "2026-08-05T10:00:00Z",
        reason: "refund:refund-1"
      });
    });
    const client = createArcPayRefundClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, fetchImpl as typeof fetch);

    await expect(client.createRefund({
      envelope: refundEnvelope(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333"
    })).resolves.toMatchObject({
      providerRefundId: "22222222-2222-4222-8222-222222222222",
      providerPaymentId: "11111111-1111-4111-8111-111111111111",
      status: "pending"
    });
  });

  it("rejects provider responses that do not prove the requested refund identity and amount", async () => {
    const client = createArcPayRefundClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, vi.fn(async () => response({
      id: "22222222-2222-4222-8222-222222222222",
      payment_id: "11111111-1111-4111-8111-111111111111",
      amount: 4_001,
      currency: "RUB",
      status: "pending",
      created_at: "2026-08-05T10:00:00Z"
    })) as typeof fetch);

    await expect(client.createRefund({
      envelope: refundEnvelope(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333"
    })).rejects.toEqual(expect.objectContaining<Partial<ArcPayRefundClientError>>({
      reason: "invalid_response"
    }));
  });

  it("classifies malformed provider identifiers as an invalid provider response", async () => {
    const client = createArcPayRefundClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, vi.fn(async () => response({
      id: "not-a-provider-refund-id",
      payment_id: "11111111-1111-4111-8111-111111111111",
      amount: 4_000,
      currency: "RUB",
      status: "pending",
      created_at: "2026-08-05T10:00:00Z"
    })) as typeof fetch);

    await expect(client.createRefund({
      envelope: refundEnvelope(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333"
    })).rejects.toEqual(expect.objectContaining<Partial<ArcPayRefundClientError>>({
      reason: "invalid_response"
    }));
  });

  it("classifies an indeterminate network outcome separately from a provider rejection", async () => {
    const client = createArcPayRefundClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "test-secret"
    }, vi.fn(async () => { throw new Error("network interrupted"); }) as typeof fetch);

    await expect(client.createRefund({
      envelope: refundEnvelope(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333"
    })).rejects.toEqual(expect.objectContaining<Partial<ArcPayRefundClientError>>({ reason: "transport" }));
  });
});

function refundEnvelope() {
  return {
    kind: "refund" as const,
    providerPaymentId: "11111111-1111-4111-8111-111111111111",
    amount: { amountMinor: 4_000, currency: "RUB" as const },
    externalId: "refund:refund-1"
  };
}

function response(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
