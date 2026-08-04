export class CalculationNotFoundError extends Error {
  constructor() {
    super("Calculation was not found");
    this.name = "CalculationNotFoundError";
  }
}

export class CalculationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationValidationError";
  }
}

export class CalculationInterpretationModeUnavailableError extends Error {
  readonly code = "CHART_INTERPRETATION_MODE_UNAVAILABLE" as const;

  constructor(message = "Chart action is unavailable for this interpretation mode") {
    super(message);
    this.name = "CalculationInterpretationModeUnavailableError";
  }
}

export class CalculationResultChangedError extends Error {
  constructor() {
    super("Calculation changed while interpretation was being saved");
    this.name = "CalculationResultChangedError";
  }
}

export class CalculationInterpretationIdempotencyConflictError extends Error {
  readonly code = "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT" as const;

  constructor() {
    super("Manual interpretation idempotency key was already used for another command");
    this.name = "CalculationInterpretationIdempotencyConflictError";
  }
}

export class CalculationParticipantMismatchError extends Error {
  constructor() {
    super("Calculation participants do not match the saved calculation");
    this.name = "CalculationParticipantMismatchError";
  }
}

export class CalculationAlreadyExistsError extends Error {
  constructor() {
    super("An identical calculation already exists");
    this.name = "CalculationAlreadyExistsError";
  }
}
