import { describe, expect, it } from "vitest";
import {
  SmtpEmailAuthCodeDeliveryProvider,
  UnconfiguredSmsAuthCodeDeliveryProvider,
  type AuthCodeDeliveryInput
} from "./auth-code-delivery.provider";

const authCodeInput: AuthCodeDeliveryInput = {
  challengeId: "challenge-1",
  deliveryId: "delivery-1",
  outboxEventId: "outbox-1",
  channel: "email",
  identifier: "client@example.com",
  code: "123456",
  expiresAt: "2026-08-20T12:00:00.000Z"
};

describe("SmtpEmailAuthCodeDeliveryProvider", () => {
  it("sends an email auth code with the configured SMTP sender", async () => {
    const sentMessages: unknown[] = [];
    const provider = new SmtpEmailAuthCodeDeliveryProvider(
      {
        host: "smtp.purelymail.com",
        port: 465,
        secure: true,
        user: "support@elevenhouse.ai",
        password: "smtp-password",
        from: "ElevenHouse <support@elevenhouse.ai>"
      },
      {
        sendMail: async (message) => {
          sentMessages.push(message);
          return { messageId: "smtp-message-1" };
        }
      }
    );

    const result = await provider.deliverAuthCode(authCodeInput);

    expect(result).toEqual({
      provider: "email",
      status: "sent",
      providerMessageId: "smtp-message-1"
    });
    expect(sentMessages).toEqual([
      {
        from: "ElevenHouse <support@elevenhouse.ai>",
        to: "client@example.com",
        subject: "Your ElevenHouse sign-in code",
        text: "Your ElevenHouse sign-in code is 123456.",
        html: "<p>Your ElevenHouse sign-in code is <strong>123456</strong>.</p>"
      }
    ]);
  });

  it("fails closed when asked to deliver a non-email auth code", async () => {
    const sentMessages: unknown[] = [];
    const provider = new SmtpEmailAuthCodeDeliveryProvider(
      {
        host: "smtp.purelymail.com",
        port: 465,
        secure: true,
        user: "support@elevenhouse.ai",
        password: "smtp-password",
        from: "ElevenHouse <support@elevenhouse.ai>"
      },
      {
        sendMail: async (message) => {
          sentMessages.push(message);
          return { messageId: "smtp-message-1" };
        }
      }
    );

    const result = await provider.deliverAuthCode({
      ...authCodeInput,
      channel: "phone",
      identifier: "+15551234567"
    });

    expect(result).toEqual({
      provider: "email",
      status: "failed",
      errorCode: "EMAIL_DELIVERY_CHANNEL_MISMATCH",
      errorMessage: "Email auth code delivery only supports email challenges"
    });
    expect(sentMessages).toEqual([]);
  });
});

describe("UnconfiguredSmsAuthCodeDeliveryProvider", () => {
  it("reports SMS delivery as unconfigured instead of faking success", async () => {
    const provider = new UnconfiguredSmsAuthCodeDeliveryProvider();

    const result = await provider.deliverAuthCode({
      ...authCodeInput,
      channel: "phone",
      identifier: "+15551234567"
    });

    expect(result).toEqual({
      provider: "sms",
      status: "failed",
      errorCode: "SMS_DELIVERY_PROVIDER_NOT_CONFIGURED",
      errorMessage: "SMS auth code delivery provider is not configured"
    });
  });
});
