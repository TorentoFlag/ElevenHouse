import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import {
  BirthPlaceReferenceNotFoundError,
  BirthPlaceReferenceUnavailableError
} from "@elevenhouse/birth-place-search";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { GeoapifyBirthPlaceSearchProvider } from "./geoapify-birth-place-search.provider";

describe("GeoapifyBirthPlaceSearchProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Geoapify autocomplete results to birth-place candidates with provider timezone", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            place_id: "51485",
            formatted: "Rome, Lazio, Italy",
            address_line1: "Rome",
            address_line2: "Lazio, Italy",
            city: "Rome",
            state: "Lazio",
            country: "Italy",
            country_code: "it",
            lat: 41.8933,
            lon: 12.4829,
            timezone: { name: "Europe/Rome" }
          }
        ]
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeoapifyBirthPlaceSearchProvider(createConfigService());

    await expect(provider.search({ query: "Rome Italy", limit: 3 })).resolves.toEqual({
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
    });

    const [[url, options]] = fetchMock.mock.calls as unknown as [[URL, RequestInit]];
    expect(String(url)).toContain("https://api.geoapify.test/v1/geocode/autocomplete?");
    expect(url.searchParams.get("text")).toBe("Rome Italy");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("type")).toBe("city");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("apiKey")).toBe("geoapify-secret");
    expect(options).toMatchObject({
      headers: {
        Accept: "application/json"
      }
    });
  });

  it("fails closed when Geoapify is enabled without an API key", async () => {
    const provider = new GeoapifyBirthPlaceSearchProvider(
      createConfigService({ apiKey: undefined })
    );

    await expect(provider.search({ query: "Rome Italy", limit: 3 })).rejects.toThrow(
      ServiceUnavailableException
    );
  });

  it("resolves an opaque Geoapify id through place details and exposes no coordinate input", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {
                  feature_type: "details",
                  place_id: "51485",
                  formatted: "Rome, Lazio, Italy",
                  city: "Rome",
                  state: "Lazio",
                  country: "Italy",
                  country_code: "it",
                  lat: 41.8933,
                  lon: 12.4829,
                  timezone: { name: "Europe/Rome" }
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeoapifyBirthPlaceSearchProvider(createConfigService());

    await expect(provider.resolveReference("51485")).resolves.toMatchObject({
      provider: "geoapify",
      providerPlaceId: "51485",
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829
    });

    const [[url]] = fetchMock.mock.calls as unknown as [[URL, RequestInit]];
    expect(url.pathname).toBe("/v2/place-details");
    expect(url.searchParams.get("id")).toBe("51485");
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("lon")).toBe(false);
  });

  it("translates missing and failed references into typed responses without provider-body leaks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "provider-secret-body" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GeoapifyBirthPlaceSearchProvider(createConfigService());

    let missing: unknown;
    let failed: unknown;
    try {
      await provider.resolveReference("missing-place");
    } catch (error) {
      missing = error;
    }
    try {
      await provider.resolveReference("51485");
    } catch (error) {
      failed = error;
    }

    expect(missing).toBeInstanceOf(BirthPlaceReferenceNotFoundError);
    expect(failed).toBeInstanceOf(BirthPlaceReferenceUnavailableError);
    expect((failed as Error).message).not.toContain("provider-secret-body");
  });
});

function createConfigService(
  overrides: Partial<AstrologerApiRuntimeConfig["birthPlaceSearch"]> = {}
): ConfigService<AstrologerApiRuntimeConfig> {
  return {
    getOrThrow: () => ({
      enabled: true,
      provider: "geoapify",
      baseUrl: "https://api.geoapify.test",
      apiKey: "geoapify-secret",
      timeoutMs: 5000,
      cacheSuccessTtlSeconds: 2_592_000,
      cacheEmptyTtlSeconds: 1800,
      lockTtlMs: 6000,
      rateLimitRedisKeyPrefix: "elevenhouse:astrologer-api:birth-place-search",
      rateLimits: {
        userPerMinute: { limit: 20, windowSeconds: 60 },
        globalPerMinute: { limit: 120, windowSeconds: 60 },
        globalPerDay: { limit: 2500, windowSeconds: 86400 }
      },
      ...overrides
    })
  } as unknown as ConfigService<AstrologerApiRuntimeConfig>;
}
