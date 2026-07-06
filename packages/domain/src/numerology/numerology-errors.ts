export class NumerologyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NumerologyValidationError";
  }
}
