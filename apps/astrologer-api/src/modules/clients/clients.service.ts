import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  getAstrologerClient,
  ClientBirthDataRelationshipDeniedError,
  ClientRelatedBirthProfileNotFoundError,
  listAstrologerClients,
  ClientBirthDataRevisionConflictError,
  writeClientBirthProfile,
  writeClientRelatedBirthProfile,
  type ClientRelatedBirthProfileStore,
  type ClientStore
} from "@elevenhouse/domain";
import {
  astrologerClientListQuerySchema,
  astrologerClientListResponseSchema,
  astrologerClientParamsSchema,
  astrologerClientResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientRelatedBirthProfileParamsSchema,
  clientRelatedBirthProfileResponseSchema,
  clientRelatedBirthProfileUpsertRequestSchema,
  clientBirthPlaceReferenceParamsSchema,
  clientBirthPlaceReferenceResponseSchema,
  clientBirthPlaceSearchQuerySchema,
  clientBirthPlaceSearchResponseSchema,
  type AstrologerClientListResponse,
  type AstrologerClientResponse,
  type ClientBirthPlaceReferenceResponse,
  type ClientBirthPlaceSearchResponse,
  type ClientRelatedBirthProfileUpsertRequest,
  type ClientRelatedBirthProfileResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import type { ClientBirthPlaceSearchProvider } from "./birth-place-search.provider";
import { BIRTH_PLACE_SEARCH_PROVIDER, CLIENT_STORE } from "./clients.tokens";

@Injectable()
export class ClientsService {
  constructor(
    @Inject(CLIENT_STORE)
    private readonly store: ClientStore &
      Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">,
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
    const ownerUserId = requireAstrologerUserId(request);
    const result = await this.birthPlaceSearchProvider.search({
      ownerUserId,
      ...parsedQuery
    });

    return clientBirthPlaceSearchResponseSchema.parse(result);
  }

  async resolveBirthPlaceReference(
    providerPlaceId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<ClientBirthPlaceReferenceResponse> {
    const params = parseBirthPlaceReferenceParams(providerPlaceId);
    const ownerUserId = requireAstrologerUserId(request);
    const result = await this.birthPlaceSearchProvider.resolveReference({
      ownerUserId,
      provider: "geoapify",
      providerPlaceId: params.providerPlaceId
    });

    return clientBirthPlaceReferenceResponseSchema.parse(result);
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

    let birthData;
    try {
      birthData = await writeClientBirthProfile({
        store: this.store,
        clientUserId: params.clientUserId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: data.expectedRevision,
        data: { ...data, source: "manual" },
        now: this.clock.now()
      });
    } catch (error) {
      if (error instanceof ClientBirthDataRevisionConflictError) {
        throw new ConflictException({
          code: "CLIENT_BIRTH_DATA_REVISION_CONFLICT",
          message: "Birth data was changed by another actor. Refresh and try again."
        });
      }
      if (error instanceof ClientBirthDataRelationshipDeniedError) {
        throw new NotFoundException("Client was not found");
      }
      throw error;
    }

    return astrologerClientResponseSchema.parse({
      client: {
        ...client,
        birthData
      }
    });
  }

  async createRelatedBirthProfile(
    clientUserId: string,
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<ClientRelatedBirthProfileResponse> {
    const params = parseContract(astrologerClientParamsSchema, { clientUserId });
    const data = parseContract(clientRelatedBirthProfileUpsertRequestSchema, body);
    const astrologerUserId = requireAstrologerUserId(request);
    await this.requireAstrologerClient(astrologerUserId, params.clientUserId);
    return this.writeRelatedBirthProfile(astrologerUserId, params.clientUserId, null, data);
  }

  async updateRelatedBirthProfile(
    clientUserId: string,
    relatedProfileId: string,
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<ClientRelatedBirthProfileResponse> {
    const params = parseContract(clientRelatedBirthProfileParamsSchema, {
      clientUserId,
      relatedProfileId
    });
    const data = parseContract(clientRelatedBirthProfileUpsertRequestSchema, body);
    const astrologerUserId = requireAstrologerUserId(request);
    await this.requireAstrologerClient(astrologerUserId, params.clientUserId);
    return this.writeRelatedBirthProfile(
      astrologerUserId,
      params.clientUserId,
      params.relatedProfileId,
      data
    );
  }

  private async requireAstrologerClient(
    astrologerUserId: string,
    clientUserId: string
  ): Promise<void> {
    const client = await getAstrologerClient({
      store: this.store,
      astrologerUserId,
      clientUserId
    });
    if (!client) {
      throw new NotFoundException("Client was not found");
    }
  }

  private async writeRelatedBirthProfile(
    astrologerUserId: string,
    clientUserId: string,
    relatedProfileId: string | null,
    data: ClientRelatedBirthProfileUpsertRequest
  ): Promise<ClientRelatedBirthProfileResponse> {
    try {
      const profile = await writeClientRelatedBirthProfile({
        store: this.store,
        clientUserId,
        relatedProfileId,
        actor: { userId: astrologerUserId, role: "astrologer" },
        expectedRevision: data.expectedRevision,
        data: { ...data, source: "manual" },
        now: this.clock.now()
      });
      return clientRelatedBirthProfileResponseSchema.parse(profile);
    } catch (error) {
      if (error instanceof ClientBirthDataRevisionConflictError) {
        throw new ConflictException({
          code: "CLIENT_RELATED_BIRTH_PROFILE_REVISION_CONFLICT",
          message: "Related birth profile was changed by another actor. Refresh and try again."
        });
      }
      if (
        error instanceof ClientBirthDataRelationshipDeniedError ||
        error instanceof ClientRelatedBirthProfileNotFoundError
      ) {
        throw new NotFoundException("Client related birth profile was not found");
      }
      throw error;
    }
  }
}

function parseBirthPlaceReferenceParams(providerPlaceId: string) {
  const result = clientBirthPlaceReferenceParamsSchema.safeParse({ providerPlaceId });
  if (!result.success) {
    throw new BadRequestException({
      code: "BIRTH_PLACE_REFERENCE_INVALID",
      message: "Birth place reference is invalid"
    });
  }

  return result.data;
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
