// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createAdminFinanceAuthorizationClient } from "./adminFinanceAuthorizationsApi";

describe("createAdminFinanceAuthorizationClient", () => {
  it("binds a passkey assertion to the exact server-issued payout approval command", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          challengeId: "11111111-1111-4111-8111-111111111111",
          expiresAt: "2026-08-05T10:05:00.000Z",
          publicKey: {
            challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            rpId: "admin.elevenhouse.test",
            timeout: 300_000,
            userVerification: "required"
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          authorizationId: "22222222-2222-4222-8222-222222222222",
          expiresAt: "2026-08-05T10:05:00.000Z"
        })
      );
    const client = createAdminFinanceAuthorizationClient({
      fetcher,
      csrfTokenReader: () => "csrf-token",
      credentials: {
        get: vi.fn(async () =>
          ({
            type: "public-key",
            rawId: new Uint8Array([1, 2, 3]).buffer,
            response: {
              clientDataJSON: new Uint8Array([4]).buffer,
              authenticatorData: new Uint8Array([5]).buffer,
              signature: new Uint8Array([6]).buffer,
              userHandle: null
            },
            getClientExtensionResults: () => ({}),
            authenticatorAttachment: "platform"
          }) as unknown as Credential)
      }
    });

    await expect(
      client.authorize({
        actionKind: "payout_approve",
        aggregateId: "33333333-3333-4333-8333-333333333333",
        expectedVersion: 2,
        payload: { adminNote: null, status: "approved" }
      })
    ).resolves.toMatchObject({ authorizationId: "22222222-2222-4222-8222-222222222222" });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/admin/finance/authorizations/begin",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
        body: JSON.stringify({
          actionKind: "payout_approve",
          aggregateId: "33333333-3333-4333-8333-333333333333",
          expectedVersion: 2,
          payload: { adminNote: null, status: "approved" }
        })
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/admin/finance/authorizations/verify",
      expect.objectContaining({
        body: JSON.stringify({
          challengeId: "11111111-1111-4111-8111-111111111111",
          assertion: {
            id: "AQID",
            rawId: "AQID",
            type: "public-key",
            response: {
              clientDataJSON: "BA",
              authenticatorData: "BQ",
              signature: "Bg",
              userHandle: null
            },
            clientExtensionResults: {},
            authenticatorAttachment: "platform"
          }
        })
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
