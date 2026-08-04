import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { BirthPlaceReferenceNotFoundError } from "@elevenhouse/birth-place-search";
import type { ClientBirthPlaceSearchResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  RedisBirthPlaceSearchProvider,
  type RedisBirthPlaceSearchClient
} from "./redis-birth-place-search.provider";
import type { ClientBirthPlaceUpstreamProvider } from "./birth-place-search.provider";

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

const options = {
  keyPrefix: "elevenhouse:astrologer-api:birth-place-search",
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
  it("caches a validated reference by provider and opaque id without a success fallback", async () => {
    const redis = new InMemoryBirthPlaceRedis();
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);
    const input = {
      ownerUserId: "owner-user-id",
      provider: "geoapify" as const,
      providerPlaceId: "51485"
    };

    await expect(provider.resolveReference(input)).resolves.toEqual(response.candidates[0]);
    await expect(provider.resolveReference(input)).resolves.toEqual(response.candidates[0]);

    expect(upstream.resolveReference).toHaveBeenCalledTimes(1);
    expect(redis.seenKeys).toContain(
      `{${options.keyPrefix}}:reference-cache:v1:geoapify:${sha256("51485")}`
    );
  });

  it("translates a typed upstream missing-reference result only at the outer HTTP boundary", async () => {
    const upstream = createUpstream();
    upstream.resolveReference = vi.fn(async () => {
      throw new BirthPlaceReferenceNotFoundError();
    });
    const provider = createProvider(new InMemoryBirthPlaceRedis(), upstream);

    let thrown: unknown;
    try {
      await provider.resolveReference({
        ownerUserId: "owner-user-id",
        provider: "geoapify",
        providerPlaceId: "missing-place"
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect((thrown as HttpException).getResponse()).toMatchObject({
      code: "BIRTH_PLACE_REFERENCE_NOT_FOUND"
    });
  });

  it("caches provider responses in Redis and reuses them for repeated queries", async () => {
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
  });

  it("blocks provider calls when Redis rate limiting returns retry-after", async () => {
    const redis = new InMemoryBirthPlaceRedis({ rateLimitRetryAfterSeconds: 42 });
    const upstream = createUpstream();
    const provider = createProvider(redis, upstream);

    let thrown: unknown;
    try {
      await provider.search({ ownerUserId: "owner-user-id", query: "Rome Italy", limit: 3 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(upstream.search).not.toHaveBeenCalled();
  });
});

function createProvider(
  redis: RedisBirthPlaceSearchClient,
  upstream: ClientBirthPlaceUpstreamProvider
) {
  return new RedisBirthPlaceSearchProvider(redis, upstream, options, {
    now: () => new Date("2026-07-30T12:00:00.000Z"),
    nonce: () => "nonce",
    sleep: async () => undefined
  });
}

function createUpstream(): ClientBirthPlaceUpstreamProvider {
  return {
    search: vi.fn(async () => response),
    resolveReference: vi.fn(async () => response.candidates[0]!)
  };
}

class InMemoryBirthPlaceRedis implements RedisBirthPlaceSearchClient {
  private readonly values = new Map<string, string>();
  private readonly locks = new Map<string, string>();
  private readonly rateLimitRetryAfterSeconds: number;
  readonly seenKeys: string[] = [];

  constructor(input: { readonly rateLimitRetryAfterSeconds?: number } = {}) {
    this.rateLimitRetryAfterSeconds = input.rateLimitRetryAfterSeconds ?? 0;
  }

  async eval(
    script: string,
    options: { readonly keys: string[]; readonly arguments: string[] }
  ): Promise<unknown> {
    this.seenKeys.push(...options.keys);
    if (script.includes("birth-place-cache-read")) {
      return this.values.get(options.keys[0] ?? "") ?? null;
    }

    if (script.includes("birth-place-cache-write")) {
      this.values.set(options.keys[0] ?? "", options.arguments[0] ?? "");
      return 1;
    }

    if (script.includes("birth-place-lock-acquire")) {
      const key = options.keys[0] ?? "";
      if (this.locks.has(key)) return 0;
      this.locks.set(key, options.arguments[0] ?? "");
      return 1;
    }

    if (script.includes("birth-place-lock-release")) {
      const key = options.keys[0] ?? "";
      if (this.locks.get(key) === options.arguments[0]) {
        this.locks.delete(key);
        return 1;
      }
      return 0;
    }

    if (script.includes("birth-place-rate-limit")) {
      return this.rateLimitRetryAfterSeconds;
    }

    throw new Error("Unexpected Redis script");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
