import type {
  AstrologerClientList,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientJoinIntent,
  ClientRelationshipSource,
  NormalizedClientBirthDataInput
} from "./client-types";

export type ClientStoreCreateJoinIntentInput = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly tokenHash: string;
  readonly publicHandleSnapshot: string;
  readonly expiresAt: string;
  readonly now: string;
};

export type ClientStoreEnsureRelationshipInput = {
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly source: ClientRelationshipSource;
  readonly now: string;
};

export type ClientStoreUpsertProfileInput = {
  readonly userId: string;
  readonly displayNameSnapshot: string | null;
  readonly preferredLocale: string | null;
  readonly timezone: string | null;
  readonly now: string;
};

export type ClientStoreUpsertBirthDataInput = {
  readonly clientUserId: string;
  readonly data: NormalizedClientBirthDataInput;
  readonly now: string;
};

export type ClientStoreListAstrologerClientsInput = {
  readonly astrologerUserId: string;
  readonly query: string;
  readonly limit: number;
  readonly offset: number;
};

export type ClientStore = {
  readonly createJoinIntent: (
    input: ClientStoreCreateJoinIntentInput
  ) => Promise<ClientJoinIntent>;
  readonly findJoinIntentByTokenHash: (input: {
    readonly tokenHash: string;
  }) => Promise<ClientJoinIntent | null>;
  readonly markJoinIntentClaimed: (input: {
    readonly intentId: string;
    readonly clientUserId: string;
    readonly now: string;
  }) => Promise<ClientJoinIntent | null>;
  readonly ensureRelationship: (
    input: ClientStoreEnsureRelationshipInput
  ) => Promise<ClientAstrologerRelationship>;
  readonly upsertClientProfile: (input: ClientStoreUpsertProfileInput) => Promise<void>;
  readonly upsertClientBirthData: (
    input: ClientStoreUpsertBirthDataInput
  ) => Promise<ClientBirthData>;
  readonly listAstrologerClients: (
    input: ClientStoreListAstrologerClientsInput
  ) => Promise<AstrologerClientList>;
};
