import { eq } from "drizzle-orm";
import {
  AstrologerProfileHandleConflictError,
  type AstrologerProfile,
  type AstrologerProfileStore,
  type AstrologerProfileStoreUpsertInput
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { astrologerProfiles } from "../../schema";

type AstrologerProfileRow = typeof astrologerProfiles.$inferSelect;
type AstrologerProfileInsertRow = typeof astrologerProfiles.$inferInsert;
type AstrologerProfileUpdateRow = Partial<AstrologerProfileInsertRow>;

export function createDrizzleAstrologerProfileStore(
  database: ElevenHouseDatabase
): AstrologerProfileStore {
  return {
    findByOwnerUserId: async (input) => {
      const [row] = await database
        .select()
        .from(astrologerProfiles)
        .where(eq(astrologerProfiles.ownerUserId, input.ownerUserId))
        .limit(1);

      return row ? toAstrologerProfile(row) : null;
    },
    upsert: async (input) =>
      mapAstrologerProfileConflict(input.publicHandle, async () => {
        const [row] = await database
          .insert(astrologerProfiles)
          .values(toAstrologerProfileInsertRow(input))
          .onConflictDoUpdate({
            target: astrologerProfiles.ownerUserId,
            set: toAstrologerProfileUpdateRow(input, input.now)
          })
          .returning();

        if (!row) {
          throw new Error("Expected astrologer profile upsert to return row");
        }

        return toAstrologerProfile(row);
      })
  };
}

function toAstrologerProfileInsertRow(
  input: AstrologerProfileStoreUpsertInput
): AstrologerProfileInsertRow {
  return {
    ownerUserId: input.ownerUserId,
    publicHandle: input.publicHandle,
    publicName: input.publicName,
    headline: input.headline,
    bio: input.bio,
    timezone: input.timezone,
    locale: input.locale,
    avatarMediaId: input.avatarMediaId,
    coverMediaId: input.coverMediaId,
    consultationLanguages: [...input.consultationLanguages],
    visibilityStatus: input.visibilityStatus,
    professionalExperienceYears: input.professionalExperienceYears,
    professionalSchool: input.professionalSchool,
    specializations: [...input.specializations],
    methods: [...input.methods],
    telegramHandle: input.socialLinks.telegram,
    instagramHandle: input.socialLinks.instagram,
    whatsappContact: input.socialLinks.whatsapp,
    websiteUrl: input.socialLinks.website,
    ownBirthDate: input.ownBirthData.date,
    ownBirthTime: input.ownBirthData.time,
    ownBirthPlace: input.ownBirthData.place,
    showOwnBirthDataPublic: input.ownBirthData.showOnPublicPage,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

function toAstrologerProfileUpdateRow(
  patch: AstrologerProfileStoreUpsertInput,
  now: string
): AstrologerProfileUpdateRow {
  return {
    publicHandle: patch.publicHandle,
    publicName: patch.publicName,
    headline: patch.headline,
    bio: patch.bio,
    timezone: patch.timezone,
    locale: patch.locale,
    avatarMediaId: patch.avatarMediaId,
    coverMediaId: patch.coverMediaId,
    consultationLanguages: [...patch.consultationLanguages],
    visibilityStatus: patch.visibilityStatus,
    professionalExperienceYears: patch.professionalExperienceYears,
    professionalSchool: patch.professionalSchool,
    specializations: [...patch.specializations],
    methods: [...patch.methods],
    telegramHandle: patch.socialLinks.telegram,
    instagramHandle: patch.socialLinks.instagram,
    whatsappContact: patch.socialLinks.whatsapp,
    websiteUrl: patch.socialLinks.website,
    ownBirthDate: patch.ownBirthData.date,
    ownBirthTime: patch.ownBirthData.time,
    ownBirthPlace: patch.ownBirthData.place,
    showOwnBirthDataPublic: patch.ownBirthData.showOnPublicPage,
    updatedAt: new Date(now)
  };
}

function toAstrologerProfile(row: AstrologerProfileRow): AstrologerProfile {
  return {
    ownerUserId: row.ownerUserId,
    publicHandle: row.publicHandle,
    publicName: row.publicName,
    headline: row.headline,
    bio: row.bio,
    timezone: row.timezone,
    locale: row.locale,
    avatarMediaId: row.avatarMediaId,
    coverMediaId: row.coverMediaId,
    consultationLanguages: row.consultationLanguages,
    visibilityStatus: row.visibilityStatus as AstrologerProfile["visibilityStatus"],
    professionalExperienceYears: row.professionalExperienceYears,
    professionalSchool: row.professionalSchool,
    specializations: row.specializations,
    methods: row.methods,
    socialLinks: {
      telegram: row.telegramHandle,
      instagram: row.instagramHandle,
      whatsapp: row.whatsappContact,
      website: row.websiteUrl
    },
    ownBirthData: {
      date: row.ownBirthDate,
      time: row.ownBirthTime,
      place: row.ownBirthPlace,
      showOnPublicPage: row.showOwnBirthDataPublic
    },
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

async function mapAstrologerProfileConflict<T>(
  publicHandle: string | undefined,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AstrologerProfileHandleConflictError(publicHandle ?? "unknown");
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505"
  );
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
