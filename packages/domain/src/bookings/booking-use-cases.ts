import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import {
  AvailabilityScheduleNotFoundError,
  evaluateProjectedStart,
  projectAvailableSlots,
  type AvailabilityStore,
  type ProjectedStartEvaluation
} from "../availability";
import { normalizeRequiredString } from "../shared";
import { sha256CanonicalJson } from "../calculations/canonical-json";
import {
  BookingDailyLimitReachedError,
  BookingHorizonViolationError,
  BookingNotFoundError,
  BookingNoticeViolationError,
  BookingLifecycleRevisionConflictError,
  BookingRescheduleNotAllowedError,
  BookingValidationError,
  ClientRelationshipNotActiveError,
  ProductNotBookableError,
  SlotNoLongerAvailableError,
  SlotOutsideAvailabilityError
} from "./booking-errors";
import type {
  BookingClientReader,
  BookingCommandStore,
  BookingProductReader,
  BookingRescheduleClaim,
  BookingRescheduleContext,
  OwnerCompleteBookingCommand,
  ManualBookingClaim
} from "./booking-ports";
import type {
  Booking,
  BookingProduct,
  AvailableBookingSlotsResult,
  CancelBookingInput,
  CancelBookingResult,
  CompleteBookingInput,
  CompleteBookingResult,
  CreatePaidBookingHoldInput,
  CreatePaidBookingHoldResult,
  CreateManualBookingInput,
  CreateManualBookingResult,
  RescheduleBookingInput,
  RescheduleBookingResult
} from "./booking-types";
import { bookingClientDataRequirementsSchemaVersion } from "./booking-types";

export async function getAvailableBookingSlots(input: {
  readonly availabilityStore: AvailabilityStore;
  readonly productReader: BookingProductReader;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly rangeStartAt: string;
  readonly rangeEndAt: string;
  readonly now: Date;
}): Promise<AvailableBookingSlotsResult> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Booking owner is required");
  const productId = normalizeRequiredString(input.productId, "Booking product is required");
  const [schedule, product] = await Promise.all([
    input.availabilityStore.findDefaultByOwner({ ownerUserId }),
    input.productReader.findByOwnerAndId({ ownerUserId, productId })
  ]);
  if (!schedule) throw new AvailabilityScheduleNotFoundError();
  if (!isSchedulableProduct(product) || !schedule.productIds.includes(product.id)) {
    throw new ProductNotBookableError();
  }
  const context = await input.availabilityStore.readProjectionContext({
    ownerUserId,
    scheduleId: schedule.id,
    rangeStartAt: input.rangeStartAt,
    rangeEndAt: input.rangeEndAt
  });
  if (!context) throw new AvailabilityScheduleNotFoundError();

  const slots = projectAvailableSlots({
    context,
    productDurationMinutes: product.durationMinutes,
    rangeStartAt: input.rangeStartAt,
    rangeEndAt: input.rangeEndAt,
    now: input.now.toISOString()
  });
  return {
    productId,
    timeZone: schedule.timeZone,
    slots: slots.map((slot) => ({ startAt: slot.serviceStartAt, endAt: slot.serviceEndAt }))
  };
}

const manualBookingScope = "bookings.manual.create" as const;
const paidBookingHoldScope = "bookings.paid.hold.create" as const;
const ownerCancelBookingScope = "bookings.owner.cancel" as const;
const ownerRescheduleBookingScope = "bookings.owner.reschedule" as const;
const ownerCompleteBookingScope = "bookings.owner.complete" as const;
const paidBookingHoldTtlMinutes = 15;

export async function createManualBooking(input: {
  readonly commandStore: BookingCommandStore;
  readonly availabilityStore: AvailabilityStore;
  readonly clientReader: BookingClientReader;
  readonly productReader: BookingProductReader;
  readonly ownerUserId: string;
  readonly idempotencyKey: string;
  readonly input: CreateManualBookingInput;
  readonly now: Date;
}): Promise<CreateManualBookingResult> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Booking owner is required");
  const clientUserId = normalizeRequiredString(input.input.clientUserId, "Booking client is required");
  const productId = normalizeRequiredString(input.input.productId, "Booking product is required");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const projectedStartAt = normalizeInstant(input.input.projectedStartAt);
  const now = input.now.toISOString();
  const requestHash = hashManualBookingRequest({
    ownerUserId,
    clientUserId,
    productId,
    deliveryFormat: input.input.deliveryFormat,
    projectedStartAt
  });

  const result = await input.commandStore.executeManualBooking(
    {
      actorUserId: ownerUserId,
      scope: manualBookingScope,
      key: idempotencyKey,
      requestHash,
      now,
      expiresAt: Temporal.Instant.from(now).add({ hours: 24 }).toString()
    },
    async () =>
      createBookingClaim({
        availabilityStore: input.availabilityStore,
        clientReader: input.clientReader,
        productReader: input.productReader,
        ownerUserId,
        clientUserId,
        productId,
        deliveryFormat: input.input.deliveryFormat,
        projectedStartAt,
        now
      })
  );

  return { booking: result.booking, replayed: result.kind === "replayed" };
}

export async function createPaidBookingHold(input: {
  readonly commandStore: BookingCommandStore;
  readonly availabilityStore: AvailabilityStore;
  readonly clientReader: BookingClientReader;
  readonly productReader: BookingProductReader;
  readonly clientUserId: string;
  readonly ownerUserId: string;
  readonly idempotencyKey: string;
  readonly input: CreatePaidBookingHoldInput;
  readonly now: Date;
}): Promise<CreatePaidBookingHoldResult> {
  const clientUserId = normalizeRequiredString(input.clientUserId, "Booking client is required");
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Booking owner is required");
  const productId = normalizeRequiredString(input.input.productId, "Booking product is required");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const projectedStartAt = normalizeInstant(input.input.projectedStartAt);
  const now = input.now.toISOString();
  const holdExpiresAt = Temporal.Instant.from(now).add({ minutes: paidBookingHoldTtlMinutes }).toString();
  const requestHash = hashPaidBookingHoldRequest({
    clientUserId,
    ownerUserId,
    productId,
    deliveryFormat: input.input.deliveryFormat,
    projectedStartAt
  });

  const result = await input.commandStore.executePaidHold(
    {
      actorUserId: clientUserId,
      scope: paidBookingHoldScope,
      key: idempotencyKey,
      requestHash,
      now,
      expiresAt: holdExpiresAt
    },
    async () => ({
      ...(await createBookingClaim({
        availabilityStore: input.availabilityStore,
        clientReader: input.clientReader,
        productReader: input.productReader,
        ownerUserId,
        clientUserId,
        productId,
        deliveryFormat: input.input.deliveryFormat,
        projectedStartAt,
        now
      })),
      holdExpiresAt
    })
  );

  return { booking: result.booking, replayed: result.kind === "replayed" };
}

export async function getBooking(input: {
  readonly store: BookingCommandStore;
  readonly ownerUserId: string;
  readonly bookingId: string;
}): Promise<Booking> {
  const booking = await input.store.findByOwnerAndId({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Booking owner is required"),
    bookingId: normalizeRequiredString(input.bookingId, "Booking id is required")
  });
  if (!booking) throw new BookingNotFoundError();
  return booking;
}

export async function cancelBooking(input: {
  readonly commandStore: BookingCommandStore;
  readonly ownerUserId: string;
  readonly bookingId: string;
  readonly idempotencyKey: string;
  readonly input: CancelBookingInput;
  readonly now: Date;
}): Promise<CancelBookingResult> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Booking owner is required");
  const bookingId = normalizeRequiredString(input.bookingId, "Booking id is required");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.input.expectedLifecycleRevision) ||
    input.input.expectedLifecycleRevision < 1
  ) {
    throw new BookingValidationError("Expected booking lifecycle revision is invalid");
  }
  const reasonCode = normalizeCancellationReasonCode(input.input.reasonCode);
  const now = input.now.toISOString();
  const result = await input.commandStore.executeOwnerCancellation(
    {
      actorUserId: ownerUserId,
      scope: ownerCancelBookingScope,
      key: idempotencyKey,
      requestHash: sha256CanonicalJson({
        schemaVersion: "booking-owner-cancel-command.v1",
        ownerUserId,
        bookingId,
        expectedLifecycleRevision: input.input.expectedLifecycleRevision,
        reasonCode
      }),
      now,
      expiresAt: Temporal.Instant.from(now).add({ hours: 24 }).toString()
    },
    {
      bookingId,
      expectedLifecycleRevision: input.input.expectedLifecycleRevision,
      reasonCode
    }
  );
  return {
    booking: result.booking,
    lifecycleEvent: result.lifecycleEvent,
    replayed: result.kind === "replayed"
  };
}

export async function rescheduleBooking(input: {
  readonly commandStore: BookingCommandStore;
  readonly ownerUserId: string;
  readonly bookingId: string;
  readonly idempotencyKey: string;
  readonly input: RescheduleBookingInput;
  readonly now: Date;
}): Promise<RescheduleBookingResult> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Booking owner is required");
  const bookingId = normalizeRequiredString(input.bookingId, "Booking id is required");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.input.expectedLifecycleRevision) ||
    input.input.expectedLifecycleRevision < 1
  ) {
    throw new BookingValidationError("Expected booking lifecycle revision is invalid");
  }
  const projectedStartAt = normalizeInstant(input.input.projectedStartAt);
  const now = input.now.toISOString();
  const result = await input.commandStore.executeOwnerReschedule(
    {
      actorUserId: ownerUserId,
      scope: ownerRescheduleBookingScope,
      key: idempotencyKey,
      requestHash: sha256CanonicalJson({
        schemaVersion: "booking-owner-reschedule-command.v1",
        ownerUserId,
        bookingId,
        expectedLifecycleRevision: input.input.expectedLifecycleRevision,
        projectedStartAt
      }),
      now,
      expiresAt: Temporal.Instant.from(now).add({ hours: 24 }).toString()
    },
    {
      bookingId,
      expectedLifecycleRevision: input.input.expectedLifecycleRevision,
      projectedStartAt
    },
    async (context) =>
      createBookingRescheduleClaim({
        context,
        ownerUserId,
        bookingId,
        expectedLifecycleRevision: input.input.expectedLifecycleRevision,
        projectedStartAt,
        now
      })
  );
  return {
    booking: result.booking,
    lifecycleEvent: result.lifecycleEvent,
    replayed: result.kind === "replayed"
  };
}

export async function completeBooking(input: {
  readonly commandStore: BookingCommandStore;
  readonly ownerUserId: string;
  readonly bookingId: string;
  readonly idempotencyKey: string;
  readonly input: CompleteBookingInput;
  readonly now: Date;
}): Promise<CompleteBookingResult> {
  const ownerUserId = normalizeRequiredString(input.ownerUserId, "Booking owner is required");
  const bookingId = normalizeRequiredString(input.bookingId, "Booking id is required");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.input.expectedLifecycleRevision) ||
    input.input.expectedLifecycleRevision < 1
  ) {
    throw new BookingValidationError("Expected booking lifecycle revision is invalid");
  }
  const now = input.now.toISOString();
  const command: OwnerCompleteBookingCommand = {
    actorUserId: ownerUserId,
    scope: ownerCompleteBookingScope,
    key: idempotencyKey,
    requestHash: sha256CanonicalJson({
      schemaVersion: "booking-owner-complete-command.v1",
      ownerUserId,
      bookingId,
      expectedLifecycleRevision: input.input.expectedLifecycleRevision
    }),
    now,
    expiresAt: Temporal.Instant.from(now).add({ hours: 24 }).toString()
  };
  const result = await input.commandStore.executeOwnerCompletion(command, {
    bookingId,
    expectedLifecycleRevision: input.input.expectedLifecycleRevision
  });
  return {
    booking: result.booking,
    lifecycleEvent: result.lifecycleEvent,
    replayed: result.kind === "replayed"
  };
}

function createBookingRescheduleClaim(input: {
  readonly context: BookingRescheduleContext;
  readonly ownerUserId: string;
  readonly bookingId: string;
  readonly expectedLifecycleRevision: number;
  readonly projectedStartAt: string;
  readonly now: string;
}): BookingRescheduleClaim {
  const { booking, scheduleId, availability } = input.context;
  if (booking.ownerUserId !== input.ownerUserId || booking.id !== input.bookingId) {
    throw new Error("Booking reschedule context does not match the command identity");
  }
  if (booking.lifecycleRevision !== input.expectedLifecycleRevision) {
    throw new BookingLifecycleRevisionConflictError(
      input.expectedLifecycleRevision,
      booking.lifecycleRevision
    );
  }
  if (booking.state !== "confirmed") {
    throw new BookingRescheduleNotAllowedError(booking.state);
  }
  if (Temporal.Instant.compare(booking.startAt, input.projectedStartAt) === 0) {
    throw new BookingValidationError("Rescheduled booking start must differ from current start");
  }

  const evaluation = evaluateProjectedStart({
    context: availability,
    productDurationMinutes: booking.durationMinutes,
    projectedStartAt: input.projectedStartAt,
    now: input.now
  });
  if (evaluation.kind !== "available") throwProjectedStartError(evaluation);

  return {
    ownerUserId: booking.ownerUserId,
    bookingId: booking.id,
    reservationId: booking.reservationId,
    scheduleId,
    expectedLifecycleRevision: booking.lifecycleRevision,
    serviceStartAt: evaluation.slot.serviceStartAt,
    serviceEndAt: evaluation.slot.serviceEndAt,
    occupiedStartAt: evaluation.slot.occupiedStartAt,
    occupiedEndAt: evaluation.slot.occupiedEndAt,
    scheduleSnapshot: {
      timeZone: availability.schedule.timeZone,
      policy: {
        bufferBeforeMinutes: availability.schedule.bufferBeforeMinutes,
        bufferAfterMinutes: availability.schedule.bufferAfterMinutes,
        minimumNoticeMinutes: availability.schedule.minimumNoticeMinutes
      }
    }
  };
}

async function createBookingClaim(input: {
  readonly availabilityStore: AvailabilityStore;
  readonly clientReader: BookingClientReader;
  readonly productReader: BookingProductReader;
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly deliveryFormat: CreateManualBookingInput["deliveryFormat"];
  readonly projectedStartAt: string;
  readonly now: string;
}): Promise<ManualBookingClaim> {
  const relationshipActive = await input.clientReader.hasActiveRelationship({
    ownerUserId: input.ownerUserId,
    clientUserId: input.clientUserId
  });
  if (!relationshipActive) throw new ClientRelationshipNotActiveError();

  const product = await input.productReader.findByOwnerAndId({
    ownerUserId: input.ownerUserId,
    productId: input.productId
  });
  if (!isBookableProduct(product, input.deliveryFormat)) throw new ProductNotBookableError();

  const schedule = await input.availabilityStore.findDefaultByOwner({
    ownerUserId: input.ownerUserId
  });
  if (!schedule) throw new AvailabilityScheduleNotFoundError();
  if (!schedule.productIds.includes(product.id)) throw new ProductNotBookableError();

  const start = Temporal.Instant.from(input.projectedStartAt);
  const rangeStartAt = start.subtract({ minutes: schedule.bufferBeforeMinutes }).toString();
  const rangeEndAt = start
    .add({ minutes: product.durationMinutes + schedule.bufferAfterMinutes })
    .toString();
  const context = await input.availabilityStore.readProjectionContext({
    ownerUserId: input.ownerUserId,
    scheduleId: schedule.id,
    rangeStartAt,
    rangeEndAt
  });
  if (!context) throw new AvailabilityScheduleNotFoundError();

  const evaluation = evaluateProjectedStart({
    context,
    productDurationMinutes: product.durationMinutes,
    projectedStartAt: input.projectedStartAt,
    now: input.now
  });
  if (evaluation.kind !== "available") throwProjectedStartError(evaluation);

  return {
    ownerUserId: input.ownerUserId,
    clientUserId: input.clientUserId,
    productId: product.id,
    scheduleId: schedule.id,
    serviceStartAt: evaluation.slot.serviceStartAt,
    serviceEndAt: evaluation.slot.serviceEndAt,
    occupiedStartAt: evaluation.slot.occupiedStartAt,
    occupiedEndAt: evaluation.slot.occupiedEndAt,
    productSnapshot: {
      title: product.title,
      durationMinutes: product.durationMinutes,
      deliveryFormat: input.deliveryFormat,
      priceMinor: product.priceMinor,
      currency: product.currency,
      clientDataRequirements: {
        schemaVersion: bookingClientDataRequirementsSchemaVersion,
        executionMode: product.executionMode,
        participantMode: product.participantMode,
        requiredClientData: [...product.requiredClientData],
        methods: [...product.methods]
      }
    },
    scheduleSnapshot: {
      timeZone: schedule.timeZone,
      policy: {
        bufferBeforeMinutes: schedule.bufferBeforeMinutes,
        bufferAfterMinutes: schedule.bufferAfterMinutes,
        minimumNoticeMinutes: schedule.minimumNoticeMinutes
      }
    }
  };
}

function isBookableProduct(
  product: BookingProduct | null,
  deliveryFormat: CreateManualBookingInput["deliveryFormat"]
): product is BookingProduct & { readonly durationMinutes: number } {
  return isSchedulableProduct(product) && product.deliveryFormats.includes(deliveryFormat);
}

function isSchedulableProduct(
  product: BookingProduct | null
): product is BookingProduct & { readonly durationMinutes: number } {
  return Boolean(
    product &&
      product.status === "active" &&
      product.executionMode === "live" &&
      product.participantMode === "solo" &&
      product.durationMinutes !== null &&
      product.durationMinutes > 0
  );
}

function throwProjectedStartError(evaluation: Exclude<ProjectedStartEvaluation, { kind: "available" }>): never {
  switch (evaluation.kind) {
    case "outside_availability":
      throw new SlotOutsideAvailabilityError();
    case "notice_violation":
      throw new BookingNoticeViolationError();
    case "horizon_violation":
      throw new BookingHorizonViolationError();
    case "daily_limit_reached":
      throw new BookingDailyLimitReachedError();
    case "occupied":
      throw new SlotNoLongerAvailableError();
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = normalizeRequiredString(value, "Idempotency key is required");
  if (
    normalized.length < 8 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw new BookingValidationError("Idempotency key is invalid");
  }
  return normalized;
}

function normalizeInstant(value: string): string {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw new BookingValidationError("Projected start instant is invalid");
  }
}

function normalizeCancellationReasonCode(
  value: CancelBookingInput["reasonCode"]
): CancelBookingInput["reasonCode"] {
  if (
    value !== "astrologer_unavailable" &&
    value !== "client_request" &&
    value !== "mutual_agreement" &&
    value !== "other"
  ) {
    throw new BookingValidationError("Booking cancellation reason is invalid");
  }
  return value;
}

function hashManualBookingRequest(input: {
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly productId: string;
  readonly deliveryFormat: string;
  readonly projectedStartAt: string;
}): `sha256:${string}` {
  const canonical = JSON.stringify([
    manualBookingScope,
    input.ownerUserId,
    input.clientUserId,
    input.productId,
    input.deliveryFormat,
    input.projectedStartAt
  ]);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function hashPaidBookingHoldRequest(input: {
  readonly clientUserId: string;
  readonly ownerUserId: string;
  readonly productId: string;
  readonly deliveryFormat: string;
  readonly projectedStartAt: string;
}): `sha256:${string}` {
  const canonical = JSON.stringify([
    paidBookingHoldScope,
    input.clientUserId,
    input.ownerUserId,
    input.productId,
    input.deliveryFormat,
    input.projectedStartAt
  ]);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
