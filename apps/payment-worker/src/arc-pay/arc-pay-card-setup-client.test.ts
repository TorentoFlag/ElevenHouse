import { describe, expect, it, vi } from "vitest";

import {
  ArcPayCardSetupClientError,
  createArcPayCardSetupClient
} from "./arc-pay-card-setup-client";

const idempotencyKey = "11111111-1111-4111-8111-111111111111";

describe("ArcPay card setup client", () => {
  it("maps only a persisted zero-amount setup envelope to the documented setup request", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const rawResponse = setupResponse();
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push({ url, options });
      return new Response(rawResponse, { status: 201, headers: { "content-type": "application/json" } });
    });
    const client = createArcPayCardSetupClient(config(), fetchImpl as typeof fetch);

    const result = await client.createCardSetup({ envelope: setupEnvelope(), idempotencyKey });

    expect(result.providerSetupId).toBe("22222222-2222-4222-8222-222222222222");
    expect(new TextDecoder().decode(result.rawResponseBytes)).toBe(rawResponse);
    expect(String(calls[0]?.url)).toBe("https://api.arcpay.space/v1/cards/setup");
    expect(calls[0]?.options).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer arc-pay-secret",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      }
    });
    expect(JSON.parse(String(calls[0]?.options?.body))).toEqual({
      currency: "RUB",
      customer_id: "astrologer:11111111-1111-4111-8111-111111111111",
      external_id: "platform-card-setup:session-1",
      success_url: "https://astrologer.elevenhouse.test/settings?card-setup=success",
      fail_url: "https://astrologer.elevenhouse.test/settings?card-setup=failure"
    });
  });

  it("fails closed when the response is not a zero-amount created bank-card setup", async () => {
    const client = createArcPayCardSetupClient(
      config(),
      vi.fn(async () => new Response(JSON.stringify({ id: "22222222-2222-4222-8222-222222222222" }), { status: 201 })) as typeof fetch
    );

    await expect(client.createCardSetup({ envelope: setupEnvelope(), idempotencyKey })).rejects.toEqual(
      expect.objectContaining<Partial<ArcPayCardSetupClientError>>({ reason: "invalid_response" })
    );
  });

  it("does not issue a provider request without a worker secret", async () => {
    const fetchImpl = vi.fn();
    const client = createArcPayCardSetupClient(
      { ...config(), apiSecret: null },
      fetchImpl as typeof fetch
    );

    await expect(client.createCardSetup({ envelope: setupEnvelope(), idempotencyKey })).rejects.toEqual(
      expect.objectContaining<Partial<ArcPayCardSetupClientError>>({ reason: "not_configured" })
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("executes a tokenized setup with server secret and browser info only", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        payment_id: "22222222-2222-4222-8222-222222222222",
        status: "pending_3ds",
        next_action: threeDsMethodAction()
      }), { status: 200 });
    });
    const client = createArcPayCardSetupClient(config(), fetchImpl as typeof fetch);

    await expect(client.executeCardSetup({
      envelope: executeEnvelope(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      tokenizationSecret: {
        kind: "arc_pay_card_tokenization_secret",
        providerSetupId: "22222222-2222-4222-8222-222222222222",
        cardTokenId: "33333333-3333-4333-8333-333333333333",
        browserInfo: browserInfo()
      }
    })).resolves.toMatchObject({
      status: "pending_3ds",
      cardTokenId: null,
      nextAction: {
        type: "three_ds_method",
        threeDs: {
          version: "2",
          phase: "method",
          completionEndpoint: "/v1/payments/22222222-2222-4222-8222-222222222222/complete-3ds-method",
          threeDsServerTransactionId: "3ds-server-transaction-1",
          submit: {
            method: "POST",
            url: "https://acs.example.test/three-ds-method",
            target: "hidden_iframe",
            fields: [{ name: "threeDSMethodData", value: "opaque" }]
          }
        }
      }
    });

    expect(String(calls[0]?.url)).toBe("https://api.arcpay.space/v1/payments/22222222-2222-4222-8222-222222222222/execute");
    expect(JSON.parse(String(calls[0]?.options?.body))).toEqual({
      payment_method: "bank_card",
      payment_mode: "h2h",
      card_token_id: "33333333-3333-4333-8333-333333333333",
      browser_info: {
        accept_header: "application/json", language: "ru-RU", screen_width: 1440,
        screen_height: 900, color_depth: 24, timezone_offset_minutes: -180,
        user_agent: "Mozilla/5.0", java_enabled: false, window_size: "05"
      }
    });
  });

  it("rejects pending 3DS without a complete typed browser action", async () => {
    const client = createArcPayCardSetupClient(
      config(),
      vi.fn(async () => new Response(JSON.stringify({
        payment_id: "22222222-2222-4222-8222-222222222222",
        status: "pending_3ds"
      }), { status: 200 })) as typeof fetch
    );

    await expect(client.executeCardSetup({
      envelope: executeEnvelope(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      tokenizationSecret: {
        kind: "arc_pay_card_tokenization_secret",
        providerSetupId: "22222222-2222-4222-8222-222222222222",
        cardTokenId: "33333333-3333-4333-8333-333333333333",
        browserInfo: browserInfo()
      }
    })).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("completes only a persisted 3DS Method with worker-held browser data and server transaction ID", async () => {
    const calls: Array<{ readonly url: RequestInfo | URL; readonly options?: RequestInit }> = [];
    const client = createArcPayCardSetupClient(
      config(),
      vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({
          payment_id: "22222222-2222-4222-8222-222222222222",
          status: "pending_3ds",
          next_action: threeDsChallengeAction()
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    );

    await expect(client.completeThreeDsMethod({
      providerSetupId: "22222222-2222-4222-8222-222222222222",
      completionIndicator: "Y",
      threeDsServerTransactionId: "3ds-server-transaction-1",
      browserInfo: browserInfo(),
      idempotencyKey: "33333333-3333-4333-8333-333333333333"
    })).resolves.toMatchObject({
      providerSetupId: "22222222-2222-4222-8222-222222222222",
      status: "pending_3ds",
      nextAction: { type: "three_ds_challenge", threeDs: { phase: "challenge", submit: { target: "browser" } } }
    });
    expect(String(calls[0]?.url)).toBe("https://api.arcpay.space/v1/payments/22222222-2222-4222-8222-222222222222/complete-3ds-method");
    expect(JSON.parse(String(calls[0]?.options?.body))).toEqual({
      completion_indicator: "Y",
      three_ds_server_trans_id: "3ds-server-transaction-1",
      browser_info: {
        accept_header: "application/json", language: "ru-RU", screen_width: 1440,
        screen_height: 900, color_depth: 24, timezone_offset_minutes: -180,
        user_agent: "Mozilla/5.0", java_enabled: false, window_size: "05"
      }
    });
  });
});

function executeEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "execute" as const,
    customerId: "astrologer:11111111-1111-4111-8111-111111111111",
    providerSetupId: "22222222-2222-4222-8222-222222222222",
    setupExternalId: "platform-card-setup:session-1",
    tokenizationSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "kms://s3/eyJwcml2YXRlT2JqZWN0S2V5IjoidGVzdCJ9",
      providerExpiresAt: "2026-08-04T23:59:00Z",
      providerConsumption: "one_time" as const
    }
  };
}

function browserInfo() {
  return { acceptHeader: "application/json", language: "ru-RU", screenWidth: 1440, screenHeight: 900, colorDepth: 24 as const, timezoneOffsetMinutes: -180, userAgent: "Mozilla/5.0", javaEnabled: false, windowSize: "05" as const };
}

function threeDsMethodAction() {
  return {
    type: "three_ds_method",
    three_ds: {
      version: "2",
      phase: "method",
      completion_endpoint: "/v1/payments/22222222-2222-4222-8222-222222222222/complete-3ds-method",
      three_ds_server_trans_id: "3ds-server-transaction-1",
      submit: {
        method: "POST",
        url: "https://acs.example.test/three-ds-method",
        target: "hidden_iframe",
        fields: [{ name: "threeDSMethodData", value: "opaque" }]
      }
    }
  };
}

function threeDsChallengeAction() {
  return {
    type: "three_ds_challenge",
    three_ds: {
      version: "2",
      phase: "challenge",
      submit: {
        method: "POST",
        url: "https://acs.example.test/three-ds-challenge",
        target: "browser",
        fields: [{ name: "creq", value: "opaque" }]
      }
    }
  };
}

function config() {
  return { apiBaseUrl: "https://api.arcpay.space", apiSecret: "arc-pay-secret" as string | null };
}

function setupEnvelope() {
  return {
    kind: "card_setup" as const,
    step: "create" as const,
    customerId: "astrologer:11111111-1111-4111-8111-111111111111",
    setupExternalId: "platform-card-setup:session-1",
    successUrl: "https://astrologer.elevenhouse.test/settings?card-setup=success",
    failureUrl: "https://astrologer.elevenhouse.test/settings?card-setup=failure"
  };
}

function setupResponse() {
  return JSON.stringify({
    id: "22222222-2222-4222-8222-222222222222",
    amount: 0,
    currency: "RUB",
    payment_method: "bank_card",
    status: "created",
    created_at: "2026-08-04T12:00:00.000Z",
    updated_at: "2026-08-04T12:00:00.000Z",
    operations: []
  });
}
