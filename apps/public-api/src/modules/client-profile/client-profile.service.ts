import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { ClientBirthData, ClientStore } from "@elevenhouse/domain";
import { ClientBirthDataRevisionConflictError, writeClientBirthProfile } from "@elevenhouse/domain";
import {
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientCabinetOverviewResponseSchema,
  relatedAstrologerListResponseSchema,
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
};

@Injectable()
export class ClientProfileService {
  constructor(
    @Inject(CLIENT_PROFILE_READER)
    private readonly reader: ClientProfileReader,
    @Inject(CLIENT_PROFILE_STORE)
    private readonly store: Pick<ClientStore, "writeClientBirthProfile">,
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

  async getOverview(clientUserId: string): Promise<ClientCabinetOverviewResponse> {
    const [related, birthData] = await Promise.all([
      this.listRelatedAstrologers(clientUserId),
      this.getBirthData(clientUserId)
    ]);

    return clientCabinetOverviewResponseSchema.parse({
      astrologers: related.astrologers,
      birthData,
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
}
