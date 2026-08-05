import type {
  PlatformTariffVersion
} from "../platform-billing/platform-tariff-authority";
import type {
  PlatformTariffInvoiceRecord,
  PlatformTariffSubscriptionRecord
} from "../platform-billing/platform-tariff-authority-store";
import {
  createProviderDispatchEnvelope,
  type ProviderDispatchEnvelope,
  type RestrictedSavedCardCredentialRef
} from "./provider-dispatch-envelope";
import {
  FiscalChargePreparationError,
  prepareFiscalChargeSnapshot
} from "./fiscal-charge-preparation";
import {
  resolveFinanceOperationEnvelope,
  type FinanceOperationResourcePolicyVersion
} from "./finance-operation-resource-policy";
import type { FiscalBuyerContact } from "./fiscal-profile";
import type { ActiveProviderAccountReaderPort } from "./ports/active-provider-account-reader";
import type { FiscalProfileReaderPort } from "./ports/fiscal-profile-reader";
import type { FinanceOperationResourcePolicyReader } from "./ports/finance-operation-resource-policy-reader";
import type {
  FinanceProviderAccountIdentity,
  ResolvedFinanceOperationEnvelope
} from "./ports/finance-port-types";
import type { VerifiedFiscalBuyerContactReaderPort } from "./ports/verified-fiscal-buyer-contact-reader";

export class PlatformTariffInvoiceChargeCommandFactoryError extends Error {
  readonly code = "FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_COMMAND_FACTORY_ERROR" as const;

  constructor(readonly reason:
    | "invoice_not_chargeable"
    | "tariff_snapshot_mismatch"
    | "tariff_schedule_unavailable"
    | "buyer_contact_unverified"
    | "provider_account_missing"
    | "operation_policy_missing"
    | "fiscal_profile_missing"
    | "invalid_preparation") {
    super("Platform tariff invoice charge cannot be prepared from authoritative finance facts");
  }
}

export type PlatformTariffInvoiceChargeCommandFactory = Readonly<{
  prepare(input: Readonly<{
    invoice: PlatformTariffInvoiceRecord;
    subscription: PlatformTariffSubscriptionRecord;
    tariff: PlatformTariffVersion;
    savedCardCredential: RestrictedSavedCardCredentialRef;
    buyerContact: FiscalBuyerContact;
    environment: "sandbox" | "live";
  }>): Promise<Readonly<{
    providerAccount: FinanceProviderAccountIdentity;
    operationEnvelope: ResolvedFinanceOperationEnvelope;
    dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "saved_card_charge" }>;
  }>>;
}>;

/**
 * Resolves every off-provider fact for a tariff invoice charge. It intentionally requires the
 * buyer's selected contact and does not infer an interval from "month"/"year" labels.
 */
export function createPlatformTariffInvoiceChargeCommandFactory(dependencies: Readonly<{
  providerAccounts: ActiveProviderAccountReaderPort;
  fiscalProfiles: FiscalProfileReaderPort;
  buyerContacts: VerifiedFiscalBuyerContactReaderPort;
  operationPolicies: FinanceOperationResourcePolicyReader;
}>): PlatformTariffInvoiceChargeCommandFactory {
  return Object.freeze({
    async prepare(input) {
      assertInvoiceAuthority(input);
      const recurringFrequencyDays = billingFrequency(input.subscription, input.tariff);
      const [providerAccount, verifiedContact, policy] = await Promise.all([
        dependencies.providerAccounts.findActiveProviderAccount({ provider: "arc_pay", environment: input.environment }),
        dependencies.buyerContacts.findVerifiedFiscalBuyerContact({
          clientUserId: input.subscription.ownerUserId,
          candidate: input.buyerContact
        }),
        dependencies.operationPolicies.findPublishedForOperation({ operationKind: "platform_invoice_charge" })
      ]);
      if (!providerAccount) fail("provider_account_missing");
      if (!verifiedContact) fail("buyer_contact_unverified");
      if (!policy) fail("operation_policy_missing");
      const operationEnvelope = resolvePolicy(policy);
      let fiscalSnapshot;
      try {
        fiscalSnapshot = await prepareFiscalChargeSnapshot({
          reader: dependencies.fiscalProfiles,
          transactionCategory: "platform_subscription",
          buyerContact: verifiedContact,
          lines: [{ sourceLineId: input.invoice.invoiceId, name: input.tariff.name, amountMinor: input.invoice.amountMinor }]
        });
      } catch (error) {
        if (error instanceof FiscalChargePreparationError) fail("fiscal_profile_missing");
        throw error;
      }
      try {
        const dispatchEnvelope = createProviderDispatchEnvelope({
          kind: "saved_card_charge",
          amount: { amountMinor: input.invoice.amountMinor, currency: "RUB" },
          savedCardCredential: input.savedCardCredential,
          externalId: input.invoice.invoiceId,
          storedCredentialReason: "recurring",
          recurringFrequencyDays,
          fiscalSnapshot
        });
        if (dispatchEnvelope.kind !== "saved_card_charge") fail("invalid_preparation");
        return Object.freeze({ providerAccount, operationEnvelope, dispatchEnvelope });
      } catch {
        fail("invalid_preparation");
      }
    }
  });
}

function assertInvoiceAuthority(input: Parameters<PlatformTariffInvoiceChargeCommandFactory["prepare"]>[0]): void {
  const { invoice, subscription, tariff } = input;
  if (
    invoice.state !== "open" ||
    subscription.state !== "awaiting_initial_payment" ||
    invoice.subscriptionId !== subscription.subscriptionId ||
    invoice.ownerUserId !== subscription.ownerUserId ||
    invoice.tariffSeriesId !== subscription.tariffSeriesId ||
    invoice.tariffVersion !== subscription.tariffVersion ||
    invoice.tariffVersionDigest !== subscription.tariffVersionDigest ||
    tariff.lifecycle !== "published" ||
    tariff.tariffSeriesId !== invoice.tariffSeriesId ||
    tariff.version !== invoice.tariffVersion ||
    tariff.canonicalDigest !== invoice.tariffVersionDigest ||
    invoice.currency !== "RUB" ||
    !Number.isSafeInteger(invoice.version) ||
    invoice.version < 1 ||
    invoice.amountMinor !== billedAmount(subscription, tariff)
  ) {
    fail("invoice_not_chargeable");
  }
}

function billedAmount(subscription: PlatformTariffSubscriptionRecord, tariff: PlatformTariffVersion): number {
  return subscription.billingCycle === "month" ? tariff.monthlyPriceMinor : tariff.yearlyPriceMinor;
}

function billingFrequency(subscription: PlatformTariffSubscriptionRecord, tariff: PlatformTariffVersion): number {
  const frequency = subscription.billingCycle === "month"
    ? tariff.monthlyRecurringFrequencyDays
    : tariff.yearlyRecurringFrequencyDays;
  if (!Number.isSafeInteger(frequency) || frequency === null || frequency < 1 || frequency > 366) {
    fail("tariff_schedule_unavailable");
  }
  return frequency;
}

function resolvePolicy(policy: FinanceOperationResourcePolicyVersion): ResolvedFinanceOperationEnvelope {
  try {
    return resolveFinanceOperationEnvelope({ policy, operationKind: "platform_invoice_charge" });
  } catch {
    fail("operation_policy_missing");
  }
}

function fail(reason: PlatformTariffInvoiceChargeCommandFactoryError["reason"]): never {
  throw new PlatformTariffInvoiceChargeCommandFactoryError(reason);
}
