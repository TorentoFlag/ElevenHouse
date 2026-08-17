export class BirthDataValidationError extends Error {
  constructor(message = "Client birth data is invalid") {
    super(message);
    this.name = "BirthDataValidationError";
  }
}

export class ClientBirthDataRevisionConflictError extends Error {
  constructor(message = "Client birth data was changed by another actor") {
    super(message);
    this.name = "ClientBirthDataRevisionConflictError";
  }
}

export class ClientBirthDataRelationshipDeniedError extends Error {
  constructor(message = "Astrologer does not have an active client relationship") {
    super(message);
    this.name = "ClientBirthDataRelationshipDeniedError";
  }
}

export class ClientRelatedBirthProfileNotFoundError extends Error {
  constructor(message = "Client related birth profile was not found") {
    super(message);
    this.name = "ClientRelatedBirthProfileNotFoundError";
  }
}

export class ClientAstrologerRelationshipRoleError extends Error {
  constructor(message = "Client and astrologer account roles are required") {
    super(message);
    this.name = "ClientAstrologerRelationshipRoleError";
  }
}

export class ClientJoinIntentError extends Error {
  constructor(message = "Client join intent is invalid") {
    super(message);
    this.name = "ClientJoinIntentError";
  }
}

export class ClientAstrologerRelationshipBlockedError extends ClientJoinIntentError {
  constructor(message = "Client relationship is blocked") {
    super(message);
    this.name = "ClientAstrologerRelationshipBlockedError";
  }
}

export class ClientProfileProjectionError extends Error {
  constructor(message = "Canonical client user profile is required") {
    super(message);
    this.name = "ClientProfileProjectionError";
  }
}
