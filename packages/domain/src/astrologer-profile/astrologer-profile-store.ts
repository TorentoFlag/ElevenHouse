import type {
  AstrologerProfile,
  AstrologerProfileUpdatePatch,
  AstrologerProfileUpsertInput
} from "./astrologer-profile-types";

export type AstrologerProfileStoreUpsertInput = AstrologerProfileUpsertInput & {
  readonly ownerUserId: string;
  readonly now: string;
};

export type AstrologerProfileStore = {
  readonly findByOwnerUserId: (input: {
    readonly ownerUserId: string;
  }) => Promise<AstrologerProfile | null>;
  readonly upsert: (input: AstrologerProfileStoreUpsertInput) => Promise<AstrologerProfile>;
  readonly update: (input: {
    readonly ownerUserId: string;
    readonly patch: AstrologerProfileUpdatePatch;
    readonly now: string;
  }) => Promise<AstrologerProfile | null>;
};
