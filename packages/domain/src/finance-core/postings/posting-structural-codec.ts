import { types as nodeUtilTypes } from "node:util";
import {
  FinancePostingIntegrityError,
  type FinancePostingIntegrityReason
} from "./posting-integrity-error";

export function readExactDataRecord<const Keys extends readonly string[]>(
  input: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  try {
    if (typeof input !== "object" || input === null) throw integrity("invalid_shape");
    assertFinancePostingNotProxy(input);
    if (Array.isArray(input)) throw integrity("invalid_shape");
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw integrity("invalid_shape");
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string")) {
      throw integrity("invalid_shape");
    }
    const expected = new Set<string>(expectedKeys);
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) throw integrity("invalid_shape");
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw integrity("invalid_shape");
      }
      result[key] = descriptor.value;
    }
    return Object.freeze(result) as Readonly<Record<Keys[number], unknown>>;
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("invalid_shape");
  }
}

export function readExactDataArray(
  input: unknown,
  minimumLength: number,
  maximumLength: number
): readonly unknown[] {
  try {
    if (
      !Number.isSafeInteger(minimumLength) ||
      minimumLength < 0 ||
      !Number.isSafeInteger(maximumLength) ||
      maximumLength <= 0
    ) {
      throw integrity("decoder_envelope_required");
    }
    if (typeof input !== "object" || input === null) throw integrity("invalid_shape");
    assertFinancePostingNotProxy(input);
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
      throw integrity("invalid_shape");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) throw integrity("invalid_shape");
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < minimumLength) {
      throw integrity("invalid_shape");
    }
    if (length > maximumLength) {
      throw integrity("decoder_envelope_exceeded");
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== length + 1) throw integrity("invalid_shape");
    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw integrity("invalid_shape");
      }
      values.push(descriptor.value);
    }
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)) ||
          (key !== "length" && Number(key) >= length)
      )
    ) {
      throw integrity("invalid_shape");
    }
    return Object.freeze(values);
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("invalid_shape");
  }
}

export function readOwnDataDiscriminator<const Values extends readonly string[]>(
  input: unknown,
  propertyName: string,
  allowedValues: Values
): Values[number] {
  try {
    if (typeof input !== "object" || input === null) throw integrity("invalid_shape");
    assertFinancePostingNotProxy(input);
    if (Array.isArray(input)) throw integrity("invalid_shape");
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw integrity("invalid_shape");
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, propertyName);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrity("invalid_shape");
    }
    if (
      typeof descriptor.value !== "string" ||
      !(allowedValues as readonly string[]).includes(descriptor.value)
    ) {
      throw integrity("authority_mismatch");
    }
    return descriptor.value as Values[number];
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw new FinancePostingIntegrityError("invalid_shape");
  }
}

export function assertFinancePostingNotProxy(input: object): void {
  try {
    if (nodeUtilTypes.isProxy(input)) throw integrity("invalid_shape");
  } catch {
    throw integrity("invalid_shape");
  }
}

function integrity(reason: FinancePostingIntegrityReason): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError(reason);
}
