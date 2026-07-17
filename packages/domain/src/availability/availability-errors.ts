export class AvailabilityValidationError extends Error {
  readonly code = "availability_validation_error";

  constructor(message: string) {
    super(message);
    this.name = "AvailabilityValidationError";
  }
}

export class AvailabilityScheduleNotFoundError extends Error {
  readonly code = "schedule_not_found";

  constructor() {
    super("Availability schedule was not found");
    this.name = "AvailabilityScheduleNotFoundError";
  }
}

export class AvailabilityVersionConflictError extends Error {
  readonly code = "availability_version_conflict";

  constructor(readonly currentVersion: number) {
    super("Availability schedule version is stale");
    this.name = "AvailabilityVersionConflictError";
  }
}

export class AvailabilityProductNotBookableError extends Error {
  readonly code = "product_not_bookable";

  constructor(readonly productId: string) {
    super("Product is not bookable on this schedule");
    this.name = "AvailabilityProductNotBookableError";
  }
}
