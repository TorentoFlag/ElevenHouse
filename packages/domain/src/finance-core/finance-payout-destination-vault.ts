import type { FinanceDigest } from "./ports/finance-port-types";

export type PayoutDestinationKind = "bank_card" | "bank_account";

/**
 * Plaintext crosses this boundary only while being sealed into KMS-backed immutable storage.
 * It must never be placed in a database row, outbox payload or log record.
 */
export type PayoutDestinationSealInput = Readonly<{
  payoutMethodId: string;
  payoutMethodVersion: number;
  astrologerUserId: string;
  destinationKind: PayoutDestinationKind;
  recipientName: string;
  bankName: string;
  destinationValue: string;
}>;

export type SealedPayoutDestinationSnapshot = Readonly<{
  kind: "sealed_payout_destination_snapshot";
  payoutMethodId: string;
  payoutMethodVersion: number;
  destinationKind: PayoutDestinationKind;
  beneficiaryFingerprint: FinanceDigest;
  redactedDisplay: string;
  sealedDestinationRef: string;
}>;

export type ResolvedPayoutDestination = Readonly<{
  destinationKind: PayoutDestinationKind;
  recipientName: string;
  bankName: string;
  destinationValue: string;
}>;

export type FinancePayoutDestinationVaultPort = Readonly<{
  sealPayoutDestination(
    input: PayoutDestinationSealInput
  ): Promise<SealedPayoutDestinationSnapshot>;
  resolvePayoutDestination(input: Readonly<{
    snapshot: SealedPayoutDestinationSnapshot;
    expectedAstrologerUserId: string;
  }>): Promise<ResolvedPayoutDestination>;
}>;
