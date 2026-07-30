import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import timezoneLookup from "tz-lookup";
import {
  clientBirthPlaceSearchResponseSchema,
  type ClientBirthPlaceCandidate
} from "@elevenhouse/contracts";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import type {
  BirthPlaceSearchInput,
  ClientBirthPlaceSearchProvider
} from "./birth-place-search.provider";

type NominatimPlace = {
  readonly place_id?: number | string;
  readonly osm_type?: string;
  readonly osm_id?: number | string;
  readonly display_name?: string;
  readonly lat?: string;
  readonly lon?: string;
  readonly address?: {
    readonly city?: string;
    readonly town?: string;
    readonly village?: string;
    readonly municipality?: string;
    readonly county?: string;
    readonly state?: string;
    readonly region?: string;
    readonly country?: string;
    readonly country_code?: string;
  };
};

@Injectable()
export class NominatimBirthPlaceSearchProvider implements ClientBirthPlaceSearchProvider {
  private readonly config: AstrologerApiRuntimeConfig["birthPlaceSearch"];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow(
      "astrologerApi.birthPlaceSearch"
    ) as AstrologerApiRuntimeConfig["birthPlaceSearch"];
  }

  async search(input: BirthPlaceSearchInput) {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException("Birth place search is not configured");
    }

    const url = new URL("/search", this.config.baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("q", input.query);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": this.config.userAgent
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new ServiceUnavailableException("Birth place search provider failed");
      }
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new ServiceUnavailableException("Birth place search provider returned invalid data");
      }

      return clientBirthPlaceSearchResponseSchema.parse({
        candidates: payload.flatMap((place) => toCandidate(place as NominatimPlace))
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException("Birth place search provider is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toCandidate(place: NominatimPlace): readonly ClientBirthPlaceCandidate[] {
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  const providerPlaceId = String(place.place_id ?? place.osm_id ?? "");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !providerPlaceId) {
    return [];
  }

  const address = place.address ?? {};
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null;
  const region = address.state ?? address.region ?? null;
  const countryCode = address.country_code ? address.country_code.toUpperCase() : null;
  const placeName = [city, address.country].filter(Boolean).join(", ") || place.display_name;
  if (!place.display_name || !placeName) {
    return [];
  }

  return [
    {
      id: `nominatim:${providerPlaceId}`,
      label: place.display_name,
      placeName,
      countryCode,
      city,
      region,
      timezone: timezoneLookup(latitude, longitude),
      latitude,
      longitude,
      provider: "nominatim",
      providerPlaceId
    }
  ];
}
