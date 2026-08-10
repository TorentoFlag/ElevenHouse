import { Temporal } from "@js-temporal/polyfill";
import { types as nodeUtilTypes } from "node:util";
import type { Money } from "../money";
import {
  verifyFiscalChargeSnapshot,
  type FiscalChargeSnapshot
} from "./fiscal-profile";

export type ArcPayPaymentMethod = Readonly<{
  method:
    | "bank_card"
    | "sbp"
    | "sberpay"
    | "tpay"
    | "alfapay"
    | "dolyami"
    | "mirpay"
    | "applepay"
    | "googlepay";
  paymentMode: "h2h" | "redirect";
}>;

export type SealedOneTimeProviderSecretRef = Readonly<{
  kind: "sealed_one_time_provider_secret_ref";
  secretRef: string;
  providerExpiresAt: string;
  providerConsumption: "one_time";
}>;

export type RestrictedSavedCardCredentialRef = Readonly<{
  kind: "restricted_saved_card_credential_ref";
  schemaVersion: 1;
  credentialId: string;
  credentialVersion: number;
}>;

export type ProviderDispatchEnvelope =
  | Readonly<{
      kind: "checkout_session_create";
      amount: Money;
      captureMode: "one_stage";
      paymentMethods: readonly ArcPayPaymentMethod[];
      successUrl: string;
      failureUrl: string;
      cancelUrl: string;
      externalId: string;
      orderId: string;
      /** `null` means no fiscal receipt was configured for this checkout. */
      fiscalSnapshot: FiscalChargeSnapshot | null;
    }>
  | Readonly<{
      kind: "card_setup";
      step: "create";
      customerId: string;
      setupExternalId: string;
      successUrl: string;
      failureUrl: string;
    }>
  | Readonly<{
      kind: "card_setup";
      step: "execute";
      customerId: string;
      providerSetupId: string;
      setupExternalId: string;
      tokenizationSecret: SealedOneTimeProviderSecretRef;
    }>
  | Readonly<{
      kind: "card_setup";
      step: "complete_3ds_method";
      providerSetupId: string;
      setupExternalId: string;
      customerActionId: string;
      completionIndicator: "Y" | "N" | "U";
      threeDsMethodContextSecret: SealedOneTimeProviderSecretRef;
    }>
  | Readonly<{
      kind: "saved_card_charge";
      amount: Money;
      savedCardCredential: RestrictedSavedCardCredentialRef;
      externalId: string;
      storedCredentialReason: "recurring";
      /** Immutable tariff-version schedule approved for this merchant-initiated charge. */
      recurringFrequencyDays: number;
      fiscalSnapshot: FiscalChargeSnapshot;
    }>
  | Readonly<{
      /** A 3DS Method completion for the existing saved-card payment, never a new charge. */
      kind: "saved_card_charge_3ds_method";
      providerPaymentId: string;
      invoiceId: string;
      customerActionId: string;
      completionIndicator: "Y" | "N" | "U";
      threeDsMethodContextSecret: SealedOneTimeProviderSecretRef;
    }>
  | Readonly<{
      kind: "refund";
      providerPaymentId: string;
      amount: Money;
      externalId: string;
    }>
  | Readonly<{
      kind: "void";
      providerPaymentId: string;
      externalId: string;
    }>;

export class ProviderDispatchEnvelopeIntegrityError extends Error {
  readonly code = "FINANCE_PROVIDER_DISPATCH_ENVELOPE_INTEGRITY_ERROR";

  constructor() {
    super("Provider dispatch envelope integrity check failed");
    this.name = "ProviderDispatchEnvelopeIntegrityError";
  }
}

const checkoutKeys = [
  "kind",
  "amount",
  "captureMode",
  "paymentMethods",
  "successUrl",
  "failureUrl",
  "cancelUrl",
  "externalId",
  "orderId",
  "fiscalSnapshot"
] as const;
const cardSetupCreateKeys = [
  "kind",
  "step",
  "customerId",
  "setupExternalId",
  "successUrl",
  "failureUrl"
] as const;
const cardSetupExecuteKeys = [
  "kind",
  "step",
  "customerId",
  "providerSetupId",
  "setupExternalId",
  "tokenizationSecret"
] as const;
const cardSetupThreeDsMethodKeys = [
  "kind",
  "step",
  "providerSetupId",
  "setupExternalId",
  "customerActionId",
  "completionIndicator",
  "threeDsMethodContextSecret"
] as const;
const savedCardChargeKeys = [
  "kind",
  "amount",
  "savedCardCredential",
  "externalId",
  "storedCredentialReason",
  "recurringFrequencyDays",
  "fiscalSnapshot"
] as const;
const savedCardChargeThreeDsMethodKeys = [
  "kind",
  "providerPaymentId",
  "invoiceId",
  "customerActionId",
  "completionIndicator",
  "threeDsMethodContextSecret"
] as const;
const refundKeys = ["kind", "providerPaymentId", "amount", "externalId"] as const;
const voidKeys = ["kind", "providerPaymentId", "externalId"] as const;
const moneyKeys = ["amountMinor", "currency"] as const;
const paymentMethodKeys = ["method", "paymentMode"] as const;
const sealedSecretKeys = ["kind", "secretRef", "providerExpiresAt", "providerConsumption"] as const;
const restrictedSavedCardCredentialKeys = [
  "kind",
  "schemaVersion",
  "credentialId",
  "credentialVersion"
] as const;

const methodValues = new Set<string>([
  "bank_card",
  "sbp",
  "sberpay",
  "tpay",
  "alfapay",
  "dolyami",
  "mirpay",
  "applepay",
  "googlepay"
]);

export function createProviderDispatchEnvelope(input: unknown): ProviderDispatchEnvelope {
  const kind = readOwnDataDiscriminant(input, "kind");
  if (kind === "checkout_session_create") {
    const fields = readExactOwnDataObject(input, checkoutKeys);
    if (fields.captureMode !== "one_stage") throw integrityError();
    const amount = money(fields.amount);
    const envelope: Extract<ProviderDispatchEnvelope, { kind: "checkout_session_create" }> = {
      kind,
      amount,
      captureMode: fields.captureMode,
      paymentMethods: paymentMethods(fields.paymentMethods),
      successUrl: httpsUrl(fields.successUrl),
      failureUrl: httpsUrl(fields.failureUrl),
      cancelUrl: httpsUrl(fields.cancelUrl),
      externalId: opaqueId(fields.externalId),
      orderId: opaqueId(fields.orderId),
      fiscalSnapshot: fiscalSnapshotForCheckout(
        fields.fiscalSnapshot,
        amount.amountMinor
      )
    };
    return Object.freeze(envelope);
  }
  if (kind === "card_setup") {
    const step = readOwnDataDiscriminant(input, "step");
    if (step === "create") {
      const fields = readExactOwnDataObject(input, cardSetupCreateKeys);
      return Object.freeze({
        kind,
        step,
        customerId: opaqueId(fields.customerId),
        setupExternalId: opaqueId(fields.setupExternalId),
        successUrl: httpsUrl(fields.successUrl),
        failureUrl: httpsUrl(fields.failureUrl)
      });
    }
    if (step === "execute") {
      const fields = readExactOwnDataObject(input, cardSetupExecuteKeys);
      return Object.freeze({
        kind,
        step,
        customerId: opaqueId(fields.customerId),
        providerSetupId: opaqueId(fields.providerSetupId),
        setupExternalId: opaqueId(fields.setupExternalId),
        tokenizationSecret: sealedSecret(fields.tokenizationSecret)
      });
    }
    if (step === "complete_3ds_method") {
      const fields = readExactOwnDataObject(input, cardSetupThreeDsMethodKeys);
      if (fields.completionIndicator !== "Y" && fields.completionIndicator !== "N" && fields.completionIndicator !== "U") {
        throw integrityError();
      }
      return Object.freeze({
        kind,
        step,
        providerSetupId: opaqueId(fields.providerSetupId),
        setupExternalId: opaqueId(fields.setupExternalId),
        customerActionId: opaqueId(fields.customerActionId),
        completionIndicator: fields.completionIndicator,
        threeDsMethodContextSecret: sealedSecret(fields.threeDsMethodContextSecret)
      });
    }
    throw integrityError();
  }
  if (kind === "saved_card_charge") {
    const fields = readExactOwnDataObject(input, savedCardChargeKeys);
    if (fields.storedCredentialReason !== "recurring") throw integrityError();
    const amount = money(fields.amount);
    return Object.freeze({
      kind,
      amount,
      savedCardCredential: restrictedSavedCardCredential(fields.savedCardCredential),
      externalId: opaqueId(fields.externalId),
      storedCredentialReason: "recurring" as const,
      recurringFrequencyDays: recurringFrequencyDays(fields.recurringFrequencyDays),
      fiscalSnapshot: fiscalSnapshotForCharge(
        fields.fiscalSnapshot,
        "platform_subscription",
        amount.amountMinor
      )
    });
  }
  if (kind === "saved_card_charge_3ds_method") {
    const fields = readExactOwnDataObject(input, savedCardChargeThreeDsMethodKeys);
    if (
      fields.completionIndicator !== "Y" &&
      fields.completionIndicator !== "N" &&
      fields.completionIndicator !== "U"
    ) {
      throw integrityError();
    }
    return Object.freeze({
      kind,
      providerPaymentId: opaqueId(fields.providerPaymentId),
      invoiceId: opaqueId(fields.invoiceId),
      customerActionId: opaqueId(fields.customerActionId),
      completionIndicator: fields.completionIndicator,
      threeDsMethodContextSecret: sealedSecret(fields.threeDsMethodContextSecret)
    });
  }
  if (kind === "refund") {
    const fields = readExactOwnDataObject(input, refundKeys);
    return Object.freeze({
      kind,
      providerPaymentId: opaqueId(fields.providerPaymentId),
      amount: money(fields.amount),
      externalId: opaqueId(fields.externalId)
    });
  }
  if (kind === "void") {
    const fields = readExactOwnDataObject(input, voidKeys);
    return Object.freeze({
      kind,
      providerPaymentId: opaqueId(fields.providerPaymentId),
      externalId: opaqueId(fields.externalId)
    });
  }
  throw integrityError();
}

function recurringFrequencyDays(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 366) {
    throw integrityError();
  }
  return Number(value);
}

function fiscalSnapshotForCharge(
  input: unknown,
  transactionCategory: "client_purchase" | "platform_subscription",
  amountMinor: number
): FiscalChargeSnapshot {
  const snapshot = verifyFiscalChargeSnapshot(input as FiscalChargeSnapshot);
  if (
    snapshot.transactionCategory !== transactionCategory ||
    snapshot.currency !== "RUB" ||
    snapshot.totalAmountMinor !== amountMinor
  ) {
    throw integrityError();
  }
  return snapshot;
}

function fiscalSnapshotForCheckout(
  input: unknown,
  amountMinor: number
): FiscalChargeSnapshot | null {
  if (input === null) return null;
  return fiscalSnapshotForCharge(input, "client_purchase", amountMinor);
}

function money(value: unknown): Money {
  const fields = readExactOwnDataObject(value, moneyKeys);
  if (
    !Number.isSafeInteger(fields.amountMinor) ||
    Number(fields.amountMinor) < 1 ||
    fields.currency !== "RUB"
  ) {
    throw integrityError();
  }
  return Object.freeze({ amountMinor: Number(fields.amountMinor), currency: "RUB" });
}

function paymentMethods(value: unknown): readonly ArcPayPaymentMethod[] {
  const values = readExactOwnDataArray(value);
  if (values.length < 1 || values.length > methodValues.size) throw integrityError();
  const result = values.map((entry) => {
    const fields = readExactOwnDataObject(entry, paymentMethodKeys);
    if (
      typeof fields.method !== "string" ||
      !methodValues.has(fields.method) ||
      (fields.paymentMode !== "h2h" && fields.paymentMode !== "redirect")
    ) {
      throw integrityError();
    }
    return Object.freeze({
      method: fields.method as ArcPayPaymentMethod["method"],
      paymentMode: fields.paymentMode
    });
  });
  if (
    new Set(result.map((entry) => `${entry.method}:${entry.paymentMode}`)).size !== result.length
  ) {
    throw integrityError();
  }
  return Object.freeze(result);
}

function sealedSecret(value: unknown): SealedOneTimeProviderSecretRef {
  const fields = readExactOwnDataObject(value, sealedSecretKeys);
  if (
    fields.kind !== "sealed_one_time_provider_secret_ref" ||
    fields.providerConsumption !== "one_time"
  ) {
    throw integrityError();
  }
  const secretRef = opaqueReference(fields.secretRef);
  let parsed: URL;
  try {
    parsed = new URL(secretRef);
  } catch {
    throw integrityError();
  }
  if (
    (parsed.protocol !== "vault:" && parsed.protocol !== "kms:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw integrityError();
  }
  return Object.freeze({
    kind: fields.kind,
    secretRef,
    providerExpiresAt: instant(fields.providerExpiresAt),
    providerConsumption: fields.providerConsumption
  });
}

function restrictedSavedCardCredential(value: unknown): RestrictedSavedCardCredentialRef {
  const fields = readExactOwnDataObject(value, restrictedSavedCardCredentialKeys);
  if (
    fields.kind !== "restricted_saved_card_credential_ref" ||
    fields.schemaVersion !== 1 ||
    !Number.isSafeInteger(fields.credentialVersion) ||
    Number(fields.credentialVersion) < 1
  ) {
    throw integrityError();
  }
  return Object.freeze({
    kind: fields.kind,
    schemaVersion: 1,
    credentialId: opaqueId(fields.credentialId),
    credentialVersion: Number(fields.credentialVersion)
  });
}

function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) {
    throw integrityError();
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.toString() !== value
    ) {
      throw integrityError();
    }
    return value;
  } catch {
    throw integrityError();
  }
}

function instant(value: unknown): string {
  if (typeof value !== "string") throw integrityError();
  try {
    const parsed = Temporal.Instant.from(value);
    if (parsed.toString() !== value) throw integrityError();
    return value;
  } catch {
    throw integrityError();
  }
}

function opaqueId(value: unknown): string {
  return opaqueString(value, 160);
}

function opaqueReference(value: unknown): string {
  // Encoded immutable-storage locators include key, digest, and key-version metadata.
  // The largest valid local locator is 369 characters; retain a bounded envelope-wide
  // ceiling instead of rejecting it before persistence.
  return opaqueString(value, 1_024);
}

function opaqueString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
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

function readOwnDataDiscriminant(value: unknown, key: string): unknown {
  assertPlainObject(value);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw integrityError();
  }
  return descriptor.value;
}

function readExactOwnDataObject<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  assertPlainObject(value);
  const expected = new Set<string>(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) throw integrityError();
  const fields = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) throw integrityError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrityError();
    }
    fields[key] = descriptor.value;
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(fields, key)) throw integrityError();
  }
  return fields as Readonly<Record<Keys[number], unknown>>;
}

function readExactOwnDataArray(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null) throw integrityError();
  assertNotProxy(value);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw integrityError();
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)) throw integrityError();
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0) throw integrityError();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) throw integrityError();
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw integrityError();
    }
    result.push(descriptor.value);
  }
  return result;
}

function assertPlainObject(value: unknown): asserts value is object {
  if (typeof value !== "object" || value === null) throw integrityError();
  assertNotProxy(value);
  if (Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw integrityError();
  }
}

function assertNotProxy(value: object): void {
  try {
    if (nodeUtilTypes.isProxy(value)) throw integrityError();
  } catch (error) {
    if (error instanceof ProviderDispatchEnvelopeIntegrityError) throw error;
    throw integrityError();
  }
}

function integrityError(): ProviderDispatchEnvelopeIntegrityError {
  return new ProviderDispatchEnvelopeIntegrityError();
}
