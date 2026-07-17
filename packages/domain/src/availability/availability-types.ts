export type AvailabilityWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type AvailabilityLocalPeriod = {
  readonly startMinute: number;
  readonly endMinute: number;
};

export type AvailabilityWeeklyPeriod = AvailabilityLocalPeriod & {
  readonly weekday: AvailabilityWeekday;
};

export type AvailabilityDateOverride = {
  readonly date: string;
  readonly mode: "available" | "unavailable";
  readonly periods: readonly AvailabilityLocalPeriod[];
};

export type AvailabilitySchedule = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly isDefault: boolean;
  readonly version: number;
  readonly startIntervalMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly minimumNoticeMinutes: number;
  readonly bookingHorizonDays: number;
  readonly maximumBookingsPerDay: number | null;
  readonly weeklyPeriods: readonly AvailabilityWeeklyPeriod[];
  readonly dateOverrides: readonly AvailabilityDateOverride[];
  readonly productIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ActiveScheduleReservation = {
  readonly occupiedStartAt: string;
  readonly occupiedEndAt: string;
};

export type ProjectionContext = {
  readonly schedule: AvailabilitySchedule;
  readonly activeReservations: readonly ActiveScheduleReservation[];
  readonly confirmedBookingCountByLocalDate: Readonly<Record<string, number>>;
};

export type ProjectAvailableSlotsInput = {
  readonly context: ProjectionContext;
  readonly productDurationMinutes: number;
  readonly rangeStartAt: string;
  readonly rangeEndAt: string;
  readonly now: string;
};

export type ProjectedAvailabilitySlot = {
  readonly localDate: string;
  readonly localStartMinute: number;
  readonly serviceStartAt: string;
  readonly serviceEndAt: string;
  readonly occupiedStartAt: string;
  readonly occupiedEndAt: string;
};

export type EvaluateProjectedStartInput = {
  readonly context: ProjectionContext;
  readonly productDurationMinutes: number;
  readonly projectedStartAt: string;
  readonly now: string;
};

export type ProjectedStartEvaluation =
  | { readonly kind: "available"; readonly slot: ProjectedAvailabilitySlot }
  | { readonly kind: "outside_availability" }
  | { readonly kind: "notice_violation" }
  | { readonly kind: "horizon_violation" }
  | { readonly kind: "daily_limit_reached" }
  | { readonly kind: "occupied" };
