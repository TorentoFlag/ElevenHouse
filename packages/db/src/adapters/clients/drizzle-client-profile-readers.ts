import { and, desc, eq } from "drizzle-orm";
import type { ClientBirthData } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  astrologerProfiles,
  clientAstrologerRelationships,
  clientBirthData
} from "../../schema";

type ClientBirthDataRow = typeof clientBirthData.$inferSelect;

export function createDrizzleClientJoinProfileReader(database: ElevenHouseDatabase) {
  return {
    findPublishedByPublicHandle: async ({ publicHandle }: { readonly publicHandle: string }) => {
      const [profile] = await database
        .select({
          ownerUserId: astrologerProfiles.ownerUserId,
          publicHandle: astrologerProfiles.publicHandle,
          publicName: astrologerProfiles.publicName
        })
        .from(astrologerProfiles)
        .where(
          and(
            eq(astrologerProfiles.publicHandle, publicHandle),
            eq(astrologerProfiles.visibilityStatus, "published")
          )
        )
        .limit(1);

      return profile ?? null;
    }
  };
}

export function createDrizzleClientProfileReader(database: ElevenHouseDatabase) {
  return {
    listRelatedAstrologers: async (clientUserId: string) => {
      const rows = await database
        .select({
          relationship: clientAstrologerRelationships,
          profile: astrologerProfiles
        })
        .from(clientAstrologerRelationships)
        .innerJoin(
          astrologerProfiles,
          eq(astrologerProfiles.ownerUserId, clientAstrologerRelationships.astrologerUserId)
        )
        .where(
          and(
            eq(clientAstrologerRelationships.clientUserId, clientUserId),
            eq(clientAstrologerRelationships.status, "active")
          )
        )
        .orderBy(
          desc(clientAstrologerRelationships.lastLinkedAt),
          desc(clientAstrologerRelationships.id)
        );

      return {
        astrologers: rows.map(({ relationship, profile }) => ({
          astrologerUserId: relationship.astrologerUserId,
          publicHandle: profile.publicHandle,
          publicName: profile.publicName,
          relationshipStatus: relationship.status as "active",
          firstLinkedAt: toIsoString(relationship.firstLinkedAt),
          lastLinkedAt: toIsoString(relationship.lastLinkedAt)
        }))
      };
    },
    findBirthData: async (clientUserId: string): Promise<ClientBirthData | null> => {
      const [row] = await database
        .select()
        .from(clientBirthData)
        .where(eq(clientBirthData.clientUserId, clientUserId))
        .limit(1);

      return row ? toClientBirthData(row) : null;
    }
  };
}

function toClientBirthData(row: ClientBirthDataRow): ClientBirthData {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    label: row.label,
    birthDate: row.birthDate,
    birthTime: row.birthTime,
    birthTimePrecision: row.birthTimePrecision as ClientBirthData["birthTimePrecision"],
    birthPlaceText: row.birthPlaceText,
    birthCountryCode: row.birthCountryCode,
    birthCity: row.birthCity,
    birthRegion: row.birthRegion,
    birthTimezone: row.birthTimezone,
    birthTimeDstOccurrence:
      row.birthTimeDstOccurrence as ClientBirthData["birthTimeDstOccurrence"],
    birthLatitude: row.birthLatitude,
    birthLongitude: row.birthLongitude,
    source: row.source as ClientBirthData["source"],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
