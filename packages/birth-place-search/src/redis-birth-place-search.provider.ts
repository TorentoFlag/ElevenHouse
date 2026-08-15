import { createHash, randomUUID } from "node:crypto";
import {
  clientBirthPlaceCandidateSchema,
  clientBirthPlaceProviderPlaceIdSchema,
  clientBirthPlaceSearchResponseSchema
} from "@elevenhouse/contracts";
import {
  BirthPlaceReferenceInvalidError,
  BirthPlaceReferenceNotFoundError,
  BirthPlaceReferenceUnavailableError,
  BirthPlaceSearchRateLimitError,
  BirthPlaceSearchUnavailableError
} from "./errors";
import type {
  BirthPlaceProvider,
  BirthPlaceReferenceInput,
  BirthPlaceSearchInput,
  BirthPlaceUpstreamProvider
} from "./types";

export type RedisBirthPlaceSearchClient = {
  readonly eval: (
    script: string,
    options: {
      readonly keys: string[];
      readonly arguments: string[];
    }
  ) => Promise<unknown>;
};

export type RedisBirthPlaceSearchOptions = {
  readonly keyPrefix: string;
  readonly cacheSuccessTtlSeconds: number;
  readonly cacheEmptyTtlSeconds: number;
  readonly lockTtlMs: number;
  readonly rateLimits: {
    readonly userPerMinute: { readonly limit: number; readonly windowSeconds: number };
    readonly globalPerMinute: { readonly limit: number; readonly windowSeconds: number };
    readonly globalPerDay: { readonly limit: number; readonly windowSeconds: number };
  };
};

export type RedisBirthPlaceSearchSettings = {
  readonly now?: () => Date;
  readonly nonce?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

type RateLimitBucket = {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
};

export class RedisBirthPlaceSearchProvider implements BirthPlaceProvider {
  private readonly keyPrefix: string;
  private readonly now: () => Date;
  private readonly nonce: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly client: RedisBirthPlaceSearchClient,
    private readonly upstream: BirthPlaceUpstreamProvider,
    private readonly options: RedisBirthPlaceSearchOptions,
    settings: RedisBirthPlaceSearchSettings = {}
  ) {
    this.keyPrefix = options.keyPrefix.replace(/:+$/, "");
    this.now = settings.now ?? (() => new Date());
    this.nonce = settings.nonce ?? (() => randomUUID());
    this.sleep =
      settings.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async search(input: BirthPlaceSearchInput) {
    try {
      if (!input.ownerUserId) {
        throw new BirthPlaceSearchUnavailableError("Birth place search owner is not configured");
      }

      const cacheKey = this.key("cache", "v1", hashCacheInput(input));
      const cached = await this.readCached(cacheKey);
      if (cached) {
        return cached;
      }

      await this.consumeRateLimit(input.ownerUserId);

      const lockKey = this.key("lock", hashCacheInput(input));
      const lockToken = this.nonce();
      const hasLock = await this.acquireLock(lockKey, lockToken);
      if (!hasLock) {
        const eventuallyCached = await this.waitForCache(cacheKey);
        if (eventuallyCached) {
          return eventuallyCached;
        }

        throw new BirthPlaceSearchUnavailableError("Birth place search is already in progress");
      }

      try {
        const response = clientBirthPlaceSearchResponseSchema.parse(
          await this.upstream.search(input)
        );
        await this.writeCached(
          cacheKey,
          response,
          response.candidates.length > 0
            ? this.options.cacheSuccessTtlSeconds
            : this.options.cacheEmptyTtlSeconds
        );

        return response;
      } finally {
        await this.releaseLock(lockKey, lockToken);
      }
    } catch (error) {
      if (
        error instanceof BirthPlaceSearchUnavailableError ||
        error instanceof BirthPlaceSearchRateLimitError
      ) {
        throw error;
      }
      throw new BirthPlaceSearchUnavailableError("Birth place search infrastructure failed", {
        cause: error
      });
    }
  }

  async resolveReference(input: BirthPlaceReferenceInput) {
    try {
      if (!input.ownerUserId) {
        throw new BirthPlaceSearchUnavailableError("Birth place search owner is not configured");
      }
      const parsedProviderPlaceId = clientBirthPlaceProviderPlaceIdSchema.safeParse(
        input.providerPlaceId
      );
      if (input.provider !== "geoapify" || !parsedProviderPlaceId.success) {
        throw new BirthPlaceReferenceInvalidError();
      }

      const providerPlaceId = parsedProviderPlaceId.data;
      const cacheKey = this.key(
        "reference-cache",
        "v1",
        input.provider,
        hashKeyPart(providerPlaceId)
      );
      const cached = await this.readReferenceCache(cacheKey, input.provider, providerPlaceId);
      if (cached) {
        return cached;
      }

      await this.consumeRateLimit(input.ownerUserId);

      const lockKey = this.key("reference-lock", input.provider, hashKeyPart(providerPlaceId));
      const lockToken = this.nonce();
      const hasLock = await this.acquireLock(lockKey, lockToken);
      if (!hasLock) {
        const eventuallyCached = await this.waitForReferenceCache(
          cacheKey,
          input.provider,
          providerPlaceId
        );
        if (eventuallyCached) {
          return eventuallyCached;
        }

        throw new BirthPlaceReferenceUnavailableError(
          "Birth place reference resolution is already in progress"
        );
      }

      try {
        const candidate = clientBirthPlaceCandidateSchema.parse(
          await this.upstream.resolveReference(providerPlaceId)
        );
        if (
          candidate.provider !== input.provider ||
          candidate.providerPlaceId !== providerPlaceId
        ) {
          throw new BirthPlaceReferenceUnavailableError();
        }
        await this.writeReferenceCache(cacheKey, candidate);

        return candidate;
      } finally {
        await this.releaseLock(lockKey, lockToken);
      }
    } catch (error) {
      if (
        error instanceof BirthPlaceReferenceInvalidError ||
        error instanceof BirthPlaceReferenceNotFoundError ||
        error instanceof BirthPlaceReferenceUnavailableError ||
        error instanceof BirthPlaceSearchUnavailableError ||
        error instanceof BirthPlaceSearchRateLimitError
      ) {
        throw error;
      }
      throw new BirthPlaceReferenceUnavailableError(undefined, { cause: error });
    }
  }

  private async readCached(cacheKey: string) {
    const raw = await this.client.eval(redisBirthPlaceCacheReadScript, {
      keys: [cacheKey],
      arguments: []
    });
    if (raw === null) {
      return null;
    }
    if (typeof raw !== "string" || raw.length === 0) {
      throw new BirthPlaceSearchUnavailableError("Birth place search cache returned invalid data");
    }

    try {
      return clientBirthPlaceSearchResponseSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new BirthPlaceSearchUnavailableError("Birth place search cache returned invalid data", {
        cause: error
      });
    }
  }

  private async writeCached(
    cacheKey: string,
    response: ReturnType<typeof clientBirthPlaceSearchResponseSchema.parse>,
    ttlSeconds: number
  ): Promise<void> {
    await this.client.eval(redisBirthPlaceCacheWriteScript, {
      keys: [cacheKey],
      arguments: [JSON.stringify(response), ttlSeconds.toString()]
    });
  }

  private async readReferenceCache(
    cacheKey: string,
    provider: BirthPlaceReferenceInput["provider"],
    providerPlaceId: string
  ) {
    const raw = await this.client.eval(redisBirthPlaceCacheReadScript, {
      keys: [cacheKey],
      arguments: []
    });
    if (raw === null) {
      return null;
    }
    if (typeof raw !== "string" || raw.length === 0) {
      throw new BirthPlaceReferenceUnavailableError(
        "Birth place reference cache returned invalid data"
      );
    }

    try {
      const candidate = clientBirthPlaceCandidateSchema.parse(JSON.parse(raw));
      if (candidate.provider !== provider || candidate.providerPlaceId !== providerPlaceId) {
        throw new BirthPlaceReferenceUnavailableError(
          "Birth place reference cache returned mismatched data"
        );
      }
      return candidate;
    } catch (error) {
      if (error instanceof BirthPlaceReferenceUnavailableError) {
        throw error;
      }
      throw new BirthPlaceReferenceUnavailableError(
        "Birth place reference cache returned invalid data",
        { cause: error }
      );
    }
  }

  private async writeReferenceCache(
    cacheKey: string,
    candidate: ReturnType<typeof clientBirthPlaceCandidateSchema.parse>
  ): Promise<void> {
    await this.client.eval(redisBirthPlaceCacheWriteScript, {
      keys: [cacheKey],
      arguments: [JSON.stringify(candidate), this.options.cacheSuccessTtlSeconds.toString()]
    });
  }

  private async consumeRateLimit(ownerUserId: string): Promise<void> {
    const ownerHash = hashKeyPart(ownerUserId);
    const buckets: readonly RateLimitBucket[] = [
      {
        key: this.key("rate-limit", "owner", ownerHash, "minute"),
        ...this.options.rateLimits.userPerMinute
      },
      {
        key: this.key("rate-limit", "global", "minute"),
        ...this.options.rateLimits.globalPerMinute
      },
      {
        key: this.key("rate-limit", "global", "day"),
        ...this.options.rateLimits.globalPerDay
      }
    ];
    const retryAfterSeconds = parseRedisInteger(
      await this.client.eval(redisBirthPlaceRateLimitScript, {
        keys: buckets.map((bucket) => bucket.key),
        arguments: [
          this.now().getTime().toString(),
          this.nonce(),
          ...buckets.flatMap((bucket) => [
            bucket.limit.toString(),
            (bucket.windowSeconds * 1000).toString()
          ])
        ]
      }),
      "Unexpected Redis birth-place rate limit result"
    );

    if (retryAfterSeconds > 0) {
      throw new BirthPlaceSearchRateLimitError(retryAfterSeconds);
    }
  }

  private async acquireLock(lockKey: string, token: string): Promise<boolean> {
    return (
      parseRedisInteger(
        await this.client.eval(redisBirthPlaceLockAcquireScript, {
          keys: [lockKey],
          arguments: [token, this.options.lockTtlMs.toString()]
        }),
        "Unexpected Redis birth-place lock result"
      ) === 1
    );
  }

  private async releaseLock(lockKey: string, token: string): Promise<void> {
    await this.client.eval(redisBirthPlaceLockReleaseScript, {
      keys: [lockKey],
      arguments: [token]
    });
  }

  private async waitForCache(cacheKey: string) {
    for (let elapsedMs = 0; elapsedMs < this.options.lockTtlMs; elapsedMs += 100) {
      await this.sleep(100);
      const cached = await this.readCached(cacheKey);
      if (cached) {
        return cached;
      }
    }

    return null;
  }

  private async waitForReferenceCache(
    cacheKey: string,
    provider: BirthPlaceReferenceInput["provider"],
    providerPlaceId: string
  ) {
    for (let elapsedMs = 0; elapsedMs < this.options.lockTtlMs; elapsedMs += 100) {
      await this.sleep(100);
      const cached = await this.readReferenceCache(cacheKey, provider, providerPlaceId);
      if (cached) {
        return cached;
      }
    }

    return null;
  }

  private key(...parts: readonly string[]): string {
    return [`{${this.keyPrefix}}`, ...parts].join(":");
  }
}

function hashCacheInput(input: Pick<BirthPlaceSearchInput, "query" | "limit">): string {
  return hashKeyPart(
    `${normalizeCacheQuery(input.query)}:${input.limit}:birth-place-search:lang-aware-city-ranking`
  );
}

function normalizeCacheQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function hashKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseRedisInteger(result: unknown, message: string): number {
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
    if (!/^\d+$/.test(result)) {
      throw new Error(message);
    }
    const parsed = Number(result);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  throw new Error(message);
}

const redisBirthPlaceCacheReadScript = `
-- birth-place-cache-read
return redis.call("GET", KEYS[1])
`;

const redisBirthPlaceCacheWriteScript = `
-- birth-place-cache-write
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
return 1
`;

const redisBirthPlaceLockAcquireScript = `
-- birth-place-lock-acquire
if redis.call("SET", KEYS[1], ARGV[1], "PX", tonumber(ARGV[2]), "NX") then
  return 1
end
return 0
`;

const redisBirthPlaceLockReleaseScript = `
-- birth-place-lock-release
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

const redisBirthPlaceRateLimitScript = `
-- birth-place-rate-limit
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
