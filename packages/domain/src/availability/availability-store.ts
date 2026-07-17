import type {
  AvailabilityDateOverride,
  AvailabilitySchedule,
  AvailabilityWeeklyPeriod,
  ProjectionContext
} from "./availability-types";

export type AvailabilityStoreReplaceInput = {
  readonly ownerUserId: string;
  readonly scheduleId: string;
  readonly expectedVersion: number;
  readonly timeZone: string;
  readonly startIntervalMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minimumNoticeMinutes: number;
  readonly bookingHorizonDays: number;
  readonly maximumBookingsPerDay: number | null;
  readonly weeklyPeriods: readonly AvailabilityWeeklyPeriod[];
  readonly dateOverrides: readonly AvailabilityDateOverride[];
  readonly productIds: readonly string[];
  readonly now: string;
};

export type AvailabilityStoreReplaceResult =
  | { readonly kind: "updated"; readonly schedule: AvailabilitySchedule }
  | { readonly kind: "not_found" }
  | { readonly kind: "version_conflict"; readonly currentVersion: number };

export type AvailabilityStore = {
  readonly findDefaultByOwner: (input: {
    readonly ownerUserId: string;
  }) => Promise<AvailabilitySchedule | null>;
  readonly replace: (
    input: AvailabilityStoreReplaceInput
  ) => Promise<AvailabilityStoreReplaceResult>;
  readonly readProjectionContext: (input: {
    readonly ownerUserId: string;
    readonly scheduleId: string;
    readonly rangeStartAt: string;
    readonly rangeEndAt: string;
  }) => Promise<ProjectionContext | null>;
};

export type AvailabilityProductReader = {
  readonly findBookableProductIds: (input: {
    readonly ownerUserId: string;
    readonly productIds: readonly string[];
  }) => Promise<readonly string[]>;
};
