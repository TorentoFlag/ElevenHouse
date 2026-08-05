import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  inspectArcPayWebhookSignature,
  verifyArcPayWebhookSignature
} from "./arc-pay-signature";

const secret = "arc-pay-webhook-secret";
const rawBody = '{"event_id":"11111111-1111-4111-8111-111111111111"}';
const timestamp = "1785844800";
const webhookId = "11111111-1111-4111-8111-111111111111";

describe("ArcPay webhook signature inspection", () => {
  it("returns immutable verification facts only after the exact signed payload verifies", () => {
    const signature = createHmac("sha256", secret)
      .update(`${webhookId}.${timestamp}.${rawBody}`)
      .digest("hex");

    const result = inspectArcPayWebhookSignature({
      headers: {
        "webhook-id": webhookId,
        "webhook-attempt": "1",
        "webhook-timestamp": timestamp,
        "webhook-signature": `t=${timestamp},v1=${signature}`
      },
      rawBody,
      secret,
      timestampToleranceSeconds: 300,
      now: new Date("2026-08-04T12:00:00.000Z")
    });

    expect(result).toEqual({
      kind: "verified",
      webhookId,
      signedTimestamp: "2026-08-04T12:00:00.000Z",
      signatureEvidenceDigest: "sha256:7616ec6fc842af72dd467440c2bd35f016bbb34bdb10c26bec3d7b7b6d7a9067"
    });
    expect(
      verifyArcPayWebhookSignature({
        headers: {
          "webhook-id": webhookId,
          "webhook-attempt": "1",
          "webhook-timestamp": timestamp,
          "webhook-signature": `t=${timestamp},v1=${signature}`
        },
        rawBody,
        secret,
        timestampToleranceSeconds: 300,
        now: new Date("2026-08-04T12:00:00.000Z")
      })
    ).toBe(true);
  });

  it("does not expose evidence facts when headers, time window, or signature are invalid", () => {
    const result = inspectArcPayWebhookSignature({
      headers: {
        "webhook-id": webhookId,
        "webhook-attempt": "1",
        "webhook-timestamp": timestamp,
        "webhook-signature": `t=${timestamp},v1=${"0".repeat(64)}`
      },
      rawBody,
      secret,
      timestampToleranceSeconds: 300,
      now: new Date("2026-08-04T12:00:00.000Z")
    });

    expect(result).toEqual({ kind: "invalid" });
  });

  it("verifies the exact received bytes without a UTF-8 normalization round trip", () => {
    const rawBytes = Uint8Array.of(0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d);
    const signature = createHmac("sha256", secret)
      .update(`${webhookId}.${timestamp}.`, "utf8")
      .update(rawBytes)
      .digest("hex");

    expect(
      inspectArcPayWebhookSignature({
        headers: {
          "webhook-id": webhookId,
          "webhook-attempt": "1",
          "webhook-timestamp": timestamp,
          "webhook-signature": `t=${timestamp},v1=${signature}`
        },
        rawBody: rawBytes,
        secret,
        timestampToleranceSeconds: 300,
        now: new Date("2026-08-04T12:00:00.000Z")
      })
    ).toMatchObject({ kind: "verified", webhookId });
  });
});
