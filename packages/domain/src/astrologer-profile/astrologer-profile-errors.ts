export class AstrologerProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AstrologerProfileValidationError";
  }
}

export class AstrologerProfileHandleConflictError extends Error {
  constructor(publicHandle: string) {
    super(`Astrologer profile handle is already used: ${publicHandle}`);
    this.name = "AstrologerProfileHandleConflictError";
  }
}
