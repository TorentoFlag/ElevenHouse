import {
  createFiscalChargeSnapshot,
  type FiscalBuyerContact,
  type FiscalChargeSnapshot,
  type FiscalTransactionCategory
} from "./fiscal-profile";
import type { FiscalProfileReaderPort } from "./ports/fiscal-profile-reader";

export class FiscalChargePreparationError extends Error {
  readonly code = "FINANCE_FISCAL_CHARGE_PREPARATION_ERROR" as const;

  constructor(readonly reason: "published_profile_missing") {
    super("A published accounting profile is required before provider preparation");
    this.name = "FiscalChargePreparationError";
  }
}

/**
 * The only charge-snapshot factory intended for application orchestration. Callers choose their
 * product lines, but never tax or fiscal fields: those come from the published profile reader.
 */
export async function prepareFiscalChargeSnapshot(input: Readonly<{
  reader: FiscalProfileReaderPort;
  transactionCategory: FiscalTransactionCategory;
  buyerContact: FiscalBuyerContact;
  lines: readonly Readonly<{ sourceLineId: string; name: string; amountMinor: number }>[];
}>): Promise<FiscalChargeSnapshot> {
  const profile = await input.reader.findPublishedProfile({
    transactionCategory: input.transactionCategory
  });
  if (!profile) throw new FiscalChargePreparationError("published_profile_missing");
  return createFiscalChargeSnapshot({
    profile,
    buyerContact: input.buyerContact,
    lines: input.lines
  });
}
