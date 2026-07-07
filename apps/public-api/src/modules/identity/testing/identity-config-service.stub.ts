import type { ConfigService } from "@nestjs/config";
import type { PasswordlessRateLimitOptions } from "../passwordless/identity-passwordless.rate-limit";

export function createIdentityConfigServiceStub(input: {
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;
  readonly csrfHeaderName: string;
  readonly passwordlessRateLimits: PasswordlessRateLimitOptions;
}): Pick<ConfigService, "get" | "getOrThrow"> {
  const getOptional = (key: string): unknown => {
    if (key === "publicApi.passwordlessTrustedStaticCode") {
      return null;
    }

    return undefined;
  };

  return {
    get: getOptional,
    getOrThrow: (key: string) => {
      if (key === "publicApi.authCodeDeliveryEncryptionKey") {
        return Buffer.alloc(32, 1);
      }

      if (key === "publicApi.sessionTtlSeconds") {
        return 604800;
      }

      if (key === "publicApi.sessionCookieSecure") {
        return false;
      }

      if (key === "publicApi.sessionCookieName") {
        return input.sessionCookieName;
      }

      if (key === "publicApi.csrfSecret") {
        return "test-csrf-secret-with-enough-entropy";
      }

      if (key === "publicApi.csrfCookieName") {
        return input.csrfCookieName;
      }

      if (key === "publicApi.csrfHeaderName") {
        return input.csrfHeaderName;
      }

      if (key === "publicApi.csrfTokenTtlSeconds") {
        return 604800;
      }

      if (key === "publicApi.allowedOrigins") {
        return ["http://localhost:3000"];
      }

      if (key === "publicApi.passwordlessCodeSecret") {
        return "test-secret";
      }

      if (key === "publicApi.passwordlessCodeTtlSeconds") {
        return 600;
      }

      if (key === "publicApi.passwordlessResendCooldownSeconds") {
        return 60;
      }

      if (key === "publicApi.passwordlessMaxAttempts") {
        return 5;
      }

      if (key === "publicApi.passwordlessRateLimits") {
        return input.passwordlessRateLimits;
      }

      throw new Error(`Unexpected config key: ${key}`);
    }
  };
}
