import { describe, expect, it } from "vitest";

import { createAstrologerApiRuntimeConfig } from "./runtime-config";

const validAes256GcmKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    AUTH_CODE_DELIVERY_ENCRYPTION_KEY: validAes256GcmKey,
    ASTROLOGER_OPENAI_API_KEY: "test-openai-key",
    ASTROLOGER_API_BIRTH_PLACE_SEARCH_ENABLED: "false",
    ...overrides
  };
}

describe("createAstrologerApiRuntimeConfig WhatsApp Cloud", () => {
  it("provides a typed local CRM cursor secret and requires an explicit production secret", () => {
    expect(createAstrologerApiRuntimeConfig(baseEnv()).clientCrm.cursorSecret).toHaveLength(80);

    expect(() =>
      createAstrologerApiRuntimeConfig(
        baseEnv({
          NODE_ENV: "production",
          ASTROLOGER_API_SESSION_COOKIE_SECURE: "true",
          ASTROLOGER_API_CSRF_SECRET: "a".repeat(32),
          ASTROLOGER_API_TELEGRAM_BOT_WEBHOOK_SECRET: "telegram-webhook-secret",
          ASTROLOGER_API_TELEGRAM_BOT_TOKEN: "telegram-bot-token",
          ASTROLOGER_API_TELEGRAM_BUSINESS_BOT_USERNAME: "elevenhouse_bot",
          ASTROLOGER_API_PASSWORDLESS_CODE_SECRET: "passwordless-code-secret",
          ASTROLOGER_API_ALLOWED_ORIGINS: "https://astrologer.elevenhouse.ai",
          CHART_ENGINE_BASE_URL: "http://chart-engine:8012"
        })
      )
    ).toThrow("ASTROLOGER_API_CLIENT_CRM_CURSOR_SECRET is required in production");
  });

  it("keeps WhatsApp Cloud disabled by default", () => {
    const config = createAstrologerApiRuntimeConfig(baseEnv());

    expect(config.whatsappCloud).toBeNull();
  });

  it("parses enabled WhatsApp Cloud settings", () => {
    const config = createAstrologerApiRuntimeConfig(
      baseEnv({
        ASTROLOGER_API_WHATSAPP_CLOUD_ENABLED: "true",
        ASTROLOGER_API_WHATSAPP_CLOUD_APP_ID: "app-1",
        ASTROLOGER_API_WHATSAPP_CLOUD_APP_SECRET: "secret-1",
        ASTROLOGER_API_WHATSAPP_CLOUD_CONFIGURATION_ID: "configuration-1",
        ASTROLOGER_API_WHATSAPP_CLOUD_GRAPH_API_BASE_URL: "https://graph.facebook.com/v26.0/",
        ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "verify-1",
        ASTROLOGER_API_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY: validAes256GcmKey,
        ASTROLOGER_API_WHATSAPP_CLOUD_CALLBACK_STATE_TTL_SECONDS: "30",
        ASTROLOGER_API_WHATSAPP_CLOUD_HISTORY_SYNC_ENABLED: "true"
      })
    );

    expect(config.whatsappCloud).toMatchObject({
      enabled: true,
      appId: "app-1",
      appSecret: "secret-1",
      configurationId: "configuration-1",
      graphApiBaseUrl: "https://graph.facebook.com/v26.0",
      webhookVerifyToken: "verify-1",
      callbackStateTtlSeconds: 30,
      historySyncEnabled: true
    });
    expect(config.whatsappCloud?.tokenEncryptionKey).toBeInstanceOf(Buffer);
  });

  it("rejects incomplete enabled WhatsApp Cloud settings", () => {
    expect(() =>
      createAstrologerApiRuntimeConfig(
        baseEnv({
          ASTROLOGER_API_WHATSAPP_CLOUD_ENABLED: "true",
          ASTROLOGER_API_WHATSAPP_CLOUD_APP_ID: "app-1",
          ASTROLOGER_API_WHATSAPP_CLOUD_APP_SECRET: "secret-1",
          ASTROLOGER_API_WHATSAPP_CLOUD_CONFIGURATION_ID: "configuration-1",
          ASTROLOGER_API_WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "verify-1",
          ASTROLOGER_API_WHATSAPP_CLOUD_TOKEN_ENCRYPTION_KEY: undefined
        })
      )
    ).toThrow("WhatsApp Cloud settings are required when WhatsApp Cloud is enabled");
  });
});
