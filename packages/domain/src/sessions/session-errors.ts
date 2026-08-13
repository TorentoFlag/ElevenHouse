export class SessionValidationError extends Error {
  readonly code = "session_validation_error";
  constructor(message: string) {
    super(message);
    this.name = "SessionValidationError";
  }
}

export class SessionNotFoundError extends Error {
  readonly code = "session_not_found";
  constructor() {
    super("Session was not found");
    this.name = "SessionNotFoundError";
  }
}

export class SessionNotVideoBookingError extends Error {
  readonly code = "session_not_video_booking";
  constructor() {
    super("Session booking does not use video delivery");
    this.name = "SessionNotVideoBookingError";
  }
}

export class SessionBookingNotConfirmedError extends Error {
  readonly code = "session_booking_not_confirmed";
  constructor() {
    super("Session booking is not confirmed");
    this.name = "SessionBookingNotConfirmedError";
  }
}

export class SessionRelationshipBlockedError extends Error {
  readonly code = "session_relationship_blocked";
  constructor() {
    super("Session relationship is blocked");
    this.name = "SessionRelationshipBlockedError";
  }
}

export class SessionTooEarlyError extends Error {
  readonly code = "session_too_early";
  constructor(readonly joinableAt: string) {
    super("Session is not joinable yet");
    this.name = "SessionTooEarlyError";
  }
}

export class SessionExpiredError extends Error {
  readonly code = "session_expired";
  constructor() {
    super("Session has expired");
    this.name = "SessionExpiredError";
  }
}

export class SessionEndedError extends Error {
  readonly code = "session_ended";
  constructor() {
    super("Session has ended");
    this.name = "SessionEndedError";
  }
}

export class SessionCancelledError extends Error {
  readonly code = "session_cancelled";
  constructor() {
    super("Session has been cancelled");
    this.name = "SessionCancelledError";
  }
}

export class SessionEndForbiddenError extends Error {
  readonly code = "session_end_forbidden";
  constructor() {
    super("Only the Session astrologer can end the call for everyone");
    this.name = "SessionEndForbiddenError";
  }
}

export class SessionProviderOutcomeUnknownError extends Error {
  readonly code = "session_provider_outcome_unknown";
  constructor(readonly safeCode: string) {
    super("Session provider outcome is unknown");
    this.name = "SessionProviderOutcomeUnknownError";
  }
}

export class SessionMessageOperationConflictError extends Error {
  readonly code = "session_message_operation_conflict";
  constructor() {
    super("Session message operation id was reused with different content");
    this.name = "SessionMessageOperationConflictError";
  }
}
