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
  getAstrologerClientCrmDetail,
  ClientBirthDataRelationshipDeniedError,
  ClientRelatedBirthProfileNotFoundError,
  listAstrologerClients,
  listAstrologerClientCrmPage,
  updateAstrologerClientCrmPrivateProfile,
  ClientBirthDataRevisionConflictError,
  writeClientBirthProfile,
  writeClientRelatedBirthProfile,
  type BookingClientServiceWorkSummaryReader,
  type SessionClientServiceWorkSummaryReader,
  type FinanceClientServiceWorkSummaryReader,
  type ClientCrmPrivateProfileStore,
  type ClientCrmReadStore,
  type ClientRelatedBirthProfileStore,
  type ClientStore
} from "@elevenhouse/domain";
import {
  astrologerClientListQuerySchema,
  astrologerClientListResponseSchema,
  astrologerClientCrmDetailResponseSchema,
  astrologerClientCrmListQuerySchema,
  astrologerClientCrmListResponseSchema,
  astrologerClientCrmPrivateProfileUpdateRequestSchema,
  astrologerClientCrmPrivateProfileUpdateResponseSchema,
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
  clientCrmActivityPageResponseSchema,
  clientCrmActivityQuerySchema,
  type AstrologerClientListResponse,
  type AstrologerClientCrmDetailResponse,
  type AstrologerClientCrmListResponse,
  type AstrologerClientCrmPrivateProfileUpdateResponse,
  type AstrologerClientResponse,
  type ClientCrmActivityPageResponse,
  type ClientBirthPlaceReferenceResponse,
  type ClientBirthPlaceSearchResponse,
  type ClientRelatedBirthProfileUpsertRequest,
  type ClientRelatedBirthProfileResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import type { ClientBirthPlaceSearchProvider } from "./birth-place-search.provider";
import {
  BIRTH_PLACE_SEARCH_PROVIDER,
  CLIENT_BOOKING_SERVICE_WORK_READER,
  CLIENT_CRM_READ_STORE,
  CLIENT_FINANCE_SERVICE_WORK_READER,
  CLIENT_SESSION_SERVICE_WORK_READER,
  CLIENT_STORE
} from "./clients.tokens";

@Injectable()
export class ClientsService {
  constructor(
    @Inject(CLIENT_STORE)
    private readonly store: ClientStore &
      Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">,
    private readonly clock: SystemClock,
    @Inject(BIRTH_PLACE_SEARCH_PROVIDER)
    private readonly birthPlaceSearchProvider: ClientBirthPlaceSearchProvider,
    @Inject(CLIENT_CRM_READ_STORE)
    private readonly clientCrmReadStore: ClientCrmReadStore & ClientCrmPrivateProfileStore,
    @Inject(CLIENT_BOOKING_SERVICE_WORK_READER)
    private readonly bookingServiceWorkReader: BookingClientServiceWorkSummaryReader,
    @Inject(CLIENT_SESSION_SERVICE_WORK_READER)
    private readonly sessionServiceWorkReader: SessionClientServiceWorkSummaryReader,
    @Inject(CLIENT_FINANCE_SERVICE_WORK_READER)
    private readonly financeServiceWorkReader: FinanceClientServiceWorkSummaryReader
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

  async listClientCrm(
    query: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstrologerClientCrmListResponse> {
    const parsedQuery = parseContract(astrologerClientCrmListQuerySchema, query);
    const astrologerUserId = requireAstrologerUserId(request);
    const result = await listAstrologerClientCrmPage({
      store: this.clientCrmReadStore,
      astrologerUserId,
      query: parsedQuery
    });

    if (result.kind === "found") {
      return astrologerClientCrmListResponseSchema.parse(result.page);
    }

    throwClientCrmReadFailure(result.kind);
  }

  async getClientCrm(
    clientUserId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstrologerClientCrmDetailResponse> {
    const detail = await this.readClientCrmDetail(clientUserId, request);
    return astrologerClientCrmDetailResponseSchema.parse({ client: detail });
  }

  async getClientCrmActivity(
    clientUserId: string,
    query: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<ClientCrmActivityPageResponse> {
    const parsedQuery = parseContract(clientCrmActivityQuerySchema, query);
    if (parsedQuery.cursor !== null || hasOwnQueryKey(query, "limit")) {
      throw new BadRequestException("Client CRM activity pagination is not available");
    }
    const detail = await this.readClientCrmDetail(clientUserId, request);
    return clientCrmActivityPageResponseSchema.parse(detail.activity);
  }

  async updateClientCrmPrivateProfile(
    clientUserId: string,
    body: unknown,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstrologerClientCrmPrivateProfileUpdateResponse> {
    const params = parseContract(astrologerClientParamsSchema, { clientUserId });
    const profile = parseContract(astrologerClientCrmPrivateProfileUpdateRequestSchema, body);
    const astrologerUserId = requireAstrologerUserId(request);
    const result = await updateAstrologerClientCrmPrivateProfile({
      store: this.clientCrmReadStore,
      astrologerUserId,
      clientUserId: params.clientUserId,
      profile,
      now: this.clock.now().toISOString()
    });

    if (result.kind === "updated") {
      return astrologerClientCrmPrivateProfileUpdateResponseSchema.parse({
        privateCrm: result.profile
      });
    }

    throwClientCrmReadFailure(result.kind);
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

  private async readClientCrmDetail(
    clientUserId: string,
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ) {
    const params = parseContract(astrologerClientParamsSchema, { clientUserId });
    const astrologerUserId = requireAstrologerUserId(request);
    const result = await getAstrologerClientCrmDetail({
      store: this.clientCrmReadStore,
      astrologerUserId,
      clientUserId: params.clientUserId,
      now: this.clock.now().toISOString(),
      serviceWorkSources: {
        bookings: this.bookingServiceWorkReader,
        sessions: this.sessionServiceWorkReader,
        finance: this.financeServiceWorkReader
      }
    });

    if (result.kind === "found") return result.detail;
    throwClientCrmReadFailure(result.kind);
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

function throwClientCrmReadFailure(
  kind: "not_found" | "not_related" | "blocked_or_archived" | "conflict" | "invalid_command"
): never {
  if (kind === "conflict") {
    throw new ConflictException({
      code: "CLIENT_CRM_READ_CONFLICT",
      message: "Client CRM data is inconsistent. Refresh and try again."
    });
  }
  if (kind === "invalid_command") {
    throw new BadRequestException("Invalid client CRM request");
  }
  throw new NotFoundException("Client was not found");
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

function hasOwnQueryKey(query: unknown, key: string): boolean {
  return typeof query === "object" && query !== null && Object.hasOwn(query, key);
}
