import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ClientBirthData,
  ClientRelatedBirthProfile,
  ClientRelatedBirthProfileStore,
  ClientStore
} from "@elevenhouse/domain";
import {
  ClientBirthDataRevisionConflictError,
  ClientRelatedBirthProfileNotFoundError,
  writeClientBirthProfile,
  writeClientRelatedBirthProfile
} from "@elevenhouse/domain";
import {
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientCabinetOverviewResponseSchema,
  clientRelatedBirthProfileParamsSchema,
  clientRelatedBirthProfileListResponseSchema,
  clientRelatedBirthProfileResponseSchema,
  clientRelatedBirthProfileUpsertRequestSchema,
  relatedAstrologerListResponseSchema,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest,
  type ClientCabinetOverviewResponse,
  type ClientRelatedBirthProfileListResponse,
  type ClientRelatedBirthProfileResponse,
  type ClientRelatedBirthProfileUpsertRequest,
  type RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import { CLIENT_PROFILE_READER, CLIENT_PROFILE_STORE } from "./client-profile.tokens";

export type ClientProfileReader = {
  readonly listRelatedAstrologers: (clientUserId: string) => Promise<RelatedAstrologerListResponse>;
  readonly findBirthData: (clientUserId: string) => Promise<ClientBirthData | null>;
  readonly listRelatedBirthProfiles: (
    clientUserId: string
  ) => Promise<readonly ClientRelatedBirthProfile[]>;
};

@Injectable()
export class ClientProfileService {
  constructor(
    @Inject(CLIENT_PROFILE_READER)
    private readonly reader: ClientProfileReader,
    @Inject(CLIENT_PROFILE_STORE)
    private readonly store: Pick<ClientStore, "writeClientBirthProfile"> &
      Pick<ClientRelatedBirthProfileStore, "writeClientRelatedBirthProfile">,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async listRelatedAstrologers(clientUserId: string): Promise<RelatedAstrologerListResponse> {
    return relatedAstrologerListResponseSchema.parse(
      await this.reader.listRelatedAstrologers(clientUserId)
    );
  }

  async getBirthData(clientUserId: string): Promise<ClientBirthDataResponse | null> {
    const birthData = await this.reader.findBirthData(clientUserId);
    return birthData ? clientBirthDataResponseSchema.parse(birthData) : null;
  }

  async listRelatedBirthProfiles(
    clientUserId: string
  ): Promise<ClientRelatedBirthProfileListResponse> {
    return clientRelatedBirthProfileListResponseSchema.parse({
      profiles: await this.reader.listRelatedBirthProfiles(clientUserId)
    });
  }

  async getOverview(clientUserId: string): Promise<ClientCabinetOverviewResponse> {
    const [related, birthData, relatedBirthProfiles] = await Promise.all([
      this.listRelatedAstrologers(clientUserId),
      this.getBirthData(clientUserId),
      this.listRelatedBirthProfiles(clientUserId)
    ]);

    return clientCabinetOverviewResponseSchema.parse({
      astrologers: related.astrologers,
      birthData,
      relatedBirthProfiles: relatedBirthProfiles.profiles,
      summary: {
        directLinkOnly: true,
        upcomingBookingCount: 0,
        availableMaterialCount: 0,
        unreadNotificationCount: 0,
        activeSubscriptionCount: 0
      }
    });
  }

  async upsertBirthData(
    clientUserId: string,
    input: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    const request = clientBirthDataUpsertRequestSchema.parse(input);
    try {
      const birthData = await writeClientBirthProfile({
        store: this.store,
        clientUserId,
        actor: { userId: clientUserId, role: "client" },
        expectedRevision: request.expectedRevision,
        data: { ...request, source: "client_profile" },
        now: this.clock.now()
      });
      return clientBirthDataResponseSchema.parse(birthData);
    } catch (error) {
      if (error instanceof ClientBirthDataRevisionConflictError) {
        throw new ConflictException({
          code: "CLIENT_BIRTH_DATA_REVISION_CONFLICT",
          message: "Birth data was changed by another actor. Refresh and try again."
        });
      }
      throw error;
    }
  }

  async createRelatedBirthProfile(
    clientUserId: string,
    input: ClientRelatedBirthProfileUpsertRequest
  ): Promise<ClientRelatedBirthProfileResponse> {
    return this.writeRelatedBirthProfile(clientUserId, null, input);
  }

  async updateRelatedBirthProfile(
    clientUserId: string,
    relatedProfileId: string,
    input: ClientRelatedBirthProfileUpsertRequest
  ): Promise<ClientRelatedBirthProfileResponse> {
    const params = clientRelatedBirthProfileParamsSchema.parse({ clientUserId, relatedProfileId });

    return this.writeRelatedBirthProfile(params.clientUserId, params.relatedProfileId, input);
  }

  private async writeRelatedBirthProfile(
    clientUserId: string,
    relatedProfileId: string | null,
    input: ClientRelatedBirthProfileUpsertRequest
  ): Promise<ClientRelatedBirthProfileResponse> {
    const request = clientRelatedBirthProfileUpsertRequestSchema.parse(input);
    try {
      const profile = await writeClientRelatedBirthProfile({
        store: this.store,
        clientUserId,
        relatedProfileId,
        actor: { userId: clientUserId, role: "client" },
        expectedRevision: request.expectedRevision,
        data: { ...request, source: "client_profile" },
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
      if (error instanceof ClientRelatedBirthProfileNotFoundError) {
        throw new NotFoundException({
          code: "CLIENT_RELATED_BIRTH_PROFILE_NOT_FOUND",
          message: "Related birth profile was not found."
        });
      }
      throw error;
    }
  }
}
