import type { ApplyVerifiedProviderResultCommand } from "./provider-operation-result-application-uow";
import type { VerifiedCaptureApplicationCommitReceipt } from "./verified-capture-application-uow";

/**
 * One transaction for canonical provider evidence, payment capture, tariff invoice activation,
 * and its immutable journal. Separating these commits can strand a successful provider result
 * without the entitlement it authorizes.
 */
export type PlatformTariffInvoiceCanonicalCaptureUnitOfWork = Readonly<{
  applyCanonicalCapture(input: Readonly<{
    providerResult: ApplyVerifiedProviderResultCommand & Readonly<{
      evidence: ApplyVerifiedProviderResultCommand["evidence"] & Readonly<{
        outcome: "succeeded";
        providerPaymentId: string;
        amountMinor: string;
        currency: "RUB";
      }>;
    }>;
    capturedAt: string;
    postedAt: string;
  }>): Promise<VerifiedCaptureApplicationCommitReceipt>;
}>;
