import {
  digestFinanceCanonicalValueV1,
  sameFinanceCanonicalValueV1
} from "./finance-canonical-digest";

export function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return sameFinanceCanonicalValueV1(left, right);
}

export function digestValue(value: unknown): string {
  return digestFinanceCanonicalValueV1(value);
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
