import { describe, expect, it } from "vitest";

import {
  ArcPayWebhookPayloadError,
  parseArcPayWebhookTransportEnvelope
} from "./arc-pay-webhook";

const webhookId = "11111111-1111-4111-8111-111111111111";

describe("ArcPay webhook transport envelope", () => {
  it("accepts a signed transport event that has no implemented business effect yet", () => {
    expect(
      parseArcPayWebhookTransportEnvelope({
        webhookId,
        rawBody: JSON.stringify({
          event_id: webhookId,
          event_type: "payment.future_provider_event",
          environment: "sandbox",
          livemode: false,
          created_at: "2026-08-04T12:00:00.000Z",
          tenant_id: "22222222-2222-4222-8222-222222222222",
          data: { payment_id: "33333333-3333-4333-8333-333333333333" }
        })
      })
    ).toEqual({
      providerWebhookId: webhookId,
      providerEventType: "payment.future_provider_event",
      merchantTenantId: "22222222-2222-4222-8222-222222222222",
      environment: "sandbox",
      occurredAt: "2026-08-04T12:00:00.000Z"
    });
  });

  it("rejects a transport envelope when its event id or environment evidence is cross-wired", () => {
    expect(() =>
      parseArcPayWebhookTransportEnvelope({
        webhookId,
        rawBody: JSON.stringify({
          event_id: "44444444-4444-4444-8444-444444444444",
          event_type: "payment.captured",
          environment: "live",
          livemode: false,
          created_at: "2026-08-04T12:00:00.000Z",
          tenant_id: "22222222-2222-4222-8222-222222222222",
          data: { payment_id: "33333333-3333-4333-8333-333333333333" }
        })
      })
    ).toThrow(ArcPayWebhookPayloadError);
  });
});
