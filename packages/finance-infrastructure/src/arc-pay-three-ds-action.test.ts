import { describe, expect, it } from "vitest";

import {
  ArcPayThreeDsActionDecoderError,
  decodeArcPayThreeDsAction
} from "./arc-pay-three-ds-action";

const providerSetupId = "11111111-1111-4111-8111-111111111111";

describe("ArcPay 3DS action decoder", () => {
  it("returns only an exact method action that is bound to its payment completion endpoint", () => {
    expect(
      decodeArcPayThreeDsAction({
        providerSetupId,
        responseBytes: bytes({
          type: "three_ds_method",
          three_ds: {
            version: "2",
            phase: "method",
            completion_endpoint: `/v1/payments/${providerSetupId}/complete-3ds-method`,
            three_ds_server_trans_id: "transaction-1",
            submit: {
              method: "POST",
              url: "https://acs.example.test/method",
              target: "hidden_iframe",
              fields: [{ name: "threeDSMethodData", value: "opaque" }]
            }
          }
        })
      })
    ).toEqual({
      type: "three_ds_method",
      threeDs: {
        version: "2",
        phase: "method",
        completionEndpoint: `/v1/payments/${providerSetupId}/complete-3ds-method`,
        threeDsServerTransactionId: "transaction-1",
        submit: {
          method: "POST",
          url: "https://acs.example.test/method",
          target: "hidden_iframe",
          fields: [{ name: "threeDSMethodData", value: "opaque" }]
        }
      }
    });
  });

  it("rejects an unbound completion endpoint or a non-HTTPS action target", () => {
    for (const replacement of [
      { completion_endpoint: "/v1/payments/foreign/complete-3ds-method" },
      { submit: { method: "POST", url: "http://acs.example.test/method", target: "hidden_iframe", fields: [{ name: "x", value: "y" }] } }
    ]) {
      const action = {
        type: "three_ds_method",
        three_ds: {
          version: "2",
          phase: "method",
          completion_endpoint: `/v1/payments/${providerSetupId}/complete-3ds-method`,
          three_ds_server_trans_id: "transaction-1",
          submit: {
            method: "POST",
            url: "https://acs.example.test/method",
            target: "hidden_iframe",
            fields: [{ name: "threeDSMethodData", value: "opaque" }]
          },
          ...replacement
        }
      };
      expect(() => decodeArcPayThreeDsAction({ providerSetupId, responseBytes: bytes(action) })).toThrow(
        expect.objectContaining<Partial<ArcPayThreeDsActionDecoderError>>({ reason: "invalid_action" })
      );
    }
  });
});

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
