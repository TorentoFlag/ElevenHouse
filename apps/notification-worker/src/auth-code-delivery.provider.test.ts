import { describe, expect, it, vi } from "vitest";
import {
  ChannelAuthCodeDeliveryProvider,
  DevConsoleAuthCodeDeliveryProvider,
  EmailAuthCodeDeliveryProvider,
  SmsAuthCodeDeliveryProvider
} from "./auth-code-delivery.provider";

describe("EmailAuthCodeDeliveryProvider", () => {
  it("posts email auth codes to the configured delivery endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messageId: "email-message-1" }), {
          status: 202,
          headers: { "content-type": "application/json" }
        })
    );
    const delivery = new EmailAuthCodeDeliveryProvider(
      {
        endpointUrl: "https://delivery.internal/auth/email",
        bearerToken: "email-token",
        from: "auth@elevenhouse.test"
      },
      fetchMock
    );

    await expect(
      delivery.deliverAuthCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_1",
        outboxEventId: "outbox_1",
        channel: "email",
        identifier: "client@example.com",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "email",
      status: "sent",
      providerStatusCode: 202,
      providerMessageId: "email-message-1"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://delivery.internal/auth/email", {
      method: "POST",
      headers: {
        authorization: "Bearer email-token",
        "content-type": "application/json",
        "idempotency-key": "delivery_1"
      },
      body: JSON.stringify({
        kind: "passwordless_auth_code",
        channel: "email",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_1",
        outboxEventId: "outbox_1",
        to: "client@example.com",
        from: "auth@elevenhouse.test",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    });
  });

  it("reports email delivery gateway failures without throwing", async () => {
    const delivery = new EmailAuthCodeDeliveryProvider(
      {
        endpointUrl: "https://delivery.internal/auth/email",
        bearerToken: "email-token",
        from: "auth@elevenhouse.test"
      },
      vi.fn(async () => new Response("provider unavailable", { status: 503 }))
    );

    await expect(
      delivery.deliverAuthCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_1",
        outboxEventId: "outbox_1",
        channel: "email",
        identifier: "client@example.com",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "email",
      status: "failed",
      providerStatusCode: 503,
      errorCode: "EMAIL_DELIVERY_HTTP_503",
      errorMessage: "provider unavailable"
    });
  });
});

describe("SmsAuthCodeDeliveryProvider", () => {
  it("posts phone auth codes to the configured SMS delivery endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messageId: "sms-message-1" }), {
          status: 202,
          headers: { "content-type": "application/json" }
        })
    );
    const delivery = new SmsAuthCodeDeliveryProvider(
      {
        endpointUrl: "https://delivery.internal/auth/sms",
        bearerToken: "sms-token",
        from: "ElevenHouse"
      },
      fetchMock
    );

    await expect(
      delivery.deliverAuthCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_1",
        outboxEventId: "outbox_1",
        channel: "phone",
        identifier: "+15551234090",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "sms",
      status: "sent",
      providerStatusCode: 202,
      providerMessageId: "sms-message-1"
    });
  });
});

describe("DevConsoleAuthCodeDeliveryProvider", () => {
  it("logs auth codes for local development and marks delivery as sent", async () => {
    const logger = {
      info: vi.fn()
    };
    const delivery = new DevConsoleAuthCodeDeliveryProvider(logger);

    await expect(
      delivery.deliverAuthCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        deliveryId: "delivery_1",
        outboxEventId: "outbox_1",
        channel: "phone",
        identifier: "+15551234090",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "dev_console",
      status: "sent",
      providerMessageId: "dev-console-delivery_1"
    });
    expect(logger.info).toHaveBeenCalledWith("dev console auth code delivery", {
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      deliveryId: "delivery_1",
      outboxEventId: "outbox_1",
      channel: "phone",
      identifier: "+15551234090",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });
  });
});

describe("ChannelAuthCodeDeliveryProvider", () => {
  it("delegates email and phone auth codes to their channel adapters", async () => {
    const emailDelivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email" as const,
        status: "sent" as const,
        providerMessageId: "email-message-1"
      }))
    };
    const smsDelivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "sms" as const,
        status: "sent" as const,
        providerMessageId: "sms-message-1"
      }))
    };
    const delivery = new ChannelAuthCodeDeliveryProvider(emailDelivery, smsDelivery);

    await delivery.deliverAuthCode({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      deliveryId: "delivery_1",
      outboxEventId: "outbox_1",
      channel: "email",
      identifier: "client@example.com",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });
    await delivery.deliverAuthCode({
      challengeId: "9e14390f-3db1-4d1c-9344-55679c778427",
      deliveryId: "delivery_2",
      outboxEventId: "outbox_2",
      channel: "phone",
      identifier: "+15551234090",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });

    expect(emailDelivery.deliverAuthCode).toHaveBeenCalledTimes(1);
    expect(smsDelivery.deliverAuthCode).toHaveBeenCalledTimes(1);
  });
});
