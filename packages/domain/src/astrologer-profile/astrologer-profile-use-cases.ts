import { normalizeRequiredString } from "../shared";
import { AstrologerProfileValidationError } from "./astrologer-profile-errors";
import type { AstrologerProfileStore } from "./astrologer-profile-store";
import type {
  AstrologerProfile,
  AstrologerProfileEditableFields,
  AstrologerProfileOwnBirthData,
  AstrologerProfileSocialLinks,
  AstrologerProfileUpsertInput,
  AstrologerProfileVisibilityStatus
} from "./astrologer-profile-types";

export function getAstrologerProfile(input: {
  readonly store: AstrologerProfileStore;
  readonly ownerUserId: string;
}): Promise<AstrologerProfile | null> {
  return input.store.findByOwnerUserId({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Astrologer owner user id is required")
  });
}

export async function upsertAstrologerProfile(input: {
  readonly store: AstrologerProfileStore;
  readonly ownerUserId: string;
  readonly input: AstrologerProfileUpsertInput;
  readonly now: Date;
}): Promise<AstrologerProfile> {
  return input.store.upsert({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Astrologer owner user id is required"),
    ...normalizeProfileFields(input.input),
    now: input.now.toISOString()
  });
}

function normalizeProfileFields(
  fields: AstrologerProfileEditableFields
): AstrologerProfileEditableFields {
  return {
    publicHandle: normalizePublicHandle(fields.publicHandle),
    publicName: normalizeRequiredString(fields.publicName, "Astrologer public name is required"),
    headline: normalizeNullableString(fields.headline),
    bio: normalizeNullableString(fields.bio),
    timezone: normalizeRequiredString(fields.timezone, "Astrologer timezone is required"),
    locale: normalizeLocale(fields.locale),
    avatarMediaId: normalizeNullableString(fields.avatarMediaId),
    coverMediaId: normalizeNullableString(fields.coverMediaId),
    consultationLanguages: normalizeConsultationLanguages(fields.consultationLanguages),
    visibilityStatus: normalizeVisibilityStatus(fields.visibilityStatus),
    professionalExperienceYears: normalizeExperienceYears(fields.professionalExperienceYears),
    professionalSchool: normalizeNullableString(fields.professionalSchool),
    specializations: normalizeOptionalStringList(fields.specializations, "specializations"),
    methods: normalizeOptionalStringList(fields.methods, "methods"),
    socialLinks: normalizeSocialLinks(fields.socialLinks),
    ownBirthData: normalizeOwnBirthData(fields.ownBirthData)
  };
}

function normalizePublicHandle(value: string): string {
  const normalized = normalizeRequiredString(
    value,
    "Astrologer public handle is required"
  ).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/.test(normalized)) {
    throw new AstrologerProfileValidationError("Astrologer public handle is invalid");
  }
  return normalized;
}

function normalizeLocale(value: string): string {
  const normalized = normalizeRequiredString(
    value,
    "Astrologer profile locale is required"
  ).toLowerCase();
  if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/.test(normalized)) {
    throw new AstrologerProfileValidationError("Astrologer profile locale is invalid");
  }
  return normalized;
}

function normalizeConsultationLanguages(values: readonly string[]): string[] {
  if (values.length === 0) {
    throw new AstrologerProfileValidationError("Astrologer consultation languages are required");
  }
  return normalizeUniqueStringList(values, "consultation languages");
}

function normalizeOptionalStringList(values: readonly string[], fieldName: string): string[] {
  return normalizeUniqueStringList(values, fieldName);
}

function normalizeUniqueStringList(values: readonly string[], fieldName: string): string[] {
  const normalized = values.map((value) =>
    normalizeRequiredString(value, `Astrologer ${fieldName} entry is required`)
  );
  const uniqueKeys = normalized.map((value) => value.toLocaleLowerCase());
  if (new Set(uniqueKeys).size !== uniqueKeys.length) {
    throw new AstrologerProfileValidationError(`Astrologer ${fieldName} must be unique`);
  }
  return normalized;
}

function normalizeVisibilityStatus(
  value: AstrologerProfileVisibilityStatus
): AstrologerProfileVisibilityStatus {
  if (value === "published" || value === "paused" || value === "draft") {
    return value;
  }
  throw new AstrologerProfileValidationError("Astrologer profile visibility status is invalid");
}

function normalizeExperienceYears(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new AstrologerProfileValidationError("Astrologer experience years are invalid");
  }
  return value;
}

function normalizeSocialLinks(value: AstrologerProfileSocialLinks): AstrologerProfileSocialLinks {
  return {
    telegram: normalizeNullableString(value.telegram),
    instagram: normalizeNullableString(value.instagram),
    whatsapp: normalizeNullableString(value.whatsapp),
    website: normalizeNullableString(value.website)
  };
}

function normalizeOwnBirthData(
  value: AstrologerProfileOwnBirthData
): AstrologerProfileOwnBirthData {
  return {
    date: normalizeNullableString(value.date),
    time: normalizeNullableString(value.time),
    place: normalizeNullableString(value.place),
    showOnPublicPage: value.showOnPublicPage
  };
}

function normalizeNullableString(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}
