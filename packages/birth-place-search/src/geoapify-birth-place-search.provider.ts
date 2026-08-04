import {
  clientBirthPlaceProviderPlaceIdSchema,
  clientBirthPlaceReferenceResponseSchema,
  clientBirthPlaceSearchResponseSchema,
  type ClientBirthPlaceCandidate
} from "@elevenhouse/contracts";
import {
  BirthPlaceReferenceInvalidError,
  BirthPlaceReferenceNotFoundError,
  BirthPlaceReferenceUnavailableError,
  BirthPlaceSearchUnavailableError
} from "./errors";
import type { BirthPlaceSearchInput, BirthPlaceUpstreamProvider } from "./types";

export type GeoapifyBirthPlaceSearchOptions = {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly apiKey: string | null | undefined;
  readonly timeoutMs: number;
};

type GeoapifyAutocompleteResponse = {
  readonly results?: readonly GeoapifyPlace[];
};

type GeoapifyPlaceDetailsResponse = {
  readonly type?: string;
  readonly features?: readonly GeoapifyPlaceDetailsFeature[];
};

type GeoapifyPlaceDetailsFeature = {
  readonly type?: string;
  readonly properties?: GeoapifyPlace & {
    readonly feature_type?: string;
  };
};

type GeoapifyPlace = {
  readonly place_id?: string;
  readonly formatted?: string;
  readonly address_line1?: string;
  readonly city?: string;
  readonly town?: string;
  readonly village?: string;
  readonly municipality?: string;
  readonly county?: string;
  readonly state?: string;
  readonly region?: string;
  readonly country?: string;
  readonly country_code?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly timezone?: {
    readonly name?: string;
  };
};

export class GeoapifyBirthPlaceSearchProvider implements BirthPlaceUpstreamProvider {
  constructor(
    private readonly options: GeoapifyBirthPlaceSearchOptions,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {}

  async search(input: BirthPlaceSearchInput) {
    if (!this.options.enabled || !this.options.apiKey) {
      throw new BirthPlaceSearchUnavailableError("Birth place search is not configured");
    }

    let url: URL;
    try {
      url = new URL("/v1/geocode/autocomplete", this.options.baseUrl);
    } catch (error) {
      throw new BirthPlaceSearchUnavailableError("Birth place search provider URL is invalid", {
        cause: error
      });
    }
    if (url.protocol !== "https:") {
      throw new BirthPlaceSearchUnavailableError(
        "Birth place search provider requires secure transport"
      );
    }
    url.searchParams.set("text", input.query);
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("type", "city");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", this.options.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new BirthPlaceSearchUnavailableError("Birth place search provider failed");
      }

      const payload = (await response.json()) as GeoapifyAutocompleteResponse;
      if (!Array.isArray(payload.results)) {
        throw new BirthPlaceSearchUnavailableError(
          "Birth place search provider returned invalid data"
        );
      }

      return clientBirthPlaceSearchResponseSchema.parse({
        candidates: payload.results.slice(0, input.limit).map(toCandidate)
      });
    } catch (error) {
      if (error instanceof BirthPlaceSearchUnavailableError) {
        throw error;
      }
      throw new BirthPlaceSearchUnavailableError("Birth place search provider is unavailable", {
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolveReference(providerPlaceId: string): Promise<ClientBirthPlaceCandidate> {
    const parsedProviderPlaceId = clientBirthPlaceProviderPlaceIdSchema.safeParse(providerPlaceId);
    if (!parsedProviderPlaceId.success) {
      throw new BirthPlaceReferenceInvalidError();
    }
    if (!this.options.enabled || !this.options.apiKey) {
      throw new BirthPlaceReferenceUnavailableError(
        "Birth place reference provider is not configured"
      );
    }

    let url: URL;
    try {
      url = new URL("/v2/place-details", this.options.baseUrl);
    } catch (error) {
      throw new BirthPlaceReferenceUnavailableError(
        "Birth place reference provider URL is invalid",
        { cause: error }
      );
    }
    if (url.protocol !== "https:") {
      throw new BirthPlaceReferenceUnavailableError(
        "Birth place reference provider requires secure transport"
      );
    }
    url.searchParams.set("id", parsedProviderPlaceId.data);
    url.searchParams.set("features", "details");
    url.searchParams.set("apiKey", this.options.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });
      if (response.status === 404) {
        throw new BirthPlaceReferenceNotFoundError();
      }
      if (!response.ok) {
        throw new BirthPlaceReferenceUnavailableError();
      }

      const payload = (await response.json()) as GeoapifyPlaceDetailsResponse;
      if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
        throw new BirthPlaceReferenceUnavailableError();
      }
      if (payload.features.length === 0) {
        throw new BirthPlaceReferenceNotFoundError();
      }

      const details = payload.features.filter(
        (feature) => feature?.type === "Feature" && feature.properties?.feature_type === "details"
      );
      if (details.length !== 1) {
        throw new BirthPlaceReferenceUnavailableError();
      }
      const properties = details[0]?.properties;
      if (!properties) {
        throw new BirthPlaceReferenceUnavailableError();
      }

      return clientBirthPlaceReferenceResponseSchema.parse(
        toCandidate({ ...properties, place_id: parsedProviderPlaceId.data })
      );
    } catch (error) {
      if (
        error instanceof BirthPlaceReferenceInvalidError ||
        error instanceof BirthPlaceReferenceNotFoundError ||
        error instanceof BirthPlaceReferenceUnavailableError
      ) {
        throw error;
      }
      throw new BirthPlaceReferenceUnavailableError(undefined, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toCandidate(place: GeoapifyPlace): ClientBirthPlaceCandidate {
  const latitude = place.lat;
  const longitude = place.lon;
  const providerPlaceId = place.place_id?.trim() ?? "";
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !providerPlaceId
  ) {
    throw new BirthPlaceSearchUnavailableError(
      "Birth place search provider returned incomplete location data"
    );
  }

  const city =
    place.city ??
    place.town ??
    place.village ??
    place.municipality ??
    place.county ??
    place.address_line1 ??
    null;
  const region = place.state ?? place.region ?? null;
  const countryCode = place.country_code ? place.country_code.toUpperCase() : null;
  const placeName = [city, place.country].filter(Boolean).join(", ") || place.formatted;
  const timezone = place.timezone?.name?.trim();
  if (!place.formatted || !placeName) {
    throw new BirthPlaceSearchUnavailableError(
      "Birth place search provider returned incomplete location data"
    );
  }
  if (!timezone) {
    throw new BirthPlaceSearchUnavailableError(
      "Birth place search provider returned incomplete civil-time data"
    );
  }

  return {
    id: `geoapify:${providerPlaceId}`,
    label: place.formatted,
    placeName,
    countryCode,
    city,
    region,
    timezone,
    latitude,
    longitude,
    provider: "geoapify",
    providerPlaceId
  };
}
