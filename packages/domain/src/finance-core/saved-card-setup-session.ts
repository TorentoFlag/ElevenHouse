/* eslint-disable no-control-regex -- Domain validation intentionally rejects ASCII control characters. */
export const savedCardSetupSessionStateValues = [
  "setup_requested",
  "preparation_pending",
  "tokenization_required",
  "execution_pending",
  "requires_customer_action",
  "credential_active",
  "setup_failed",
  "expired",
  "provider_unknown"
] as const;

export type SavedCardSetupSessionState = (typeof savedCardSetupSessionStateValues)[number];

export type SavedCardSetupSession = Readonly<{
  setupSessionId: string;
  subscriptionId: string;
  ownerUserId: string;
  expectedSubscriptionVersion: number;
  consentId: string;
  consentVersion: string;
  version: number;
  state: SavedCardSetupSessionState;
  economicPaymentIntentId: string | null;
  providerSetupId: string | null;
  savedCardCredentialId: string | null;
  savedCardCredentialVersion: string | null;
}>;

export class SavedCardSetupSessionError extends Error {
  readonly code = "FINANCE_SAVED_CARD_SETUP_SESSION_ERROR" as const;

  constructor(readonly reason: "invalid_session" | "version_conflict" | "state_transition_invalid") {
    super("Saved-card setup session state is invalid");
    this.name = "SavedCardSetupSessionError";
  }
}

/** Starts a consent-bound setup workflow; this is deliberately not a billable payment. */
export function createSavedCardSetupSession(input: Readonly<{
  setupSessionId: string;
  subscriptionId: string;
  ownerUserId: string;
  expectedSubscriptionVersion: number;
  consentId: string;
  consentVersion: string;
}>): SavedCardSetupSession {
  return session({
    ...input,
    version: 1,
    state: "setup_requested",
    economicPaymentIntentId: null,
    providerSetupId: null,
    savedCardCredentialId: null,
    savedCardCredentialVersion: null
  });
}

/** Establishes the zero-amount internal payment identity before any provider I/O. */
export function prepareSavedCardSetup(input: Readonly<{
  current: SavedCardSetupSession;
  expectedVersion: number;
  economicPaymentIntentId: string;
}>): SavedCardSetupSession {
  const current = assertExpected(input.current, input.expectedVersion, "setup_requested");
  return session({
    ...current,
    version: current.version + 1,
    state: "preparation_pending",
    economicPaymentIntentId: identifier(input.economicPaymentIntentId)
  });
}

/** Provider creation only unlocks browser tokenization; it cannot activate an invoice. */
export function recordCardSetupCreation(input: Readonly<{
  current: SavedCardSetupSession;
  expectedVersion: number;
  providerSetupId: string;
}>): SavedCardSetupSession {
  const current = assertExpected(input.current, input.expectedVersion, "preparation_pending");
  return session({ ...current, version: current.version + 1, state: "tokenization_required", providerSetupId: identifier(input.providerSetupId) });
}

/** Browser completion only asks ElevenHouse to execute the persisted setup; it is not a success fact. */
export function requestSavedCardSetupExecution(input: Readonly<{
  current: SavedCardSetupSession;
  expectedVersion: number;
}>): SavedCardSetupSession {
  const current = assertExpected(input.current, input.expectedVersion, "tokenization_required");
  return session({ ...current, version: current.version + 1, state: "execution_pending" });
}

/** A provider-declared 3DS handoff is pending, not a credential or payment success. */
export function requireSavedCardSetupCustomerAction(input: Readonly<{
  current: SavedCardSetupSession;
  expectedVersion: number;
}>): SavedCardSetupSession {
  const current = assertExpected(input.current, input.expectedVersion, "execution_pending");
  return session({ ...current, version: current.version + 1, state: "requires_customer_action" });
}

/** Only a verified provider execution path may bind a reusable credential. */
export function activateSavedCardSetupCredential(input: Readonly<{
  current: SavedCardSetupSession;
  expectedVersion: number;
  savedCardCredentialId: string;
  savedCardCredentialVersion: string;
}>): SavedCardSetupSession {
  const current = session(input.current);
  if (
    current.version !== input.expectedVersion ||
    (current.state !== "execution_pending" && current.state !== "requires_customer_action")
  ) {
    fail("state_transition_invalid");
  }
  return session({
    ...current,
    version: current.version + 1,
    state: "credential_active",
    savedCardCredentialId: identifier(input.savedCardCredentialId),
    savedCardCredentialVersion: revision(input.savedCardCredentialVersion)
  });
}

function assertExpected(
  input: SavedCardSetupSession,
  expectedVersion: number,
  expectedState: SavedCardSetupSessionState
): SavedCardSetupSession {
  const current = session(input);
  if (current.version !== expectedVersion) fail("version_conflict");
  if (current.state !== expectedState) fail("state_transition_invalid");
  return current;
}

function session(input: SavedCardSetupSession): SavedCardSetupSession {
  if (
    !Number.isSafeInteger(input.version) || input.version < 1 ||
    !Number.isSafeInteger(input.expectedSubscriptionVersion) || input.expectedSubscriptionVersion < 1 ||
    !revision(input.consentVersion) ||
    !savedCardSetupSessionStateValues.includes(input.state) ||
    !identifier(input.setupSessionId) || !identifier(input.subscriptionId) || !identifier(input.ownerUserId) ||
    !identifier(input.consentId) ||
    (input.economicPaymentIntentId !== null && !identifier(input.economicPaymentIntentId)) ||
    (input.providerSetupId !== null && !identifier(input.providerSetupId)) ||
    (input.savedCardCredentialId !== null && !identifier(input.savedCardCredentialId)) ||
    (input.savedCardCredentialVersion !== null && !revision(input.savedCardCredentialVersion)) ||
    ((input.state === "setup_requested" && (input.economicPaymentIntentId !== null || input.providerSetupId !== null || input.savedCardCredentialId !== null || input.savedCardCredentialVersion !== null)) ||
      (input.state === "preparation_pending" && (input.economicPaymentIntentId === null || input.providerSetupId !== null || input.savedCardCredentialId !== null || input.savedCardCredentialVersion !== null)) ||
      (input.state === "tokenization_required" && (input.economicPaymentIntentId === null || input.providerSetupId === null || input.savedCardCredentialId !== null || input.savedCardCredentialVersion !== null)) ||
      ((input.state === "execution_pending" || input.state === "requires_customer_action") &&
        (input.economicPaymentIntentId === null || input.providerSetupId === null || input.savedCardCredentialId !== null || input.savedCardCredentialVersion !== null)) ||
      (input.state === "credential_active" && (input.providerSetupId === null || input.savedCardCredentialId === null || input.savedCardCredentialVersion === null)))
  ) fail("invalid_session");
  return Object.freeze({ ...input });
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail("invalid_session");
  return value;
}

function revision(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value) || value.length > 38) fail("invalid_session");
  return value;
}

function fail(reason: SavedCardSetupSessionError["reason"]): never {
  throw new SavedCardSetupSessionError(reason);
}
