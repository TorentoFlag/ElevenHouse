export class NumerologyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumerologyValidationError";
  }
}

export class UnsupportedNumerologyMethodError extends Error {
  constructor(code: string) {
    super(`Unsupported numerology method: ${code}`);
    this.name = "UnsupportedNumerologyMethodError";
  }
}
