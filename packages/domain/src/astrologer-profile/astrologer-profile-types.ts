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
  readonly visibilityStatus: AstrologerProfileVisibilityStatus;
  readonly professionalExperienceYears: number | null;
  readonly professionalSchool: string | null;
  readonly specializations: readonly string[];
  readonly methods: readonly string[];
  readonly socialLinks: AstrologerProfileSocialLinks;
  readonly ownBirthData: AstrologerProfileOwnBirthData;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AstrologerProfileVisibilityStatus = "published" | "paused" | "draft";

export type AstrologerProfileSocialLinks = {
  readonly telegram: string | null;
  readonly instagram: string | null;
  readonly whatsapp: string | null;
  readonly website: string | null;
};

export type AstrologerProfileOwnBirthData = {
  readonly date: string | null;
  readonly time: string | null;
  readonly place: string | null;
  readonly showOnPublicPage: boolean;
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
  readonly visibilityStatus: AstrologerProfileVisibilityStatus;
  readonly professionalExperienceYears: number | null;
  readonly professionalSchool: string | null;
  readonly specializations: readonly string[];
  readonly methods: readonly string[];
  readonly socialLinks: AstrologerProfileSocialLinks;
  readonly ownBirthData: AstrologerProfileOwnBirthData;
};

export type AstrologerProfileUpsertInput = AstrologerProfileEditableFields;
