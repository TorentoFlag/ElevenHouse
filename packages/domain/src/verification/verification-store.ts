import type {
  AstrologerVerificationApplication,
  VerificationDocumentKind
} from "./verification-types";

export type VerificationApplicationStoreDocumentInput = {
  readonly id: string;
  readonly kind: VerificationDocumentKind;
  readonly mediaId: string;
};

export type VerificationApplicationStoreCreateInput = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly documents: readonly VerificationApplicationStoreDocumentInput[];
  readonly now: string;
};

export type VerificationApplicationStore = {
  readonly findLatestByOwner: (input: {
    readonly ownerUserId: string;
  }) => Promise<AstrologerVerificationApplication | null>;
  readonly create: (
    input: VerificationApplicationStoreCreateInput
  ) => Promise<AstrologerVerificationApplication>;
};
