import { invalidWalletProjection, WalletProjectionIntegrityError } from "./wallet-reference-errors";
import { readStrictOwnDataRecord } from "./strict-own-data";

export function balanceString(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    invalidWalletProjection();
  }
  return value;
}

export function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200
  ) {
    invalidWalletProjection();
  }
  return value;
}

export function positiveDecimalString(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    invalidWalletProjection();
  }
  return value;
}

export function exactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  try {
    return readStrictOwnDataRecord(value, expectedKeys, () => invalidWalletProjection());
  } catch (error) {
    if (error instanceof WalletProjectionIntegrityError) throw error;
    return invalidWalletProjection();
  }
}

export function exactDataArray(value: unknown): readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      invalidWalletProjection();
    }
    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) invalidWalletProjection();
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || (length as number) < 0 || keys.length !== length + 1) {
      invalidWalletProjection();
    }
    const result: unknown[] = [];
    for (let index = 0; index < (length as number); index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        invalidWalletProjection();
      }
      result.push(descriptor.value);
    }
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (length as number)))
      )
    ) {
      invalidWalletProjection();
    }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof WalletProjectionIntegrityError) throw error;
    return invalidWalletProjection();
  }
}
