import { Inject, Injectable } from "@nestjs/common";
import type { ClientBirthData, ClientStore } from "@elevenhouse/domain";
import { upsertClientBirthData } from "@elevenhouse/domain";
import {
  clientBirthDataResponseSchema,
  clientBirthDataUpsertRequestSchema,
  relatedAstrologerListResponseSchema,
  type ClientBirthDataResponse,
  type ClientBirthDataUpsertRequest,
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
    private readonly store: Pick<ClientStore, "upsertClientBirthData">,
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
}
