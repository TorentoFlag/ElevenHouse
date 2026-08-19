import { describe, expect, it } from "vitest";

import { resolveArcPayProviderAccountSeedData } from "./finance-provider-account-seed-data";

describe("ArcPay provider account seed data", () => {
  it("stays disabled when no ArcPay provider account seed env is present", () => {
    expect(resolveArcPayProviderAccountSeedData({})).toBeNull();
  });

  it("fails closed when the ArcPay provider account seed env is partial", () => {
    expect(() =>
      resolveArcPayProviderAccountSeedData({
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_SERIES_ID: "arc-pay-primary"
      })
    ).toThrow(/Incomplete ArcPay provider account seed env/);
  });

  it("normalizes the exact first active ArcPay provider account authority", () => {
    expect(
      resolveArcPayProviderAccountSeedData({
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_SERIES_ID: "arc-pay-primary",
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_ID: "arc-pay-primary-v1",
        FINANCE_ARC_PAY_MERCHANT_TENANT_ID: "tenant-123",
        FINANCE_ARC_PAY_TERMINAL_SCOPE: "hosted-checkout",
        FINANCE_ARC_PAY_SETTLEMENT_SCOPE: "merchant-settlement"
      })
    ).toEqual({
      seriesId: "arc-pay-primary",
      providerAccountId: "arc-pay-primary-v1",
      identityVersion: 1,
      provider: "arc_pay",
      merchantTenantId: "tenant-123",
      terminalScope: "hosted-checkout",
      settlementScope: "merchant-settlement"
    });
  });

  it("rejects trimmed or control-character identity fields", () => {
    expect(() =>
      resolveArcPayProviderAccountSeedData({
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_SERIES_ID: " arc-pay-primary",
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_ID: "arc-pay-primary-v1",
        FINANCE_ARC_PAY_MERCHANT_TENANT_ID: "tenant-123",
        FINANCE_ARC_PAY_TERMINAL_SCOPE: "hosted-checkout",
        FINANCE_ARC_PAY_SETTLEMENT_SCOPE: "merchant-settlement"
      })
    ).toThrow(/Invalid ArcPay provider account seed identity field/);
    expect(() =>
      resolveArcPayProviderAccountSeedData({
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_SERIES_ID: "arc-pay-primary",
        FINANCE_ARC_PAY_PROVIDER_ACCOUNT_ID: "arc-pay-primary-v1",
        FINANCE_ARC_PAY_MERCHANT_TENANT_ID: "tenant\u0000123",
        FINANCE_ARC_PAY_TERMINAL_SCOPE: "hosted-checkout",
        FINANCE_ARC_PAY_SETTLEMENT_SCOPE: "merchant-settlement"
      })
    ).toThrow(/Invalid ArcPay provider account seed identity field/);
  });
});
