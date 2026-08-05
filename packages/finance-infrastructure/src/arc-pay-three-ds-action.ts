/* eslint-disable no-control-regex -- Provider boundary validation intentionally rejects ASCII control characters. */
export type ArcPayThreeDsAction = Readonly<{
  type: "three_ds_method" | "three_ds_challenge";
  threeDs: Readonly<{
    version: "1" | "2";
    phase: "method" | "challenge";
    completionEndpoint: string | null;
    threeDsServerTransactionId: string | null;
    submit: Readonly<{
      method: "POST";
      url: string;
      target: "hidden_iframe" | "browser";
      fields: readonly Readonly<{ name: string; value: string }>[];
    }>;
  }>;
}>;

export class ArcPayThreeDsActionDecoderError extends Error {
  readonly code = "ARC_PAY_THREE_DS_ACTION_DECODER_ERROR" as const;

  constructor(readonly reason: "invalid_input" | "invalid_action") {
    super("ArcPay 3DS action cannot be delivered safely");
  }
}

/**
 * Decodes a sealed ArcPay action only after the caller has verified artifact scope and ownership.
 * It deliberately accepts no callback URL supplied by the browser and binds method completion to
 * the exact provider payment ID that created the action.
 */
export function decodeArcPayThreeDsAction(input: Readonly<{
  providerSetupId: string;
  responseBytes: Uint8Array;
}>): ArcPayThreeDsAction {
  if (!uuid(input.providerSetupId) || input.responseBytes.byteLength < 1 || input.responseBytes.byteLength > 2 * 1024 * 1024) {
    fail("invalid_input");
  }
  let document: unknown;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.responseBytes));
  } catch {
    fail("invalid_action");
  }
  const action = record(document) && "next_action" in document ? document.next_action : document;
  return parseAction(action, input.providerSetupId);
}

function parseAction(value: unknown, providerSetupId: string): ArcPayThreeDsAction {
  if (
    !record(value) ||
    (value.type !== "three_ds_method" && value.type !== "three_ds_challenge") ||
    !record(value.three_ds)
  ) {
    fail("invalid_action");
  }
  const threeDs = value.three_ds;
  if (
    (threeDs.version !== "1" && threeDs.version !== "2") ||
    (threeDs.phase !== "method" && threeDs.phase !== "challenge") ||
    !record(threeDs.submit) ||
    threeDs.submit.method !== "POST" ||
    (threeDs.submit.target !== "hidden_iframe" && threeDs.submit.target !== "browser") ||
    !httpsUrl(threeDs.submit.url) ||
    !Array.isArray(threeDs.submit.fields) ||
    threeDs.submit.fields.length < 1 ||
    threeDs.submit.fields.length > 32
  ) {
    fail("invalid_action");
  }
  const method = value.type === "three_ds_method";
  if (
    (method && (threeDs.phase !== "method" || threeDs.submit.target !== "hidden_iframe")) ||
    (!method && (threeDs.phase !== "challenge" || threeDs.submit.target !== "browser"))
  ) {
    fail("invalid_action");
  }
  const fields = Object.freeze(threeDs.submit.fields.map(field));
  return Object.freeze({
    type: value.type,
    threeDs: Object.freeze({
      version: threeDs.version,
      phase: threeDs.phase,
      completionEndpoint: method ? completionEndpoint(threeDs.completion_endpoint, providerSetupId) : null,
      threeDsServerTransactionId: method ? opaque(threeDs.three_ds_server_trans_id) : null,
      submit: Object.freeze({
        method: "POST" as const,
        url: threeDs.submit.url,
        target: threeDs.submit.target,
        fields
      })
    })
  });
}

function field(value: unknown): Readonly<{ name: string; value: string }> {
  if (!record(value)) fail("invalid_action");
  return Object.freeze({ name: opaque(value.name), value: opaque(value.value) });
}

function completionEndpoint(value: unknown, providerSetupId: string): string {
  if (typeof value !== "string" || value !== `/v1/payments/${providerSetupId}/complete-3ds-method`) {
    fail("invalid_action");
  }
  return value;
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8_192 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function opaque(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 8_192 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail("invalid_action");
  }
  return value;
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(reason: ArcPayThreeDsActionDecoderError["reason"]): never {
  throw new ArcPayThreeDsActionDecoderError(reason);
}
