import { createHmac, timingSafeEqual } from "node:crypto";

type HeaderSource = Readonly<Record<string, string | undefined>>;

export function verifyArcPayWebhookSignature(input: {
  readonly headers: HeaderSource;
  readonly rawBody: string;
  readonly secret: string;
  readonly timestampToleranceSeconds: number;
  readonly now: Date;
}): boolean {
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
    return false;
  }

  const parsed = parseSignature(signature);
  if (!parsed || parsed.timestamp !== timestamp || !/^\d+$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > input.timestampToleranceSeconds) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${webhookId}.${timestamp}.${input.rawBody}`)
    .digest();
  return parsed.signatures.some((signatureHex) => {
    const received = Buffer.from(signatureHex, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
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
