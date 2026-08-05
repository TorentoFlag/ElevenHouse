import { createHash } from "node:crypto";

export type FinanceAuthorizationPayloadHash = `sha256:${string}`;

export class FinanceAuthorizationPayloadError extends Error {
  readonly code = "FINANCE_AUTHORIZATION_PAYLOAD_INVALID";

  constructor() {
    super("Finance authorization command payload is not canonicalizable");
    this.name = "FinanceAuthorizationPayloadError";
  }
}

export function canonicalizeFinanceCommandPayload(payload: unknown): Uint8Array {
  const serialized = serializeCanonicalValue(payload, new Set<object>());
  return new TextEncoder().encode(serialized);
}

export function hashFinanceCommandPayload(payload: unknown): FinanceAuthorizationPayloadHash {
  const bytes = canonicalizeFinanceCommandPayload(payload);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function serializeCanonicalValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) throw payloadError();
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object") throw payloadError();
  if (ancestors.has(value)) throw payloadError();

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return serializeArray(value, ancestors);
    if (!isPlainObject(value)) throw payloadError();
    return serializeObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function serializeArray(value: readonly unknown[], ancestors: Set<object>): string {
  if (Object.getOwnPropertySymbols(value).length > 0) throw payloadError();
  const serializedItems: string[] = [];
  const expectedNames = new Set(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    const propertyName = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);
    if (!descriptor || !("value" in descriptor)) throw payloadError();
    expectedNames.add(propertyName);
    serializedItems.push(serializeCanonicalValue(descriptor.value, ancestors));
  }
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.some((name) => !expectedNames.has(name))) {
    throw payloadError();
  }

  return `[${serializedItems.join(",")}]`;
}

function serializeObject(value: Record<string, unknown>, ancestors: Set<object>): string {
  if (Object.getOwnPropertySymbols(value).length > 0) throw payloadError();
  const propertyNames = Object.getOwnPropertyNames(value);
  const enumerableKeys = Object.keys(value);
  if (propertyNames.length !== enumerableKeys.length) throw payloadError();

  const entries = enumerableKeys.sort(compareUnicodeCodePoint).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw payloadError();
    return `${JSON.stringify(key)}:${serializeCanonicalValue(descriptor.value, ancestors)}`;
  });
  return `{${entries.join(",")}}`;
}

function compareUnicodeCodePoint(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) as number);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) as number);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index];
    const rightPoint = rightPoints[index];
    if (leftPoint === undefined || rightPoint === undefined) break;
    const difference = leftPoint - rightPoint;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function payloadError(): FinanceAuthorizationPayloadError {
  return new FinanceAuthorizationPayloadError();
}
