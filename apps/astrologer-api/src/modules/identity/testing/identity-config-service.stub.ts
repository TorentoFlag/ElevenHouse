import type { ConfigService } from "@nestjs/config";
import type { PasswordlessRateLimitOptions } from "../passwordless/identity-passwordless.rate-limit";

export function createIdentityConfigServiceStub(input: {
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly telegramBotWebhookSecret?: string | null;
  readonly telegramBusinessBotUsername?: string | null;
  readonly telegramMtproto?: {
    readonly enabled: true;
    readonly apiId: number;
    readonly apiHash: string;
    readonly sessionEncryptionKey: Buffer;
  } | null;
  readonly instagramGraph?: {
    readonly enabled: true;
    readonly appId: string;
    readonly appSecret: string;
    readonly redirectUri: string;
    readonly tokenEncryptionKey: Buffer;
    readonly callbackStateTtlSeconds: number;
    readonly authBaseUrl: string;
    readonly tokenExchangeBaseUrl: string;
    readonly graphTokenBaseUrl: string;
    readonly graphApiBaseUrl: string;
    readonly astrologerWebBaseUrl: string;
    readonly scopes: readonly string[];
  } | null;
  readonly passwordlessRateLimits: PasswordlessRateLimitOptions;
}): Pick<ConfigService, "get" | "getOrThrow"> {
  const getOptional = (key: string): unknown => {
    if (key === "astrologerApi.passwordlessTrustedStaticCode") {
      return null;
    }

    if (key === "astrologerApi.telegramBusinessBotUsername") {
      return input.telegramBusinessBotUsername ?? null;
    }

    if (key === "astrologerApi.telegramMtproto") {
      return input.telegramMtproto ?? null;
    }

    if (key === "astrologerApi.instagramGraph") {
      return input.instagramGraph ?? null;
    }

    return undefined;
  };

  return {
    get: getOptional,
    getOrThrow: (key: string) => {
      if (key === "astrologerApi.authCodeDeliveryEncryptionKey") {
        return Buffer.alloc(32, 1);
      }

      if (key === "astrologerApi.sessionTtlSeconds") {
        return 604800;
      }

      if (key === "astrologerApi.sessionCookieSecure") {
        return false;
      }

      if (key === "astrologerApi.sessionCookieName") {
        return input.sessionCookieName;
      }

      if (key === "astrologerApi.csrfSecret") {
        return "test-csrf-secret-with-enough-entropy";
      }

      if (key === "astrologerApi.csrfCookieName") {
        return input.csrfCookieName;
      }

      if (key === "astrologerApi.csrfHeaderName") {
        return input.csrfHeaderName;
      }

      if (key === "astrologerApi.csrfTokenTtlSeconds") {
        return 604800;
      }

      if (key === "astrologerApi.allowedOrigins") {
        return ["http://localhost:3000"];
      }

      if (key === "astrologerApi.telegramBotWebhookSecret") {
        return input.telegramBotWebhookSecret ?? null;
      }

      if (key === "astrologerApi.passwordlessCodeSecret") {
        return "test-secret";
      }

      if (key === "astrologerApi.passwordlessCodeTtlSeconds") {
        return 600;
      }

      if (key === "astrologerApi.passwordlessResendCooldownSeconds") {
        return 60;
      }

      if (key === "astrologerApi.passwordlessMaxAttempts") {
        return 5;
      }

      if (key === "astrologerApi.passwordlessRateLimits") {
        return input.passwordlessRateLimits;
      }

      if (key === "astrologerApi.mediaStorage") {
        return {
          endpoint: "http://localhost:9000",
          region: "us-east-1",
          bucket: "elevenhouse-local-media",
          privateBucket: "elevenhouse-local-private",
          accessKeyId: "elevenhouse",
          secretAccessKey: "elevenhouse-secret",
          forcePathStyle: true,
          publicBaseUrl: "http://localhost:9000/elevenhouse-local-media",
          uploadTtlSeconds: 900,
          downloadTtlSeconds: 300
        };
      }

      if (key === "astrologerApi.ai") {
        return {
          enabled: false,
          openAiBaseUrl: "https://api.openai.com/v1",
          fastDraftModel: "gpt-5.4-mini",
          qualityDraftModel: "gpt-5.5",
          timeoutMs: 15_000,
          maxOutputTokens: 5_000,
          rateLimitRedisKeyPrefix: "test:ai",
          rateLimits: {
            userPerMinute: { limit: 3, windowSeconds: 60 },
            userPerHour: { limit: 30, windowSeconds: 3_600 },
            userPerDay: { limit: 150, windowSeconds: 86_400 }
          }
        };
      }

      throw new Error(`Unexpected config key: ${key}`);
    }
  };
}
