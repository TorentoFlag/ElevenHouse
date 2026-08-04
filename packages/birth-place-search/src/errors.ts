export class BirthPlaceSearchUnavailableError extends Error {
  readonly code = "BIRTH_PLACE_SEARCH_UNAVAILABLE";

  constructor(message = "Birth place search is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "BirthPlaceSearchUnavailableError";
  }
}

export class BirthPlaceSearchRateLimitError extends Error {
  readonly code = "BIRTH_PLACE_SEARCH_RATE_LIMITED";

  constructor(readonly retryAfterSeconds: number) {
    super("Birth place search rate limit exceeded");
    this.name = "BirthPlaceSearchRateLimitError";
  }
}

export class BirthPlaceReferenceInvalidError extends Error {
  readonly code = "BIRTH_PLACE_REFERENCE_INVALID";

  constructor() {
    super("Birth place reference is invalid");
    this.name = "BirthPlaceReferenceInvalidError";
  }
}

export class BirthPlaceReferenceNotFoundError extends Error {
  readonly code = "BIRTH_PLACE_REFERENCE_NOT_FOUND";

  constructor() {
    super("Birth place reference was not found");
    this.name = "BirthPlaceReferenceNotFoundError";
  }
}

export class BirthPlaceReferenceUnavailableError extends Error {
  readonly code = "BIRTH_PLACE_REFERENCE_UNAVAILABLE";

  constructor(message = "Birth place reference is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "BirthPlaceReferenceUnavailableError";
  }
}
