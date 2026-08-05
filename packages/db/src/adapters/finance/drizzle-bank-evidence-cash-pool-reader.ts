import { and, eq, isNull } from "drizzle-orm";
import type {
  ActiveBankEvidenceCashPool,
  BankEvidenceCashPoolReader
} from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeBankCashPools } from "../../schema/finance/bank-cash.schema";

/**
 * Resolves only an active, exact cash-pool identity.  This prevents an admin browser from
 * binding a payout proof to an arbitrary pool or statement source.
 */
export function createDrizzleBankEvidenceCashPoolReader(
  database: ElevenHouseDatabase
): BankEvidenceCashPoolReader {
  return Object.freeze({
    findActiveBankEvidenceCashPool: (input) => findActiveBankEvidenceCashPool(database, input)
  });
}

export async function findActiveBankEvidenceCashPool(
  database: Pick<ElevenHouseDatabase, "select">,
  input: ActiveBankEvidenceCashPool
): Promise<ActiveBankEvidenceCashPool | null> {
  const [row] = await database
    .select({
      bankCashPoolId: financeBankCashPools.id,
      currency: financeBankCashPools.currency,
      statementSourceFingerprint: financeBankCashPools.statementSourceFingerprint
    })
    .from(financeBankCashPools)
    .where(
      and(
        eq(financeBankCashPools.id, input.bankCashPoolId),
        eq(financeBankCashPools.currency, input.currency),
        eq(financeBankCashPools.statementSourceFingerprint, input.statementSourceFingerprint),
        isNull(financeBankCashPools.retiredAt)
      )
    )
    .limit(1);
  if (
    !row ||
    row.currency !== "RUB" ||
    row.bankCashPoolId !== input.bankCashPoolId ||
    row.statementSourceFingerprint !== input.statementSourceFingerprint
  ) {
    return null;
  }
  return Object.freeze({
    bankCashPoolId: row.bankCashPoolId,
    currency: "RUB",
    statementSourceFingerprint:
      row.statementSourceFingerprint as ActiveBankEvidenceCashPool["statementSourceFingerprint"]
  });
}
