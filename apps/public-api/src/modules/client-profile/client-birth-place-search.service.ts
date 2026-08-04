import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  BirthPlaceSearchRateLimitError,
  BirthPlaceSearchUnavailableError,
  type BirthPlaceSearchProvider
} from "@elevenhouse/birth-place-search";
import {
  clientBirthPlaceSearchQuerySchema,
  clientBirthPlaceSearchResponseSchema,
  type ClientBirthPlaceSearchResponse
} from "@elevenhouse/contracts";
import { CLIENT_BIRTH_PLACE_SEARCH_PROVIDER } from "./client-profile.tokens";

@Injectable()
export class ClientBirthPlaceSearchService {
  constructor(
    @Inject(CLIENT_BIRTH_PLACE_SEARCH_PROVIDER)
    private readonly provider: BirthPlaceSearchProvider
  ) {}

  async search(clientUserId: string, query: unknown): Promise<ClientBirthPlaceSearchResponse> {
    const parsed = clientBirthPlaceSearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException("Invalid birth place search query");
    }

    try {
      return clientBirthPlaceSearchResponseSchema.parse(
        await this.provider.search({
          ownerUserId: clientUserId,
          ...parsed.data
        })
      );
    } catch (error) {
      if (error instanceof BirthPlaceSearchRateLimitError) {
        throw new HttpException(
          {
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      if (error instanceof BirthPlaceSearchUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw new ServiceUnavailableException("Birth place search is unavailable");
    }
  }
}
