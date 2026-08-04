import type {
  ClientDataConsentState,
  ClientConsentRelationshipStatus
} from "./client-consent-types";

export class ClientConsentValidationError extends Error {
  readonly code = "CHART_AI_CONSENT_INVALID_REQUEST";

  constructor(message = "Client consent request is invalid") {
    super(message);
    this.name = "ClientConsentValidationError";
  }
}

export class ClientConsentRelationshipRequiredError extends Error {
  readonly code = "CHART_AI_CONSENT_RELATIONSHIP_REQUIRED";

  constructor(public readonly clientUserId: string) {
    super("An explicit client-astrologer relationship is required");
    this.name = "ClientConsentRelationshipRequiredError";
  }
}

export class ClientConsentRelationshipInactiveError extends Error {
  readonly code = "CHART_AI_CONSENT_RELATIONSHIP_INACTIVE";

  constructor(
    public readonly clientUserId: string,
    public readonly relationshipStatus: Exclude<ClientConsentRelationshipStatus, "active">
  ) {
    super("The client-astrologer relationship is not active");
    this.name = "ClientConsentRelationshipInactiveError";
  }
}

export class ClientConsentNotFoundError extends Error {
  readonly code = "CLIENT_DATA_CONSENT_NOT_FOUND";

  constructor() {
    super("Client data consent was not found");
    this.name = "ClientConsentNotFoundError";
  }
}

export class ChartAiConsentRequiredError extends Error {
  readonly code = "CHART_AI_CONSENT_REQUIRED";

  constructor(
    public readonly clientUserId: string,
    public readonly consentState: Exclude<ClientDataConsentState, "granted">
  ) {
    super("Current client consent is required before external chart AI processing");
    this.name = "ChartAiConsentRequiredError";
  }
}

export class ClientConsentIntegrityError extends Error {
  readonly code = "CHART_AI_CONSENT_INTEGRITY_ERROR";

  constructor(message = "Client consent persistence evidence is inconsistent") {
    super(message);
    this.name = "ClientConsentIntegrityError";
  }
}
