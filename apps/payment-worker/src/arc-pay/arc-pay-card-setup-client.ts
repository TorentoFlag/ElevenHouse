/* eslint-disable no-control-regex -- Boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  type ArcPayBrowserInfo,
  type ArcPayCardTokenizationSecret,
  type ProviderDispatchEnvelope
} from "@elevenhouse/domain/finance-core";
import {
  decodeArcPayThreeDsAction,
  type ArcPayThreeDsAction
} from "@elevenhouse/finance-infrastructure";

export type { ArcPayThreeDsAction } from "@elevenhouse/finance-infrastructure";

type CardSetupCreateEnvelope = Extract<
  ProviderDispatchEnvelope,
  { readonly kind: "card_setup"; readonly step: "create" }
>;
type CardSetupExecuteEnvelope = Extract<
  ProviderDispatchEnvelope,
  { readonly kind: "card_setup"; readonly step: "execute" }
>;

export type ArcPayCardSetup = Readonly<{
  /** ArcPay payment ID for the subsequent browser tokenization and execute steps. */
  providerSetupId: string;
  /** Exact private evidence bytes; the caller seals them before a durable state transition. */
  rawResponseBytes: Uint8Array;
}>;

export type ArcPayCardSetupExecution = Readonly<{
  providerSetupId: string;
  status: "authorized" | "captured" | "pending" | "pending_3ds" | "failed" | "declined";
  cardTokenId: string | null;
  nextAction: ArcPayThreeDsAction | null;
  rawResponseBytes: Uint8Array;
}>;

export class ArcPayCardSetupClientError extends Error {
  readonly code = "ARC_PAY_CARD_SETUP_CLIENT_ERROR" as const;

  constructor(
    readonly reason:
      | "not_configured"
      | "invalid_input"
      | "transport"
      | "provider_rejected"
      | "invalid_response"
  ) {
    super("ArcPay card setup could not be created safely");
  }
}

/**
 * Worker-only adapter for the first ArcPay saved-card action. It creates the zero-amount setup
 * payment but never receives PAN/CVV, never creates a reusable ElevenHouse credential, and does
 * not infer successful setup from a tokenization response. Those facts require the later execute
 * and canonical-provider verification path.
 */
export function createArcPayCardSetupClient(
  config: Readonly<{ apiBaseUrl: string; apiSecret: string | null }>,
  fetchImpl: typeof fetch = fetch
): Readonly<{
  createCardSetup(
    input: Readonly<{
      envelope: CardSetupCreateEnvelope;
      idempotencyKey: string;
    }>
  ): Promise<ArcPayCardSetup>;
  executeCardSetup(
    input: Readonly<{
      envelope: CardSetupExecuteEnvelope;
      tokenizationSecret: ArcPayCardTokenizationSecret;
      idempotencyKey: string;
    }>
  ): Promise<ArcPayCardSetupExecution>;
  completeThreeDsMethod(
    input: Readonly<{
      providerSetupId: string;
      completionIndicator: "Y" | "N" | "U";
      /** Extracted from the sealed provider response by the worker, never provided by the browser. */
      threeDsServerTransactionId: string;
      /** Reloaded from the one-time vault, never accepted from the completion endpoint. */
      browserInfo: ArcPayBrowserInfo;
      idempotencyKey: string;
    }>
  ): Promise<ArcPayCardSetupExecution>;
}> {
  const apiBaseUrl = httpsBaseUrl(config.apiBaseUrl);
  return Object.freeze({
    async createCardSetup(input) {
      if (!config.apiSecret?.trim()) fail("not_configured");
      if (!isIdempotencyKey(input.idempotencyKey)) fail("invalid_input");
      const envelope = cardSetupEnvelope(input.envelope);
      let response: Response;
      try {
        response = await fetchImpl(new URL("/cards/setup", apiBaseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiSecret}`,
            "content-type": "application/json",
            "idempotency-key": input.idempotencyKey
          },
          body: JSON.stringify({
            currency: "RUB",
            customer_id: envelope.customerId,
            external_id: envelope.setupExternalId,
            success_url: envelope.successUrl,
            fail_url: envelope.failureUrl
          })
        });
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("provider_rejected");
      let rawResponseBytes: Uint8Array;
      try {
        rawResponseBytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        fail("invalid_response");
      }
      if (rawResponseBytes.byteLength < 1 || rawResponseBytes.byteLength > 16 * 1024 * 1024) {
        fail("invalid_response");
      }
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawResponseBytes));
      } catch {
        fail("invalid_response");
      }
      return cardSetup(payload, rawResponseBytes);
    },
    async executeCardSetup(input) {
      if (!config.apiSecret?.trim()) fail("not_configured");
      if (!isIdempotencyKey(input.idempotencyKey)) fail("invalid_input");
      const envelope = cardSetupExecuteEnvelope(input.envelope);
      if (input.tokenizationSecret.providerSetupId !== envelope.providerSetupId)
        fail("invalid_input");
      let response: Response;
      try {
        response = await fetchImpl(
          new URL(`/payments/${encodeURIComponent(envelope.providerSetupId)}/execute`, apiBaseUrl),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.apiSecret}`,
              "content-type": "application/json",
              "idempotency-key": input.idempotencyKey
            },
            body: JSON.stringify({
              payment_method: "bank_card",
              payment_mode: "h2h",
              card_token_id: input.tokenizationSecret.cardTokenId,
              browser_info: browserInfo(input.tokenizationSecret.browserInfo)
            })
          }
        );
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("provider_rejected");
      let rawResponseBytes: Uint8Array;
      try {
        rawResponseBytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        fail("invalid_response");
      }
      if (rawResponseBytes.byteLength < 1 || rawResponseBytes.byteLength > 16 * 1024 * 1024)
        fail("invalid_response");
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawResponseBytes));
      } catch {
        fail("invalid_response");
      }
      return cardSetupExecution(payload, rawResponseBytes, envelope.providerSetupId);
    },
    async completeThreeDsMethod(input) {
      if (!config.apiSecret?.trim()) fail("not_configured");
      if (!isIdempotencyKey(input.idempotencyKey)) fail("invalid_input");
      if (
        !isUuid(input.providerSetupId) ||
        !completionIndicator(input.completionIndicator) ||
        !threeDsServerTransactionId(input.threeDsServerTransactionId)
      ) {
        fail("invalid_input");
      }
      const providerSetupId = input.providerSetupId;
      let response: Response;
      try {
        response = await fetchImpl(
          new URL(
            `/payments/${encodeURIComponent(providerSetupId)}/complete-3ds-method`,
            apiBaseUrl
          ),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.apiSecret}`,
              "content-type": "application/json",
              "idempotency-key": input.idempotencyKey
            },
            body: JSON.stringify({
              completion_indicator: input.completionIndicator,
              three_ds_server_trans_id: input.threeDsServerTransactionId,
              browser_info: browserInfo(input.browserInfo)
            })
          }
        );
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("provider_rejected");
      let rawResponseBytes: Uint8Array;
      try {
        rawResponseBytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        fail("invalid_response");
      }
      if (rawResponseBytes.byteLength < 1 || rawResponseBytes.byteLength > 16 * 1024 * 1024)
        fail("invalid_response");
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawResponseBytes));
      } catch {
        fail("invalid_response");
      }
      return cardSetupExecution(payload, rawResponseBytes, providerSetupId);
    }
  });
}

function cardSetupEnvelope(value: CardSetupCreateEnvelope): CardSetupCreateEnvelope {
  const parsed = createProviderDispatchEnvelope(value);
  if (parsed.kind !== "card_setup" || parsed.step !== "create") fail("invalid_input");
  return parsed;
}

function cardSetupExecuteEnvelope(value: CardSetupExecuteEnvelope): CardSetupExecuteEnvelope {
  const parsed = createProviderDispatchEnvelope(value);
  if (parsed.kind !== "card_setup" || parsed.step !== "execute") fail("invalid_input");
  return parsed;
}

function cardSetup(value: unknown, rawResponseBytes: Uint8Array): ArcPayCardSetup {
  if (!isRecord(value)) fail("invalid_response");
  if (
    !isUuid(value.id) ||
    value.amount !== 0 ||
    value.currency !== "RUB" ||
    value.payment_method !== "bank_card" ||
    value.status !== "created" ||
    !isIsoInstant(value.created_at) ||
    !isIsoInstant(value.updated_at) ||
    !Array.isArray(value.operations)
  ) {
    fail("invalid_response");
  }
  return Object.freeze({ providerSetupId: value.id, rawResponseBytes });
}

function cardSetupExecution(
  value: unknown,
  rawResponseBytes: Uint8Array,
  expectedProviderSetupId: string
): ArcPayCardSetupExecution {
  if (
    !isRecord(value) ||
    value.payment_id !== expectedProviderSetupId ||
    !executionStatus(value.status)
  ) {
    fail("invalid_response");
  }
  if (value.card_token_id !== undefined && !isUuid(value.card_token_id)) fail("invalid_response");
  let nextAction: ArcPayThreeDsAction | null = null;
  if (value.status === "pending_3ds") {
    try {
      nextAction = decodeArcPayThreeDsAction({
        providerSetupId: expectedProviderSetupId,
        responseBytes: rawResponseBytes
      });
    } catch {
      fail("invalid_response");
    }
  }
  if (value.status !== "pending_3ds" && value.next_action !== undefined) fail("invalid_response");
  return Object.freeze({
    providerSetupId: expectedProviderSetupId,
    status: value.status,
    cardTokenId: value.card_token_id ?? null,
    nextAction,
    rawResponseBytes
  });
}

function browserInfo(value: ArcPayCardTokenizationSecret["browserInfo"]) {
  return {
    accept_header: value.acceptHeader,
    language: value.language,
    screen_width: value.screenWidth,
    screen_height: value.screenHeight,
    color_depth: value.colorDepth,
    timezone_offset_minutes: value.timezoneOffsetMinutes,
    user_agent: value.userAgent,
    ...(value.javaEnabled === undefined ? {} : { java_enabled: value.javaEnabled }),
    ...(value.windowSize === undefined ? {} : { window_size: value.windowSize })
  };
}

function httpsBaseUrl(value: string): URL {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
    return parsed;
  } catch {
    throw new ArcPayCardSetupClientError("not_configured");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isIdempotencyKey(value: unknown): value is string {
  return isUuid(value);
}

function completionIndicator(value: unknown): value is "Y" | "N" | "U" {
  return value === "Y" || value === "N" || value === "U";
}

function threeDsServerTransactionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= 1 &&
    value.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isIsoInstant(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

function executionStatus(value: unknown): value is ArcPayCardSetupExecution["status"] {
  return (
    value === "authorized" ||
    value === "captured" ||
    value === "pending" ||
    value === "pending_3ds" ||
    value === "failed" ||
    value === "declined"
  );
}

function fail(reason: ArcPayCardSetupClientError["reason"]): never {
  throw new ArcPayCardSetupClientError(reason);
}
