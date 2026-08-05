import { z } from "@elevenhouse/validation";
import {
  productCurrencyValues,
  productDeliveryFormatValues
} from "@elevenhouse/validation/products";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const wallClockMinuteSchema = z.number().int().min(0).max(1_440);
const positiveMinuteSchema = z.number().int().positive().max(1_440);
const nonNegativeMinuteSchema = z.number().int().min(0).max(10_080);

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isIanaTimeZone, "Invalid IANA time zone");
export type IanaTimeZone = z.infer<typeof ianaTimeZoneSchema>;

export const isoCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isIsoCalendarDate, "Invalid calendar date");
export type IsoCalendarDate = z.infer<typeof isoCalendarDateSchema>;

export const calendarViewSchema = z.enum(["day", "week", "month"]);
export type CalendarView = z.infer<typeof calendarViewSchema>;

export const calendarDisplayStatusSchema = z.enum(["confirmed", "blocked"]);
export type CalendarDisplayStatus = z.infer<typeof calendarDisplayStatusSchema>;

const localPeriodSchema = z
  .object({
    startMinute: wallClockMinuteSchema,
    endMinute: wallClockMinuteSchema
  })
  .strict()
  .refine((period) => period.startMinute < period.endMinute, {
    message: "Period start must be before period end"
  });

const weeklyPeriodSchema = localPeriodSchema.extend({
  weekday: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7)
  ])
});

const dateOverrideSchema = z
  .object({
    date: isoCalendarDateSchema,
    mode: z.enum(["available", "unavailable"]),
    periods: z.array(localPeriodSchema).max(12)
  })
  .strict()
  .superRefine((override, context) => {
    if (override.mode === "available" && override.periods.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periods"],
        message: "Available override requires at least one period"
      });
    }

    if (override.mode === "unavailable" && override.periods.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periods"],
        message: "Unavailable override cannot contain periods"
      });
    }

    addPeriodOverlapIssues(override.periods, context, ["periods"]);
  });

const schedulePolicyFields = {
  timeZone: ianaTimeZoneSchema,
  startIntervalMinutes: positiveMinuteSchema,
  bufferBeforeMinutes: nonNegativeMinuteSchema,
  bufferAfterMinutes: nonNegativeMinuteSchema,
  minimumNoticeMinutes: z.number().int().min(0).max(525_600),
  bookingHorizonDays: z.number().int().min(1).max(730),
  maximumBookingsPerDay: z.number().int().positive().max(100).nullable()
};

const scheduleAggregateFields = {
  ...schedulePolicyFields,
  weeklyPeriods: z.array(weeklyPeriodSchema).max(84),
  dateOverrides: z.array(dateOverrideSchema).max(730),
  productIds: z.array(uuidSchema).max(500)
};

export const replaceAvailabilityScheduleRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ...scheduleAggregateFields
  })
  .strict()
  .superRefine(addScheduleAggregateIssues);
export type ReplaceAvailabilityScheduleRequest = z.infer<
  typeof replaceAvailabilityScheduleRequestSchema
>;

export const putDefaultAvailabilityScheduleRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive().nullable(),
    ...scheduleAggregateFields
  })
  .strict()
  .superRefine(addScheduleAggregateIssues);
export type PutDefaultAvailabilityScheduleRequest = z.infer<
  typeof putDefaultAvailabilityScheduleRequestSchema
>;

export const availabilityScheduleSchema = z
  .object({
    id: uuidSchema,
    name: z.string().trim().min(1).max(120),
    version: z.number().int().positive(),
    ...scheduleAggregateFields
  })
  .strict()
  .superRefine(addScheduleAggregateIssues);
export type AvailabilitySchedule = z.infer<typeof availabilityScheduleSchema>;

export const availabilityScheduleResponseSchema = z
  .object({ schedule: availabilityScheduleSchema })
  .strict();
export type AvailabilityScheduleResponse = z.infer<
  typeof availabilityScheduleResponseSchema
>;

export const calendarRangeQuerySchema = z
  .object({
    start: instantSchema,
    end: instantSchema,
    timeZone: ianaTimeZoneSchema
  })
  .strict()
  .superRefine((range, context) => {
    const start = Date.parse(range.start);
    const end = Date.parse(range.end);

    if (end <= start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Range end must be after range start"
      });
      return;
    }

    if (end - start > 93 * 24 * 60 * 60 * 1_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Calendar range cannot exceed 93 days"
      });
    }
  });
export type CalendarRangeQuery = z.infer<typeof calendarRangeQuerySchema>;

const availabilityBackgroundSchema = z
  .object({
    startAt: instantSchema,
    endAt: instantSchema
  })
  .strict()
  .refine((range) => Date.parse(range.startAt) < Date.parse(range.endAt), {
    message: "Availability end must be after start"
  });
export type AvailabilityBackground = z.infer<typeof availabilityBackgroundSchema>;

const calendarEntrySchema = z
  .object({
    id: uuidSchema,
    kind: z.enum(["booking", "manual_block"]),
    startAt: instantSchema,
    endAt: instantSchema,
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().min(1).max(200).nullable(),
    deliveryFormat: z.enum(productDeliveryFormatValues).nullable(),
    displayStatus: calendarDisplayStatusSchema
  })
  .strict()
  .superRefine((entry, context) => {
    if (Date.parse(entry.startAt) >= Date.parse(entry.endAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Calendar entry end must be after start"
      });
    }

    const expectedStatus = entry.kind === "booking" ? "confirmed" : "blocked";
    if (entry.displayStatus !== expectedStatus) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["displayStatus"],
        message: `Expected ${expectedStatus} status for ${entry.kind}`
      });
    }
  });
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export const calendarRangeResponseSchema = z
  .object({
    timeZone: ianaTimeZoneSchema,
    range: z
      .object({ start: instantSchema, end: instantSchema })
      .strict()
      .refine((range) => Date.parse(range.start) < Date.parse(range.end), {
        message: "Calendar range end must be after start"
      }),
    entries: z.array(calendarEntrySchema).max(5_000),
    availability: z.array(availabilityBackgroundSchema).max(5_000),
    summary: z
      .object({
        bookingCount: z.number().int().min(0),
        bookedMinutes: z.number().int().min(0),
        byDisplayStatus: z
          .object({
            confirmed: z.number().int().min(0).optional(),
            blocked: z.number().int().min(0).optional()
          })
          .strict()
      })
      .strict()
  })
  .strict();
export type CalendarRangeResponse = z.infer<typeof calendarRangeResponseSchema>;

export const createManualBlockRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    startAt: instantSchema,
    endAt: instantSchema
  })
  .strict()
  .superRefine((block, context) => {
    const start = Date.parse(block.startAt);
    const end = Date.parse(block.endAt);
    if (end <= start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Manual block end must be after start"
      });
      return;
    }
    if (end - start > 366 * 24 * 60 * 60 * 1_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Manual block cannot exceed 366 days"
      });
    }
  });
export type CreateManualBlockRequest = z.infer<typeof createManualBlockRequestSchema>;

export const manualBlockSchema = z
  .object({
    id: uuidSchema,
    reservationId: uuidSchema,
    title: z.string().trim().min(1).max(120),
    state: z.enum(["active", "released"]),
    startAt: instantSchema,
    endAt: instantSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema
  })
  .strict()
  .refine((block) => Date.parse(block.startAt) < Date.parse(block.endAt), {
    message: "Manual block end must be after start"
  });
export type ManualBlock = z.infer<typeof manualBlockSchema>;

export const manualBlockResponseSchema = z
  .object({
    block: manualBlockSchema,
    replayed: z.boolean()
  })
  .strict();
export type ManualBlockResponse = z.infer<typeof manualBlockResponseSchema>;

export const manualBlockParamsSchema = z
  .object({
    blockId: uuidSchema
  })
  .strict();
export type ManualBlockParams = z.infer<typeof manualBlockParamsSchema>;

export const createManualBookingRequestSchema = z
  .object({
    clientUserId: uuidSchema,
    productId: uuidSchema,
    deliveryFormat: z.enum(productDeliveryFormatValues),
    projectedStartAt: instantSchema
  })
  .strict();
export type CreateManualBookingRequest = z.infer<typeof createManualBookingRequestSchema>;

export const availableBookingSlotsQuerySchema = z
  .object({
    productId: uuidSchema,
    start: instantSchema,
    end: instantSchema
  })
  .strict()
  .superRefine((range, context) => {
    const start = Date.parse(range.start);
    const end = Date.parse(range.end);
    if (end <= start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Slot range end must be after start"
      });
      return;
    }
    if (end - start > 93 * 24 * 60 * 60 * 1_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Slot range cannot exceed 93 days"
      });
    }
  });
export type AvailableBookingSlotsQuery = z.infer<typeof availableBookingSlotsQuerySchema>;

const availableBookingSlotSchema = z
  .object({
    startAt: instantSchema,
    endAt: instantSchema
  })
  .strict()
  .refine((slot) => Date.parse(slot.startAt) < Date.parse(slot.endAt), {
    message: "Booking slot end must be after start"
  });

export const availableBookingSlotsResponseSchema = z
  .object({
    productId: uuidSchema,
    timeZone: ianaTimeZoneSchema,
    slots: z.array(availableBookingSlotSchema).max(10_000)
  })
  .strict();
export type AvailableBookingSlotsResponse = z.infer<
  typeof availableBookingSlotsResponseSchema
>;

const bookingPolicySnapshotSchema = z
  .object({
    bufferBeforeMinutes: nonNegativeMinuteSchema,
    bufferAfterMinutes: nonNegativeMinuteSchema,
    minimumNoticeMinutes: z.number().int().min(0).max(525_600)
  })
  .strict();

export const bookingLifecycleStateSchema = z.enum([
  "hold",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "expired"
]);
export type BookingLifecycleState = z.infer<typeof bookingLifecycleStateSchema>;

export const bookingSourceSchema = z.enum(["manual", "client_paid"]);
export type BookingSource = z.infer<typeof bookingSourceSchema>;

export const bookingCancellationReasonCodeValues = [
  "astrologer_unavailable",
  "client_request",
  "mutual_agreement",
  "other"
] as const;
export const bookingCancellationReasonCodeSchema = z.enum(
  bookingCancellationReasonCodeValues
);
export type BookingCancellationReasonCode = z.infer<
  typeof bookingCancellationReasonCodeSchema
>;

const bookingBaseSchema = z
  .object({
    id: uuidSchema,
    reservationId: uuidSchema,
    clientUserId: uuidSchema,
    productId: uuidSchema,
    source: bookingSourceSchema,
    state: bookingLifecycleStateSchema,
    lifecycleRevision: z.number().int().min(0),
    holdExpiresAt: instantSchema.nullable(),
    startAt: instantSchema,
    endAt: instantSchema,
    productTitle: z.string().trim().min(1).max(200),
    durationMinutes: positiveMinuteSchema,
    deliveryFormat: z.enum(productDeliveryFormatValues),
    priceMinor: z.number().int().min(0),
    currency: z.enum(productCurrencyValues),
    timeZone: ianaTimeZoneSchema,
    policySnapshot: bookingPolicySnapshotSchema,
    createdAt: instantSchema,
    updatedAt: instantSchema
  })
  .strict()
  .superRefine((booking, context) => {
    if (Date.parse(booking.startAt) >= Date.parse(booking.endAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Booking end must be after start"
      });
    }
    if (booking.state === "hold" && booking.holdExpiresAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["holdExpiresAt"],
        message: "Held bookings require an expiry"
      });
    }
    if (booking.state !== "hold" && booking.holdExpiresAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["holdExpiresAt"],
        message: "Only held bookings can expose a hold expiry"
      });
    }
  });

export const bookingSchema = bookingBaseSchema;
export type BookingContract = z.infer<typeof bookingSchema>;

export const manualBookingSchema = bookingBaseSchema.superRefine((booking, context) => {
  if (booking.source !== "manual") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source"],
      message: "Manual booking response must use manual source"
    });
  }
  if (booking.state !== "confirmed") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["state"],
      message: "Manual booking creation returns a confirmed booking"
    });
  }
});
export type ManualBooking = z.infer<typeof manualBookingSchema>;

export const manualBookingResponseSchema = z
  .object({
    booking: manualBookingSchema,
    replayed: z.boolean()
  })
  .strict();
export type ManualBookingResponse = z.infer<typeof manualBookingResponseSchema>;

export const cancelBookingRequestSchema = z
  .object({
    expectedLifecycleRevision: z.number().int().positive(),
    reasonCode: bookingCancellationReasonCodeSchema
  })
  .strict();
export type CancelBookingRequest = z.infer<typeof cancelBookingRequestSchema>;

const bookingCancellationEventSummarySchema = z
  .object({
    id: uuidSchema,
    revision: z.number().int().positive(),
    kind: z.literal("cancelled"),
    reasonCode: bookingCancellationReasonCodeSchema,
    occurredAt: instantSchema
  })
  .strict();

export const cancelBookingResponseSchema = z
  .object({
    booking: bookingBaseSchema,
    lifecycleEvent: bookingCancellationEventSummarySchema,
    replayed: z.boolean()
  })
  .strict()
  .superRefine((response, context) => {
    if (response.booking.source !== "manual" || response.booking.state !== "cancelled") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["booking", "state"],
        message: "Owner cancellation response requires a cancelled manual booking"
      });
    }
    if (response.booking.lifecycleRevision !== response.lifecycleEvent.revision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycleEvent", "revision"],
        message: "Cancellation event revision must match the booking revision"
      });
    }
  });
export type CancelBookingResponse = z.infer<typeof cancelBookingResponseSchema>;

export const completeBookingRequestSchema = z
  .object({
    expectedLifecycleRevision: z.number().int().positive()
  })
  .strict();
export type CompleteBookingRequest = z.infer<typeof completeBookingRequestSchema>;

const bookingCompletionEventSummarySchema = z
  .object({
    id: uuidSchema,
    revision: z.number().int().positive(),
    kind: z.literal("completed"),
    reasonCode: z.null(),
    occurredAt: instantSchema
  })
  .strict();

export const completeBookingResponseSchema = z
  .object({
    booking: bookingBaseSchema,
    lifecycleEvent: bookingCompletionEventSummarySchema,
    replayed: z.boolean()
  })
  .strict()
  .superRefine((response, context) => {
    if (response.booking.source !== "client_paid" || response.booking.state !== "completed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["booking", "state"],
        message: "Completion response requires a completed paid booking"
      });
    }
    if (response.booking.lifecycleRevision !== response.lifecycleEvent.revision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycleEvent", "revision"],
        message: "Completion event revision must match the booking revision"
      });
    }
  });
export type CompleteBookingResponse = z.infer<typeof completeBookingResponseSchema>;

export const rescheduleBookingRequestSchema = z
  .object({
    expectedLifecycleRevision: z.number().int().positive(),
    projectedStartAt: instantSchema
  })
  .strict();
export type RescheduleBookingRequest = z.infer<typeof rescheduleBookingRequestSchema>;

const bookingRescheduleEventSummarySchema = z
  .object({
    id: uuidSchema,
    revision: z.number().int().positive(),
    kind: z.literal("rescheduled"),
    reasonCode: z.null(),
    occurredAt: instantSchema
  })
  .strict();

export const rescheduleBookingResponseSchema = z
  .object({
    booking: bookingBaseSchema,
    lifecycleEvent: bookingRescheduleEventSummarySchema,
    replayed: z.boolean()
  })
  .strict()
  .superRefine((response, context) => {
    if (response.booking.state !== "confirmed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["booking", "state"],
        message: "Accepted reschedule response requires a confirmed booking"
      });
    }
    if (response.booking.lifecycleRevision !== response.lifecycleEvent.revision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycleEvent", "revision"],
        message: "Reschedule event revision must match the booking revision"
      });
    }
  });
export type RescheduleBookingResponse = z.infer<typeof rescheduleBookingResponseSchema>;

export const bookingResponseSchema = z
  .object({
    booking: bookingSchema
  })
  .strict();
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

export const createPaidBookingHoldRequestSchema = z
  .object({
    astrologerUserId: uuidSchema,
    productId: uuidSchema,
    directLinkIntentId: uuidSchema.nullable().optional(),
    deliveryFormat: z.enum(productDeliveryFormatValues),
    projectedStartAt: instantSchema
  })
  .strict()
  .transform((value) => ({
    ...value,
    directLinkIntentId: value.directLinkIntentId ?? null
  }));
export type CreatePaidBookingHoldRequest = z.infer<typeof createPaidBookingHoldRequestSchema>;

export const paidBookingHoldResponseSchema = z
  .object({
    booking: bookingSchema.refine(
      (booking) => booking.source === "client_paid" && booking.state === "hold",
      "Paid booking hold response must be a client paid hold"
    ),
    replayed: z.boolean()
  })
  .strict();
export type PaidBookingHoldResponse = z.infer<typeof paidBookingHoldResponseSchema>;

export const bookingParamsSchema = z
  .object({
    bookingId: uuidSchema
  })
  .strict();
export type BookingParams = z.infer<typeof bookingParamsSchema>;

function isIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function addScheduleAggregateIssues(
  aggregate: {
    weeklyPeriods: Array<{ weekday: number; startMinute: number; endMinute: number }>;
    dateOverrides: Array<{
      date: string;
      periods: Array<{ startMinute: number; endMinute: number }>;
    }>;
    productIds: string[];
  },
  context: z.RefinementCtx
): void {
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const periods = aggregate.weeklyPeriods.filter((period) => period.weekday === weekday);
    addPeriodOverlapIssues(periods, context, ["weeklyPeriods"]);
  }

  const overrideDates = new Set<string>();
  aggregate.dateOverrides.forEach((override, index) => {
    if (overrideDates.has(override.date)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateOverrides", index, "date"],
        message: "Date override must be unique"
      });
    }
    overrideDates.add(override.date);
  });

  const productIds = new Set<string>();
  aggregate.productIds.forEach((productId, index) => {
    if (productIds.has(productId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productIds", index],
        message: "Product assignment must be unique"
      });
    }
    productIds.add(productId);
  });
}

function addPeriodOverlapIssues(
  periods: Array<{ startMinute: number; endMinute: number }>,
  context: z.RefinementCtx,
  path: Array<string | number>
): void {
  const sorted = periods
    .map((period, index) => ({ ...period, index }))
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous && current && current.startMinute < previous.endMinute) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, current.index],
        message: "Availability periods cannot overlap"
      });
    }
  }
}
