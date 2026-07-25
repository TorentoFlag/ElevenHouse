import type {
  AstroCalendarGenerationStatus,
  AstroCalendarReadinessSummary,
  AstroCalendarWarning
} from "./astro-calendar-types";

export type AstroCalendarGenerationRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly status: AstroCalendarGenerationStatus;
  readonly inputFingerprint: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly timeZone: string;
  readonly requestSnapshot: unknown;
  readonly settingsSnapshot: unknown;
  readonly readinessSummary: AstroCalendarReadinessSummary;
  readonly summary: unknown;
  readonly warnings: readonly AstroCalendarWarning[];
  readonly provider: unknown | null;
  readonly generatedAt: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AstroCalendarStoredEvent = {
  readonly id: string;
  readonly generationId: string;
  readonly ownerUserId: string;
  readonly eventId: string;
  readonly source: "global" | "client";
  readonly type:
    | "global.moon_phase"
    | "global.eclipse"
    | "global.ingress"
    | "client.birthday"
    | "client.solar_window"
    | "client.transit_aspect";
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly payload: unknown;
  readonly dictionaryCodes: readonly string[];
};

export type CreateCalculatingAstroCalendarGenerationInput = {
  readonly ownerUserId: string;
  readonly inputFingerprint: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly timeZone: string;
  readonly requestSnapshot: unknown;
  readonly settingsSnapshot: unknown;
  readonly readinessSummary: AstroCalendarReadinessSummary;
  readonly warnings: readonly AstroCalendarWarning[];
  readonly now: string;
};

export type MarkAstroCalendarGenerationReadyInput = {
  readonly ownerUserId: string;
  readonly generationId: string;
  readonly provider: unknown;
  readonly readinessSummary: AstroCalendarReadinessSummary;
  readonly summary: unknown;
  readonly warnings: readonly AstroCalendarWarning[];
  readonly events: readonly Omit<AstroCalendarStoredEvent, "id" | "generationId" | "ownerUserId">[];
  readonly generatedAt: string;
  readonly now: string;
};

export type MarkAstroCalendarGenerationFailedInput = {
  readonly ownerUserId: string;
  readonly generationId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly now: string;
};

export type AstroCalendarRangeLookupInput = {
  readonly ownerUserId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly timeZone: string;
};

export type AstroCalendarGenerationWithEvents = {
  readonly generation: AstroCalendarGenerationRecord;
  readonly events: readonly AstroCalendarStoredEvent[];
};

export type AstroCalendarGenerationStore = {
  readonly createCalculating: (
    input: CreateCalculatingAstroCalendarGenerationInput
  ) => Promise<AstroCalendarGenerationRecord>;
  readonly findByFingerprint: (input: {
    readonly ownerUserId: string;
    readonly inputFingerprint: string;
  }) => Promise<AstroCalendarGenerationWithEvents | null>;
  readonly findById: (input: {
    readonly generationId: string;
  }) => Promise<AstroCalendarGenerationWithEvents | null>;
  readonly findLatestForRange: (
    input: AstroCalendarRangeLookupInput
  ) => Promise<AstroCalendarGenerationWithEvents | null>;
  readonly markReady: (
    input: MarkAstroCalendarGenerationReadyInput
  ) => Promise<AstroCalendarGenerationWithEvents | null>;
  readonly markFailed: (
    input: MarkAstroCalendarGenerationFailedInput
  ) => Promise<AstroCalendarGenerationRecord | null>;
  readonly markCalculating: (input: {
    readonly ownerUserId: string;
    readonly generationId: string;
    readonly now: string;
  }) => Promise<AstroCalendarGenerationRecord | null>;
  readonly markStaleByOwner: (input: {
    readonly ownerUserId: string;
    readonly now: string;
  }) => Promise<number>;
};
