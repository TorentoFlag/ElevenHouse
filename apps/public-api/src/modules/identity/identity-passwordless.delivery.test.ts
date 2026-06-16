import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  ChannelAuthCodeDeliveryProvider,
  DevAuthCodeDeliveryProvider,
  EmailAuthCodeDeliveryProvider,
  SmsAuthCodeDeliveryProvider
} from "./identity-passwordless.delivery";

describe("DevAuthCodeDeliveryProvider", () => {
  it("reports auth codes as sent with a deterministic dev provider message id", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const delivery = new DevAuthCodeDeliveryProvider();

    await expect(
      delivery.deliverAuthCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email",
        identifier: "client@example.com",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "dev",
      status: "sent",
      providerMessageId: "dev:8e14390f-3db1-4d1c-9344-55679c778427"
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Dev auth code challenge=8e14390f-3db1-4d1c-9344-55679c778427 channel=email identifier=client@example.com code=123456 expiresAt=2026-06-16T10:10:00.000Z"
    );
  });
});

describe("EmailAuthCodeDeliveryProvider", () => {
  it("posts email auth codes to the configured delivery endpoint", async () => {
    const fetchMock = vi.fn(async () =>
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
        channel: "email",
        identifier: "client@example.com",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "email",
      status: "sent",
      providerMessageId: "email-message-1"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://delivery.internal/auth/email", {
      method: "POST",
      headers: {
        authorization: "Bearer email-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: "passwordless_auth_code",
        channel: "email",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
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
        channel: "email",
        identifier: "client@example.com",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "email",
      status: "failed",
      errorCode: "EMAIL_DELIVERY_HTTP_503",
      errorMessage: "provider unavailable"
    });
  });
});

describe("SmsAuthCodeDeliveryProvider", () => {
  it("posts phone auth codes to the configured SMS delivery endpoint", async () => {
    const fetchMock = vi.fn(async () =>
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
        channel: "phone",
        identifier: "+15551234090",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    ).resolves.toEqual({
      provider: "sms",
      status: "sent",
      providerMessageId: "sms-message-1"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://delivery.internal/auth/sms", {
      method: "POST",
      headers: {
        authorization: "Bearer sms-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: "passwordless_auth_code",
        channel: "phone",
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        to: "+15551234090",
        from: "ElevenHouse",
        code: "123456",
        expiresAt: "2026-06-16T10:10:00.000Z"
      })
    });
  });
});

describe("ChannelAuthCodeDeliveryProvider", () => {
  it("delegates email and phone auth codes to their channel adapters", async () => {
    const emailDelivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "email",
        status: "sent" as const,
        providerMessageId: "email-message-1"
      }))
    };
    const smsDelivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "sms",
        status: "sent" as const,
        providerMessageId: "sms-message-1"
      }))
    };
    const delivery = new ChannelAuthCodeDeliveryProvider(emailDelivery, smsDelivery);

    await delivery.deliverAuthCode({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      identifier: "client@example.com",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });
    await delivery.deliverAuthCode({
      challengeId: "9e14390f-3db1-4d1c-9344-55679c778427",
      channel: "phone",
      identifier: "+15551234090",
      code: "123456",
      expiresAt: "2026-06-16T10:10:00.000Z"
    });

    expect(emailDelivery.deliverAuthCode).toHaveBeenCalledTimes(1);
    expect(smsDelivery.deliverAuthCode).toHaveBeenCalledTimes(1);
  });
});
