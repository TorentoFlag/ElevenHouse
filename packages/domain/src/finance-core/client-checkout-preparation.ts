/* eslint-disable no-control-regex -- Domain validation intentionally rejects ASCII control characters. */
/**
 * State visible to a linked client while the payment worker prepares Hosted Checkout.
 *
 * This aggregate intentionally has no checkout URL: the URL is an ephemeral provider action
 * recovered from its sealed response artifact for the authenticated order owner. It is not a
 * payment, authorization or capture fact.
 */
export type ClientCheckoutPreparationState =
  | "checkout_requested"
  | "checkout_ready"
  | "provider_session_unknown"
  | "failed";

export type ClientCheckoutPreparation = Readonly<{
  checkoutPreparationId: string;
  orderId: string;
  clientUserId: string;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
  requestArtifactId: string;
  requestArtifactDigest: `sha256:${string}`;
  version: number;
  state: ClientCheckoutPreparationState;
  providerCheckoutId: string | null;
  responseArtifactId: string | null;
  responseArtifactDigest: `sha256:${string}` | null;
  failureCode: string | null;
}>;

export type CreateClientCheckoutPreparationInput = Readonly<{
  checkoutPreparationId: string;
  orderId: string;
  clientUserId: string;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
  requestArtifactId: string;
  requestArtifactDigest: `sha256:${string}`;
}>;

export type PublishClientCheckoutReadyInput = Readonly<{
  providerCheckoutId: string;
  responseArtifactId: string;
  responseArtifactDigest: `sha256:${string}`;
}>;

export class ClientCheckoutPreparationIntegrityError extends Error {
  readonly code = "CLIENT_CHECKOUT_PREPARATION_INTEGRITY_ERROR" as const;

  constructor() {
    super("Client checkout preparation state is invalid");
  }
}

const createKeys = [
  "checkoutPreparationId",
  "orderId",
  "clientUserId",
  "economicPaymentIntentId",
  "economicPaymentSessionId",
  "providerOperationIntentId",
  "requestArtifactId",
  "requestArtifactDigest"
] as const;
const readyKeys = ["providerCheckoutId", "responseArtifactId", "responseArtifactDigest"] as const;

export function createClientCheckoutPreparation(
  input: CreateClientCheckoutPreparationInput
): ClientCheckoutPreparation {
  assertExactDataKeys(input, createKeys);
  return Object.freeze({
    checkoutPreparationId: uuid(input.checkoutPreparationId),
    orderId: uuid(input.orderId),
    clientUserId: uuid(input.clientUserId),
    economicPaymentIntentId: identifier(input.economicPaymentIntentId),
    economicPaymentSessionId: identifier(input.economicPaymentSessionId),
    providerOperationIntentId: uuid(input.providerOperationIntentId),
    requestArtifactId: identifier(input.requestArtifactId),
    requestArtifactDigest: digest(input.requestArtifactDigest),
    version: 1,
    state: "checkout_requested",
    providerCheckoutId: null,
    responseArtifactId: null,
    responseArtifactDigest: null,
    failureCode: null
  });
}

export function publishClientCheckoutReady(
  current: ClientCheckoutPreparation,
  input: PublishClientCheckoutReadyInput
): ClientCheckoutPreparation {
  assertRequested(current);
  assertExactDataKeys(input, readyKeys);
  return Object.freeze({
    ...current,
    version: current.version + 1,
    state: "checkout_ready",
    providerCheckoutId: uuid(input.providerCheckoutId),
    responseArtifactId: identifier(input.responseArtifactId),
    responseArtifactDigest: digest(input.responseArtifactDigest),
    failureCode: null
  });
}

export function recordClientCheckoutProviderSessionUnknown(
  current: ClientCheckoutPreparation
): ClientCheckoutPreparation {
  assertRequested(current);
  return Object.freeze({
    ...current,
    version: current.version + 1,
    state: "provider_session_unknown",
    providerCheckoutId: null,
    responseArtifactId: null,
    responseArtifactDigest: null,
    failureCode: null
  });
}

export function failClientCheckoutPreparation(
  current: ClientCheckoutPreparation,
  failureCode: string
): ClientCheckoutPreparation {
  assertRequested(current);
  return Object.freeze({
    ...current,
    version: current.version + 1,
    state: "failed",
    providerCheckoutId: null,
    responseArtifactId: null,
    responseArtifactDigest: null,
    failureCode: failureCodeValue(failureCode)
  });
}

function assertRequested(value: ClientCheckoutPreparation): void {
  if (!isValidPreparation(value) || value.state !== "checkout_requested") fail();
}

function isValidPreparation(value: ClientCheckoutPreparation): boolean {
  try {
    assertExactDataKeys(value, [
      ...createKeys,
      "version",
      "state",
      "providerCheckoutId",
      "responseArtifactId",
      "responseArtifactDigest",
      "failureCode"
    ]);
    uuid(value.checkoutPreparationId);
    uuid(value.orderId);
    uuid(value.clientUserId);
    identifier(value.economicPaymentIntentId);
    identifier(value.economicPaymentSessionId);
    uuid(value.providerOperationIntentId);
    identifier(value.requestArtifactId);
    digest(value.requestArtifactDigest);
    if (!Number.isSafeInteger(value.version) || value.version < 1) return false;
    if (
      value.state !== "checkout_requested" &&
      value.state !== "checkout_ready" &&
      value.state !== "provider_session_unknown" &&
      value.state !== "failed"
    ) {
      return false;
    }
    if (value.state === "checkout_ready") {
      uuid(value.providerCheckoutId ?? "");
      identifier(value.responseArtifactId ?? "");
      digest(value.responseArtifactDigest ?? "");
      return value.failureCode === null;
    }
    if (value.state === "failed") {
      failureCodeValue(value.failureCode ?? "");
      return (
        value.providerCheckoutId === null &&
        value.responseArtifactId === null &&
        value.responseArtifactDigest === null
      );
    }
    return (
      value.providerCheckoutId === null &&
      value.responseArtifactId === null &&
      value.responseArtifactDigest === null &&
      value.failureCode === null
    );
  } catch {
    return false;
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail();
  }
  return value;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail();
  }
  return value;
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail();
  return value as `sha256:${string}`;
}

function failureCodeValue(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9_]{1,100}$/.test(value)) fail();
  return value;
}

function assertExactDataKeys(value: unknown, expectedKeys: readonly string[]): void {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    fail();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) fail();
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail();
  }
}

function fail(): never {
  throw new ClientCheckoutPreparationIntegrityError();
}
