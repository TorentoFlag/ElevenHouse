/* eslint-disable no-control-regex -- Domain validation intentionally rejects ASCII control characters. */
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import { canonicalizeFinanceCommandPayload } from "../finance-authorization/canonical-command-payload";
import type { FinanceDigest } from "./ports/finance-port-types";

export const arcPayFiscalVatRateValues = [
  "no_vat",
  "vat0",
  "vat10",
  "vat110",
  "vat20",
  "vat120"
] as const;

export type ArcPayFiscalVatRate = (typeof arcPayFiscalVatRateValues)[number];
export type FiscalTransactionCategory = "client_purchase" | "platform_subscription";

export type FiscalProfile = Readonly<{
  profileSeriesId: string;
  version: number;
  transactionCategory: FiscalTransactionCategory;
  currency: "RUB";
  fiscalizationProvider: "arc_pay_embedded";
  merchantTaxId: string;
  buyerContactRequirement: "email_or_phone";
  lineTemplate: Readonly<{
    vatRate: ArcPayFiscalVatRate;
    paymentObject: string;
    paymentMethod: string;
    measure: string;
    itemCode: string;
  }>;
  canonicalDigest: FinanceDigest;
}>;

export type FiscalChargeLineSnapshot = Readonly<{
  sourceLineId: string;
  name: string;
  quantity: "1";
  unitPriceMinor: number;
  amountMinor: number;
  vatRate: ArcPayFiscalVatRate;
  paymentObject: string;
  paymentMethod: string;
  measure: string;
  itemCode: string;
}>;

/**
 * The fiscal profile says which contact is required; the immutable charge snapshot records the
 * selected contact actually sent for that receipt. It is private finance evidence, never a log
 * field or a public checkout response.
 */
export type FiscalBuyerContact =
  | Readonly<{ kind: "email"; value: string }>
  | Readonly<{ kind: "phone"; value: string }>;

/** Validates a buyer-selected receipt contact before it can be checked against verified identity. */
export function normalizeFiscalBuyerContact(value: unknown): FiscalBuyerContact {
  return normalizeBuyerContact(value);
}

export type FiscalChargeSnapshot = Readonly<{
  profileSeriesId: string;
  profileVersion: number;
  profileDigest: FinanceDigest;
  transactionCategory: FiscalTransactionCategory;
  currency: "RUB";
  merchantTaxId: string;
  buyerContactRequirement: "email_or_phone";
  buyerContact: FiscalBuyerContact;
  lines: readonly FiscalChargeLineSnapshot[];
  totalAmountMinor: number;
  canonicalDigest: FinanceDigest;
}>;

export class FiscalProfileIntegrityError extends Error {
  readonly code = "FINANCE_FISCAL_PROFILE_INTEGRITY_ERROR" as const;

  constructor(readonly reason: "invalid_profile" | "invalid_charge_snapshot") {
    super("Fiscal profile or charge snapshot violates the accounting contract");
    this.name = "FiscalProfileIntegrityError";
  }
}

/**
 * This type contains only values approved by accounting/legal. There are deliberately no
 * defaults for tax, payment-object, payment-method, measure, item code or buyer-contact rule.
 */
export function createFiscalProfile(input: Omit<FiscalProfile, "canonicalDigest">): FiscalProfile {
  const normalized = normalizeProfile(input);
  return Object.freeze({
    ...normalized,
    canonicalDigest: digestFinanceCanonicalValueV1(normalized)
  });
}

/** Exact canonical preimage persisted alongside the digest for independent database rehydration. */
export function canonicalizeFiscalProfile(
  input: Omit<FiscalProfile, "canonicalDigest"> | FiscalProfile
): string {
  return new TextDecoder().decode(canonicalizeFinanceCommandPayload(normalizeProfile(input)));
}

/**
 * A successful charge references an immutable profile version and snapshots the exact fiscal line
 * sent to the provider. This keeps a later profile edit from changing an already-created receipt.
 */
export function createFiscalChargeSnapshot(input: Readonly<{
  profile: FiscalProfile;
  buyerContact: FiscalBuyerContact;
  lines: readonly Readonly<{ sourceLineId: string; name: string; amountMinor: number }>[];
}>): FiscalChargeSnapshot {
  const profile = verifyProfile(input.profile);
  const buyerContact = normalizeBuyerContact(input.buyerContact);
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    fail("invalid_charge_snapshot");
  }
  const lineIds = new Set<string>();
  const lines = input.lines.map((line) => {
    const sourceLineId = opaqueId(line.sourceLineId, 160);
    if (lineIds.has(sourceLineId)) fail("invalid_charge_snapshot");
    lineIds.add(sourceLineId);
    const amountMinor = positiveMinor(line.amountMinor);
    const snapshot = Object.freeze({
      sourceLineId,
      name: label(line.name, 128),
      quantity: "1" as const,
      unitPriceMinor: amountMinor,
      amountMinor,
      ...profile.lineTemplate
    });
    return snapshot;
  });
  const totalAmountMinor = lines.reduce((total, line) => {
    const next = total + line.amountMinor;
    if (!Number.isSafeInteger(next)) fail("invalid_charge_snapshot");
    return next;
  }, 0);
  const snapshotCore = Object.freeze({
    profileSeriesId: profile.profileSeriesId,
    profileVersion: profile.version,
    profileDigest: profile.canonicalDigest,
    transactionCategory: profile.transactionCategory,
    currency: profile.currency,
    merchantTaxId: profile.merchantTaxId,
    buyerContactRequirement: profile.buyerContactRequirement,
    buyerContact,
    lines: Object.freeze(lines),
    totalAmountMinor
  });
  return Object.freeze({
    ...snapshotCore,
    canonicalDigest: digestFinanceCanonicalValueV1(snapshotCore)
  });
}

export function verifyFiscalChargeSnapshot(snapshot: FiscalChargeSnapshot): FiscalChargeSnapshot {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    fail("invalid_charge_snapshot");
  }
  if (
    !hasExactOwnKeys(snapshot, [
      "profileSeriesId",
      "profileVersion",
      "profileDigest",
      "transactionCategory",
      "currency",
      "merchantTaxId",
      "buyerContactRequirement",
      "buyerContact",
      "lines",
      "totalAmountMinor",
      "canonicalDigest"
    ])
  ) {
    fail("invalid_charge_snapshot");
  }
  const profile = createFiscalProfile({
    profileSeriesId: snapshot.profileSeriesId,
    version: snapshot.profileVersion,
    transactionCategory: snapshot.transactionCategory,
    currency: snapshot.currency,
    fiscalizationProvider: "arc_pay_embedded",
    merchantTaxId: snapshot.merchantTaxId,
    buyerContactRequirement: snapshot.buyerContactRequirement,
    lineTemplate: lineTemplateFromSnapshot(snapshot.lines)
  });
  const buyerContact = normalizeBuyerContact(snapshot.buyerContact);
  if (profile.canonicalDigest !== snapshot.profileDigest) fail("invalid_charge_snapshot");
  const declaredTotalAmountMinor = positiveMinor(snapshot.totalAmountMinor);
  const actualTotalAmountMinor = snapshot.lines.reduce((total, line) => {
    const next = total + positiveMinor(line.amountMinor);
    if (!Number.isSafeInteger(next)) fail("invalid_charge_snapshot");
    return next;
  }, 0);
  if (declaredTotalAmountMinor !== actualTotalAmountMinor) fail("invalid_charge_snapshot");
  const reconstructed = createFiscalChargeSnapshot({
    profile,
    buyerContact,
    lines: snapshot.lines.map((line) => ({
      sourceLineId: line.sourceLineId,
      name: line.name,
      amountMinor: line.amountMinor
    }))
  });
  if (reconstructed.canonicalDigest !== snapshot.canonicalDigest) fail("invalid_charge_snapshot");
  return reconstructed;
}

function verifyProfile(profile: FiscalProfile): FiscalProfile {
  const normalized = normalizeProfile(profile);
  if (profile.canonicalDigest !== digestFinanceCanonicalValueV1(normalized)) fail("invalid_profile");
  return Object.freeze({ ...normalized, canonicalDigest: profile.canonicalDigest });
}

function normalizeProfile(input: Omit<FiscalProfile, "canonicalDigest"> | FiscalProfile) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("invalid_profile");
  const profileSeriesId = opaqueId(input.profileSeriesId, 160);
  const version = positiveRevision(input.version);
  if (
    (input.transactionCategory !== "client_purchase" && input.transactionCategory !== "platform_subscription") ||
    input.currency !== "RUB" ||
    input.fiscalizationProvider !== "arc_pay_embedded" ||
    input.buyerContactRequirement !== "email_or_phone"
  ) {
    fail("invalid_profile");
  }
  const merchantTaxId = input.merchantTaxId;
  if (typeof merchantTaxId !== "string" || !/^(?:\d{10}|\d{12})$/.test(merchantTaxId)) {
    fail("invalid_profile");
  }
  const lineTemplate = input.lineTemplate;
  if (typeof lineTemplate !== "object" || lineTemplate === null || Array.isArray(lineTemplate)) {
    fail("invalid_profile");
  }
  if (!(arcPayFiscalVatRateValues as readonly string[]).includes(lineTemplate.vatRate)) {
    fail("invalid_profile");
  }
  return Object.freeze({
    profileSeriesId,
    version,
    transactionCategory: input.transactionCategory,
    currency: "RUB" as const,
    fiscalizationProvider: "arc_pay_embedded" as const,
    merchantTaxId,
    buyerContactRequirement: "email_or_phone" as const,
    lineTemplate: Object.freeze({
      vatRate: lineTemplate.vatRate,
      paymentObject: label(lineTemplate.paymentObject, 128),
      paymentMethod: label(lineTemplate.paymentMethod, 128),
      measure: label(lineTemplate.measure, 128),
      itemCode: label(lineTemplate.itemCode, 128)
    })
  });
}

function opaqueId(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength || /[\u0000-\u001F]/.test(value)) {
    fail("invalid_profile");
  }
  return value;
}

function label(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximumLength || /[\u0000-\u001F]/.test(value)) {
    fail("invalid_profile");
  }
  return value.trim();
}

function positiveRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_profile");
  return Number(value);
}

function positiveMinor(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail("invalid_charge_snapshot");
  return Number(value);
}

function normalizeBuyerContact(value: unknown): FiscalBuyerContact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_charge_snapshot");
  }
  if (!hasExactOwnKeys(value, ["kind", "value"])) fail("invalid_charge_snapshot");
  const contact = value as { readonly kind?: unknown; readonly value?: unknown };
  if (typeof contact.value !== "string" || contact.value.length < 1 || contact.value.length > 254) {
    fail("invalid_charge_snapshot");
  }
  if (contact.kind === "email") {
    const email = contact.value.trim();
    if (email !== contact.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail("invalid_charge_snapshot");
    }
    return Object.freeze({ kind: "email", value: email });
  }
  if (contact.kind === "phone") {
    if (!/^\+[1-9]\d{1,14}$/.test(contact.value)) fail("invalid_charge_snapshot");
    return Object.freeze({ kind: "phone", value: contact.value });
  }
  fail("invalid_charge_snapshot");
}

function hasExactOwnKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function lineTemplateFromSnapshot(lines: readonly FiscalChargeLineSnapshot[]) {
  if (!Array.isArray(lines) || lines.length < 1) fail("invalid_charge_snapshot");
  const [first] = lines;
  if (!first) fail("invalid_charge_snapshot");
  for (const line of lines) {
    if (
      line.vatRate !== first.vatRate ||
      line.paymentObject !== first.paymentObject ||
      line.paymentMethod !== first.paymentMethod ||
      line.measure !== first.measure ||
      line.itemCode !== first.itemCode ||
      line.quantity !== "1" ||
      line.unitPriceMinor !== line.amountMinor
    ) {
      fail("invalid_charge_snapshot");
    }
  }
  return Object.freeze({
    vatRate: first.vatRate,
    paymentObject: first.paymentObject,
    paymentMethod: first.paymentMethod,
    measure: first.measure,
    itemCode: first.itemCode
  });
}

function fail(reason: FiscalProfileIntegrityError["reason"]): never {
  throw new FiscalProfileIntegrityError(reason);
}
