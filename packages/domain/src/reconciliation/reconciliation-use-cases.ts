import type { PaymentProviderEvent } from "../payments";
import type {
  ReconciliationRecord,
  ReconciliationStore,
  ReconciliationExceptionResolution
} from "./reconciliation-store";

export class ReconciliationAttemptNotFoundError extends Error {
  readonly code = "reconciliation_attempt_not_found";

  constructor() {
    super("Payment attempt was not found for reconciliation");
    this.name = "ReconciliationAttemptNotFoundError";
  }
}

export class ReconciliationProviderContextMismatchError extends Error {
  readonly code = "reconciliation_provider_context_mismatch";

  constructor() {
    super("Reconciliation provider event does not match payment attempt context");
    this.name = "ReconciliationProviderContextMismatchError";
  }
}

export class ReconciliationExceptionEvidenceError extends Error {
  readonly code = "reconciliation_exception_evidence_invalid";

  constructor() {
    super("Reconciliation exception evidence is missing or invalid");
    this.name = "ReconciliationExceptionEvidenceError";
  }
}

export class ReconciliationRecordNotFoundError extends Error {
  readonly code = "reconciliation_record_not_found";

  constructor() {
    super("Reconciliation record was not found");
    this.name = "ReconciliationRecordNotFoundError";
  }
}

export async function recordProviderSettlementMatch(input: {
  readonly store: ReconciliationStore;
  readonly paymentAttemptId: string;
  readonly providerEvent: PaymentProviderEvent & { readonly type: "payment.settled" };
  readonly checkedAt: Date;
}): Promise<{ readonly kind: "created" | "replayed"; readonly record: ReconciliationRecord }> {
  const attempt = await requireMatchingAttempt(input.store, input.paymentAttemptId, input.providerEvent);
  return input.store.createRecord({
    provider: input.providerEvent.provider,
    environment: input.providerEvent.environment,
    providerPaymentId: input.providerEvent.providerPaymentId ?? attempt.providerPaymentId,
    providerPayoutId: null,
    providerSettlementId: readOptionalString(input.providerEvent.payload, [
      "data",
      "settlement_id"
    ]),
    providerEventId: input.providerEvent.id,
    status: "matched",
    exceptionCode: null,
    exceptionMessage: null,
    providerOccurredAt: input.providerEvent.occurredAt,
    checkedAt: input.checkedAt.toISOString(),
    payload: {
      source: "payment.settled",
      providerWebhookId: input.providerEvent.providerWebhookId,
      payload: input.providerEvent.payload
    }
  });
}

export async function recordProviderReconciliationException(input: {
  readonly store: ReconciliationStore;
  readonly paymentAttemptId: string;
  readonly providerEvent: PaymentProviderEvent & { readonly type: "reconciliation.exception" };
  readonly checkedAt: Date;
}): Promise<{ readonly kind: "created" | "replayed"; readonly record: ReconciliationRecord }> {
  const attempt = await requireMatchingAttempt(input.store, input.paymentAttemptId, input.providerEvent);
  const exceptionCode = readRequiredString(input.providerEvent.payload, [
    "data",
    "exception_code"
  ]);
  const exceptionMessage = readRequiredString(input.providerEvent.payload, [
    "data",
    "exception_message"
  ]);
  return input.store.createRecord({
    provider: input.providerEvent.provider,
    environment: input.providerEvent.environment,
    providerPaymentId: input.providerEvent.providerPaymentId ?? attempt.providerPaymentId,
    providerPayoutId: null,
    providerSettlementId: readOptionalString(input.providerEvent.payload, [
      "data",
      "settlement_id"
    ]),
    providerEventId: input.providerEvent.id,
    status: "exception",
    exceptionCode,
    exceptionMessage,
    providerOccurredAt: input.providerEvent.occurredAt,
    checkedAt: input.checkedAt.toISOString(),
    payload: {
      source: "reconciliation.exception",
      providerWebhookId: input.providerEvent.providerWebhookId,
      payload: input.providerEvent.payload
    }
  });
}

export async function resolveProviderReconciliationException(input: {
  readonly store: Pick<ReconciliationStore, "resolveException">;
  readonly reconciliationRecordId: string;
  readonly resolution: ReconciliationExceptionResolution;
  readonly adminNote: string;
  readonly resolvedAt: Date;
}): Promise<ReconciliationRecord> {
  const record = await input.store.resolveException({
    reconciliationRecordId: input.reconciliationRecordId,
    resolution: input.resolution,
    resolvedAt: input.resolvedAt.toISOString(),
    adminNote: input.adminNote
  });
  if (!record) throw new ReconciliationRecordNotFoundError();
  return record;
}

async function requireMatchingAttempt(
  store: ReconciliationStore,
  paymentAttemptId: string,
  event: PaymentProviderEvent
) {
  const attempt = await store.findAttemptById(paymentAttemptId);
  if (!attempt) throw new ReconciliationAttemptNotFoundError();
  if (attempt.provider !== event.provider || attempt.environment !== event.environment) {
    throw new ReconciliationProviderContextMismatchError();
  }
  if (
    event.providerPaymentId &&
    attempt.providerPaymentId &&
    event.providerPaymentId !== attempt.providerPaymentId
  ) {
    throw new ReconciliationProviderContextMismatchError();
  }
  return attempt;
}

function readRequiredString(payload: Record<string, unknown>, path: readonly string[]): string {
  const value = readPath(payload, path);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReconciliationExceptionEvidenceError();
  }
  return value.trim();
}

function readOptionalString(
  payload: Record<string, unknown>,
  path: readonly string[]
): string | null {
  const value = readPath(payload, path);
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

function readPath(payload: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = payload;
  for (const part of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
