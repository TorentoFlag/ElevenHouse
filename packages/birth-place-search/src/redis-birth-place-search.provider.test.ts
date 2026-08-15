import { createHash } from "node:crypto";
import type {
  ClientBirthPlaceCandidate,
  ClientBirthPlaceSearchResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  BirthPlaceReferenceUnavailableError,
  BirthPlaceSearchRateLimitError,
  BirthPlaceSearchUnavailableError
} from "./errors";
import {
  RedisBirthPlaceSearchProvider,
  type RedisBirthPlaceSearchClient
} from "./redis-birth-place-search.provider";
import type { BirthPlaceUpstreamProvider } from "./types";

const response: ClientBirthPlaceSearchResponse = {
  candidates: [
    {
      id: "geoapify:51485",
      label: "Rome, Lazio, Italy",
      placeName: "Rome, Italy",
      countryCode: "IT",
      city: "Rome",
      region: "Lazio",
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829,
      provider: "geoapify",
      providerPlaceId: "51485"
    }
  ]
};
const referenceCandidate: ClientBirthPlaceCandidate = response.candidates[0]!;

const options = {
  keyPrefix: "elevenhouse:test:birth-place-search",
  cacheSuccessTtlSeconds: 2_592_000,
  cacheEmptyTtlSeconds: 1800,
  lockTtlMs: 6000,
  rateLimits: {
    userPerMinute: { limit: 20, windowSeconds: 60 },
    globalPerMinute: { limit: 120, windowSeconds: 60 },
    globalPerDay: { limit: 2500, windowSeconds: 86400 }
  }
};

describe("RedisBirthPlaceSearchProvider", () => {
  it("caches one validated place reference under a provider-and-id-specific key", async () => {
    const redis = new InMemoryBirthPlaceRedis();
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);
    const input = {
      ownerUserId: "owner-user-id",
      provider: "geoapify" as const,
      providerPlaceId: "51485"
    };

    await expect(provider.resolveReference(input)).resolves.toEqual(referenceCandidate);
    await expect(provider.resolveReference(input)).resolves.toEqual(referenceCandidate);

    expect(upstream.resolveReference).toHaveBeenCalledTimes(1);
    expect(redis.seenKeys).toContain(
      `{${options.keyPrefix}}:reference-cache:v1:geoapify:${sha256("51485")}`
    );
  });

  it("fails closed for a corrupted reference cache without falling through upstream", async () => {
    const redis = new InMemoryBirthPlaceRedis({ cacheReadResult: "not-json" });
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);

    await expect(
      provider.resolveReference({
        ownerUserId: "owner-user-id",
        provider: "geoapify",
        providerPlaceId: "51485"
      })
    ).rejects.toBeInstanceOf(BirthPlaceReferenceUnavailableError);
    expect(upstream.resolveReference).not.toHaveBeenCalled();
  });

  it("rejects a valid cached candidate bound to a different opaque reference", async () => {
    const redis = new InMemoryBirthPlaceRedis({
      cacheReadResult: JSON.stringify({
        ...referenceCandidate,
        id: "geoapify:different-place",
        providerPlaceId: "different-place"
      })
    });
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);

    await expect(
      provider.resolveReference({
        ownerUserId: "owner-user-id",
        provider: "geoapify",
        providerPlaceId: "51485"
      })
    ).rejects.toBeInstanceOf(BirthPlaceReferenceUnavailableError);
    expect(upstream.resolveReference).not.toHaveBeenCalled();
  });

  it("rejects reference resolution without authenticated owner authority", async () => {
    const upstream = createUpstream();
    const provider = createProvider(new InMemoryBirthPlaceRedis(), upstream);

    await expect(
      provider.resolveReference({ provider: "geoapify", providerPlaceId: "51485" })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
    expect(upstream.resolveReference).not.toHaveBeenCalled();
  });

  it("caches validated responses and normalizes repeated queries into one provider request", async () => {
    const redis = new InMemoryBirthPlaceRedis();
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);

    await expect(
      provider.search({ ownerUserId: "owner-user-id", query: "Rome Italy", limit: 3 })
    ).resolves.toEqual(response);
    await expect(
      provider.search({ ownerUserId: "owner-user-id", query: "  Rome   Italy  ", limit: 3 })
    ).resolves.toEqual(response);

    expect(upstream.search).toHaveBeenCalledTimes(1);
    expect(redis.seenKeys).toContain(
      `{${options.keyPrefix}}:cache:v1:${sha256(
        "rome italy:3:birth-place-search:lang-aware-city-ranking"
      )}`
    );
  });

  it("enforces shared Redis rate limits before any provider request", async () => {
    const redis = new InMemoryBirthPlaceRedis({ rateLimitRetryAfterSeconds: 42 });
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);

    let thrown: unknown;
    try {
      await provider.search({ ownerUserId: "owner-user-id", query: "Rome Italy", limit: 3 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BirthPlaceSearchRateLimitError);
    expect((thrown as BirthPlaceSearchRateLimitError).retryAfterSeconds).toBe(42);
    expect(upstream.search).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent cache misses through one Redis single-flight owner", async () => {
    const redis = new InMemoryBirthPlaceRedis();
    const deferred = createDeferred<ClientBirthPlaceSearchResponse>();
    const upstream: BirthPlaceUpstreamProvider = {
      search: vi.fn(() => deferred.promise),
      resolveReference: vi.fn(async () => referenceCandidate)
    };
    const provider = new RedisBirthPlaceSearchProvider(redis, upstream, options, {
      now: () => new Date("2026-07-30T12:00:00.000Z"),
      nonce: () => "nonce"
    });

    const first = provider.search({
      ownerUserId: "owner-user-id",
      query: "Rome Italy",
      limit: 3
    });
    await vi.waitFor(() => expect(upstream.search).toHaveBeenCalledTimes(1));
    const second = provider.search({
      ownerUserId: "owner-user-id",
      query: "Rome Italy",
      limit: 3
    });
    await vi.waitFor(() => expect(redis.lockAcquireCount).toBe(2));

    deferred.resolve(response);

    await expect(Promise.all([first, second])).resolves.toEqual([response, response]);
    expect(upstream.search).toHaveBeenCalledTimes(1);
  });

  it("releases the single-flight lock after a typed provider failure", async () => {
    const redis = new InMemoryBirthPlaceRedis();
    const upstream: BirthPlaceUpstreamProvider = {
      search: vi
        .fn()
        .mockRejectedValueOnce(new BirthPlaceSearchUnavailableError())
        .mockResolvedValueOnce(response),
      resolveReference: vi.fn(async () => referenceCandidate)
    };
    const provider = createProvider(redis, upstream);
    const input = { ownerUserId: "owner-user-id", query: "Rome Italy", limit: 3 };

    await expect(provider.search(input)).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
    await expect(provider.search(input)).resolves.toEqual(response);

    expect(upstream.search).toHaveBeenCalledTimes(2);
  });

  it("fails closed before provider access when no authenticated owner is supplied", async () => {
    const upstream = createUpstream();
    const provider = createProvider(new InMemoryBirthPlaceRedis(), upstream);

    await expect(provider.search({ query: "Rome Italy", limit: 3 })).rejects.toBeInstanceOf(
      BirthPlaceSearchUnavailableError
    );
    expect(upstream.search).not.toHaveBeenCalled();
  });

  it("fails closed on a malformed Redis integer response", async () => {
    const upstream = createUpstream();
    const provider = createProvider(
      new InMemoryBirthPlaceRedis({ rateLimitResult: "42-corrupt" }),
      upstream
    );

    await expect(
      provider.search({ ownerUserId: "owner-user-id", query: "Rome Italy", limit: 3 })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
    expect(upstream.search).not.toHaveBeenCalled();
  });

  it("fails closed instead of replacing a corrupted cached response", async () => {
    const upstream = createUpstream();
    const provider = createProvider(
      new InMemoryBirthPlaceRedis({ cacheReadResult: "not-json" }),
      upstream
    );

    await expect(
      provider.search({ ownerUserId: "owner-user-id", query: "Rome Italy", limit: 3 })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
    expect(upstream.search).not.toHaveBeenCalled();
  });
});

function createProvider(redis: RedisBirthPlaceSearchClient, upstream: BirthPlaceUpstreamProvider) {
  return new RedisBirthPlaceSearchProvider(redis, upstream, options, {
    now: () => new Date("2026-07-30T12:00:00.000Z"),
    nonce: () => "nonce",
    sleep: async () => undefined
  });
}

function createUpstream(): BirthPlaceUpstreamProvider {
  return {
    search: vi.fn(async () => response),
    resolveReference: vi.fn(async () => referenceCandidate)
  };
}

class InMemoryBirthPlaceRedis implements RedisBirthPlaceSearchClient {
  private readonly values = new Map<string, string>();
  private readonly locks = new Map<string, string>();
  private readonly rateLimitResult: unknown;
  private readonly cacheReadResult: unknown;
  readonly seenKeys: string[] = [];
  lockAcquireCount = 0;

  constructor(
    input: {
      readonly rateLimitRetryAfterSeconds?: number;
      readonly rateLimitResult?: unknown;
      readonly cacheReadResult?: unknown;
    } = {}
  ) {
    this.rateLimitResult = input.rateLimitResult ?? input.rateLimitRetryAfterSeconds ?? 0;
    this.cacheReadResult = input.cacheReadResult;
  }

  async eval(
    script: string,
    input: { readonly keys: string[]; readonly arguments: string[] }
  ): Promise<unknown> {
    this.seenKeys.push(...input.keys);
    if (script.includes("birth-place-cache-read")) {
      if (this.cacheReadResult !== undefined) {
        return this.cacheReadResult;
      }
      return this.values.get(input.keys[0] ?? "") ?? null;
    }
    if (script.includes("birth-place-cache-write")) {
      this.values.set(input.keys[0] ?? "", input.arguments[0] ?? "");
      return 1;
    }
    if (script.includes("birth-place-lock-acquire")) {
      this.lockAcquireCount += 1;
      const key = input.keys[0] ?? "";
      if (this.locks.has(key)) return 0;
      this.locks.set(key, input.arguments[0] ?? "");
      return 1;
    }
    if (script.includes("birth-place-lock-release")) {
      const key = input.keys[0] ?? "";
      if (this.locks.get(key) === input.arguments[0]) {
        this.locks.delete(key);
        return 1;
      }
      return 0;
    }
    if (script.includes("birth-place-rate-limit")) {
      return this.rateLimitResult;
    }
    throw new Error("Unexpected Redis script");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
