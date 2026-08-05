import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type HeaderSource = Readonly<Record<string, string | undefined>>;

export type ArcPayWebhookSignatureInspection =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{
      kind: "verified";
      webhookId: string;
      signedTimestamp: string;
      signatureEvidenceDigest: `sha256:${string}`;
    }>;

export function verifyArcPayWebhookSignature(input: {
  readonly headers: HeaderSource;
  readonly rawBody: string | Uint8Array;
  readonly secret: string;
  readonly timestampToleranceSeconds: number;
  readonly now: Date;
}): boolean {
  return inspectArcPayWebhookSignature(input).kind === "verified";
}

/**
 * Validates ArcPay's HMAC envelope and returns only facts that are safe to bind into the
 * sealed webhook ingress receipt. It deliberately never returns the signing secret or HMAC.
 */
export function inspectArcPayWebhookSignature(input: {
  readonly headers: HeaderSource;
  readonly rawBody: string | Uint8Array;
  readonly secret: string;
  readonly timestampToleranceSeconds: number;
  readonly now: Date;
}): ArcPayWebhookSignatureInspection {
  const webhookId = header(input.headers, "webhook-id");
  const webhookAttempt = header(input.headers, "webhook-attempt");
  const timestamp = header(input.headers, "webhook-timestamp");
  const signature = header(input.headers, "webhook-signature");
  if (
    !webhookId ||
    !webhookAttempt ||
    !timestamp ||
    !signature ||
    !isPositiveSafeInteger(webhookAttempt)
  ) {
    return { kind: "invalid" };
  }

  const parsed = parseSignature(signature);
  if (!parsed || parsed.timestamp !== timestamp || !/^\d+$/.test(timestamp)) {
    return { kind: "invalid" };
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return { kind: "invalid" };
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > input.timestampToleranceSeconds) {
    return { kind: "invalid" };
  }

  // The server supplies the untouched request bytes. We sign the textual prefix separately so
  // bytes outside valid UTF-8 cannot be normalized before HMAC verification.
  const expected = createHmac("sha256", input.secret)
    .update(`${webhookId}.${timestamp}.`, "utf8")
    .update(input.rawBody)
    .digest();
  const matches = parsed.signatures.some((signatureHex) => {
    const received = Buffer.from(signatureHex, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!matches) return { kind: "invalid" };
  const signedAt = new Date(timestampSeconds * 1000);
  if (Number.isNaN(signedAt.getTime())) return { kind: "invalid" };

  return Object.freeze({
    kind: "verified",
    webhookId,
    signedTimestamp: signedAt.toISOString(),
    signatureEvidenceDigest: digestSignatureContext({
      webhookId,
      webhookAttempt,
      timestamp,
      signature
    })
  });
}

function digestSignatureContext(input: Readonly<{
  webhookId: string;
  webhookAttempt: string;
  timestamp: string;
  signature: string;
}>): `sha256:${string}` {
  const context = [
    "arc_pay_webhook_signature_v1",
    input.webhookId,
    input.webhookAttempt,
    input.timestamp,
    input.signature
  ].join("\n");
  return `sha256:${createHash("sha256").update(context, "utf8").digest("hex")}`;
}

function parseSignature(
  value: string
): { readonly timestamp: string; readonly signatures: readonly string[] } | null {
  const parts = value.split(",").map((part) => part.trim());
  const timestampValues = parts
    .filter((part) => part.startsWith("t="))
    .map((part) => part.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((part) => /^[a-f0-9]{64}$/i.test(part));
  if (timestampValues.length !== 1 || !timestampValues[0] || signatures.length === 0) return null;
  return { timestamp: timestampValues[0], signatures };
}

function header(source: HeaderSource, name: string): string | undefined {
  const value = source[name];
  return value?.trim() || undefined;
}

function isPositiveSafeInteger(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}
