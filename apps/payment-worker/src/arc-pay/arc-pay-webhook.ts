import type { PaymentProviderEventType, PaymentWebhookMoneyFacts } from "@elevenhouse/domain";

const supportedEventTypes = new Set<PaymentProviderEventType>([
  "payment.created",
  "payment.pending_3ds",
  "payment.authorized",
  "payment.captured",
  "payment.settled",
  "payment.declined",
  "payment.failed",
  "payment.timeout",
  "payment.expired",
  "payment.voided",
  "payment.refunded",
  "payment.partially_refunded",
  "payment.chargeback",
  "reconciliation.exception"
]);

export type ArcPayWebhookEvent = {
  readonly providerWebhookId: string;
  readonly providerPaymentId: string;
  readonly type: PaymentProviderEventType;
  readonly environment: "sandbox" | "live";
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
  readonly moneyFacts: PaymentWebhookMoneyFacts;
};

export class ArcPayWebhookPayloadError extends Error {
  constructor() {
    super("Arc Pay webhook payload does not match the supported OpenAPI envelope");
    this.name = "ArcPayWebhookPayloadError";
  }
}

export function parseArcPayWebhook(input: {
  readonly webhookId: string;
  readonly rawBody: string;
}): ArcPayWebhookEvent {
  let source: unknown;
  try {
    source = JSON.parse(input.rawBody);
  } catch {
    throw new ArcPayWebhookPayloadError();
  }
  const payload = record(source);
  const eventId = uuid(payload.event_id);
  if (eventId !== input.webhookId) throw new ArcPayWebhookPayloadError();
  const type = string(payload.event_type) as PaymentProviderEventType;
  if (!supportedEventTypes.has(type)) throw new ArcPayWebhookPayloadError();
  const environment = environmentValue(payload.environment);
  if (payload.livemode !== (environment === "live")) throw new ArcPayWebhookPayloadError();
  const occurredAt = isoDateTime(payload.created_at);
  uuid(payload.tenant_id);
  const data = record(payload.data);
  const providerPaymentId = uuid(data.payment_id);

  return {
    providerWebhookId: eventId,
    providerPaymentId,
    type,
    environment,
    occurredAt,
    payload,
    moneyFacts: parseMoneyFacts(type, data)
  };
}

function parseMoneyFacts(
  type: PaymentProviderEventType,
  data: Record<string, unknown>
): PaymentWebhookMoneyFacts {
  if (type === "payment.captured") {
    const currency = currencyValue(data.currency);
    return {
      kind: "exact",
      amounts: [money(data.amount, currency), money(data.captured_amount, currency)]
    };
  }
  if (type === "payment.refunded" || type === "payment.partially_refunded") {
    const currency = currencyValue(data.currency);
    uuid(data.refund_id);
    const refundAmount = money(data.refund_amount, currency);
    const totalRefunded = money(data.total_refunded, currency);
    if (totalRefunded.amountMinor < refundAmount.amountMinor) throw new ArcPayWebhookPayloadError();
    return { kind: "bounded", amounts: [refundAmount, totalRefunded] };
  }
  if (type === "payment.chargeback") {
    const currency = currencyValue(data.currency);
    return { kind: "bounded", amounts: [money(data.amount, currency)] };
  }
  if (type === "payment.timeout") {
    const currency = currencyValue(data.currency);
    return { kind: "exact", amounts: [money(data.amount, currency)] };
  }
  if (type === "payment.declined" || type === "payment.failed" || type === "payment.voided") {
    const currency = currencyValue(data.currency);
    return { kind: "exact", amounts: [money(data.amount, currency)] };
  }
  if (type === "payment.expired") {
    positiveMinorUnit(data.amount);
    string(data.from_status);
    return { kind: "none", amounts: [] };
  }
  return { kind: "none", amounts: [] };
}

function money(
  value: unknown,
  currency: string
): { readonly amountMinor: number; readonly currency: string } {
  return { amountMinor: positiveMinorUnit(value), currency };
}

function positiveMinorUnit(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ArcPayWebhookPayloadError();
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArcPayWebhookPayloadError();
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ArcPayWebhookPayloadError();
  return value;
}

function uuid(value: unknown): string {
  const parsed = string(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    throw new ArcPayWebhookPayloadError();
  }
  return parsed;
}

function isoDateTime(value: unknown): string {
  const parsed = string(value);
  if (Number.isNaN(Date.parse(parsed))) throw new ArcPayWebhookPayloadError();
  return parsed;
}

function environmentValue(value: unknown): "sandbox" | "live" {
  if (value === "sandbox" || value === "live") return value;
  throw new ArcPayWebhookPayloadError();
}

function currencyValue(value: unknown): string {
  const parsed = string(value);
  if (!/^[A-Z]{3}$/.test(parsed)) throw new ArcPayWebhookPayloadError();
  return parsed;
}
