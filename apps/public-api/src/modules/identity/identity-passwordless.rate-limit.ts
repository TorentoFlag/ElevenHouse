import { createHash, randomUUID } from "node:crypto";
import type { PasswordlessAuthChannel } from "@elevenhouse/domain";

export type PasswordlessRequestContext = {
  readonly ipAddress?: string;
  readonly userAgent?: string;
};

export type PasswordlessRateLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly retryAfterSeconds: number;
    };

export type PasswordlessRateLimitPort = {
  readonly consumeRequestCode: (input: {
    readonly channel: PasswordlessAuthChannel;
    readonly identifier: string;
    readonly ipAddress: string;
  }) => Promise<PasswordlessRateLimitDecision>;
  readonly consumeVerifyCode: (input: {
    readonly challengeId: string;
    readonly ipAddress: string;
  }) => Promise<PasswordlessRateLimitDecision>;
};

export const anonymousPasswordlessIpAddress = "unknown";

export const allowAllPasswordlessRateLimiter: PasswordlessRateLimitPort = {
  consumeRequestCode: async () => ({ allowed: true }),
  consumeVerifyCode: async () => ({ allowed: true })
};

export type PasswordlessRateLimitBucketOptions = {
  readonly limit: number;
  readonly windowSeconds: number;
};

export type PasswordlessRateLimitOptions = {
  readonly requestCodeIdentifier: PasswordlessRateLimitBucketOptions;
  readonly requestCodeIp: PasswordlessRateLimitBucketOptions;
  readonly requestCodeIdentifierIp: PasswordlessRateLimitBucketOptions;
  readonly verifyChallenge: PasswordlessRateLimitBucketOptions;
  readonly verifyIp: PasswordlessRateLimitBucketOptions;
};

export type RedisPasswordlessRateLimitClient = {
  readonly eval: (
    script: string,
    options: {
      readonly keys: string[];
      readonly arguments: string[];
    }
  ) => Promise<unknown>;
  readonly quit?: () => Promise<unknown>;
};

type RateLimitBucket = PasswordlessRateLimitBucketOptions & {
  readonly key: string;
};

export class InMemoryPasswordlessRateLimiter implements PasswordlessRateLimitPort {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly options: PasswordlessRateLimitOptions,
    private readonly now: () => Date = () => new Date()
  ) {}

  consumeRequestCode(input: {
    readonly channel: PasswordlessAuthChannel;
    readonly identifier: string;
    readonly ipAddress: string;
  }): Promise<PasswordlessRateLimitDecision> {
    return Promise.resolve(
      this.consume([
        {
          key: `request-code:identifier:${input.channel}:${input.identifier}`,
          ...this.options.requestCodeIdentifier
        },
        {
          key: `request-code:ip:${input.ipAddress}`,
          ...this.options.requestCodeIp
        },
        {
          key: `request-code:identifier-ip:${input.channel}:${input.identifier}:${input.ipAddress}`,
          ...this.options.requestCodeIdentifierIp
        }
      ])
    );
  }

  consumeVerifyCode(input: {
    readonly challengeId: string;
    readonly ipAddress: string;
  }): Promise<PasswordlessRateLimitDecision> {
    return Promise.resolve(
      this.consume([
        {
          key: `verify-code:challenge:${input.challengeId}`,
          ...this.options.verifyChallenge
        },
        {
          key: `verify-code:ip:${input.ipAddress}`,
          ...this.options.verifyIp
        }
      ])
    );
  }

  private consume(buckets: readonly RateLimitBucket[]): PasswordlessRateLimitDecision {
    const nowMs = this.now().getTime();
    const blockedRetryAfterSeconds = buckets
      .map((bucket) => this.checkBucket(bucket, nowMs))
      .filter((retryAfterSeconds): retryAfterSeconds is number => retryAfterSeconds !== null);

    if (blockedRetryAfterSeconds.length > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(...blockedRetryAfterSeconds)
      };
    }

    for (const bucket of buckets) {
      const timestamps = this.getActiveTimestamps(bucket, nowMs);
      timestamps.push(nowMs);
      this.buckets.set(bucket.key, timestamps);
    }

    return { allowed: true };
  }

  private checkBucket(bucket: RateLimitBucket, nowMs: number): number | null {
    const timestamps = this.getActiveTimestamps(bucket, nowMs);

    this.buckets.set(bucket.key, timestamps);

    if (timestamps.length < bucket.limit) {
      return null;
    }

    const oldestTimestamp = timestamps[0] ?? nowMs;
    const retryAfterMs = oldestTimestamp + bucket.windowSeconds * 1000 - nowMs;

    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  private getActiveTimestamps(bucket: RateLimitBucket, nowMs: number): number[] {
    const cutoff = nowMs - bucket.windowSeconds * 1000;

    return (this.buckets.get(bucket.key) ?? []).filter((timestamp) => timestamp > cutoff);
  }
}

type RedisPasswordlessRateLimiterSettings = {
  readonly keyPrefix: string;
  readonly now?: () => Date;
  readonly nonce?: () => string;
};

export class RedisPasswordlessRateLimiter implements PasswordlessRateLimitPort {
  private readonly keyPrefix: string;
  private readonly now: () => Date;
  private readonly nonce: () => string;

  constructor(
    private readonly client: RedisPasswordlessRateLimitClient,
    private readonly options: PasswordlessRateLimitOptions,
    settings: RedisPasswordlessRateLimiterSettings
  ) {
    this.keyPrefix = settings.keyPrefix.replace(/:+$/, "");
    this.now = settings.now ?? (() => new Date());
    this.nonce = settings.nonce ?? (() => randomUUID());
  }

  consumeRequestCode(input: {
    readonly channel: PasswordlessAuthChannel;
    readonly identifier: string;
    readonly ipAddress: string;
  }): Promise<PasswordlessRateLimitDecision> {
    const identifierHash = hashRateLimitKeyPart(input.identifier);
    const ipHash = hashRateLimitKeyPart(input.ipAddress);

    return this.consume([
      {
        key: this.key("request-code", "identifier", input.channel, identifierHash),
        ...this.options.requestCodeIdentifier
      },
      {
        key: this.key("request-code", "ip", ipHash),
        ...this.options.requestCodeIp
      },
      {
        key: this.key("request-code", "identifier-ip", input.channel, identifierHash, ipHash),
        ...this.options.requestCodeIdentifierIp
      }
    ]);
  }

  consumeVerifyCode(input: {
    readonly challengeId: string;
    readonly ipAddress: string;
  }): Promise<PasswordlessRateLimitDecision> {
    return this.consume([
      {
        key: this.key("verify-code", "challenge", hashRateLimitKeyPart(input.challengeId)),
        ...this.options.verifyChallenge
      },
      {
        key: this.key("verify-code", "ip", hashRateLimitKeyPart(input.ipAddress)),
        ...this.options.verifyIp
      }
    ]);
  }

  private async consume(buckets: readonly RateLimitBucket[]): Promise<PasswordlessRateLimitDecision> {
    const retryAfterSeconds = parseRedisRateLimitResult(
      await this.client.eval(redisPasswordlessRateLimitScript, {
        keys: buckets.map((bucket) => bucket.key),
        arguments: [
          this.now().getTime().toString(),
          this.nonce(),
          ...buckets.flatMap((bucket) => [
            bucket.limit.toString(),
            (bucket.windowSeconds * 1000).toString()
          ])
        ]
      })
    );

    if (retryAfterSeconds > 0) {
      return {
        allowed: false,
        retryAfterSeconds
      };
    }

    return { allowed: true };
  }

  private key(...parts: readonly string[]): string {
    return [`{${this.keyPrefix}}`, "passwordless", ...parts].filter(Boolean).join(":");
  }
}

function hashRateLimitKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseRedisRateLimitResult(result: unknown): number {
  if (typeof result === "number") {
    return result;
  }

  if (typeof result === "bigint") {
    return Number(result);
  }

  if (typeof result === "string") {
    const parsed = Number.parseInt(result, 10);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unexpected Redis passwordless rate limit result");
}

const redisPasswordlessRateLimitScript = `
local now = tonumber(ARGV[1])
local nonce = ARGV[2]
local blocked_retry_after_ms = 0

for i = 1, #KEYS do
  local arg_offset = ((i - 1) * 2) + 3
  local limit = tonumber(ARGV[arg_offset])
  local window_ms = tonumber(ARGV[arg_offset + 1])
  local cutoff = now - window_ms

  redis.call("ZREMRANGEBYSCORE", KEYS[i], "-inf", cutoff)

  local count = redis.call("ZCARD", KEYS[i])

  if count >= limit then
    local oldest = redis.call("ZRANGE", KEYS[i], 0, 0, "WITHSCORES")
    local retry_after_ms = window_ms

    if oldest[2] ~= nil then
      retry_after_ms = tonumber(oldest[2]) + window_ms - now
    end

    if retry_after_ms > blocked_retry_after_ms then
      blocked_retry_after_ms = retry_after_ms
    end
  end
end

if blocked_retry_after_ms > 0 then
  return math.max(1, math.ceil(blocked_retry_after_ms / 1000))
end

for i = 1, #KEYS do
  local arg_offset = ((i - 1) * 2) + 3
  local window_ms = tonumber(ARGV[arg_offset + 1])

  redis.call("ZADD", KEYS[i], now, tostring(now) .. ":" .. nonce .. ":" .. tostring(i))
  redis.call("PEXPIRE", KEYS[i], window_ms)
end

return 0
`;
