import { createHash } from "node:crypto";

import { parse, traverse, type ObjectNode } from "@humanwhocodes/momoa";

export const ARC_PAY_SETTLEMENT_JSON_ABSOLUTE_MAX_BYTES = 2 * 1024 * 1024;

export type ArcPayExactJsonDecodeErrorReason =
  | "invalid_policy"
  | "payload_limit_exceeded"
  | "digest_mismatch"
  | "invalid_utf8"
  | "invalid_json"
  | "duplicate_key"
  | "forbidden_payload"
  | "non_canonical_int64"
  | "int64_out_of_range";

export class ArcPayExactJsonDecodeError extends Error {
  readonly code = "ARC_PAY_EXACT_JSON_DECODE_ERROR";

  constructor(readonly reason: ArcPayExactJsonDecodeErrorReason) {
    super("ArcPay response violates the bounded exact JSON contract");
    this.name = "ArcPayExactJsonDecodeError";
  }
}

export type ArcPayExactJsonDocument = Readonly<{
  rawDigest: `sha256:${string}`;
  byteLength: number;
  value: unknown;
}>;

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const canonicalIntegerPattern = /^(?:0|-?[1-9][0-9]*)$/;
const minimumInt64 = -(1n << 63n);
const maximumInt64 = (1n << 63n) - 1n;
const forbiddenKeys = new Set([
  "pan",
  "cardnumber",
  "primaryaccountnumber",
  "cvv",
  "cvc",
  "cvv2",
  "cvc2",
  "cardsecuritycode",
  "rawcard",
  "cardraw",
  "encryptedcard",
  "cardencrypted",
  "cardciphertext",
  "cardtoken",
  "cardtokenid",
  "savedcardtoken",
  "savedcardtokenid",
  "credentialtokenhandle",
  "restrictedtokenhandle",
  "tokenhandle",
  "reusabletoken",
  "tokenvalue",
  "submerchant",
  "submerchants",
  "split",
  "splits",
  "splitpayment",
  "splitpayments",
  "marketplacemerchant",
  "merchantbeneficiary"
]);

type NativeJsonParseWithSource = (
  text: string,
  reviver: (
    this: unknown,
    key: string,
    value: unknown,
    context: Readonly<{ source?: string }>
  ) => unknown
) => unknown;

const nativeJsonParseWithSource = JSON.parse as NativeJsonParseWithSource;

export function decodeArcPayExactJson(input: {
  readonly rawBody: Uint8Array;
  readonly expectedDigest: `sha256:${string}`;
  readonly maximumBytes: number;
}): ArcPayExactJsonDocument {
  const { rawBody, expectedDigest, maximumBytes } = readDecoderInput(input);
  if (rawBody.byteLength > maximumBytes) fail("payload_limit_exceeded");

  const rawDigest = digest(rawBody);
  if (rawDigest !== expectedDigest) fail("digest_mismatch");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    fail("invalid_utf8");
  }

  validateObjectMembers(text);

  let value: unknown;
  try {
    value = nativeJsonParseWithSource(text, (_key, candidate, context) => {
      if (typeof candidate !== "number") return candidate;
      const source = context.source;
      if (typeof source !== "string" || !canonicalIntegerPattern.test(source)) {
        fail("non_canonical_int64");
      }
      let parsed: bigint;
      try {
        parsed = BigInt(source);
      } catch {
        fail("non_canonical_int64");
      }
      if (parsed < minimumInt64 || parsed > maximumInt64) fail("int64_out_of_range");
      return source;
    });
  } catch (error) {
    if (error instanceof ArcPayExactJsonDecodeError) throw error;
    fail("invalid_json");
  }

  return Object.freeze({ rawDigest, byteLength: rawBody.byteLength, value });
}

function validateObjectMembers(text: string): void {
  let document: ReturnType<typeof parse>;
  try {
    document = parse(text, { mode: "json", allowTrailingCommas: false });
  } catch {
    fail("invalid_json");
  }

  try {
    traverse(document, {
      enter(node) {
        if (node.type !== "Object") return;
        const objectNode = node as ObjectNode;
        const keys = new Set<string>();
        for (const member of objectNode.members) {
          const key = member.name.type === "String" ? member.name.value : member.name.name;
          if (keys.has(key)) fail("duplicate_key");
          keys.add(key);
          if (forbiddenKeys.has(normalizeSecurityKey(key))) fail("forbidden_payload");
        }
      }
    });
  } catch (error) {
    if (error instanceof ArcPayExactJsonDecodeError) throw error;
    fail("invalid_json");
  }
}

function readDecoderInput(input: unknown): {
  readonly rawBody: Uint8Array;
  readonly expectedDigest: `sha256:${string}`;
  readonly maximumBytes: number;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    fail("invalid_policy");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).length !== 3 ||
    !("rawBody" in descriptors) ||
    !("expectedDigest" in descriptors) ||
    !("maximumBytes" in descriptors)
  ) {
    fail("invalid_policy");
  }
  const rawBody = readDataValue(descriptors.rawBody);
  const expectedDigest = readDataValue(descriptors.expectedDigest);
  const maximumBytes = readDataValue(descriptors.maximumBytes);
  if (
    !(rawBody instanceof Uint8Array) ||
    typeof expectedDigest !== "string" ||
    !digestPattern.test(expectedDigest) ||
    typeof maximumBytes !== "number" ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    maximumBytes > ARC_PAY_SETTLEMENT_JSON_ABSOLUTE_MAX_BYTES
  ) {
    fail("invalid_policy");
  }
  return {
    rawBody,
    expectedDigest: expectedDigest as `sha256:${string}`,
    maximumBytes
  };
}

function readDataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
    fail("invalid_policy");
  }
  return descriptor.value;
}

function normalizeSecurityKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(reason: ArcPayExactJsonDecodeErrorReason): never {
  throw new ArcPayExactJsonDecodeError(reason);
}
