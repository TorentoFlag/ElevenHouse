import { randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ClientStore } from "@elevenhouse/domain";
import { createClientJoinIntent } from "@elevenhouse/domain";
import {
  createClientJoinIntentRequestSchema,
  createClientJoinIntentResponseSchema,
  type CreateClientJoinIntentRequest,
  type CreateClientJoinIntentResponse
} from "@elevenhouse/contracts";
import type { SystemClock } from "../../common/system-clock.js";
import { hashClientJoinIntentToken } from "./client-join-token.js";
import {
  CLIENT_JOIN_OPTIONS,
  CLIENT_JOIN_PROFILE_READER,
  CLIENT_JOIN_STORE
} from "./client-join.tokens";

export type ClientJoinPublicAstrologer = {
  readonly ownerUserId: string;
  readonly publicHandle: string;
  readonly publicName: string;
};

export type ClientJoinProfileReader = {
  readonly findPublishedByPublicHandle: (input: {
    readonly publicHandle: string;
  }) => Promise<ClientJoinPublicAstrologer | null>;
};

export type ClientJoinOptions = {
  readonly ttlSeconds: number;
  readonly generateToken?: () => string;
  readonly generateId?: () => string;
};

@Injectable()
export class ClientJoinService {
  constructor(
    @Inject(CLIENT_JOIN_PROFILE_READER)
    private readonly profileReader: ClientJoinProfileReader,
    @Inject(CLIENT_JOIN_STORE)
    private readonly store: Pick<ClientStore, "createJoinIntent">,
    private readonly clock: SystemClock,
    @Inject(CLIENT_JOIN_OPTIONS)
    private readonly options: ClientJoinOptions
  ) {}

  async createJoinIntent(
    input: CreateClientJoinIntentRequest
  ): Promise<CreateClientJoinIntentResponse> {
    const request = createClientJoinIntentRequestSchema.parse(input);
    const astrologer = await this.profileReader.findPublishedByPublicHandle({
      publicHandle: request.publicHandle
    });
    if (!astrologer) {
      throw new NotFoundException("Astrologer public profile was not found");
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.ttlSeconds * 1000);
    const intent = await createClientJoinIntent({
      store: this.store as ClientStore,
      astrologerUserId: astrologer.ownerUserId,
      publicHandleSnapshot: astrologer.publicHandle,
      tokenGenerator: this.options.generateToken ?? createDefaultClientJoinToken,
      tokenHasher: hashClientJoinIntentToken,
      idGenerator: this.options.generateId ?? randomUUID,
      now,
      expiresAt
    });

    return createClientJoinIntentResponseSchema.parse({
      token: intent.token,
      astrologer: {
        userId: astrologer.ownerUserId,
        publicHandle: astrologer.publicHandle,
        publicName: astrologer.publicName
      },
      expiresAt: intent.expiresAt
    });
  }
}

function createDefaultClientJoinToken(): string {
  return `join_${randomUUID().replace(/-/g, "")}`;
}
