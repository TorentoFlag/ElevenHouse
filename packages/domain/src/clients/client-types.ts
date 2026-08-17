import { z } from "@elevenhouse/validation";
import type { ClientLifecycleMode, ClientLifecycleStatus } from "./client-lifecycle";

export type ClientBirthTimePrecision = "exact" | "approximate" | "unknown";
export type ClientBirthTimeDstOccurrence = "first" | "second";

export type ClientBirthDataSource = "client_profile" | "import" | "manual";
export type ClientBirthDataEditorRole = "client" | "astrologer";

export const CLIENT_BIRTH_PROFILE_UPDATED_EVENT = "client.birth_profile.updated.v1";
export const CLIENT_RELATED_BIRTH_PROFILE_UPDATED_EVENT = "client.related_birth_profile.updated.v1";

/**
 * Redacted lifecycle notification for a singleton birth-profile revision.
 * The profile data itself stays in the profile/history tables and never crosses
 * the outbox boundary.
 */
export const clientBirthProfileUpdatedEventSchema = z
  .object({
    schemaVersion: z.literal("client-birth-profile-updated.v1"),
    birthDataHistoryId: z.string().uuid(),
    birthDataId: z.string().uuid(),
    clientUserId: z.string().uuid(),
    revision: z.number().int().positive(),
    actorUserId: z.string().uuid(),
    actorRole: z.enum(["client", "astrologer"]),
    occurredAt: z.string().datetime({ offset: true })
  })
  .strict();
export type ClientBirthProfileUpdatedEvent = z.infer<typeof clientBirthProfileUpdatedEventSchema>;

export const clientRelatedBirthProfileUpdatedEventSchema = z
  .object({
    schemaVersion: z.literal("client-related-birth-profile-updated.v1"),
    relatedProfileHistoryId: z.string().uuid(),
    relatedProfileId: z.string().uuid(),
    clientUserId: z.string().uuid(),
    revision: z.number().int().positive(),
    actorUserId: z.string().uuid(),
    actorRole: z.enum(["client", "astrologer"]),
    occurredAt: z.string().datetime({ offset: true })
  })
  .strict();
export type ClientRelatedBirthProfileUpdatedEvent = z.infer<
  typeof clientRelatedBirthProfileUpdatedEventSchema
>;

export type ClientRelationshipSource =
  | "direct_link"
  | "booking"
  | "order"
  | "lead_magnet"
  | "manual";

export type ClientRelationshipStatus = "active" | "archived" | "blocked";

export type ClientLifecycle = {
  readonly relationshipId: string;
  readonly status: ClientLifecycleStatus;
  readonly mode: ClientLifecycleMode;
  readonly latestAutomaticCandidateStatus: ClientLifecycleStatus | null;
  readonly revision: number;
  readonly lastActivityAt: string;
  readonly updatedAt: string;
};

export type ClientJoinIntentStatus = "pending" | "claimed" | "expired";

export type ClientBirthDataInput = {
  readonly label?: string | null;
  readonly birthDate?: string | null;
  readonly birthTime?: string | null;
  readonly birthTimePrecision?: ClientBirthTimePrecision | null;
  readonly birthPlaceText?: string | null;
  readonly birthCountryCode?: string | null;
  readonly birthCity?: string | null;
  readonly birthRegion?: string | null;
  readonly birthTimezone?: string | null;
  readonly birthTimeDstOccurrence?: ClientBirthTimeDstOccurrence | null;
  readonly birthLatitude?: number | null;
  readonly birthLongitude?: number | null;
  readonly source: ClientBirthDataSource;
};

export type NormalizedClientBirthDataInput = {
  readonly label: string | null;
  readonly birthDate: string | null;
  readonly birthTime: string | null;
  readonly birthTimePrecision: ClientBirthTimePrecision;
  readonly birthPlaceText: string | null;
  readonly birthCountryCode: string | null;
  readonly birthCity: string | null;
  readonly birthRegion: string | null;
  readonly birthTimezone: string | null;
  readonly birthTimeDstOccurrence: ClientBirthTimeDstOccurrence | null;
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
  readonly source: ClientBirthDataSource;
};

export type ClientBirthData = NormalizedClientBirthDataInput & {
  readonly id: string;
  readonly clientUserId: string;
  readonly revision: number;
  readonly lastEditedByUserId: string;
  readonly lastEditedByRole: ClientBirthDataEditorRole;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ClientRelatedBirthProfileInput = ClientBirthDataInput & {
  readonly displayName: string;
  readonly relationshipLabel: string;
};

export type NormalizedClientRelatedBirthProfileInput = NormalizedClientBirthDataInput & {
  readonly displayName: string;
  readonly relationshipLabel: string;
};

export type ClientRelatedBirthProfile = Omit<ClientBirthData, "label"> & {
  readonly displayName: string;
  readonly relationshipLabel: string;
};

export type ClientProfile = {
  readonly userId: string;
  readonly displayNameSnapshot: string | null;
  readonly preferredLocale: string | null;
  readonly timezone: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ClientAstrologerRelationship = {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly source: ClientRelationshipSource;
  readonly status: ClientRelationshipStatus;
  readonly firstLinkedAt: string;
  readonly lastLinkedAt: string;
  readonly archivedAt: string | null;
  readonly blockedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ClientJoinIntent = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly tokenHash: string;
  readonly publicHandleSnapshot: string;
  readonly status: ClientJoinIntentStatus;
  readonly expiresAt: string;
  readonly claimedByClientUserId: string | null;
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ClientJoinIntentCreated = ClientJoinIntent & {
  readonly token: string;
};

export type AstrologerClientListItem = {
  readonly clientUserId: string;
  readonly displayName: string | null;
  readonly relationshipStatus: ClientRelationshipStatus;
  readonly firstLinkedAt: string;
  readonly lastLinkedAt: string;
  readonly birthData: ClientBirthData | null;
  readonly relatedBirthProfiles?: readonly ClientRelatedBirthProfile[];
};

export type AstrologerClientList = {
  readonly clients: readonly AstrologerClientListItem[];
  readonly total: number;
};
