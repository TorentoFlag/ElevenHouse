import { eq } from "drizzle-orm";
import {
  AstrologerProfileHandleConflictError,
  type AstrologerProfile,
  type AstrologerProfileStore,
  type AstrologerProfileStoreUpsertInput,
  type AstrologerProfileUpdatePatch
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
      }),
    update: async (input) =>
      mapAstrologerProfileConflict(input.patch.publicHandle, async () => {
        const [row] = await database
          .update(astrologerProfiles)
          .set(toAstrologerProfileUpdateRow(input.patch, input.now))
          .where(eq(astrologerProfiles.ownerUserId, input.ownerUserId))
          .returning();

        return row ? toAstrologerProfile(row) : null;
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
    isPublicPageEnabled: input.isPublicPageEnabled,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now)
  };
}

function toAstrologerProfileUpdateRow(
  patch: AstrologerProfileUpdatePatch,
  now: string
): AstrologerProfileUpdateRow {
  return omitUndefined({
    publicHandle: patch.publicHandle,
    publicName: patch.publicName,
    headline: patch.headline,
    bio: patch.bio,
    timezone: patch.timezone,
    locale: patch.locale,
    avatarMediaId: patch.avatarMediaId,
    coverMediaId: patch.coverMediaId,
    consultationLanguages:
      patch.consultationLanguages === undefined ? undefined : [...patch.consultationLanguages],
    isPublicPageEnabled: patch.isPublicPageEnabled,
    updatedAt: new Date(now)
  });
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
    isPublicPageEnabled: row.isPublicPageEnabled,
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

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
