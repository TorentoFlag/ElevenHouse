import { describe, expect, it } from "vitest";

import {
  ActiveProviderAccountReaderPersistenceError,
  mapActiveProviderAccount
} from "./drizzle-active-provider-account-reader";

describe("Drizzle active provider account reader", () => {
  it("returns only the exact active ArcPay identity for the configured environment", () => {
    expect(
      mapActiveProviderAccount(
        {
          seriesId: "elevenhouse-arcpay-sandbox",
          provider: "arc_pay",
          activeIdentityVersion: 2
        } as never,
        {
          seriesId: "elevenhouse-arcpay-sandbox",
          providerAccountId: "arcpay-tenant-sandbox-v2",
          identityVersion: 2,
          provider: "arc_pay",
          environment: "sandbox"
        } as never,
        "sandbox"
      )
    ).toEqual({
      seriesId: "elevenhouse-arcpay-sandbox",
      providerAccountId: "arcpay-tenant-sandbox-v2",
      identityVersion: 2
    });
  });

  it("fails closed if a query result is not the immutable current identity", () => {
    expect(() =>
      mapActiveProviderAccount(
        {
          seriesId: "elevenhouse-arcpay-sandbox",
          provider: "arc_pay",
          activeIdentityVersion: 2
        } as never,
        {
          seriesId: "elevenhouse-arcpay-sandbox",
          providerAccountId: "arcpay-tenant-sandbox-v1",
          identityVersion: 1,
          provider: "arc_pay",
          environment: "sandbox"
        } as never,
        "sandbox"
      )
    ).toThrow(ActiveProviderAccountReaderPersistenceError);
  });
});
