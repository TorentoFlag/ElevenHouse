export class BirthDataValidationError extends Error {
  constructor(message = "Client birth data is invalid") {
    super(message);
    this.name = "BirthDataValidationError";
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
