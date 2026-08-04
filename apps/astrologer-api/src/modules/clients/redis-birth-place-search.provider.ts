import {
  RedisBirthPlaceSearchProvider as SharedRedisBirthPlaceSearchProvider,
  type BirthPlaceProvider,
  type BirthPlaceReferenceInput,
  type BirthPlaceSearchInput,
  type RedisBirthPlaceSearchClient,
  type RedisBirthPlaceSearchOptions,
  type RedisBirthPlaceSearchSettings,
  type BirthPlaceUpstreamProvider
} from "@elevenhouse/birth-place-search";
import { translateBirthPlaceSearchError } from "./birth-place-search-http-errors";

export type { RedisBirthPlaceSearchClient, RedisBirthPlaceSearchOptions };

export class RedisBirthPlaceSearchProvider implements BirthPlaceProvider {
  private readonly provider: SharedRedisBirthPlaceSearchProvider;

  constructor(
    client: RedisBirthPlaceSearchClient,
    upstream: BirthPlaceUpstreamProvider,
    options: RedisBirthPlaceSearchOptions,
    settings: RedisBirthPlaceSearchSettings = {}
  ) {
    this.provider = new SharedRedisBirthPlaceSearchProvider(client, upstream, options, settings);
  }

  async search(input: BirthPlaceSearchInput) {
    try {
      return await this.provider.search(input);
    } catch (error) {
      throw translateBirthPlaceSearchError(error);
    }
  }

  async resolveReference(input: BirthPlaceReferenceInput) {
    try {
      return await this.provider.resolveReference(input);
    } catch (error) {
      throw translateBirthPlaceSearchError(error);
    }
  }
}
