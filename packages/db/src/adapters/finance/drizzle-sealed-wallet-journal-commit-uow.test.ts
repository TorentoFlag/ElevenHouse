import type {
  FinanceProviderAccountIdentity,
  SealedWalletJournalMutationCommand
} from "@elevenhouse/domain/finance-core";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import type { FinanceTransaction } from "./drizzle-finance-command-store";
import {
  createDrizzleSealedWalletJournalCommitUnitOfWork,
  deriveExactTransitionProviderIdentity,
  exactProviderAccountPredicate,
  issuePersistenceTransactionBoundaryRef,
  SealedWalletJournalCommitPersistenceError
} from "./drizzle-sealed-wallet-journal-commit-uow";

describe("sealed wallet/journal persistence authority", () => {
  it.each([
    ["40001", false],
    ["40P01", true]
  ])("maps retryable PostgreSQL conflict %s to one typed reason", async (code, nested) => {
    const postgresError = Object.assign(new Error("retry transaction"), { code });
    const thrown = nested ? new Error("driver wrapper", { cause: postgresError }) : postgresError;
    const database = {
      async transaction() {
        throw thrown;
      }
    } as unknown as ElevenHouseDatabase;
    const unitOfWork = createDrizzleSealedWalletJournalCommitUnitOfWork({ database });

    await expect(
      unitOfWork.commitSealedWalletJournalMutation({} as SealedWalletJournalMutationCommand)
    ).rejects.toMatchObject({
      code: "sealed_wallet_journal_commit_persistence_error",
      reason: "retryable_concurrency_conflict"
    });
  });

  it("derives one exact transition provider identity and keeps it distinct from ledger scope", () => {
    const identity = providerIdentity();

    const resolved = deriveExactTransitionProviderIdentity(
      [identity, { ...identity }],
      identity.providerAccountId
    );

    expect(resolved).toEqual(identity);
    expect(Object.isFrozen(resolved)).toBe(true);
    for (const candidates of [
      [] as FinanceProviderAccountIdentity[],
      [identity, { ...identity, identityVersion: 2 }],
      [identity, { ...identity, seriesId: "arc-series-rotated" }]
    ]) {
      expect(() =>
        deriveExactTransitionProviderIdentity(candidates, identity.providerAccountId)
      ).toThrow(SealedWalletJournalCommitPersistenceError);
    }
    expect(() => deriveExactTransitionProviderIdentity([identity], "other-ledger-account")).toThrow(
      SealedWalletJournalCommitPersistenceError
    );
  });

  it("queries the provider owner by series, account and identity version", () => {
    const query = new PgDialect().sqlToQuery(
      sql`select 1 from ${financeProviderAccounts} where ${exactProviderAccountPredicate(
        providerIdentity()
      )}`
    );

    expect(query.sql).toContain('"finance_provider_accounts"."series_id" = $1');
    expect(query.sql).toContain('"finance_provider_accounts"."provider_account_id" = $2');
    expect(query.sql).toContain('"finance_provider_accounts"."identity_version" = $3');
    expect(query.params).toEqual(["arc-series-live", "arc-account-live", 7]);
  });

  it("obtains the transaction boundary from PostgreSQL in the current transaction", async () => {
    const executed: SQL[] = [];
    const transaction = {
      async execute(query: SQL) {
        executed.push(query);
        return { rows: [{ persistenceTransactionBoundaryRef: "postgres-xid:8192" }] };
      }
    } as unknown as FinanceTransaction;

    await expect(issuePersistenceTransactionBoundaryRef(transaction)).resolves.toBe(
      "postgres-xid:8192"
    );
    expect(executed).toHaveLength(1);
    expect(new PgDialect().sqlToQuery(executed[0]!).sql).toContain("txid_current()::text");
  });

  it("rejects a non-PostgreSQL transaction boundary returned by persistence", async () => {
    const transaction = {
      async execute() {
        return { rows: [{ persistenceTransactionBoundaryRef: "caller-boundary" }] };
      }
    } as unknown as FinanceTransaction;

    await expect(issuePersistenceTransactionBoundaryRef(transaction)).rejects.toMatchObject({
      reason: "persistence_write_incomplete"
    });
  });
});

function providerIdentity(): FinanceProviderAccountIdentity {
  return Object.freeze({
    seriesId: "arc-series-live",
    providerAccountId: "arc-account-live",
    identityVersion: 7
  });
}
