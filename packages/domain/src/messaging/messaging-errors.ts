export class MessagingValidationError extends Error {
  readonly code = "messaging_validation_error";

  constructor(message: string) {
    super(message);
    this.name = "MessagingValidationError";
  }
}

export class MessagingThreadNotFoundError extends Error {
  readonly code = "messaging_thread_not_found";

  constructor() {
    super("Messaging thread was not found");
    this.name = "MessagingThreadNotFoundError";
  }
}

export class MessagingIdempotencyConflictError extends Error {
  readonly code = "messaging_idempotency_conflict";

  constructor() {
    super("Idempotency key was already used for a different messaging request");
    this.name = "MessagingIdempotencyConflictError";
  }
}

export class MessagingClientRelationshipError extends Error {
  readonly code = "messaging_client_relationship_error";

  constructor() {
    super("Client does not have an active relationship with this astrologer");
    this.name = "MessagingClientRelationshipError";
  }
}
