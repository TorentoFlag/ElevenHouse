import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GeoapifyBirthPlaceSearchProvider as SharedGeoapifyBirthPlaceSearchProvider,
  type BirthPlaceSearchInput,
  type BirthPlaceUpstreamProvider
} from "@elevenhouse/birth-place-search";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { translateBirthPlaceSearchError } from "./birth-place-search-http-errors";

@Injectable()
export class GeoapifyBirthPlaceSearchProvider implements BirthPlaceUpstreamProvider {
  private readonly provider: SharedGeoapifyBirthPlaceSearchProvider;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AstrologerApiRuntimeConfig["birthPlaceSearch"]>(
      "astrologerApi.birthPlaceSearch"
    );
    this.provider = new SharedGeoapifyBirthPlaceSearchProvider({
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs
    });
  }

  async search(input: BirthPlaceSearchInput) {
    try {
      return await this.provider.search(input);
    } catch (error) {
      throw translateBirthPlaceSearchError(error);
    }
  }

  async resolveReference(providerPlaceId: string) {
    return this.provider.resolveReference(providerPlaceId);
  }
}
