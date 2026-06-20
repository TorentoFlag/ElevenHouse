import type { ConfigService } from "@nestjs/config";
import type { PasswordlessRateLimitOptions } from "../passwordless/identity-passwordless.rate-limit";

export function createIdentityConfigServiceStub(input: {
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly passwordlessRateLimits: PasswordlessRateLimitOptions;
}): Pick<ConfigService, "getOrThrow"> {
  return {
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

      throw new Error(`Unexpected config key: ${key}`);
    }
  };
}
