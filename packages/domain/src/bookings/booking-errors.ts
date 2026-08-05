export class BookingValidationError extends Error {
  readonly code = "booking_validation_error";

  constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

export class BookingNotFoundError extends Error {
  readonly code = "booking_not_found";

  constructor() {
    super("Booking was not found");
    this.name = "BookingNotFoundError";
  }
}

export class BookingLifecycleRevisionConflictError extends Error {
  readonly code = "booking_lifecycle_revision_conflict";

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number
  ) {
    super("Booking lifecycle revision is stale");
    this.name = "BookingLifecycleRevisionConflictError";
  }
}

export class BookingCancellationNotAllowedError extends Error {
  readonly code = "booking_cancellation_not_allowed";

  constructor(readonly state: string) {
    super("Booking cannot be cancelled from its current state");
    this.name = "BookingCancellationNotAllowedError";
  }
}

export class BookingCancellationRequiresRefundAuthorityError extends Error {
  readonly code = "booking_cancellation_requires_refund_authority";

  constructor() {
    super("Paid booking cancellation requires an authoritative refund decision");
    this.name = "BookingCancellationRequiresRefundAuthorityError";
  }
}

export class BookingRescheduleNotAllowedError extends Error {
  readonly code = "booking_reschedule_not_allowed";

  constructor(readonly state: string) {
    super("Booking cannot be rescheduled from its current state");
    this.name = "BookingRescheduleNotAllowedError";
  }
}

export class BookingCompletionNotAllowedError extends Error {
  readonly code = "booking_completion_not_allowed";

  constructor(readonly state: string) {
    super("Booking cannot be completed from its current state");
    this.name = "BookingCompletionNotAllowedError";
  }
}

export class BookingCompletionTooEarlyError extends Error {
  readonly code = "booking_completion_too_early";

  constructor() {
    super("Booking cannot be completed before its service end");
    this.name = "BookingCompletionTooEarlyError";
  }
}

export class ClientRelationshipNotActiveError extends Error {
  readonly code = "client_relationship_not_active";

  constructor() {
    super("Client relationship is not active");
    this.name = "ClientRelationshipNotActiveError";
  }
}

export class ProductNotBookableError extends Error {
  readonly code = "product_not_bookable";

  constructor() {
    super("Product is not bookable");
    this.name = "ProductNotBookableError";
  }
}

export class SlotOutsideAvailabilityError extends Error {
  readonly code = "slot_outside_availability";

  constructor() {
    super("Selected start is outside availability");
    this.name = "SlotOutsideAvailabilityError";
  }
}

export class BookingNoticeViolationError extends Error {
  readonly code = "booking_notice_violation";

  constructor() {
    super("Selected start violates minimum booking notice");
    this.name = "BookingNoticeViolationError";
  }
}

export class BookingHorizonViolationError extends Error {
  readonly code = "booking_horizon_violation";

  constructor() {
    super("Selected start is outside the booking horizon");
    this.name = "BookingHorizonViolationError";
  }
}

export class BookingDailyLimitReachedError extends Error {
  readonly code = "daily_booking_limit_reached";

  constructor() {
    super("Daily booking limit has been reached");
    this.name = "BookingDailyLimitReachedError";
  }
}

export class SlotNoLongerAvailableError extends Error {
  readonly code = "slot_no_longer_available";

  constructor() {
    super("Selected start is no longer available");
    this.name = "SlotNoLongerAvailableError";
  }
}

export class IdempotencyKeyReuseError extends Error {
  readonly code = "idempotency_key_reused_with_different_request";

  constructor() {
    super("Idempotency key was already used for another request");
    this.name = "IdempotencyKeyReuseError";
  }
}
