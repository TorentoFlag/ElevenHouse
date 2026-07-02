import { describe, expect, it, vi } from "vitest";
import { RedisAiRateLimiter, type RedisAiRateLimitClient } from "./ai-rate-limiter";

type RedisEvalMock = ReturnType<typeof vi.fn<RedisAiRateLimitClient["eval"]>>;

const ownerUserId = "owner-user-id";
const ownerHash = "eee75a9a2e9b9223454b257c6270066b0061e70f198fb32b0fb16c40e84a0d52";
const expectedKeys: [string, string, string] = [
  `{elevenhouse:astrologer-api:ai}:owner:${ownerHash}:minute`,
  `{elevenhouse:astrologer-api:ai}:owner:${ownerHash}:hour`,
  `{elevenhouse:astrologer-api:ai}:owner:${ownerHash}:day`
];
const expectedArguments = [
  "1782986400000",
  "nonce",
  "3",
  "60000",
  "30",
  "3600000",
  "150",
  "86400000"
];
const nowMs = 1782986400000;
const rateLimitOptions = {
  keyPrefix: "elevenhouse:astrologer-api:ai",
  userPerMinute: { limit: 3, windowSeconds: 60 },
  userPerHour: { limit: 30, windowSeconds: 3600 },
  userPerDay: { limit: 150, windowSeconds: 86400 }
};

function createLimiter(evalMock: RedisAiRateLimitClient["eval"]) {
  return new RedisAiRateLimiter(
    { eval: evalMock },
    rateLimitOptions,
    { now: () => new Date("2026-07-02T10:00:00.000Z"), nonce: () => "nonce" }
  );
}

function expectRedisEvalCall(evalMock: RedisEvalMock) {
  expect(evalMock).toHaveBeenCalledTimes(1);
  expect(evalMock).toHaveBeenCalledWith(expect.any(String), {
    keys: expectedKeys,
    arguments: expectedArguments
  });
}

describe("RedisAiRateLimiter", () => {
  it("consumes minute, hour and day buckets for an owner", async () => {
    const evalMock = vi.fn<RedisAiRateLimitClient["eval"]>(async () => 0);
    const limiter = createLimiter(evalMock);

    await expect(limiter.consume({ ownerUserId })).resolves.toEqual({
      allowed: true
    });

    expectRedisEvalCall(evalMock);
  });

  it("returns retryAfterSeconds when Redis blocks a bucket", async () => {
    const evalMock = vi.fn<RedisAiRateLimitClient["eval"]>(async () => 12);
    const limiter = createLimiter(evalMock);

    await expect(limiter.consume({ ownerUserId })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 12
    });

    expectRedisEvalCall(evalMock);
  });

  it("increments all owner buckets when Redis allows consumption", async () => {
    const redis = new InMemoryRedisRateLimitClient();
    const limiter = createLimiter(redis.eval);

    await expect(limiter.consume({ ownerUserId })).resolves.toEqual({ allowed: true });

    expect(redis.count(expectedKeys[0])).toBe(1);
    expect(redis.count(expectedKeys[1])).toBe(1);
    expect(redis.count(expectedKeys[2])).toBe(1);
  });

  it("does not increment any owner bucket when Redis blocks consumption", async () => {
    const redis = new InMemoryRedisRateLimitClient();
    redis.seed(expectedKeys[0], [nowMs - 1000, nowMs - 2000, nowMs - 3000]);
    const limiter = createLimiter(redis.eval);

    await expect(limiter.consume({ ownerUserId })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 57
    });

    expect(redis.count(expectedKeys[0])).toBe(3);
    expect(redis.count(expectedKeys[1])).toBe(0);
    expect(redis.count(expectedKeys[2])).toBe(0);
  });

  it("removes expired entries before consuming buckets", async () => {
    const redis = new InMemoryRedisRateLimitClient();
    redis.seed(expectedKeys[0], [nowMs - 60000, nowMs - 60001, nowMs - 120000]);
    const limiter = createLimiter(redis.eval);

    await expect(limiter.consume({ ownerUserId })).resolves.toEqual({ allowed: true });

    expect(redis.entries(expectedKeys[0])).toEqual([nowMs]);
    expect(redis.entries(expectedKeys[1])).toEqual([nowMs]);
    expect(redis.entries(expectedKeys[2])).toEqual([nowMs]);
  });

  it("returns the maximum retryAfterSeconds across blocked buckets", async () => {
    const redis = new InMemoryRedisRateLimitClient();
    redis.seed(expectedKeys[0], repeatTimestamp(nowMs - 59000, 3));
    redis.seed(expectedKeys[1], repeatTimestamp(nowMs - 3590000, 30));
    redis.seed(expectedKeys[2], repeatTimestamp(nowMs - 86300000, 150));
    const limiter = createLimiter(redis.eval);

    await expect(limiter.consume({ ownerUserId })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 100
    });
  });

  it("rejects negative Redis retry results", async () => {
    const limiter = createLimiter(vi.fn<RedisAiRateLimitClient["eval"]>(async () => -1));

    await expect(limiter.consume({ ownerUserId })).rejects.toThrow(
      "Unexpected Redis AI rate limit result"
    );
  });
});

function repeatTimestamp(timestamp: number, count: number): number[] {
  return Array.from({ length: count }, () => timestamp);
}

class InMemoryRedisRateLimitClient implements RedisAiRateLimitClient {
  private readonly buckets = new Map<string, number[]>();

  readonly eval: RedisAiRateLimitClient["eval"] = async (_script, options) => {
    const now = Number(options.arguments[0]);
    const blockedRetryAfterMs = this.checkBlockedBuckets(options.keys, options.arguments, now);

    if (blockedRetryAfterMs > 0) {
      return Math.max(1, Math.ceil(blockedRetryAfterMs / 1000));
    }

    for (const [index, key] of options.keys.entries()) {
      const windowMs = Number(options.arguments[3 + index * 2]);
      this.buckets.set(key, [...this.activeEntries(key, now, windowMs), now]);
    }

    return 0;
  };

  seed(key: string, timestamps: readonly number[]): void {
    this.buckets.set(key, [...timestamps]);
  }

  count(key: string): number {
    return this.entries(key).length;
  }

  entries(key: string): readonly number[] {
    return [...(this.buckets.get(key) ?? [])].sort((left, right) => left - right);
  }

  private checkBlockedBuckets(
    keys: readonly string[],
    args: readonly string[],
    now: number
  ): number {
    let blockedRetryAfterMs = 0;

    for (const [index, key] of keys.entries()) {
      const limit = Number(args[2 + index * 2]);
      const windowMs = Number(args[3 + index * 2]);
      const activeEntries = this.activeEntries(key, now, windowMs);
      this.buckets.set(key, activeEntries);

      if (activeEntries.length >= limit) {
        const oldest = activeEntries[0] ?? now;
        const retryAfterMs = oldest + windowMs - now;

        if (retryAfterMs > blockedRetryAfterMs) {
          blockedRetryAfterMs = retryAfterMs;
        }
      }
    }

    return blockedRetryAfterMs;
  }

  private activeEntries(key: string, now: number, windowMs: number): number[] {
    const cutoff = now - windowMs;

    return this.entries(key).filter((timestamp) => timestamp > cutoff);
  }
}
