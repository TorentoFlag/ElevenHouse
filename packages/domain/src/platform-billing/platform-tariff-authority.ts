import {
  canonicalizeFinanceCommandPayload,
  hashFinanceCommandPayload
} from "../finance-authorization/canonical-command-payload";
import { Temporal } from "@js-temporal/polyfill";
import type { PlatformPlanFeatureCode } from "./platform-billing-types";
import { assertPlatformPlanPublishable } from "./platform-plan-publication";

export type PlatformTariffLifecycle = "draft" | "published" | "retired";
export type PlatformTariffSubscriptionState =
  | "incomplete_setup"
  | "awaiting_initial_payment"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";
export type PlatformTariffBillingCycle = "month" | "year";
export type PlatformTariffInvoiceState =
  | "open"
  | "payment_pending"
  | "requires_customer_action"
  | "captured"
  | "declined"
  | "failed"
  | "provider_unknown"
  | "void"
  | "uncollectible";

export type PlatformTariffVersion = Readonly<{
  tariffSeriesId: string;
  version: number;
  draftRevision: number;
  lifecycle: PlatformTariffLifecycle;
  name: string;
  tagline: string;
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
  /** Explicit merchant-approved ArcPay MIT interval; never inferred from a display label. */
  monthlyRecurringFrequencyDays: number | null;
  /** Explicit merchant-approved ArcPay MIT interval; never inferred from a display label. */
  yearlyRecurringFrequencyDays: number | null;
  clientSaleCommissionBps: number;
  seatsLimit: number | null;
  bookingsLimit: number | null;
  aiRequestsLimit: number | null;
  automationLimit: number | null;
  isPopular: boolean;
  displayOrder: number;
  features: readonly PlatformPlanFeatureCode[];
  canonicalDigest: `sha256:${string}`;
}>;

export type PlatformTariffDraftInput = Omit<
  PlatformTariffVersion,
  "lifecycle" | "canonicalDigest" | "draftRevision"
>;

export type PlatformTariffSubscriptionSnapshot = Readonly<{
  subscriptionId: string;
  ownerUserId: string;
  tariffSeriesId: string;
  tariffVersion: number;
  tariffVersionDigest: `sha256:${string}`;
  commissionBpsSnapshot: number;
  /** Optimistic concurrency revision for resume/setup/payment commands. */
  version: number;
  state: PlatformTariffSubscriptionState;
  startsAt: string | null;
  endsAt: string | null;
}>;

/** A tariff-selection authority. The adapter assigns a durable subscription identifier. */
export type PlatformTariffSubscriptionPurchase = Readonly<{
  subscription: Readonly<
    Omit<PlatformTariffSubscriptionSnapshot, "subscriptionId"> & {
      billingCycle: PlatformTariffBillingCycle;
    }
  >;
  invoice: Readonly<{
    amountMinor: number;
    currency: "RUB";
    state: "open";
    billingPeriodStartAt: string;
    billingPeriodEndAt: string;
  }> | null;
}>;

export type PlatformTariffInvoiceCaptureAuthority = Readonly<{
  ownerUserId: string;
  tariffSeriesId: string;
  tariffVersion: number;
  tariffVersionDigest: `sha256:${string}`;
  amountMinor: number;
  currency: "RUB";
  state: PlatformTariffInvoiceState;
  billingPeriodStartAt: string;
  billingPeriodEndAt: string;
}>;

export class PlatformTariffAuthorityError extends Error {
  constructor(readonly reason: "invalid_tariff" | "tariff_not_publishable" | "tariff_not_purchasable" | "draft_revision_conflict" | "subscription_snapshot_mismatch" | "invoice_capture_transition_invalid") {
    super("Platform tariff authority validation failed");
    this.name = "PlatformTariffAuthorityError";
  }
}

/**
 * Creates the immutable commercial authority for a tariff selection. This does not create an
 * invoice or charge a paid tariff: saved-card setup must first complete with provider evidence.
 */
export function preparePlatformTariffSubscriptionPurchase(input: Readonly<{
  ownerUserId: string;
  tariff: PlatformTariffVersion;
  billingCycle: PlatformTariffBillingCycle;
  now: string;
}>): PlatformTariffSubscriptionPurchase {
  if (!identifier(input.ownerUserId, 160)) fail("invalid_tariff");
  const tariff = verifyPlatformTariffVersion(input.tariff);
  if (tariff.lifecycle !== "published") fail("tariff_not_purchasable");
  if (input.billingCycle !== "month" && input.billingCycle !== "year") fail("invalid_tariff");

  const amountMinor = input.billingCycle === "month" ? tariff.monthlyPriceMinor : tariff.yearlyPriceMinor;
  const paid = amountMinor > 0;
  const billingPeriodStartAt = paid ? null : canonicalInstant(input.now);
  const billingPeriodEndAt =
    billingPeriodStartAt === null ? null : addBillingPeriod(billingPeriodStartAt, input.billingCycle);

  return Object.freeze({
    subscription: Object.freeze({
      ownerUserId: input.ownerUserId,
      tariffSeriesId: tariff.tariffSeriesId,
      tariffVersion: tariff.version,
      tariffVersionDigest: tariff.canonicalDigest,
      commissionBpsSnapshot: tariff.clientSaleCommissionBps,
      version: 1,
      billingCycle: input.billingCycle,
      state: paid ? "incomplete_setup" : "active",
      startsAt: billingPeriodStartAt,
      endsAt: billingPeriodEndAt
    }),
    invoice: null
  });
}

/**
 * Creates an initial invoice only after a trusted credential-activation workflow has persisted
 * the provider result. It deliberately has no raw card or provider input, so controllers cannot
 * turn browser data into a charge authority.
 */
export function preparePlatformTariffInitialInvoice(input: Readonly<{
  subscription: PlatformTariffSubscriptionPurchase["subscription"];
  tariff: PlatformTariffVersion;
  now: string;
}>): PlatformTariffSubscriptionPurchase {
  if (input.subscription.state !== "incomplete_setup") fail("invoice_capture_transition_invalid");
  const tariff = verifyPlatformTariffVersion(input.tariff);
  if (
    (tariff.lifecycle !== "published" && tariff.lifecycle !== "retired") ||
    input.subscription.tariffSeriesId !== tariff.tariffSeriesId ||
    input.subscription.tariffVersion !== tariff.version ||
    input.subscription.tariffVersionDigest !== tariff.canonicalDigest ||
    input.subscription.commissionBpsSnapshot !== tariff.clientSaleCommissionBps
  ) fail("subscription_snapshot_mismatch");
  const amountMinor = input.subscription.billingCycle === "month"
    ? tariff.monthlyPriceMinor
    : tariff.yearlyPriceMinor;
  if (!minor(amountMinor) || amountMinor === 0) fail("invoice_capture_transition_invalid");
  const billingPeriodStartAt = canonicalInstant(input.now);
  const billingPeriodEndAt = addBillingPeriod(billingPeriodStartAt, input.subscription.billingCycle);
  return Object.freeze({
    subscription: Object.freeze({ ...input.subscription, state: "awaiting_initial_payment" as const }),
    invoice: Object.freeze({
      amountMinor,
      currency: "RUB" as const,
      state: "open" as const,
      billingPeriodStartAt,
      billingPeriodEndAt
    })
  });
}

/**
 * Applies an already verified provider capture to the tariff authority. The worker/UOW must prove
 * the provider result before calling this transition; an invoice in any pre-dispatch state cannot
 * grant access.
 */
export function applyVerifiedTariffInvoiceCapture(input: Readonly<{
  subscription: Omit<PlatformTariffSubscriptionPurchase["subscription"], "billingCycle"> & {
    billingCycle: PlatformTariffBillingCycle;
  };
  invoice: PlatformTariffInvoiceCaptureAuthority;
  capturedAt: string;
}>): Readonly<{
  subscription: PlatformTariffSubscriptionPurchase["subscription"];
  invoice: PlatformTariffInvoiceCaptureAuthority & { state: "captured"; capturedAt: string };
}> {
  if (input.subscription.state !== "awaiting_initial_payment" || input.invoice.state !== "payment_pending") {
    fail("invoice_capture_transition_invalid");
  }
  if (
    input.subscription.ownerUserId !== input.invoice.ownerUserId ||
    input.subscription.tariffSeriesId !== input.invoice.tariffSeriesId ||
    input.subscription.tariffVersion !== input.invoice.tariffVersion ||
    input.subscription.tariffVersionDigest !== input.invoice.tariffVersionDigest ||
    input.invoice.currency !== "RUB" ||
    !minor(input.invoice.amountMinor) ||
    input.invoice.amountMinor === 0
  ) fail("subscription_snapshot_mismatch");
  const billingPeriodStartAt = canonicalInstant(input.invoice.billingPeriodStartAt);
  const billingPeriodEndAt = canonicalInstant(input.invoice.billingPeriodEndAt);
  const capturedAt = canonicalInstant(input.capturedAt);
  if (Date.parse(billingPeriodEndAt) <= Date.parse(billingPeriodStartAt)) fail("invalid_tariff");
  return Object.freeze({
    subscription: Object.freeze({
      ...input.subscription,
      state: "active" as const,
      startsAt: billingPeriodStartAt,
      endsAt: billingPeriodEndAt
    }),
    invoice: Object.freeze({
      ...input.invoice,
      state: "captured" as const,
      billingPeriodStartAt,
      billingPeriodEndAt,
      capturedAt
    })
  });
}

export function createPlatformTariffDraft(input: PlatformTariffDraftInput): PlatformTariffVersion {
  return normalizeTariff({ ...input, draftRevision: 1 }, "draft");
}

export function publishPlatformTariffDraft(draft: PlatformTariffVersion): PlatformTariffVersion {
  if (draft.lifecycle !== "draft") fail("invalid_tariff");
  try {
    assertPlatformPlanPublishable({
      features: draft.features,
      seatsLimit: draft.seatsLimit,
      bookingsLimit: draft.bookingsLimit,
      aiRequestsLimit: draft.aiRequestsLimit,
      automationLimit: draft.automationLimit
    });
  } catch {
    fail("tariff_not_publishable");
  }
  return normalizeTariff(draft, "published");
}

export function revisePlatformTariffDraft(input: Readonly<{
  current: PlatformTariffVersion;
  expectedDraftRevision: number;
  next: PlatformTariffDraftInput;
}>): PlatformTariffVersion {
  if (
    input.current.lifecycle !== "draft" ||
    input.current.draftRevision !== input.expectedDraftRevision ||
    input.current.tariffSeriesId !== input.next.tariffSeriesId ||
    input.current.version !== input.next.version
  ) fail("draft_revision_conflict");
  return normalizeTariff({ ...input.next, draftRevision: input.current.draftRevision + 1 }, "draft");
}

/** Reconstructs persisted evidence and rejects a digest that is not its immutable commercial terms. */
export function verifyPlatformTariffVersion(input: PlatformTariffVersion): PlatformTariffVersion {
  if (input.lifecycle !== "draft" && input.lifecycle !== "published" && input.lifecycle !== "retired") {
    fail("invalid_tariff");
  }
  const normalized = normalizeTariff(input, input.lifecycle);
  if (input.canonicalDigest !== normalized.canonicalDigest) fail("invalid_tariff");
  return normalized;
}

export function canonicalizePlatformTariffTerms(input: PlatformTariffVersion): string {
  const verified = verifyPlatformTariffVersion(input);
  return new TextDecoder().decode(canonicalizeFinanceCommandPayload(commercialTerms(verified)));
}

export function resolvePlatformTariffEntitlement(input: Readonly<{
  subscription: PlatformTariffSubscriptionSnapshot | null;
  tariff: PlatformTariffVersion | null;
  capability: PlatformPlanFeatureCode;
  now: string;
}>): "allowed" | "denied" {
  const { subscription, tariff } = input;
  if (!subscription || !tariff || subscription.state !== "active") return "denied";
  if (
    subscription.tariffSeriesId !== tariff.tariffSeriesId ||
    subscription.tariffVersion !== tariff.version ||
    subscription.tariffVersionDigest !== tariff.canonicalDigest ||
    subscription.commissionBpsSnapshot !== tariff.clientSaleCommissionBps ||
    (tariff.lifecycle !== "published" && tariff.lifecycle !== "retired") ||
    !isActiveAt(subscription, input.now)
  ) return "denied";
  return tariff.features.includes(input.capability) ? "allowed" : "denied";
}

export function resolveTariffCommissionBps(input: Readonly<{
  subscription: PlatformTariffSubscriptionSnapshot;
  tariff: PlatformTariffVersion;
}>): number {
  if (
    input.subscription.tariffSeriesId !== input.tariff.tariffSeriesId ||
    input.subscription.tariffVersion !== input.tariff.version ||
    input.subscription.tariffVersionDigest !== input.tariff.canonicalDigest ||
    input.subscription.commissionBpsSnapshot !== input.tariff.clientSaleCommissionBps
  ) fail("subscription_snapshot_mismatch");
  return input.subscription.commissionBpsSnapshot;
}

function normalizeTariff(
  input: Omit<PlatformTariffVersion, "lifecycle" | "canonicalDigest"> | PlatformTariffVersion,
  lifecycle: PlatformTariffLifecycle
): PlatformTariffVersion {
  if (
    !identifier(input.tariffSeriesId, 160) || !positiveInteger(input.version) || !positiveInteger(input.draftRevision) ||
    !identifier(input.name, 120) || !identifier(input.tagline, 240) ||
    !minor(input.monthlyPriceMinor) || !minor(input.yearlyPriceMinor) ||
    !recurringFrequency(input.monthlyPriceMinor, input.monthlyRecurringFrequencyDays) ||
    !recurringFrequency(input.yearlyPriceMinor, input.yearlyRecurringFrequencyDays) ||
    !bps(input.clientSaleCommissionBps) || !displayLimit(input.seatsLimit) ||
    !displayLimit(input.bookingsLimit) || !displayLimit(input.aiRequestsLimit) ||
    !displayLimit(input.automationLimit) || typeof input.isPopular !== "boolean" || !nonNegativeInteger(input.displayOrder) ||
    !Array.isArray(input.features) ||
    new Set(input.features).size !== input.features.length
  ) fail("invalid_tariff");
  const immutableTerms = commercialTerms(input);
  return Object.freeze({
    ...immutableTerms,
    draftRevision: input.draftRevision,
    lifecycle,
    canonicalDigest: hashFinanceCommandPayload(immutableTerms)
  });
}

function commercialTerms(input: Pick<PlatformTariffVersion,
  "tariffSeriesId" | "version" | "name" | "tagline" | "monthlyPriceMinor" | "yearlyPriceMinor" |
  "monthlyRecurringFrequencyDays" | "yearlyRecurringFrequencyDays" |
  "clientSaleCommissionBps" | "seatsLimit" | "bookingsLimit" | "aiRequestsLimit" | "automationLimit" |
  "isPopular" | "displayOrder" | "features"
>) {
  return Object.freeze({
    tariffSeriesId: input.tariffSeriesId,
    version: input.version,
    name: input.name,
    tagline: input.tagline,
    monthlyPriceMinor: input.monthlyPriceMinor,
    yearlyPriceMinor: input.yearlyPriceMinor,
    monthlyRecurringFrequencyDays: input.monthlyRecurringFrequencyDays,
    yearlyRecurringFrequencyDays: input.yearlyRecurringFrequencyDays,
    clientSaleCommissionBps: input.clientSaleCommissionBps,
    seatsLimit: input.seatsLimit,
    bookingsLimit: input.bookingsLimit,
    aiRequestsLimit: input.aiRequestsLimit,
    automationLimit: input.automationLimit,
    isPopular: input.isPopular,
    displayOrder: input.displayOrder,
    features: Object.freeze([...input.features])
  });
}

function isActiveAt(subscription: PlatformTariffSubscriptionSnapshot, now: string): boolean {
  if (!subscription.startsAt || !subscription.endsAt) return false;
  const current = Date.parse(now);
  const starts = Date.parse(subscription.startsAt);
  const ends = Date.parse(subscription.endsAt);
  return Number.isFinite(current) && Number.isFinite(starts) && Number.isFinite(ends) && current >= starts && current < ends;
}
function canonicalInstant(value: string): string {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    fail("invalid_tariff");
  }
}
function addBillingPeriod(startAt: string, cycle: PlatformTariffBillingCycle): string {
  try {
    const start = Temporal.Instant.from(startAt).toZonedDateTimeISO("UTC");
    return start.add(cycle === "month" ? { months: 1 } : { years: 1 }).toInstant().toString();
  } catch {
    fail("invalid_tariff");
  }
}
function identifier(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum; }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function minor(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function recurringFrequency(priceMinor: number, value: unknown): value is number | null {
  return priceMinor === 0
    ? value === null
    : Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 366;
}
function bps(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000; }
function displayLimit(value: unknown): value is number | null { return value === null || (Number.isSafeInteger(value) && Number(value) > 0); }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function fail(reason: PlatformTariffAuthorityError["reason"]): never { throw new PlatformTariffAuthorityError(reason); }
