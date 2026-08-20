import type {
  FinanceProviderAccountIdentity,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";

export type CapturedClientOrderCorrelation = Readonly<{
  /** The canonical ArcPay `external_id`, resolved by a DB lock to exactly one active checkout. */
  externalId: string;
  providerAccount: FinanceProviderAccountIdentity;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  expectedEconomicPaymentVersion: number;
  expectedAmountMinor: string;
  expectedCurrency: "RUB";
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ClientOrderHostedCheckoutCaptureReconciliationCandidate = Readonly<{
  correlation: CapturedClientOrderCorrelation;
}>;

export type ClientOrderHostedCheckoutCaptureReconciliationCandidateReader = Readonly<{
  listPendingClientOrderHostedCheckoutCandidates(
    input: Readonly<{ limit: number }>
  ): Promise<readonly ClientOrderHostedCheckoutCaptureReconciliationCandidate[]>;
}>;
