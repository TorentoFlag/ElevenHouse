import type {
  AstrologerClientList,
  AstrologerClientListItem,
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

export type ClientStoreCreateBirthDataProfileInput = {
  readonly clientUserId: string;
  readonly data: NormalizedClientBirthDataInput;
  readonly now: string;
};

export type ClientStoreUpdateBirthDataProfileInput = {
  readonly clientUserId: string;
  readonly birthDataId: string;
  readonly data: NormalizedClientBirthDataInput;
  readonly now: string;
};

export type ClientStoreListAstrologerClientsInput = {
  readonly astrologerUserId: string;
  readonly query: string;
  readonly limit: number;
  readonly offset: number;
};

export type ClientStoreGetAstrologerClientInput = {
  readonly astrologerUserId: string;
  readonly clientUserId: string;
};

export type ClientJoinIntentClaimStore = {
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
};

export type ClientStore = ClientJoinIntentClaimStore & {
  readonly createJoinIntent: (input: ClientStoreCreateJoinIntentInput) => Promise<ClientJoinIntent>;
  readonly upsertClientProfile: (input: ClientStoreUpsertProfileInput) => Promise<void>;
  readonly upsertClientBirthData: (
    input: ClientStoreUpsertBirthDataInput
  ) => Promise<ClientBirthData>;
  readonly listClientBirthDataProfiles: (clientUserId: string) => Promise<readonly ClientBirthData[]>;
  readonly createClientBirthDataProfile: (
    input: ClientStoreCreateBirthDataProfileInput
  ) => Promise<ClientBirthData>;
  readonly updateClientBirthDataProfile: (
    input: ClientStoreUpdateBirthDataProfileInput
  ) => Promise<ClientBirthData | null>;
  readonly listAstrologerClients: (
    input: ClientStoreListAstrologerClientsInput
  ) => Promise<AstrologerClientList>;
  readonly getAstrologerClient: (
    input: ClientStoreGetAstrologerClientInput
  ) => Promise<AstrologerClientListItem | null>;
};
