// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  FinanceWebAuthnAssertionError,
  createFinanceWebAuthnAssertion
} from "./financeWebAuthnAssertion";

describe("createFinanceWebAuthnAssertion", () => {
  it("serializes the browser assertion without allowing the caller to alter server options", async () => {
    const getter = {
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
          getClientExtensionResults: () => ({ credProps: { rk: true } }),
          authenticatorAttachment: "platform"
        }) as unknown as Credential)
    };

    const assertion = await createFinanceWebAuthnAssertion({
      authorization: {
        challengeId: "11111111-1111-4111-8111-111111111111",
        expiresAt: "2026-08-05T10:05:00.000Z",
        publicKey: {
          challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          rpId: "admin.elevenhouse.test",
          timeout: 300_000,
          userVerification: "required"
        }
      },
      credentials: getter
    });

    expect(getter.get).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        rpId: "admin.elevenhouse.test",
        timeout: 300_000,
        userVerification: "required"
      })
    });
    expect(assertion).toEqual({
      id: "AQID",
      rawId: "AQID",
      type: "public-key",
      response: {
        clientDataJSON: "BA",
        authenticatorData: "BQ",
        signature: "Bg",
        userHandle: null
      },
      clientExtensionResults: { credProps: { rk: true } },
      authenticatorAttachment: "platform"
    });
  });

  it("fails closed when the browser does not return an assertion", async () => {
    await expect(
      createFinanceWebAuthnAssertion({
        authorization: {
          challengeId: "11111111-1111-4111-8111-111111111111",
          expiresAt: "2026-08-05T10:05:00.000Z",
          publicKey: {
            challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            rpId: "admin.elevenhouse.test",
            timeout: 300_000,
            userVerification: "required"
          }
        },
        credentials: { get: vi.fn(async () => null) }
      })
    ).rejects.toMatchObject({
      code: "finance_webauthn_assertion_invalid"
    } satisfies Partial<FinanceWebAuthnAssertionError>);
  });
});
