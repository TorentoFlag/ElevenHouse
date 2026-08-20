import { describe, expect, it } from "vitest";
import { createNotificationWorkerRuntimeConfig } from "./runtime-config";

const validKey = Buffer.from("12345678901234567890123456789012", "utf8").toString("base64");

describe("createNotificationWorkerRuntimeConfig", () => {
  it("configures SMTP auth code email delivery without the old email HTTP gateway", () => {
    const config = createNotificationWorkerRuntimeConfig({
      AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
      NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "smtp",
      NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_HOST: "smtp.purelymail.com",
      NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PORT: "465",
      NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_SECURE: "true",
      NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_USER: "support@elevenhouse.ai",
      NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_PASSWORD: "smtp-password",
      NOTIFICATION_WORKER_AUTH_CODE_EMAIL_FROM: "ElevenHouse <support@elevenhouse.ai>"
    });

    expect(config.authCodeDeliveryMode).toBe("smtp");
    expect(config.authCodeEmailSmtpDelivery).toEqual({
      host: "smtp.purelymail.com",
      port: 465,
      secure: true,
      user: "support@elevenhouse.ai",
      password: "smtp-password",
      from: "ElevenHouse <support@elevenhouse.ai>"
    });
    expect(config.authCodeSmsDelivery).toBeNull();
  });

  it("requires SMTP auth code email credentials in SMTP mode", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
        NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "smtp"
      })
    ).toThrow(/NOTIFICATION_WORKER_AUTH_CODE_EMAIL_SMTP_HOST/);
  });

  it("requires complete SMS HTTP settings when SMS delivery is partially configured", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
        NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "dev_console",
        NOTIFICATION_WORKER_AUTH_CODE_SMS_DELIVERY_ENDPOINT_URL: "https://delivery.internal/auth/sms"
      })
    ).toThrow(/SMS HTTP auth code delivery settings are required/);
  });

  it("keeps WhatsApp Cloud delivery disabled by default", () => {
    const config = createNotificationWorkerRuntimeConfig({
      AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
      NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "dev_console"
    });

    expect(config.whatsappCloudDelivery).toBeNull();
  });

  it("requires a token encryption key when WhatsApp Cloud delivery is enabled", () => {
    expect(() =>
      createNotificationWorkerRuntimeConfig({
        AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
        NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "dev_console",
        NOTIFICATION_WORKER_WHATSAPP_CLOUD_DELIVERY_ENABLED: "true"
      })
    ).toThrow(/NOTIFICATION_WORKER_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY/);
  });

  it("keeps messaging provider webhook processing disabled by default", () => {
    const config = createNotificationWorkerRuntimeConfig({
      AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
      NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "dev_console"
    });

    expect(config.messagingProviderWebhookProcessingEnabled).toBe(false);
    expect(config.messagingProviderWebhookProcessingAttempts).toBe(5);
    expect(config.messagingProviderWebhookProcessingBackoffMs).toBe(1000);
    expect(config.messagingProviderWebhookProcessingBatchSize).toBe(50);
  });

  it("enables messaging provider webhook processing independently from message delivery", () => {
    const config = createNotificationWorkerRuntimeConfig({
      AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validKey,
      NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE: "dev_console",
      NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ENABLED: "true",
      NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_ATTEMPTS: "7",
      NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BACKOFF_MS: "2000",
      NOTIFICATION_WORKER_MESSAGING_PROVIDER_WEBHOOK_PROCESSING_BATCH_SIZE: "25"
    });

    expect(config.messagingProviderWebhookProcessingEnabled).toBe(true);
    expect(config.messagingProviderWebhookProcessingAttempts).toBe(7);
    expect(config.messagingProviderWebhookProcessingBackoffMs).toBe(2000);
    expect(config.messagingProviderWebhookProcessingBatchSize).toBe(25);
  });
});
