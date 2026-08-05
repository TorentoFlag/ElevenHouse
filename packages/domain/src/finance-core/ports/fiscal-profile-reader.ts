import type { FiscalProfile, FiscalTransactionCategory } from "../fiscal-profile";

/** Authoritative read for payment preparation. Missing profile is a controlled no-charge outcome. */
export type FiscalProfileReaderPort = Readonly<{
  findPublishedProfile(input: Readonly<{
    transactionCategory: FiscalTransactionCategory;
  }>): Promise<FiscalProfile | null>;
}>;
