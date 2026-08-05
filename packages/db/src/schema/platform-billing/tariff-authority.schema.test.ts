import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  platformTariffAuthorityIntegritySql,
  platformTariffInvoices,
  platformTariffSeries,
  platformTariffSubscriptions,
  platformTariffVersionCapabilities,
  platformTariffVersions,
  tariffSubscriptionStateValues
} from "./tariff-authority.schema";

describe("platform tariff authority schema", () => {
  it("keeps a stable tariff identity separate from commercial versions", () => {
    expect(getTableName(platformTariffSeries)).toBe("platform_tariff_series");
    expect(getTableName(platformTariffVersions)).toBe("platform_tariff_versions");
    expect(Object.keys(getTableColumns(platformTariffVersions))).toEqual([
      "tariffSeriesId",
      "version",
      "draftRevision",
      "lifecycle",
      "name",
      "tagline",
      "monthlyPriceMinor",
      "yearlyPriceMinor",
      "monthlyRecurringFrequencyDays",
      "yearlyRecurringFrequencyDays",
      "currency",
      "clientSaleCommissionBps",
      "seatsLimit",
      "bookingsLimit",
      "aiRequestsLimit",
      "automationLimit",
      "isPopular",
      "displayOrder",
      "canonicalPreimage",
      "canonicalDigest",
      "createdAt",
      "publishedAt",
      "retiredAt"
    ]);
  });

  it("binds capabilities, subscriptions and invoices to the exact tariff-version digest", () => {
    expect(getTableConfig(platformTariffVersionCapabilities).foreignKeys).toHaveLength(1);
    expect(getTableConfig(platformTariffSubscriptions).foreignKeys).toHaveLength(2);
    expect(getTableConfig(platformTariffInvoices).foreignKeys).toHaveLength(3);
    expect(Object.keys(getTableColumns(platformTariffSubscriptions))).toContain(
      "commissionBpsSnapshot"
    );
    expect(Object.keys(getTableColumns(platformTariffInvoices))).toEqual(
      expect.arrayContaining([
        "tariffVersionDigest",
        "version",
        "billingPeriodStartAt",
        "billingPeriodEndAt"
      ])
    );

    const invoiceSubscriptionSnapshotForeignKey = getTableConfig(platformTariffInvoices).foreignKeys.find(
      (foreignKey) => foreignKey.getName() === "platform_tariff_invoices_subscription_snapshot_fk"
    );
    expect(invoiceSubscriptionSnapshotForeignKey?.reference().columns.map((column) => column.name)).toEqual([
      "subscription_id",
      "owner_user_id",
      "tariff_series_id",
      "tariff_version",
      "tariff_version_digest"
    ]);
  });

  it("contains immutable publication and capability guards in the reviewed baseline DDL", () => {
    expect(platformTariffAuthorityIntegritySql).toContain("published tariff version is immutable");
    expect(platformTariffAuthorityIntegritySql).toContain(
      "published tariff capability set is immutable"
    );
    expect(platformTariffAuthorityIntegritySql).toContain(
      "platform_tariff_versions_sealed_immutable"
    );
    expect(platformTariffAuthorityIntegritySql).toContain("if tg_op = 'DELETE' then return old; end if;");
    expect(platformTariffAuthorityIntegritySql).toContain("platform_tariff_subscriptions_snapshot_immutable");
    expect(platformTariffAuthorityIntegritySql).toContain("platform_tariff_invoices_snapshot_immutable");
  });

  it("models paid setup separately from the first saved-card charge", () => {
    expect(tariffSubscriptionStateValues).toEqual([
      "incomplete_setup",
      "awaiting_initial_payment",
      "active",
      "past_due",
      "cancelled",
      "expired"
    ]);
  });

  it("persists the explicit ArcPay recurring interval inside the sealed tariff version", () => {
    expect(getTableColumns(platformTariffVersions).monthlyRecurringFrequencyDays).toBeDefined();
    expect(getTableColumns(platformTariffVersions).yearlyRecurringFrequencyDays).toBeDefined();
    expect(platformTariffAuthorityIntegritySql).toContain(
      "new.monthly_recurring_frequency_days is not distinct from old.monthly_recurring_frequency_days"
    );
    expect(platformTariffAuthorityIntegritySql).toContain(
      "new.yearly_recurring_frequency_days is not distinct from old.yearly_recurring_frequency_days"
    );
  });
});
