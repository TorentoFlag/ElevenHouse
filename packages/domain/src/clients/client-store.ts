import type {
  AstrologerClientList,
  AstrologerClientListItem,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientBirthDataEditorRole,
  ClientJoinIntent,
  ClientRelatedBirthProfile,
  ClientRelationshipSource,
  NormalizedClientBirthDataInput,
  NormalizedClientRelatedBirthProfileInput
} from "./client-types";
import type {
  ClientLifecycleCauseKind,
  ClientLifecycleStatus,
  ClientLifecycleTransitionDecision
} from "./client-lifecycle";

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

export type ClientStoreWriteBirthProfileInput = {
  readonly clientUserId: string;
  readonly actor: {
    readonly userId: string;
    readonly role: ClientBirthDataEditorRole;
  };
  readonly expectedRevision: number | null;
  readonly data: NormalizedClientBirthDataInput;
  readonly now: string;
};

export type ClientStoreWriteBirthProfileResult =
  | { readonly kind: "written"; readonly profile: ClientBirthData }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_related" };

export type ClientStoreWriteRelatedBirthProfileInput = {
  readonly clientUserId: string;
  readonly relatedProfileId: string | null;
  readonly actor: {
    readonly userId: string;
    readonly role: ClientBirthDataEditorRole;
  };
  readonly expectedRevision: number | null;
  readonly data: NormalizedClientRelatedBirthProfileInput;
  readonly now: string;
};

export type ClientStoreWriteRelatedBirthProfileResult =
  | { readonly kind: "written"; readonly profile: ClientRelatedBirthProfile }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_related" };

export type ClientStoreListRelatedBirthProfilesInput = {
  readonly clientUserId: string;
};

export type ClientStoreGetAstrologerRelatedBirthProfileInput = {
  readonly astrologerUserId: string;
  readonly clientUserId: string;
  readonly relatedProfileId: string;
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

export type ClientLifecycleTransitionStoreInput = {
  readonly relationshipId: string;
  readonly sourceEventId: string;
  readonly cause: {
    readonly kind: ClientLifecycleCauseKind;
    readonly occurredAt: string;
    readonly manualStatus?: ClientLifecycleStatus;
  };
  readonly actorUserId: string | null;
};

export type ClientLifecycleTransitionStoreResult = {
  readonly replayed: boolean;
  readonly decision: ClientLifecycleTransitionDecision;
  readonly revision: number;
  readonly lastActivityAt: string;
};

export type ClientLifecycleStore = {
  readonly applyTransition: (
    input: ClientLifecycleTransitionStoreInput
  ) => Promise<ClientLifecycleTransitionStoreResult>;
};

export type ClientJoinIntentClaimStore = {
  readonly findJoinIntentByTokenHash: (input: {
    readonly tokenHash: string;
  }) => Promise<ClientJoinIntent | null>;
  /**
   * Atomically marks an unexpired pending intent for this client, or returns the
   * same client's existing claim. Returns null when another claimant won.
   */
  readonly markJoinIntentClaimed: (input: {
    readonly intentId: string;
    readonly clientUserId: string;
    readonly now: string;
  }) => Promise<ClientJoinIntent | null>;
  readonly ensureRelationship: (
    input: ClientStoreEnsureRelationshipInput
  ) => Promise<ClientAstrologerRelationship>;
};

export type ClientRelatedBirthProfileStore = {
  readonly writeClientRelatedBirthProfile: (
    input: ClientStoreWriteRelatedBirthProfileInput
  ) => Promise<ClientStoreWriteRelatedBirthProfileResult>;
  readonly listClientRelatedBirthProfiles: (
    input: ClientStoreListRelatedBirthProfilesInput
  ) => Promise<readonly ClientRelatedBirthProfile[]>;
  readonly getAstrologerRelatedBirthProfile: (
    input: ClientStoreGetAstrologerRelatedBirthProfileInput
  ) => Promise<ClientRelatedBirthProfile | null>;
};

export type ClientStore = ClientJoinIntentClaimStore & {
  readonly createJoinIntent: (input: ClientStoreCreateJoinIntentInput) => Promise<ClientJoinIntent>;
  readonly upsertClientProfile: (input: ClientStoreUpsertProfileInput) => Promise<void>;
  readonly writeClientBirthProfile: (
    input: ClientStoreWriteBirthProfileInput
  ) => Promise<ClientStoreWriteBirthProfileResult>;
  readonly writeClientRelatedBirthProfile?: ClientRelatedBirthProfileStore["writeClientRelatedBirthProfile"];
  readonly listClientRelatedBirthProfiles?: ClientRelatedBirthProfileStore["listClientRelatedBirthProfiles"];
  readonly getAstrologerRelatedBirthProfile?: ClientRelatedBirthProfileStore["getAstrologerRelatedBirthProfile"];
  readonly listAstrologerClients: (
    input: ClientStoreListAstrologerClientsInput
  ) => Promise<AstrologerClientList>;
  readonly getAstrologerClient: (
    input: ClientStoreGetAstrologerClientInput
  ) => Promise<AstrologerClientListItem | null>;
};
