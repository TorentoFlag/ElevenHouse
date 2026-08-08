import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  ArcPaySettlementBalanceError,
  createArcPaySettlementBalanceClient
} from "./arc-pay-settlement-balance-client";

describe("createArcPaySettlementBalanceClient", () => {
  it("reads the documented balance endpoint without losing int64 minor units", async () => {
    const rawBody =
      '{"balances":[{"available":9223372036854775807,"currency":"RUB","pending":-7,"reserved":0,"updated_at":"2026-08-07T12:36:42.14332Z"}]}' as const;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        rawBody
      )
    );
    const client = createArcPaySettlementBalanceClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "arc-secret",
      fetchImpl
    });

    await expect(client.readSettlementBalance()).resolves.toEqual({
      balances: [
        {
          availableMinor: "9223372036854775807",
          currency: "RUB",
          pendingMinor: "-7",
          reservedMinor: "0",
          updatedAt: "2026-08-07T12:36:42.14332Z"
        }
      ],
      rawBody: new TextEncoder().encode(rawBody),
      rawDigest: `sha256:${createHash("sha256")
        .update(rawBody)
        .digest("hex")}`,
      rawByteLength: 133
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.arcpay.space/v1/settlement/balance");
    expect(init).toEqual({ headers: { authorization: "Bearer arc-secret" } });
  });

  it("fails closed for an unavailable credential or malformed provider response", async () => {
    const noSecretClient = createArcPaySettlementBalanceClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: null
    });
    await expect(noSecretClient.readSettlementBalance()).rejects.toBeInstanceOf(
      ArcPaySettlementBalanceError
    );

    const malformedClient = createArcPaySettlementBalanceClient({
      apiBaseUrl: "https://api.arcpay.space",
      apiSecret: "arc-secret",
      fetchImpl: vi.fn(async () =>
        new Response('{"balances":[{"available":1.5,"currency":"RUB","pending":0,"reserved":0}]}')
      )
    });
    await expect(malformedClient.readSettlementBalance()).rejects.toBeInstanceOf(
      ArcPaySettlementBalanceError
    );
  });
});
