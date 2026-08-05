import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ArcPayExactJsonDecodeError, decodeArcPayExactJson } from "./arc-pay-exact-json";

const encoder = new TextEncoder();

describe("ArcPay exact JSON decoder", () => {
  it("preserves every signed int64 lexeme as a decimal string", () => {
    const rawBody = encoder.encode(
      '{"entries":[{"amount":9223372036854775807,"fee_amount":-9223372036854775808}],"total_count":100}'
    );

    expect(
      decodeArcPayExactJson({
        rawBody,
        expectedDigest: digest(rawBody),
        maximumBytes: 512 * 1024
      })
    ).toEqual({
      rawDigest: digest(rawBody),
      byteLength: rawBody.byteLength,
      value: {
        entries: [
          {
            amount: "9223372036854775807",
            fee_amount: "-9223372036854775808"
          }
        ],
        total_count: "100"
      }
    });
  });

  it.each([
    '{"entry_id":"one","entry_id":"one"}',
    '{"entry":{"amount":1,"amount":2}}',
    '{"escaped":1,"\\u0065scaped":1}'
  ])("rejects every duplicate object key before native materialization", (json) => {
    expectDecodeReason(json, "duplicate_key");
  });

  it.each(['{"amount":1e3}', '{"amount":1.0}', '{"amount":-0}'])(
    "rejects a non-canonical integer token: %s",
    (json) => {
      expectDecodeReason(json, "non_canonical_int64");
    }
  );

  it.each(['{"amount":9223372036854775808}', '{"amount":-9223372036854775809}'])(
    "rejects an out-of-range int64 token: %s",
    (json) => {
      expectDecodeReason(json, "int64_out_of_range");
    }
  );

  it.each([
    '{"pan":"4242424242424242"}',
    '{"card":{"cvv":"123"}}',
    '{"encryptedCard":"opaque"}',
    '{"split":[{"merchant":"other"}]}',
    '{"subMerchant":{"id":"other"}}'
  ])("rejects forbidden card or marketplace material before sealing", (json) => {
    expectDecodeReason(json, "forbidden_payload");
  });

  it("fails closed on digest, byte-budget, UTF-8 and JSON errors without echoing payload", () => {
    const secretJson = '{"secret":"must-not-appear"}';
    const rawBody = encoder.encode(secretJson);
    expect(() =>
      decodeArcPayExactJson({
        rawBody,
        expectedDigest: digest(encoder.encode("different")),
        maximumBytes: 512 * 1024
      })
    ).toThrow(expect.objectContaining({ reason: "digest_mismatch" }));

    expect(() =>
      decodeArcPayExactJson({
        rawBody,
        expectedDigest: digest(rawBody),
        maximumBytes: rawBody.byteLength - 1
      })
    ).toThrow(expect.objectContaining({ reason: "payload_limit_exceeded" }));

    const invalidUtf8 = Uint8Array.from([0xc3, 0x28]);
    expect(() =>
      decodeArcPayExactJson({
        rawBody: invalidUtf8,
        expectedDigest: digest(invalidUtf8),
        maximumBytes: 128
      })
    ).toThrow(expect.objectContaining({ reason: "invalid_utf8" }));

    expectDecodeReason('{"entries":[}', "invalid_json");

    try {
      decodeArcPayExactJson({
        rawBody,
        expectedDigest: digest(encoder.encode("different")),
        maximumBytes: 512 * 1024
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ArcPayExactJsonDecodeError);
      expect(String(error)).not.toContain("must-not-appear");
      expect(error).not.toHaveProperty("rawBody");
    }
  });

  it("rejects an unsafe decoder policy before parsing", () => {
    const rawBody = encoder.encode("{}");
    expect(() =>
      decodeArcPayExactJson({
        rawBody,
        expectedDigest: digest(rawBody),
        maximumBytes: 2 * 1024 * 1024 + 1
      })
    ).toThrow(expect.objectContaining({ reason: "invalid_policy" }));
  });
});

function expectDecodeReason(json: string, reason: string): void {
  const rawBody = encoder.encode(json);
  expect(() =>
    decodeArcPayExactJson({
      rawBody,
      expectedDigest: digest(rawBody),
      maximumBytes: 512 * 1024
    })
  ).toThrow(expect.objectContaining({ reason }));
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
