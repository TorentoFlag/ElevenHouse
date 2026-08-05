import { describe, expect, it, vi } from "vitest";

import {
  ArcPayCanonicalPaymentReaderError,
  createArcPayCanonicalPaymentReader
} from "./arc-pay-canonical-payment-reader";

const providerPaymentId = "11111111-1111-4111-8111-111111111111";
const externalId = "22222222-2222-4222-8222-222222222222";
const invalidCanonicalPaymentCases: readonly [
  string,
  Record<string, unknown>,
  ArcPayCanonicalPaymentReaderError["reason"]
][] = [
  ["a mismatched immutable external id", { external_id: "foreign-order" }, "correlation"],
  ["a non-captured canonical state", { status: "pending" }, "not_captured"],
  ["a refunded canonical state", { status: "refunded" }, "not_captured"],
  ["a partial capture", { captured_amount: 49_999 }, "amount"],
  ["a different currency", { currency: "KZT" }, "currency"],
  ["an invalid response", { updated_at: "not-a-timestamp" }, "response"]
];

describe("ArcPay canonical payment reader", () => {
  it("retains exact provider bytes and accepts a canonical captured payment for its immutable order source", async () => {
    const rawBody = JSON.stringify({
      id: providerPaymentId,
      external_id: externalId,
      amount: 50_000,
      captured_amount: 50_000,
      currency: "RUB",
      payment_method: "bank_card",
      status: "captured",
      created_at: "2026-08-04T10:00:00.000Z",
      updated_at: "2026-08-04T10:01:00.000Z",
      operations: []
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })
    );
    const reader = createArcPayCanonicalPaymentReader(config(), fetchImpl as typeof fetch);

    await expect(
      reader.readCapturedPayment({ providerPaymentId, expectedExternalId: externalId })
    ).resolves.toEqual({
      payment: {
        providerPaymentId,
        externalId,
        amountMinor: 50_000,
        capturedAmountMinor: 50_000,
        currency: "RUB",
        status: "captured",
        observedAt: "2026-08-04T10:01:00.000Z"
      },
      rawResponseBytes: new TextEncoder().encode(rawBody)
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(`https://api.arcpay.space/v1/payments/${providerPaymentId}`),
      { headers: { authorization: "Bearer arc-pay-secret" } }
    );
  });

  it.each(invalidCanonicalPaymentCases)(
    "fails closed for %s",
    async (_label, replacement, reason) => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: providerPaymentId,
              external_id: externalId,
              amount: 50_000,
              captured_amount: 50_000,
              currency: "RUB",
              payment_method: "bank_card",
              status: "captured",
              created_at: "2026-08-04T10:00:00.000Z",
              updated_at: "2026-08-04T10:01:00.000Z",
              operations: [],
              ...replacement
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      );
      const reader = createArcPayCanonicalPaymentReader(config(), fetchImpl as typeof fetch);

      await expect(
        reader.readCapturedPayment({ providerPaymentId, expectedExternalId: externalId })
      ).rejects.toEqual(
        expect.objectContaining<Partial<ArcPayCanonicalPaymentReaderError>>({ reason })
      );
    }
  );

  it("does not make an unauthenticated provider read and separates transport failure from a malformed response", async () => {
    const fetchImpl = vi.fn();
    const unconfigured = createArcPayCanonicalPaymentReader(
      { ...config(), apiSecret: null },
      fetchImpl as typeof fetch
    );
    await expect(
      unconfigured.readCapturedPayment({ providerPaymentId, expectedExternalId: externalId })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ArcPayCanonicalPaymentReaderError>>({
        reason: "not_configured"
      })
    );
    expect(fetchImpl).not.toHaveBeenCalled();

    const unavailable = createArcPayCanonicalPaymentReader(
      config(),
      vi.fn(async () => {
        throw new Error("network unavailable");
      }) as typeof fetch
    );
    await expect(
      unavailable.readCapturedPayment({ providerPaymentId, expectedExternalId: externalId })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ArcPayCanonicalPaymentReaderError>>({ reason: "transport" })
    );
  });

  it("exposes a correlated non-terminal outcome without treating it as capture", async () => {
    const rawBody = JSON.stringify({
      id: providerPaymentId,
      external_id: externalId,
      amount: 50_000,
      captured_amount: 0,
      currency: "RUB",
      payment_method: "bank_card",
      status: "pending",
      created_at: "2026-08-04T10:00:00.000Z",
      updated_at: "2026-08-04T10:01:00.000Z"
    });
    const reader = createArcPayCanonicalPaymentReader(
      config(),
      vi.fn(
        async () =>
          new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })
      ) as typeof fetch
    );

    await expect(
      reader.readPaymentOutcome({ providerPaymentId, expectedExternalId: externalId })
    ).resolves.toMatchObject({
      payment: {
        providerPaymentId,
        externalId,
        status: "pending",
        amountMinor: 50_000,
        capturedAmountMinor: 0
      }
    });
  });

  it("allows a non-mutating lookup by payment id only so the worker can resolve the immutable order correlation", async () => {
    const rawBody = JSON.stringify({
      id: providerPaymentId,
      external_id: externalId,
      amount: 50_000,
      captured_amount: 50_000,
      currency: "RUB",
      payment_method: "bank_card",
      status: "captured",
      created_at: "2026-08-04T10:00:00.000Z",
      updated_at: "2026-08-04T10:01:00.000Z"
    });
    const reader = createArcPayCanonicalPaymentReader(
      config(),
      vi.fn(
        async () =>
          new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })
      ) as typeof fetch
    );

    await expect(reader.readPaymentOutcomeById({ providerPaymentId })).resolves.toMatchObject({
      payment: {
        providerPaymentId,
        externalId,
        status: "captured",
        amountMinor: 50_000,
        capturedAmountMinor: 50_000
      },
      rawResponseBytes: new TextEncoder().encode(rawBody)
    });
  });

  it.each(["created", "authorized", "voided", "expired"] as const)(
    "preserves the documented ArcPay %s state for reconciliation instead of rejecting it as malformed",
    async (status) => {
      const reader = createArcPayCanonicalPaymentReader(
        config(),
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                id: providerPaymentId,
                external_id: externalId,
                amount: 50_000,
                captured_amount: 0,
                currency: "RUB",
                payment_method: "bank_card",
                status,
                created_at: "2026-08-04T10:00:00.000Z",
                updated_at: "2026-08-04T10:01:00.000Z"
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
        ) as typeof fetch
      );

      await expect(
        reader.readPaymentOutcome({ providerPaymentId, expectedExternalId: externalId })
      ).resolves.toMatchObject({ payment: { status, capturedAmountMinor: 0 } });
    }
  );

  it("verifies one exact refund operation against the canonical payment cumulative amount", async () => {
    const providerRefundId = "33333333-3333-4333-8333-333333333333";
    const rawBody = JSON.stringify({
      id: providerPaymentId,
      external_id: externalId,
      amount: 50_000,
      captured_amount: 50_000,
      refunded_amount: 12_500,
      currency: "RUB",
      payment_method: "bank_card",
      status: "captured",
      created_at: "2026-08-04T10:00:00.000Z",
      updated_at: "2026-08-04T10:03:00.000Z",
      operations: [
        {
          operation_type: "refund",
          operation_ref_id: providerRefundId,
          amount: 12_500,
          currency: "RUB",
          status: "succeeded",
          created_at: "2026-08-04T10:02:00.000Z",
          updated_at: "2026-08-04T10:03:00.000Z",
          completed_at: "2026-08-04T10:03:00.000Z"
        }
      ]
    });
    const reader = createArcPayCanonicalPaymentReader(
      config(),
      vi.fn(
        async () =>
          new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })
      ) as typeof fetch
    );

    await expect(
      reader.readRefundOutcome({
        providerPaymentId,
        expectedExternalId: externalId,
        providerRefundId,
        expectedRefundAmountMinor: 12_500,
        previousCumulativeRefundedMinor: 0,
        expectedCumulativeRefundedMinor: 12_500
      })
    ).resolves.toEqual({
      refund: {
        providerPaymentId,
        externalId,
        providerRefundId,
        amountMinor: 12_500,
        cumulativeRefundedMinor: 12_500,
        currency: "RUB",
        status: "succeeded",
        observedAt: "2026-08-04T10:03:00.000Z"
      },
      rawResponseBytes: new TextEncoder().encode(rawBody)
    });
  });

  it.each([
    [
      "a different refund operation reference",
      {},
      { operation_ref_id: "44444444-4444-4444-8444-444444444444" },
      "correlation"
    ],
    ["a refund delta mismatch", {}, { amount: 12_499 }, "amount"],
    ["a cumulative amount mismatch", { refunded_amount: 12_499 }, {}, "amount"],
    ["a failed refund that changes the cumulative amount", {}, { status: "failed" }, "amount"],
    ["an unsupported refund operation status", {}, { status: "made_up" }, "response"]
  ] as const)(
    "fails closed for %s",
    async (_label, paymentReplacement, operationReplacement, reason) => {
      const providerRefundId = "33333333-3333-4333-8333-333333333333";
      const operation = {
        operation_type: "refund",
        operation_ref_id: providerRefundId,
        amount: 12_500,
        currency: "RUB",
        status: "succeeded",
        created_at: "2026-08-04T10:02:00.000Z",
        updated_at: "2026-08-04T10:03:00.000Z",
        completed_at: "2026-08-04T10:03:00.000Z",
        ...operationReplacement
      };
      const payment = {
        id: providerPaymentId,
        external_id: externalId,
        amount: 50_000,
        captured_amount: 50_000,
        refunded_amount: 12_500,
        currency: "RUB",
        payment_method: "bank_card",
        status: "captured",
        created_at: "2026-08-04T10:00:00.000Z",
        updated_at: "2026-08-04T10:03:00.000Z",
        operations: [operation],
        ...paymentReplacement
      };
      const reader = createArcPayCanonicalPaymentReader(
        config(),
        vi.fn(
          async () =>
            new Response(JSON.stringify(payment), {
              status: 200,
              headers: { "content-type": "application/json" }
            })
        ) as typeof fetch
      );

      await expect(
        reader.readRefundOutcome({
          providerPaymentId,
          expectedExternalId: externalId,
          providerRefundId,
          expectedRefundAmountMinor: 12_500,
          previousCumulativeRefundedMinor: 0,
          expectedCumulativeRefundedMinor: 12_500
        })
      ).rejects.toEqual(
        expect.objectContaining<Partial<ArcPayCanonicalPaymentReaderError>>({ reason })
      );
    }
  );

  it("keeps in-flight and unknown canonical refund operations non-terminal without guessing a ledger result", async () => {
    const providerRefundId = "33333333-3333-4333-8333-333333333333";
    for (const status of ["in_flight", "unknown"] as const) {
      const reader = createArcPayCanonicalPaymentReader(
        config(),
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                id: providerPaymentId,
                external_id: externalId,
                amount: 50_000,
                captured_amount: 50_000,
                refunded_amount: 0,
                currency: "RUB",
                payment_method: "bank_card",
                status: "captured",
                created_at: "2026-08-04T10:00:00.000Z",
                updated_at: "2026-08-04T10:03:00.000Z",
                operations: [
                  {
                    operation_type: "refund",
                    operation_ref_id: providerRefundId,
                    amount: 12_500,
                    currency: "RUB",
                    status,
                    created_at: "2026-08-04T10:02:00.000Z",
                    updated_at: "2026-08-04T10:03:00.000Z"
                  }
                ]
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
        ) as typeof fetch
      );
      await expect(
        reader.readRefundOutcome({
          providerPaymentId,
          expectedExternalId: externalId,
          providerRefundId,
          expectedRefundAmountMinor: 12_500,
          previousCumulativeRefundedMinor: 0,
          expectedCumulativeRefundedMinor: 12_500
        })
      ).resolves.toMatchObject({ refund: { status, cumulativeRefundedMinor: 0 } });
    }
  });

  it("requires a terminal zero-amount setup and its active canonical card record before exposing a reusable credential", async () => {
    const setupBody = JSON.stringify({
      id: providerPaymentId,
      external_id: externalId,
      amount: 0,
      captured_amount: 0,
      currency: "RUB",
      payment_method: "bank_card",
      status: "captured",
      card_token_id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-08-04T10:00:00.000Z",
      updated_at: "2026-08-04T10:01:00.000Z",
      operations: []
    });
    const cardsBody = JSON.stringify({
      cards: [
        {
          card_token_id: "33333333-3333-4333-8333-333333333333",
          card_mask: "411111******1111",
          card_scheme: "VISA",
          expiry_month: 12,
          expiry_year: 2030,
          bank_code: "acquiring-1",
          is_active: true,
          created_at: "2026-08-04T10:01:00.000Z"
        }
      ]
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(setupBody, { status: 200, headers: { "content-type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(cardsBody, { status: 200, headers: { "content-type": "application/json" } })
      );
    const reader = createArcPayCanonicalPaymentReader(config(), fetchImpl as typeof fetch);

    await expect(
      reader.readActivatedSavedCardSetup({
        providerSetupId: providerPaymentId,
        expectedExternalId: externalId,
        providerCustomerId: "astrologer:11111111-1111-4111-8111-111111111111"
      })
    ).resolves.toEqual({
      setup: {
        providerSetupId: providerPaymentId,
        externalId,
        cardTokenId: "33333333-3333-4333-8333-333333333333",
        displayBrand: "visa",
        displayLast4: "1111",
        displayMask: "************1111",
        expiryMonth: 12,
        expiryYear: 2030,
        observedAt: "2026-08-04T10:01:00.000Z"
      },
      rawPaymentResponseBytes: new TextEncoder().encode(setupBody),
      rawSavedCardsResponseBytes: new TextEncoder().encode(cardsBody)
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://api.arcpay.space/v1/cards?customer_id=astrologer%3A11111111-1111-4111-8111-111111111111"
      ),
      { headers: { authorization: "Bearer arc-pay-secret" } }
    );
  });

  it.each([
    ["a pending setup", { status: "pending" }, undefined, "not_setup_terminal"],
    ["a billed setup", { amount: 1, captured_amount: 1 }, undefined, "amount"],
    ["a setup without a reusable token", {}, { card_token_id: undefined }, "credential"],
    ["an inactive canonical card", {}, { is_active: false }, "credential"]
  ] as const)(
    "fails closed for %s",
    async (_label, paymentReplacement, cardReplacement, reason) => {
      const payment = {
        id: providerPaymentId,
        external_id: externalId,
        amount: 0,
        captured_amount: 0,
        currency: "RUB",
        payment_method: "bank_card",
        status: "captured",
        card_token_id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-08-04T10:00:00.000Z",
        updated_at: "2026-08-04T10:01:00.000Z",
        operations: [],
        ...paymentReplacement
      };
      const card = {
        card_token_id: "33333333-3333-4333-8333-333333333333",
        card_mask: "411111******1111",
        card_scheme: "VISA",
        expiry_month: 12,
        expiry_year: 2030,
        bank_code: "acquiring-1",
        is_active: true,
        created_at: "2026-08-04T10:01:00.000Z",
        ...cardReplacement
      };
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(payment), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ cards: [card] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
        );
      const reader = createArcPayCanonicalPaymentReader(config(), fetchImpl as typeof fetch);

      await expect(
        reader.readActivatedSavedCardSetup({
          providerSetupId: providerPaymentId,
          expectedExternalId: externalId,
          providerCustomerId: "astrologer:11111111-1111-4111-8111-111111111111"
        })
      ).rejects.toEqual(
        expect.objectContaining<Partial<ArcPayCanonicalPaymentReaderError>>({ reason })
      );
    }
  );
});

function config() {
  return { apiBaseUrl: "https://api.arcpay.space", apiSecret: "arc-pay-secret" as string | null };
}
