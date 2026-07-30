import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { NominatimBirthPlaceSearchProvider } from "./nominatim-birth-place-search.provider";

describe("NominatimBirthPlaceSearchProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Nominatim search results to birth-place candidates with IANA timezone", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          place_id: 41485,
          display_name: "Rome, Roma Capitale, Lazio, Italy",
          lat: "41.8933203",
          lon: "12.4829321",
          address: {
            city: "Rome",
            state: "Lazio",
            country: "Italy",
            country_code: "it"
          }
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new NominatimBirthPlaceSearchProvider(createConfigService());

    await expect(provider.search({ query: "Rome Italy", limit: 3 })).resolves.toEqual({
      candidates: [
        {
          id: "nominatim:41485",
          label: "Rome, Roma Capitale, Lazio, Italy",
          placeName: "Rome, Italy",
          countryCode: "IT",
          city: "Rome",
          region: "Lazio",
          timezone: "Europe/Rome",
          latitude: 41.8933203,
          longitude: 12.4829321,
          provider: "nominatim",
          providerPlaceId: "41485"
        }
      ]
    });

    const [[url, options]] = fetchMock.mock.calls as unknown as [[URL, RequestInit]];
    expect(String(url)).toContain("https://nominatim.example/search?");
    expect(String(url)).toContain("q=Rome+Italy");
    expect(String(url)).toContain("limit=3");
    expect(options).toMatchObject({
      headers: {
        Accept: "application/json",
        "User-Agent": "ElevenHouse QA (qa@elevenhouse.ai)"
      }
    });
  });
});

function createConfigService(): ConfigService<AstrologerApiRuntimeConfig> {
  return {
    getOrThrow: () => ({
      enabled: true,
      provider: "nominatim",
      baseUrl: "https://nominatim.example",
      userAgent: "ElevenHouse QA (qa@elevenhouse.ai)",
      timeoutMs: 5000
    })
  } as unknown as ConfigService<AstrologerApiRuntimeConfig>;
}
