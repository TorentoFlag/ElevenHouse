/* eslint-disable no-control-regex -- Boundary validation intentionally rejects ASCII control characters. */
const maximumResponseBytes = 2 * 1024 * 1024;
const paymentOutcomeStatuses = new Set([
  "created",
  "pending",
  "pending_3ds",
  "authorized",
  "timeout",
  "declined",
  "failed",
  "captured",
  "settled",
  "voided",
  "expired",
  "refunded",
  "chargeback"
]);

export type ArcPayCanonicalCapturedPayment = Readonly<{
  providerPaymentId: string;
  externalId: string;
  amountMinor: number;
  capturedAmountMinor: number;
  currency: "RUB";
  status: "captured" | "settled";
  observedAt: string;
}>;

export type ArcPayCapturedPaymentList = Readonly<{
  payments: readonly ArcPayCanonicalCapturedPayment[];
}>;

/** A correlated provider resource observation; it is not itself permission to move money. */
export type ArcPayCanonicalPaymentOutcome = Readonly<{
  providerPaymentId: string;
  externalId: string;
  amountMinor: number;
  capturedAmountMinor: number;
  currency: "RUB";
  status:
    | "created"
    | "pending"
    | "pending_3ds"
    | "authorized"
    | "timeout"
    | "declined"
    | "failed"
    | "captured"
    | "settled"
    | "voided"
    | "expired"
    | "refunded"
    | "chargeback";
  observedAt: string;
}>;

/**
 * A refund is correlated through ArcPay's immutable operation reference, not merely through the
 * payment's terminal status. `cumulativeRefundedMinor` is the provider's current payment-level
 * fact and is deliberately kept distinct from this refund operation's delta.
 */
export type ArcPayCanonicalRefundOutcome = Readonly<{
  providerPaymentId: string;
  externalId: string;
  providerRefundId: string;
  amountMinor: number;
  cumulativeRefundedMinor: number;
  currency: "RUB";
  status: "succeeded" | "failed" | "in_flight" | "unknown";
  observedAt: string;
}>;

/**
 * A zero-value setup is usable only after ArcPay's canonical payment and customer-scoped
 * saved-card directory agree on the very same active credential. The token stays worker-only;
 * callers must seal it before passing a restricted handle into persistence.
 */
export type ArcPayCanonicalActivatedSavedCardSetup = Readonly<{
  providerSetupId: string;
  externalId: string;
  cardTokenId: string;
  displayBrand: string;
  displayLast4: string;
  displayMask: string;
  expiryMonth: number;
  expiryYear: number;
  observedAt: string;
}>;

export class ArcPayCanonicalPaymentReaderError extends Error {
  readonly code = "ARC_PAY_CANONICAL_PAYMENT_READER_ERROR" as const;

  constructor(
    readonly reason:
      | "not_configured"
      | "invalid_input"
      | "transport"
      | "response"
      | "correlation"
      | "not_captured"
      | "not_setup_terminal"
      | "credential"
      | "amount"
      | "currency"
  ) {
    super("ArcPay canonical payment could not be verified safely");
    this.name = "ArcPayCanonicalPaymentReaderError";
  }
}

/**
 * Worker-only canonical read for money-moving webhook processing. A webhook is delivery
 * evidence, not a balance mutation: this reader re-fetches ArcPay's current payment resource,
 * retains the exact bytes for a sealed artifact, and returns only a fully correlated capture.
 */
export function createArcPayCanonicalPaymentReader(
  config: Readonly<{ apiBaseUrl: string; apiSecret: string | null }>,
  fetchImpl: typeof fetch = fetch
): ArcPayCanonicalPaymentReader {
  const apiBaseUrl = httpsBaseUrl(config.apiBaseUrl);
  const readPaymentOutcomeById = async (
    input: Readonly<{
      providerPaymentId: string;
    }>
  ) => {
    const providerPaymentId = uuid(input.providerPaymentId);
    if (!config.apiSecret?.trim()) fail("not_configured");

    let response: Response;
    try {
      response = await fetchImpl(
        new URL(`/v1/payments/${encodeURIComponent(providerPaymentId)}`, apiBaseUrl),
        { headers: { authorization: `Bearer ${config.apiSecret}` } }
      );
    } catch {
      fail("transport");
    }
    if (!response.ok) fail("transport");
    const rawResponseBytes = await readBoundedBody(response);
    const payment = parsePaymentOutcome(parseJson(rawResponseBytes), providerPaymentId);
    return Object.freeze({ payment, rawResponseBytes });
  };
  const readPaymentOutcome = async (
    input: Readonly<{
      providerPaymentId: string;
      expectedExternalId: string;
    }>
  ) => {
    const expectedExternalId = externalId(input.expectedExternalId);
    const observation = await readPaymentOutcomeById({
      providerPaymentId: input.providerPaymentId
    });
    if (observation.payment.externalId !== expectedExternalId) fail("correlation");
    return observation;
  };
  return Object.freeze({
    async listCapturedPayments(input) {
      const pageSize = positivePageSize(input.pageSize);
      const expectedExternalId = externalId(input.expectedExternalId);
      const expectedAmountMinor = positiveMinor(input.expectedAmountMinor, "invalid_input");
      if (input.expectedCurrency !== "RUB") fail("currency");
      if (!config.apiSecret?.trim()) fail("not_configured");
      const rawResponseBytes = await fetchJson({
        apiBaseUrl,
        apiSecret: config.apiSecret,
        path: `/v1/payments?status=captured&page_size=${pageSize}`,
        fetchImpl
      });
      const payments = parsePaymentList(parseJson(rawResponseBytes))
        .map((payment) => parsePaymentOutcome(payment, uuid(payment.id)))
        .filter(
          (payment): payment is ArcPayCanonicalCapturedPayment =>
            payment.externalId === expectedExternalId &&
            payment.status === "captured" &&
            payment.amountMinor === expectedAmountMinor &&
            payment.capturedAmountMinor === expectedAmountMinor &&
            payment.currency === "RUB"
        );
      return Object.freeze({ payments });
    },
    async readCapturedPayment(input) {
      const observation = await readPaymentOutcome(input);
      if (observation.payment.status !== "captured" && observation.payment.status !== "settled") {
        fail("not_captured");
      }
      if (observation.payment.capturedAmountMinor !== observation.payment.amountMinor)
        fail("amount");
      return Object.freeze({
        payment: observation.payment as ArcPayCanonicalCapturedPayment,
        rawResponseBytes: observation.rawResponseBytes
      });
    },
    readPaymentOutcomeById,
    readPaymentOutcome,
    async readRefundOutcome(
      input: Readonly<{
        providerPaymentId: string;
        expectedExternalId: string;
        providerRefundId: string;
        expectedRefundAmountMinor: number;
        previousCumulativeRefundedMinor: number;
        expectedCumulativeRefundedMinor: number;
      }>
    ) {
      const providerRefundId = uuid(input.providerRefundId);
      const expectedRefundAmountMinor = positiveMinor(
        input.expectedRefundAmountMinor,
        "invalid_input"
      );
      const previousCumulativeRefundedMinor = nonNegativeMinor(
        input.previousCumulativeRefundedMinor,
        "invalid_input"
      );
      const expectedCumulativeRefundedMinor = positiveMinor(
        input.expectedCumulativeRefundedMinor,
        "invalid_input"
      );
      if (
        expectedCumulativeRefundedMinor <= previousCumulativeRefundedMinor ||
        expectedCumulativeRefundedMinor - previousCumulativeRefundedMinor !==
          expectedRefundAmountMinor
      ) {
        fail("invalid_input");
      }
      const observation = await readPaymentOutcome({
        providerPaymentId: input.providerPaymentId,
        expectedExternalId: input.expectedExternalId
      });
      return Object.freeze({
        refund: parseRefundOutcome({
          payload: parseJson(observation.rawResponseBytes),
          payment: observation.payment,
          providerRefundId,
          expectedRefundAmountMinor,
          previousCumulativeRefundedMinor,
          expectedCumulativeRefundedMinor
        }),
        rawResponseBytes: observation.rawResponseBytes
      });
    },
    async readActivatedSavedCardSetup(
      input: Readonly<{
        providerSetupId: string;
        expectedExternalId: string;
        providerCustomerId: string;
      }>
    ) {
      const providerSetupId = uuid(input.providerSetupId);
      const expectedExternalId = externalId(input.expectedExternalId);
      const providerCustomerId = customerId(input.providerCustomerId);
      if (!config.apiSecret?.trim()) fail("not_configured");

      const paymentResponse = await fetchJson({
        apiBaseUrl,
        apiSecret: config.apiSecret,
        path: `/v1/payments/${encodeURIComponent(providerSetupId)}`,
        fetchImpl
      });
      const paymentPayload = parseJson(paymentResponse);
      const setup = parseTerminalSavedCardSetup(
        paymentPayload,
        providerSetupId,
        expectedExternalId
      );
      const savedCardsResponse = await fetchJson({
        apiBaseUrl,
        apiSecret: config.apiSecret,
        path: `/v1/cards?customer_id=${encodeURIComponent(providerCustomerId)}`,
        fetchImpl
      });
      const credential = parseActiveSavedCard(parseJson(savedCardsResponse), setup.cardTokenId);
      return Object.freeze({
        setup: Object.freeze({ ...setup, ...credential }),
        rawPaymentResponseBytes: paymentResponse,
        rawSavedCardsResponseBytes: savedCardsResponse
      });
    }
  });
}

export type ArcPayCanonicalPaymentReader = Readonly<{
  listCapturedPayments(
    input: Readonly<{
      pageSize: number;
      expectedExternalId: string;
      expectedAmountMinor: number;
      expectedCurrency: "RUB";
    }>
  ): Promise<ArcPayCapturedPaymentList>;
  readCapturedPayment(
    input: Readonly<{
      providerPaymentId: string;
      expectedExternalId: string;
    }>
  ): Promise<
    Readonly<{
      payment: ArcPayCanonicalCapturedPayment;
      rawResponseBytes: Uint8Array;
    }>
  >;
  readPaymentOutcome(
    input: Readonly<{
      providerPaymentId: string;
      expectedExternalId: string;
    }>
  ): Promise<
    Readonly<{
      payment: ArcPayCanonicalPaymentOutcome;
      rawResponseBytes: Uint8Array;
    }>
  >;
  /**
   * Read-only identity discovery for a verified webhook. Its output is not a financial authority:
   * the caller must resolve the returned external id to a locked ElevenHouse checkout and then
   * issue a second correlated canonical read before committing any financial effect.
   */
  readPaymentOutcomeById(
    input: Readonly<{
      providerPaymentId: string;
    }>
  ): Promise<
    Readonly<{
      payment: ArcPayCanonicalPaymentOutcome;
      rawResponseBytes: Uint8Array;
    }>
  >;
  readRefundOutcome(
    input: Readonly<{
      providerPaymentId: string;
      expectedExternalId: string;
      providerRefundId: string;
      expectedRefundAmountMinor: number;
      previousCumulativeRefundedMinor: number;
      expectedCumulativeRefundedMinor: number;
    }>
  ): Promise<
    Readonly<{
      refund: ArcPayCanonicalRefundOutcome;
      rawResponseBytes: Uint8Array;
    }>
  >;
  readActivatedSavedCardSetup(
    input: Readonly<{
      providerSetupId: string;
      expectedExternalId: string;
      providerCustomerId: string;
    }>
  ): Promise<
    Readonly<{
      setup: ArcPayCanonicalActivatedSavedCardSetup;
      rawPaymentResponseBytes: Uint8Array;
      rawSavedCardsResponseBytes: Uint8Array;
    }>
  >;
}>;

async function fetchJson(
  input: Readonly<{
    apiBaseUrl: URL;
    apiSecret: string;
    path: string;
    fetchImpl: typeof fetch;
  }>
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await input.fetchImpl(new URL(input.path, input.apiBaseUrl), {
      headers: { authorization: `Bearer ${input.apiSecret}` }
    });
  } catch {
    fail("transport");
  }
  if (!response.ok) fail("transport");
  return readBoundedBody(response);
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumResponseBytes)
  ) {
    fail("response");
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    fail("transport");
  }
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > maximumResponseBytes ||
    !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    fail("response");
  }
  return bytes;
}

function parseJson(bytes: Uint8Array): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("response");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) fail("response");
  return payload as Record<string, unknown>;
}

function parsePaymentOutcome(
  payload: Record<string, unknown>,
  providerPaymentId: string
): ArcPayCanonicalPaymentOutcome {
  if (uuid(payload.id) !== providerPaymentId) fail("correlation");
  const returnedExternalId = externalId(payload.external_id);
  const amountMinor = positiveMinor(payload.amount, "amount");
  const capturedAmountMinor = nonNegativeMinor(payload.captured_amount, "amount");
  if (payload.currency !== "RUB") fail("currency");
  if (capturedAmountMinor > amountMinor) fail("amount");
  const status = paymentOutcomeStatus(payload.status);
  if (!instant(payload.created_at) || !instant(payload.updated_at)) fail("response");
  return Object.freeze({
    providerPaymentId,
    externalId: returnedExternalId,
    amountMinor,
    capturedAmountMinor,
    currency: "RUB",
    status,
    observedAt: payload.updated_at as string
  });
}

function parsePaymentList(payload: Record<string, unknown>): readonly Record<string, unknown>[] {
  if (!Array.isArray(payload.payments)) fail("response");
  return payload.payments.map((payment) => {
    if (typeof payment !== "object" || payment === null || Array.isArray(payment)) {
      fail("response");
    }
    return payment as Record<string, unknown>;
  });
}

function parseRefundOutcome(
  input: Readonly<{
    payload: Record<string, unknown>;
    payment: ArcPayCanonicalPaymentOutcome;
    providerRefundId: string;
    expectedRefundAmountMinor: number;
    previousCumulativeRefundedMinor: number;
    expectedCumulativeRefundedMinor: number;
  }>
): ArcPayCanonicalRefundOutcome {
  if (!Array.isArray(input.payload.operations)) fail("response");
  const operations = input.payload.operations.filter(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value)
  );
  if (operations.length !== input.payload.operations.length) fail("response");
  const matches = operations.filter(
    (operation) =>
      operation.operation_type === "refund" && operation.operation_ref_id === input.providerRefundId
  );
  if (matches.length !== 1) fail("correlation");
  const operation = matches[0];
  if (!operation) fail("correlation");
  if (positiveMinor(operation.amount, "response") !== input.expectedRefundAmountMinor) {
    fail("amount");
  }
  if (
    operation.currency !== "RUB" ||
    !instant(operation.created_at) ||
    !instant(operation.updated_at)
  ) {
    fail("response");
  }
  const status = refundOperationStatus(operation.status);
  if (status === "succeeded" && !instant(operation.completed_at)) fail("response");
  const cumulativeRefundedMinor = nonNegativeMinor(input.payload.refunded_amount, "response");
  if (cumulativeRefundedMinor > input.payment.capturedAmountMinor) fail("amount");
  if (status === "succeeded" && cumulativeRefundedMinor !== input.expectedCumulativeRefundedMinor) {
    fail("amount");
  }
  if (status === "failed" && cumulativeRefundedMinor !== input.previousCumulativeRefundedMinor) {
    fail("amount");
  }
  if (
    (status === "in_flight" || status === "unknown") &&
    (cumulativeRefundedMinor < input.previousCumulativeRefundedMinor ||
      cumulativeRefundedMinor > input.expectedCumulativeRefundedMinor)
  ) {
    fail("amount");
  }
  return Object.freeze({
    providerPaymentId: input.payment.providerPaymentId,
    externalId: input.payment.externalId,
    providerRefundId: input.providerRefundId,
    amountMinor: input.expectedRefundAmountMinor,
    cumulativeRefundedMinor,
    currency: "RUB",
    status,
    observedAt: input.payment.observedAt
  });
}

function parseTerminalSavedCardSetup(
  payload: Record<string, unknown>,
  providerSetupId: string,
  expectedExternalId: string
): Readonly<{
  providerSetupId: string;
  externalId: string;
  cardTokenId: string;
  observedAt: string;
}> {
  if (
    uuid(payload.id) !== providerSetupId ||
    externalId(payload.external_id) !== expectedExternalId
  ) {
    fail("correlation");
  }
  if (payload.currency !== "RUB") fail("currency");
  if (
    nonNegativeMinor(payload.amount, "amount") !== 0 ||
    nonNegativeMinor(payload.captured_amount, "amount") !== 0
  ) {
    fail("amount");
  }
  if (payload.payment_method !== "bank_card") fail("credential");
  if (payload.status !== "captured" && payload.status !== "settled") fail("not_setup_terminal");
  if (!instant(payload.created_at) || !instant(payload.updated_at)) fail("response");
  return Object.freeze({
    providerSetupId,
    externalId: expectedExternalId,
    cardTokenId: uuidCredential(payload.card_token_id),
    observedAt: payload.updated_at
  });
}

function parseActiveSavedCard(
  payload: Record<string, unknown>,
  expectedCardTokenId: string
): Readonly<{
  displayBrand: string;
  displayLast4: string;
  displayMask: string;
  expiryMonth: number;
  expiryYear: number;
}> {
  if (!Array.isArray(payload.cards)) fail("credential");
  const matching = payload.cards.filter(
    (card): card is Record<string, unknown> =>
      typeof card === "object" &&
      card !== null &&
      !Array.isArray(card) &&
      card.card_token_id === expectedCardTokenId
  );
  if (matching.length !== 1) fail("credential");
  const card = matching[0];
  if (!card) fail("credential");
  if (card.is_active !== true || !instant(card.created_at)) fail("credential");
  const last4 = maskedCardLast4(card.card_mask);
  const brand = cardBrand(card.card_scheme);
  const expiryMonth = boundedInteger(card.expiry_month, 1, 12, "credential");
  const expiryYear = boundedInteger(card.expiry_year, 2000, 9999, "credential");
  if (
    typeof card.bank_code !== "string" ||
    card.bank_code.length < 1 ||
    card.bank_code.length > 160
  ) {
    fail("credential");
  }
  return Object.freeze({
    displayBrand: brand,
    displayLast4: last4,
    displayMask: `************${last4}`,
    expiryMonth,
    expiryYear
  });
}

function httpsBaseUrl(value: string): URL {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
    return parsed;
  } catch {
    fail("not_configured");
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function uuidCredential(value: unknown): string {
  try {
    return uuid(value);
  } catch {
    return fail("credential");
  }
}

function externalId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("response");
  }
  return value;
}

function customerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function maskedCardLast4(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9*]{8,32}$/.test(value)) fail("credential");
  const match = /([0-9]{4})$/.exec(value);
  if (!match) fail("credential");
  return match[1] ?? fail("credential");
}

function cardBrand(value: unknown): string {
  if (typeof value !== "string") fail("credential");
  const normalized = value.toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized)) fail("credential");
  return normalized;
}

function positiveMinor(value: unknown, reason: "amount" | "response" | "invalid_input"): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(reason);
  return value as number;
}

function nonNegativeMinor(value: unknown, reason: "amount" | "response" | "invalid_input"): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(reason);
  return value as number;
}

function positivePageSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) {
    fail("invalid_input");
  }
  return value as number;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  reason: ArcPayCanonicalPaymentReaderError["reason"]
): number {
  if (!Number.isSafeInteger(value)) fail(reason);
  const numeric = value as number;
  if (numeric < minimum || numeric > maximum) fail(reason);
  return value as number;
}

function paymentOutcomeStatus(value: unknown): ArcPayCanonicalPaymentOutcome["status"] {
  if (!paymentOutcomeStatuses.has(value as string)) fail("response");
  return value as ArcPayCanonicalPaymentOutcome["status"];
}

function refundOperationStatus(value: unknown): ArcPayCanonicalRefundOutcome["status"] {
  if (value !== "succeeded" && value !== "failed" && value !== "in_flight" && value !== "unknown") {
    fail("response");
  }
  return value;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function fail(reason: ArcPayCanonicalPaymentReaderError["reason"]): never {
  throw new ArcPayCanonicalPaymentReaderError(reason);
}
