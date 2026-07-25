import type { CanonicalJson } from "../calculations/canonical-json";

export type AstroCalendarEventType =
  | "global.moon_phase"
  | "global.eclipse"
  | "global.ingress"
  | "client.birthday"
  | "client.solar_window"
  | "client.transit_aspect";

export type AstroCalendarWarningCode =
  | "NO_PROFILE_TIMEZONE"
  | "CLIENT_BIRTH_DATA_MISSING"
  | "CLIENT_BIRTH_TIME_UNKNOWN"
  | "CLIENT_BIRTH_TIME_APPROXIMATE"
  | "CLIENT_SCOPE_TRUNCATED"
  | "PROVIDER_PRECISION_LIMITED"
  | "GENERATION_FAILED"
  | "DICTIONARY_ENTRY_MISSING";

export type AstroCalendarGenerationStatus = "calculating" | "ready" | "failed" | "stale";

export type AstroCalendarSettingsFingerprintInput = {
  readonly astrologerId: string;
  readonly range: {
    readonly start: string;
    readonly end: string;
  };
  readonly timeZone: string;
  readonly clientIds: readonly string[];
  readonly eventTypes: readonly AstroCalendarEventType[];
  readonly settings: CanonicalJson;
};

export type AstroCalendarGenerationFingerprint = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly scope: "astro-calendar-generation.v1";
  readonly value: `sha256:${string}`;
};

export type AstroCalendarClientBirthDataInput = {
  readonly clientId: string;
  readonly displayName: string;
  readonly birthDate: string | null;
  readonly birthTime: string | null;
  readonly birthTimePrecision: "exact" | "approximate" | "unknown";
  readonly birthTimezone: string | null;
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
};

export type AstroCalendarClientReadiness = {
  readonly clientId: string;
  readonly displayName: string;
  readonly canUseDateOnlyEvents: boolean;
  readonly canUseTimedEvents: boolean;
  readonly warnings: readonly AstroCalendarWarningCode[];
};

export type AstroCalendarReadinessSummary = {
  readonly clientsTotal: number;
  readonly clientsReady: number;
  readonly clientsWithMissingBirthData: number;
  readonly clientsWithUnknownBirthTime: number;
  readonly clientsWithApproximateBirthTime: number;
};

export type AstroCalendarWarning = {
  readonly code: AstroCalendarWarningCode;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly clientId: string | null;
  readonly eventId: string | null;
  readonly dictionaryCode: string | null;
  readonly action: null;
};

export type AstroCalendarGenerationPlanInput = {
  readonly clients: readonly AstroCalendarClientBirthDataInput[];
};

export type AstroCalendarGenerationPlan = {
  readonly readiness: AstroCalendarReadinessSummary;
  readonly clientReadiness: readonly AstroCalendarClientReadiness[];
  readonly warnings: readonly AstroCalendarWarning[];
};
