import { createHash, randomUUID } from "node:crypto";

export type AiRateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export type AiRateLimiterPort = {
  readonly consume: (input: { readonly ownerUserId: string }) => Promise<AiRateLimitDecision>;
};

export type AiRateLimitBucketOptions = {
  readonly limit: number;
  readonly windowSeconds: number;
};

export type AiRateLimitOptions = {
  readonly keyPrefix: string;
  readonly userPerMinute: AiRateLimitBucketOptions;
  readonly userPerHour: AiRateLimitBucketOptions;
  readonly userPerDay: AiRateLimitBucketOptions;
};

export type RedisAiRateLimitClient = {
  readonly eval: (
    script: string,
    options: {
      readonly keys: string[];
      readonly arguments: string[];
    }
  ) => Promise<unknown>;
};

type RateLimitBucket = AiRateLimitBucketOptions & {
  readonly key: string;
};

type RedisAiRateLimiterSettings = {
  readonly now?: () => Date;
  readonly nonce?: () => string;
};

export class RedisAiRateLimiter implements AiRateLimiterPort {
  private readonly keyPrefix: string;
  private readonly now: () => Date;
  private readonly nonce: () => string;

  constructor(
    private readonly client: RedisAiRateLimitClient,
    private readonly options: AiRateLimitOptions,
    settings: RedisAiRateLimiterSettings = {}
  ) {
    this.keyPrefix = options.keyPrefix.replace(/:+$/, "");
    this.now = settings.now ?? (() => new Date());
    this.nonce = settings.nonce ?? (() => randomUUID());
  }

  consume(input: { readonly ownerUserId: string }): Promise<AiRateLimitDecision> {
    const ownerHash = hashRateLimitKeyPart(input.ownerUserId);

    return this.consumeBuckets([
      { key: this.key("owner", ownerHash, "minute"), ...this.options.userPerMinute },
      { key: this.key("owner", ownerHash, "hour"), ...this.options.userPerHour },
      { key: this.key("owner", ownerHash, "day"), ...this.options.userPerDay }
    ]);
  }

  private async consumeBuckets(buckets: readonly RateLimitBucket[]): Promise<AiRateLimitDecision> {
    const retryAfterSeconds = parseRedisRateLimitResult(
      await this.client.eval(redisAiRateLimitScript, {
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
    return [`{${this.keyPrefix}}`, ...parts].join(":");
  }
}

function hashRateLimitKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseRedisRateLimitResult(result: unknown): number {
  if (typeof result === "number" && Number.isSafeInteger(result) && result >= 0) {
    return result;
  }

  if (typeof result === "bigint") {
    const parsed = Number(result);

    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  if (typeof result === "string") {
    const parsed = Number(result);

    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  throw new Error("Unexpected Redis AI rate limit result");
}

const redisAiRateLimitScript = `
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
