import { createHmac, randomInt } from "node:crypto";

export function createNumericPasswordlessCode(length: number): string {
  if (!Number.isInteger(length) || length < 6 || length > 10) {
    throw new Error("Passwordless code length must be between 6 and 10 digits");
  }

  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max));
}

export function hashPasswordlessCode(input: {
  readonly secret: string;
  readonly channel: string;
  readonly identifierNormalized: string;
  readonly code: string;
}): string {
  const secret = input.secret.trim();
  if (!secret) {
    throw new Error("Passwordless code secret is required");
  }

  return createHmac("sha256", secret)
    .update(`${input.channel}:${input.identifierNormalized}:${input.code}`)
    .digest("hex");
}
