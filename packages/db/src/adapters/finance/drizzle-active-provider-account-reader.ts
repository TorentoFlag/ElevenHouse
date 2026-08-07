import {
  createProviderAccountIdentityBinding,
  hasAsciiControlCharacter,
  type ActiveProviderAccountReaderPort,
  type ActiveProviderAccountWebhookContextReaderPort,
  type FinanceProviderAccountIdentity
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";

export class ActiveProviderAccountReaderPersistenceError extends Error {
  readonly code = "ACTIVE_PROVIDER_ACCOUNT_READER_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: "invalid_query" | "identity_integrity_conflict" | "persistence_failure") {
    super("Active provider account could not be read as an exact immutable identity");
  }
}

export function createDrizzleActiveProviderAccountReader(
  database: ElevenHouseDatabase
): ActiveProviderAccountReaderPort {
  return Object.freeze({
    async findActiveProviderAccount(input) {
      if (input.provider !== "arc_pay") fail("invalid_query");
      try {
        const rows = await database
          .select({ series: financeProviderAccountSeries, account: financeProviderAccounts })
          .from(financeProviderAccountSeries)
          .innerJoin(
            financeProviderAccounts,
            and(
              eq(financeProviderAccounts.seriesId, financeProviderAccountSeries.seriesId),
              eq(
                financeProviderAccounts.identityVersion,
                financeProviderAccountSeries.activeIdentityVersion
              ),
              eq(financeProviderAccounts.provider, financeProviderAccountSeries.provider)
            )
          )
          .where(
            eq(financeProviderAccountSeries.provider, "arc_pay")
          )
          .limit(2);
        if (rows.length > 1) fail("identity_integrity_conflict");
        const row = rows[0];
        return row ? mapActiveProviderAccount(row.series, row.account) : null;
      } catch (error) {
        if (error instanceof ActiveProviderAccountReaderPersistenceError) throw error;
        throw new ActiveProviderAccountReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies ActiveProviderAccountReaderPort);
}

/**
 * Webhook correlation additionally binds ArcPay's signed `tenant_id` to the active account.
 * It is separate from the regular reader so payment commands cannot accidentally depend on or
 * leak provider tenant metadata.
 */
export function createDrizzleActiveProviderAccountWebhookContextReader(
  database: ElevenHouseDatabase
): ActiveProviderAccountWebhookContextReaderPort {
  return Object.freeze({
    async findActiveWebhookContext(input) {
      if (input.provider !== "arc_pay") fail("invalid_query");
      try {
        const rows = await database
          .select({ series: financeProviderAccountSeries, account: financeProviderAccounts })
          .from(financeProviderAccountSeries)
          .innerJoin(
            financeProviderAccounts,
            and(
              eq(financeProviderAccounts.seriesId, financeProviderAccountSeries.seriesId),
              eq(
                financeProviderAccounts.identityVersion,
                financeProviderAccountSeries.activeIdentityVersion
              ),
              eq(financeProviderAccounts.provider, financeProviderAccountSeries.provider)
            )
          )
          .where(eq(financeProviderAccountSeries.provider, "arc_pay"))
          .limit(2);
        if (rows.length > 1) fail("identity_integrity_conflict");
        const row = rows[0];
        if (!row) return null;
        return Object.freeze({
          providerAccount: mapActiveProviderAccount(row.series, row.account),
          merchantTenantId: tenantId(row.account.merchantTenantId)
        });
      } catch (error) {
        if (error instanceof ActiveProviderAccountReaderPersistenceError) throw error;
        throw new ActiveProviderAccountReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies ActiveProviderAccountWebhookContextReaderPort);
}

export function mapActiveProviderAccount(
  series: typeof financeProviderAccountSeries.$inferSelect,
  account: typeof financeProviderAccounts.$inferSelect
): FinanceProviderAccountIdentity {
  try {
    if (
      series.provider !== "arc_pay" ||
      account.provider !== "arc_pay" ||
      account.seriesId !== series.seriesId ||
      account.identityVersion !== series.activeIdentityVersion
    ) {
      fail("identity_integrity_conflict");
    }
    return createProviderAccountIdentityBinding({
      seriesId: series.seriesId,
      providerAccountId: account.providerAccountId,
      identityVersion: account.identityVersion
    });
  } catch (error) {
    if (error instanceof ActiveProviderAccountReaderPersistenceError) throw error;
    fail("identity_integrity_conflict");
  }
}

function tenantId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("identity_integrity_conflict");
  }
  return value;
}

function fail(reason: ActiveProviderAccountReaderPersistenceError["reason"]): never {
  throw new ActiveProviderAccountReaderPersistenceError(reason);
}
