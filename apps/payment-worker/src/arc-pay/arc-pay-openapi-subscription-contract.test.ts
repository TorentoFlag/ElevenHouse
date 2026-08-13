import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const reviewedFixtureSha256 = "324c994d8e53236cdff1d221f90fabfde9a2d54ef71df7f67aa4948676e930ff";
const canonicalPaymentStatuses = [
  "created",
  "pending",
  "pending_3ds",
  "authorized",
  "captured",
  "settled",
  "voided",
  "expired",
  "refunded",
  "chargeback",
  "declined",
  "failed",
  "timeout"
] as const;

type OpenApiSchema = Readonly<{
  description?: string;
  enum?: readonly string[];
  name?: string;
  properties?: Readonly<Record<string, OpenApiSchema>>;
  required?: readonly string[];
  $ref?: string;
}>;

type OpenApiOperation = Readonly<{
  description?: string;
  parameters?: readonly OpenApiSchema[];
  requestBody?: Readonly<{
    content: Readonly<Record<string, Readonly<{ schema: OpenApiSchema }>>>;
  }>;
  responses?: Readonly<Record<string, OpenApiSchema>>;
}>;

type ReviewedOpenApi = Readonly<{
  info: Readonly<{ title: string; version: string; description: string }>;
  servers: readonly Readonly<{ url: string }>[];
  paths: Readonly<Record<string, Readonly<{ get?: OpenApiOperation; post?: OpenApiOperation }>>>;
  components: Readonly<{
    parameters: Readonly<Record<string, OpenApiSchema>>;
    responses: Readonly<Record<string, OpenApiSchema>>;
    schemas: Readonly<Record<string, OpenApiSchema>>;
  }>;
}>;

const fixturePath = join(__dirname, "fixtures", "openapi-2026-08-12.json");
const fixtureHashPath = join(__dirname, "fixtures", "openapi-2026-08-12.sha256");

describe("reviewed ArcPay recurring-payment OpenAPI evidence", () => {
  it("pins the exact official fixture bytes and reviewed stable API identity", () => {
    const bytes = readFileSync(fixturePath);
    const recordedHash = readFileSync(fixtureHashPath, "utf8").trim();
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    const api = JSON.parse(bytes.toString("utf8")) as ReviewedOpenApi;

    expect(recordedHash).toBe(`${reviewedFixtureSha256}  openapi-2026-08-12.json`);
    expect(actualHash).toBe(reviewedFixtureSha256);
    expect(api.info).toMatchObject({ title: "Arc Pay API", version: "1.0.0" });
    expect(api.info.description).toContain("`/v1` is the stable public API base path");
    expect(api.info.description).toContain(
      "Generated clients should pin a downloaded OpenAPI file"
    );
    expect(api.servers).toContainEqual(
      expect.objectContaining({ url: "https://api.arcpay.space/v1" })
    );
  });

  it("requires the explicit zero-amount card-setup flow before a reusable credential exists", () => {
    const api = readFixture();
    const cardSetup = operation(api, "/cards/setup", "post");
    const savedCard = operation(api, "/payments/saved-card", "post");
    const setupRequest = schema(api, "create-card-setup-request");
    const savedCardRequest = schema(api, "charge-saved-card-request");

    expect(cardSetup.description).toContain("zero-amount card setup intent");
    expect(cardSetup.description).toContain("real reusable binding/rebill identifier");
    expect(setupRequest.required).toEqual(["currency", "customer_id", "success_url", "fail_url"]);
    expect(savedCard.description).toContain("`card_token_id` created by `POST /cards/setup`");
    expect(savedCardRequest.required).toEqual([
      "amount",
      "currency",
      "card_token_id",
      "customer_id"
    ]);
    expect(savedCardRequest.properties?.stored_credential_reason?.enum).toEqual([
      "unscheduled_cof",
      "recurring"
    ]);
    expect(savedCardRequest.properties?.recurring_frequency_days?.description).toContain(
      "Required when stored_credential_reason is recurring"
    );
  });

  it("keeps hosted checkout distinct from the reusable saved-card contract", () => {
    const api = readFixture();
    const hostedRequest = schema(api, "create-checkout-session-request");
    const hostedResponse = schema(api, "checkout-session");

    expect(hostedRequest.required).toEqual([
      "amount",
      "currency",
      "payment_methods",
      "capture_mode"
    ]);
    expect(Object.keys(hostedRequest.properties ?? {})).not.toContain("card_token_id");
    expect(Object.keys(hostedRequest.properties ?? {})).not.toContain("stored_credential_reason");
    expect(Object.keys(hostedRequest.properties ?? {})).not.toContain("recurring_frequency_days");
    expect(hostedResponse.required).toEqual(["id", "url"]);
    expect(Object.keys(hostedResponse.properties ?? {})).toEqual(["id", "url"]);
  });

  it("pins idempotency, ambiguous timeout, canonical lookup and webhook deduplication rules", () => {
    const api = readFixture();
    const idempotencyKey = api.components.parameters.IdempotencyKey;
    const serviceUnavailable = api.components.responses.ServiceUnavailable;
    const timeout = api.components.responses.Timeout;
    const paymentList = operation(api, "/payments", "get");
    const search = paymentList.parameters?.find((parameter) => parameter.name === "search");
    const webhook = schema(api, "webhook-event");

    expect(idempotencyKey?.description).toContain("same request payload within 72h");
    expect(idempotencyKey?.description).toContain("same key with different request parameters");
    expect(serviceUnavailable?.description).toContain("keep the same `Idempotency-Key`");
    expect(timeout?.description).toContain("Treat this as pending confirmation, not a decline");
    expect(timeout?.description).toContain("Do not repeat the payment with a new idempotency key");
    expect(search).toBeDefined();
    expect(webhook.properties?.event_id?.description).toContain(
      "Arc Pay guarantees at-least-once delivery"
    );
  });

  it("pins the exhaustive provider statuses and reversal evidence used by reconciliation", () => {
    const api = readFixture();
    const payment = schema(api, "payment");
    const chargeback = schema(api, "event-payment-chargeback");
    const refunded = schema(api, "event-payment-refunded");

    expect(payment.properties?.status?.enum).toEqual(canonicalPaymentStatuses);
    expect(payment.properties?.status?.description).toContain(
      "`created`, `pending`, `pending_3ds`, and\n`timeout` are non-terminal"
    );
    expect(payment.required).toEqual(
      expect.arrayContaining(["id", "amount", "currency", "status", "operations"])
    );
    expect(payment.properties).toHaveProperty("captured_amount");
    expect(payment.properties).toHaveProperty("refunded_amount");
    expect(chargeback.description).toContain("filed a dispute");
    expect(refunded.description).toContain("Partial refunds are supported");
  });
});

function readFixture(): ReviewedOpenApi {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ReviewedOpenApi;
}

function schema(api: ReviewedOpenApi, name: string): OpenApiSchema {
  const value = api.components.schemas[name];
  if (!value) throw new Error(`Reviewed ArcPay schema is missing: ${name}`);
  return value;
}

function operation(api: ReviewedOpenApi, path: string, method: "get" | "post"): OpenApiOperation {
  const value = api.paths[path]?.[method];
  if (!value)
    throw new Error(`Reviewed ArcPay operation is missing: ${method.toUpperCase()} ${path}`);
  return value;
}
