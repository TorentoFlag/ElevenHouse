import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BirthPlaceReferenceInvalidError,
  BirthPlaceReferenceNotFoundError,
  BirthPlaceReferenceUnavailableError,
  BirthPlaceSearchUnavailableError
} from "./errors";
import { GeoapifyBirthPlaceSearchProvider } from "./geoapify-birth-place-search.provider";

describe("GeoapifyBirthPlaceSearchProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("maps provider-resolved civil-time fields into the strict shared candidate contract", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        results: [
          {
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
        ]
      })
    );
    const provider = new GeoapifyBirthPlaceSearchProvider(config(), fetcher);

    await expect(
      provider.search({ ownerUserId: "owner", query: "Rome Italy", limit: 3 })
    ).resolves.toEqual({
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

    const [[url, request]] = fetcher.mock.calls as unknown as [[URL, RequestInit]];
    expect(url.pathname).toBe("/v1/geocode/autocomplete");
    expect(url.searchParams.get("text")).toBe("Rome Italy");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("type")).toBe("city");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("apiKey")).toBe("geoapify-secret");
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("resolves one opaque Geoapify place id through place details without caller location data", async () => {
    const providerPlaceId = "5132009123fa5a244059c72f70125fb04840f00102f9014496730800000000";
    const fetcher = vi.fn(async () =>
      jsonResponse({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              feature_type: "details",
              place_id: providerPlaceId,
              formatted: "Rome, Lazio, Italy",
              city: "Rome",
              state: "Lazio",
              country: "Italy",
              country_code: "it",
              lat: 41.8933,
              lon: 12.4829,
              timezone: { name: "Europe/Rome" }
            },
            geometry: { type: "Point", coordinates: [12.4829, 41.8933] }
          }
        ]
      })
    );
    const provider = new GeoapifyBirthPlaceSearchProvider(config(), fetcher);

    await expect(provider.resolveReference(providerPlaceId)).resolves.toEqual({
      id: `geoapify:${providerPlaceId}`,
      label: "Rome, Lazio, Italy",
      placeName: "Rome, Italy",
      countryCode: "IT",
      city: "Rome",
      region: "Lazio",
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829,
      provider: "geoapify",
      providerPlaceId
    });

    const [[url, request]] = fetcher.mock.calls as unknown as [[URL, RequestInit]];
    expect(url.pathname).toBe("/v2/place-details");
    expect(url.searchParams.get("id")).toBe(providerPlaceId);
    expect(url.searchParams.get("apiKey")).toBe("geoapify-secret");
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("lon")).toBe(false);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the requested opaque reference when place details returns a different canonical id", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              feature_type: "details",
              place_id: "canonicalized-rome-id",
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
      })
    );
    const provider = new GeoapifyBirthPlaceSearchProvider(config(), fetcher);

    await expect(provider.resolveReference("autocomplete-rome-id")).resolves.toMatchObject({
      id: "geoapify:autocomplete-rome-id",
      provider: "geoapify",
      providerPlaceId: "autocomplete-rome-id"
    });
  });

  it("rejects a URL-shaped reference before provider access", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ type: "FeatureCollection", features: [] }));
    const provider = new GeoapifyBirthPlaceSearchProvider(config(), fetcher);

    await expect(
      provider.resolveReference("https://api.geoapify.com/v2/place-details?id=51485")
    ).rejects.toBeInstanceOf(BirthPlaceReferenceInvalidError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns typed safe failures for missing, malformed and failed place details", async () => {
    const missing = new GeoapifyBirthPlaceSearchProvider(
      config(),
      vi.fn(async () => jsonResponse({ type: "FeatureCollection", features: [] }))
    );
    const malformed = new GeoapifyBirthPlaceSearchProvider(
      config(),
      vi.fn(async () =>
        jsonResponse({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                feature_type: "details",
                place_id: "51485",
                formatted: "provider-secret-body"
              }
            }
          ]
        })
      )
    );
    const failed = new GeoapifyBirthPlaceSearchProvider(
      config(),
      vi.fn(async () => jsonResponse({ message: "provider-secret-body" }, 503))
    );

    await expect(missing.resolveReference("51485")).rejects.toBeInstanceOf(
      BirthPlaceReferenceNotFoundError
    );
    await expect(malformed.resolveReference("51485")).rejects.toBeInstanceOf(
      BirthPlaceReferenceUnavailableError
    );
    await expect(failed.resolveReference("51485")).rejects.toBeInstanceOf(
      BirthPlaceReferenceUnavailableError
    );
    await expect(failed.resolveReference("51485")).rejects.not.toThrow("provider-secret-body");
  });

  it("bounds place-details requests with the configured abort timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        })
    );
    const provider = new GeoapifyBirthPlaceSearchProvider(
      { ...config(), timeoutMs: 2500 },
      fetcher
    );
    const result = provider.resolveReference("51485");
    const assertion = expect(result).rejects.toBeInstanceOf(BirthPlaceReferenceUnavailableError);

    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
    expect((fetcher.mock.calls[0]?.[1] as RequestInit | undefined)?.signal?.aborted).toBe(true);
  });

  it("fails closed instead of substituting a timezone when Geoapify omits it", async () => {
    const provider = new GeoapifyBirthPlaceSearchProvider(
      config(),
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              place_id: "moscow",
              formatted: "Москва, Россия",
              city: "Москва",
              country: "Россия",
              country_code: "ru",
              lat: 55.7558,
              lon: 37.6173
            }
          ]
        })
      )
    );

    await expect(
      provider.search({ ownerUserId: "owner", query: "Москва", limit: 5 })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
  });

  it("fails closed for missing credentials, provider errors and malformed payloads", async () => {
    await expect(
      new GeoapifyBirthPlaceSearchProvider({ ...config(), apiKey: null }).search({
        ownerUserId: "owner",
        query: "Rome",
        limit: 3
      })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);

    await expect(
      new GeoapifyBirthPlaceSearchProvider(
        config(),
        vi.fn(async () => jsonResponse({}, 503))
      ).search({
        ownerUserId: "owner",
        query: "Rome",
        limit: 3
      })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);

    await expect(
      new GeoapifyBirthPlaceSearchProvider(
        config(),
        vi.fn(async () => jsonResponse({ data: [] }))
      ).search({
        ownerUserId: "owner",
        query: "Rome",
        limit: 3
      })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);

    await expect(
      new GeoapifyBirthPlaceSearchProvider(
        config(),
        vi.fn(async () =>
          jsonResponse({
            results: [
              {
                formatted: "Unknown place",
                lat: 41.9,
                lon: 12.5,
                timezone: { name: "Europe/Rome" }
              }
            ]
          })
        )
      ).search({ ownerUserId: "owner", query: "Unknown", limit: 3 })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
  });

  it("does not send the provider key over an insecure or invalid base URL", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ results: [] }));

    await expect(
      new GeoapifyBirthPlaceSearchProvider(
        { ...config(), baseUrl: "http://geoapify.internal" },
        fetcher
      ).search({ ownerUserId: "owner", query: "Rome", limit: 3 })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
    await expect(
      new GeoapifyBirthPlaceSearchProvider({ ...config(), baseUrl: "not a URL" }, fetcher).search({
        ownerUserId: "owner",
        query: "Rome",
        limit: 3
      })
    ).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts a provider request at the configured timeout and returns a typed failure", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        })
    );
    const provider = new GeoapifyBirthPlaceSearchProvider(
      { ...config(), timeoutMs: 2500 },
      fetcher
    );
    const result = provider.search({ ownerUserId: "owner", query: "Rome", limit: 3 });
    const assertion = expect(result).rejects.toBeInstanceOf(BirthPlaceSearchUnavailableError);

    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
    expect((fetcher.mock.calls[0]?.[1] as RequestInit | undefined)?.signal?.aborted).toBe(true);
  });
});

function config() {
  return {
    enabled: true,
    baseUrl: "https://api.geoapify.test",
    apiKey: "geoapify-secret",
    timeoutMs: 5000
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
