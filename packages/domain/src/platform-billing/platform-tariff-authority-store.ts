import type {
  PlatformTariffBillingCycle,
  PlatformTariffDraftInput,
  PlatformTariffInvoiceState,
  PlatformTariffSubscriptionSnapshot,
  PlatformTariffVersion
} from "./platform-tariff-authority";

export type PlatformTariffInvoiceRecord = Readonly<{
  invoiceId: string;
  subscriptionId: string;
  ownerUserId: string;
  tariffSeriesId: string;
  tariffVersion: number;
  tariffVersionDigest: `sha256:${string}`;
  amountMinor: number;
  currency: "RUB";
  state: PlatformTariffInvoiceState;
  version: number;
  billingPeriodStartAt: string;
  billingPeriodEndAt: string;
}>;

export type PlatformTariffSubscriptionRecord = Readonly<
  PlatformTariffSubscriptionSnapshot & { billingCycle: PlatformTariffBillingCycle }
>;

export type PlatformTariffSubscriptionPurchaseRecord = Readonly<{
  subscription: PlatformTariffSubscriptionRecord;
  invoice: PlatformTariffInvoiceRecord | null;
}>;

/**
 * Admin tariff mutations and runtime entitlement reads share this port; infrastructure chooses
 * locks and audit/outbox mechanics, while callers never mutate tariff rows directly.
 */
export type PlatformTariffAuthorityStore = Readonly<{
  listTariffVersions(): Promise<readonly PlatformTariffVersion[]>;
  createDraft(input: PlatformTariffDraftInput): Promise<PlatformTariffVersion>;
  updateDraft(input: Readonly<{
    tariffSeriesId: string;
    version: number;
    expectedDraftRevision: number;
    next: PlatformTariffDraftInput;
  }>): Promise<PlatformTariffVersion>;
  publishDraft(input: Readonly<{
    tariffSeriesId: string;
    version: number;
    expectedDraftRevision: number;
  }>): Promise<PlatformTariffVersion>;
  findTariffVersion(input: Readonly<{
    tariffSeriesId: string;
    version: number;
    canonicalDigest: `sha256:${string}`;
  }>): Promise<PlatformTariffVersion | null>;
  findPublishedTariffVersion(input: Readonly<{
    tariffSeriesId: string;
    version: number;
  }>): Promise<PlatformTariffVersion | null>;
  beginSubscriptionPurchase(input: Readonly<{
    ownerUserId: string;
    tariffSeriesId: string;
    version: number;
    billingCycle: PlatformTariffBillingCycle;
    now: string;
  }>): Promise<PlatformTariffSubscriptionPurchaseRecord>;
  markInvoicePaymentPending(input: Readonly<{
    invoiceId: string;
  }>): Promise<PlatformTariffInvoiceRecord>;
  applyVerifiedInvoiceCapture(input: Readonly<{
    invoiceId: string;
    capturedAt: string;
  }>): Promise<PlatformTariffSubscriptionPurchaseRecord>;
  /**
   * Read-model authority for the tariff purchase journey. Unlike the active-only resolver used
   * by entitlement and commission checks, it also returns an incomplete setup/initial-payment
   * subscription so the authenticated owner can resume the truthful next action after refresh.
   */
  findActiveOrPendingSubscription(
    ownerUserId: string
  ): Promise<PlatformTariffSubscriptionRecord | null>;
  /** Active-only authority for commission and capability enforcement. */
  findCurrentSubscription(ownerUserId: string): Promise<PlatformTariffSubscriptionSnapshot | null>;
}>;
