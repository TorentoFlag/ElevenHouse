export type AstrologerProfile = {
  readonly ownerUserId: string;
  readonly publicHandle: string;
  readonly publicName: string;
  readonly headline: string | null;
  readonly bio: string | null;
  readonly timezone: string;
  readonly locale: string;
  readonly avatarMediaId: string | null;
  readonly coverMediaId: string | null;
  readonly consultationLanguages: readonly string[];
  readonly isPublicPageEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AstrologerProfileEditableFields = {
  readonly publicHandle: string;
  readonly publicName: string;
  readonly headline: string | null;
  readonly bio: string | null;
  readonly timezone: string;
  readonly locale: string;
  readonly avatarMediaId: string | null;
  readonly coverMediaId: string | null;
  readonly consultationLanguages: readonly string[];
  readonly isPublicPageEnabled: boolean;
};

export type AstrologerProfileUpsertInput = AstrologerProfileEditableFields;

export type AstrologerProfileUpdatePatch = Partial<AstrologerProfileEditableFields>;
