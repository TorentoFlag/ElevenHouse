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
