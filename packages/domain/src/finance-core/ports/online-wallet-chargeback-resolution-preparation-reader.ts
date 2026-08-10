import type { FinanceProviderAccountIdentity, RawProviderArtifactRef } from "./finance-port-types";

/** Server-derived case plus the sealed, signature-verified terminal ArcPay event selected by an operator. */
export type OnlineWalletChargebackResolutionPreparation = Readonly<{
  chargebackCaseId: string;
  chargebackCaseVersion: number;
  walletId: string;
  walletRevision: string;
  providerAccount: FinanceProviderAccountIdentity;
  providerPaymentId: string;
  cumulativePrincipalMinor: string;
  outcomeWebhookEventId: string;
  outcomeArtifact: RawProviderArtifactRef;
  outcomeObservedAt: string;
}>;

export type OnlineWalletChargebackResolutionPreparationReader = Readonly<{
  findForResolution(input: Readonly<{
    chargebackCaseId: string;
    outcomeWebhookEventId: string;
  }>): Promise<OnlineWalletChargebackResolutionPreparation | null>;
}>;
