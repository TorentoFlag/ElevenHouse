export class VerificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationValidationError";
  }
}
