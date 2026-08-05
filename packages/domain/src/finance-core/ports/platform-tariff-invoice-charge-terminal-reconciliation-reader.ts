import type {
  FinanceProviderAccountIdentity,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";

/**
 * A saved-card POST that returned a non-terminal response is never sent again automatically.
 * This reader gives the recovery worker the persisted provider payment identity for canonical
 * polling, along with the exact optimistic-lock versions required to resolve it.
 */
export type PlatformTariffInvoiceChargeTerminalReconciliationCandidate = Readonly<{
  invoiceId: string;
  expectedInvoiceVersion: number;
  providerPaymentId: string;
  /** A durable 3DS action already exists for this exact operation version. */
  customerActionState: "not_recorded" | "recorded";
  providerOperation: Readonly<{
    operationKind: "saved_card_charge" | "saved_card_charge_3ds_method_complete";
    economicPaymentIntentId: string;
    expectedEconomicPaymentVersion: number;
    providerOperationIntentId: string;
    expectedProviderOperationIntentVersion: number;
    economicPaymentSessionId: string;
    providerAccount: FinanceProviderAccountIdentity;
    canonicalRequestDigest: `sha256:${string}`;
    idempotencyKey: string;
    operationEnvelope: ResolvedFinanceOperationEnvelope;
  }>;
}>;

export type PlatformTariffInvoiceChargeTerminalReconciliationReaderPort = Readonly<{
  listAwaitingCanonicalOutcome(input: Readonly<{
    limit: number;
  }>): Promise<readonly PlatformTariffInvoiceChargeTerminalReconciliationCandidate[]>;
}>;
