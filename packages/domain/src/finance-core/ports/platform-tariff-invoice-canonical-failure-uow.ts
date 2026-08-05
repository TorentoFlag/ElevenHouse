import type { ApplyVerifiedProviderResultCommand } from "./provider-operation-result-application-uow";

export type PlatformTariffInvoiceCanonicalFailureState = "declined" | "failed";

export type PlatformTariffInvoiceCanonicalFailureCommitReceipt = Readonly<{
  kind: "platform_tariff_invoice_canonical_failure_commit_receipt";
  invoiceId: string;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  targetState: PlatformTariffInvoiceCanonicalFailureState;
  committedAt: string;
}>;

/**
 * Atomically records a canonical terminal refusal without making a financial posting. A failed
 * initial tariff payment must leave both the subscription and the wallet untouched.
 */
export type PlatformTariffInvoiceCanonicalFailureUnitOfWork = Readonly<{
  applyCanonicalFailure(input: Readonly<{
    providerResult: ApplyVerifiedProviderResultCommand & Readonly<{
      evidence: ApplyVerifiedProviderResultCommand["evidence"] & Readonly<{
        outcome: "failed";
      }>;
    }>;
    targetState: PlatformTariffInvoiceCanonicalFailureState;
  }>): Promise<PlatformTariffInvoiceCanonicalFailureCommitReceipt>;
}>;
