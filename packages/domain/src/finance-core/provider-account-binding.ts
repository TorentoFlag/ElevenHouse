import { types as nodeUtilTypes } from "node:util";

export type ProviderAccountIdentityBinding = Readonly<{
  seriesId: string;
  providerAccountId: string;
  identityVersion: number;
}>;

export class ProviderAccountIdentityBindingIntegrityError extends Error {
  readonly code = "provider_account_identity_binding_integrity_violation";

  constructor() {
    super("Provider-account identity binding is invalid");
    this.name = "ProviderAccountIdentityBindingIntegrityError";
  }
}

const bindingKeys = ["seriesId", "providerAccountId", "identityVersion"] as const;

export function createProviderAccountIdentityBinding(
  input: unknown
): ProviderAccountIdentityBinding {
  const fields = readExactOwnDataObject(input);
  if (!Number.isSafeInteger(fields.identityVersion) || Number(fields.identityVersion) < 1) {
    throw integrityError();
  }
  return Object.freeze({
    seriesId: identifier(fields.seriesId),
    providerAccountId: identifier(fields.providerAccountId),
    identityVersion: Number(fields.identityVersion)
  });
}

export function sameProviderAccountIdentityBinding(
  left: ProviderAccountIdentityBinding,
  right: ProviderAccountIdentityBinding
): boolean {
  const safeLeft = createProviderAccountIdentityBinding(left);
  const safeRight = createProviderAccountIdentityBinding(right);
  return (
    safeLeft.seriesId === safeRight.seriesId &&
    safeLeft.providerAccountId === safeRight.providerAccountId &&
    safeLeft.identityVersion === safeRight.identityVersion
  );
}

function readExactOwnDataObject(
  input: unknown
): Readonly<Record<(typeof bindingKeys)[number], unknown>> {
  if (typeof input !== "object" || input === null) throw integrityError();
  assertNotProxy(input);
  if (Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw integrityError();
  }
  const expected = new Set<string>(bindingKeys);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== bindingKeys.length) throw integrityError();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) throw integrityError();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrityError();
    }
    result[key] = descriptor.value;
  }
  for (const key of bindingKeys) {
    if (!Object.hasOwn(result, key)) throw integrityError();
  }
  return result as Readonly<Record<(typeof bindingKeys)[number], unknown>>;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) {
    throw integrityError();
  }
  return value;
}

function assertNotProxy(value: object): void {
  try {
    if (nodeUtilTypes.isProxy(value)) throw integrityError();
  } catch {
    throw integrityError();
  }
}

function integrityError(): ProviderAccountIdentityBindingIntegrityError {
  return new ProviderAccountIdentityBindingIntegrityError();
}
