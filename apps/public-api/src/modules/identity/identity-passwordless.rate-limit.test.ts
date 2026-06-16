import { describe, expect, it, vi } from "vitest";
import {
  InMemoryPasswordlessRateLimiter,
  RedisPasswordlessRateLimiter,
  type PasswordlessRateLimitOptions
} from "./identity-passwordless.rate-limit";

const baseNow = new Date("2026-06-16T10:00:00.000Z");

function createLimiter(
  options: Partial<PasswordlessRateLimitOptions> = {},
  now: Date = baseNow
) {
  return new InMemoryPasswordlessRateLimiter(
    {
      requestCodeIdentifier: { limit: 2, windowSeconds: 60 },
      requestCodeIp: { limit: 3, windowSeconds: 60 },
      requestCodeIdentifierIp: { limit: 2, windowSeconds: 60 },
      verifyChallenge: { limit: 2, windowSeconds: 60 },
      verifyIp: { limit: 3, windowSeconds: 60 },
      ...options
    },
    () => now
  );
}

describe("InMemoryPasswordlessRateLimiter", () => {
  it("blocks passwordless code requests by normalized identifier", async () => {
    const limiter = createLimiter({
      requestCodeIdentifier: { limit: 1, windowSeconds: 60 },
      requestCodeIp: { limit: 10, windowSeconds: 60 },
      requestCodeIdentifierIp: { limit: 10, windowSeconds: 60 }
    });

    await expect(
      limiter.consumeRequestCode({
        channel: "email",
        identifier: "client@example.com",
        ipAddress: "203.0.113.10"
      })
    ).resolves.toEqual({ allowed: true });
    await expect(
      limiter.consumeRequestCode({
        channel: "email",
        identifier: "client@example.com",
        ipAddress: "203.0.113.11"
      })
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60
    });
  });

  it("blocks passwordless code requests by IP across identifiers", async () => {
    const limiter = createLimiter({
      requestCodeIdentifier: { limit: 10, windowSeconds: 60 },
      requestCodeIp: { limit: 1, windowSeconds: 60 },
      requestCodeIdentifierIp: { limit: 10, windowSeconds: 60 }
    });

    await limiter.consumeRequestCode({
      channel: "email",
      identifier: "first@example.com",
      ipAddress: "203.0.113.10"
    });

    await expect(
      limiter.consumeRequestCode({
        channel: "email",
        identifier: "second@example.com",
        ipAddress: "203.0.113.10"
      })
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60
    });
  });

  it("blocks passwordless verification by challenge id without consuming IP capacity again", async () => {
    const limiter = createLimiter({
      verifyChallenge: { limit: 1, windowSeconds: 60 },
      verifyIp: { limit: 2, windowSeconds: 60 }
    });

    await limiter.consumeVerifyCode({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      ipAddress: "203.0.113.10"
    });
    const blocked = await limiter.consumeVerifyCode({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      ipAddress: "203.0.113.10"
    });
    const differentChallenge = await limiter.consumeVerifyCode({
      challengeId: "9e14390f-3db1-4d1c-9344-55679c778427",
      ipAddress: "203.0.113.10"
    });

    expect(blocked).toEqual({
      allowed: false,
      retryAfterSeconds: 60
    });
    expect(differentChallenge).toEqual({ allowed: true });
  });

  it("allows requests again after the rate limit window expires", async () => {
    let now = baseNow;
    const limiter = new InMemoryPasswordlessRateLimiter(
      {
        requestCodeIdentifier: { limit: 1, windowSeconds: 60 },
        requestCodeIp: { limit: 10, windowSeconds: 60 },
        requestCodeIdentifierIp: { limit: 10, windowSeconds: 60 },
        verifyChallenge: { limit: 2, windowSeconds: 60 },
        verifyIp: { limit: 3, windowSeconds: 60 }
      },
      () => now
    );

    await limiter.consumeRequestCode({
      channel: "email",
      identifier: "client@example.com",
      ipAddress: "203.0.113.10"
    });
    now = new Date("2026-06-16T10:01:00.000Z");

    await expect(
      limiter.consumeRequestCode({
        channel: "email",
        identifier: "client@example.com",
        ipAddress: "203.0.113.10"
      })
    ).resolves.toEqual({ allowed: true });
  });
});

describe("RedisPasswordlessRateLimiter", () => {
  it("allows passwordless requests when the Redis script returns zero", async () => {
    const redisClient = {
      eval: vi.fn(async () => 0)
    };
    const limiter = new RedisPasswordlessRateLimiter(
      redisClient,
      {
        requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
        requestCodeIp: { limit: 30, windowSeconds: 3600 },
        requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
        verifyChallenge: { limit: 5, windowSeconds: 900 },
        verifyIp: { limit: 60, windowSeconds: 900 }
      },
      {
        keyPrefix: "elevenhouse:test",
        now: () => baseNow,
        nonce: () => "nonce-1"
      }
    );

    await expect(
      limiter.consumeRequestCode({
        channel: "email",
        identifier: "client@example.com",
        ipAddress: "203.0.113.10"
      })
    ).resolves.toEqual({ allowed: true });

    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: [
        "{elevenhouse:test}:passwordless:request-code:identifier:email:f93fa2e5fb59200922637972bb68e780754fc45c0b8f4f9467779f9dc8e3dfe1",
        "{elevenhouse:test}:passwordless:request-code:ip:631f08140b24b7274d12df3c37a1a80ce5876dafd7007d772e0114fddf88b682",
        "{elevenhouse:test}:passwordless:request-code:identifier-ip:email:f93fa2e5fb59200922637972bb68e780754fc45c0b8f4f9467779f9dc8e3dfe1:631f08140b24b7274d12df3c37a1a80ce5876dafd7007d772e0114fddf88b682"
      ],
      arguments: ["1781604000000", "nonce-1", "5", "3600000", "30", "3600000", "3", "3600000"]
    });
  });

  it("blocks passwordless verification when the Redis script returns retry-after seconds", async () => {
    const redisClient = {
      eval: vi.fn(async () => 17)
    };
    const limiter = new RedisPasswordlessRateLimiter(
      redisClient,
      {
        requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
        requestCodeIp: { limit: 30, windowSeconds: 3600 },
        requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
        verifyChallenge: { limit: 5, windowSeconds: 900 },
        verifyIp: { limit: 60, windowSeconds: 900 }
      },
      {
        keyPrefix: "elevenhouse:test",
        now: () => baseNow,
        nonce: () => "nonce-2"
      }
    );

    await expect(
      limiter.consumeVerifyCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        ipAddress: "203.0.113.10"
      })
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 17
    });
  });
});
