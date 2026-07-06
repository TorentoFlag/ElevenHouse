export type ClientBirthTimePrecision = "exact" | "approximate" | "unknown";

export type ClientBirthDataSource = "client_profile" | "booking" | "import" | "manual";

export type ClientRelationshipSource =
  | "direct_link"
  | "booking"
  | "order"
  | "lead_magnet"
  | "manual";

export type ClientRelationshipStatus = "active" | "archived" | "blocked";

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
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
  readonly source: ClientBirthDataSource;
};

export type ClientBirthData = NormalizedClientBirthDataInput & {
  readonly id: string;
  readonly clientUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
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
};

export type AstrologerClientList = {
  readonly clients: readonly AstrologerClientListItem[];
  readonly total: number;
};
