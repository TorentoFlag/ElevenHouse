import { Inject, Injectable } from "@nestjs/common";
import type { ClientBirthData, ClientStore } from "@elevenhouse/domain";
import {
  createClientBirthDataProfile,
  updateClientBirthDataProfile,
  upsertClientBirthData
} from "@elevenhouse/domain";
import {
  clientBirthDataListResponseSchema,
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientCabinetOverviewResponseSchema,
  relatedAstrologerListResponseSchema,
  type ClientBirthDataListResponse,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest,
  type ClientCabinetOverviewResponse,
  type RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import { CLIENT_PROFILE_READER, CLIENT_PROFILE_STORE } from "./client-profile.tokens";

export type ClientProfileReader = {
  readonly listRelatedAstrologers: (clientUserId: string) => Promise<RelatedAstrologerListResponse>;
  readonly findBirthData: (clientUserId: string) => Promise<ClientBirthData | null>;
  readonly listBirthDataProfiles: (clientUserId: string) => Promise<readonly ClientBirthData[]>;
};

@Injectable()
export class ClientProfileService {
  constructor(
    @Inject(CLIENT_PROFILE_READER)
    private readonly reader: ClientProfileReader,
    @Inject(CLIENT_PROFILE_STORE)
    private readonly store: Pick<
      ClientStore,
      "upsertClientBirthData" | "createClientBirthDataProfile" | "updateClientBirthDataProfile"
    >,
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

  async listBirthProfiles(clientUserId: string): Promise<ClientBirthDataListResponse> {
    const profiles = await this.reader.listBirthDataProfiles(clientUserId);
    return clientBirthDataListResponseSchema.parse({ profiles });
  }

  async getOverview(clientUserId: string): Promise<ClientCabinetOverviewResponse> {
    const [related, profiles] = await Promise.all([
      this.listRelatedAstrologers(clientUserId),
      this.listBirthProfiles(clientUserId)
    ]);

    return clientCabinetOverviewResponseSchema.parse({
      astrologers: related.astrologers,
      birthProfiles: profiles.profiles,
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
    const birthData = await upsertClientBirthData({
      store: this.store as ClientStore,
      clientUserId,
      data: {
        ...request,
        source: "client_profile"
      },
      now: this.clock.now()
    });

    return clientBirthDataResponseSchema.parse(birthData);
  }

  async createBirthProfile(
    clientUserId: string,
    input: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    const request = clientBirthDataUpsertRequestSchema.parse(input);
    const birthData = await createClientBirthDataProfile({
      store: this.store as ClientStore,
      clientUserId,
      data: {
        ...request,
        source: "client_profile"
      },
      now: this.clock.now()
    });

    return clientBirthDataResponseSchema.parse(birthData);
  }

  async updateBirthProfile(
    clientUserId: string,
    birthDataId: string,
    input: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse | null> {
    const request = clientBirthDataUpsertRequestSchema.parse(input);
    const birthData = await updateClientBirthDataProfile({
      store: this.store as ClientStore,
      clientUserId,
      birthDataId,
      data: {
        ...request,
        source: "client_profile"
      },
      now: this.clock.now()
    });

    return birthData ? clientBirthDataResponseSchema.parse(birthData) : null;
  }
}
