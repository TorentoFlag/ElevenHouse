import { describe, expect, it, vi } from "vitest";
import {
  ArcPaySettlementLedgerError,
  createArcPaySettlementLedgerClient
} from "./arc-pay-settlement-ledger-client";

describe("createArcPaySettlementLedgerClient", () => {
  it("reads settlement ledger with documented cursor params and bearer auth", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          entries: [
            {
              entry_id: "ledger-entry-1",
              entry_type: "capture",
              amount: 50000,
              currency: "RUB",
              direction: "credit",
              reference_type: "payment",
              reference_id: "payment-1",
              occurred_at: "2026-07-27T07:45:00.000Z",
              settlement_status: "cleared",
              fee_amount: 1500,
              balance_after: 48500,
              bank_rrn: "123456789012"
            }
          ],
          next_cursor: "cursor-2",
          total_count: 2
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const client = createArcPaySettlementLedgerClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "arc-pay-secret",
      fetchImpl: fetchImpl as typeof fetch
    });

    const page = await client.listSettlementLedger(
      {
        from: "2026-07-27T00:00:00.000Z",
        to: "2026-07-27T08:00:00.000Z",
        limit: 100,
        cursor: "cursor-1",
        currency: "RUB"
      }
    );
    expect(page).toEqual({
      entries: [
        {
          provider: "arc_pay",
          providerLedgerEntryId: "ledger-entry-1",
          providerPaymentId: "payment-1",
          amount: { amountMinor: 50_000, currency: "RUB" },
          direction: "credit",
          referenceType: "payment",
          providerOccurredAt: "2026-07-27T07:45:00.000Z",
          settlementStatus: "cleared",
          raw: expect.objectContaining({
            entry_id: "ledger-entry-1",
            reference_id: "payment-1"
          })
        }
      ],
      nextCursor: "cursor-2",
      totalCount: 2
    });
    expect(page.entries[0]).not.toHaveProperty("environment");

    const calledUrl = calls[0]?.url;
    expect(calledUrl).toEqual(
      new URL(
        "https://api.arcpay.space/v1/settlement/ledger?from=2026-07-27T00%3A00%3A00.000Z&to=2026-07-27T08%3A00%3A00.000Z&limit=100&cursor=cursor-1&currency=RUB"
      )
    );
    expect(calls[0]?.options).toMatchObject({
      headers: { authorization: "Bearer arc-pay-secret" }
    });
  });

  it("fails closed without a secret or with malformed provider payload", async () => {
    const noSecretClient = createArcPaySettlementLedgerClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: null,
      fetchImpl: vi.fn() as typeof fetch
    });

    await expect(
      noSecretClient.listSettlementLedger({
        from: "2026-07-27T00:00:00.000Z",
        to: "2026-07-27T08:00:00.000Z",
        limit: 100
      })
    ).rejects.toBeInstanceOf(ArcPaySettlementLedgerError);

    const malformedClient = createArcPaySettlementLedgerClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "arc-pay-secret",
      fetchImpl: vi.fn(
        async () => new Response(JSON.stringify({ entries: [{}] }), { status: 200 })
      ) as typeof fetch
    });

    await expect(
      malformedClient.listSettlementLedger({
        from: "2026-07-27T00:00:00.000Z",
        to: "2026-07-27T08:00:00.000Z",
        limit: 100
      })
    ).rejects.toBeInstanceOf(ArcPaySettlementLedgerError);
  });
});
