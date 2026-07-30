import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  getAstrologerClient,
  listAstrologerClients,
  upsertClientBirthData,
  type ClientStore
} from "@elevenhouse/domain";
import {
  astrologerClientListQuerySchema,
  astrologerClientListResponseSchema,
  astrologerClientParamsSchema,
  astrologerClientResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientBirthPlaceSearchQuerySchema,
  clientBirthPlaceSearchResponseSchema,
  type AstrologerClientListResponse,
  type AstrologerClientResponse,
  type ClientBirthPlaceSearchResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import type { ClientBirthPlaceSearchProvider } from "./birth-place-search.provider";
import { BIRTH_PLACE_SEARCH_PROVIDER, CLIENT_STORE } from "./clients.tokens";

@Injectable()
export class ClientsService {
  constructor(
    @Inject(CLIENT_STORE) private readonly store: ClientStore,
    private readonly clock: SystemClock,
    @Inject(BIRTH_PLACE_SEARCH_PROVIDER)
    private readonly birthPlaceSearchProvider: ClientBirthPlaceSearchProvider
  ) {}

  async listClients(
    query: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstrologerClientListResponse> {
    const parsedQuery = parseContract(astrologerClientListQuerySchema, query);
    const astrologerUserId = requireAstrologerUserId(request);
    const result = await listAstrologerClients({
      store: this.store,
      astrologerUserId,
      query: parsedQuery.query,
      limit: parsedQuery.limit,
      offset: parsedQuery.offset
    });

    return astrologerClientListResponseSchema.parse(result);
  }

  async getClient(
    clientUserId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstrologerClientResponse> {
    const params = parseContract(astrologerClientParamsSchema, { clientUserId });
    const astrologerUserId = requireAstrologerUserId(request);
    const client = await getAstrologerClient({
      store: this.store,
      astrologerUserId,
      clientUserId: params.clientUserId
    });

    if (!client) {
      throw new NotFoundException("Client was not found");
    }

    return astrologerClientResponseSchema.parse({ client });
  }

  async searchBirthPlaces(
    query: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<ClientBirthPlaceSearchResponse> {
    const parsedQuery = parseContract(clientBirthPlaceSearchQuerySchema, query);
    requireAstrologerUserId(request);
    const result = await this.birthPlaceSearchProvider.search(parsedQuery);

    return clientBirthPlaceSearchResponseSchema.parse(result);
  }

  async updateBirthData(
    clientUserId: string,
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstrologerClientResponse> {
    const params = parseContract(astrologerClientParamsSchema, { clientUserId });
    const data = parseContract(clientBirthDataUpsertRequestSchema, body);
    const astrologerUserId = requireAstrologerUserId(request);
    const client = await getAstrologerClient({
      store: this.store,
      astrologerUserId,
      clientUserId: params.clientUserId
    });

    if (!client) {
      throw new NotFoundException("Client was not found");
    }

    const birthData = await upsertClientBirthData({
      store: this.store,
      clientUserId: params.clientUserId,
      data: { ...data, source: "manual" },
      now: this.clock.now()
    });

    return astrologerClientResponseSchema.parse({
      client: {
        ...client,
        birthData
      }
    });
  }
}

function requireAstrologerUserId(
  request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
): string {
  const astrologerUserId = request.currentAstrologerAccount?.account.id;
  if (!astrologerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return astrologerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid client request");
  }

  return result.data;
}
