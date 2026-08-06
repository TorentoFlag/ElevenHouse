import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOnlineWalletChargebackResolutionIntegritySql,
  financeOnlineWalletChargebackResolutions
} from "./online-wallet-chargeback-resolutions.schema";

describe("online wallet chargeback terminal resolution schema", () => {
  it("keeps terminal evidence append-only and one-to-one with the provisional V2 case", () => {
    expect(getTableName(financeOnlineWalletChargebackResolutions)).toBe(
      "finance_online_wallet_chargeback_resolutions"
    );
    expect(Object.keys(getTableColumns(financeOnlineWalletChargebackResolutions))).toEqual(
      expect.arrayContaining([
        "chargebackCaseId",
        "resolution",
        "providerLifecycleFact",
        "evidenceArtifactId",
        "allocationAuthorityDigest",
        "journalTransactionId",
        "journalCanonicalDigest",
        "canonicalDigest"
      ])
    );
    expect(getTableColumns(financeOnlineWalletChargebackResolutions).cumulativePrincipalMinor.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(getTableConfig(financeOnlineWalletChargebackResolutions).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_online_wallet_chargeback_resolutions_case_unique",
        "finance_online_wallet_chargeback_resolutions_journal_unique"
      ])
    );
    expect(financeOnlineWalletChargebackResolutionIntegritySql).toContain("append-only");
    expect(financeOnlineWalletChargebackResolutionIntegritySql).toContain("provisional_loss");
  });
});
