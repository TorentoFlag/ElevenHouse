import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { SystemClock } from "../../common/system-clock.js";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import {
  PUBLIC_AUTH_CODE_GENERATOR
} from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { PublicSessionTokenIssuer } from "../identity/session/identity-session.service";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { ClientProfileController } from "./client-profile.controller";
import { ClientProfileModule } from "./client-profile.module";
import { ClientProfileService } from "./client-profile.service";

describe("ClientProfileModule", () => {
  it("wires the profile controller guard and service dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClientProfileModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(createConfigServiceStub())
      .overrideProvider(RedisRuntimeService)
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue({
        findByTokenHash: vi.fn(async () => null)
      })
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue({
        transact: vi.fn()
      })
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue({
        consumeRequestCode: vi.fn(),
        consumeVerifyCode: vi.fn()
      })
      .overrideProvider(PUBLIC_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(PublicSessionTokenIssuer)
      .useValue({
        issueSessionToken: vi.fn()
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => new Date("2026-07-07T12:00:00.000Z"))
      })
      .compile();

    expect(moduleRef.get(ClientProfileController)).toBeInstanceOf(ClientProfileController);
    expect(moduleRef.get(ClientProfileService)).toBeInstanceOf(ClientProfileService);

    await moduleRef.close();
  });
});

function createConfigServiceStub(): Pick<ConfigService, "get" | "getOrThrow"> {
  return {
    get: vi.fn((key: string) => {
      if (key === "publicApi.passwordlessTrustedStaticCode") {
        return null;
      }

      return undefined;
    }),
    getOrThrow: vi.fn((key: string) => {
      if (key === "publicApi.authCodeDeliveryEncryptionKey") {
        return Buffer.alloc(32, 1);
      }

      if (key === "publicApi.sessionTtlSeconds") {
        return 604800;
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
        return {
          requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
          requestCodeIp: { limit: 30, windowSeconds: 3600 },
          requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
          verifyChallenge: { limit: 5, windowSeconds: 900 },
          verifyIp: { limit: 60, windowSeconds: 900 }
        };
      }

      if (key === "publicApi.passwordlessRateLimitRedisKeyPrefix") {
        return "elevenhouse:test";
      }

      if (key === "publicApi.sessionCookieSecure") {
        return false;
      }

      if (key === "publicApi.sessionCookieName") {
        return "elevenhouse_public_session";
      }

      throw new Error(`Unexpected config key: ${key}`);
    })
  };
}
