import { Temporal } from "@js-temporal/polyfill";
import type { ProductDeliveryFormat } from "../products";
import { normalizeRequiredString } from "../shared";

const maximumRangeNanoseconds = 93n * 24n * 60n * 60n * 1_000_000_000n;

export type CalendarRangeEntry = {
  readonly id: string;
  readonly kind: "booking" | "manual_block";
  readonly startAt: string;
  readonly endAt: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly deliveryFormat: ProductDeliveryFormat | null;
  readonly displayStatus: "confirmed" | "blocked";
};

export type CalendarRangeReadModel = {
  readonly entries: readonly CalendarRangeEntry[];
  readonly summary: {
    readonly bookingCount: number;
    readonly bookedMinutes: number;
    readonly byDisplayStatus: Readonly<Partial<Record<"confirmed" | "blocked", number>>>;
  };
};

export type CalendarReadStore = {
  readonly readRange: (input: {
    readonly ownerUserId: string;
    readonly startAt: string;
    readonly endAt: string;
  }) => Promise<CalendarRangeReadModel>;
};

export class CalendarRangeValidationError extends Error {
  readonly code = "calendar_range_validation_error";

  constructor(message: string) {
    super(message);
    this.name = "CalendarRangeValidationError";
  }
}

export async function readCalendarRange(input: {
  readonly store: CalendarReadStore;
  readonly ownerUserId: string;
  readonly startAt: string;
  readonly endAt: string;
}): Promise<CalendarRangeReadModel> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Calendar owner is required");
  const startAt = parseInstant(input.startAt);
  const endAt = parseInstant(input.endAt);
  const duration = endAt.epochNanoseconds - startAt.epochNanoseconds;
  if (duration <= 0n || duration > maximumRangeNanoseconds) {
    throw new CalendarRangeValidationError("Calendar range is invalid");
  }
  return input.store.readRange({
    ownerUserId,
    startAt: startAt.toString(),
    endAt: endAt.toString()
  });
}

function parseInstant(value: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new CalendarRangeValidationError("Calendar range instant is invalid");
  }
}
