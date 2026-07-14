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

export class CalculationResultChangedError extends Error {
  constructor() {
    super("Calculation changed while interpretation was being saved");
    this.name = "CalculationResultChangedError";
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
